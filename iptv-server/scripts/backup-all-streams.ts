import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function backupAllStreams() {
  console.log('📦 Starting full stream backup...\n');

  try {
    // Fetch all streams with their relations
    const streams = await prisma.stream.findMany({
      include: {
        category: true,
        categories: {
          include: {
            category: {
              include: {
                parent: true,
              },
            },
          },
        },
        originServer: true,
        serverDistribution: {
          include: {
            server: true,
          },
        },
      },
    });

    console.log(`✅ Fetched ${streams.length} streams from database`);

    // Create backup directory if it doesn't exist
    const backupDir = join(dirname(__dirname), 'backups');
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    // Generate timestamp for filename
    const timestamp = Date.now();
    const backupPath = join(backupDir, `streams-full-backup-${timestamp}.json`);

    // Write backup file
    writeFileSync(backupPath, JSON.stringify(streams, null, 2));

    const stats = statSync(backupPath);
    const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`\n✅ Backup completed successfully!`);
    console.log(`📁 File: ${backupPath}`);
    console.log(`📊 Size: ${fileSizeInMB} MB`);
    console.log(`🎯 Streams backed up: ${streams.length}`);

    // Show summary by stream type
    const summary = streams.reduce((acc, stream) => {
      const type = stream.streamType;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📈 Stream Types:');
    Object.entries(summary).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Show summary by active status
    const activeCount = streams.filter(s => s.isActive).length;
    const inactiveCount = streams.length - activeCount;
    console.log('\n📊 Status:');
    console.log(`   Active: ${activeCount}`);
    console.log(`   Inactive: ${inactiveCount}`);

  } catch (error) {
    console.error('❌ Error during backup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backupAllStreams();
