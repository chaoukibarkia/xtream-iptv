import { prisma } from '../src/config/database.js';
import { StreamType } from '@prisma/client';
import axios from 'axios';

/**
 * Import streams from Xtream API with proper cleaning and categorization
 * 
 * Features:
 * - Fetches streams from Xtream API
 * - Normalizes stream names (UPPERCASE, clean)
 * - Detects country from stream name prefixes (US:, FR:, IT:, etc.)
 * - Automatically categorizes into country → type subcategories
 * - Assigns default logos
 */

// Xtream API Configuration
const XTREAM_CONFIG = {
  baseUrl: 'http://ultimeiptv.net',
  username: 'nounou',
  password: 'tt@S++2072',
};

// Country code mapping
const COUNTRY_CODE_MAP: Record<string, string> = {
  'FR': 'FR', 'FRANCE': 'FR',
  'US': 'US', 'USA': 'US', 'UNITED STATES': 'US',
  'UK': 'GB', 'GB': 'GB', 'UNITED KINGDOM': 'GB',
  'IT': 'IT', 'ITALY': 'IT', 'ITALIA': 'IT',
  'ES': 'ES', 'SPAIN': 'ES', 'ESPANA': 'ES',
  'DE': 'DE', 'GERMANY': 'DE', 'DEUTSCHLAND': 'DE',
  'BE': 'BE', 'BELGIUM': 'BE', 'BELGIQUE': 'BE',
  'NL': 'NL', 'NETHERLANDS': 'NL', 'HOLLAND': 'NL',
  'PT': 'PT', 'PORTUGAL': 'PT',
  'CA': 'CA', 'CANADA': 'CA',
  'AR': 'SA', 'ARAB': 'SA', 'ARABIC': 'SA',
  'TN': 'TN', 'TUNISIA': 'TN', 'TUNISIE': 'TN',
  'MA': 'MA', 'MOROCCO': 'MA', 'MAROC': 'MA',
  'DZ': 'DZ', 'ALGERIA': 'DZ', 'ALGERIE': 'DZ',
  'EG': 'EG', 'EGYPT': 'EG', 'EGYPTE': 'EG',
  'TR': 'TR', 'TURKEY': 'TR', 'TURQUIE': 'TR',
  'GR': 'GR', 'GREECE': 'GR', 'GRECE': 'GR',
  'PL': 'PL', 'POLAND': 'PL', 'POLOGNE': 'PL',
  'RO': 'RO', 'ROMANIA': 'RO', 'ROUMANIE': 'RO',
  'IN': 'IN', 'INDIA': 'IN', 'INDE': 'IN',
  'BR': 'BR', 'BRAZIL': 'BR', 'BRESIL': 'BR',
  'MX': 'MX', 'MEXICO': 'MX', 'MEXIQUE': 'MX',
  'JP': 'JP', 'JAPAN': 'JP', 'JAPON': 'JP',
  'CN': 'CN', 'CHINA': 'CN', 'CHINE': 'CN',
  'KR': 'KR', 'KOREA': 'KR', 'COREE': 'KR',
  'RU': 'RU', 'RUSSIA': 'RU', 'RUSSIE': 'RU',
  'AU': 'AU', 'AUSTRALIA': 'AU', 'AUSTRALIE': 'AU',
};

