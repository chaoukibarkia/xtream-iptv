import { prisma } from '../src/config/database.js';

async function removeSampleSeries() {
  try {
    console.log('=== Removing Sample Series ===\n');
    
    // Find all series with "Sample Series" in the name
    const sampleSeries = await prisma.series.findMany({
      where: {
        name: {
          contains: 'Sample Series',
          mode: 'insensitive',
        },
      },
      include: {
        episodes: true,
      },
    });

    console.log(`Found ${sampleSeries.length} sample series:\n`);

    for (const series of sampleSeries) {
      console.log(`  - ${series.name} (ID: ${series.id}) with ${series.episodes.length} episodes`);
    }

    if (sampleSeries.length === 0) {
      console.log('No sample series found.');
      return;
    }

    console.log('\nDeleting sample series...\n');

    let deletedCount = 0;

    for (const series of sampleSeries) {
      try {
        // Delete the series (episodes will cascade delete)
        await prisma.series.delete({
          where: { id: series.id },
        });
        
        console.log(`  ✓ Deleted: ${series.name} (ID: ${series.id})`);
        deletedCount++;
      } catch (error: any) {
        console.log(`  ✗ Failed to delete ID ${series.id}: ${error.message}`);
      }
    }

    console.log(`\n=== Summary ===`);
    console.log(`Sample series deleted: ${deletedCount}`);
    
    // Get remaining series count
    const remainingCount = await prisma.series.count();
    console.log(`Series remaining in database: ${remainingCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

removeSampleSeries();
