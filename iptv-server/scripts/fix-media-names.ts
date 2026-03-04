import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

// Clean up movie/series name by removing release tags
function cleanName(name: string): string {
  let cleaned = name
    // Remove year patterns like .2024. or (2024) but keep standalone years
    .replace(/\.(19|20)\d{2}\./g, ' ')
    // Remove resolution tags
    .replace(/\b(1080p|720p|480p|2160p|4K|UHD)\b/gi, '')
    // Remove source tags
    .replace(/\b(WEB|WEBRip|WEB-DL|BluRay|BRRip|HDRip|DVDRip|HDTV|AMZN|NF|DSNP|HMAX|ATVP|Rip)\b/gi, '')
    // Remove codec tags
    .replace(/\b(x264|x265|H264|H265|HEVC|AVC|AV1|VP9|10bit|8bit)\b/gi, '')
    // Remove audio tags
    .replace(/\b(DDP|DDP5\.1|DDP2\.0|DDP2|DD|DD5\.1|AAC|AC3|FLAC|DTS|TrueHD|Atmos|5\.1|2\.0|6CH|7\.1|MA|HDMA|DTS-HDMA|DTS-HD)\b/gi, '')
    // Remove language tags
    .replace(/\b(FRENCH|MULTI|VFF|VFQ|VF2|VOSTFR|MULTi|TRUEFRENCH|SUBFRENCH|iNTERNAL|ENG)\b/gi, '')
    // Remove common suffixes and tags
    .replace(/\b(AD|FiNAL|PROPER|REPACK|EXTENDED|UNRATED|DC|Directors\.Cut|THEATRICAL|RERiP)\b/gi, '')
    // Remove release group tags (at end after dash)
    .replace(/\s*[-_]\s*(FW|SERQPH|BTT|TFA|SiC|TsundereRaws|CiELOS|GOLD|ROVERS|SPARKS|YIFY|RARBG|EVO|CMRG|NTb|FLUX|NOGRP|ION10|TEPES|VARYG|SiGMA|BONE|PSA|AMRAP|GalaxyTV|MZABI|NTG|PECULATE|EDITH|playWEB|HONE|VENUE|LOST|ZEST|SpiriTus|UTT|EXTREME|PREUMS|FrIeNdS|ROUGH|Slay3R|CANARYBLACK|DL)\s*$/gi, '')
    // Remove any remaining release group pattern (dash followed by uppercase letters at end)
    .replace(/\s*-\s*[A-Z][A-Za-z0-9]{1,15}$/g, '')
    // Remove brackets and their content
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    // Remove "channels" and bitrate patterns
    .replace(/\d+\s*channels/gi, '')
    .replace(/\d+bits?@\d+kbps/gi, '')
    // Replace dots and underscores with spaces
    .replace(/[._]/g, ' ')
    // Remove isolated numbers that look like quality indicators
    .replace(/\s+\d{1,2}\s+\d+\s*/g, ' ')
    // Remove extra dashes
    .replace(/\s*-+\s*$/g, '')
    .replace(/^\s*-+\s*/g, '')
    // Clean up multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
  
  // Remove trailing "0" that might be left from DDP2 0
  cleaned = cleaned.replace(/\s+0\s*$/g, '').trim();
  
  return cleaned;
}

async function fixMovieNames() {
  console.log('\n=== FIXING MOVIE NAMES ===\n');
  
  const movies = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD },
    select: { id: true, name: true },
  });
  
  console.log(`Found ${movies.length} movies to check`);
  
  let updated = 0;
  let unchanged = 0;
  
  for (const movie of movies) {
    const cleanedName = cleanName(movie.name);
    
    if (cleanedName !== movie.name && cleanedName.length >= 2) {
      console.log(`"${movie.name}" -> "${cleanedName}"`);
      
      await prisma.stream.update({
        where: { id: movie.id },
        data: { name: cleanedName },
      });
      updated++;
    } else {
      unchanged++;
    }
  }
  
  console.log(`\nMovies: ${updated} updated, ${unchanged} unchanged`);
  return { updated, unchanged };
}

async function fixSeriesNames() {
  console.log('\n=== FIXING SERIES NAMES ===\n');
  
  const series = await prisma.series.findMany({
    select: { id: true, name: true },
  });
  
  console.log(`Found ${series.length} series to check`);
  
  let updated = 0;
  let unchanged = 0;
  
  for (const s of series) {
    const cleanedName = cleanName(s.name);
    
    if (cleanedName !== s.name && cleanedName.length >= 2) {
      console.log(`"${s.name}" -> "${cleanedName}"`);
      
      await prisma.series.update({
        where: { id: s.id },
        data: { name: cleanedName },
      });
      updated++;
    } else {
      unchanged++;
    }
  }
  
  console.log(`\nSeries: ${updated} updated, ${unchanged} unchanged`);
  return { updated, unchanged };
}

async function removeDuplicates() {
  console.log('\n=== REMOVING DUPLICATE MOVIES ===\n');
  
  const movies = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD },
    select: { id: true, name: true, sourceUrl: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  
  const moviesByName = new Map<string, typeof movies>();
  
  for (const movie of movies) {
    const key = movie.name.toLowerCase().trim();
    if (!moviesByName.has(key)) {
      moviesByName.set(key, []);
    }
    moviesByName.get(key)!.push(movie);
  }
  
  let removed = 0;
  
  for (const [, dupes] of moviesByName.entries()) {
    if (dupes.length > 1) {
      console.log(`Found ${dupes.length} duplicates for "${dupes[0].name}"`);
      
      for (let i = 1; i < dupes.length; i++) {
        console.log(`  Removing duplicate ID ${dupes[i].id}`);
        
        await prisma.bouquetStream.deleteMany({
          where: { streamId: dupes[i].id },
        });
        
        await prisma.streamCategory.deleteMany({
          where: { streamId: dupes[i].id },
        });
        
        await prisma.stream.delete({
          where: { id: dupes[i].id },
        });
        
        removed++;
      }
    }
  }
  
  console.log(`\nRemoved ${removed} duplicate movies`);
  return removed;
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX MEDIA NAMES - PASS 2');
  console.log('='.repeat(60));
  
  try {
    const movieStats = await fixMovieNames();
    const seriesStats = await fixSeriesNames();
    const duplicatesRemoved = await removeDuplicates();
    
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Movies: ${movieStats.updated} names fixed`);
    console.log(`Series: ${seriesStats.updated} names fixed`);
    console.log(`Duplicates removed: ${duplicatesRemoved}`);
    
    const totalMovies = await prisma.stream.count({ where: { streamType: StreamType.VOD } });
    const totalSeries = await prisma.series.count();
    
    console.log(`\nFinal counts:`);
    console.log(`  Movies: ${totalMovies}`);
    console.log(`  Series: ${totalSeries}`);
    
    console.log('\nClearing Redis cache...');
    const { execSync } = await import('child_process');
    try {
      execSync('redis-cli -h 10.10.0.11 -a 2LA6Er7c8TX37R6K3Vbbm4AWycw6gXdy --no-auth-warning FLUSHDB', { stdio: 'pipe' });
      console.log('Redis cache cleared');
    } catch {
      console.log('Could not clear Redis cache automatically');
    }
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
