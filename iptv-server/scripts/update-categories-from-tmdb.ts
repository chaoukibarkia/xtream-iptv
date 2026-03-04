import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

// Map TMDB genre names to existing VOD category names
const VOD_GENRE_MAP: Record<string, string> = {
  'action': 'ACTION',
  'adventure': 'AVENTURE',
  'aventure': 'AVENTURE',
  'animation': 'ANIMATION',
  'comedy': 'COMÉDIE',
  'comédie': 'COMÉDIE',
  'crime': 'CRIME',
  'documentary': 'DOCUMENTAIRE',
  'documentaire': 'DOCUMENTAIRE',
  'drama': 'DRAME',
  'drame': 'DRAME',
  'family': 'FAMILIAL',
  'familial': 'FAMILIAL',
  'fantasy': 'FANTASTIQUE',
  'fantastique': 'FANTASTIQUE',
  'history': 'HISTOIRE',
  'histoire': 'HISTOIRE',
  'horror': 'HORREUR',
  'horreur': 'HORREUR',
  'music': 'MUSIQUE',
  'musique': 'MUSIQUE',
  'mystery': 'MYSTÈRE',
  'mystère': 'MYSTÈRE',
  'romance': 'ROMANCE',
  'science fiction': 'SCIENCE-FICTION',
  'science-fiction': 'SCIENCE-FICTION',
  'sci-fi': 'SCIENCE-FICTION',
  'thriller': 'THRILLER',
  'war': 'GUERRE',
  'guerre': 'GUERRE',
  'western': 'WESTERN',
  'tv movie': 'TÉLÉFILM',
  'téléfilm': 'TÉLÉFILM',
};

// Map TMDB genre names to existing Series category names
const SERIES_GENRE_MAP: Record<string, string> = {
  'action': 'ACTION & AVENTURE',
  'action & adventure': 'ACTION & AVENTURE',
  'adventure': 'ACTION & AVENTURE',
  'animation': 'ANIMATION',
  'comedy': 'COMÉDIE',
  'comédie': 'COMÉDIE',
  'crime': 'CRIME',
  'documentary': 'DOCUMENTAIRE',
  'documentaire': 'DOCUMENTAIRE',
  'drama': 'DRAME',
  'drame': 'DRAME',
  'family': 'FAMILIAL',
  'familial': 'FAMILIAL',
  'kids': 'ENFANTS',
  'enfants': 'ENFANTS',
  'mystery': 'MYSTÈRE',
  'mystère': 'MYSTÈRE',
  'news': 'ACTUALITÉS',
  'actualités': 'ACTUALITÉS',
  'reality': 'TÉLÉRÉALITÉ',
  'téléréalité': 'TÉLÉRÉALITÉ',
  'sci-fi & fantasy': 'SCIENCE-FICTION & FANTASTIQUE',
  'science-fiction & fantastique': 'SCIENCE-FICTION & FANTASTIQUE',
  'science fiction': 'SCIENCE-FICTION & FANTASTIQUE',
  'fantasy': 'SCIENCE-FICTION & FANTASTIQUE',
  'soap': 'FEUILLETON',
  'feuilleton': 'FEUILLETON',
  'talk': 'TALK-SHOW',
  'talk-show': 'TALK-SHOW',
  'war & politics': 'GUERRE & POLITIQUE',
  'guerre & politique': 'GUERRE & POLITIQUE',
  'war': 'GUERRE & POLITIQUE',
  'western': 'WESTERN',
  'thriller': 'CRIME', // Map thriller to crime for series
};

async function updateMovieCategories() {
  console.log('\n=== UPDATING MOVIE CATEGORIES ===\n');

  // Get all VOD categories
  const vodCategories = await prisma.category.findMany({
    where: { type: StreamType.VOD },
  });
  
  const categoryByName = new Map(vodCategories.map(c => [c.name.toUpperCase(), c]));
  console.log(`Found ${vodCategories.length} VOD categories`);

  // Get all movies with genre data
  const movies = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      genre: { not: null },
    },
    include: {
      categories: true,
    },
  });

  console.log(`Found ${movies.length} movies with genre data`);

  let updated = 0;
  let skipped = 0;

  for (const movie of movies) {
    if (!movie.genre) {
      skipped++;
      continue;
    }

    // Parse genres (comma-separated)
    const genres = movie.genre.split(',').map(g => g.trim().toLowerCase());
    
    // Find matching categories
    const matchedCategories: number[] = [];
    let primaryCategoryId: number | null = null;

    for (const genre of genres) {
      const categoryName = VOD_GENRE_MAP[genre];
      if (categoryName) {
        const category = categoryByName.get(categoryName);
        if (category && !matchedCategories.includes(category.id)) {
          matchedCategories.push(category.id);
          if (!primaryCategoryId) {
            primaryCategoryId = category.id;
          }
        }
      }
    }

    if (matchedCategories.length === 0) {
      skipped++;
      continue;
    }

    // Check if categories need updating
    const existingCategoryIds = movie.categories.map(c => c.categoryId);
    const needsUpdate = matchedCategories.some(id => !existingCategoryIds.includes(id));

    if (!needsUpdate && movie.categoryId === primaryCategoryId) {
      skipped++;
      continue;
    }

    // Update categories
    try {
      // Remove existing StreamCategory entries
      await prisma.streamCategory.deleteMany({
        where: { streamId: movie.id },
      });

      // Add new categories
      for (let i = 0; i < matchedCategories.length; i++) {
        await prisma.streamCategory.create({
          data: {
            streamId: movie.id,
            categoryId: matchedCategories[i],
            isPrimary: i === 0,
          },
        });
      }

      // Update primary categoryId
      await prisma.stream.update({
        where: { id: movie.id },
        data: { categoryId: primaryCategoryId },
      });

      console.log(`Updated "${movie.name}": ${movie.genre} -> ${matchedCategories.length} categories`);
      updated++;
    } catch (error) {
      console.error(`Error updating ${movie.name}:`, error);
    }
  }

  console.log(`\nMovies: ${updated} updated, ${skipped} skipped`);
  return { updated, skipped };
}

