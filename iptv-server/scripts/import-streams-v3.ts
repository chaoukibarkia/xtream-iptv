import { PrismaClient, StreamType } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * Import streams from Xtream API v3
 * - Better country detection for Arabic channels (Tunisia, Algeria, Morocco, etc.)
 * - Clean stream names
 * - Proper categorization
 */

const XTREAM_CONFIG = {
  baseUrl: 'http://ultimeiptv.net',
  username: 'nounou',
  password: 'tt@S++2072',
};

// Tunisian channel keywords
const TUNISIA_KEYWORDS = [
  'TUNISI', 'ETTOUNSI', 'HIWAR', 'NESMA', 'ATTESSIA', 'HANNIBAL', 
  'ZAYTOUNA', 'TUNISNA', 'JANOUBIYYA', 'WATANIYA 1', 'WATANIYA 2',
  'NESSMA', 'TELVZA', 'ZITOUNA', 'CARTHAGE', 'TUNIS'
];

// Algerian channel keywords  
const ALGERIA_KEYWORDS = [
  'ALGERI', 'ALGER', 'ECHOUROUK', 'ENNAHAR', 'DZAIR', 'SAMIRA',
  'BERBERE', 'BAHIA', 'HEDDAF', 'CORAN-ALGER', 'CANAL ALGERIA',
  'WATANIA ALGERIE', 'EL BILAD', 'NUMIDIA', 'A3', 'ENTV'
];

// Moroccan channel keywords
const MOROCCO_KEYWORDS = [
  'MAROC', 'MOROCCO', 'MEDI1', 'MEDI 1', '2M', 'ALAOULA', 'ARRYADIA',
  'TAMAZIGHT', 'LAAYOUNE', 'AFLAM', 'MAGHRIB', 'CHADA', 'RTM'
];

// Egyptian channel keywords
const EGYPT_KEYWORDS = [
  'EGYPT', 'MASRI', 'CAIRO', 'CBC', 'MBC MASR', 'ALNAHAR', 'ALHAYAT',
  'MEHWAR', 'TEN', 'SADA EL BALAD', 'DMC', 'ON E', 'DREAM', 'NILE'
];

// Lebanese channel keywords
const LEBANON_KEYWORDS = [
  'LIBAN', 'LEBANON', 'LBC', 'MTV LIBAN', 'OTV', 'FUTURE', 'NBN',
  'JADEED', 'MANAR', 'TELE LUMIERE'
];

// Iraqi channel keywords
const IRAQ_KEYWORDS = [
  'IRAQ', 'SHARQIYA', 'IRAQIA', 'KURDISTAN', 'BAGHDAD', 'DIJLAH'
];

// Syrian channel keywords
const SYRIA_KEYWORDS = [
  'SYRIA', 'SOURI', 'DAMASCUS', 'SAMA', 'ORIENT', 'SYRIA DRAMA'
];

// Saudi/Gulf keywords (for AR: prefix when not matched elsewhere)
const GULF_KEYWORDS = [
  'SAUDI', 'ROTANA', 'MBC', 'DUBAI', 'ABU DHABI', 'SHARJAH',
  'QATAR', 'KUWAIT', 'BAHRAIN', 'OMAN', 'ALJAZEERA', 'AL JAZEERA',
  'BEIN', 'OSN', 'ART', 'ALARABIYA', 'SKY NEWS ARABIA'
];

// Country code prefix patterns
const PREFIX_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /^FR[:\-\s]/i, code: 'FR' },
  { pattern: /^US[:\-\s]/i, code: 'US' },
  { pattern: /^UK[:\-\s]/i, code: 'GB' },
  { pattern: /^GB[:\-\s]/i, code: 'GB' },
  { pattern: /^DE[:\-\s]/i, code: 'DE' },
  { pattern: /^IT[:\-\s]/i, code: 'IT' },
  { pattern: /^ES[:\-\s]/i, code: 'ES' },
  { pattern: /^PT[:\-\s]/i, code: 'PT' },
  { pattern: /^NL[:\-\s]/i, code: 'NL' },
  { pattern: /^BE[:\-\s]/i, code: 'BE' },
  { pattern: /^CA[:\-\s]/i, code: 'CA' },
  { pattern: /^TR[:\-\s]/i, code: 'TR' },
  { pattern: /^PL[:\-\s]/i, code: 'PL' },
  { pattern: /^IN[:\-\s]/i, code: 'IN' },
  { pattern: /^PK[:\-\s]/i, code: 'PK' },
  { pattern: /^AF[:\-\s]/i, code: 'AF' }, // Afghanistan
];

