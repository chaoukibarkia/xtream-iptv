#!/usr/bin/env tsx
/**
 * Bulk Logo Update Script
 * Fetches and saves logos for ALL LIVE streams in the database
 * Replaces existing logos and adds logos for channels without them
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
  errors: Array<{ id: number; name: string; error: string }>;
}

const stats: UpdateStats = {
  total: 0,
  updated: 0,
  failed: 0,
  skipped: 0,
  errors: [],
};

/**
 * Update logo for a single stream
 */
async function updateStreamLogo(stream: { id: number; name: string; logoUrl: string | null }): Promise<boolean> {
  try {
    console.log(`\n[${stats.updated + stats.failed + stats.skipped + 1}/${stats.total}] Processing: ${stream.name} (ID: ${stream.id})`);
    
    // Fetch possible logos
    const logos = await fetchPossibleLogos(stream.name);
    
    if (logos.length === 0) {
      console.log(`  ⚠️  No logos found for: ${stream.name}`);
      stats.skipped++;
      return false;
    }
    
    console.log(`  ✓ Found ${logos.length} logo candidates`);
    
    // Try to download the best logo (first one, as they're ranked by quality)
    let downloaded = false;
    let lastError: Error | null = null;
    
    for (let i = 0; i < Math.min(3, logos.length); i++) {
      const logo = logos[i];
      try {
        console.log(`  → Trying logo ${i + 1}: ${logo.source} - ${logo.url.substring(0, 60)}...`);
        
        // Download and save (with background removal)
        const localPath = await downloadAndSaveImage(logo.url, stream.name, true);
        
        // Update stream in database
        await prisma.stream.update({
          where: { id: stream.id },
          data: { logoUrl: localPath },
        });
        
        console.log(`  ✅ Logo saved: ${localPath}`);
        stats.updated++;
        downloaded = true;
        break;
      } catch (error: any) {
        console.log(`  ⚠️  Failed to download logo ${i + 1}: ${error.message}`);
        lastError = error;
        // Try next logo candidate
        continue;
      }
    }
    
    if (!downloaded) {
      console.log(`  ❌ All logo downloads failed for: ${stream.name}`);
      stats.failed++;
      stats.errors.push({
        id: stream.id,
        name: stream.name,
        error: lastError?.message || 'All candidates failed',
      });
      return false;
    }
    
    return true;
  } catch (error: any) {
    console.error(`  ❌ Error processing ${stream.name}:`, error.message);
    stats.failed++;
    stats.errors.push({
      id: stream.id,
      name: stream.name,
      error: error.message,
    });
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Starting bulk logo update for ALL LIVE channels...\n');
  
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
    console.log(`\n🔄 Processing all channels (this may take a while)...\n`);
    
    // Process streams one by one (to avoid rate limiting and memory issues)
    for (const stream of streams) {
      await updateStreamLogo(stream);
      
      // Add a small delay to avoid hammering external services
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Print final statistics
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 FINAL STATISTICS');
    console.log('='.repeat(70));
    console.log(`Total channels:     ${stats.total}`);
    console.log(`✅ Updated:         ${stats.updated} (${((stats.updated / stats.total) * 100).toFixed(1)}%)`);
    console.log(`⚠️  Skipped:         ${stats.skipped} (${((stats.skipped / stats.total) * 100).toFixed(1)}%)`);
    console.log(`❌ Failed:          ${stats.failed} (${((stats.failed / stats.total) * 100).toFixed(1)}%)`);
    console.log('='.repeat(70));
    
    if (stats.errors.length > 0) {
      console.log('\n❌ ERRORS:');
      console.log('-'.repeat(70));
      stats.errors.slice(0, 50).forEach((err, i) => {
        console.log(`${i + 1}. [ID ${err.id}] ${err.name}`);
        console.log(`   Error: ${err.error}`);
      });
      if (stats.errors.length > 50) {
        console.log(`\n... and ${stats.errors.length - 50} more errors`);
      }
    }
    
    console.log('\n✅ Bulk logo update completed!\n');
    
  } catch (error: any) {
    console.error('❌ Fatal error:', error.message);
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
