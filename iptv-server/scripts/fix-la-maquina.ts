import { prisma } from '../src/config/database.js';

async function fixLaMaquinaEpisode() {
  try {
    console.log('\n=== Fixing La Maquina S04E01 ===\n');
    
    // Delete the incorrect La Maquina S04E01
    const episode = await prisma.episode.findFirst({
      where: {
        seriesId: 17, // La Maquina
        seasonNumber: 4,
        episodeNumber: 1,
      },
      include: {
        series: true,
      },
    });

    if (episode) {
      console.log(`Found incorrect episode:`);
      console.log(`  ${episode.series.name} - S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`);
      console.log(`  File: ${episode.sourceUrl}`);
      console.log(`  (This file actually belongs to "Only Murders in the Building")\n`);

      await prisma.episode.delete({
        where: { id: episode.id },
      });

      console.log('✓ Deleted incorrect episode\n');
    } else {
      console.log('Episode not found or already deleted\n');
    }

    // Count remaining episodes
    const totalEpisodes = await prisma.episode.count();
    console.log(`Total episodes in database: ${totalEpisodes}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixLaMaquinaEpisode();
