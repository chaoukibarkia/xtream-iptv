import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get the NETFLIX parent category
  const netflixParent = await prisma.category.findFirst({
    where: { name: 'NETFLIX', parentId: null }
  });

  if (!netflixParent) {
    console.error('NETFLIX parent category not found!');
    return;
  }

  console.log('NETFLIX parent category ID:', netflixParent.id);

  // Create new subcategories: ACTION, COMEDY, DRAMA, HORROR
  const subcategories = ['ACTION', 'COMEDY', 'DRAMA', 'HORROR'];
  const subcatMap: Record<string, number> = {};

  for (const name of subcategories) {
    // Check if it already exists
    let subcat = await prisma.category.findFirst({
      where: { name, parentId: netflixParent.id }
    });

    if (!subcat) {
      subcat = await prisma.category.create({
        data: {
          name,
          parentId: netflixParent.id,
          type: 'LIVE',
          isActive: true
        }
      });
      console.log(`Created subcategory: NETFLIX/${name} (ID: ${subcat.id})`);
    } else {
      console.log(`Subcategory already exists: NETFLIX/${name} (ID: ${subcat.id})`);
    }
    subcatMap[name] = subcat.id;
  }

  // Get FRANCE/CINÉMA category
  const franceCinema = await prisma.category.findFirst({
    where: { name: 'CINÉMA', parent: { name: 'FRANCE' } }
  });

  if (!franceCinema) {
    console.error('FRANCE/CINÉMA category not found!');
    return;
  }

  console.log('\nFRANCE/CINÉMA category ID:', franceCinema.id);

  // Find all NETFLIX channels in FRANCE/CINÉMA
  const netflixChannels = await prisma.stream.findMany({
    where: {
      categories: { some: { categoryId: franceCinema.id } },
      name: { contains: 'NETFLIX', mode: 'insensitive' }
    },
    include: {
      categories: true
    }
  });

  console.log(`\nFound ${netflixChannels.length} NETFLIX channels in FRANCE/CINÉMA`);

  // Move each channel to the appropriate NETFLIX subcategory
  let moved = { ACTION: 0, COMEDY: 0, DRAMA: 0, HORROR: 0 };

  for (const channel of netflixChannels) {
    let targetSubcat: string | null = null;

    // Determine target subcategory based on channel name
    const upperName = channel.name.toUpperCase();
    if (upperName.includes('ACTION')) {
      targetSubcat = 'ACTION';
    } else if (upperName.includes('COMEDY')) {
      targetSubcat = 'COMEDY';
    } else if (upperName.includes('DRAMA')) {
      targetSubcat = 'DRAMA';
    } else if (upperName.includes('HORROR')) {
      targetSubcat = 'HORROR';
    }

    if (targetSubcat && subcatMap[targetSubcat]) {
      // Remove from FRANCE/CINÉMA
      await prisma.streamCategory.deleteMany({
        where: {
          streamId: channel.id,
          categoryId: franceCinema.id
        }
      });

      // Check if already in target category
      const existing = await prisma.streamCategory.findFirst({
        where: {
          streamId: channel.id,
          categoryId: subcatMap[targetSubcat]
        }
      });

      if (!existing) {
        // Add to NETFLIX subcategory
        await prisma.streamCategory.create({
          data: {
            streamId: channel.id,
            categoryId: subcatMap[targetSubcat],
            isPrimary: true
          }
        });
      }

      moved[targetSubcat as keyof typeof moved]++;
      console.log(`  Moved: ${channel.name} -> NETFLIX/${targetSubcat}`);
    } else {
      console.log(`  Skipped (no match): ${channel.name}`);
    }
  }

  console.log('\n=== Migration Summary ===');
  console.log('Moved to NETFLIX/ACTION:', moved.ACTION);
  console.log('Moved to NETFLIX/COMEDY:', moved.COMEDY);
  console.log('Moved to NETFLIX/DRAMA:', moved.DRAMA);
  console.log('Moved to NETFLIX/HORROR:', moved.HORROR);
  console.log('Total moved:', moved.ACTION + moved.COMEDY + moved.DRAMA + moved.HORROR);

  // Verify final counts
  console.log('\n=== Final NETFLIX Category Counts ===');
  for (const [name, id] of Object.entries(subcatMap)) {
    const count = await prisma.streamCategory.count({
      where: { categoryId: id }
    });
    console.log(`NETFLIX/${name}: ${count} channels`);
  }

  // Also show existing ANIME and S-FICTION
  const anime = await prisma.category.findFirst({
    where: { name: 'ANIME', parentId: netflixParent.id }
  });
  const scifi = await prisma.category.findFirst({
    where: { name: 'S-FICTION', parentId: netflixParent.id }
  });

  if (anime) {
    const count = await prisma.streamCategory.count({ where: { categoryId: anime.id } });
    console.log(`NETFLIX/ANIME: ${count} channels`);
  }
  if (scifi) {
    const count = await prisma.streamCategory.count({ where: { categoryId: scifi.id } });
    console.log(`NETFLIX/S-FICTION: ${count} channels`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
