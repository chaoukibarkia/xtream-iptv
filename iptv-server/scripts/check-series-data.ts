import { prisma } from '../src/config/database.js';

async function checkSeriesData() {
  try {
    console.log('\n=== Checking Series Data Structure ===\n');
    
    // Get one series with all relationships
    const series = await prisma.series.findFirst({
      where: { id: 15 }, // Disclaimer
      include: {
        episodes: true,
        category: true,
        categories: {
          include: {
            category: true,
          },
        },
      },
    });

    if (series) {
      console.log('Series ID:', series.id);
      console.log('Name:', series.name);
      console.log('Cover URL:', series.cover || 'NULL');
      console.log('Backdrop Path:', series.backdropPath || 'NULL');
      console.log('Status:', series.status || 'NULL');
      console.log('Year:', series.releaseDate || 'NULL');
      console.log('Rating:', series.rating || 'NULL');
      console.log('Rating5:', series.rating5 || 'NULL');
      console.log('Genre:', series.genre || 'NULL');
      console.log('Cast:', series.cast || 'NULL');
      console.log('Plot:', series.plot ? series.plot.substring(0, 100) + '...' : 'NULL');
      console.log('\nPrimary Category:', series.category?.name || 'NULL');
      console.log('All Categories:', series.categories.map(c => c.category.name).join(', ') || 'NONE');
      console.log('\nTotal Episodes:', series.episodes.length);
      
      // Get unique seasons
      const seasons = [...new Set(series.episodes.map(e => e.seasonNumber))].sort((a, b) => a - b);
      console.log('Seasons:', seasons.join(', '));
      console.log('Season Count:', seasons.length);
      
      seasons.forEach(seasonNum => {
        const episodesInSeason = series.episodes.filter(e => e.seasonNumber === seasonNum);
        console.log(`  Season ${seasonNum}: ${episodesInSeason.length} episodes`);
      });
    }

    console.log('\n\n=== Checking API Response Format ===\n');
    
    // Check what the API might return
    const apiSeries = await prisma.series.findMany({
      take: 3,
      include: {
        category: true,
        categories: {
          include: {
            category: true,
          },
        },
        _count: {
          select: {
            episodes: true,
          },
        },
      },
    });

    apiSeries.forEach(s => {
      console.log(`\n${s.name}:`);
      console.log('  _count.episodes:', s._count.episodes);
      console.log('  cover:', s.cover ? 'HAS URL' : 'NULL');
      console.log('  backdropPath:', s.backdropPath ? 'HAS URL' : 'NULL');
      console.log('  status:', s.status || 'NULL');
      console.log('  year:', s.releaseDate || 'NULL');
      console.log('  rating:', s.rating || 'NULL');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSeriesData();