// Category keywords for automatic classification
const CATEGORY_KEYWORDS = {
  SPORTS: ['SPORT', 'BEIN', 'ESPN', 'EUROSPORT', 'FOOT', 'FOOTBALL', 'SOCCER', 'TENNIS', 'BASKET', 'NBA', 'NFL', 'GOLF', 'RACING', 'FIGHT', 'UFC', 'BOXING', 'CRICKET', 'RUGBY'],
  CINÉMA: ['CINEMA', 'MOVIE', 'FILM', 'CINE', 'MAX', 'TCM', 'PARAMOUNT', 'ACTION', 'THRILLER'],
  INFO: ['NEWS', 'INFO', 'ALJAZEERA', 'AL JAZEERA', 'BBC NEWS', 'CNN', 'SKY NEWS', 'FRANCE24', 'CNEWS', 'BFMTV', 'BFM', 'BREAKING', 'AKHBAR'],
  ENFANTS: ['KIDS', 'ENFANT', 'CARTOON', 'TOON', 'DISNEY', 'NICKELODEON', 'NICK JR', 'BARAEM', 'JEEM', 'BABY', 'JUNIOR', 'GULLI', 'CHILDREN'],
  MUSIQUE: ['MUSIC', 'MUSIQUE', 'MTV', 'MCM', 'MELODY', 'MAZZIKA', 'TRACE', 'MEZZO', 'RADIO'],
  DOCUMENTAIRES: ['DOCUMENTARY', 'DOCUMENTAIRE', 'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NAT GEO', 'HISTORY', 'SCIENCE', 'NATURE', 'ANIMAL', 'PLANETE'],
  RELIGIEUX: ['QURAN', 'CORAN', 'ISLAM', 'SUNNAH', 'MECCA', 'MAKKAH', 'IQRAA', 'AZHARI', 'RELIGIOUS', 'CHURCH'],
  SÉRIES: ['SERIE', 'SERIES', 'DRAMA', 'SHOW', 'SHAHID', 'OSN'],
  DIVERTISSEMENT: ['ENTERTAINMENT', 'VARIETY', 'COMEDY', 'FUN', 'LIFESTYLE', 'REALITY'],
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
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

interface CategoryMapping {
  id: number;
  name: string;
  countryCode: string | null;
  parentId: number | null;
  subcategories: Map<string, number>; // subcategory name -> ID
}

/**
 * Normalize stream name: UPPERCASE, remove extra spaces, clean special chars
 */
function normalizeStreamName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[ᴴᴰ|HD|FHD|4K|UHD]/gi, 'HD') // Normalize HD variants
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[_]+/g, ' ') // Replace underscores with spaces
    .trim();
}

/**
 * Detect country code from stream name
 * Patterns: "US: CNN", "FR-TF1", "[IT] RAI", etc.
 */
function detectCountryCode(streamName: string): string | null {
  const nameUpper = streamName.toUpperCase();
  
  // Pattern 1: Country code at start with separator (US:, FR:, IT-, etc.)
  const prefixMatch = nameUpper.match(/^([A-Z]{2,3})[:\-\s\[\]]/);
  if (prefixMatch) {
    const code = prefixMatch[1];
    if (COUNTRY_CODE_MAP[code]) {
      return COUNTRY_CODE_MAP[code];
    }
  }
  
  // Pattern 2: Country name in parentheses or brackets
  const bracketMatch = nameUpper.match(/[\(\[]([A-Z\s]+)[\)\]]/);
  if (bracketMatch) {
    const country = bracketMatch[1].trim();
    if (COUNTRY_CODE_MAP[country]) {
      return COUNTRY_CODE_MAP[country];
    }
  }
  
  // Pattern 3: Country code/name anywhere in name
  for (const [key, code] of Object.entries(COUNTRY_CODE_MAP)) {
    if (nameUpper.includes(key)) {
      return code;
    }
  }
  
  return null; // Default to France will be handled later
}

/**
 * Detect category type from stream name
 */
function detectCategoryType(streamName: string): string {
  const nameUpper = streamName.toUpperCase();
  let bestMatch = { category: 'GÉNÉRALISTE', score: 0 };
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (nameUpper.includes(keyword)) {
        score++;
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { category, score };
    }
  }
  
  return bestMatch.category;
}

/**
 * Get default logo URL based on stream name
 */
function getDefaultLogoUrl(streamName: string): string {
  const slug = streamName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  
  return `/media/images/${slug}.png`;
}

/**
 * Fetch streams from Xtream API
 */
async function fetchXtreamStreams(): Promise<XtreamStream[]> {
  const url = `${XTREAM_CONFIG.baseUrl}/player_api.php`;
  const params = {
    username: XTREAM_CONFIG.username,
    password: XTREAM_CONFIG.password,
    action: 'get_live_streams',
  };
  
  console.log('🌐 Fetching streams from Xtream API...');
  console.log(`   URL: ${url}`);
  
  const response = await axios.get<XtreamStream[]>(url, { params });
  
  console.log(`✅ Fetched ${response.data.length} streams\n`);
  return response.data;
}

/**
 * Load category mappings from database
 */
async function loadCategoryMappings(): Promise<Map<string, CategoryMapping>> {
  console.log('📁 Loading category mappings from database...\n');
  
  const categories = await prisma.category.findMany({
    where: {
      type: StreamType.LIVE,
    },
    include: {
      children: true,
    },
  });
  
  const mappings = new Map<string, CategoryMapping>();
  
  for (const category of categories) {
    if (category.parentId === null && category.countryCode) {
      // This is a parent country category
      const subcatMap = new Map<string, number>();
      
      for (const subcat of category.children) {
        subcatMap.set(subcat.name, subcat.id);
      }
      
      mappings.set(category.countryCode, {
        id: category.id,
        name: category.name,
        countryCode: category.countryCode,
        parentId: null,
        subcategories: subcatMap,
      });
    }
  }
  
  console.log(`✅ Loaded ${mappings.size} country category mappings\n`);
  return mappings;
}

