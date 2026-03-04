import { PrismaClient, StreamType } from '@prisma/client';
import { createWriteStream } from 'fs';
import { resolve } from 'path';

const prisma = new PrismaClient();

// Configuration
const DRY_RUN = process.env.DRY_RUN === 'true';
const BACKUP_DIR = '/tmp/iptv_migration_backup';

// Interfaces
interface ClassifiedStream {
  id: number;
  originalName: string;
  cleanName: string;
  country: string;
  subcategory: string;
  oldCategoryId: number;
}

interface CategoryMap {
  [key: string]: {
    id: number;
    name: string;
    subcategories: { [key: string]: number };
  };
}

// Base de données des chaînes connues
const KNOWN_CHANNELS: { [key: string]: string[] } = {
  'ARABIE SAOUDITE': ['saudi', 'ksa', 'ajial', 'rotana', 'sbc', 'makkah', 'madinah', 'saudiya'],
  'ÉGYPTE': ['nile', 'cbc', 'dmc', 'ontv', 'ontime', 'mehwer', 'alnas', 'alhayat', 'ten', 'maspero', 'panorama', 'nahar', 'zamalek', 'ahly'],
  'LIBAN': ['lbc', 'mtv lebanon', 'nbn', 'future', 'jadeed', 'otv', 'murr'],
  'TUNISIE': ['tunisna', 'hannibal', 'carthage', 'nessma', 'attessia', 'elhiwar ettounsi'],
  'MAROC': ['2m', 'medi.?1', 'arriadia', 'tamazight', 'assadissa', 'alaoula', 'laayoune'],
  'ALGÉRIE': ['dzair', 'echourouk', 'ennahar', 'bilad', 'canal algeria', 'samira', 'beur'],
  'ÉMIRATS ARABES UNIS': ['dubai', 'abu.?dhabi', 'sharjah', 'alalam', 'sama.?dubai', 'noor.?dubai'],
  'QATAR': ['qatar', 'alkass', 'al.?kass'],
  'IRAK': ['iraq', 'dijlah', 'baghdad', 'alsharqiya', 'alhurra'],
  'SYRIE': ['syria', 'halab', 'rudaw'],
  'KOWEÏT': ['kuwait', 'kuweit', 'ktv'],
  'LIBYE': ['libya', 'libya.?218'],
  'PALESTINE': ['palestine', 'falastin', 'alaqsa'],
  'SOUDAN': ['sudan', 'blue.?nile'],
  'FRANCE': ['\\btf1\\b', '\\bm6\\b', 'france.?\\d', 'canal\\+', 'arte', 'gulli', 'bfm', 'cnews', 'lci', 'rmc', 'eurosport', 'equipe', 'c8', 'w9', 'nrj12', 'paris.?premiere'],
  'ROYAUME-UNI': ['\\bbbc\\b', '\\bitv\\b', 'channel.?[45]', 'sky.?uk', 'ch5'],
  'ALLEMAGNE': ['\\bzdf\\b', '\\bard\\b', '\\brtl\\b', 'pro7', 'sat1', 'vox', 'bundesliga', 'sky.?de'],
  'ITALIE': ['\\brai\\b', 'mediaset', 'calcio', 'serie.?a', 'sky.?italia', 'canale.?5'],
  'ESPAGNE': ['\\btve\\b', 'antena.?3', 'la.?sexta', 'cuatro', 'telecinco', 'laliga', 'movistar'],
  'TURQUIE': ['\\btrt\\b', 'kanal', 'show.?tv', 'star.?tv', '\\batv\\b', 'fox.?turk', 'power.?turk'],
  'PORTUGAL': ['\\brtp\\b', '\\bsic\\b', '\\btvi\\b', 'sport.?tv'],
  'BELGIQUE': ['rtbf', 'vtm', 'een', 'canvas'],
  'PAYS-BAS': ['rtl.?nl', 'npo', 'veronica', 'sbs6'],
  'POLOGNE': ['tvp', 'polsat', 'tvn'],
  'ÉTATS-UNIS': ['\\bnbc\\b', '\\babc\\b', '\\bcbs\\b', '\\bfox\\b', 'espn', '\\bhbo\\b', 'showtime', 'starz', '\\bfx\\b'],
  'CANADA': ['\\bcbc\\b', '\\bctv\\b', 'global', 'citytv', '\\btva\\b', '\\btsn\\b', '\\brds\\b'],
  'INDE': ['star', 'zee', 'sony', 'colors', 'sun.?tv', 'vijay', 'sab', 'hum'],
  'PAKISTAN': ['\\bptv\\b', '\\bgeo\\b', '\\bary\\b', 'samaa', 'express', 'dunya'],
  'BANGLADESH': ['\\bbtv\\b', 'atn bangla', '\\bntv\\b', 'channel.?i'],
};