async function updateSeriesCategories() {
  console.log('\n=== UPDATING SERIES CATEGORIES ===\n');

  // Get all Series categories
  const seriesCategories = await prisma.category.findMany({
    where: { type: StreamType.SERIES },
  });
  
  const categoryByName = new Map(seriesCategories.map(c => [c.name.toUpperCase(), c]));
  console.log(`Found ${seriesCategories.length} Series categories`);

  // Get all series with genre data
  const seriesList = await prisma.series.findMany({
    where: {
      genre: { not: null },
    },
    include: {
      categories: true,
    },
  });

  console.log(`Found ${seriesList.length} series with genre data`);

  let updated = 0;
  let skipped = 0;

  for (const series of seriesList) {
    if (!series.genre) {
      skipped++;
      continue;
    }

    // Parse genres (comma-separated)
    const genres = series.genre.split(',').map(g => g.trim().toLowerCase());
    
    // Find matching categories
    const matchedCategories: number[] = [];
    let primaryCategoryId: number | null = null;

    for (const genre of genres) {
      const categoryName = SERIES_GENRE_MAP[genre];
      if (categoryName) {
        const category = categoryByName.get(categoryName);
        if (category && !matchedCategories.includes(category.id)) {
          matchedCategories.push(category.id);
          if (!primaryCategoryId) {
            primaryCategoryId = category.id;
          }
        }
      }
    }

    if (matchedCategories.length === 0) {
      skipped++;
      continue;
    }

    // Check if categories need updating
    const existingCategoryIds = series.categories.map(c => c.categoryId);
    const needsUpdate = matchedCategories.some(id => !existingCategoryIds.includes(id));

    if (!needsUpdate && series.categoryId === primaryCategoryId) {
      skipped++;
      continue;
    }

    // Update categories
    try {
      // Remove existing SeriesCategory entries
      await prisma.seriesCategory.deleteMany({
        where: { seriesId: series.id },
      });

      // Add new categories
      for (let i = 0; i < matchedCategories.length; i++) {
        await prisma.seriesCategory.create({
          data: {
            seriesId: series.id,
            categoryId: matchedCategories[i],
            isPrimary: i === 0,
          },
        });
      }

      // Update primary categoryId
      await prisma.series.update({
        where: { id: series.id },
        data: { categoryId: primaryCategoryId },
      });

      console.log(`Updated "${series.name}": ${series.genre} -> ${matchedCategories.length} categories`);
      updated++;
    } catch (error) {
      console.error(`Error updating ${series.name}:`, error);
    }
  }

  console.log(`\nSeries: ${updated} updated, ${skipped} skipped`);
  return { updated, skipped };
}

async function main() {
  console.log('='.repeat(60));
  console.log('UPDATE CATEGORIES FROM TMDB GENRE DATA');
  console.log('='.repeat(60));

  try {
    const movieStats = await updateMovieCategories();
    const seriesStats = await updateSeriesCategories();

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Movies: ${movieStats.updated} updated, ${movieStats.skipped} skipped`);
    console.log(`Series: ${seriesStats.updated} updated, ${seriesStats.skipped} skipped`);

    // Clear Redis cache
    console.log('\nClearing Redis cache...');
    const { execSync } = await import('child_process');
    try {
      execSync('redis-cli -h 10.10.0.11 -a 2LA6Er7c8TX37R6K3Vbbm4AWycw6gXdy --no-auth-warning FLUSHDB', { stdio: 'pipe' });
      console.log('Redis cache cleared');
    } catch {
      console.log('Could not clear Redis cache automatically');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
