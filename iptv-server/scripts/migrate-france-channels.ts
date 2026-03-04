import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Standard subcategories for countries
const STANDARD_SUBCATEGORIES = [
  'GÉNÉRALISTE',
  'SPORTS',
  'INFO',
  'CINÉMA',
  'SÉRIES',
  'DIVERTISSEMENT',
  'ENFANTS',
  'DOCUMENTAIRES',
  'MUSIQUE',
  'RELIGIEUX',
];

// Netflix subcategories
const NETFLIX_SUBCATEGORIES = ['ANIME', 'S-FICTION'];

// New countries to create
const NEW_COUNTRIES = [
  { name: 'ESPAGNE', countryCode: 'ES', flagSvgUrl: '/flags/es.svg' },
  { name: 'BELGIQUE', countryCode: 'BE', flagSvgUrl: '/flags/be.svg' },
  { name: 'BANGLADESH', countryCode: 'BD', flagSvgUrl: '/flags/bd.svg' },
  { name: 'JORDANIE', countryCode: 'JO', flagSvgUrl: '/flags/jo.svg' },
  { name: 'ÉMIRATS ARABES UNIS', countryCode: 'AE', flagSvgUrl: '/flags/ae.svg' },
  { name: 'CHAÎNES ARABES', countryCode: 'AR', flagSvgUrl: '/flags/arabic.svg' },
];

// Netflix as special category
const NETFLIX_CATEGORY = {
  name: 'NETFLIX',
  countryCode: 'NF',
  flagSvgUrl: '/flags/netflix.svg',
};

interface MoveRule {
  patterns: string[];
  targetCountry: string;
  targetSubcategory: string;
  exactMatch?: string[];
}

