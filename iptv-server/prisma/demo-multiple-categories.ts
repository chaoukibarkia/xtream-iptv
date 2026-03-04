import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function demonstrateMultipleCategories() {
  console.log('🎬 Démonstration: Catégories Multiples\n');

  // Example 1: Get a VOD stream with its categories
  console.log('📺 Exemple 1: Stream VOD avec catégories');
  const vodStream = await prisma.stream.findFirst({
    where: { streamType: 'VOD', name: 'Sintel' },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  if (vodStream) {
    console.log(`\nFilm: "${vodStream.name}"`);
    console.log(`Catégories actuelles (${vodStream.categories.length}):`);
    vodStream.categories.forEach((sc) => {
      console.log(`  - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
    });

    // Example 2: Add multiple categories to a stream
    console.log('\n\n🔧 Exemple 2: Ajouter plusieurs catégories');
    
    // Find categories
    const actionCategory = await prisma.category.findFirst({
      where: { name: 'ACTION', type: 'VOD' },
    });
    const sciFiCategory = await prisma.category.findFirst({
      where: { name: 'SCIENCE-FICTION', type: 'VOD' },
    });

    if (actionCategory && sciFiCategory) {
      // Add ACTION category
      await prisma.streamCategory.upsert({
        where: {
          streamId_categoryId: {
            streamId: vodStream.id,
            categoryId: actionCategory.id,
          },
        },
        create: {
          streamId: vodStream.id,
          categoryId: actionCategory.id,
          isPrimary: false,
        },
        update: {},
      });

      // Add SCIENCE-FICTION category
      await prisma.streamCategory.upsert({
        where: {
          streamId_categoryId: {
            streamId: vodStream.id,
            categoryId: sciFiCategory.id,
          },
        },
        create: {
          streamId: vodStream.id,
          categoryId: sciFiCategory.id,
          isPrimary: false,
        },
        update: {},
      });

      console.log(`\n✅ Catégories ajoutées à "${vodStream.name}":`);
      console.log(`  - ${actionCategory.name}`);
      console.log(`  - ${sciFiCategory.name}`);

      // Show updated categories
      const updatedStream = await prisma.stream.findUnique({
        where: { id: vodStream.id },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: {
              isPrimary: 'desc',
            },
          },
        },
      });

      console.log(`\nCatégories finales pour "${vodStream.name}" (${updatedStream?.categories.length}):`);
      updatedStream?.categories.forEach((sc) => {
        console.log(`  - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
      });
    }
  }

  // Example 3: Find all VOD streams in a category
  console.log('\n\n📋 Exemple 3: Tous les films dans "ACTION"');
  const actionStreams = await prisma.streamCategory.findMany({
    where: {
      category: {
        name: 'ACTION',
        type: 'VOD',
      },
    },
    include: {
      stream: true,
      category: true,
    },
    take: 5,
  });

  console.log(`\nFilms dans la catégorie ACTION (${actionStreams.length} affichés):`);
  actionStreams.forEach((sc) => {
    console.log(`  - ${sc.stream.name}${sc.isPrimary ? ' (catégorie principale)' : ''}`);
  });

  // Example 4: Series with multiple categories
  console.log('\n\n📺 Exemple 4: Ajouter plusieurs catégories à une série');
  const series = await prisma.series.findFirst({
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  if (series) {
    console.log(`\nSérie: "${series.name}"`);
    console.log(`Catégories actuelles (${series.categories.length}):`);
    series.categories.forEach((sc) => {
      console.log(`  - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
    });

    // Add DRAME and CRIME categories
    const drameCategory = await prisma.category.findFirst({
      where: { name: 'DRAME', type: 'SERIES' },
    });
    const crimeCategory = await prisma.category.findFirst({
      where: { name: 'CRIME', type: 'SERIES' },
    });

    if (drameCategory && crimeCategory) {
      await prisma.seriesCategory.upsert({
        where: {
          seriesId_categoryId: {
            seriesId: series.id,
            categoryId: drameCategory.id,
          },
        },
        create: {
          seriesId: series.id,
          categoryId: drameCategory.id,
          isPrimary: false,
        },
        update: {},
      });

      await prisma.seriesCategory.upsert({
        where: {
          seriesId_categoryId: {
            seriesId: series.id,
            categoryId: crimeCategory.id,
          },
        },
        create: {
          seriesId: series.id,
          categoryId: crimeCategory.id,
          isPrimary: false,
        },
        update: {},
      });

      const updatedSeries = await prisma.series.findUnique({
        where: { id: series.id },
        include: {
          categories: {
            include: {
              category: true,
            },
            orderBy: {
              isPrimary: 'desc',
            },
          },
        },
      });

      console.log(`\n✅ Catégories mises à jour pour "${series.name}" (${updatedSeries?.categories.length}):`);
      updatedSeries?.categories.forEach((sc) => {
        console.log(`  - ${sc.category.name}${sc.isPrimary ? ' (PRIMARY)' : ''}`);
      });
    }
  }

  console.log('\n\n✅ Démonstration terminée!');
  console.log('\n💡 Points importants:');
  console.log('  • Chaque stream/série peut avoir PLUSIEURS catégories');
  console.log('  • Une catégorie est marquée comme PRIMARY (catégorie principale)');
  console.log('  • Les anciennes données ont été préservées à 100%');
  console.log('  • Vous pouvez ajouter/supprimer des catégories à tout moment\n');
}

demonstrateMultipleCategories()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
