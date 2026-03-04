import { PrismaClient, StreamType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DATABASE VERIFICATION ===\n');
  
  // Check categories
  const vodCategories = await prisma.category.findMany({
    where: { type: StreamType.VOD },
  });
  console.log(`VOD Categories: ${vodCategories.length}`);
  vodCategories.forEach(cat => console.log(`  - ${cat.name} (ID: ${cat.id})`));
  
  const seriesCategories = await prisma.category.findMany({
    where: { type: StreamType.SERIES },
  });
  console.log(`\nSERIES Categories: ${seriesCategories.length}`);
  seriesCategories.forEach(cat => console.log(`  - ${cat.name} (ID: ${cat.id})`));
  
  // Check movies
  const movies = await prisma.stream.findMany({
    where: { streamType: StreamType.VOD },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nRecent Movies (showing 10 of ${await prisma.stream.count({ where: { streamType: StreamType.VOD } })}):`);
  movies.forEach(movie => {
    console.log(`  - ${movie.name} (${movie.releaseDate ? new Date(movie.releaseDate).getFullYear() : 'N/A'})`);
    console.log(`    Source: ${movie.sourceUrl.substring(0, 60)}...`);
  });
  
  // Check series
  const series = await prisma.series.findMany({
    include: {
      _count: {
        select: { episodes: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nSeries (${series.length}):`);
  series.forEach(s => {
    console.log(`  - ${s.name} (${s._count.episodes} episodes)`);
  });
  
  // Check episodes for a sample series
  if (series.length > 0) {
    const sampleSeries = series[0];
    const episodes = await prisma.episode.findMany({
      where: { seriesId: sampleSeries.id },
      take: 5,
      orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
    });
    console.log(`\nSample Episodes from "${sampleSeries.name}" (showing 5):`);
    episodes.forEach(ep => {
      console.log(`  - S${ep.seasonNumber.toString().padStart(2, '0')}E${ep.episodeNumber.toString().padStart(2, '0')}: ${ep.title || 'Untitled'}`);
      console.log(`    Source: ${ep.sourceUrl.substring(0, 60)}...`);
    });
  }
  
  console.log('\n=== VERIFICATION COMPLETE ===');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
