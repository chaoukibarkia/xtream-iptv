import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

async function addBrazilCategories() {
  console.log('🇧🇷 Adding Brazil (BR) categories to database...\n');

  try {
    // Check if Brazil already exists
    const existing = await prisma.category.findFirst({
      where: {
        countryCode: 'BR',
        type: StreamType.LIVE,
      },
    });

    if (existing) {
      console.log('⚠️  Brazil categories already exist. Skipping...');
      return;
    }

    // Create Brazil parent category
    const brazil = await prisma.category.create({
      data: {
        name: 'BRÉSIL',
        type: StreamType.LIVE,
        countryCode: 'BR',
        flagSvgUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Flag_of_Brazil.svg',
        parentId: null,
        sortOrder: 100,
        isActive: true,
      },
    });

    console.log(`✅ Created parent category: ${brazil.name} (ID: ${brazil.id})`);

    // Standard subcategories for Brazil
    const subcategories = [
      { name: 'GÉNÉRALISTE', sortOrder: 1 },
      { name: 'SPORTS', sortOrder: 2 },
      { name: 'INFO', sortOrder: 3 },
      { name: 'CINÉMA', sortOrder: 4 },
      { name: 'SÉRIES', sortOrder: 5 },
      { name: 'DIVERTISSEMENT', sortOrder: 6 },
      { name: 'ENFANTS', sortOrder: 7 },
      { name: 'DOCUMENTAIRES', sortOrder: 8 },
      { name: 'MUSIQUE', sortOrder: 9 },
      { name: 'RELIGIEUX', sortOrder: 10 },
    ];

    console.log('\n📁 Creating subcategories...');

    for (const subcat of subcategories) {
      const created = await prisma.category.create({
        data: {
          name: subcat.name,
          type: StreamType.LIVE,
          parentId: brazil.id,
          sortOrder: subcat.sortOrder,
          isActive: true,
        },
      });
      console.log(`   ✅ ${created.name} (ID: ${created.id})`);
    }

    console.log('\n✅ Brazil categories created successfully!');

  } catch (error) {
    console.error('❌ Error adding Brazil categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

addBrazilCategories();
