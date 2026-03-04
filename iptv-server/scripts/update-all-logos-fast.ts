#!/usr/bin/env tsx
/**
 * Bulk Logo Update Script - OPTIMIZED PARALLEL VERSION
 * Fetches and saves logos for ALL LIVE streams in the database
 * Processes channels in parallel batches for faster execution
 */

import { PrismaClient } from '@prisma/client';
import { fetchPossibleLogos, downloadAndSaveImage } from '../src/services/logos/LogoFetcher.js';
import { logger } from '../src/config/logger.js';

const prisma = new PrismaClient();

interface UpdateStats {
  total: number;
  updated: number;
  failed: number;
  skipped: number;
  processed: number;
  errors: Array<{ id: number; name: string; error: string }>;
}

const stats: UpdateStats = {
  total: 0,
  updated: 0,
  failed: 0,
  skipped: 0,
  processed: 0,
  errors: [],
};

// Configuration
const BATCH_SIZE = 20; // Process 20 channels in parallel
const RETRY_LIMIT = 2; // Try up to 2 logo candidates per channel
const DEFAULT_LOGO_PATH = '/media/images/default-tv-icon.png'; // Default TV icon for channels without logos

/**
 * Update logo for a single stream
 */
async function updateStreamLogo(stream: { id: number; name: string; logoUrl: string | null }): Promise<boolean> {
  try {
    // Fetch possible logos
    const logos = await fetchPossibleLogos(stream.name);
    
    if (logos.length === 0) {
      // No logos found - use default TV icon
      await prisma.stream.update({
        where: { id: stream.id },
        data: { logoUrl: DEFAULT_LOGO_PATH },
      });
      stats.skipped++;
      return false;
    }
    
    // Try to download the best logos (up to RETRY_LIMIT attempts)
    for (let i = 0; i < Math.min(RETRY_LIMIT, logos.length); i++) {
      const logo = logos[i];
      try {
        // Download and save (with background removal)
        const localPath = await downloadAndSaveImage(logo.url, stream.name, true);
        
        // Update stream in database
        await prisma.stream.update({
          where: { id: stream.id },
          data: { logoUrl: localPath },
        });
        
        stats.updated++;
        return true;
      } catch (error: any) {
        // Try next logo candidate
        continue;
      }
    }
    
    // All attempts failed - use default TV icon
    await prisma.stream.update({
      where: { id: stream.id },
      data: { logoUrl: DEFAULT_LOGO_PATH },
    });
    stats.failed++;
    stats.errors.push({
      id: stream.id,
      name: stream.name,
      error: 'All logo downloads failed - using default icon',
    });
    return false;
  } catch (error: any) {
    // Error during processing - use default TV icon
    try {
      await prisma.stream.update({
        where: { id: stream.id },
        data: { logoUrl: DEFAULT_LOGO_PATH },
      });
    } catch (dbError) {
      // Ignore database update errors
    }
    stats.failed++;
    stats.errors.push({
      id: stream.id,
      name: stream.name,
      error: error.message,
    });
    return false;
  } finally {
    stats.processed++;
  }
}

/**
 * Process a batch of streams in parallel
 */
async function processBatch(streams: Array<{ id: number; name: string; logoUrl: string | null }>): Promise<void> {
  await Promise.allSettled(streams.map(stream => updateStreamLogo(stream)));
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting OPTIMIZED bulk logo update for ALL LIVE channels...\n');
  console.log(`⚡ Parallel processing: ${BATCH_SIZE} channels at a time\n`);
  
  const startTime = Date.now();
  
  try {
    // Get all LIVE streams
    const streams = await prisma.stream.findMany({
      where: { streamType: 'LIVE' },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      orderBy: { name: 'asc' },
    });
    
    stats.total = streams.length;
    
    console.log(`📊 Found ${stats.total} LIVE channels`);
    console.log(`   - With logos: ${streams.filter(s => s.logoUrl).length}`);
    console.log(`   - Without logos: ${streams.filter(s => !s.logoUrl).length}`);
    console.log(`\n🔄 Processing all channels in batches of ${BATCH_SIZE}...\n`);
    
    // Process in batches
    for (let i = 0; i < streams.length; i += BATCH_SIZE) {
      const batch = streams.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(streams.length / BATCH_SIZE);
      
      const batchStart = Date.now();
      
      console.log(`\n[Batch ${batchNum}/${totalBatches}] Processing ${batch.length} channels...`);
      await processBatch(batch);
      
      const batchTime = ((Date.now() - batchStart) / 1000).toFixed(1);
      const avgTime = ((Date.now() - startTime) / stats.processed).toFixed(0);
      const remainingChannels = streams.length - stats.processed;
      const etaSeconds = Math.round((remainingChannels * parseInt(avgTime)) / 1000);
      const etaMinutes = Math.round(etaSeconds / 60);
      
      console.log(`  ✅ Updated: ${stats.updated} | ⚠️ Skipped: ${stats.skipped} | ❌ Failed: ${stats.failed}`);
      console.log(`  ⏱️ Batch time: ${batchTime}s | Avg: ${avgTime}ms/channel | ETA: ${etaMinutes}min`);
    }
    
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    
    // Print final statistics
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(70));
    console.log(`Total channels:     ${stats.total}`);
    console.log(`✅ Updated:         ${stats.updated} (${((stats.updated / stats.total) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Skipped:         ${stats.skipped} (${((stats.skipped / stats.total) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed:          ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
    console.log(`⏱️  Total time:      ${totalTime} minutes`);
    console.log('='.repeat(70));
    
    if (stats.errors.length > 0) {
      console.log('\n❌ ERRORS (showing first 30):');
      console.log('-'.repeat(70));
      stats.errors.slice(0, 30).forEach((err, i) => {
        console.log(`${i + 1}. [ID ${err.id}] ${err.name}`);
        console.log(`   Error: ${err.error}`);
      });
      if (stats.errors.length > 30) {
        console.log(`\n... and ${stats.errors.length - 30} more errors`);
      }
    }
    
    console.log('\n✅ Bulk logo update completed!\n');
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
