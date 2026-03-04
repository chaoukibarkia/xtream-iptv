#!/usr/bin/env tsx
/**
 * Consolidate External Logos Script
 * Downloads all external HTTP logo URLs and saves them locally to /media/images/
 * Updates database to use local paths
 */

import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { basename, extname } from 'path';
import { pipeline } from 'stream/promises';
import https from 'https';
import http from 'http';
import crypto from 'crypto';

const prisma = new PrismaClient();

interface LogoDownloadResult {
  streamId: number;
  streamName: string;
  originalUrl: string;
  localPath: string | null;
  success: boolean;
  error?: string;
}

// Use the persistent storage path that maps to /media/images inside the container
const MEDIA_DIR = '/storage-pool/iptv-media/images';
const MAX_CONCURRENT = 5;
const TIMEOUT_MS = 10000;

/**
 * Sanitize filename - remove special characters and limit length
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

/**
 * Generate unique filename from URL
 */
function generateFilename(url: string, streamName: string): string {
  const ext = extname(new URL(url).pathname) || '.png';
  const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
  const safeName = sanitizeFilename(streamName);
  
  return `${safeName}-${hash}${ext}`;
}

/**
 * Download image from URL
 */
async function downloadImage(url: string, filepath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const timeout = setTimeout(() => {
      reject(new Error('Download timeout'));
    }, TIMEOUT_MS);

    protocol.get(url, { timeout: TIMEOUT_MS }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        clearTimeout(timeout);
        if (response.headers.location) {
          return downloadImage(response.headers.location, filepath)
            .then(resolve)
            .catch(reject);
        }
      }

      if (response.statusCode !== 200) {
        clearTimeout(timeout);
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const fileStream = createWriteStream(filepath);
      pipeline(response, fileStream)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    }).on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Process a batch of streams
 */
async function processBatch(streams: any[]): Promise<LogoDownloadResult[]> {
  const results: LogoDownloadResult[] = [];

  for (const stream of streams) {
    const result: LogoDownloadResult = {
      streamId: stream.id,
      streamName: stream.name,
      originalUrl: stream.logoUrl,
      localPath: null,
      success: false,
    };

    try {
      const filename = generateFilename(stream.logoUrl, stream.name);
      const filepath = `${MEDIA_DIR}/${filename}`;
      const localPath = `/media/images/${filename}`;

      console.log(`[${stream.id}] Downloading: ${stream.name}`);
      console.log(`  From: ${stream.logoUrl}`);
      console.log(`  To: ${filepath}`);

      await downloadImage(stream.logoUrl, filepath);

      // Update database
      await prisma.stream.update({
        where: { id: stream.id },
        data: { logoUrl: localPath },
      });

      result.localPath = localPath;
      result.success = true;
      console.log(`  ✓ Success: ${localPath}`);
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      console.error(`  ✗ Failed: ${result.error}`);
      
      // Set default icon on failure
      try {
        await prisma.stream.update({
          where: { id: stream.id },
          data: { logoUrl: '/media/images/default-tv-icon.png' },
        });
        result.localPath = '/media/images/default-tv-icon.png';
        console.log(`  → Set default icon`);
      } catch (updateError) {
        console.error(`  ✗ Failed to set default icon`);
      }
    }

    results.push(result);
  }

  return results;
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(80));
  console.log('CONSOLIDATE EXTERNAL LOGOS');
  console.log('='.repeat(80));

  try {
    // Ensure media directory exists
    await mkdir(MEDIA_DIR, { recursive: true });
    console.log(`✓ Media directory ready: ${MEDIA_DIR}\n`);

    // Get all streams with external HTTP logos
    const streams = await prisma.stream.findMany({
      where: {
        streamType: 'LIVE',
        logoUrl: {
          startsWith: 'http',
        },
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    console.log(`Found ${streams.length} streams with external logos\n`);

    if (streams.length === 0) {
      console.log('Nothing to do!');
      return;
    }

    // Process in batches
    const allResults: LogoDownloadResult[] = [];
    for (let i = 0; i < streams.length; i += MAX_CONCURRENT) {
      const batch = streams.slice(i, i + MAX_CONCURRENT);
      console.log(`\nProcessing batch ${Math.floor(i / MAX_CONCURRENT) + 1}/${Math.ceil(streams.length / MAX_CONCURRENT)}`);
      console.log('-'.repeat(80));
      
      const results = await processBatch(batch);
      allResults.push(...results);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('SUMMARY');
    console.log('='.repeat(80));

    const successful = allResults.filter((r) => r.success && r.localPath !== '/media/images/default-tv-icon.png');
    const failed = allResults.filter((r) => !r.success || r.localPath === '/media/images/default-tv-icon.png');

    console.log(`Total streams processed: ${allResults.length}`);
    console.log(`Successfully downloaded: ${successful.length}`);
    console.log(`Failed (using default): ${failed.length}`);

    if (failed.length > 0) {
      console.log('\nFailed downloads:');
      failed.forEach((f) => {
        console.log(`  [${f.streamId}] ${f.streamName}: ${f.error || 'Unknown error'}`);
      });
    }

    console.log('\n✓ Logo consolidation complete!');
    console.log('All logos are now in /media/images/');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
