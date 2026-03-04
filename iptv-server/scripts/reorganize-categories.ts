import { prisma } from '../src/config/database.js';
import { StreamType } from '@prisma/client';

/**
 * Script to reorganize LIVE categories:
 * 1. Create subcategories for all country categories
 * 2. Automatically categorize streams based on name patterns
 */

// Standard subcategories for each country
const STANDARD_SUBCATEGORIES = [
  { name: 'GÉNÉRALISTE', sortOrder: 1, keywords: ['TV', 'ONE', '2', '3', '4', '5', 'PLUS', 'PREMIERE', 'NATIONAL', 'INTERNATIONAL'] },
  { name: 'SPORTS', sortOrder: 2, keywords: ['SPORT', 'BEIN', 'ESPN', 'EUROSPORT', 'FOOT', 'FOOTBALL', 'TENNIS', 'BASKET', 'GOLF', 'RACING', 'FIGHT', 'UFC', 'NBA', 'NFL'] },
  { name: 'CINÉMA', sortOrder: 3, keywords: ['CINEMA', 'MOVIE', 'FILM', 'CINE', 'ROTANA CINEMA', 'MBC MAX', 'TCM', 'PARAMOUNT'] },
  { name: 'INFO', sortOrder: 4, keywords: ['NEWS', 'INFO', 'ALJAZEERA', 'AL JAZEERA', 'BBC NEWS', 'CNN', 'SKY NEWS', 'FRANCE24', 'CNEWS', 'BFMTV', 'BFM', 'BREAKING', 'AKHBAR'] },
  { name: 'DOCUMENTAIRES', sortOrder: 5, keywords: ['DOCUMENTARY', 'DOCUMENTAIRE', 'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NAT GEO', 'HISTORY', 'SCIENCE', 'NATURE', 'ANIMAL', 'PLANETE'] },
  { name: 'ENFANTS', sortOrder: 6, keywords: ['KIDS', 'ENFANT', 'CARTOON', 'TOON', 'DISNEY', 'NICKELODEON', 'NICK JR', 'BARAEM', 'JEEM', 'BABY', 'JUNIOR', 'GULLI'] },
  { name: 'MUSIQUE', sortOrder: 7, keywords: ['MUSIC', 'MUSIQUE', 'MTV', 'MCM', 'MELODY', 'ROTANA MUSIC', 'MAZZIKA', 'TRACE', 'MEZZO'] },
  { name: 'SÉRIES', sortOrder: 8, keywords: ['SERIE', 'DRAMA', 'MBC DRAMA', 'OSN', 'SHAHID', 'SHOW'] },
  { name: 'RELIGIEUX', sortOrder: 9, keywords: ['QURAN', 'CORAN', 'ISLAM', 'SUNNAH', 'MECCA', 'MAKKAH', 'IQRAA', 'AZHARI', 'RELIGIOUS'] },
  { name: 'DIVERTISSEMENT', sortOrder: 10, keywords: ['ENTERTAINMENT', 'VARIETY', 'COMEDY', 'FUN', 'LIFESTYLE', 'REALITY'] },
];

interface SubcategoryMapping {
  parentId: number;
  subcategoryId: number;
  subcategoryName: string;
}