// Adult content keywords
const ADULT_KEYWORDS = [
  'XXX', 'ADULT', 'PORN', 'SEXY', 'EROTIC', 'PLAYBOY', 'PENTHOUSE',
  'BRAZZERS', 'NAUGHTY', 'HUSTLER', 'VIVID', 'PRIVATE', 'REDLIGHT',
  'EXTASY', 'VISIT-X', 'JASMIN', 'CAMS', 'WEBCAM', 'BABESTATION',
  'SPICE', 'LEO TV', 'BLONDE', 'BRUNETTE', 'MILF', 'TEEN ',
  'GANGBANG', 'THREESOME', 'BLOWJOB', 'HARDCORE', 'INTERRACIAL',
  'GAY ', 'LESBIAN', 'FETISH', 'BDSM', 'BONDAGE', 'BIKINI',
  'NUDE', 'NAKED', 'HOT GIRLS', 'BABES', 'STRIP', 'DORCEL',
  'PINK', 'DESIRE', 'ADULTIPTV', 'MIAMI TV'
];

// beIN Sports patterns
const BEIN_PATTERNS = [/BEIN\s*SPORT/i, /BEIN\s*HD/i, /BEIN\s*MAX/i, /BEINSPORT/i];

// Category keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  SPORTS: ['SPORT', 'ESPN', 'EUROSPORT', 'FOOT', 'FOOTBALL', 'TENNIS', 'BASKET', 'NBA', 'NFL', 'GOLF', 'RACING', 'UFC', 'BOXING', 'CRICKET', 'RUGBY', 'F1', 'DAZN', 'SUPERSPORT', 'FOX SPORT', 'SKY SPORT', 'RMC SPORT', 'CANAL SPORT', 'ARRYADIA'],
  CINÉMA: ['CINEMA', 'MOVIE', 'FILM', 'CINE', 'MAX', 'TCM', 'PARAMOUNT', 'ACTION', 'THRILLER', 'HORROR', 'COMEDY', 'DRAMA', 'ROMANCE', 'SCI-FI', 'SYFY', 'AMC', 'TNT', 'CANAL+ CINEMA', 'OCS', 'AFLAM'],
  INFO: ['NEWS', 'INFO', 'ALJAZEERA', 'AL JAZEERA', 'BBC NEWS', 'CNN', 'SKY NEWS', 'FRANCE24', 'CNEWS', 'BFMTV', 'BFM', 'EURONEWS', 'RT ', 'FOXNEWS', 'MSNBC', 'BLOOMBERG', 'ALARABIYA', 'ENNAHAR'],
  ENFANTS: ['KIDS', 'ENFANT', 'CARTOON', 'TOON', 'DISNEY', 'NICKELODEON', 'NICK', 'BARAEM', 'JEEM', 'BABY', 'JUNIOR', 'GULLI', 'CHILDREN', 'BOOMERANG', 'KARAMEESH', 'SPACETOON'],
  MUSIQUE: ['MUSIC', 'MUSIQUE', 'MTV', 'MCM', 'MELODY', 'MAZZIKA', 'TRACE', 'MEZZO', 'VH1', 'CLUBBING', 'ROTANA MUSIC'],
  DOCUMENTAIRES: ['DOCUMENTARY', 'DOCUMENTAIRE', 'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NAT GEO', 'HISTORY', 'SCIENCE', 'NATURE', 'ANIMAL', 'PLANETE', 'QUEST'],
  RELIGIEUX: ['QURAN', 'CORAN', 'ISLAM', 'SUNNAH', 'MECCA', 'MAKKAH', 'IQRAA', 'AZHARI', 'RELIGIOUS', 'RISALAH', 'ZAYTOUNA', 'ZITOUNA'],
  SÉRIES: ['SERIE', 'SERIES', 'DRAMA', 'SHAHID', 'OSN SERIE', 'FOX LIFE', 'CBS', 'NBC', 'ABC', 'HBO', 'SHOWTIME'],
  DIVERTISSEMENT: ['ENTERTAINMENT', 'VARIETY', 'COMEDY', 'FUN', 'LIFESTYLE', 'REALITY', 'TLC', 'BRAVO', 'FOOD', 'COOKING'],
};