// Patterns de sous-catégories
const SUBCATEGORY_PATTERNS: { [key: string]: string[] } = {
  'SPORTS': ['\\bsport', 'football', 'calcio', 'liga', 'bundesliga', 'premier.?league', 'ksa.?sport', 'ad.?sport', 'equipe', 'tsn', 'rds', 'sky.?sport'],
  'INFO': ['\\bnews', '\\binfo', 'akhbar', 'khabar', 'ekhbar', 'sky.?news', 'msnbc'],
  'CINÉMA': ['cinema', 'cine', 'movie', 'film', 'aflam', 'premiere', 'fox.?movies'],
  'DOCUMENTAIRES': ['document', 'natgeo', 'nat.?geo', 'history', 'histoire', 'animal.?planet', 'science', 'investigation'],
  'ENFANTS': ['\\bkids', 'enfant', 'cartoon', 'disney', 'junior', 'gulli', 'spacetoon', 'toyor', 'mickey', 'nickelodeon', 'nick', 'cocuk', 'bambini', 'karameesh'],
  'MUSIQUE': ['\\bmusic', '\\bmtv\\b', 'trace', 'melody', 'mazzika', 'rotana.?music', 'vevo', 'vh1'],
  'SÉRIES': ['\\bseries', '\\bdrama', 'shahid', 'roya', 'netflix'],
  'CORAN': ['quran', 'coran', 'قرآن', 'iqraa', 'alfath', 'holy', 'makkah.?live', 'kaaba'],
  'RELIGIEUX': ['religious', 'religieux', 'islam', 'catholic', 'church', 'chrétien', 'noursat', 'sat.?7', 'emci', 'kto', 'ewtn'],
  'GÉNÉRALISTE': [],
};

/**
 * Nettoie et convertit un nom en MAJUSCULES
 */
function cleanAndUppercase(name: string): string {
  // Retirer les préfixes techniques
  let cleaned = name.replace(/^(CSAT-AF|A\.F\||AF \||AR-|AR_|AR\||FR-|FR_|FR\||UK-|DE-|DE_|IT-|IT_|TR-|PL-|IN-|IN_|PK-|OS-|OSN_|OSN-)\s*/i, '');
  
  // Retirer les séparateurs multiples et marqueurs
  cleaned = cleaned.replace(/[-_|]+/g, ' ');
  cleaned = cleaned.replace(/\s*(\/\/\/|---|\\|\\|)\s*/g, ' ');
  
  // Nettoyer espaces multiples
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Convertir en MAJUSCULES
  return cleaned.toUpperCase();
}

/**
 * Détecte si une chaîne est beIN Sports
 */
function isBeInSports(name: string): boolean {
  return /bein/i.test(name);
}

/**
 * Détecte si une chaîne est pan-arabe (MBC, OSN, Rotana, Al Jazeera)
 */
function isPanArabChannel(name: string): boolean {
  const panArabKeywords = ['\\bmbc', '\\bosn', 'rotana', 'aljazeera', 'al.?jazeera', 'shahid'];
  return panArabKeywords.some(keyword => new RegExp(keyword, 'i').test(name));
}

/**
 * Détecte si une chaîne est une info internationale multilingue
 */
function isInternationalNews(name: string): boolean {
  const newsKeywords = ['france.?24', '\\bbbc\\b', '\\bcnn\\b', 'euronews', '\\bdw\\b'];
  return newsKeywords.some(keyword => new RegExp(keyword, 'i').test(name));
}

/**
 * Détecte si une chaîne est adulte
 */
