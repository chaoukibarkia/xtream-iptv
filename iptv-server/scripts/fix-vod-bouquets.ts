import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== FIXING VOD STREAMS ===\n');
  
  // Step 1: Find or create "Movies" category
  let moviesCategory = await prisma.category.findFirst({
    where: { name: 'Movies', type: StreamType.VOD },
  });
  
  if (!moviesCategory) {
    moviesCategory = await prisma.category.create({
      data: {
        name: 'Movies',
        type: StreamType.VOD,
        isActive: true,
        sortOrder: 0,
      },
    });
    console.log('Created "Movies" category');
  } else {
    console.log(`Found "Movies" category (ID: ${moviesCategory.id})`);
  }
  
  // Step 2: Find "Full Package" bouquet
  const fullPackageBouquet = await prisma.bouquet.findFirst({
    where: { name: 'Full Package' },
    orderBy: { id: 'asc' }, // Get the first one
  });
  
  if (!fullPackageBouquet) {
    console.error('Error: No "Full Package" bouquet found!');
    process.exit(1);
  }
  
  console.log(`Found "Full Package" bouquet (ID: ${fullPackageBouquet.id})\n`);
  
  // Step 3: Get all VOD streams that have categoryId but no many-to-many categories
  const vodStreamsToFix = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      categoryId: moviesCategory.id,
      categories: {
        none: {}, // No many-to-many categories assigned
      },
    },
  });
  
  console.log(`Found ${vodStreamsToFix.length} VOD streams to fix (in Movies category)`);
  
  let categoriesAdded = 0;
  let bouquetsAdded = 0;
  
  for (const stream of vodStreamsToFix) {
    try {
      // Add to StreamCategory junction table (many-to-many)
      await prisma.streamCategory.upsert({
        where: {
          streamId_categoryId: {
            streamId: stream.id,
            categoryId: moviesCategory.id,
          },
        },
        create: {
          streamId: stream.id,
          categoryId: moviesCategory.id,
          isPrimary: true,
        },
        update: {},
      });
      categoriesAdded++;
      
      // Add to bouquet
      const existingBouquetStream = await prisma.bouquetStream.findUnique({
        where: {
          bouquetId_streamId: {
            bouquetId: fullPackageBouquet.id,
            streamId: stream.id,
          },
        },
      });
      
      if (!existingBouquetStream) {
        await prisma.bouquetStream.create({
          data: {
            bouquetId: fullPackageBouquet.id,
            streamId: stream.id,
          },
        });
        bouquetsAdded++;
      }
      
      if (categoriesAdded % 20 === 0) {
        console.log(`Progress: ${categoriesAdded} categories added, ${bouquetsAdded} bouquet assignments added...`);
      }
    } catch (error) {
      console.error(`Error fixing stream ${stream.id} (${stream.name}):`, error);
    }
  }
  
  console.log(`\nFixed VOD streams:`);
  console.log(`  - Added to StreamCategory: ${categoriesAdded}`);
  console.log(`  - Added to bouquet: ${bouquetsAdded}`);
  
  // Step 4: Also fix any other VOD streams with old categoryId
  const otherVodStreams = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      categoryId: {
        not: null,
        not: moviesCategory.id, // Not the Movies category
      },
      categories: {
        none: {},
      },
    },
    include: {
      category: true,
    },
  });
  
  console.log(`\nFound ${otherVodStreams.length} other VOD streams with old categoryId to fix`);
  
  let otherCategoriesAdded = 0;
  let otherBouquetsAdded = 0;
  
  for (const stream of otherVodStreams) {
    try {
      if (stream.categoryId && stream.category) {
        // Add to StreamCategory junction table
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
        otherCategoriesAdded++;
        
        // Add to bouquet
        const existingBouquetStream = await prisma.bouquetStream.findUnique({
          where: {
            bouquetId_streamId: {
              bouquetId: fullPackageBouquet.id,
              streamId: stream.id,
            },
          },
        });
        
        if (!existingBouquetStream) {
          await prisma.bouquetStream.create({
            data: {
              bouquetId: fullPackageBouquet.id,
              streamId: stream.id,
            },
          });
          otherBouquetsAdded++;
        }
      }
    } catch (error) {
      console.error(`Error fixing stream ${stream.id} (${stream.name}):`, error);
    }
  }
  
  console.log(`Fixed other VOD streams:`);
  console.log(`  - Added to StreamCategory: ${otherCategoriesAdded}`);
  console.log(`  - Added to bouquet: ${otherBouquetsAdded}`);
  
  // Verification
  console.log('\n=== VERIFICATION ===');
  
  const totalVodInCategories = await prisma.stream.count({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      categories: {
        some: {},
      },
    },
  });
  console.log(`VOD streams with categories (many-to-many): ${totalVodInCategories}`);
  
  const totalVodInBouquets = await prisma.stream.count({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      bouquets: {
        some: {},
      },
    },
  });
  console.log(`VOD streams in bouquets: ${totalVodInBouquets}`);
  
  const moviesInCategory = await prisma.streamCategory.count({
    where: {
      categoryId: moviesCategory.id,
    },
  });
  console.log(`Movies in "Movies" category: ${moviesInCategory}`);
  
  console.log('\n=== FIX COMPLETE ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
