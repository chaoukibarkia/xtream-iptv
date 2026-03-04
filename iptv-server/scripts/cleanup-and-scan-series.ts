import { prisma } from '../src/config/database.js';
import * as fs from 'fs';
import * as path from 'path';

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
function findVideoFiles(dir: string, baseDir: string = dir): Array<{ fullPath: string; relativePath: string; filename: string }> {
  const results: Array<{ fullPath: string; relativePath: string; filename: string }> = [];
  
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
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return results;
}

// Try to match series name
function matchSeriesName(filename: string, seriesName: string): boolean {
  const normalizeString = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const normalizedFilename = normalizeString(filename);
  const normalizedSeriesName = normalizeString(seriesName);

  // Check if series name is in the filename
  return normalizedFilename.includes(normalizedSeriesName);
}

async function cleanupAndScan() {
  try {
    console.log('=== Step 1: Deleting placeholder episodes ===\n');
    
    // Delete all episodes with example.com URLs
    const deleteResult = await prisma.episode.deleteMany({
      where: {
        sourceUrl: {
          contains: 'example.com',
        },
      },
    });
    
    console.log(`✓ Deleted ${deleteResult.count} placeholder episodes\n`);

    console.log('=== Step 2: Scanning for media files ===\n');
    
    // Check common media directories
    const possibleDirs = [
      '/media/series',
      '/storage-pool/media/series',
      '/mnt/media/series',
      './media/series',
    ];

    let mediaDir: string | null = null;
    
    for (const dir of possibleDirs) {
      if (fs.existsSync(dir)) {
        mediaDir = dir;
        console.log(`✓ Found media directory: ${dir}\n`);
        break;
      }
    }

    if (!mediaDir) {
      console.log('⚠️  No media directory found. Checked:');
      possibleDirs.forEach(dir => console.log(`  - ${dir}`));
      console.log('\nPlease specify the correct media directory path.');
      return;
    }

    // Scan for video files
    console.log('Scanning for video files...\n');
    const videoFiles = findVideoFiles(mediaDir);
    console.log(`✓ Found ${videoFiles.length} video files\n`);

    if (videoFiles.length === 0) {
      console.log('No video files found in the media directory.');
      return;
    }

    // Get all series
    const allSeries = await prisma.series.findMany({
      include: {
        episodes: true,
      },
    });

    console.log(`Found ${allSeries.length} series in database\n`);
    console.log('=== Step 3: Matching and creating episodes ===\n');

    let createdCount = 0;
    let updatedCount = 0;

    for (const series of allSeries) {
      console.log(`Processing: ${series.name}`);
      
      // Find video files that match this series
      const matchingFiles = videoFiles.filter(file => 
        matchSeriesName(file.filename, series.name) || 
        matchSeriesName(file.relativePath, series.name)
      );

      if (matchingFiles.length === 0) {
        console.log(`  ⚠️  No matching files found`);
        continue;
      }

      console.log(`  Found ${matchingFiles.length} matching files`);

      for (const file of matchingFiles) {
        const episodeInfo = parseEpisodeInfo(file.filename);
        
        if (!episodeInfo) {
          console.log(`  ⚠️  Could not parse episode info from: ${file.filename}`);
          continue;
        }

        const { season, episode } = episodeInfo;
        
        // Check if episode already exists
        const existingEpisode = series.episodes.find(
          e => e.seasonNumber === season && e.episodeNumber === episode
        );

        const sourceUrl = `/${file.relativePath}`;
        const containerExtension = path.extname(file.filename).substring(1);

        if (existingEpisode) {
          // Update existing episode
          await prisma.episode.update({
            where: { id: existingEpisode.id },
            data: {
              sourceUrl,
              containerExtension,
              title: `${series.name} - S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`,
            },
          });
          updatedCount++;
          console.log(`  ✓ Updated S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`);
        } else {
          // Create new episode
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
          console.log(`  ✓ Created S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')}`);
        }
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Placeholder episodes deleted: ${deleteResult.count}`);
    console.log(`New episodes created: ${createdCount}`);
    console.log(`Existing episodes updated: ${updatedCount}`);
    console.log(`\nTotal episodes now in database: ${createdCount + updatedCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupAndScan();
