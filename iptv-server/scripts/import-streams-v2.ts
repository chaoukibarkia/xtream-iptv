import { PrismaClient, StreamType } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

/**
 * Import streams from Xtream API with proper cleaning and categorization
 * 
 * Features:
 * - Clean stream names (UPPERCASE, remove junk)
 * - Detect country from stream name
 * - Route adult content to ADULTES category
 * - Route beIN Sports to BEIN SPORTS category
 * - Auto-detect category type (sports, cinema, etc.)
 * - Assign default logos
 */

// Xtream API Configuration
const XTREAM_CONFIG = {
  baseUrl: 'http://ultimeiptv.net',
  username: 'nounou',
  password: 'tt@S++2072',
};

// Country code patterns to detect from stream names
const COUNTRY_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  // Prefix patterns: "FR:", "FR-", "FR ", "[FR]"
  { pattern: /^FR[:\-\s\[\]]/i, code: 'FR' },
  { pattern: /^US[:\-\s\[\]]/i, code: 'US' },
  { pattern: /^UK[:\-\s\[\]]/i, code: 'GB' },
  { pattern: /^GB[:\-\s\[\]]/i, code: 'GB' },
  { pattern: /^DE[:\-\s\[\]]/i, code: 'DE' },
  { pattern: /^IT[:\-\s\[\]]/i, code: 'IT' },
  { pattern: /^ES[:\-\s\[\]]/i, code: 'ES' },
  { pattern: /^PT[:\-\s\[\]]/i, code: 'PT' },
  { pattern: /^NL[:\-\s\[\]]/i, code: 'NL' },
  { pattern: /^BE[:\-\s\[\]]/i, code: 'BE' },
  { pattern: /^CA[:\-\s\[\]]/i, code: 'CA' },
  { pattern: /^TR[:\-\s\[\]]/i, code: 'TR' },
  { pattern: /^PL[:\-\s\[\]]/i, code: 'PL' },
  { pattern: /^AR[:\-\s\[\]]/i, code: 'SA' }, // Arabic -> Saudi Arabia
  { pattern: /^SA[:\-\s\[\]]/i, code: 'SA' },
  { pattern: /^IN[:\-\s\[\]]/i, code: 'IN' },
  { pattern: /^TN[:\-\s\[\]]/i, code: 'TN' },
  { pattern: /^MA[:\-\s\[\]]/i, code: 'MA' },
  { pattern: /^DZ[:\-\s\[\]]/i, code: 'DZ' },
  { pattern: /^EG[:\-\s\[\]]/i, code: 'EG' },
  { pattern: /^RU[:\-\s\[\]]/i, code: 'RU' },
  { pattern: /^BR[:\-\s\[\]]/i, code: 'BR' },
  { pattern: /^MX[:\-\s\[\]]/i, code: 'MX' },
  { pattern: /^GR[:\-\s\[\]]/i, code: 'GR' },
  { pattern: /^RO[:\-\s\[\]]/i, code: 'RO' },
  { pattern: /^SE[:\-\s\[\]]/i, code: 'SE' },
  { pattern: /^NO[:\-\s\[\]]/i, code: 'NO' },
  { pattern: /^DK[:\-\s\[\]]/i, code: 'DK' },
  { pattern: /^FI[:\-\s\[\]]/i, code: 'FI' },
  { pattern: /^AT[:\-\s\[\]]/i, code: 'AT' },
  { pattern: /^CH[:\-\s\[\]]/i, code: 'CH' },
  { pattern: /^IE[:\-\s\[\]]/i, code: 'IE' },
  { pattern: /^AU[:\-\s\[\]]/i, code: 'AU' },
  { pattern: /^NZ[:\-\s\[\]]/i, code: 'NZ' },
  { pattern: /^JP[:\-\s\[\]]/i, code: 'JP' },
  { pattern: /^KR[:\-\s\[\]]/i, code: 'KR' },
  { pattern: /^CN[:\-\s\[\]]/i, code: 'CN' },
  { pattern: /^LB[:\-\s\[\]]/i, code: 'LB' },
  { pattern: /^SY[:\-\s\[\]]/i, code: 'SY' },
  { pattern: /^IQ[:\-\s\[\]]/i, code: 'IQ' },
  { pattern: /^JO[:\-\s\[\]]/i, code: 'JO' },
  { pattern: /^KW[:\-\s\[\]]/i, code: 'KW' },
  { pattern: /^QA[:\-\s\[\]]/i, code: 'QA' },
  { pattern: /^AE[:\-\s\[\]]/i, code: 'AE' },
  { pattern: /^PK[:\-\s\[\]]/i, code: 'PK' },
  { pattern: /^LY[:\-\s\[\]]/i, code: 'LY' },
  { pattern: /^SD[:\-\s\[\]]/i, code: 'SD' },
  { pattern: /^PS[:\-\s\[\]]/i, code: 'PS' },
];