async function main() {
  console.log('🚀 Starting category reorganization...\n');

  // 1. Get all country parent categories (excluding special categories)
  const countryCategories = await prisma.category.findMany({
    where: {
      type: StreamType.LIVE,
      parentId: null,
      countryCode: { not: null },
      // Exclude special non-country categories
      countryCode: {
        notIn: ['XX', 'SP', 'NW', 'WD', 'AR'], // Adult, Sports, News International, World, Arabic Channels
      },
    },
    orderBy: { name: 'asc' },
  });

  console.log(`📍 Found ${countryCategories.length} country categories\n`);

  const subcategoryMappings: SubcategoryMapping[] = [];

  // 2. Create subcategories for each country
  for (const country of countryCategories) {
    console.log(`🌍 Processing ${country.name} (${country.countryCode})...`);

    for (const subcat of STANDARD_SUBCATEGORIES) {
      // Check if subcategory already exists
      const existing = await prisma.category.findFirst({
        where: {
          name: subcat.name,
          parentId: country.id,
          type: StreamType.LIVE,
        },
      });

      if (existing) {
        console.log(`   ✓ ${subcat.name} already exists (ID: ${existing.id})`);
        subcategoryMappings.push({
          parentId: country.id,
          subcategoryId: existing.id,
          subcategoryName: subcat.name,
        });
      } else {
        // Create new subcategory
        const newSubcat = await prisma.category.create({
          data: {
            name: subcat.name,
            type: StreamType.LIVE,
            parentId: country.id,
            sortOrder: subcat.sortOrder,
            isActive: true,
          },
        });
        console.log(`   + Created ${subcat.name} (ID: ${newSubcat.id})`);
        subcategoryMappings.push({
          parentId: country.id,
          subcategoryId: newSubcat.id,
          subcategoryName: subcat.name,
        });
      }
    }
    console.log('');
  }

  console.log(`\n✅ Created/verified ${subcategoryMappings.length} subcategories\n`);

  // 3. Get all LIVE streams
  const streams = await prisma.stream.findMany({
    where: {
      streamType: StreamType.LIVE,
    },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  console.log(`📺 Found ${streams.length} LIVE streams to categorize\n`);

  let categorizedCount = 0;
  let skippedCount = 0;

  // 4. Categorize each stream
  for (const stream of streams) {
    const streamNameUpper = stream.name.toUpperCase();
    
    // Find which subcategory this stream belongs to
    let bestMatch: { subcatName: string; score: number } | null = null;

    for (const subcat of STANDARD_SUBCATEGORIES) {
      let score = 0;
      for (const keyword of subcat.keywords) {
        if (streamNameUpper.includes(keyword)) {
          score++;
        }
      }
      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { subcatName: subcat.name, score };
      }
    }

    if (!bestMatch) {
      // No clear match - assign to GÉNÉRALISTE by default
      bestMatch = { subcatName: 'GÉNÉRALISTE', score: 0 };
    }

    // Determine country from current categories or name
    let targetCountryId: number | null = null;

    // FIXED LOGIC: Check the PRIMARY category's parent
    const primaryCat = stream.categories.find(c => c.isPrimary);
    if (primaryCat) {
      // If primary category has a parent, that's the country
      if (primaryCat.category.parentId) {
        targetCountryId = primaryCat.category.parentId;
      } 
      // If primary category IS a country (no parent but has countryCode)
      else if (primaryCat.category.countryCode) {
        targetCountryId = primaryCat.category.id;
      }
    }

    // Fallback 1: Check if any category in the stream is a parent country
    if (!targetCountryId) {
      for (const cat of stream.categories) {
        if (cat.category.parentId === null && cat.category.countryCode) {
          targetCountryId = cat.category.id;
          break;
        }
      }
    }

    // Fallback 2: Try to detect from stream name
    if (!targetCountryId) {
      for (const country of countryCategories) {
        // Check if country name is in stream name
        if (streamNameUpper.includes(country.name.toUpperCase()) ||
            streamNameUpper.includes(country.countryCode?.toUpperCase() || '')) {
          targetCountryId = country.id;
          break;
        }
      }
    }

    // Default to FRANCE if no country detected (most streams seem to be French)
    if (!targetCountryId) {
      const france = countryCategories.find(c => c.countryCode === 'FR');
      if (france) {
        targetCountryId = france.id;
      }
    }

    if (targetCountryId) {
      // Find the appropriate subcategory for this country
      const targetSubcat = subcategoryMappings.find(
        m => m.parentId === targetCountryId && m.subcategoryName === bestMatch!.subcatName
      );

      if (targetSubcat) {
        // Check if already assigned
        const alreadyAssigned = stream.categories.some(
          c => c.categoryId === targetSubcat.subcategoryId
        );

        if (!alreadyAssigned) {
          // Assign stream to subcategory
          await prisma.streamCategory.create({
            data: {
              streamId: stream.id,
              categoryId: targetSubcat.subcategoryId,
            },
          });

          categorizedCount++;
          console.log(
            `✓ ${stream.name.slice(0, 40).padEnd(40)} → ${countryCategories.find(c => c.id === targetCountryId)?.name}/${bestMatch.subcatName}`
          );
        } else {
          skippedCount++;
        }
      }
    }
  }

  console.log(`\n🎉 Categorization complete!`);
  console.log(`   - Streams categorized: ${categorizedCount}`);
  console.log(`   - Streams skipped (already assigned): ${skippedCount}`);
  console.log(`   - Total streams processed: ${streams.length}`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