/**
 * Main import function
 */
async function main() {
  console.log('🚀 Starting Xtream API Import\n');
  console.log('═'.repeat(50));
  console.log('\n');
  
  try {
    // Step 1: Fetch streams from Xtream API
    const xtreamStreams = await fetchXtreamStreams();
    
    // Step 2: Load category mappings
    const categoryMappings = await loadCategoryMappings();
    
    // Step 3: Get default server for origin
    const originServer = await prisma.server.findFirst({
      where: { name: 's02' },
    });
    
    if (!originServer) {
      throw new Error('Origin server (s02) not found in database');
    }
    
    console.log(`📡 Using origin server: ${originServer.name} (ID: ${originServer.id})\n`);
    
    // Step 4: Process and import streams
    console.log('🔄 Processing streams...\n');
    console.log(`📺 Total streams to process: ${xtreamStreams.length}\n`);
    
    let imported = 0;
    let skipped = 0;
    let adultSkipped = 0;
    const errors: string[] = [];
    
    for (const xtreamStream of xtreamStreams) { // Process ALL streams
      try {
        // Clean and normalize stream name
        const cleanName = normalizeStreamName(xtreamStream.name);
        
        // Skip adult content (XXX prefix or adult keywords)
        if (cleanName.startsWith('XXX') || 
            cleanName.includes('ADULT') || 
            cleanName.includes('PORN') ||
            cleanName.includes('SEXY') ||
            cleanName.includes('EROTIC')) {
          adultSkipped++;
          continue;
        }
        
        // Detect country
        const countryCode = detectCountryCode(cleanName) || 'FR'; // Default to France
        const countryMapping = categoryMappings.get(countryCode);
        
        if (!countryMapping) {
          console.log(`⚠️  Skipping "${cleanName}" - Country ${countryCode} not found in database`);
          skipped++;
          continue;
        }
        
        // Detect category type
        const categoryType = detectCategoryType(cleanName);
        const subcategoryId = countryMapping.subcategories.get(categoryType);
        
        if (!subcategoryId) {
          console.log(`⚠️  No subcategory "${categoryType}" for country ${countryCode}`);
          continue;
        }
        
        // Generate logo URL
        const logoUrl = xtreamStream.stream_icon || getDefaultLogoUrl(cleanName);
        
        // Create stream in database
        const stream = await prisma.stream.create({
          data: {
            name: cleanName,
            streamType: StreamType.LIVE,
            categoryId: subcategoryId, // Primary category (country → type)
            sourceUrl: `${XTREAM_CONFIG.baseUrl}/live/${XTREAM_CONFIG.username}/${XTREAM_CONFIG.password}/${xtreamStream.stream_id}.ts`,
            logoUrl: logoUrl,
            epgChannelId: xtreamStream.epg_channel_id || null,
            isActive: true,
            tvArchive: xtreamStream.tv_archive === 1,
            tvArchiveDuration: xtreamStream.tv_archive_duration || 0,
            originServerId: originServer.id,
            sortOrder: xtreamStream.num,
          },
        });
        
        // Create primary StreamCategory relationship
        await prisma.streamCategory.create({
          data: {
            streamId: stream.id,
            categoryId: subcategoryId,
            isPrimary: true,
          },
        });
        
        imported++;
        
        // Show progress every 100 streams
        if (imported % 100 === 0) {
          console.log(`📊 Progress: ${imported} streams imported, ${skipped + adultSkipped} skipped (${adultSkipped} adult content)`);
        }
        
      } catch (error: any) {
        errors.push(`Error importing "${xtreamStream.name}": ${error.message}`);
        skipped++;
      }
    }
    
    console.log('\n');
    console.log('═'.repeat(60));
    console.log('\n📊 IMPORT SUMMARY\n');
    console.log(`✅ Successfully imported: ${imported} streams`);
    console.log(`🔞 Adult content skipped: ${adultSkipped} streams`);
    console.log(`⚠️  Other skipped:        ${skipped} streams`);
    console.log(`❌ Errors:               ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ ERRORS:\n');
      errors.slice(0, 10).forEach(err => console.log(`  - ${err}`));
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more`);
      }
    }
    
    console.log('\n✅ Import complete!\n');
    
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('❌ Unhandled error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