interface XtreamStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  tv_archive: number;
  tv_archive_duration: number;
}

function cleanStreamName(name: string): string {
  return name
    .toUpperCase()
    .replace(/^(VIP|PREMIUM|NEW|HD|FHD|4K|UHD|H265|HEVC|SD)[:\-\s]*/gi, '')
    .replace(/[ᴴᴰ]/g, 'HD')
    .replace(/\bFHD\b/gi, 'HD')
    .replace(/\b4K\b/gi, 'UHD')
    .replace(/\bH\.?265\b/gi, '')
    .replace(/\bHEVC\b/gi, '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[^\w\s\-\.\+\&\'\"]/g, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+(HD|SD|FHD|UHD|4K|HQ|LQ)\s*$/gi, '')
    .replace(/\s*;\s*$/g, '')
    .trim();
}

function isAdultContent(name: string): boolean {
  const upperName = name.toUpperCase();
  return ADULT_KEYWORDS.some(keyword => upperName.includes(keyword));
}

function isBeInSports(name: string): boolean {
  return BEIN_PATTERNS.some(pattern => pattern.test(name));
}

function containsAny(name: string, keywords: string[]): boolean {
  const upperName = name.toUpperCase();
  return keywords.some(keyword => upperName.includes(keyword));
}

function detectCountryCode(originalName: string, cleanName: string): string {
  const upperOriginal = originalName.toUpperCase();
  const upperClean = cleanName.toUpperCase();
  
  // First check prefix patterns (FR:, US:, UK:, etc.)
  for (const { pattern, code } of PREFIX_PATTERNS) {
    if (pattern.test(upperOriginal)) {
      return code;
    }
  }
  
  // For AR: prefix, detect specific Arab country by channel name
  if (/^AR[:\-\s]/i.test(upperOriginal)) {
    if (containsAny(upperClean, TUNISIA_KEYWORDS)) return 'TN';
    if (containsAny(upperClean, ALGERIA_KEYWORDS)) return 'DZ';
    if (containsAny(upperClean, MOROCCO_KEYWORDS)) return 'MA';
    if (containsAny(upperClean, EGYPT_KEYWORDS)) return 'EG';
    if (containsAny(upperClean, LEBANON_KEYWORDS)) return 'LB';
    if (containsAny(upperClean, IRAQ_KEYWORDS)) return 'IQ';
    if (containsAny(upperClean, SYRIA_KEYWORDS)) return 'SY';
    // Default Arabic to Saudi Arabia / Gulf
    return 'SA';
  }
  
  // Check for country keywords in name (without prefix)
  if (containsAny(upperClean, TUNISIA_KEYWORDS)) return 'TN';
  if (containsAny(upperClean, ALGERIA_KEYWORDS)) return 'DZ';
  if (containsAny(upperClean, MOROCCO_KEYWORDS)) return 'MA';
  if (containsAny(upperClean, EGYPT_KEYWORDS)) return 'EG';
  if (containsAny(upperClean, LEBANON_KEYWORDS)) return 'LB';
  if (containsAny(upperClean, IRAQ_KEYWORDS)) return 'IQ';
  if (containsAny(upperClean, SYRIA_KEYWORDS)) return 'SY';
  if (containsAny(upperClean, GULF_KEYWORDS)) return 'SA';
  
  // Default to France
  return 'FR';
}

function detectCategoryType(name: string): string {
  const upperName = name.toUpperCase();
  let bestMatch = { category: 'GÉNÉRALISTE', score: 0 };
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (upperName.includes(keyword)) {
        score += keyword.length;
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { category, score };
    }
  }
  
  return bestMatch.category;
}

function getBeInSubcategory(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('MAX')) return 'BEIN MAX';
  if (upperName.includes('HD')) return 'BEIN HD';
  return 'BEIN SD';
}

function getAdultSubcategory(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('CAM') || upperName.includes('LIVE')) return 'LIVE CAMS';
  if (upperName.includes('PREMIUM') || upperName.includes('VIP')) return 'PREMIUM';
  return 'GÉNÉRALISTE';
}