function isAdultChannel(name: string): boolean {
  const adultKeywords = ['adult', 'xxx', 'sex', 'porn', 'erox', 'babes', 'jasmin', 'visit-x'];
  return adultKeywords.some(keyword => name.toLowerCase().includes(keyword));
}

/**
 * Détecte la langue d'une chaîne d'info internationale
 */
function detectNewsLanguage(name: string): string {
  const nameLower = name.toLowerCase();
  
  if (/arabic|arabe|ar-|عربي/i.test(name)) return 'ARABE';
  if (/french|français|francais|fr-/i.test(name)) return 'FRANÇAIS';
  if (/english|anglais|en-/i.test(name)) return 'ANGLAIS';
  if (/spanish|español|espanol|es-/i.test(name)) return 'ESPAGNOL';
  
  return 'AUTRES LANGUES';
}

/**
 * Détecte le pays d'origine d'une chaîne
 */
function detectCountry(name: string): string {
  const nameLower = name.toLowerCase();
  
  // Vérifier les chaînes connues
  for (const [country, keywords] of Object.entries(KNOWN_CHANNELS)) {
    for (const keyword of keywords) {
      if (new RegExp(keyword, 'i').test(nameLower)) {
        return country;
      }
    }
  }
  
  // Vérifier les préfixes de pays
  const prefixMap: { [key: string]: string } = {
    '^fr[-_]': 'FRANCE',
    '^uk[-_]': 'ROYAUME-UNI',
    '^de[-_]': 'ALLEMAGNE',
    '^it[-_]': 'ITALIE',
    '^es[-_]': 'ESPAGNE',
    '^tr[-_]': 'TURQUIE',
    '^pt[-_]': 'PORTUGAL',
    '^pl[-_]': 'POLOGNE',
    '^nl[-_]': 'PAYS-BAS',
    '^us[-_]': 'ÉTATS-UNIS',
    '^ca[-_]': 'CANADA',
    '^in[-_]': 'INDE',
    '^pk[-_]': 'PAKISTAN',
  };
  
  for (const [pattern, country] of Object.entries(prefixMap)) {
    if (new RegExp(pattern, 'i').test(nameLower)) {
      return country;
    }
  }
  
  return 'INTERNATIONAL';
}

/**
 * Détecte la sous-catégorie d'une chaîne
 */
function detectSubcategory(name: string): string {
  const nameLower = name.toLowerCase();
  
  // Ordre de priorité pour éviter les faux positifs
  const priorityOrder = ['CORAN', 'SPORTS', 'INFO', 'ENFANTS', 'DOCUMENTAIRES', 'CINÉMA', 'MUSIQUE', 'SÉRIES', 'RELIGIEUX'];
  
  for (const category of priorityOrder) {
    const patterns = SUBCATEGORY_PATTERNS[category] || [];
    for (const pattern of patterns) {
      if (new RegExp(pattern, 'i').test(nameLower)) {
        return category;
      }
    }
  }
  
  return 'GÉNÉRALISTE';
}

/**
 * Détecte la sous-catégorie beIN
 */
function detectBeInSubcategory(name: string): string {
  const nameLower = name.toLowerCase();
  
  if (/sport/i.test(nameLower)) return 'SPORTS';
  if (/movie|cinema/i.test(nameLower)) return 'CINÉMA';
  if (/series|drama/i.test(nameLower)) return 'SÉRIES';
  if (/baraem|jeem|junior/i.test(nameLower)) return 'ENFANTS';
  
  return 'SPORTS'; // Par défaut pour beIN
}

/**
 * Classifie un stream
 */
function classifyStream(stream: { id: number; name: string; categoryId: number }): ClassifiedStream {
  let country = 'INTERNATIONAL';
  let subcategory = 'GÉNÉRALISTE';
  
  // Détection par priorité
  if (isAdultChannel(stream.name)) {
    country = 'ADULTES';
    subcategory = 'ADULTES';
  } else if (isBeInSports(stream.name)) {
    country = 'BEIN SPORTS';
    subcategory = detectBeInSubcategory(stream.name);
  } else if (isPanArabChannel(stream.name)) {
    country = 'CHAÎNES ARABES';
    subcategory = detectSubcategory(stream.name);
  } else if (isInternationalNews(stream.name)) {
    country = 'INFO INTERNATIONALE';
    subcategory = detectNewsLanguage(stream.name);
  } else {
    country = detectCountry(stream.name);
    subcategory = detectSubcategory(stream.name);
  }
  
  const cleanName = cleanAndUppercase(stream.name);
  
  return {
    id: stream.id,
    originalName: stream.name,
    cleanName,
    country,
    subcategory,
    oldCategoryId: stream.categoryId,
  };
}

