import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addStreamsToBouquets() {
  console.log('Adding all streams to all bouquets...\n');

  try {
    // Get all bouquets
    const bouquets = await prisma.bouquet.findMany();
    console.log(`Found ${bouquets.length} bouquets`);

    // Get all stream IDs
    const streams = await prisma.stream.findMany({
      select: { id: true },
    });
    console.log(`Found ${streams.length} streams\n`);

    for (const bouquet of bouquets) {
      console.log(`Processing: ${bouquet.name} (ID: ${bouquet.id})`);

      // Delete existing relations for this bouquet
      const deleted = await prisma.bouquetStream.deleteMany({
        where: { bouquetId: bouquet.id },
      });
      console.log(`  Deleted ${deleted.count} existing relations`);

      // Add all streams to this bouquet in batches
      const batchSize = 100;
      let added = 0;

      for (let i = 0; i < streams.length; i += batchSize) {
        const batch = streams.slice(i, i + batchSize);
        
        await prisma.bouquetStream.createMany({
          data: batch.map((stream) => ({
            bouquetId: bouquet.id,
            streamId: stream.id,
          })),
          skipDuplicates: true,
        });

        added += batch.length;
      }

      console.log(`  Added ${added} streams to ${bouquet.name}`);
    }

    // Verify results
    console.log('\n--- Verification ---\n');

    const updatedBouquets = await prisma.bouquet.findMany({
      include: {
        _count: { select: { streams: true } },
      },
      orderBy: { name: 'asc' },
    });

    for (const b of updatedBouquets) {
      console.log(`${b.name.padEnd(30)} | ${b._count.streams} streams`);
    }

    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addStreamsToBouquets();
