import { prisma } from '../src/config/database.js';

async function checkSeries() {
  try {
    const series = await prisma.series.findMany({
      include: {
        episodes: true,
        category: true,
      },
    });

    console.log(`Found ${series.length} series:\n`);
    
    for (const s of series) {
      console.log(`Series: ${s.name} (ID: ${s.id})`);
      console.log(`  Category: ${s.category?.name || 'None'}`);
      console.log(`  Episodes: ${s.episodes.length}`);
      
      if (s.episodes.length === 0) {
        console.log(`  ⚠️  NO EPISODES FOUND`);
      } else {
        const seasons = [...new Set(s.episodes.map(e => e.seasonNumber))].sort((a, b) => a - b);
        console.log(`  Seasons: ${seasons.join(', ')}`);
        for (const season of seasons) {
          const episodesInSeason = s.episodes.filter(e => e.seasonNumber === season);
          console.log(`    Season ${season}: ${episodesInSeason.length} episodes`);
        }
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSeries();