/**
 * Backup des données avant migration
 */
async function backupDatabase(): Promise<void> {
  console.log('📦 Création du backup de la base de données...');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `${BACKUP_DIR}/backup_${timestamp}.sql`;
  
  // Créer le répertoire de backup
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_migration_backup_categories" AS SELECT * FROM "Category";
  `);
  
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_migration_backup_streams" AS SELECT * FROM "Stream";
  `);
  
  console.log('✅ Backup créé dans les tables _migration_backup_*');
}

/**
 * Crée les nouvelles catégories
 */
async function createCategories(): Promise<CategoryMap> {
  console.log('📁 Création des nouvelles catégories...');
  
  const categoryMap: CategoryMap = {};
  
  // Liste des pays
  const countries = [
    'FRANCE', 'TUNISIE', 'MAROC', 'ALGÉRIE', 'ARABIE SAOUDITE', 'ÉGYPTE',
    'LIBAN', 'ÉMIRATS ARABES UNIS', 'QATAR', 'IRAK', 'SYRIE', 'KOWEÏT',
    'LIBYE', 'PALESTINE', 'SOUDAN', 'ROYAUME-UNI', 'ÉTATS-UNIS', 'ALLEMAGNE',
    'ITALIE', 'ESPAGNE', 'TURQUIE', 'PORTUGAL', 'BELGIQUE', 'PAYS-BAS',
    'POLOGNE', 'INDE', 'PAKISTAN', 'CANADA',
  ];
  
  // Catégories spéciales
  const specialCategories = ['CHAÎNES ARABES', 'BEIN SPORTS', 'INFO INTERNATIONALE', 'ADULTES', 'INTERNATIONAL'];
  
  // Sous-catégories standard
  const standardSubcategories = ['SPORTS', 'INFO', 'CINÉMA', 'DOCUMENTAIRES', 'ENFANTS', 'MUSIQUE', 'GÉNÉRALISTE', 'CORAN', 'RELIGIEUX', 'SÉRIES'];
  
  // Créer les catégories pays
  for (const country of countries) {
    if (DRY_RUN) {
      console.log(`  [DRY-RUN] Créerait: ${country}`);
      continue;
    }
    
    const parentCategory = await prisma.category.create({
      data: {
        name: country,
        type: StreamType.LIVE,
        parentId: null,
        sortOrder: 0,
        isActive: true,
      },
    });
    
    categoryMap[country] = {
      id: parentCategory.id,
      name: country,
      subcategories: {},
    };
    
    // Créer les sous-catégories
    for (const subcat of standardSubcategories) {
      const subCategory = await prisma.category.create({
        data: {
          name: subcat,
          type: StreamType.LIVE,
          parentId: parentCategory.id,
          sortOrder: 0,
          isActive: true,
        },
      });
      
      categoryMap[country].subcategories[subcat] = subCategory.id;
    }
    
    console.log(`  ✅ ${country} + ${standardSubcategories.length} sous-catégories`);
  }
  
  // Créer CHAÎNES ARABES
  if (!DRY_RUN) {
    const arabChannels = await prisma.category.create({
      data: { name: 'CHAÎNES ARABES', type: StreamType.LIVE, parentId: null, sortOrder: 0, isActive: true },
    });
    
    categoryMap['CHAÎNES ARABES'] = { id: arabChannels.id, name: 'CHAÎNES ARABES', subcategories: {} };
    
    for (const subcat of standardSubcategories) {
      const subCategory = await prisma.category.create({
        data: { name: subcat, type: StreamType.LIVE, parentId: arabChannels.id, sortOrder: 0, isActive: true },
      });
      categoryMap['CHAÎNES ARABES'].subcategories[subcat] = subCategory.id;
    }
    console.log(`  ✅ CHAÎNES ARABES + ${standardSubcategories.length} sous-catégories`);
  }
  
  // Créer BEIN SPORTS
  if (!DRY_RUN) {
    const beinSports = await prisma.category.create({
      data: { name: 'BEIN SPORTS', type: StreamType.LIVE, parentId: null, sortOrder: 0, isActive: true },
    });
    
    categoryMap['BEIN SPORTS'] = { id: beinSports.id, name: 'BEIN SPORTS', subcategories: {} };
    
    const beinSubcats = ['SPORTS', 'CINÉMA', 'SÉRIES', 'ENFANTS'];
    for (const subcat of beinSubcats) {
      const subCategory = await prisma.category.create({
        data: { name: subcat, type: StreamType.LIVE, parentId: beinSports.id, sortOrder: 0, isActive: true },
      });
      categoryMap['BEIN SPORTS'].subcategories[subcat] = subCategory.id;
    }
    console.log(`  ✅ BEIN SPORTS + ${beinSubcats.length} sous-catégories`);
  }
  
  // Créer INFO INTERNATIONALE
  if (!DRY_RUN) {
    const infoIntl = await prisma.category.create({
      data: { name: 'INFO INTERNATIONALE', type: StreamType.LIVE, parentId: null, sortOrder: 0, isActive: true },
    });
    
    categoryMap['INFO INTERNATIONALE'] = { id: infoIntl.id, name: 'INFO INTERNATIONALE', subcategories: {} };
    
    const languages = ['FRANÇAIS', 'ARABE', 'ANGLAIS', 'ESPAGNOL', 'AUTRES LANGUES'];
    for (const lang of languages) {
      const subCategory = await prisma.category.create({
        data: { name: lang, type: StreamType.LIVE, parentId: infoIntl.id, sortOrder: 0, isActive: true },
      });
      categoryMap['INFO INTERNATIONALE'].subcategories[lang] = subCategory.id;
    }
    console.log(`  ✅ INFO INTERNATIONALE + ${languages.length} langues`);
  }
  
  // Créer ADULTES
  if (!DRY_RUN) {
    const adultes = await prisma.category.create({
      data: { name: 'ADULTES', type: StreamType.LIVE, parentId: null, sortOrder: 0, isActive: true },
    });
    
    categoryMap['ADULTES'] = { id: adultes.id, name: 'ADULTES', subcategories: {} };
    
    const adultSubcat = await prisma.category.create({
      data: { name: 'ADULTES', type: StreamType.LIVE, parentId: adultes.id, sortOrder: 0, isActive: true },
    });
    categoryMap['ADULTES'].subcategories['ADULTES'] = adultSubcat.id;
    console.log(`  ✅ ADULTES + 1 sous-catégorie`);
  }
  
  // Créer INTERNATIONAL
  if (!DRY_RUN) {
    const international = await prisma.category.create({
      data: { name: 'INTERNATIONAL', type: StreamType.LIVE, parentId: null, sortOrder: 0, isActive: true },
    });
    
    categoryMap['INTERNATIONAL'] = { id: international.id, name: 'INTERNATIONAL', subcategories: {} };
    
    for (const subcat of standardSubcategories) {
      const subCategory = await prisma.category.create({
        data: { name: subcat, type: StreamType.LIVE, parentId: international.id, sortOrder: 0, isActive: true },
      });
      categoryMap['INTERNATIONAL'].subcategories[subcat] = subCategory.id;
    }
    console.log(`  ✅ INTERNATIONAL + ${standardSubcategories.length} sous-catégories`);
  }
  
  return categoryMap;
}

