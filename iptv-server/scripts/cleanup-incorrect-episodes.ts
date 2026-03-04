import { prisma } from '../src/config/database.js';

async function cleanupIncorrectEpisodes() {
  try {
    console.log('\n=== Cleaning Up Incorrectly Assigned Episodes ===\n');
    
    // Delete episodes that were assigned to the wrong series
    // These were matched to "Only Murders in the Building S04E01" file but assigned to wrong series
    const episodesToDelete = await prisma.episode.findMany({
      where: {
        OR: [
          // La Maquina S04E01 - should not exist
          { seriesId: 17, seasonNumber: 4, episodeNumber: 1 },
          // The Franchise S04E01 - incorrectly matched
          { seriesId: 21, seasonNumber: 4, episodeNumber: 1 },
          // Shrinking S04E01 - incorrectly matched
          { seriesId: 19, seasonNumber: 4, episodeNumber: 1 },
          // The Lord of the Rings S04E01 - incorrectly matched
          { seriesId: 22, seasonNumber: 4, episodeNumber: 1 },
          // Tulsa King S04E01 - incorrectly matched
          { seriesId: 24, seasonNumber: 4, episodeNumber: 1 },
          // The Penguin S04E01 - incorrectly matched
          { seriesId: 23, seasonNumber: 4, episodeNumber: 1 },
        ],
      },
      include: {
        series: true,
      },
    });

    console.log(`Found ${episodesToDelete.length} episodes to delete:\n`);
    
    for (const episode of episodesToDelete) {
      console.log(`  ${episode.series.name} - S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`);
      console.log(`    File: ${episode.sourceUrl}`);
    }

    if (episodesToDelete.length > 0) {
      const result = await prisma.episode.deleteMany({
        where: {
          id: {
            in: episodesToDelete.map(e => e.id),
          },
        },
      });

      console.log(`\n✓ Deleted ${result.count} incorrectly assigned episodes\n`);
    }

    // Get final episode count
    const totalEpisodes = await prisma.episode.count();
    console.log(`Total episodes remaining in database: ${totalEpisodes}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupIncorrectEpisodes();
