import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get FRANCE category with all subcategories
  const france = await prisma.category.findFirst({
    where: { name: 'FRANCE', parentId: null },
    include: { children: { orderBy: { name: 'asc' } } }
  });

  if (!france) {
    console.error('FRANCE not found!');
    return;
  }

  console.log('=== FRANCE Category Overview ===\n');
  
  let totalFrance = 0;
  for (const subcat of france.children) {
    const count = await prisma.streamCategory.count({
      where: { categoryId: subcat.id }
    });
    console.log(`FRANCE/${subcat.name}: ${count} channels`);
    totalFrance += count;
  }
  console.log(`\nTotal FRANCE channels: ${totalFrance}`);

  // Show overall category counts
  console.log('\n\n=== All Countries Overview ===\n');
  
  const countries = await prisma.category.findMany({
    where: { parentId: null, type: 'LIVE' },
    include: { children: true },
    orderBy: { name: 'asc' }
  });

  for (const country of countries) {
    let countryTotal = 0;
    for (const sub of country.children) {
      const count = await prisma.streamCategory.count({
        where: { categoryId: sub.id }
      });
      countryTotal += count;
    }
    if (countryTotal > 0) {
      console.log(`${country.name}: ${countryTotal} channels`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
