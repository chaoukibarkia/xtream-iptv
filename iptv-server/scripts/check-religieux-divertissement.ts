import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get FRANCE/RELIGIEUX channels
  const franceReligieux = await prisma.category.findFirst({
    where: { name: 'RELIGIEUX', parent: { name: 'FRANCE' } }
  });

  if (franceReligieux) {
    console.log('=== FRANCE/RELIGIEUX ===');
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: franceReligieux.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
    console.log(`Total: ${channels.length} channels\n`);
    channels.forEach(c => console.log(`  ${c.id}: ${c.name}`));
  }

  // Get FRANCE/DIVERTISSEMENT channels
  const franceDivert = await prisma.category.findFirst({
    where: { name: 'DIVERTISSEMENT', parent: { name: 'FRANCE' } }
  });

  if (franceDivert) {
    console.log('\n=== FRANCE/DIVERTISSEMENT ===');
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: franceDivert.id } } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });
    console.log(`Total: ${channels.length} channels\n`);
    channels.forEach(c => console.log(`  ${c.id}: ${c.name}`));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
