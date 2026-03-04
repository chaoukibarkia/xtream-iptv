import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateCategoryRelations() {
  console.log('🚀 Starting category migration...\n');

  // Step 1: Migrate Stream categories
  console.log('📺 Migrating VOD stream categories...');
  const streams = await prisma.stream.findMany({
    where: {
      categoryId: { not: null },
    },
    select: {
      id: true,
      name: true,
      categoryId: true,
      streamType: true,
    },
  });

  console.log(`Found ${streams.length} streams with categories`);

  let streamMigrated = 0;
  for (const stream of streams) {
    if (stream.categoryId) {
      // Check if already migrated
      const existing = await prisma.streamCategory.findUnique({
        where: {
          streamId_categoryId: {
            streamId: stream.id,
            categoryId: stream.categoryId,
          },
        },
      });

      if (!existing) {
        await prisma.streamCategory.create({
          data: {
            streamId: stream.id,
            categoryId: stream.categoryId,
            isPrimary: true, // Mark as primary category
          },
        });
        streamMigrated++;
        console.log(`  ✓ Migrated: "${stream.name}" (${stream.streamType})`);
      } else {
        console.log(`  → Already migrated: "${stream.name}"`);
      }
    }
  }

  console.log(`✅ Migrated ${streamMigrated} stream categories\n`);

  // Step 2: Migrate Series categories
  console.log('📺 Migrating series categories...');
  const series = await prisma.series.findMany({
    where: {
      categoryId: { not: null },
    },
    select: {
      id: true,
      name: true,
      categoryId: true,
    },
  });

  console.log(`Found ${series.length} series with categories`);

  let seriesMigrated = 0;
  for (const s of series) {
    if (s.categoryId) {
      // Check if already migrated
      const existing = await prisma.seriesCategory.findUnique({
        where: {
          seriesId_categoryId: {
            seriesId: s.id,
            categoryId: s.categoryId,
          },
        },
      });

      if (!existing) {
        await prisma.seriesCategory.create({
          data: {
            seriesId: s.id,
            categoryId: s.categoryId,
            isPrimary: true, // Mark as primary category
          },
        });
        seriesMigrated++;
        console.log(`  ✓ Migrated: "${s.name}"`);
      } else {
        console.log(`  → Already migrated: "${s.name}"`);
      }
    }
  }

  console.log(`✅ Migrated ${seriesMigrated} series categories\n`);

  // Step 3: Verify migration
  console.log('🔍 Verifying migration...\n');

  const streamCategoryCount = await prisma.streamCategory.count();
  const seriesCategoryCount = await prisma.seriesCategory.count();

  console.log(`StreamCategory records: ${streamCategoryCount}`);
  console.log(`SeriesCategory records: ${seriesCategoryCount}`);

  // Show sample migrated data
  console.log('\n📊 Sample migrated VOD streams:');
  const sampleStreams = await prisma.stream.findMany({
    where: { streamType: 'VOD' },
    take: 3,
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  for (const stream of sampleStreams) {
    console.log(`\n  "${stream.name}"`);
    console.log(`  Categories (${stream.categories.length}):`);
    for (const sc of stream.categories) {
      console.log(`    - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
    }
  }

  console.log('\n📊 Sample migrated series:');
  const sampleSeries = await prisma.series.findMany({
    take: 3,
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  for (const s of sampleSeries) {
    console.log(`\n  "${s.name}"`);
    console.log(`  Categories (${s.categories.length}):`);
    for (const sc of s.categories) {
      console.log(`    - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
    }
  }

  console.log('\n\n✅ Migration completed successfully!');
  console.log('📝 All existing category relationships have been preserved.');
  console.log('💡 You can now assign multiple categories to streams and series.\n');
}

migrateCategoryRelations()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
