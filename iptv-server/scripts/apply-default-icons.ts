#!/usr/bin/env tsx
/**
 * Apply Default TV Icon to Channels Without Logos
 * Updates all channels that don't have a logo with a default TV icon
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEFAULT_LOGO_PATH = '/media/images/default-tv-icon.png';

async function applyDefaultIcons() {
  console.log('🎨 Applying default TV icon to channels without logos...\n');
  
  try {
    // Find all LIVE streams without logos
    const streamsWithoutLogos = await prisma.stream.findMany({
      where: {
        streamType: 'LIVE',
        OR: [
          { logoUrl: null },
          { logoUrl: '' },
        ],
      },
      select: {
        id: true,
        name: true,
      },
    });
    
    console.log(`📊 Found ${streamsWithoutLogos.length} channels without logos\n`);
    
    if (streamsWithoutLogos.length === 0) {
      console.log('✅ All channels already have logos!\n');
      await prisma.$disconnect();
      return;
    }
    
    console.log('🔄 Updating channels with default TV icon...\n');
    
    // Update all channels without logos
    const result = await prisma.stream.updateMany({
      where: {
        streamType: 'LIVE',
        OR: [
          { logoUrl: null },
          { logoUrl: '' },
        ],
      },
      data: {
        logoUrl: DEFAULT_LOGO_PATH,
      },
    });
    
    console.log(`✅ Successfully updated ${result.count} channels with default TV icon\n`);
    console.log(`📁 Default icon path: ${DEFAULT_LOGO_PATH}\n`);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

applyDefaultIcons();
