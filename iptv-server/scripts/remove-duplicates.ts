import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Removing Duplicate Channels ===\n');

  // Find all duplicate channel names for LIVE type
  const duplicates = await prisma.$queryRaw<{name: string, count: bigint}[]>`
    SELECT name, COUNT(*) as count 
    FROM "Stream" 
    WHERE "streamType" = 'LIVE'
    GROUP BY name 
    HAVING COUNT(*) > 1 
    ORDER BY count DESC, name
  `;

  console.log(`Found ${duplicates.length} channel names with duplicates\n`);

  let totalRemoved = 0;
  let totalKept = 0;

  for (const dup of duplicates) {
    // Get all streams with this name, ordered by ID (keep lowest ID)
    const streams = await prisma.stream.findMany({
      where: { name: dup.name, streamType: 'LIVE' },
      orderBy: { id: 'asc' }
    });

    // Keep the first one (lowest ID), delete the rest
    const toKeep = streams[0];
    const toDelete = streams.slice(1);

    if (toDelete.length > 0) {
      // Delete duplicate streams
      await prisma.stream.deleteMany({
        where: {
          id: { in: toDelete.map(s => s.id) }
        }
      });

      console.log(`"${dup.name}": kept ID ${toKeep.id}, removed ${toDelete.length} duplicates (IDs: ${toDelete.map(s => s.id).join(', ')})`);
      totalRemoved += toDelete.length;
      totalKept++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Channels deduplicated: ${totalKept}`);
  console.log(`Duplicate entries removed: ${totalRemoved}`);

  // Verify no more duplicates
  const remaining = await prisma.$queryRaw<{count: bigint}[]>`
    SELECT COUNT(*) as count FROM (
      SELECT name FROM "Stream" 
      WHERE "streamType" = 'LIVE'
      GROUP BY name 
      HAVING COUNT(*) > 1
    ) as dups
  `;
  console.log(`Remaining duplicate channel names: ${remaining[0].count}`);

  await prisma.$disconnect();
}

main().catch(console.error);
