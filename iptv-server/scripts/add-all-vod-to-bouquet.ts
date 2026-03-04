import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== ADDING ALL VOD STREAMS TO BOUQUET ===\n');
  
  // Find "Full Package" bouquet
  const fullPackageBouquet = await prisma.bouquet.findFirst({
    where: { name: 'Full Package' },
    orderBy: { id: 'asc' },
  });
  
  if (!fullPackageBouquet) {
    console.error('Error: No "Full Package" bouquet found!');
    process.exit(1);
  }
  
  console.log(`Found "Full Package" bouquet (ID: ${fullPackageBouquet.id})\n`);
  
  // Get ALL active VOD streams not in any bouquet
  const vodStreamsNotInBouquets = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      bouquets: {
        none: {},
      },
    },
  });
  
  console.log(`Found ${vodStreamsNotInBouquets.length} VOD streams not in any bouquet`);
  
  let added = 0;
  
  for (const stream of vodStreamsNotInBouquets) {
    try {
      await prisma.bouquetStream.create({
        data: {
          bouquetId: fullPackageBouquet.id,
          streamId: stream.id,
        },
      });
      added++;
      
      if (added % 20 === 0) {
        console.log(`Progress: ${added} streams added to bouquet...`);
      }
    } catch (error) {
      console.error(`Error adding stream ${stream.id} (${stream.name}):`, error);
    }
  }
  
  console.log(`\nAdded ${added} VOD streams to "Full Package" bouquet`);
  
  // Also fix StreamCategory for streams with old categoryId
  const vodStreamsNeedingCategoryFix = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      categoryId: {
        not: null,
      },
      categories: {
        none: {},
      },
    },
  });
  
  console.log(`\nFound ${vodStreamsNeedingCategoryFix.length} VOD streams needing category fix`);
  
  let categoriesAdded = 0;
  
  for (const stream of vodStreamsNeedingCategoryFix) {
    try {
      if (stream.categoryId) {
        await prisma.streamCategory.upsert({
          where: {
            streamId_categoryId: {
              streamId: stream.id,
              categoryId: stream.categoryId,
            },
          },
          create: {
            streamId: stream.id,
            categoryId: stream.categoryId,
            isPrimary: true,
          },
          update: {},
        });
        categoriesAdded++;
      }
    } catch (error) {
      console.error(`Error fixing category for stream ${stream.id}:`, error);
    }
  }
  
  console.log(`Added ${categoriesAdded} category assignments`);
  
  // Verification
  console.log('\n=== VERIFICATION ===');
  
  const totalVodInBouquets = await prisma.stream.count({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      bouquets: {
        some: {},
      },
    },
  });
  
  const totalVod = await prisma.stream.count({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
    },
  });
  
  console.log(`Total active VOD streams: ${totalVod}`);
  console.log(`VOD streams in bouquets: ${totalVodInBouquets}`);
  console.log(`VOD streams NOT in bouquets: ${totalVod - totalVodInBouquets}`);
  
  const totalVodWithCategories = await prisma.stream.count({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      categories: {
        some: {},
      },
    },
  });
  console.log(`VOD streams with categories (many-to-many): ${totalVodWithCategories}`);
  
  console.log('\n=== COMPLETE ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
