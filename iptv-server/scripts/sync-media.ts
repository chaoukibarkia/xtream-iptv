import { PrismaClient, StreamType } from '@prisma/client';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const prisma = new PrismaClient();

// Source directory (where files actually are)
const SOURCE_ROOT = '/storage-pool/iptv-media';
// Target path prefix (what gets stored in DB)
const TARGET_ROOT = '/media';

const MOVIES_DIR = join(SOURCE_ROOT, 'movies');
const SERIES_DIR = join(SOURCE_ROOT, 'series');

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts'];

// Helper function to convert source path to target path
function toTargetPath(sourcePath: string): string {
  return sourcePath.replace(SOURCE_ROOT, TARGET_ROOT);
}

// Helper function to normalize series name for comparison
function normalizeSeriesName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// Helper function to parse movie name from filename
function parseMovieName(filename: string): { name: string; year?: number } {
  const nameWithoutExt = filename.replace(/\.(mp4|mkv|avi|mov|m4v|ts)$/i, '');
  
  const yearMatch = nameWithoutExt.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
  
  let name = nameWithoutExt
    .replace(/\.(19|20)\d{2}\./, ' ')
    .replace(/\b(19|20)\d{2}\b/, '')
    .replace(/\.(FRENCH|MULTI|VFF|VFQ|VOSTFR|1080p|720p|480p|WEB|BluRay|BRRip|HDRip|x264|x265|H264|H265|HEVC|DDP|AAC|AC3|DD|5\.1|2\.0|10bit|WEBRip|AMZN|NF|FW|SERQPH|BTT|TFA|SiC|TsundereRaws|MULTi|AD|AV1|FiNAL)\.?/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { name, year };
}

// Helper function to parse series and episode info from filename
function parseSeriesEpisode(filename: string): {
  seriesName: string;
  seasonNumber: number;
  episodeNumber: number;
} | null {
  const nameWithoutExt = filename.replace(/\.(mp4|mkv|avi|mov|m4v|ts)$/i, '');
  
  const episodeMatch = nameWithoutExt.match(/[Ss](\d{1,2})[Ee](\d{1,2})|(\d{1,2})x(\d{1,2})/);
  
  if (!episodeMatch) {
    return null;
  }
  
  const seasonNumber = parseInt(episodeMatch[1] || episodeMatch[3]);
  const episodeNumber = parseInt(episodeMatch[2] || episodeMatch[4]);
  
  let seriesName = nameWithoutExt
    .split(/[Ss]\d{1,2}[Ee]\d{1,2}|\d{1,2}x\d{1,2}/)[0]
    .replace(/\.(FRENCH|MULTI|VFF|VFQ|VOSTFR|1080p|720p|480p|WEB|BluRay|BRRip|HDRip|x264|x265|H264|H265|HEVC|DDP|AAC|AC3|DD|5\.1|2\.0|10bit|WEBRip|AMZN|NF|FW|SERQPH|BTT|TFA|SiC|MULTi|AD|AV1|FiNAL)\.?/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { seriesName, seasonNumber, episodeNumber };
}

// Get all video files in a directory (recursively)
function getVideoFiles(dir: string, maxDepth: number = 3, currentDepth: number = 0): string[] {
  if (!existsSync(dir) || currentDepth >= maxDepth) {
    return [];
  }
  
  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      // Skip system folders
      if (entry.startsWith('$') || entry === 'System Volume Information') continue;
      
      const fullPath = join(dir, entry);
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          files.push(...getVideoFiles(fullPath, maxDepth, currentDepth + 1));
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

async function syncMovies() {
  console.log('\n=== SYNCING MOVIES ===');
  
  // Find or create Movies category
  let moviesCategory = await prisma.category.findFirst({
    where: { name: 'Movies', type: StreamType.VOD },
  });
  
  if (!moviesCategory) {
    moviesCategory = await prisma.category.create({
      data: {
        name: 'Movies',
        type: StreamType.VOD,
        isActive: true,
        sortOrder: 0,
      },
    });
    console.log('Created "Movies" category');
  }
  
  // Find Full Package bouquet
  const fullPackageBouquet = await prisma.bouquet.findFirst({
    where: { name: 'Full Package' },
    orderBy: { id: 'asc' },
  });
  
  if (!fullPackageBouquet) {
    console.error('Warning: No "Full Package" bouquet found!');
  }
  
  const movieFiles = getVideoFiles(MOVIES_DIR);
  console.log(`Found ${movieFiles.length} movie files on disk`);
  
  // Get existing movies from DB
  const existingMovies = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD },
    select: { id: true, name: true, sourceUrl: true },
  });
  
  console.log(`Found ${existingMovies.length} movies in database`);
  
  // Create lookup maps
  const existingByName = new Map(existingMovies.map(m => [m.name.toLowerCase(), m]));
  const existingByPath = new Map(existingMovies.map(m => [m.sourceUrl, m]));
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const filePath of movieFiles) {
    try {
      const filename = basename(filePath);
      const { name, year } = parseMovieName(filename);
      const targetPath = toTargetPath(filePath);
      
      if (!name || name.length < 2) {
        skipped++;
        continue;
      }
      
      // Check if already exists by path
      const existingByPathMatch = existingByPath.get(targetPath);
      if (existingByPathMatch) {
        skipped++;
        continue;
      }
      
      // Check if already exists by name
      const existingByNameMatch = existingByName.get(name.toLowerCase());
      if (existingByNameMatch) {
        // Update the path if different
        if (existingByNameMatch.sourceUrl !== targetPath) {
          await prisma.stream.update({
            where: { id: existingByNameMatch.id },
            data: { sourceUrl: targetPath },
          });
          updated++;
        } else {
          skipped++;
        }
        continue;
      }
      
      // Create new movie
      const stream = await prisma.stream.create({
        data: {
          name: name,
          streamType: StreamType.VOD,
          categoryId: moviesCategory.id,
          sourceUrl: targetPath,
          containerExtension: extname(filename).substring(1),
          releaseDate: year ? new Date(`${year}-01-01`) : null,
          isActive: true,
          sortOrder: 0,
        },
      });
      
      // Add to StreamCategory junction table
      await prisma.streamCategory.create({
        data: {
          streamId: stream.id,
          categoryId: moviesCategory.id,
          isPrimary: true,
        },
      });
      
      // Add to bouquet
      if (fullPackageBouquet) {
        await prisma.bouquetStream.create({
          data: {
            bouquetId: fullPackageBouquet.id,
            streamId: stream.id,
          },
        });
      }
      
      created++;
      if (created % 20 === 0) {
        console.log(`Progress: ${created} movies created...`);
      }
    } catch (error) {
      console.error(`Error processing ${basename(filePath)}:`, error);
      errors++;
    }
  }
  
  console.log(`\nMovies sync complete:`);
  console.log(`  Created: ${created}`);
  console.log(`  Updated paths: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  
  return { created, updated, skipped, errors };
}

async function syncSeries() {
  console.log('\n=== SYNCING SERIES ===');
  
  // Find or create TV Series category
  let seriesCategory = await prisma.category.findFirst({
    where: { name: 'TV Series', type: StreamType.SERIES },
  });
  
  if (!seriesCategory) {
    seriesCategory = await prisma.category.create({
      data: {
        name: 'TV Series',
        type: StreamType.SERIES,
        isActive: true,
        sortOrder: 0,
      },
    });
    console.log('Created "TV Series" category');
  }
  
  const episodeFiles = getVideoFiles(SERIES_DIR);
  console.log(`Found ${episodeFiles.length} episode files on disk`);
  
  // Get existing series from DB
  const existingSeries = await prisma.series.findMany({
    include: {
      episodes: true,
    },
  });
  
  console.log(`Found ${existingSeries.length} series in database`);
  
  // Create normalized name lookup
  const seriesByNormalizedName = new Map<string, typeof existingSeries[0]>();
  for (const s of existingSeries) {
    seriesByNormalizedName.set(normalizeSeriesName(s.name), s);
  }
  
  // Group episode files by series
  const episodesBySeriesName = new Map<string, Array<{
    filePath: string;
    seasonNumber: number;
    episodeNumber: number;
    seriesName: string;
  }>>();
  
  for (const filePath of episodeFiles) {
    const filename = basename(filePath);
    const parsed = parseSeriesEpisode(filename);
    
    if (parsed) {
      const { seriesName, seasonNumber, episodeNumber } = parsed;
      
      if (!episodesBySeriesName.has(seriesName)) {
        episodesBySeriesName.set(seriesName, []);
      }
      
      episodesBySeriesName.get(seriesName)!.push({
        filePath,
        seasonNumber,
        episodeNumber,
        seriesName,
      });
    }
  }
  
  console.log(`Identified ${episodesBySeriesName.size} unique series from files`);
  
  let seriesCreated = 0;
  let seriesMatched = 0;
  let episodesCreated = 0;
  let episodesUpdated = 0;
  let episodesSkipped = 0;
  let errors = 0;
  
  for (const [seriesName, episodes] of episodesBySeriesName.entries()) {
    try {
      const normalizedName = normalizeSeriesName(seriesName);
      
      // Try to find existing series
      let series = seriesByNormalizedName.get(normalizedName);
      
      // Also try partial match if exact match fails
      if (!series) {
        for (const [existingNorm, existingSeries] of seriesByNormalizedName.entries()) {
          if (existingNorm.includes(normalizedName) || normalizedName.includes(existingNorm)) {
            series = existingSeries;
            break;
          }
        }
      }
      
      if (series) {
        seriesMatched++;
        console.log(`Matched: "${seriesName}" -> "${series.name}"`);
      } else {
        // Create new series
        series = await prisma.series.create({
          data: {
            name: seriesName,
          },
          include: {
            episodes: true,
          },
        });
        
        // Add to category
        await prisma.seriesCategory.create({
          data: {
            seriesId: series.id,
            categoryId: seriesCategory.id,
            isPrimary: true,
          },
        });
        
        seriesCreated++;
        console.log(`Created series: ${seriesName}`);
      }
      
      // Create episode lookup
      const existingEpisodes = new Map(
        series.episodes.map(e => [`${e.seasonNumber}-${e.episodeNumber}`, e])
      );
      
      // Process episodes
      for (const ep of episodes) {
        const targetPath = toTargetPath(ep.filePath);
        const episodeKey = `${ep.seasonNumber}-${ep.episodeNumber}`;
        
        const existingEpisode = existingEpisodes.get(episodeKey);
        
        if (existingEpisode) {
          // Episode exists - update path if needed
          if (existingEpisode.sourceUrl !== targetPath) {
            await prisma.episode.update({
              where: { id: existingEpisode.id },
              data: {
                sourceUrl: targetPath,
                containerExtension: extname(ep.filePath).substring(1),
              },
            });
            episodesUpdated++;
          } else {
            episodesSkipped++;
          }
        } else {
          // Create new episode
          await prisma.episode.create({
            data: {
              seriesId: series.id,
              seasonNumber: ep.seasonNumber,
              episodeNumber: ep.episodeNumber,
              title: `S${ep.seasonNumber.toString().padStart(2, '0')}E${ep.episodeNumber.toString().padStart(2, '0')}`,
              sourceUrl: targetPath,
              containerExtension: extname(ep.filePath).substring(1),
            },
          });
          episodesCreated++;
        }
      }
    } catch (error) {
      console.error(`Error processing series ${seriesName}:`, error);
      errors++;
    }
  }
  
  console.log(`\nSeries sync complete:`);
  console.log(`  Series created: ${seriesCreated}`);
  console.log(`  Series matched: ${seriesMatched}`);
  console.log(`  Episodes created: ${episodesCreated}`);
  console.log(`  Episodes updated: ${episodesUpdated}`);
  console.log(`  Episodes skipped: ${episodesSkipped}`);
  console.log(`  Errors: ${errors}`);
  
  return { seriesCreated, seriesMatched, episodesCreated, episodesUpdated, episodesSkipped, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('MEDIA SYNC');
  console.log('='.repeat(60));
  console.log(`Source: ${SOURCE_ROOT}`);
  console.log(`Target path prefix: ${TARGET_ROOT}`);
  
  try {
    const movieStats = await syncMovies();
    const seriesStats = await syncSeries();
    
    console.log('\n' + '='.repeat(60));
    console.log('SYNC SUMMARY');
    console.log('='.repeat(60));
    console.log(`Movies: ${movieStats.created} created, ${movieStats.updated} updated, ${movieStats.skipped} skipped`);
    console.log(`Series: ${seriesStats.seriesCreated} created, ${seriesStats.seriesMatched} matched`);
    console.log(`Episodes: ${seriesStats.episodesCreated} created, ${seriesStats.episodesUpdated} updated, ${seriesStats.episodesSkipped} skipped`);
    
    // Database totals
    const totalMovies = await prisma.stream.count({ where: { streamType: StreamType.VOD } });
    const totalSeries = await prisma.series.count();
    const totalEpisodes = await prisma.episode.count();
    
    console.log('\nDatabase totals:');
    console.log(`  Total movies: ${totalMovies}`);
    console.log(`  Total series: ${totalSeries}`);
    console.log(`  Total episodes: ${totalEpisodes}`);
    
    // Clear Redis cache
    console.log('\nClearing Redis cache...');
    try {
      const { createClient } = await import('redis');
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const redis = createClient({ url: redisUrl });
      await redis.connect();
      await redis.flushDb();
      await redis.disconnect();
      console.log('Redis cache cleared');
    } catch (error) {
      console.log('Could not clear Redis cache (may need manual clearing)');
    }
    
  } catch (error) {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