// Adult content keywords
const ADULT_KEYWORDS = [
  'XXX', 'ADULT', 'PORN', 'SEXY', 'EROTIC', 'PLAYBOY', 'PENTHOUSE',
  'BRAZZERS', 'BANGBROS', 'NAUGHTY', 'HUSTLER', 'VIVID', 'PRIVATE',
  'REDLIGHT', 'BLUE HUSTLER', 'EXTASY', 'VISIT-X', 'JASMIN',
  'CAMS', 'WEBCAM', 'BABESTATION', 'SPICE', 'LEO TV',
  'BLONDE', 'BRUNETTE', 'MILF', 'TEEN ', 'GANGBANG', 'THREESOME',
  'BLOWJOB', 'HARDCORE', 'INTERRACIAL', 'GAY ', 'LESBIAN',
  'FETISH', 'BDSM', 'BONDAGE', 'BIKINI', 'NUDE', 'NAKED',
  'HOT GIRLS', 'BABES', 'STRIP', 'DORCEL', 'PINK', 'DESIRE',
  'AHDHDLTIPTV', 'MIAMI TV'
];

// beIN Sports patterns
const BEIN_PATTERNS = [
  /BEIN\s*SPORT/i,
  /BEIN\s*HD/i,
  /BEIN\s*MAX/i,
  /BEINSPORT/i,
];

// Category type keywords
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  SPORTS: ['SPORT', 'ESPN', 'EUROSPORT', 'FOOT', 'FOOTBALL', 'SOCCER', 'TENNIS', 'BASKET', 'NBA', 'NFL', 'GOLF', 'RACING', 'FIGHT', 'UFC', 'BOXING', 'CRICKET', 'RUGBY', 'F1', 'FORMULA', 'DAZN', 'SUPERSPORT', 'FOX SPORT', 'SKY SPORT', 'RMC SPORT', 'CANAL SPORT'],
  CINÉMA: ['CINEMA', 'MOVIE', 'FILM', 'CINE', 'MAX', 'TCM', 'PARAMOUNT', 'ACTION', 'THRILLER', 'HORROR', 'COMEDY', 'DRAMA', 'ROMANCE', 'SCI-FI', 'SYFY', 'AMC', 'TNT', 'CANAL+ CINEMA', 'OCS'],
  INFO: ['NEWS', 'INFO', 'ALJAZEERA', 'AL JAZEERA', 'BBC NEWS', 'CNN', 'SKY NEWS', 'FRANCE24', 'CNEWS', 'BFMTV', 'BFM', 'EURONEWS', 'RT ', 'FOXNEWS', 'MSNBC', 'BLOOMBERG'],
  ENFANTS: ['KIDS', 'ENFANT', 'CARTOON', 'TOON', 'DISNEY', 'NICKELODEON', 'NICK', 'BARAEM', 'JEEM', 'BABY', 'JUNIOR', 'GULLI', 'CHILDREN', 'BOOMERANG', 'PBS KIDS'],
  MUSIQUE: ['MUSIC', 'MUSIQUE', 'MTV', 'MCM', 'MELODY', 'MAZZIKA', 'TRACE', 'MEZZO', 'VH1', 'CLUBBING', 'JAZZ', 'CLASSIC', 'CONCERT'],
  DOCUMENTAIRES: ['DOCUMENTARY', 'DOCUMENTAIRE', 'DISCOVERY', 'NATIONAL GEOGRAPHIC', 'NAT GEO', 'HISTORY', 'SCIENCE', 'NATURE', 'ANIMAL', 'PLANETE', 'QUEST', 'SMITHSONIAN', 'TRAVEL'],
  RELIGIEUX: ['QURAN', 'CORAN', 'ISLAM', 'SUNNAH', 'MECCA', 'MAKKAH', 'IQRAA', 'AZHARI', 'RELIGIOUS', 'CHURCH', 'CHRISTIAN', 'GOD TV', 'RISALAH'],
  SÉRIES: ['SERIE', 'SERIES', 'DRAMA', 'SHOW', 'SHAHID', 'OSN SERIE', 'FOX LIFE', 'CBS', 'NBC', 'ABC', 'HBO', 'SHOWTIME', 'STARZ', 'FX', 'USA NETWORK'],
  DIVERTISSEMENT: ['ENTERTAINMENT', 'VARIETY', 'COMEDY', 'FUN', 'LIFESTYLE', 'REALITY', 'TLC', 'E!', 'BRAVO', 'FOOD', 'COOKING', 'HGTV', 'FASHION'],
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

interface CategoryInfo {
  parentId: number;
  parentName: string;
  subcategoryId: number;
  subcategoryName: string;
}

