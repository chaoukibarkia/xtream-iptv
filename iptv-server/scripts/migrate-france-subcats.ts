import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mapping of prefixes to target country
const prefixMappings: { prefixes: string[]; country: string }[] = [
  { prefixes: ['DE ', 'DE.'], country: 'ALLEMAGNE' },
  { prefixes: ['ES '], country: 'ESPAGNE' },
  { prefixes: ['BE.', 'BE '], country: 'BELGIQUE' },
  { prefixes: ['IT ', 'ITI-'], country: 'ITALIE' },
  { prefixes: ['IN '], country: 'INDE' },
  { prefixes: ['PK '], country: 'PAKISTAN' },
  { prefixes: ['BANGLA', 'BAN ', 'BD '], country: 'BANGLADESH' },
  { prefixes: ['USA ', 'US ', 'US.'], country: 'ÉTATS-UNIS' },
  { prefixes: ['RAF ', 'AAF ', 'GAF ', 'EAF ', 'YAF ', 'CSAT-AF', 'A.F '], country: 'AFRIQUE' },
  { prefixes: ['AD-', 'AD '], country: 'ÉMIRATS ARABES UNIS' },
  { prefixes: ['OS-', 'SHAHID'], country: 'CHAÎNES ARABES' },
  { prefixes: ['UK ', 'UK.', 'GB '], country: 'ROYAUME-UNI' },
];

// Subcategory name mappings (France -> Target country may differ)
const subcatMappings: Record<string, string> = {
  'SPORTS': 'SPORTS',
  'INFO': 'INFO',
  'DOCUMENTAIRES': 'DOCUMENTAIRES',
  'ENFANTS': 'ENFANTS',
  'MUSIQUE': 'MUSIQUE',
  'SÉRIES': 'SÉRIES',
  'DIVERTISSEMENT': 'DIVERTISSEMENT',
};

async function getOrCreateSubcategory(countryName: string, subcatName: string): Promise<number | null> {
  // Find the country parent category
  const country = await prisma.category.findFirst({
    where: { name: countryName, parentId: null }
  });

  if (!country) {
    console.log(`  [WARN] Country not found: ${countryName}`);
    return null;
  }

  // Find or create the subcategory
  let subcat = await prisma.category.findFirst({
    where: { name: subcatName, parentId: country.id }
  });

  if (!subcat) {
    subcat = await prisma.category.create({
      data: {
        name: subcatName,
        parentId: country.id,
        type: 'LIVE',
        isActive: true
      }
    });
    console.log(`  [NEW] Created ${countryName}/${subcatName} (ID: ${subcat.id})`);
  }

  return subcat.id;
}

function getTargetCountry(channelName: string): string | null {
  const upperName = channelName.toUpperCase();
  
  for (const { prefixes, country } of prefixMappings) {
    for (const prefix of prefixes) {
      if (upperName.startsWith(prefix)) {
        return country;
      }
    }
  }
  return null;
}

async function main() {
  // Get FRANCE parent category
  const france = await prisma.category.findFirst({
    where: { name: 'FRANCE', parentId: null },
    include: { children: true }
  });

  if (!france) {
    console.error('FRANCE category not found!');
    return;
  }

  const results: Record<string, Record<string, number>> = {};

  for (const subcat of france.children) {
    // Skip GÉNÉRALISTE and CINÉMA (already cleaned)
    if (subcat.name === 'GÉNÉRALISTE' || subcat.name === 'CINÉMA') {
      continue;
    }

    const targetSubcatName = subcatMappings[subcat.name];
    if (!targetSubcatName) continue;

    console.log(`\n=== Processing FRANCE/${subcat.name} ===`);

    const channels = await prisma.stream.findMany({
      where: {
        categories: { some: { categoryId: subcat.id } }
      },
      select: { id: true, name: true }
    });

    let movedCount = 0;
    const moveCounts: Record<string, number> = {};

    for (const channel of channels) {
      const targetCountry = getTargetCountry(channel.name);
      
      if (targetCountry) {
        const targetCatId = await getOrCreateSubcategory(targetCountry, targetSubcatName);
        
        if (targetCatId) {
          // Remove from FRANCE subcategory
          await prisma.streamCategory.deleteMany({
            where: {
              streamId: channel.id,
              categoryId: subcat.id
            }
          });

          // Check if already exists in target
          const existing = await prisma.streamCategory.findFirst({
            where: {
              streamId: channel.id,
              categoryId: targetCatId
            }
          });

          if (!existing) {
            await prisma.streamCategory.create({
              data: {
                streamId: channel.id,
                categoryId: targetCatId,
                isPrimary: true
              }
            });
          }

          movedCount++;
          moveCounts[targetCountry] = (moveCounts[targetCountry] || 0) + 1;
        }
      }
    }

    if (movedCount > 0) {
      console.log(`Moved ${movedCount} channels from FRANCE/${subcat.name}:`);
      for (const [country, count] of Object.entries(moveCounts)) {
        console.log(`  -> ${country}/${targetSubcatName}: ${count}`);
      }
      results[subcat.name] = moveCounts;
    } else {
      console.log(`No misplaced channels found.`);
    }
  }

  console.log('\n\n========== MIGRATION SUMMARY ==========');
  let totalMoved = 0;
  for (const [subcat, countries] of Object.entries(results)) {
    console.log(`\nFRANCE/${subcat}:`);
    for (const [country, count] of Object.entries(countries)) {
      console.log(`  -> ${country}: ${count}`);
      totalMoved += count;
    }
  }
  console.log(`\nTotal channels moved: ${totalMoved}`);

  await prisma.$disconnect();
}

main().catch(console.error);
