import { prisma } from '../src/config/database.js';

async function reviewSeason4Episodes() {
  try {
    console.log('\n=== Reviewing Season 4 Episodes ===\n');
    
    // Get all series with Season 4 episodes
    const series = await prisma.series.findMany({
      include: {
        episodes: {
          where: {
            seasonNumber: 4,
          },
          orderBy: {
            episodeNumber: 'asc',
          },
        },
      },
    });

    const seriesWithSeason4 = series.filter(s => s.episodes.length > 0);

    console.log(`Found ${seriesWithSeason4.length} series with Season 4 episodes:\n`);

    for (const serie of seriesWithSeason4) {
      console.log(`\n${serie.name} (ID: ${serie.id})`);
      console.log('─'.repeat(60));
      
      for (const episode of serie.episodes) {
        console.log(`  S04E${episode.episodeNumber.toString().padStart(2, '0')}: ${episode.title}`);
        console.log(`    File: ${episode.sourceUrl}`);
        console.log(`    Extension: ${episode.containerExtension}`);
      }
    }

    console.log('\n\n=== Episodes to Review ===\n');
    console.log('These series have Season 4 episodes that may be misidentified:');
    console.log('- La Maquina (should probably be Season 1)');
    console.log('- The Franchise (verify if these are really Season 4)');
    console.log('- Shrinking (verify if these are really Season 4)');
    console.log('- Slow Horses (verify if these are really Season 4)');
    console.log('- The Lord of the Rings (verify - no Season 1?)');
    console.log('- Tulsa King (verify - no Season 1?)');
    console.log('- The Penguin (verify if these are really Season 4)');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

reviewSeason4Episodes();
