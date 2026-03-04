/**
 * Script to find all French channels with FULLHD in name
 * and add their source URLs as backups to equivalent channels without FULLHD
 */

import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

interface FullHDChannel {
  id: number;
  name: string;
  sourceUrl: string;
  normalizedName: string;
  coreChannelName: string;
}

interface RegularChannel {
  id: number;
  name: string;
  sourceUrl: string;
  backupUrls: string[];
  normalizedName: string;
  coreChannelName: string;
}

interface MatchResult {
  fullhdChannel: { id: number; name: string; sourceUrl: string };
  equivalentChannel: { id: number; name: string; currentBackups: string[] };
  matchType: 'exact' | 'core' | 'fuzzy';
}

/**
 * Normalize channel name for matching:
 * - Remove FULLHD
 * - Remove common prefixes like "FR ", "FR-", "FR.", "FR:"
 * - Remove quality indicators like "HD", "SD", "FHD", "4K", "UHD"
 * - Replace numbers written differently (01 vs 1, 02 vs 2)
 * - Remove special chars and extra spaces
 */
function normalizeChannelName(name: string): { normalized: string; core: string } {
  let normalized = name
    .toUpperCase()
    .replace(/\bFULLHD\b/g, '')
    .replace(/\bFULL\s*HD\b/g, '')
    .trim();
  
  // Get a "core" name by removing country prefix and quality markers
  let core = normalized
    // Remove country prefixes
    .replace(/^FR[\s\-.:]+/i, '')
    .replace(/^BE[\s\-.:]+/i, '')
    .replace(/^UK[\s\-.:]+/i, '')
    // Remove quality indicators at start or end
    .replace(/\b(HEVC|H\.?265|H\.?264)\b/g, '')
    .replace(/\b(UHD|4K|FHD|HD|SD)\b/g, '')
    // Normalize spaces and punctuation
    .replace(/[\-.:_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Normalize numbers (01 -> 1, 02 -> 2, etc.)
  core = core.replace(/\b0+(\d+)\b/g, '$1');
  
  // Remove trailing/leading numbers that might be stream IDs
  normalized = normalized
    .replace(/[\-.:_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return { normalized, core };
}

/**
 * Calculate similarity between two strings (Levenshtein-based)
 */
function similarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  // Simple approach: check if one contains the other
  if (longer.includes(shorter) || shorter.includes(longer)) {
    return shorter.length / longer.length;
  }
  
  // Levenshtein distance
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  
  return (longer.length - costs[s2.length]) / longer.length;
}

async function main() {
  console.log('Finding France category...');
  
  // Find France category (top-level with countryCode FR)
  const franceCategory = await prisma.category.findFirst({
    where: {
      OR: [
        { countryCode: 'FR' },
        { name: { contains: 'France', mode: 'insensitive' } }
      ],
      parentId: null,
      type: StreamType.LIVE
    }
  });

  if (!franceCategory) {
    // Try finding by name pattern with sub-categories
    const franceCategoryByName = await prisma.category.findFirst({
      where: {
        name: { contains: 'France', mode: 'insensitive' },
        type: StreamType.LIVE
      }
    });
    
    if (!franceCategoryByName) {
      console.log('France category not found. Searching for all categories...');
      const allCategories = await prisma.category.findMany({
        where: { type: StreamType.LIVE },
        take: 50,
        orderBy: { name: 'asc' }
      });
      console.log('Available LIVE categories:', allCategories.map(c => `${c.id}: ${c.name} (countryCode: ${c.countryCode}, parentId: ${c.parentId})`));
      process.exit(1);
    }
  }

  // Get France category and all its sub-categories
  const franceCategoryId = franceCategory?.id;
  console.log(`Found France category: ${franceCategory?.name} (ID: ${franceCategoryId})`);

  // Get all sub-category IDs under France
  const subCategories = await prisma.category.findMany({
    where: {
      parentId: franceCategoryId,
      type: StreamType.LIVE
    }
  });
  
  const allFranceCategoryIds = [franceCategoryId!, ...subCategories.map(c => c.id)];
  console.log(`Found ${subCategories.length} sub-categories under France`);

  // Find all streams in France categories
  const allFranceStreams = await prisma.stream.findMany({
    where: {
      streamType: StreamType.LIVE,
      isActive: true,
      OR: [
        { categoryId: { in: allFranceCategoryIds } },
        {
          categories: {
            some: {
              categoryId: { in: allFranceCategoryIds }
            }
          }
        }
      ]
    },
    select: {
      id: true,
      name: true,
      sourceUrl: true,
      backupUrls: true,
      categoryId: true
    }
  });

  console.log(`Found ${allFranceStreams.length} total LIVE streams in France categories`);

  // Separate FULLHD channels from regular channels
  const fullhdPattern = /\bFULLHD\b/i;
  const fullhdChannels: FullHDChannel[] = [];
  const regularChannels: RegularChannel[] = [];
  
  // Maps for fast lookup
  const regularByNormalized = new Map<string, RegularChannel>();
  const regularByCore = new Map<string, RegularChannel[]>();

  for (const stream of allFranceStreams) {
    const { normalized, core } = normalizeChannelName(stream.name);
    
    if (fullhdPattern.test(stream.name)) {
      fullhdChannels.push({
        id: stream.id,
        name: stream.name,
        sourceUrl: stream.sourceUrl,
        normalizedName: normalized,
        coreChannelName: core
      });
    } else {
      const regularChannel: RegularChannel = {
        id: stream.id,
        name: stream.name,
        sourceUrl: stream.sourceUrl,
        backupUrls: stream.backupUrls,
        normalizedName: normalized,
        coreChannelName: core
      };
      
      regularChannels.push(regularChannel);
      regularByNormalized.set(normalized, regularChannel);
      
      // Group by core name for fuzzy matching
      if (!regularByCore.has(core)) {
        regularByCore.set(core, []);
      }
      regularByCore.get(core)!.push(regularChannel);
    }
  }

  console.log(`\nFound ${fullhdChannels.length} channels with FULLHD in name`);
  console.log(`Found ${regularChannels.length} regular channels to match against`);

  // Find matches using multiple strategies
  const matches: MatchResult[] = [];
  const noMatches: FullHDChannel[] = [];

  for (const fullhd of fullhdChannels) {
    let matched = false;
    
    // Strategy 1: Exact normalized match
    const exactMatch = regularByNormalized.get(fullhd.normalizedName);
    if (exactMatch) {
      matches.push({
        fullhdChannel: { id: fullhd.id, name: fullhd.name, sourceUrl: fullhd.sourceUrl },
        equivalentChannel: { id: exactMatch.id, name: exactMatch.name, currentBackups: exactMatch.backupUrls },
        matchType: 'exact'
      });
      matched = true;
      continue;
    }
    
    // Strategy 2: Core name match (without country prefix and quality markers)
    const coreMatches = regularByCore.get(fullhd.coreChannelName);
    if (coreMatches && coreMatches.length > 0) {
      // Pick the best match if multiple
      const bestMatch = coreMatches[0]; // TODO: could rank by other criteria
      matches.push({
        fullhdChannel: { id: fullhd.id, name: fullhd.name, sourceUrl: fullhd.sourceUrl },
        equivalentChannel: { id: bestMatch.id, name: bestMatch.name, currentBackups: bestMatch.backupUrls },
        matchType: 'core'
      });
      matched = true;
      continue;
    }
    
    // Strategy 3: Fuzzy match - find best similarity > 0.8
    let bestFuzzyMatch: RegularChannel | null = null;
    let bestSimilarity = 0.8; // Threshold
    
    for (const regular of regularChannels) {
      const sim = similarity(fullhd.coreChannelName, regular.coreChannelName);
      if (sim > bestSimilarity) {
        bestSimilarity = sim;
        bestFuzzyMatch = regular;
      }
    }
    
    if (bestFuzzyMatch) {
      matches.push({
        fullhdChannel: { id: fullhd.id, name: fullhd.name, sourceUrl: fullhd.sourceUrl },
        equivalentChannel: { id: bestFuzzyMatch.id, name: bestFuzzyMatch.name, currentBackups: bestFuzzyMatch.backupUrls },
        matchType: 'fuzzy'
      });
      matched = true;
    }
    
    if (!matched) {
      noMatches.push(fullhd);
    }
  }

  // Count by match type
  const exactCount = matches.filter(m => m.matchType === 'exact').length;
  const coreCount = matches.filter(m => m.matchType === 'core').length;
  const fuzzyCount = matches.filter(m => m.matchType === 'fuzzy').length;

  console.log(`\nFound ${matches.length} matching pairs:`);
  console.log(`  - Exact matches: ${exactCount}`);
  console.log(`  - Core name matches: ${coreCount}`);
  console.log(`  - Fuzzy matches: ${fuzzyCount}`);
  console.log(`${noMatches.length} FULLHD channels have no equivalent match`);

  if (matches.length === 0) {
    console.log('\nNo matches found. Nothing to update.');
    
    if (fullhdChannels.length > 0) {
      console.log('\nSample FULLHD channels found:');
      fullhdChannels.slice(0, 10).forEach(ch => {
        console.log(`  - "${ch.name}" -> core: "${ch.coreChannelName}"`);
      });
      
      console.log('\nSample regular channels:');
      regularChannels.slice(0, 10).forEach(ch => {
        console.log(`  - "${ch.name}" -> core: "${ch.coreChannelName}"`);
      });
    }
    
    process.exit(0);
  }

  // Display matches
  console.log('\nMatches found:');
  console.log('-'.repeat(100));
  
  for (const match of matches) {
    const alreadyHasBackup = match.equivalentChannel.currentBackups.includes(match.fullhdChannel.sourceUrl);
    const status = alreadyHasBackup ? '(already has this backup)' : '(will add backup)';
    console.log(`[${match.matchType.toUpperCase()}] "${match.fullhdChannel.name}"`);
    console.log(`       -> "${match.equivalentChannel.name}" ${status}`);
  }

  // Process updates
  console.log('\nAdding FULLHD sources as backups...\n');
  
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const match of matches) {
    try {
      // Check if already in backups
      if (match.equivalentChannel.currentBackups.includes(match.fullhdChannel.sourceUrl)) {
        console.log(`Skipping "${match.equivalentChannel.name}" - already has this backup URL`);
        skipped++;
        continue;
      }

      // Add FULLHD source as backup
      const newBackupUrls = [...match.equivalentChannel.currentBackups, match.fullhdChannel.sourceUrl];
      
      await prisma.stream.update({
        where: { id: match.equivalentChannel.id },
        data: {
          backupUrls: newBackupUrls,
          totalSourceCount: newBackupUrls.length + 1 // +1 for primary source
        }
      });

      console.log(`Added backup to "${match.equivalentChannel.name}" (${match.matchType} match, now has ${newBackupUrls.length} backup(s))`);
      updated++;
    } catch (error) {
      console.error(`Error updating "${match.equivalentChannel.name}":`, error);
      errors++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total FULLHD channels found: ${fullhdChannels.length}`);
  console.log(`  Total matches found: ${matches.length}`);
  console.log(`    - Exact matches: ${exactCount}`);
  console.log(`    - Core name matches: ${coreCount}`);
  console.log(`    - Fuzzy matches: ${fuzzyCount}`);
  console.log(`  Successfully updated: ${updated}`);
  console.log(`  Skipped (already had backup): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  No match found: ${noMatches.length}`);
  
  if (noMatches.length > 0) {
    console.log('\nFULLHD channels without matches:');
    noMatches.forEach(ch => {
      console.log(`  - "${ch.name}" (core: "${ch.coreChannelName}")`);
    });
  }
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
