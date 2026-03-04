import { prisma } from '../src/config/database.js';
import * as fs from 'fs';
import * as path from 'path';

// Get media directory from command line argument
const mediaDir = process.argv[2];

if (!mediaDir) {
  console.log('Usage: npx tsx scripts/improved-scan-series.ts <media-directory>');
  console.log('\nExample:');
  console.log('  npx tsx scripts/improved-scan-series.ts /path/to/media/series');
  process.exit(1);
}

if (!fs.existsSync(mediaDir)) {
  console.error(`Error: Directory does not exist: ${mediaDir}`);
  process.exit(1);
}

// Common video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.m4v', '.ts', '.flv', '.webm'];

// Manual series name mappings for better accuracy
const SERIES_MAPPINGS: Record<string, string[]> = {
  'House of the Dragon': ['house.of.the.dragon', 'house of the dragon'],
  'The Lord of the Rings The Rings of Power': ['lord.of.the.rings', 'rings.of.power', 'lotr'],
  'Only Murders in the Building': ['only.murders.in.the.building', 'only murders'],
  'The Penguin': ['the.penguin', 'penguin'],
  'Tulsa King': ['tulsa.king', 'tulsa king'],
  'Shrinking': ['shrinking'],
  'Slow Horses': ['slow.horses', 'slow horses'],
  'The Franchise': ['the.franchise', 'franchise'],
  '9-1-1 : Lone Star': ['9-1-1', '911', 'lone.star'],
  'Bad Monkey': ['bad.monkey', 'bad monkey'],
  'Citadel Diana': ['citadel.diana', 'citadel diana'],
  'Disclaimer': ['disclaimer'],
  'La Maquina': ['la.maquina', 'la maquina'],
  'Utopia': ['utopia'],
  'Zorro': ['zorro'],
  'Alien theory : Les preuves ultimes': ['alien.theory', 'alien theory', 'alien.country'],
};

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

// Improved matching with manual mappings
function matchSeriesName(filename: string, seriesName: string): { score: number; exact: boolean } {
  const normalizeString = (str: string) => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const normalizedFilename = normalizeString(filename);
  const normalizedSeriesName = normalizeString(seriesName);

  // Check manual mappings first
  if (SERIES_MAPPINGS[seriesName]) {
    for (const mapping of SERIES_MAPPINGS[seriesName]) {
      const normalizedMapping = normalizeString(mapping);
      if (normalizedFilename.includes(normalizedMapping)) {
        // Calculate how much of the filename is the series name
        const mappingWords = normalizedMapping.split(' ');
        const filenameWords = normalizedFilename.split(' ');
        const matchingWords = mappingWords.filter(mw => 
          filenameWords.some(fw => fw === mw || fw.includes(mw) || mw.includes(fw))
        );
        const score = (matchingWords.length / mappingWords.length) * 100;
        return { score, exact: true };
      }
    }
  }

  // Exact match
  if (normalizedFilename.includes(normalizedSeriesName)) {
    return { score: 100, exact: true };
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
  return { score, exact: false };
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
    const processedFiles = new Set<string>(); // Track which files we've assigned

    for (const series of allSeries) {
      console.log(`\nProcessing: ${series.name}`);
      
      // Find video files that match this series
      const matchingFiles: Array<{ file: typeof videoFiles[0]; score: number; exact: boolean }> = [];
      
      for (const file of videoFiles) {
        // Skip if this file was already assigned to another series
        if (processedFiles.has(file.relativePath)) {
          continue;
        }

        const filenameMatch = matchSeriesName(file.filename, series.name);
        const dirMatch = matchSeriesName(file.dirName, series.name);
        const pathMatch = matchSeriesName(file.relativePath, series.name);
        
        // Take the best match
        const bestMatch = [filenameMatch, dirMatch, pathMatch].reduce((best, current) => 
          current.score > best.score ? current : best
        );
        
        // Require exact match (from manual mappings or contains) with high score
        // OR very high fuzzy match score (90%+)
        if ((bestMatch.exact && bestMatch.score >= 80) || bestMatch.score >= 90) {
          matchingFiles.push({ file, score: bestMatch.score, exact: bestMatch.exact });
        }
      }

      // Sort by score (best matches first)
      matchingFiles.sort((a, b) => {
        // Prefer exact matches
        if (a.exact && !b.exact) return -1;
        if (!a.exact && b.exact) return 1;
        return b.score - a.score;
      });

      if (matchingFiles.length === 0) {
        console.log(`  ⚠️  No matching files found (add files or check series name)`);
        continue;
      }

      console.log(`  Found ${matchingFiles.length} matching files`);

      for (const { file, score, exact } of matchingFiles) {
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
            processedFiles.add(file.relativePath);
            console.log(`  ✓ Updated S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (${exact ? 'exact' : 'fuzzy'}: ${score.toFixed(0)}%)`);
          } else {
            console.log(`  - Skipped S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (already exists)`);
            processedFiles.add(file.relativePath);
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
            processedFiles.add(file.relativePath);
            console.log(`  ✓ Created S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (${exact ? 'exact' : 'fuzzy'}: ${score.toFixed(0)}%)`);
          } catch (error: any) {
            if (error.code === 'P2002') {
              // Unique constraint failed - episode was created between our check and now
              console.log(`  - Skipped S${season.toString().padStart(2, '0')}E${episode.toString().padStart(2, '0')} (duplicate)`);
              processedFiles.add(file.relativePath);
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
    console.log(`Files processed: ${processedFiles.size}`);
    console.log(`Files unmatched: ${videoFiles.length - processedFiles.size}`);
    
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