function getDefaultLogoUrl(name: string, streamIcon: string): string {
  if (streamIcon && streamIcon.startsWith('http')) {
    return streamIcon;
  }
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  return `/media/logos/${slug}.png`;
}

async function ensureCountryExists(countryCode: string, countryName: string): Promise<void> {
  const existing = await prisma.category.findFirst({
    where: { countryCode, type: StreamType.LIVE, parentId: null }
  });
  
  if (!existing) {
    console.log(`  Creating country: ${countryName} [${countryCode}]`);
    
    const parent = await prisma.category.create({
      data: {
        name: countryName,
        type: StreamType.LIVE,
        countryCode,
        parentId: null,
        sortOrder: 100,
        isActive: true,
      }
    });
    
    // Create subcategories
    const subcategories = [
      'GÉNÉRALISTE', 'SPORTS', 'INFO', 'CINÉMA', 'SÉRIES',
      'DIVERTISSEMENT', 'ENFANTS', 'DOCUMENTAIRES', 'MUSIQUE', 'RELIGIEUX'
    ];
    
    for (let i = 0; i < subcategories.length; i++) {
      await prisma.category.create({
        data: {
          name: subcategories[i],
          type: StreamType.LIVE,
          parentId: parent.id,
          sortOrder: i + 1,
          isActive: true,
        }
      });
    }
  }
}

