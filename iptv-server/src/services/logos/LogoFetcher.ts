import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LogoCandidate {
  url: string;
  source: string;
  name: string;
}

/**
 * Search for channel logos from various sources
 */
export async function fetchPossibleLogos(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];

  // Common channel name aliases/abbreviations
  const channelAliases: Record<string, string[]> = {
    'ad sports': ['abu dhabi sports', 'abu-dhabi-sports'],
    'ad sport': ['abu dhabi sport', 'abu-dhabi-sport'],
    'mbc': ['mbc tv', 'middle east broadcasting'],
    'lbc': ['lebanese broadcasting', 'lbc tv'],
    'osn': ['orbit showtime', 'orbit showtime network'],
    'ssc': ['saudi sports channel', 'ssc tv'],
    'ksa': ['saudi arabia', 'ksa sports'],
    'bein': ['bein sports', 'beinsports'],
    'bein sports xtra': ['bein sport xtra', 'beinsports xtra', 'bein xtra'],
  };

  // Normalize channel name: remove accents for better search
  const normalizedName = channelName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check for aliases and add them to search
  const searchNames = [normalizedName];
  const lowerName = channelName.toLowerCase();
  for (const [abbrev, aliases] of Object.entries(channelAliases)) {
    if (lowerName.startsWith(abbrev)) {
      // Replace abbreviation with full name variants
      for (const alias of aliases) {
        searchNames.push(lowerName.replace(abbrev, alias));
      }
    }
  }
  
  logger.info({ channelName, normalizedName, searchNames }, 'Starting logo search');

  // Run searches in parallel for speed - use both original and normalized names
  const searchPromises: Promise<LogoCandidate[]>[] = [];
  for (const name of searchNames) {
    searchPromises.push(
      searchTvLogos(name).catch((e) => { logger.debug({ error: e.message }, 'tvLogos failed'); return []; }),
    );
  }
  searchPromises.push(
    searchGithubLogos(normalizedName).catch((e) => { logger.debug({ error: e.message }, 'githubLogos failed'); return []; }),
    searchIptvOrgLogos(normalizedName).catch((e) => { logger.debug({ error: e.message }, 'iptvOrgLogos failed'); return []; }),
    searchBingImages(channelName).catch((e) => { logger.debug({ error: e.message }, 'bingImages failed'); return []; }),
    searchGoogleImages(channelName).catch((e) => { logger.debug({ error: e.message }, 'googleImages failed'); return []; }),
  );

  const results = await Promise.all(searchPromises);
  for (const result of results) {
    candidates.push(...result);
  }

  logger.info({ channelName, count: candidates.length }, 'Logo search completed');

  // Deduplicate by URL
  const seen = new Set<string>();
  return candidates.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  }).slice(0, 20); // Limit to 20 results
}

