import { PrismaClient, StreamType } from '@prisma/client';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, extname, basename } from 'path';

const prisma = new PrismaClient();

const MEDIA_ROOT = '/media';
const MOVIES_DIR = join(MEDIA_ROOT, 'movies');
const SERIES_DIR = join(MEDIA_ROOT, 'series');

// Supported video file extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts'];

// Helper function to parse movie name from filename
function parseMovieName(filename: string): { name: string; year?: number } {
  const nameWithoutExt = filename.replace(/\.(mp4|mkv|avi|mov|m4v|ts)$/i, '');
  
  // Try to extract year
  const yearMatch = nameWithoutExt.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;
  
  // Clean up the name
  let name = nameWithoutExt
    .replace(/\.(19|20)\d{2}\./, ' ')
    .replace(/\b(19|20)\d{2}\b/, '')
    .replace(/\.(FRENCH|MULTI|VFF|VFQ|VOSTFR|1080p|720p|480p|WEB|BluRay|BRRip|HDRip|x264|x265|H264|H265|HEVC|DDP|AAC|AC3|DD|5\.1|2\.0|10bit|WEBRip|AMZN|NF|FW|SERQPH|BTT|TFA|SiC|TsundereRaws)\.?/gi, ' ')
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
  title?: string;
} | null {
  const nameWithoutExt = filename.replace(/\.(mp4|mkv|avi|mov|m4v|ts)$/i, '');
  
  // Match patterns like S01E01, S1E1, 1x01, etc.
  const episodeMatch = nameWithoutExt.match(/[Ss](\d{1,2})[Ee](\d{1,2})|(\d{1,2})x(\d{1,2})/);
  
  if (!episodeMatch) {
    return null;
  }
  
  const seasonNumber = parseInt(episodeMatch[1] || episodeMatch[3]);
  const episodeNumber = parseInt(episodeMatch[2] || episodeMatch[4]);
  
  // Extract series name (everything before the episode marker)
  let seriesName = nameWithoutExt
    .split(/[Ss]\d{1,2}[Ee]\d{1,2}|\d{1,2}x\d{1,2}/)[0]
    .replace(/\.(FRENCH|MULTI|VFF|VFQ|VOSTFR|1080p|720p|480p|WEB|BluRay|BRRip|HDRip|x264|x265|H264|H265|HEVC|DDP|AAC|AC3|DD|5\.1|2\.0|10bit|WEBRip|AMZN|NF|FW|SERQPH|BTT|TFA|SiC)\.?/gi, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return {
    seriesName,
    seasonNumber,
    episodeNumber,
  };
}

// Get all video files in a directory (recursively)
function getVideoFiles(dir: string, maxDepth: number = 2, currentDepth: number = 0): string[] {
  if (!existsSync(dir) || currentDepth >= maxDepth) {
    return [];
  }
  
  const files: string[] = [];
  
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      
      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Recursively get files from subdirectories
          files.push(...getVideoFiles(fullPath, maxDepth, currentDepth + 1));
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext)) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not access ${fullPath}:`, error);
        continue;
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

async function importMovies() {
  console.log('\n=== IMPORTING MOVIES ===');
  
  // Ensure VOD category exists
  let vodCategory = await prisma.category.findFirst({
    where: { name: 'Movies', type: StreamType.VOD },
  });
  
  if (!vodCategory) {
    vodCategory = await prisma.category.create({
      data: {
        name: 'Movies',
        type: StreamType.VOD,
        isActive: true,
        sortOrder: 0,
      },
    });
    console.log('Created "Movies" category');
  }
  
  const movieFiles = getVideoFiles(MOVIES_DIR);
  console.log(`Found ${movieFiles.length} movie files`);
  
  let created = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const filePath of movieFiles) {
    try {
      const filename = basename(filePath);
      const { name, year } = parseMovieName(filename);
      
      if (!name) {
        console.warn(`Skipping file with unparseable name: ${filename}`);
        skipped++;
        continue;
      }
      
      // Check if movie already exists
      const existing = await prisma.stream.findFirst({
        where: {
          name: name,
          streamType: StreamType.VOD,
          categoryId: vodCategory.id,
        },
      });
      
      if (existing) {
        skipped++;
        continue;
      }
      
      // Create the stream
      await prisma.stream.create({
        data: {
          name: name,
          streamType: StreamType.VOD,
          categoryId: vodCategory.id,
          sourceUrl: filePath,
          containerExtension: extname(filename).substring(1), // Remove the dot
          releaseDate: year ? new Date(`${year}-01-01`) : null,
          isActive: true,
          sortOrder: 0,
        },
      });
      
      created++;
      if (created % 50 === 0) {
        console.log(`Progress: ${created} movies imported...`);
      }
    } catch (error) {
      console.error(`Error importing movie ${basename(filePath)}:`, error);
      errors++;
    }
  }
  
  console.log(`\nMovies import complete:`);
  console.log(`  Created: ${created}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Errors: ${errors}`);
  
  return { created, skipped, errors };
}

async function importSeries() {
  console.log('\n=== IMPORTING SERIES ===');
  
  // Ensure SERIES category exists
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
  
  const episodeFiles = getVideoFiles(SERIES_DIR, 3); // Deeper search for series
  console.log(`Found ${episodeFiles.length} episode files`);
  
  // Group episodes by series
  const seriesMap = new Map<string, Array<{ 
    filePath: string; 
    seasonNumber: number; 
    episodeNumber: number; 
  }>>();
  
  for (const filePath of episodeFiles) {
    const filename = basename(filePath);
    const episodeInfo = parseSeriesEpisode(filename);
    
    if (episodeInfo) {
      const { seriesName, seasonNumber, episodeNumber } = episodeInfo;
      
      if (!seriesMap.has(seriesName)) {
        seriesMap.set(seriesName, []);
      }
      
      seriesMap.get(seriesName)!.push({
        filePath,
        seasonNumber,
        episodeNumber,
      });
    }
  }
  
  console.log(`Identified ${seriesMap.size} unique series`);
  
  let seriesCreated = 0;
  let episodesCreated = 0;
  let episodesSkipped = 0;
  let errors = 0;
  
  for (const [seriesName, episodes] of seriesMap.entries()) {
    try {
      // Check if series already exists
      let series = await prisma.series.findFirst({
        where: { name: seriesName },
      });
      
      if (!series) {
        // Create the series
        series = await prisma.series.create({
          data: {
            name: seriesName,
            categories: {
              create: {
                categoryId: seriesCategory.id,
                isPrimary: true,
              },
            },
          },
        });
        seriesCreated++;
        console.log(`Created series: ${seriesName}`);
      }
      
      // Create episodes
      for (const episode of episodes) {
        try {
          // Check if episode already exists
          const existing = await prisma.episode.findUnique({
            where: {
              seriesId_seasonNumber_episodeNumber: {
                seriesId: series.id,
                seasonNumber: episode.seasonNumber,
                episodeNumber: episode.episodeNumber,
              },
            },
          });
          
          if (existing) {
            episodesSkipped++;
            continue;
          }
          
          await prisma.episode.create({
            data: {
              seriesId: series.id,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              title: `S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`,
              sourceUrl: episode.filePath,
              containerExtension: extname(episode.filePath).substring(1),
            },
          });
          
          episodesCreated++;
        } catch (error) {
          console.error(`Error creating episode S${episode.seasonNumber}E${episode.episodeNumber} for ${seriesName}:`, error);
          errors++;
        }
      }
      
      if (seriesCreated % 10 === 0) {
        console.log(`Progress: ${seriesCreated} series, ${episodesCreated} episodes imported...`);
      }
    } catch (error) {
      console.error(`Error importing series ${seriesName}:`, error);
      errors++;
    }
  }
  
  console.log(`\nSeries import complete:`);
  console.log(`  Series created: ${seriesCreated}`);
  console.log(`  Episodes created: ${episodesCreated}`);
  console.log(`  Episodes skipped: ${episodesSkipped}`);
  console.log(`  Errors: ${errors}`);
  
  return { seriesCreated, episodesCreated, episodesSkipped, errors };
}

async function main() {
  console.log('Starting media import from', MEDIA_ROOT);
  console.log('='.repeat(60));
  
  try {
    const movieStats = await importMovies();
    const seriesStats = await importSeries();
    
    console.log('\n' + '='.repeat(60));
    console.log('IMPORT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Movies: ${movieStats.created} created, ${movieStats.skipped} skipped, ${movieStats.errors} errors`);
    console.log(`Series: ${seriesStats.seriesCreated} created`);
    console.log(`Episodes: ${seriesStats.episodesCreated} created, ${seriesStats.episodesSkipped} skipped, ${seriesStats.errors} errors`);
    
    // Database totals
    const totalMovies = await prisma.stream.count({ where: { streamType: StreamType.VOD } });
    const totalSeries = await prisma.series.count();
    const totalEpisodes = await prisma.episode.count();
    
    console.log('\nDatabase totals:');
    console.log(`  Total movies: ${totalMovies}`);
    console.log(`  Total series: ${totalSeries}`);
    console.log(`  Total episodes: ${totalEpisodes}`);
  } catch (error) {
    console.error('Fatal error during import:', error);
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