/**
 * Clean and normalize stream name
 */
function cleanStreamName(name: string): string {
  let cleaned = name
    .toUpperCase()
    // Remove common junk prefixes
    .replace(/^(VIP|PREMIUM|NEW|HD|FHD|4K|UHD|H265|HEVC|SD)[:\-\s]*/gi, '')
    // Normalize HD variants
    .replace(/[ᴴᴰ]/g, 'HD')
    .replace(/\bFHD\b/gi, 'HD')
    .replace(/\b4K\b/gi, 'UHD')
    .replace(/\bH\.?265\b/gi, '')
    .replace(/\bHEVC\b/gi, '')
    // Remove quality suffixes in parentheses
    .replace(/\s*\([^)]*\)\s*$/g, '')
    // Remove special characters but keep basic punctuation
    .replace(/[^\w\s\-\.\+\&\'\"]/g, ' ')
    // Replace multiple spaces/underscores
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    // Trim
    .trim();
  
  // Remove trailing quality indicators
  cleaned = cleaned
    .replace(/\s+(HD|SD|FHD|UHD|4K|HQ|LQ)\s*$/gi, '')
    .replace(/\s*;\s*$/g, '')
    .trim();
  
  return cleaned;
}

/**
 * Check if stream is adult content
 */
function isAdultContent(name: string): boolean {
  const upperName = name.toUpperCase();
  return ADULT_KEYWORDS.some(keyword => upperName.includes(keyword));
}

/**
 * Check if stream is beIN Sports
 */
function isBeInSports(name: string): boolean {
  return BEIN_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Detect country code from stream name
 */
function detectCountryCode(name: string): string | null {
  const upperName = name.toUpperCase();
  
  for (const { pattern, code } of COUNTRY_PATTERNS) {
    if (pattern.test(upperName)) {
      return code;
    }
  }
  
  return null;
}

/**
 * Detect category type from stream name
 */
function detectCategoryType(name: string): string {
  const upperName = name.toUpperCase();
  let bestMatch = { category: 'GÉNÉRALISTE', score: 0 };
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (upperName.includes(keyword)) {
        score += keyword.length; // Longer matches score higher
      }
    }
    if (score > bestMatch.score) {
      bestMatch = { category, score };
    }
  }
  
  return bestMatch.category;
}

/**
 * Get beIN Sports subcategory based on stream name
 */
function getBeInSubcategory(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('MAX')) return 'BEIN MAX';
  if (upperName.includes('HD')) return 'BEIN HD';
  return 'BEIN SD';
}

/**
 * Get adult subcategory based on stream name
 */
function getAdultSubcategory(name: string): string {
  const upperName = name.toUpperCase();
  if (upperName.includes('CAM') || upperName.includes('LIVE')) return 'LIVE CAMS';
  if (upperName.includes('PREMIUM') || upperName.includes('VIP')) return 'PREMIUM';
  return 'GÉNÉRALISTE';
}

/**
 * Generate default logo URL
 */
function getDefaultLogoUrl(name: string, streamIcon: string): string {
  // If Xtream provides an icon, use it
  if (streamIcon && streamIcon.startsWith('http')) {
    return streamIcon;
  }
  
  // Generate default based on name
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  
  return `/media/logos/${slug}.png`;
}

/**
 * Load all category mappings from database
 */
async function loadCategoryMappings(): Promise<Map<string, Map<string, number>>> {
  const categories = await prisma.category.findMany({
    where: { type: StreamType.LIVE },
    include: { parent: true },
  });
  
  // Map: countryCode -> (subcategoryName -> subcategoryId)
  const mappings = new Map<string, Map<string, number>>();
  
  for (const cat of categories) {
    if (cat.parentId && cat.parent) {
      const parentCode = cat.parent.countryCode || cat.parent.name;
      
      if (!mappings.has(parentCode)) {
        mappings.set(parentCode, new Map());
      }
      
      mappings.get(parentCode)!.set(cat.name, cat.id);
    }
  }
  
  return mappings;
}

/**
 * Get special category IDs (ADULTES, BEIN SPORTS)
 */
async function getSpecialCategories(): Promise<{
  adultes: Map<string, number>;
  bein: Map<string, number>;
}> {
  const adultes = new Map<string, number>();
  const bein = new Map<string, number>();
  
  // Get ADULTES subcategories
  const adultParent = await prisma.category.findFirst({
    where: { name: 'ADULTES', type: StreamType.LIVE, parentId: null },
    include: { children: true },
  });
  
  if (adultParent) {
    for (const child of adultParent.children) {
      adultes.set(child.name, child.id);
    }
  }
  
  // Get BEIN SPORTS subcategories
  const beinParent = await prisma.category.findFirst({
    where: { name: 'BEIN SPORTS', type: StreamType.LIVE, parentId: null },
    include: { children: true },
  });
  
  if (beinParent) {
    for (const child of beinParent.children) {
      bein.set(child.name, child.id);
    }
  }
  
  return { adultes, bein };
}

