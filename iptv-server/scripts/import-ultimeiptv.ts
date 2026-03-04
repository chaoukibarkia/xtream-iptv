import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Server IDs based on existing database
const SERVERS = {
  ORIGIN: 2,    // edge-s02 - origin server (pulls from source)
  CHILD_1: 3,   // edge-s03 - child server (pulls from s02)
  CHILD_2: 4,   // edge-s04 - child server (pulls from s02)
};

interface ApiCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface ApiStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
  category_id: string;
  category_ids: number[];
  thumbnail: string;
}

/**
 * Format channel name from API:
 * - Remove common prefixes (HD, FHD, 4K, SD, etc.)
 * - Convert to proper case (not all uppercase)
 * - Clean up extra spaces and special characters
 */
function formatChannelName(rawName: string): string {
  let name = rawName.trim();
  
  // Remove quality indicators at the start or end
  name = name.replace(/^(HD|FHD|4K|SD|UHD|HEVC|H\.264|H264)\s+/i, '');
  name = name.replace(/\s+(HD|FHD|4K|SD|UHD|HEVC|H\.264|H264)$/i, '');
  
  // Remove leading special characters like ★, ●, ◆, etc.
  name = name.replace(/^[★●◆▶►•·⚫⭐🔴🟢🔵⚪]+\s*/g, '');
  
  // Remove pipe separators and content after them (e.g., "Channel | FR")
  name = name.split('|')[0].trim();
  name = name.split('  ')[0].trim();
  
  // Convert from all UPPERCASE to Proper Case if entirely uppercase
  if (name === name.toUpperCase() && name.length > 2) {
    name = name
      .toLowerCase()
      .split(' ')
      .map(word => {
        // Keep certain words lowercase (articles, conjunctions)
        if (['de', 'la', 'le', 'les', 'du', 'des', 'et', 'ou', 'and', 'of', 'the'].includes(word)) {
          return word;
        }
        // Capitalize first letter
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
    
    // Capitalize first word regardless
    if (name.length > 0) {
      name = name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  
  // Clean up multiple spaces
  name = name.replace(/\s+/g, ' ').trim();
  
  return name;
}

/**
 * Format category name
 */
function formatCategoryName(rawName: string): string {
  let name = rawName.trim();
  
  // Remove leading special characters
  name = name.replace(/^[★●◆▶►•·⚫⭐🔴🟢🔵⚪]+\s*/g, '');
  
  // Convert to proper case if all uppercase
  if (name === name.toUpperCase() && name.length > 2) {
    name = name
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  return name.trim();
}

async function importFromUltimeIPTV() {
  const baseUrl = 'http://ultimeiptv.net/player_api.php';
  const username = 'nounou';
  const password = 'tt@S++2072';
  // URL encode the password for API calls
  const encodedPassword = encodeURIComponent(password);
  
  try {
    console.log('🚀 Starting import from UltimeIPTV...\n');
    console.log('📡 Server distribution:');
    console.log('   - Origin (tier 0): edge-s02 (id: 2) - pulls from source');
    console.log('   - Child (tier 1): edge-s03 (id: 3) - pulls from s02');
    console.log('   - Child (tier 1): edge-s04 (id: 4) - pulls from s02');
    console.log('');
    
    // Verify servers exist
    const originServer = await prisma.server.findUnique({ where: { id: SERVERS.ORIGIN } });
    if (!originServer) {
      throw new Error(`Origin server (id: ${SERVERS.ORIGIN}) not found in database`);
    }
    console.log(`✅ Origin server found: ${originServer.name} (${originServer.domain})\n`);
    
    // Fetch categories
    console.log('📂 Fetching categories...');
    const categoriesUrl = `${baseUrl}?username=${username}&password=${encodedPassword}&action=get_live_categories`;
    const categoriesResponse = await fetch(categoriesUrl);
    const categories: ApiCategory[] = await categoriesResponse.json();
    
    console.log(`Found ${categories.length} categories\n`);
    
    // Import categories
    const categoryMap = new Map<string, number>();
    let importedCategories = 0;
    
    for (const apiCategory of categories) {
      const formattedName = formatCategoryName(apiCategory.category_name);
      
      // Check if category already exists
      let category = await prisma.category.findFirst({
        where: { 
          name: formattedName,
          type: 'LIVE'
        }
      });
      
      if (!category) {
        category = await prisma.category.create({
          data: {
            name: formattedName,
            type: 'LIVE',
          }
        });
        importedCategories++;
        console.log(`✅ Created category: ${formattedName}`);
      } else {
        console.log(`⏭️  Category exists: ${formattedName}`);
      }
      
      categoryMap.set(apiCategory.category_id, category.id);
    }
    
    console.log(`\n📊 Imported ${importedCategories} new categories\n`);
    
    // Fetch live streams
    console.log('📺 Fetching live streams...');
    const streamsUrl = `${baseUrl}?username=${username}&password=${encodedPassword}&action=get_live_streams`;
    const streamsResponse = await fetch(streamsUrl);
    const streams: ApiStream[] = await streamsResponse.json();
    
    console.log(`Found ${streams.length} streams\n`);
    
    // Import streams
    let importedStreams = 0;
    let skippedStreams = 0;
    
    for (const apiStream of streams) {
      const formattedName = formatChannelName(apiStream.name);
      
      // Get category ID (use first category if multiple)
      const categoryId = apiStream.category_id 
        ? categoryMap.get(apiStream.category_id) 
        : (apiStream.category_ids && apiStream.category_ids.length > 0 
          ? categoryMap.get(apiStream.category_ids[0].toString())
          : undefined);
      
      if (!categoryId) {
        console.log(`⚠️  Skipping stream "${formattedName}" - no category mapping`);
        skippedStreams++;
        continue;
      }
      
      // Build source URL
      const sourceUrl = `http://ultimeiptv.net/${username}/${password}/${apiStream.stream_id}`;
      
      // Check if stream already exists (by name and category)
      const existingStream = await prisma.stream.findFirst({
        where: {
          name: formattedName,
          categoryId: categoryId
        }
      });
      
      if (existingStream) {
        console.log(`⏭️  Stream exists: ${formattedName}`);
        skippedStreams++;
        continue;
      }
      
      // Create stream
      try {
        const createdStream = await prisma.stream.create({
          data: {
            name: formattedName,
            streamType: 'LIVE',
            categoryId: categoryId,
            sourceUrl: sourceUrl,
            originServerId: SERVERS.ORIGIN, // s02 as origin
            isActive: true,
            alwaysOn: false, // NOT always on - on-demand only
            logoUrl: apiStream.stream_icon || apiStream.thumbnail || undefined,
            epgChannelId: apiStream.epg_channel_id || undefined,
            tvArchive: apiStream.tv_archive === 1,
            tvArchiveDuration: apiStream.tv_archive_duration || 0,
          }
        });
        
        // Create server distribution: s02 = origin, s03 & s04 = children
        await prisma.streamServerDistribution.createMany({
          data: [
            // s02 as origin (tier 0)
            {
              streamId: createdStream.id,
              serverId: SERVERS.ORIGIN,
              role: 'ORIGIN',
              tier: 0,
              pullFromServerId: null,
              isActive: true,
              priority: 100,
            },
            // s03 as child (tier 1) - pulls from s02
            {
              streamId: createdStream.id,
              serverId: SERVERS.CHILD_1,
              role: 'CHILD',
              tier: 1,
              pullFromServerId: SERVERS.ORIGIN,
              isActive: true,
              priority: 100,
            },
            // s04 as child (tier 1) - pulls from s02
            {
              streamId: createdStream.id,
              serverId: SERVERS.CHILD_2,
              role: 'CHILD',
              tier: 1,
              pullFromServerId: SERVERS.ORIGIN,
              isActive: true,
              priority: 100,
            },
          ],
        });
        
        importedStreams++;
        console.log(`✅ Created stream: ${formattedName}`);
      } catch (error: any) {
        console.error(`❌ Failed to create stream "${formattedName}": ${error.message}`);
        skippedStreams++;
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Import Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Categories imported: ${importedCategories}`);
    console.log(`✅ Streams imported: ${importedStreams}`);
    console.log(`⏭️  Streams skipped: ${skippedStreams}`);
    console.log(`📺 Total streams processed: ${streams.length}`);
    console.log('');
    console.log('📡 Server Distribution (per stream):');
    console.log('   - Origin: edge-s02 (tier 0)');
    console.log('   - Child:  edge-s03 (tier 1) ← pulls from s02');
    console.log('   - Child:  edge-s04 (tier 1) ← pulls from s02');
    console.log('='.repeat(60) + '\n');
    
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
importFromUltimeIPTV().catch(console.error);
