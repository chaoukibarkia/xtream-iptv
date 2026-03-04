import { PrismaClient } from '@prisma/client';
import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

const FLAGS_DIR = join(__dirname, '..', 'public', 'flags');

async function downloadFlag(url: string, countryCode: string): Promise<string> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }

    const filename = `${countryCode.toLowerCase()}.svg`;
    const filepath = join(FLAGS_DIR, filename);
    
    // Create write stream and download
    const fileStream = createWriteStream(filepath);
    await pipeline(response.body as any, fileStream);
    
    console.log(`✅ Downloaded ${countryCode}: ${filename}`);
    return `/flags/${filename}`;
  } catch (error) {
    console.error(`❌ Failed to download ${countryCode}:`, error);
    throw error;
  }
}

async function main() {
  console.log('🏁 Downloading country flags locally...\n');

  try {
    // Ensure flags directory exists
    await mkdir(FLAGS_DIR, { recursive: true });
    console.log(`📁 Flags directory: ${FLAGS_DIR}\n`);

    // Get all parent categories with flags
    const categories = await prisma.category.findMany({
      where: {
        parentId: null,
        countryCode: { not: null },
        flagSvgUrl: { not: null },
      },
    });

    console.log(`Found ${categories.length} categories with flags\n`);

    let downloaded = 0;
    let failed = 0;

    for (const category of categories) {
      if (!category.countryCode || !category.flagSvgUrl) continue;

      try {
        const localPath = await downloadFlag(category.flagSvgUrl, category.countryCode);
        
        // Update database with local path
        await prisma.category.update({
          where: { id: category.id },
          data: { flagSvgUrl: localPath },
        });

        downloaded++;
      } catch (error) {
        failed++;
      }
    }

    console.log(`\n✅ Downloaded ${downloaded} flags`);
    if (failed > 0) {
      console.log(`❌ Failed to download ${failed} flags`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