async function main() {
  console.log('═'.repeat(70));
  console.log('   🚀 XTREAM API IMPORT v3 - Better Arabic Country Detection');
  console.log('═'.repeat(70));
  console.log('');

  try {
    // Ensure required countries exist
    console.log('📁 Ensuring all required countries exist...\n');
    
    const countries = [
      { code: 'TN', name: 'TUNISIE' },
      { code: 'DZ', name: 'ALGÉRIE' },
      { code: 'MA', name: 'MAROC' },
      { code: 'EG', name: 'ÉGYPTE' },
      { code: 'LB', name: 'LIBAN' },
      { code: 'IQ', name: 'IRAK' },
      { code: 'SY', name: 'SYRIE' },
      { code: 'SA', name: 'ARABIE SAOUDITE' },
      { code: 'AF', name: 'AFGHANISTAN' },
    ];
    
    for (const { code, name } of countries) {
      await ensureCountryExists(code, name);
    }
    
    // Fetch streams
    console.log('\n📡 Fetching streams from Xtream API...');
    const response = await axios.get<XtreamStream[]>(
      `${XTREAM_CONFIG.baseUrl}/player_api.php`,
      {
        params: {
          username: XTREAM_CONFIG.username,
          password: XTREAM_CONFIG.password,
          action: 'get_live_streams',
        },
      }
    );
    
    const xtreamStreams = response.data;
    console.log(`   ✅ Fetched ${xtreamStreams.length} streams\n`);
    
    // Load category mappings
    console.log('📁 Loading category mappings...');
    const categories = await prisma.category.findMany({
      where: { type: StreamType.LIVE },
      include: { parent: true },
    });
    
    const categoryMappings = new Map<string, Map<string, number>>();
    for (const cat of categories) {
      if (cat.parentId && cat.parent) {
        const parentCode = cat.parent.countryCode || cat.parent.name;
        if (!categoryMappings.has(parentCode)) {
          categoryMappings.set(parentCode, new Map());
        }
        categoryMappings.get(parentCode)!.set(cat.name, cat.id);
      }
    }
    console.log(`   ✅ Loaded ${categoryMappings.size} country mappings\n`);
    
    // Get special categories
    const adultParent = await prisma.category.findFirst({
      where: { name: 'ADULTES', type: StreamType.LIVE, parentId: null },
      include: { children: true },
    });
    const adultes = new Map<string, number>();
    if (adultParent) {
      for (const child of adultParent.children) {
        adultes.set(child.name, child.id);
      }
    }
    
    const beinParent = await prisma.category.findFirst({
      where: { name: 'BEIN SPORTS', type: StreamType.LIVE, parentId: null },
      include: { children: true },
    });
    const bein = new Map<string, number>();
    if (beinParent) {
      for (const child of beinParent.children) {
        bein.set(child.name, child.id);
      }
    }
    
    // Get origin server
    const originServer = await prisma.server.findFirst({ where: { name: 's02' } });
    if (!originServer) throw new Error('Origin server s02 not found');
    console.log(`📡 Using origin server: ${originServer.name} (ID: ${originServer.id})\n`);
    
    // Get default category
    const defaultCategoryId = categoryMappings.get('FR')?.get('GÉNÉRALISTE');
    if (!defaultCategoryId) throw new Error('Default category FR/GÉNÉRALISTE not found');
    
    // Process streams
    console.log('🔄 Processing streams...\n');
    
    let imported = 0;
    let adultCount = 0;
    let beinCount = 0;
    let skipped = 0;
    const countryStats = new Map<string, number>();
    const errors: string[] = [];
    
    for (const xtreamStream of xtreamStreams) {
      try {
        const cleanName = cleanStreamName(xtreamStream.name);
        
        if (!cleanName || cleanName.length < 2) {
          skipped++;
          continue;
        }
        
        let categoryId: number;
        let countryCode = '';
        
        // Check if adult content
        if (isAdultContent(xtreamStream.name) || isAdultContent(cleanName)) {
          const subcat = getAdultSubcategory(cleanName);
          categoryId = adultes.get(subcat) || adultes.get('GÉNÉRALISTE')!;
          adultCount++;
          countryCode = 'XX';
        }
        // Check if beIN Sports
        else if (isBeInSports(xtreamStream.name) || isBeInSports(cleanName)) {
          const subcat = getBeInSubcategory(cleanName);
          categoryId = bein.get(subcat) || bein.get('BEIN HD')!;
          beinCount++;
          countryCode = 'SP';
        }
        // Regular stream
        else {
          countryCode = detectCountryCode(xtreamStream.name, cleanName);
          const categoryType = detectCategoryType(cleanName);
          
          const countryMapping = categoryMappings.get(countryCode);
          if (countryMapping) {
            categoryId = countryMapping.get(categoryType) || 
                        countryMapping.get('GÉNÉRALISTE') ||
                        defaultCategoryId;
          } else {
            categoryId = categoryMappings.get('FR')?.get(categoryType) || defaultCategoryId;
            countryCode = 'FR';
          }
        }
        
        // Update stats
        countryStats.set(countryCode, (countryStats.get(countryCode) || 0) + 1);
        
        const logoUrl = getDefaultLogoUrl(cleanName, xtreamStream.stream_icon);
        
        // Create stream
        const stream = await prisma.stream.create({
          data: {
            name: cleanName,
            streamType: StreamType.LIVE,
            categoryId,
            sourceUrl: `${XTREAM_CONFIG.baseUrl}/live/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${xtreamStream.stream_id}.ts`,
            logoUrl,
            epgChannelId: xtreamStream.epg_channel_id || null,
            isActive: true,
            tvArchive: xtreamStream.tv_archive === 1,
            tvArchiveDuration: xtreamStream.tv_archive_duration || 0,
            originServerId: originServer.id,
            sortOrder: xtreamStream.num,
          },
        });
        
        await prisma.streamCategory.create({
          data: {
            streamId: stream.id,
            categoryId,
            isPrimary: true,
          },
        });
        
        imported++;
        
        if (imported % 500 === 0) {
          console.log(`   📊 Progress: ${imported} imported`);
        }
        
      } catch (error: any) {
        errors.push(`${xtreamStream.name}: ${error.message}`);
        skipped++;
      }
    }
    
    // Final report
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('   📊 IMPORT SUMMARY');
    console.log('═'.repeat(70));
    console.log('');
    console.log(`   ✅ Total imported:    ${imported}`);
    console.log(`   🔞 Adult content:     ${adultCount}`);
    console.log(`   ⚽ beIN Sports:       ${beinCount}`);
    console.log(`   ⏭️  Skipped:           ${skipped}`);
    console.log(`   ❌ Errors:            ${errors.length}`);
    
    console.log('\n   📊 By Country:');
    const sortedStats = [...countryStats.entries()].sort((a, b) => b[1] - a[1]);
    for (const [code, count] of sortedStats) {
      console.log(`      ${code}: ${count}`);
    }
    
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('   ✅ Import completed!');
    console.log('═'.repeat(70));
    
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