/**
 * Migre les streams
 */
async function migrateStreams(categoryMap: CategoryMap): Promise<void> {
  console.log('🔄 Migration des streams...');
  
  const streams = await prisma.stream.findMany({
    where: { streamType: StreamType.LIVE },
    select: { id: true, name: true, categoryId: true },
  });
  
  console.log(`   Trouvé ${streams.length} streams à migrer`);
  
  const stats: { [key: string]: number } = {};
  let migrated = 0;
  
  for (const stream of streams) {
    const classified = classifyStream(stream);
    
    // Trouver la nouvelle catégorie
    const countryCategory = categoryMap[classified.country];
    if (!countryCategory) {
      console.warn(`   ⚠️  Pays non trouvé: ${classified.country} pour stream ${stream.id}`);
      continue;
    }
    
    const newCategoryId = countryCategory.subcategories[classified.subcategory];
    if (!newCategoryId) {
      console.warn(`   ⚠️  Sous-catégorie non trouvée: ${classified.subcategory} pour ${classified.country}`);
      continue;
    }
    
    // Mettre à jour le stream
    if (!DRY_RUN) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: {
          name: classified.cleanName,
          categoryId: newCategoryId,
        },
      });
    }
    
    migrated++;
    stats[classified.country] = (stats[classified.country] || 0) + 1;
    
    if (migrated % 100 === 0) {
      console.log(`   Migré ${migrated}/${streams.length} streams...`);
    }
  }
  
  console.log(`\n✅ Migration terminée: ${migrated} streams`);
  console.log('\n📊 Répartition par pays:');
  
  const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
  for (const [country, count] of sorted) {
    console.log(`   ${country}: ${count} streams`);
  }
}