// Channel move rules
const MOVE_RULES: MoveRule[] = [
  // Move to existing countries
  {
    patterns: ['DE ', 'DE.'],
    targetCountry: 'ALLEMAGNE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['IT ', 'ITI-'],
    targetCountry: 'ITALIE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['IN '],
    targetCountry: 'INDE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['PB ', 'PUNJABI'],
    targetCountry: 'INDE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['PK '],
    targetCountry: 'PAKISTAN',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['USA', 'US.'],
    targetCountry: 'ÉTATS-UNIS',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  // Move to new countries
  {
    patterns: ['ES '],
    targetCountry: 'ESPAGNE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['BE.'],
    targetCountry: 'BELGIQUE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['BANGLA', 'BAN ', 'BD '],
    targetCountry: 'BANGLADESH',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['ROYA-'],
    targetCountry: 'JORDANIE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  {
    patterns: ['AD-', 'AD '],
    targetCountry: 'ÉMIRATS ARABES UNIS',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  // Africa channels
  {
    patterns: ['RAF ', 'AAF ', 'GAF ', 'EAF ', 'YAF ', 'CSAT-AF', 'A.F '],
    targetCountry: 'AFRIQUE',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  // Arabic channels
  {
    patterns: ['ARB-', 'OS-'],
    targetCountry: 'CHAÎNES ARABES',
    targetSubcategory: 'GÉNÉRALISTE',
  },
  // Move within France
  {
    patterns: ['LIGUE '],
    targetCountry: 'FRANCE',
    targetSubcategory: 'SPORTS',
  },
  {
    patterns: ['BOX OFFICE'],
    targetCountry: 'FRANCE',
    targetSubcategory: 'CINÉMA',
  },
];

// Special exact match rules for individual channels
const EXACT_MATCH_RULES: { name: string; targetCountry: string; targetSubcategory: string }[] = [
  // Adult channels
  { name: 'HOT', targetCountry: 'ADULTES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'FASHION TV MIDNITE SECRETS', targetCountry: 'ADULTES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'RUSSKAYA NOCH', targetCountry: 'ADULTES', targetSubcategory: 'GÉNÉRALISTE' },
  
  // Single country channels
  { name: 'GERMAN TV', targetCountry: 'ALLEMAGNE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'POLISH TV', targetCountry: 'POLOGNE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'PORTGUESE TV', targetCountry: 'PORTUGAL', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'NERTHERLANDS TV', targetCountry: 'PAYS-BAS', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'TURKEY TV', targetCountry: 'TURQUIE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'INDIA TV', targetCountry: 'INDE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '9X JALWA', targetCountry: 'INDE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'B4U PLUS', targetCountry: 'INDE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'ZEE ALWAN', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  
  // French cinema
  { name: 'CANAL+ 360', targetCountry: 'FRANCE', targetSubcategory: 'CINÉMA' },
  { name: 'CANAL+ GRAND ECRAN', targetCountry: 'FRANCE', targetSubcategory: 'CINÉMA' },
  
  // Italian sports
  { name: 'MILAN TV', targetCountry: 'ITALIE', targetSubcategory: 'SPORTS' },
  { name: 'INTER TV', targetCountry: 'ITALIE', targetSubcategory: 'SPORTS' },
  
  // US channels
  { name: 'MLB NETWORK', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'SPORTS' },
  { name: 'REDBULL TV', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'SPORTS' },
  { name: 'FX', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'TRAVEL CHANNEL', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'S 12 - BRONX', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'S 12 NEW JERSEY', targetCountry: 'ÉTATS-UNIS', targetSubcategory: 'GÉNÉRALISTE' },
  
  // Egyptian channels
  { name: 'HEKAYAT', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'HEKAYAT 2', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'MASRAH MASR', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'BAB EL HARA', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'RAMEZ', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'MARAYA', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'ODESI PLAY', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'THAKAFIA', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'DHAHEK-WBASS', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'ON-E', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'RAGELWESET-SETTAT', targetCountry: 'ÉGYPTE', targetSubcategory: 'GÉNÉRALISTE' },
  
  // Arabic channels
  { name: 'LIBYA ELWATAN', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'SUDAN-OUS', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'SAHEL TV', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'SHASHA1', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'SHASHA2', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'NATIONAL1', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'NATIONAL1-HD', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'NATIONAL2', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'NATIONAL2-HD', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'THAMANYA1', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'THAMANYA2', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'MIX BELARABY', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'MIX-ONE', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'RESSALAHD', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'RELIGIEUX' },
  { name: 'ROTANHD', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  { name: 'MENHAG-ALNBOWA', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'RELIGIEUX' },
  { name: 'AWRAAST-TV', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'GÉNÉRALISTE' },
  
  // Kids channels
  { name: 'SM PAW PATROL', targetCountry: 'FRANCE', targetSubcategory: 'ENFANTS' },
  { name: 'SM PEPPA PIG', targetCountry: 'FRANCE', targetSubcategory: 'ENFANTS' },
  { name: 'TOYOR', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'ENFANTS' },
  { name: 'TAHA-ATFAL', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'ENFANTS' },
  
  // African channels from unknown list
  { name: '-- AFRICA TV --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- MOZAMBIQUE --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- SOMAL --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- GHANA TVL --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- NIGERIA --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- SAL --', targetCountry: 'AFRIQUE', targetSubcategory: 'GÉNÉRALISTE' },
  { name: '-- HADI TV --', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'RELIGIEUX' },
  
  // Arabic prefix channels
  { name: '---AL KAS---', targetCountry: 'CHAÎNES ARABES', targetSubcategory: 'SPORTS' },
];

// Netflix channels - special handling
const NETFLIX_CHANNELS = [
  { name: 'NETFLIX ANIME 1', subcategory: 'ANIME' },
  { name: 'NETFLIX ANIME 2', subcategory: 'ANIME' },
  { name: 'NETFLIX ANIME 3', subcategory: 'ANIME' },
  { name: 'NETFLIX ANIME 4', subcategory: 'ANIME' },
  { name: 'NETFLIX ANIME 5', subcategory: 'ANIME' },
  { name: 'NETFLIX ANIME 6', subcategory: 'ANIME' },
  { name: 'NETFLIX S-FICTION 1', subcategory: 'S-FICTION' },
  { name: 'NETFLIX S-FICTION 2', subcategory: 'S-FICTION' },
];

// ELEVEN SPORTS channels - split by country
const ELEVEN_CHANNELS = [
  { name: 'ELEVEN 1 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 2 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 3 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 4 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 5 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 6 PT', targetCountry: 'PORTUGAL', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 1 BE', targetCountry: 'BELGIQUE', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN PRO LEAGUE 1 BE', targetCountry: 'BELGIQUE', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN 1 FR', targetCountry: 'FRANCE', targetSubcategory: 'SPORTS' },
  { name: 'ELEVEN PRO LEAGUE 1 FR', targetCountry: 'FRANCE', targetSubcategory: 'SPORTS' },
];

// Channels starting with AL that should go to Arabic
const AL_PATTERNS = [
  'AL HESEN', 'AL KABIR', 'AL MUTAWASIT', 'AL RESALA',
  'ALGHAD', 'ALHAYAH', 'ALIMAN', 'ALKAS', 'ALMAGHARIBIA',
  'ALMAJD', 'ALOOBA', 'ALTHANYA',
];

async function main() {
  console.log('=== Starting Channel Migration ===\n');

  // Step 1: Rename AFGHANISTAN to AFRIQUE
  console.log('Step 1: Renaming AFGHANISTAN to AFRIQUE...');
  const afghanistan = await prisma.category.findFirst({
    where: { name: 'AFGHANISTAN', parentId: null },
  });

  if (afghanistan) {
    await prisma.category.update({
      where: { id: afghanistan.id },
      data: {
        name: 'AFRIQUE',
        countryCode: 'AF',
        flagSvgUrl: '/flags/af.svg',
      },
    });
    console.log(`  Renamed AFGHANISTAN (ID: ${afghanistan.id}) to AFRIQUE`);
  } else {
    console.log('  AFGHANISTAN category not found, checking if AFRIQUE exists...');
  }

  // Step 2: Create new country categories
  console.log('\nStep 2: Creating new country categories...');
  const createdCountries: Map<string, number> = new Map();

  for (const country of NEW_COUNTRIES) {
    // Check if already exists
    const existing = await prisma.category.findFirst({
      where: { name: country.name, parentId: null },
    });

    if (existing) {
      console.log(`  ${country.name} already exists (ID: ${existing.id})`);
      createdCountries.set(country.name, existing.id);
    } else {
      const created = await prisma.category.create({
        data: {
          name: country.name,
          type: 'LIVE',
          countryCode: country.countryCode,
          flagSvgUrl: country.flagSvgUrl,
          isActive: true,
        },
      });
      console.log(`  Created ${country.name} (ID: ${created.id})`);
      createdCountries.set(country.name, created.id);

      // Create subcategories
      for (const subcat of STANDARD_SUBCATEGORIES) {
        await prisma.category.create({
          data: {
            name: subcat,
            type: 'LIVE',
            parentId: created.id,
            isActive: true,
          },
        });
      }
      console.log(`    Created ${STANDARD_SUBCATEGORIES.length} subcategories`);
    }
  }

  // Step 3: Create NETFLIX category
  console.log('\nStep 3: Creating NETFLIX category...');
  let netflixParent = await prisma.category.findFirst({
    where: { name: 'NETFLIX', parentId: null },
  });

  if (!netflixParent) {
    netflixParent = await prisma.category.create({
      data: {
        name: NETFLIX_CATEGORY.name,
        type: 'LIVE',
        countryCode: NETFLIX_CATEGORY.countryCode,
        flagSvgUrl: NETFLIX_CATEGORY.flagSvgUrl,
        isActive: true,
      },
    });
    console.log(`  Created NETFLIX (ID: ${netflixParent.id})`);

    for (const subcat of NETFLIX_SUBCATEGORIES) {
      await prisma.category.create({
        data: {
          name: subcat,
          type: 'LIVE',
          parentId: netflixParent.id,
          isActive: true,
        },
      });
    }
    console.log(`    Created ${NETFLIX_SUBCATEGORIES.length} subcategories`);
  } else {
    console.log(`  NETFLIX already exists (ID: ${netflixParent.id})`);
  }

  // Step 4: Get all channels from FRANCE/GÉNÉRALISTE
  console.log('\nStep 4: Fetching channels from FRANCE/GÉNÉRALISTE...');
  const franceGeneraliste = await prisma.category.findFirst({
    where: {
      name: 'GÉNÉRALISTE',
      parent: { name: 'FRANCE' },
    },
  });

  if (!franceGeneraliste) {
    console.error('FRANCE/GÉNÉRALISTE not found!');
    return;
  }

  const channels = await prisma.stream.findMany({
    where: { categoryId: franceGeneraliste.id },
    select: { id: true, name: true },
  });

  console.log(`  Found ${channels.length} channels to process`);

  // Step 5: Build category cache
  console.log('\nStep 5: Building category cache...');
  const allCategories = await prisma.category.findMany({
    include: { parent: true },
  });

  const categoryCache: Map<string, number> = new Map();
  for (const cat of allCategories) {
    if (cat.parent) {
      const key = `${cat.parent.name}/${cat.name}`;
      categoryCache.set(key, cat.id);
    }
  }
  console.log(`  Cached ${categoryCache.size} subcategories`);

  // Step 6: Process channel moves
  console.log('\nStep 6: Processing channel moves...');
  
  let movedCount = 0;
  let skippedCount = 0;
  const moveLog: { id: number; name: string; from: string; to: string }[] = [];

  for (const channel of channels) {
    let targetCategoryId: number | null = null;
    let targetPath = '';

    // Check exact match rules first
    const exactMatch = EXACT_MATCH_RULES.find(r => r.name === channel.name);
    if (exactMatch) {
      const key = `${exactMatch.targetCountry}/${exactMatch.targetSubcategory}`;
      targetCategoryId = categoryCache.get(key) || null;
      targetPath = key;
    }

    // Check ELEVEN channels
    if (!targetCategoryId) {
      const elevenMatch = ELEVEN_CHANNELS.find(e => e.name === channel.name);
      if (elevenMatch) {
        const key = `${elevenMatch.targetCountry}/${elevenMatch.targetSubcategory}`;
        targetCategoryId = categoryCache.get(key) || null;
        targetPath = key;
      }
    }

    // Check Netflix channels
    if (!targetCategoryId) {
      const netflixMatch = NETFLIX_CHANNELS.find(n => n.name === channel.name);
      if (netflixMatch) {
        const key = `NETFLIX/${netflixMatch.subcategory}`;
        targetCategoryId = categoryCache.get(key) || null;
        targetPath = key;
      }
    }

    // Check AL prefix patterns for Arabic
    if (!targetCategoryId) {
      const isArabic = AL_PATTERNS.some(p => channel.name.startsWith(p));
      if (isArabic) {
        const key = 'CHAÎNES ARABES/GÉNÉRALISTE';
        targetCategoryId = categoryCache.get(key) || null;
        targetPath = key;
      }
    }

    // Check pattern rules
    if (!targetCategoryId) {
      for (const rule of MOVE_RULES) {
        const matches = rule.patterns.some(p => channel.name.startsWith(p));
        if (matches) {
          const key = `${rule.targetCountry}/${rule.targetSubcategory}`;
          targetCategoryId = categoryCache.get(key) || null;
          targetPath = key;
          break;
        }
      }
    }

    // Check for African country names in channel name
    if (!targetCategoryId) {
      const africanCountries = ['GHANA', 'NIGERIA', 'KENYA', 'CAMEROUN', 'ANGOLA', 'GAMBIA', 'RAWANDA', 'GUINEA', 'UGANDA', 'SOMALIA', 'ETHIOPIA'];
      const isAfrican = africanCountries.some(c => channel.name.includes(c));
      if (isAfrican) {
        const key = 'AFRIQUE/GÉNÉRALISTE';
        targetCategoryId = categoryCache.get(key) || null;
        targetPath = key;
      }
    }

    if (targetCategoryId) {
      await prisma.stream.update({
        where: { id: channel.id },
        data: { categoryId: targetCategoryId },
      });

      // Also update StreamCategory junction table
      await prisma.streamCategory.deleteMany({
        where: { streamId: channel.id },
      });
      await prisma.streamCategory.create({
        data: {
          streamId: channel.id,
          categoryId: targetCategoryId,
          isPrimary: true,
        },
      });

      moveLog.push({
        id: channel.id,
        name: channel.name,
        from: 'FRANCE/GÉNÉRALISTE',
        to: targetPath,
      });
      movedCount++;
    } else {
      skippedCount++;
    }
  }

  // Step 7: Summary
  console.log('\n=== Migration Summary ===');
  console.log(`Total channels processed: ${channels.length}`);
  console.log(`Channels moved: ${movedCount}`);
  console.log(`Channels kept in FRANCE/GÉNÉRALISTE: ${skippedCount}`);

  // Group moves by destination
  const movesByDestination: Map<string, number> = new Map();
  for (const move of moveLog) {
    const count = movesByDestination.get(move.to) || 0;
    movesByDestination.set(move.to, count + 1);
  }

  console.log('\nMoves by destination:');
  for (const [dest, count] of Array.from(movesByDestination.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dest}: ${count} channels`);
  }

  // Verify remaining channels
  const remainingChannels = await prisma.stream.count({
    where: { categoryId: franceGeneraliste.id },
  });
  console.log(`\nRemaining in FRANCE/GÉNÉRALISTE: ${remainingChannels}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