async function searchSimilarPng(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  
  try {
    const searchQuery = encodeURIComponent(`${channelName} logo`);
    const searchUrl = `https://similarpng.com/?s=${searchQuery}`;
    
    const response = await axios.get(searchUrl, {
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });
    
    // Extract thumbnail URLs from the page
    const thumbnailMatches = response.data.match(/https:\/\/image\.similarpng\.com\/file\/similarpng\/[^"'\s]+\.png/g);
    if (thumbnailMatches) {
      // Get unique URLs and convert thumbnails to larger versions
      const seen = new Set<string>();
      for (const url of thumbnailMatches.slice(0, 10)) {
        if (seen.has(url)) continue;
        seen.add(url);
        
        // Skip very-thumbnail (too small) and generic icons
        if (url.includes('very-thumbnail') || url.includes('arrow-png') || url.includes('checkerboard')) {
          continue;
        }
        
        candidates.push({
          url,
          source: 'SimilarPNG',
          name: channelName,
        });
        
        if (candidates.length >= 5) break;
      }
    }
  } catch (error) {
    logger.debug({ error, channelName }, 'SimilarPNG search failed');
  }
  
  return candidates;
}

async function searchBingImages(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  const seen = new Set<string>();
  
  // Build multiple search queries for better coverage
  // Start with more specific queries for known regional channels, then fall back to generic
  const searchQueries: { query: string; useTransparentFilter: boolean }[] = [];
  
  // Add country-specific search variations for MENA/Arabic channels FIRST (higher priority)
  // Don't use transparent filter for regional channels as their logos often have solid backgrounds
  const lowerName = channelName.toLowerCase();
  if (lowerName.includes('tunisia') || lowerName.includes('tunisi') || 
      lowerName.includes('hannibal') || lowerName.includes('watania') || 
      lowerName.includes('nessma') || lowerName.includes('attessia') ||
      lowerName.includes('carthage') || lowerName.includes('hiwar')) {
    searchQueries.push({ query: `${channelName} Tunisia TV channel logo`, useTransparentFilter: false });
    searchQueries.push({ query: `${channelName} تونس logo`, useTransparentFilter: false });
  }
  if (lowerName.includes('morocco') || lowerName.includes('maroc') || lowerName.includes('2m') || lowerName.includes('medi1')) {
    searchQueries.push({ query: `${channelName} Morocco TV channel logo`, useTransparentFilter: false });
  }
  if (lowerName.includes('algeria') || lowerName.includes('algeri') || lowerName.includes('echorouk') || lowerName.includes('ennahar')) {
    searchQueries.push({ query: `${channelName} Algeria TV channel logo`, useTransparentFilter: false });
  }
  
  // Then add generic searches as fallback with transparent filter
  searchQueries.push({ query: `${channelName} TV channel logo transparent`, useTransparentFilter: true });
  searchQueries.push({ query: `${channelName} logo png`, useTransparentFilter: true });
  
  for (const { query, useTransparentFilter } of searchQueries) {
    if (candidates.length >= 10) break;
    
    try {
      const searchQuery = encodeURIComponent(query);
      const filterParam = useTransparentFilter ? '&qft=+filterui:photo-transparent' : '';
      const searchUrl = `https://www.bing.com/images/search?q=${searchQuery}&form=HDRSC2${filterParam}`;
      
      const response = await axios.get(searchUrl, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });
      
      // Extract image URLs from Bing's murl (media URL) field
      const urlMatches = response.data.match(/murl&quot;:&quot;(https?:\/\/[^&]+)/g);
      if (urlMatches) {
        for (const match of urlMatches.slice(0, 15)) {
          const url = match.replace('murl&quot;:&quot;', '');
          if (seen.has(url)) continue;
          seen.add(url);
          
          // Filter for image extensions (allow query params after extension)
          if (!url.match(/\.(png|jpg|jpeg|webp)($|\?)/i)) continue;
          
          // Skip generic/unrelated images and stock photo sites
          if (url.includes('placeholder') || url.includes('default') || url.includes('avatar')) continue;
          if (url.includes('1000logos.net') || url.includes('freepik') || url.includes('shutterstock')) continue;
          if (url.includes('icon-library') || url.includes('clipart')) continue;
          if (url.includes('vecteezy.com') || url.includes('dreamstime') || url.includes('istockphoto')) continue;
          if (url.includes('gettyimages') || url.includes('depositphotos') || url.includes('123rf')) continue;
          // Skip Next.js image proxy URLs (they often don't work directly)
          if (url.includes('/_next/image?')) continue;
          // Skip fanart.tv (usually for TV shows, not channels)
          if (url.includes('fanart.tv') && !lowerName.includes('movie') && !lowerName.includes('series')) continue;
          // Skip themoviedb (usually for movies/shows, not channels)
          if (url.includes('themoviedb.org')) continue;
          // Skip Facebook lookaside (often doesn't work directly)
          if (url.includes('lookaside.fbsbx.com')) continue;
          
          // Prioritize known TV logo sources
          const isTvLogoSource = url.includes('thesportsdb.com') || 
                                 url.includes('etisalat.ae') || 
                                 url.includes('bein.com') ||
                                 url.includes('beinsports') ||
                                 url.includes('parsatv') ||
                                 url.includes('teleman') ||
                                 url.includes('live.bdtype') ||
                                 url.includes('seeklogo') ||
                                 url.includes('hannibaltv') ||
                                 url.includes('lyngsat') ||
                                 url.includes('tunisietv') ||
                                 url.includes('ing-sat') ||
                                 url.includes('replaytvdirect') ||
                                 url.includes('livetvcentral');
          
          candidates.push({
            url,
            source: isTvLogoSource ? 'Bing (TV Logo)' : 'Bing Images',
            name: channelName,
          });
          
          if (candidates.length >= 10) break;
        }
      }
    } catch (error) {
      logger.debug({ error, channelName, query }, 'Bing Images search failed');
    }
  }
  
  return candidates;
}

async function searchGoogleImages(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  
  try {
    // Try logo.clearbit.com (works for company names)
    const clearbitName = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clearbitUrls = [
      `https://logo.clearbit.com/${clearbitName}.com`,
      `https://logo.clearbit.com/${clearbitName}.tv`,
      `https://logo.clearbit.com/${clearbitName}tv.com`,
      // MENA & North Africa domains
      `https://logo.clearbit.com/${clearbitName}.tn`,       // Tunisia
      `https://logo.clearbit.com/${clearbitName}.com.tn`,   // Tunisia
      `https://logo.clearbit.com/${clearbitName}tv.com.tn`, // Tunisia (e.g. hannibaltv.com.tn)
      `https://logo.clearbit.com/${clearbitName}.ma`,       // Morocco
      `https://logo.clearbit.com/${clearbitName}.dz`,       // Algeria
      `https://logo.clearbit.com/${clearbitName}.eg`,       // Egypt
      `https://logo.clearbit.com/${clearbitName}.ae`,       // UAE
      `https://logo.clearbit.com/${clearbitName}.sa`,       // Saudi Arabia
      `https://logo.clearbit.com/${clearbitName}.lb`,       // Lebanon
      `https://logo.clearbit.com/${clearbitName}.fr`,       // France
    ];

    for (const url of clearbitUrls) {
      try {
        const response = await axios.head(url, { timeout: 3000 });
        if (response.status === 200) {
          candidates.push({
            url,
            source: 'Clearbit',
            name: channelName,
          });
        }
      } catch {
        // Not found
      }
    }

    // Try DuckDuckGo Image Search (no API key needed)
    try {
      const searchQuery = encodeURIComponent(`${channelName} TV channel logo`);
      const ddgUrl = `https://duckduckgo.com/?q=${searchQuery}&iax=images&ia=images`;
      
      // Get vqd token first
      const tokenResponse = await axios.get(`https://duckduckgo.com/?q=${searchQuery}`, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });
      
      const vqdMatch = tokenResponse.data.match(/vqd=["']([^"']+)["']/);
      if (vqdMatch) {
        const vqd = vqdMatch[1];
        const imageSearchUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${searchQuery}&vqd=${vqd}&f=,,,,,&p=1`;
        
        const imageResponse = await axios.get(imageSearchUrl, {
          timeout: 5000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        });
        
        if (imageResponse.data && imageResponse.data.results) {
          for (const result of imageResponse.data.results.slice(0, 5)) {
            if (result.image && result.image.startsWith('http')) {
              candidates.push({
                url: result.image,
                source: 'DuckDuckGo',
                name: result.title || channelName,
              });
            }
          }
        }
      }
    } catch (ddgError) {
      logger.debug({ error: ddgError }, 'DuckDuckGo search failed');
    }

    // Try Wikipedia/Wikimedia for logos - search multiple language wikis for better MENA coverage
    const wikiHeaders = {
      'User-Agent': 'IPTV-Panel/1.0 (https://github.com/iptv-panel; contact@example.com) axios/1.x',
      'Accept': 'application/json',
    };
    
    // Helper function to extract logo from Wikipedia page
    const extractWikiLogo = async (wikiBaseUrl: string, pageTitle: string, lang: string) => {
      const wikiImageUrl = `${wikiBaseUrl}?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages|pageprops&format=json&pithumbsize=300&origin=*`;
      const imageResponse = await axios.get(wikiImageUrl, { timeout: 5000, headers: wikiHeaders });
      const pages = imageResponse.data?.query?.pages;
      if (pages) {
        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId];
          if (page.missing !== undefined) continue; // Page doesn't exist
          
          // Try thumbnail first
          if (page.thumbnail?.source) {
            logger.info({ url: page.thumbnail.source, lang }, 'Found Wikipedia logo (thumbnail)');
            candidates.push({
              url: page.thumbnail.source,
              source: `Wikipedia (${lang})`,
              name: pageTitle,
            });
            return true;
          }
          // If no thumbnail, try to get the page_image from pageprops
          else if (page.pageprops?.page_image) {
            const imageFileName = page.pageprops.page_image;
            const fileInfoUrl = `${wikiBaseUrl}?action=query&titles=File:${encodeURIComponent(imageFileName)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
            try {
              const fileInfoResponse = await axios.get(fileInfoUrl, { timeout: 5000, headers: wikiHeaders });
              const filePages = fileInfoResponse.data?.query?.pages;
              if (filePages) {
                for (const filePageId of Object.keys(filePages)) {
                  const imageUrl = filePages[filePageId]?.imageinfo?.[0]?.url;
                  if (imageUrl) {
                    logger.info({ url: imageUrl, lang }, 'Found Wikipedia logo (page_image)');
                    candidates.push({
                      url: imageUrl,
                      source: `Wikipedia (${lang})`,
                      name: pageTitle,
                    });
                    return true;
                  }
                }
              }
            } catch (fileError) {
              logger.debug({ error: fileError, imageFileName }, 'Failed to fetch page_image URL');
            }
          }
        }
      }
      return false;
    };
    
    // Search multiple Wikipedia languages - French and Arabic often have better MENA channel coverage
    const wikiLanguages = ['fr', 'en', 'ar'];
    
    // Generate title case variations for direct lookup (Wikipedia is case-sensitive)
    // Keep common acronyms uppercase (TV, HD, FM, etc.)
    const acronyms = ['TV', 'HD', 'FM', 'AM', 'BBC', 'CNN', 'MTV', 'HBO', 'USA', 'UK', 'UAE', 'MBC', 'LBC', 'OSN', 'SSC'];
    const titleCaseName = channelName.split(' ').map(word => {
      const upperWord = word.toUpperCase();
      if (acronyms.includes(upperWord)) return upperWord;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
    const directLookupNames = [channelName, titleCaseName];
    // Remove duplicates
    const uniqueLookupNames = [...new Set(directLookupNames)];
    
    for (const lang of wikiLanguages) {
      try {
        const wikiBaseUrl = `https://${lang}.wikipedia.org/w/api.php`;
        
        // First try direct page lookup (exact match) with case variations
        let directFound = false;
        for (const lookupName of uniqueLookupNames) {
          directFound = await extractWikiLogo(wikiBaseUrl, lookupName, lang);
          if (directFound) break;
        }
        
        // If direct lookup didn't work, try search
        if (!directFound) {
          // Build search query - avoid doubling "TV" if it's already in the name
          const searchTerm = channelName.toLowerCase().includes('tv') ? channelName : `${channelName} TV`;
          const wikiSearchUrl = `${wikiBaseUrl}?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&format=json&origin=*`;
          logger.debug({ wikiSearchUrl, lang }, 'Searching Wikipedia');
          const wikiResponse = await axios.get(wikiSearchUrl, { timeout: 5000, headers: wikiHeaders });
          logger.debug({ searchResults: wikiResponse.data?.query?.search?.length, lang }, 'Wikipedia search results');
          if (wikiResponse.data?.query?.search?.[0]) {
            const pageTitle = wikiResponse.data.query.search[0].title;
            await extractWikiLogo(wikiBaseUrl, pageTitle, lang);
          }
        }
      } catch (wikiError: any) {
        logger.debug({ error: wikiError.message, lang }, 'Wikipedia search failed');
      }
    }

  } catch (error) {
    logger.warn({ error, channelName }, 'Web image search failed');
  }

  return candidates;
}

async function searchGithubLogos(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  const searchTerms = [
    channelName.toLowerCase().replace(/\s+/g, '-'),
    channelName.toLowerCase().replace(/\s+/g, ''),
    channelName.toLowerCase().replace(/[^a-z0-9]/g, ''),
  ];

  const repos = [
    'Starter-Starter/Logo-IPTV/main/logos',
    'AmineSoworlder/logo_iptv/main',
  ];

  for (const repo of repos) {
    for (const term of searchTerms) {
      const urls = [
        `https://raw.githubusercontent.com/${repo}/${term}.png`,
        `https://raw.githubusercontent.com/${repo}/${term}.jpg`,
      ];

      for (const url of urls) {
        try {
          const response = await axios.head(url, { timeout: 3000 });
          if (response.status === 200) {
            candidates.push({
              url,
              source: 'GitHub Logos',
              name: term,
            });
          }
        } catch {
          // Not found
        }
      }
      if (candidates.length >= 5) break;
    }
  }

  return candidates;
}

async function searchIptvOrgLogos(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  const searchTerms = [
    channelName.toLowerCase().replace(/\s+/g, ''),
    channelName.toLowerCase().replace(/[^a-z0-9]/g, ''),
  ];

  // iptv-org/epg logos
  for (const term of searchTerms) {
    const urls = [
      `https://raw.githubusercontent.com/iptv-org/epg/master/sites/${term}.png`,
      `https://i.imgur.com/${term}.png`, // Common image host
    ];

    for (const url of urls) {
      try {
        const response = await axios.head(url, { timeout: 3000 });
        if (response.status === 200) {
          candidates.push({
            url,
            source: 'IPTV-org',
            name: term,
          });
        }
      } catch {
        // Not found
      }
    }
  }

  return candidates;
}

async function searchTvLogos(channelName: string): Promise<LogoCandidate[]> {
  const candidates: LogoCandidate[] = [];
  
  // Generate search terms with various transformations
  const baseName = channelName.toLowerCase();
  
  // Strip common suffixes for fallback search (premium, hd, fhd, uhd, etc.)
  const baseNameNoSuffix = baseName
    .replace(/\s*(premium|hd|fhd|uhd|4k|sd|plus|\+)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const searchTerms = [
    baseName.replace(/\s+/g, '-'),
    baseName.replace(/\s+/g, ''),
    baseName.replace(/[^a-z0-9]/g, ''),
    baseName.replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),
    // Handle "+" character -> "-plus"
    baseName.replace(/\+/g, '-plus').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    baseName.replace(/\+/g, 'plus').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    // Handle special characters like é, è, etc
    baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    baseName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\+/g, '-plus').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    // Handle channel numbers like "DUBAI SPORTS 1" -> "dubai-sports-tv" (common naming pattern)
    baseName.replace(/\s*\d+\s*$/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-tv',
    baseName.replace(/\s*\d+\s*$/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    // Fallback: strip premium/hd/etc suffixes and try base channel name
    baseNameNoSuffix.replace(/\s*\d+\s*$/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-tv',
    baseNameNoSuffix.replace(/\s*\d+\s*$/, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    baseNameNoSuffix.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
  ];
  
  // Handle pattern like "BEIN SPORTS XTRA 1" -> "bein-sports-1-xtra"
  const xtraMatch = baseName.match(/^(.+?)\s+(xtra|max|premium|english|french)\s+(\d+)$/i);
  if (xtraMatch) {
    const [, prefix, suffix, num] = xtraMatch;
    searchTerms.push(`${prefix.replace(/\s+/g, '-')}-${num}-${suffix.toLowerCase()}`);
  }

  // Remove duplicates
  const uniqueTerms = [...new Set(searchTerms)].filter(t => t.length > 0);

  // Country to code mapping for file suffixes
  const countryCodeMap: Record<string, string> = {
    'albania': 'al',
    'algeria': 'dz',
    'argentina': 'ar',
    'australia': 'au',
    'austria': 'at',
    'azerbaijan': 'az',
    'belgium': 'be',
    'brazil': 'br',
    'bulgaria': 'bg',
    'canada': 'ca',
    'caribbean': 'cb',
    'chile': 'cl',
    'costa-rica': 'cr',
    'croatia': 'hr',
    'czech-republic': 'cz',
    'egypt': 'eg',
    'france': 'fr',
    'germany': 'de',
    'greece': 'gr',
    'hong-kong': 'hk',
    'hungary': 'hu',
    'india': 'in',
    'indonesia': 'id',
    'international': 'int',
    'ireland': 'ie',
    'israel': 'il',
    'italy': 'it',
    'jordan': 'jo',
    'kuwait': 'kw',
    'lebanon': 'lb',
    'libya': 'ly',
    'lithuania': 'lt',
    'luxembourg': 'lu',
    'malaysia': 'my',
    'malta': 'mt',
    'mexico': 'mx',
    'morocco': 'ma',
    'netherlands': 'nl',
    'new-zealand': 'nz',
    'nordic': 'nordic',
    'oman': 'om',
    'philippines': 'ph',
    'poland': 'pl',
    'portugal': 'pt',
    'qatar': 'qa',
    'romania': 'ro',
    'russia': 'ru',
    'saudi-arabia': 'sa',
    'serbia': 'rs',
    'singapore': 'sg',
    'slovakia': 'sk',
    'slovenia': 'si',
    'south-africa': 'za',
    'spain': 'es',
    'switzerland': 'ch',
    'tunisia': 'tn',
    'turkey': 'tr',
    'ukraine': 'ua',
    'united-arab-emirates': 'ae',
    'united-kingdom': 'uk',
    'united-states': 'us',
    'world-africa': 'africa',
    'world-asia': 'asia',
    'world-europe': 'europe',
    'world-latin-america': 'latam',
    'world-middle-east': 'me',
  };

  const countries = [
    'international', 'world-europe', 'world-middle-east', 'world-africa', 'world-asia', 'world-latin-america',
    'france', 'united-kingdom', 'united-states', 'germany', 'spain', 'italy', 'portugal', 'netherlands', 'belgium',
    'united-arab-emirates', 'lebanon', 'turkey', 'israel', 'saudi-arabia', 'qatar', 'kuwait', 'oman', 'jordan',
    'morocco', 'tunisia', 'algeria', 'egypt', 'libya', 'south-africa',
    'india', 'indonesia', 'malaysia', 'philippines', 'singapore', 'hong-kong',
    'brazil', 'mexico', 'argentina', 'chile', 'costa-rica', 'caribbean',
    'canada', 'australia', 'new-zealand', 'ireland',
    'poland', 'romania', 'hungary', 'czech-republic', 'slovakia', 'bulgaria', 'croatia', 'serbia', 'slovenia', 'albania', 'lithuania', 'ukraine', 'russia', 'azerbaijan',
    'austria', 'switzerland', 'luxembourg', 'malta', 'greece', 'nordic',
  ];

  // Build all URLs to check
  const urlsToCheck: { url: string; country: string; term: string }[] = [];
  for (const country of countries) {
    const countryCode = countryCodeMap[country] || country.split('-')[0];
    for (const term of uniqueTerms) {
      urlsToCheck.push(
        { url: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${country}/${term}-${countryCode}.png`, country, term },
        { url: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${country}/${term}.png`, country, term },
        { url: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/${country}/${term}-icon.png`, country, term },
      );
      
      // For beIN logos, also check the bein-sports subfolder
      if (term.includes('bein')) {
        urlsToCheck.push(
          { url: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/world-middle-east/bein-sports/${term}-mea.png`, country: 'world-middle-east/bein-sports', term },
          { url: `https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/world-middle-east/bein-sports/${term}-hz-mea.png`, country: 'world-middle-east/bein-sports', term },
        );
      }
    }
  }

  // Check URLs in parallel batches for speed (limit concurrency to avoid rate limiting)
  const batchSize = 50;
  for (let i = 0; i < urlsToCheck.length && candidates.length < 8; i += batchSize) {
    const batch = urlsToCheck.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async ({ url, country, term }) => {
        const response = await axios.head(url, { timeout: 2000 });
        if (response.status === 200) {
          return { url, source: `tv-logos (${country})`, name: term };
        }
        return null;
      })
    );
    
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        candidates.push(result.value);
        if (candidates.length >= 8) break;
      }
    }
  }

  return candidates;
}