/**
 * Supprime les anciennes catégories
 */
async function deleteOldCategories(): Promise<void> {
  console.log('🗑️  Suppression des anciennes catégories...');
  
  if (DRY_RUN) {
    console.log('  [DRY-RUN] Supprimerait les anciennes catégories');
    return;
  }
  
  // Les anciennes catégories ont des IDs de 5 à 132
  const oldCategoryIds = Array.from({ length: 128 }, (_, i) => i + 5);
  
  const deleted = await prisma.category.deleteMany({
    where: {
      id: { in: oldCategoryIds },
    },
  });
  
  console.log(`✅ ${deleted.count} anciennes catégories supprimées`);
}

/**
 * Validation post-migration
 */
async function validateMigration(): Promise<void> {
  console.log('🔍 Validation post-migration...');
  
  // Compter les streams par catégorie
  const categoriesWithCounts = await prisma.category.findMany({
    where: { type: StreamType.LIVE },
    include: {
      _count: {
        select: { streams: true },
      },
    },
    orderBy: { name: 'asc' },
  });
  
  console.log('\n📊 Streams par catégorie:');
  for (const cat of categoriesWithCounts) {
    if (cat._count.streams > 0) {
      const parentInfo = cat.parentId ? ' (sous-catégorie)' : ' (parent)';
      console.log(`   ${cat.name}${parentInfo}: ${cat._count.streams} streams`);
    }
  }
  
  // Vérifier les streams orphelins
  const orphanStreams = await prisma.stream.count({
    where: {
      streamType: StreamType.LIVE,
      categoryId: { notIn: categoriesWithCounts.map(c => c.id) },
    },
  });
  
  if (orphanStreams > 0) {
    console.warn(`\n⚠️  ATTENTION: ${orphanStreams} streams orphelins détectés!`);
  } else {
    console.log('\n✅ Aucun stream orphelin détecté');
  }
}

/**
 * Main
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     MIGRATION IPTV - RÉORGANISATION PAR PAYS ET CATÉGORIES  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  if (DRY_RUN) {
    console.log('⚠️  MODE DRY-RUN: Aucune modification ne sera effectuée\n');
  }
  
  try {
    // Étape 1: Backup
    if (!DRY_RUN) {
      await backupDatabase();
    }
    
    // Étape 2: Créer les nouvelles catégories
    const categoryMap = await createCategories();
    
    // Étape 3: Migrer les streams
    await migrateStreams(categoryMap);
    
    // Étape 4: Supprimer les anciennes catégories
    await deleteOldCategories();
    
    // Étape 5: Validation
    await validateMigration();
    
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                   MIGRATION TERMINÉE AVEC SUCCÈS             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
  } catch (error) {
    console.error('❌ ERREUR PENDANT LA MIGRATION:', error);
    console.error('\n⚠️  Utilisez les tables de backup pour restaurer:');
    console.error('   _migration_backup_categories');
    console.error('   _migration_backup_streams\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
