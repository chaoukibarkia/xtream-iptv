import { prisma } from '../src/config/database.js';

async function populateSeriesStatus() {
  try {
    console.log('\n=== Populating Series Status ===\n');
    
    // Get all series
    const allSeries = await prisma.series.findMany({
      select: {
        id: true,
        name: true,
        releaseDate: true,
        tmdbId: true,
      },
    });

    console.log(`Found ${allSeries.length} series to update\n`);

    let updatedCount = 0;

    for (const series of allSeries) {
      // Default to "ongoing" for recent series (2020 or later), "completed" for older ones
      const year = series.releaseDate ? new Date(series.releaseDate).getFullYear() : new Date().getFullYear();
      const currentYear = new Date().getFullYear();
      
      let status: 'ongoing' | 'completed' | 'cancelled' = 'ongoing';
      
      // Logic: series from 2020 onwards are likely ongoing, older ones are completed
      if (year < 2020) {
        status = 'completed';
      } else if (year >= 2020) {
        status = 'ongoing';
      }

      await prisma.series.update({
        where: { id: series.id },
        data: { status },
      });

      updatedCount++;
      console.log(`✓ ${series.name} (${year}) → ${status}`);
    }

    console.log(`\n✓ Updated ${updatedCount} series with status\n`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

populateSeriesStatus();
