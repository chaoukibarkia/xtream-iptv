import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

// Map French genre names to category IDs
const VOD_GENRE_MAP: Record<string, number> = {
  'action': 481,
  'animation': 485,
  'aventure': 483,
  'comédie': 484,
  'crime': 492,
  'documentaire': 486,
  'drame': 488,
  'familial': 493,
  'fantastique': 500,
  'guerre': 489,
  'histoire': 494,
  'horreur': 497,
  'musique': 496,
  'mystère': 498,
  'romance': 487,
  'science-fiction': 491,
  'thriller': 495,
  'téléfilm': 490,
  'western': 499,
};

const SERIES_GENRE_MAP: Record<string, number> = {
  'action & aventure': 505,
  'action': 505,
  'aventure': 505,
  'actualités': 503,
  'news': 503,
  'animation': 509,
  'comédie': 507,
  'crime': 517,
  'documentaire': 501,
  'documentary': 501,
  'drame': 513,
  'drama': 513,
  'enfants': 502,
  'kids': 502,
  'familial': 512,
  'family': 512,
  'feuilleton': 514,
  'soap': 514,
  'guerre': 504,
  'war': 504,
  'politique': 504,
  'mystère': 510,
  'mystery': 510,
  'science-fiction': 511,
  'sci-fi': 511,
  'fantastique': 511,
  'fantasy': 511,
  'talk-show': 515,
  'talk': 515,
  'téléréalité': 506,
  'reality': 506,
  'western': 508,
};

function normalizeGenre(genre: string): string {
  return genre
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[éèê]/g, 'e')
    .replace(/[àâ]/g, 'a');
}

function parseGenres(genreString: string | null): string[] {
  if (!genreString) return [];
  return genreString
    .split(',')
    .map(g => g.trim())
    .filter(g => g.length > 0);
}

async function removeDuplicateMovies() {
  console.log('\n=== Removing Duplicate Movies ===\n');

  // Find all VOD streams
  const allVods = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD },
    select: { id: true, name: true, tmdbId: true, rating: true, releaseDate: true },
    orderBy: { id: 'asc' },
  });

  // Group by name (case-insensitive)
  const grouped = new Map<string, typeof allVods>();
  allVods.forEach(vod => {
    const key = vod.name.toLowerCase().trim();
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(vod);
  });

  // Find duplicates
  const duplicates = Array.from(grouped.entries())
    .filter(([_, vods]) => vods.length > 1);

  if (duplicates.length === 0) {
    console.log('No duplicate movies found.');
    return;
  }

  console.log(`Found ${duplicates.length} duplicate movie names`);

  let totalRemoved = 0;

  for (const [name, vods] of duplicates) {
    // Keep the first one (lowest ID), remove the rest
    const toKeep = vods[0];
    const toRemove = vods.slice(1);

    console.log(`\nMovie: ${toKeep.name}`);
    console.log(`  Keeping: ID ${toKeep.id} (TMDB: ${toKeep.tmdbId || 'N/A'})`);
    console.log(`  Removing: ${toRemove.map(v => `ID ${v.id}`).join(', ')}`);

    for (const vod of toRemove) {
      // Delete related records first
      await prisma.streamCategory.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.bouquetStream.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.epgEntry.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.serverStream.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.streamServerDistribution.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.subtitle.deleteMany({
        where: { streamId: vod.id },
      });

      await prisma.streamSourceCheck.deleteMany({
        where: { streamId: vod.id },
      });

      // Delete the stream
      await prisma.stream.delete({
        where: { id: vod.id },
      });

      totalRemoved++;
    }
  }

  console.log(`\n✓ Removed ${totalRemoved} duplicate movies`);
}

async function updateVodCategories() {
  console.log('\n=== Updating VOD Categories Based on Genres ===\n');

  const vods = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      genre: { not: null },
    },
    select: { id: true, name: true, genre: true },
  });

  console.log(`Processing ${vods.length} VOD movies with genres...`);

  let updated = 0;
  let skipped = 0;

  for (const vod of vods) {
    const genres = parseGenres(vod.genre);
    if (genres.length === 0) {
      skipped++;
      continue;
    }

    // Map genres to category IDs
    const categoryIds: number[] = [];
    for (const genre of genres) {
      const normalized = normalizeGenre(genre);
      const categoryId = VOD_GENRE_MAP[normalized];
      if (categoryId && !categoryIds.includes(categoryId)) {
        categoryIds.push(categoryId);
      }
    }

    if (categoryIds.length === 0) {
      console.log(`  ⚠ No matching categories for: ${vod.name} (genres: ${vod.genre})`);
      skipped++;
      continue;
    }

    // Delete existing categories
    await prisma.streamCategory.deleteMany({
      where: { streamId: vod.id },
    });

    // Add new categories (first one is primary)
    await prisma.streamCategory.createMany({
      data: categoryIds.map((categoryId, index) => ({
        streamId: vod.id,
        categoryId,
        isPrimary: index === 0,
      })),
    });

    // Update the primary categoryId field for backward compatibility
    await prisma.stream.update({
      where: { id: vod.id },
      data: { categoryId: categoryIds[0] },
    });

    updated++;
    if (updated % 10 === 0) {
      console.log(`  Processed ${updated}/${vods.length}...`);
    }
  }

  console.log(`\n✓ Updated ${updated} VOD movies`);
  console.log(`  Skipped ${skipped} (no genres or no matching categories)`);
}

async function updateSeriesCategories() {
  console.log('\n=== Updating Series Categories Based on Genres ===\n');

  const series = await prisma.series.findMany({
    where: {
      genre: { not: null },
    },
    select: { id: true, name: true, genre: true },
  });

  console.log(`Processing ${series.length} series with genres...`);

  let updated = 0;
  let skipped = 0;

  for (const s of series) {
    const genres = parseGenres(s.genre);
    if (genres.length === 0) {
      skipped++;
      continue;
    }

    // Map genres to category IDs
    const categoryIds: number[] = [];
    for (const genre of genres) {
      const normalized = normalizeGenre(genre);
      const categoryId = SERIES_GENRE_MAP[normalized];
      if (categoryId && !categoryIds.includes(categoryId)) {
        categoryIds.push(categoryId);
      }
    }

    if (categoryIds.length === 0) {
      console.log(`  ⚠ No matching categories for: ${s.name} (genres: ${s.genre})`);
      skipped++;
      continue;
    }

    // Delete existing categories
    await prisma.seriesCategory.deleteMany({
      where: { seriesId: s.id },
    });

    // Add new categories (first one is primary)
    await prisma.seriesCategory.createMany({
      data: categoryIds.map((categoryId, index) => ({
        seriesId: s.id,
        categoryId,
        isPrimary: index === 0,
      })),
    });

    // Update the primary categoryId field for backward compatibility
    await prisma.series.update({
      where: { id: s.id },
      data: { categoryId: categoryIds[0] },
    });

    updated++;
    if (updated % 10 === 0) {
      console.log(`  Processed ${updated}/${series.length}...`);
    }
  }

  console.log(`\n✓ Updated ${updated} series`);
  console.log(`  Skipped ${skipped} (no genres or no matching categories)`);
}

async function main() {
  try {
    console.log('=== Starting Database Migration ===');
    console.log('This will:');
    console.log('1. Remove duplicate movies');
    console.log('2. Update VOD categories based on genres');
    console.log('3. Update Series categories based on genres\n');

    await removeDuplicateMovies();
    await updateVodCategories();
    await updateSeriesCategories();

    console.log('\n=== Migration Complete! ===\n');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