/**
 * Main import function
 */
async function main() {
  console.log('═'.repeat(70));
  console.log('   🚀 XTREAM API IMPORT v2 - With Proper Cleaning & Categorization');
  console.log('═'.repeat(70));
  console.log('');
  
  try {
    // Step 1: Fetch streams from API
    console.log('📡 Fetching streams from Xtream API...');
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
    
    // Step 2: Load category mappings
    console.log('📁 Loading category mappings...');
    const categoryMappings = await loadCategoryMappings();
    const specialCategories = await getSpecialCategories();
    console.log(`   ✅ Loaded ${categoryMappings.size} country mappings`);
    console.log(`   ✅ ADULTES subcategories: ${specialCategories.adultes.size}`);
    console.log(`   ✅ BEIN SPORTS subcategories: ${specialCategories.bein.size}\n`);
    
    // Step 3: Get origin server
    const originServer = await prisma.server.findFirst({
      where: { name: 's02' },
    });
    
    if (!originServer) {
      throw new Error('Origin server s02 not found');
    }
    console.log(`📡 Using origin server: ${originServer.name} (ID: ${originServer.id})\n`);
    
    // Step 4: Process streams
    console.log('🔄 Processing streams...\n');
    
    let imported = 0;
    let adultCount = 0;
    let beinCount = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    // Default category if nothing matches
    const defaultCategoryId = categoryMappings.get('FR')?.get('GÉNÉRALISTE');
    
    if (!defaultCategoryId) {
      throw new Error('Default category FR/GÉNÉRALISTE not found');
    }
    
    for (const xtreamStream of xtreamStreams) {
      try {
        // Clean stream name
        const cleanName = cleanStreamName(xtreamStream.name);
        
        if (!cleanName || cleanName.length < 2) {
          skipped++;
          continue;
        }
        
        let categoryId: number;
        let categoryPath: string;
        
        // Check if adult content
        if (isAdultContent(xtreamStream.name) || isAdultContent(cleanName)) {
          const subcat = getAdultSubcategory(cleanName);
          categoryId = specialCategories.adultes.get(subcat) || 
                       specialCategories.adultes.get('GÉNÉRALISTE')!;
          categoryPath = `ADULTES/${subcat}`;
          adultCount++;
        }
        // Check if beIN Sports
        else if (isBeInSports(xtreamStream.name) || isBeInSports(cleanName)) {
          const subcat = getBeInSubcategory(cleanName);
          categoryId = specialCategories.bein.get(subcat) || 
                       specialCategories.bein.get('BEIN HD')!;
          categoryPath = `BEIN SPORTS/${subcat}`;
          beinCount++;
        }
        // Regular stream - detect country and type
        else {
          const countryCode = detectCountryCode(xtreamStream.name) || 'FR';
          const categoryType = detectCategoryType(cleanName);
          
          const countryMapping = categoryMappings.get(countryCode);
          if (countryMapping) {
            categoryId = countryMapping.get(categoryType) || 
                        countryMapping.get('GÉNÉRALISTE') ||
                        defaultCategoryId;
            categoryPath = `${countryCode}/${categoryType}`;
          } else {
            // Fallback to France
            categoryId = categoryMappings.get('FR')?.get(categoryType) || defaultCategoryId;
            categoryPath = `FR/${categoryType}`;
          }
        }
        
        // Generate logo URL
        const logoUrl = getDefaultLogoUrl(cleanName, xtreamStream.stream_icon);
        
        // Create stream
        const stream = await prisma.stream.create({
          data: {
            name: cleanName,
            streamType: StreamType.LIVE,
            categoryId: categoryId,
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
        
        // Create StreamCategory relation
        await prisma.streamCategory.create({
          data: {
            streamId: stream.id,
            categoryId: categoryId,
            isPrimary: true,
          },
        });
        
        imported++;
        
        // Progress report every 200 streams
        if (imported % 200 === 0) {
          console.log(`   📊 Progress: ${imported} imported, ${adultCount} adult, ${beinCount} beIN, ${skipped} skipped`);
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
    
    if (errors.length > 0 && errors.length <= 10) {
      console.log('\n   Errors:');
      errors.forEach(e => console.log(`     - ${e}`));
    }
    
    console.log('\n');
    console.log('═'.repeat(70));
    console.log('   ✅ Import completed successfully!');
    console.log('═'.repeat(70));
    console.log('');
    
  } catch (error: any) {
    console.error('\n❌ FATAL ERROR:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
