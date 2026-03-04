import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get FRANCE/DIVERTISSEMENT
  const franceDivert = await prisma.category.findFirst({
    where: { name: 'DIVERTISSEMENT', parent: { name: 'FRANCE' } }
  });

  if (franceDivert) {
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: franceDivert.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });

    console.log(`=== FRANCE/DIVERTISSEMENT (${channels.length} channels) ===`);
    channels.forEach(c => console.log(`  ${c.id}: ${c.name}`));
  } else {
    console.log('FRANCE/DIVERTISSEMENT category not found');
  }

  // Also check all FRANCE subcategories for any remaining misplaced channels
  console.log('\n=== Checking all FRANCE subcategories ===');
  
  const france = await prisma.category.findFirst({
    where: { name: 'FRANCE', parentId: null },
    include: { children: true }
  });

  if (france) {
    for (const sub of france.children) {
      const channels = await prisma.stream.findMany({
        where: { categories: { some: { categoryId: sub.id } } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
      });

      // Look for non-French prefixes
      const nonFrench = channels.filter(c => {
        const upper = c.name.toUpperCase();
        return upper.startsWith('IN ') || 
               upper.startsWith('US ') || 
               upper.startsWith('UK ') ||
               upper.startsWith('DE ') ||
               upper.startsWith('IT ') ||
               upper.startsWith('ES ') ||
               upper.startsWith('PK ') ||
               upper.startsWith('TR ') ||
               upper.startsWith('PANORAMA') ||
               upper.startsWith('SHAHID') ||
               upper.startsWith('OS-') ||
               upper.startsWith('MBC') ||
               upper.startsWith('AL ') ||
               upper.startsWith('AL-');
      });

      if (nonFrench.length > 0) {
        console.log(`\n${sub.name}: ${nonFrench.length} potentially misplaced`);
        nonFrench.forEach(c => console.log(`  ${c.id}: ${c.name}`));
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
