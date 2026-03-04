import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Finding Duplicate Channels ===\n');

  // Find streams with exact same name for LIVE type
  const duplicates = await prisma.$queryRaw<{name: string, count: bigint}[]>`
    SELECT name, COUNT(*) as count 
    FROM "Stream" 
    WHERE "streamType" = 'LIVE'
    GROUP BY name 
    HAVING COUNT(*) > 1 
    ORDER BY count DESC, name
    LIMIT 50
  `;

  console.log(`Found ${duplicates.length} channel names with duplicates:\n`);

  let totalDupEntries = 0;
  for (const dup of duplicates) {
    console.log(`"${dup.name}" - ${Number(dup.count)} copies`);
    totalDupEntries += Number(dup.count) - 1;
    
    // Show details of each duplicate
    const streams = await prisma.stream.findMany({
      where: { name: dup.name, streamType: 'LIVE' },
      include: {
        categories: {
          include: {
            category: {
              include: { parent: true }
            }
          }
        }
      }
    });

    for (const stream of streams) {
      const cats = stream.categories.map(sc => {
        const cat = sc.category;
        return cat.parent ? `${cat.parent.name}/${cat.name}` : cat.name;
      }).join(', ');
      console.log(`  ID: ${stream.id}, Categories: ${cats || 'none'}`);
    }
    console.log('');
  }

  console.log(`\nTotal duplicate entries that could be removed: ${totalDupEntries}`);

  await prisma.$disconnect();
}

main().catch(console.error);
