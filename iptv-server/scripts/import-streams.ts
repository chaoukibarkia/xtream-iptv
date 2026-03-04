import { PrismaClient, StreamType } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

interface ExternalCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

interface ExternalStream {
  stream_id: number;
  name: string;
  stream_type: string;
  stream_icon: string | null;
  epg_channel_id: string | null;
  category_id: string;
  tv_archive: number;
  tv_archive_duration: number;
}

const SOURCE_BASE_URL = 'http://ultimeiptv.net';
const SOURCE_USERNAME = 'nounou';
const SOURCE_PASSWORD = 'tt@S++2072';

async function main() {
  console.log('Starting import...');

  // Read JSON files
  const categories: ExternalCategory[] = JSON.parse(
    readFileSync('/tmp/categories.json', 'utf-8')
  );
  const streams: ExternalStream[] = JSON.parse(
    readFileSync('/tmp/streams.json', 'utf-8')
  );

  console.log(`Found ${categories.length} categories and ${streams.length} streams`);

  // Create a mapping from external category_id to internal category id
  const categoryMap = new Map<string, number>();

  // Import categories
  console.log('\n--- Importing categories ---');
  for (const cat of categories) {
    const existing = await prisma.category.findFirst({
      where: {
        name: cat.category_name,
        type: StreamType.LIVE,
      },
    });

    if (existing) {
      console.log(`Category exists: ${cat.category_name} (id: ${existing.id})`);
      categoryMap.set(cat.category_id, existing.id);
    } else {
      const created = await prisma.category.create({
        data: {
          name: cat.category_name,
          type: StreamType.LIVE,
          isActive: true,
          sortOrder: parseInt(cat.category_id) || 0,
        },
      });
      console.log(`Created category: ${cat.category_name} (id: ${created.id})`);
      categoryMap.set(cat.category_id, created.id);
    }
  }

  console.log(`\nCategory mapping complete: ${categoryMap.size} categories`);

  // Import streams
  console.log('\n--- Importing streams ---');
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const stream of streams) {
    try {
      const internalCategoryId = categoryMap.get(stream.category_id);

      if (!internalCategoryId) {
        console.log(`Skipping stream "${stream.name}" - category ${stream.category_id} not found`);
        skipped++;
        continue;
      }

      // Build source URL (Xtream format)
      const sourceUrl = `${SOURCE_BASE_URL}/live/${SOURCE_USERNAME}/${encodeURIComponent(SOURCE_PASSWORD)}/${stream.stream_id}.ts`;

      // Check if stream already exists by name in same category
      const existing = await prisma.stream.findFirst({
        where: {
          name: stream.name,
          categoryId: internalCategoryId,
          streamType: StreamType.LIVE,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      await prisma.stream.create({
        data: {
          name: stream.name,
          streamType: StreamType.LIVE,
          categoryId: internalCategoryId,
          sourceUrl: sourceUrl,
          logoUrl: stream.stream_icon || null,
          epgChannelId: stream.epg_channel_id || null,
          tvArchive: stream.tv_archive === 1,
          tvArchiveDuration: stream.tv_archive_duration || 0,
          isActive: true,
          sortOrder: stream.stream_id,
        },
      });

      created++;
      if (created % 100 === 0) {
        console.log(`Progress: ${created} streams created...`);
      }
    } catch (error) {
      console.error(`Error importing stream "${stream.name}":`, error);
      errors++;
    }
  }

  console.log('\n--- Import complete ---');
  console.log(`Created: ${created} streams`);
  console.log(`Skipped: ${skipped} streams (already exist or no category)`);
  console.log(`Errors: ${errors} streams`);

  // Summary
  const totalCategories = await prisma.category.count({ where: { type: StreamType.LIVE } });
  const totalStreams = await prisma.stream.count({ where: { streamType: StreamType.LIVE } });

  console.log(`\nDatabase totals:`);
  console.log(`- Live categories: ${totalCategories}`);
  console.log(`- Live streams: ${totalStreams}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
