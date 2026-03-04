import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DIAGNOSING VOD API ISSUE ===\n');
  
  // Check VOD streams
  const vodStreams = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD, isActive: true },
  });
  console.log(`Total active VOD streams: ${vodStreams.length}`);
  
  // Check if VOD streams have categories assigned (many-to-many)
  const vodStreamsWithCategories = await prisma.stream.findMany({
    where: { 
      streamType: StreamType.VOD, 
      isActive: true,
      categories: {
        some: {},
      },
    },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });
  console.log(`VOD streams with categories (many-to-many): ${vodStreamsWithCategories.length}`);
  
  // Check VOD streams with old categoryId field
  const vodStreamsWithOldCategory = await prisma.stream.findMany({
    where: { 
      streamType: StreamType.VOD, 
      isActive: true,
      categoryId: {
        not: null,
      },
    },
  });
  console.log(`VOD streams with old categoryId field: ${vodStreamsWithOldCategory.length}`);
  
  // Check bouquets
  const bouquets = await prisma.bouquet.findMany({
    include: {
      _count: {
        select: { streams: true, lines: true },
      },
    },
  });
  console.log(`\nBouquets: ${bouquets.length}`);
  bouquets.forEach(b => {
    console.log(`  - ${b.name}: ${b._count.streams} streams, ${b._count.lines} lines`);
  });
  
  // Check if VOD streams are in bouquets
  const vodStreamsInBouquets = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      bouquets: {
        some: {},
      },
    },
  });
  console.log(`\nVOD streams assigned to bouquets: ${vodStreamsInBouquets.length}`);
  
  // Check IPTV lines
  const lines = await prisma.iptvLine.findMany({
    include: {
      bouquets: {
        include: {
          bouquet: true,
        },
      },
    },
    take: 5,
  });
  console.log(`\nSample IPTV lines (showing 5):`);
  lines.forEach(line => {
    console.log(`  - ${line.username}: ${line.bouquets.length} bouquets assigned`);
    line.bouquets.forEach(lb => {
      console.log(`    * ${lb.bouquet.name}`);
    });
  });
  
  // Check VOD categories
  const vodCategories = await prisma.category.findMany({
    where: { type: StreamType.VOD, isActive: true },
    include: {
      streamCategories: {
        include: {
          stream: true,
        },
      },
    },
  });
  console.log(`\nVOD categories with stream assignments:`);
  vodCategories.forEach(cat => {
    console.log(`  - ${cat.name}: ${cat.streamCategories.length} streams (many-to-many)`);
  });
  
  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