/**
 * Download an image from URL and save it locally with optional background removal
 * Uses simple filenames (no timestamp) so URLs are predictable and stable
 */
export async function downloadAndSaveImage(
  imageUrl: string,
  channelName: string,
  removeBackground: boolean = true
): Promise<string> {
  // Use absolute path /media/images which is the mount point for persistent storage in the container
  // This maps to /storage-pool/iptv-media/images on the host
  const mediaPath = '/media/images';
  if (!fs.existsSync(mediaPath)) {
    fs.mkdirSync(mediaPath, { recursive: true });
  }

  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  const contentType = response.headers['content-type'] || '';
  if (!contentType.includes('image/')) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const sanitizedName = channelName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  // Use simple filename without timestamp for predictable URLs
  // This ensures DB logoUrl matches actual file path
  const filename = `${sanitizedName}.png`;
  const filePath = path.join(mediaPath, filename);
  const tempPath = path.join(mediaPath, `${sanitizedName}_temp.png`);
  
  // Clean up old timestamped versions of this logo (files starting with sanitizedName_)
  try {
    const existingFiles = fs.readdirSync(mediaPath);
    const oldVersions = existingFiles.filter(f => 
      f.startsWith(`${sanitizedName}_`) && f.endsWith('.png')
    );
    for (const oldFile of oldVersions) {
      try {
        fs.unlinkSync(path.join(mediaPath, oldFile));
        logger.info({ oldFile }, 'Cleaned up old timestamped logo version');
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  } catch (e) {
    // Ignore if directory read fails
  }

  // Save the original image first
  fs.writeFileSync(tempPath, response.data);

  if (removeBackground) {
    try {
      // Use Python script to remove background
      const { execSync } = await import('child_process');
      execSync(`python3 /opt/iptv-server/remove_bg.py "${tempPath}" "${filePath}"`, {
        timeout: 120000, // 120 second timeout (first run downloads model)
        stdio: 'pipe',
      });
      // Remove temp file
      fs.unlinkSync(tempPath);
      logger.info({ filename, channelName, imageUrl }, 'Logo saved with background removed');
    } catch (error) {
      logger.warn({ error, channelName }, 'Background removal failed, saving original');
      // If rembg fails, just rename temp to final
      fs.renameSync(tempPath, filePath);
    }
  } else {
    fs.renameSync(tempPath, filePath);
    logger.info({ filename, channelName, imageUrl }, 'Logo saved successfully');
  }

  return `/media/images/${filename}`;
}
