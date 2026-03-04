import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Check NETFLIX channels still in FRANCE/CINÉMA
  const franceCinema = await prisma.category.findFirst({
    where: { name: 'CINÉMA', parent: { name: 'FRANCE' } }
  });

  if (franceCinema) {
    const netflixChannels = await prisma.stream.findMany({
      where: {
        categories: { some: { categoryId: franceCinema.id } },
        name: { contains: 'NETFLIX', mode: 'insensitive' }
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
    console.log('NETFLIX channels in FRANCE/CINÉMA:', netflixChannels.length);
    netflixChannels.forEach(s => console.log('  -', s.name));
  }

  // Check NETFLIX category and its subcategories
  const netflixCat = await prisma.category.findFirst({
    where: { name: 'NETFLIX', parentId: null },
    include: { children: true }
  });
  
  if (netflixCat) {
    console.log('\nNETFLIX category exists:', netflixCat.id);
    console.log('Subcategories:');
    for (const sub of netflixCat.children) {
      const count = await prisma.streamCategory.count({
        where: { categoryId: sub.id }
      });
      console.log(`  - ${sub.name}: ${count} channels`);
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
