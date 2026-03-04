import { prisma } from '../src/config/database.js';
import * as fs from 'fs';
import * as path from 'path';

// Get media directory from command line argument
const mediaDir = process.argv[2];

if (!mediaDir) {
  console.log('Usage: npx tsx scripts/scan-series-files.ts <media-directory>');
  console.log('\nExample:');
  console.log('  npx tsx scripts/scan-series-files.ts /path/to/media/series');
  console.log('\nNote: The script will scan this directory recursively for video files.');
  process.exit(1);
}

if (!fs.existsSync(mediaDir)) {
  console.error(`Error: Directory does not exist: ${mediaDir}`);
  process.exit(1);
}

// Common video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts', '.flv', '.webm'];

// Parse season and episode from filename
function parseEpisodeInfo(filename: string): { season: number; episode: number } | null {
  // Patterns: S01E01, S1E1, 1x01, etc.
  const patterns = [
    /[Ss](\d{1,2})[Ee](\d{1,2})/,  // S01E01, s01e01
    /[Ss]eason[\s._-]*(\d{1,2})[\s._-]*[Ee]pisode[\s._-]*(\d{1,2})/i,
    /(\d{1,2})x(\d{1,2})/,  // 1x01
  ];

  for (const pattern of patterns) {
    const match = filename.match(pattern);
    if (match) {
      return {
        season: parseInt(match[1], 10),
        episode: parseInt(match[2], 10),
      };
    }
  }

  return null;
}

// Recursively find video files
function findVideoFiles(dir: string, baseDir: string = dir): Array<{ fullPath: string; relativePath: string; filename: string; dirName: string }> {
  const results: Array<{ fullPath: string; relativePath: string; filename: string; dirName: string }> = [];
  
  try {
    if (!fs.existsSync(dir)) {
      return results;
    }

    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      
      if (item.isDirectory()) {
        results.push(...findVideoFiles(fullPath, baseDir));
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
          results.push({
            fullPath,
            relativePath: path.relative(baseDir, fullPath),
            filename: item.name,
            dirName: path.basename(path.dirname(fullPath)),
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return results;
}

// Try to match series name with fuzzy matching
function matchSeriesName(filename: string, seriesName: string): number {
  const normalizeString = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedFilename = normalizeString(filename);
  const normalizedSeriesName = normalizeString(seriesName);

  // Exact match
  if (normalizedFilename.includes(normalizedSeriesName)) {
    return 100;
  }

  // Word-by-word matching
  const seriesWords = normalizedSeriesName.split(' ').filter(w => w.length > 2);
  const filenameWords = normalizedFilename.split(' ');
  
  let matchCount = 0;
  for (const word of seriesWords) {
    if (filenameWords.some(fw => fw.includes(word) || word.includes(fw))) {
      matchCount++;
    }
  }

  const score = (matchCount / seriesWords.length) * 100;
  return score;
}

async function scanAndCreateEpisodes() {
  try {
    console.log(`\n=== Scanning media directory: ${mediaDir} ===\n`);
    
    // Scan for video files
    console.log('Scanning for video files...\n');
    const videoFiles = findVideoFiles(mediaDir);
    console.log(`✓ Found ${videoFiles.length} video files\n`);

    if (videoFiles.length === 0) {
      console.log('No video files found in the media directory.');
      return;
    }

    // Group files by directory for better analysis
    const filesByDir: Record<string, typeof videoFiles> = {};
    for (const file of videoFiles) {
      const dirPath = path.dirname(file.relativePath);
      if (!filesByDir[dirPath]) {
        filesByDir[dirPath] = [];
      }
      filesByDir[dirPath].push(file);
    }

    console.log(`Files are organized in ${Object.keys(filesByDir).length} directories\n`);

    // Get all series
    const allSeries = await prisma.series.findMany({
      include: {
        episodes: true,
      },
    });

    console.log(`Found ${allSeries.length} series in database\n`);
    console.log('=== Matching and creating episodes ===\n');

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const series of allSeries) {
      console.log(`\nProcessing: ${series.name}`);
      
      // Find video files that match this series
      const matchingFiles: Array<{ file: typeof videoFiles[0]; score: number }> = [];
      
      for (const file of videoFiles) {
        const filenameScore = matchSeriesName(file.filename, series.name);
        const dirScore = matchSeriesName(file.dirName, series.name);
        const pathScore = matchSeriesName(file.relativePath, series.name);
        
        const maxScore = Math.max(filenameScore, dirScore, pathScore);
        
        if (maxScore >= 50) { // 50% match threshold
          matchingFiles.push({ file, score: maxScore });
        }
      }

      // Sort by score (best matches first)
      matchingFiles.sort((a, b) => b.score - a.score);

      if (matchingFiles.length === 0) {
        console.log(`  ⚠️  No matching files found (add files or check series name)`);
        continue;
      }

      console.log(`  Found ${matchingFiles.length} matching files`);

      for (const { file, score } of matchingFiles) {
        const episodeInfo = parseEpisodeInfo(file.filename);
        
        if (!episodeInfo) {
          console.log(`  ⚠️  Could not parse episode info from: ${file.filename}`);
          skippedCount++;
          continue;
        }

        const { season, episode } = episodeInfo;
        
        // Check if episode already exists
        const existingEpisode = series.episodes.find(
          e => e.seasonNumber === season && e.episodeNumber === episode
        );

        const sourceUrl = `/media/series/${file.relativePath}`;
        const containerExtension = path.extname(file.filename).substring(1);

        if (existingEpisode) {
          // Update existing episode if source URL is different
          if (existingEpisode.sourceUrl !== sourceUrl) {
            await prisma.episode.update({
              where: { id: existingEpisode.id },
              data: {
                sourceUrl,
                containerExtension,
                title: `${series.name} - S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`,
              },
            });
            updatedCount++;
            console.log(`  ✓ Updated S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (match: ${score.toFixed(0)}%)`);
          } else {
            console.log(`  - Skipped S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (already exists)`);
            skippedCount++;
          }
        } else {
          // Create new episode
          try {
            await prisma.episode.create({
              data: {
                seriesId: series.id,
                seasonNumber: season,
                episodeNumber: episode,
                title: `${series.name} - S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`,
                sourceUrl,
                containerExtension,
                duration: 2400, // Default 40 minutes
              },
            });
            createdCount++;
            console.log(`  ✓ Created S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (match: ${score.toFixed(0)}%)`);
          } catch (error: any) {
            if (error.code === 'P2002') {
              // Unique constraint failed - episode was created between our check and now
              console.log(`  - Skipped S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (duplicate)`);
              skippedCount++;
            } else {
              throw error;
            }
          }
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`New episodes created: ${createdCount}`);
    console.log(`Existing episodes updated: ${updatedCount}`);
    console.log(`Files skipped: ${skippedCount}`);
    
    // Get final count
    const totalEpisodes = await prisma.episode.count();
    console.log(`\nTotal episodes now in database: ${totalEpisodes}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

scanAndCreateEpisodes();
