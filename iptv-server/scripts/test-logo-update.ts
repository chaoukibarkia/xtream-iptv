#!/usr/bin/env tsx
/**
 * Test Logo Update Script - Sample of 10 channels
 * Tests logo fetching on a small sample before running on all channels
 */

import { PrismaClient } from '@prisma/client';
import { fetchPossibleLogos, downloadAndSaveImage } from '../src/services/logos/LogoFetcher.js';
import { logger } from '../src/config/logger.js';

const prisma = new PrismaClient();

async function testLogoUpdate() {
  console.log('🧪 Testing logo update on 10 sample channels...\n');
  
  try {
    // Get 10 diverse sample streams
    const streams = await prisma.stream.findMany({
      where: { streamType: 'LIVE' },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
      take: 10,
      orderBy: { id: 'asc' },
    });
    
    console.log(`Testing on ${streams.length} channels:\n`);
    
    for (const stream of streams) {
      console.log(`\n📺 ${stream.name} (ID: ${stream.id})`);
      console.log(`   Current logo: ${stream.logoUrl || 'NONE'}`);
      
      try {
        const logos = await fetchPossibleLogos(stream.name);
        console.log(`   Found ${logos.length} logo candidates:`);
        
        logos.slice(0, 5).forEach((logo, i) => {
          console.log(`   ${i + 1}. [${logo.source}] ${logo.url.substring(0, 80)}`);
        });
        
        if (logos.length > 0) {
          console.log(`   ✅ Best candidate: ${logos[0].source}`);
        } else {
          console.log(`   ⚠️  No logos found`);
        }
      } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      // Wait a bit between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n\n✅ Test completed! Ready to run on all channels.\n');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testLogoUpdate();
