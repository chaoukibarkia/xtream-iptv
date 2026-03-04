import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getOrCreateSubcategory(countryName: string, subcatName: string): Promise<number> {
  const country = await prisma.category.findFirst({
    where: { name: countryName, parentId: null }
  });

  if (!country) {
    throw new Error(`Country not found: ${countryName}`);
  }

  let subcat = await prisma.category.findFirst({
    where: { name: subcatName, parentId: country.id }
  });

  if (!subcat) {
    subcat = await prisma.category.create({
      data: {
        name: subcatName,
        parentId: country.id,
        type: 'LIVE',
        isActive: true
      }
    });
    console.log(`Created: ${countryName}/${subcatName} (ID: ${subcat.id})`);
  }

  return subcat.id;
}

async function moveChannel(streamId: number, fromCatId: number, toCatId: number) {
  // Remove from old category
  await prisma.streamCategory.deleteMany({
    where: { streamId, categoryId: fromCatId }
  });

  // Check if already in target
  const existing = await prisma.streamCategory.findFirst({
    where: { streamId, categoryId: toCatId }
  });

  if (!existing) {
    await prisma.streamCategory.create({
      data: { streamId, categoryId: toCatId, isPrimary: true }
    });
  }
}

async function main() {
  console.log('=== Moving RELIGIEUX and DIVERTISSEMENT channels ===\n');

  // 1. Move FRANCE/RELIGIEUX → CHAÎNES ARABES/RELIGIEUX
  const franceReligieux = await prisma.category.findFirst({
    where: { name: 'RELIGIEUX', parent: { name: 'FRANCE' } }
  });

  if (franceReligieux) {
    const targetReligieux = await getOrCreateSubcategory('CHAÎNES ARABES', 'RELIGIEUX');
    
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: franceReligieux.id } } },
      select: { id: true, name: true }
    });

    for (const channel of channels) {
      await moveChannel(channel.id, franceReligieux.id, targetReligieux);
      console.log(`Moved: ${channel.name} → CHAÎNES ARABES/RELIGIEUX`);
    }
  }

  // 2. Move FRANCE/DIVERTISSEMENT → CHAÎNES ARABES/DIVERTISSEMENT  
  const franceDivert = await prisma.category.findFirst({
    where: { name: 'DIVERTISSEMENT', parent: { name: 'FRANCE' } }
  });

  if (franceDivert) {
    const targetDivert = await getOrCreateSubcategory('CHAÎNES ARABES', 'DIVERTISSEMENT');
    
    const channels = await prisma.stream.findMany({
      where: { categories: { some: { categoryId: franceDivert.id } } },
      select: { id: true, name: true }
    });

    for (const channel of channels) {
      await moveChannel(channel.id, franceDivert.id, targetDivert);
      console.log(`Moved: ${channel.name} → CHAÎNES ARABES/DIVERTISSEMENT`);
    }
  }

  // Verify final state
  console.log('\n=== Verification ===');
  
  const franceReligieuxCount = await prisma.streamCategory.count({
    where: { category: { name: 'RELIGIEUX', parent: { name: 'FRANCE' } } }
  });
  const franceDivertCount = await prisma.streamCategory.count({
    where: { category: { name: 'DIVERTISSEMENT', parent: { name: 'FRANCE' } } }
  });
  const arabeReligieuxCount = await prisma.streamCategory.count({
    where: { category: { name: 'RELIGIEUX', parent: { name: 'CHAÎNES ARABES' } } }
  });
  const arabeDivertCount = await prisma.streamCategory.count({
    where: { category: { name: 'DIVERTISSEMENT', parent: { name: 'CHAÎNES ARABES' } } }
  });

  console.log(`FRANCE/RELIGIEUX: ${franceReligieuxCount} channels`);
  console.log(`FRANCE/DIVERTISSEMENT: ${franceDivertCount} channels`);
  console.log(`CHAÎNES ARABES/RELIGIEUX: ${arabeReligieuxCount} channels`);
  console.log(`CHAÎNES ARABES/DIVERTISSEMENT: ${arabeDivertCount} channels`);

  await prisma.$disconnect();
}

main().catch(console.error);
