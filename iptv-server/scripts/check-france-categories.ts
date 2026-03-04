import { prisma } from '../src/config/database.js';

/**
 * Check stream counts in FRANCE subcategories
 */

async function main() {
  console.log('📊 Checking stream counts in FRANCE subcategories...\n');

  // Get FRANCE category
  const france = await prisma.category.findFirst({
    where: {
      name: 'FRANCE',
      type: 'LIVE',
      parentId: null,
    },
  });

  if (!france) {
    console.log('❌ FRANCE category not found');
    return;
  }

  console.log(`🇫🇷 FRANCE Category ID: ${france.id}\n`);

  // Get all subcategories under FRANCE
  const subcategories = await prisma.category.findMany({
    where: {
      parentId: france.id,
      type: 'LIVE',
    },
    orderBy: {
      sortOrder: 'asc',
    },
  });

  console.log(`Found ${subcategories.length} subcategories:\n`);

  for (const subcat of subcategories) {
    // Count streams in this subcategory
    const streamCount = await prisma.streamCategory.count({
      where: {
        categoryId: subcat.id,
      },
    });

    console.log(`  ${subcat.name.padEnd(20)} (ID: ${subcat.id.toString().padEnd(4)}): ${streamCount.toString().padStart(4)} streams`);
  }

  console.log('\n✅ Done!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
