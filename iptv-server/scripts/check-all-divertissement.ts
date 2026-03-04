import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all DIVERTISSEMENT subcategories
  const divertCategories = await prisma.category.findMany({
    where: { name: 'DIVERTISSEMENT' },
    include: { parent: true }
  });

  for (const cat of divertCategories) {
    const countryName = cat.parent?.name || 'ROOT';
    
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: cat.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });

    if (channels.length > 0) {
      console.log(`\n=== ${countryName}/DIVERTISSEMENT (${channels.length} channels) ===`);
      channels.forEach(c => console.log(`  ${c.id}: ${c.name}`));
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
