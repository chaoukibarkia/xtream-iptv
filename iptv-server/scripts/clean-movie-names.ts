import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Clean movie and series names by removing technical release information
 * like MULTI, 1080p, WEBRip, HEVC, etc.
 */

function cleanName(name: string): string {
  let cleaned = name;

  // Remove common release patterns (case insensitive)
  const patterns = [
    // Quality markers (as separate words)
    /\s+1080p?\b/gi,
    /\s+720p?\b/gi,
    /\s+2160p?\b/gi,
    /\s+4K\b/gi,
    
    // Audio/Video codecs
    /\s+HEVC\b/gi,
    /\s+H\.?265\b/gi,
    /\s+x264\b/gi,
    /\s+x265\b/gi,
    /\s+AV1\b/gi,
    
    // Source type
    /\s+WEBRip\b/gi,
    /\s+WEB-Rip\b/gi,
    /\s+WEB-DL\b/gi,
    /\s+WEB\b/gi,
    /\s+BluRay\b/gi,
    /\s+BRRip\b/gi,
    /\s+DVDRip\b/gi,
    /\s+HDRip\b/gi,
    /\s+Rip\b/gi,
    
    // Audio info
    /\s+6CH\b/gi,
    /\s+5\.1\b/gi,
    /\s+DDP\b/gi,
    /\s+DD5\.1\b/gi,
    /\s+AAC\b/gi,
    /\s+AC3\b/gi,
    
    // Language markers (as separate words)
    /\s+MULTI\b/gi,
    /\s+MULTi\b/gi,
    /\s+FRENCH\b/gi,
    /\s+VF2?\b/gi,
    /\s+VOSTFR\b/gi,
    /\s+SUBFRENCH\b/gi,
    
    // Technical markers (as separate words)
    /\s+10bit\b/gi,
    /\s+8bit\b/gi,
    /\s+HDR\b/gi,
    /\s+SDR\b/gi,
    /\s+AD\b/gi,
    /\s+NF\b/gi,
    
    // Release groups (with dash prefix)
    /\s+-\s*[A-Z0-9]+$/gi,
    /\s+-[A-Z][a-z]+Raws/gi,
    /\s+-SERQPH$/gi,
    /\s+-FW$/gi,
    /\s+-BTT$/gi,
    /\s+-TsundereRaws$/gi,
    /\s+-Slay3R$/gi,
  ];

  // Apply all patterns
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Clean up any remaining multiple spaces
  cleaned = cleaned.replace(/\s+/g, ' ');
  
  // Trim whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

async function cleanMovieNames() {
  console.log('\n=== Cleaning VOD Movie Names ===\n');

  const vods = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
    },
    select: { id: true, name: true },
  });

  let updated = 0;
  let unchanged = 0;

  for (const vod of vods) {
    const cleanedName = cleanName(vod.name);
    
    if (cleanedName !== vod.name) {
      console.log(`[${vod.id}]`);
      console.log(`  Old: "${vod.name}"`);
      console.log(`  New: "${cleanedName}"`);
      
      await prisma.stream.update({
        where: { id: vod.id },
        data: { name: cleanedName },
      });
      
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`\n✓ Updated ${updated} movie names`);
  console.log(`  Unchanged: ${unchanged}`);
}

async function cleanSeriesNames() {
  console.log('\n=== Cleaning Series Names ===\n');

  const series = await prisma.series.findMany({
    select: { id: true, name: true },
  });

  let updated = 0;
  let unchanged = 0;

  for (const s of series) {
    const cleanedName = cleanName(s.name);
    
    if (cleanedName !== s.name) {
      console.log(`[${s.id}]`);
      console.log(`  Old: "${s.name}"`);
      console.log(`  New: "${cleanedName}"`);
      
      await prisma.series.update({
        where: { id: s.id },
        data: { name: cleanedName },
      });
      
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`\n✓ Updated ${updated} series names`);
  console.log(`  Unchanged: ${unchanged}`);
}

async function main() {
  try {
    console.log('=== Starting Name Cleanup ===');
    console.log('Removing technical information from movie and series names...\n');

    await cleanMovieNames();
    await cleanSeriesNames();

    console.log('\n=== Cleanup Complete! ===\n');
  } catch (error) {
    console.error('Error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
