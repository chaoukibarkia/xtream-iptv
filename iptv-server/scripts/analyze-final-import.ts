import { prisma } from '../src/config/database.js';
import { StreamType } from '@prisma/client';

async function analyzeFinalImport() {
  console.log('📊 Analyzing Final Import Results\n');
  console.log('═'.repeat(60));
  console.log('\n');

  try {
    // Get total stream count
    const totalStreams = await prisma.stream.count();
    console.log(`📺 Total Streams Imported: ${totalStreams}\n`);

    // Get streams by type
    const streamsByType = await prisma.stream.groupBy({
      by: ['streamType'],
      _count: true,
    });

    console.log('📋 Streams by Type:');
    streamsByType.forEach((item) => {
      console.log(`   ${item.streamType}: ${item._count}`);
    });
    console.log('');

    // Get all parent categories (countries)
    const countries = await prisma.category.findMany({
      where: {
        type: StreamType.LIVE,
        parentId: null,
      },
      orderBy: {
        name: 'asc',
      },
    });

    console.log('🌍 Streams by Country:\n');

    for (const country of countries) {
      // Get stream count for this country (all subcategories)
      const subcategories = await prisma.category.findMany({
        where: {
          parentId: country.id,
        },
      });

      let countryTotal = 0;
      for (const subcat of subcategories) {
        const count = await prisma.streamCategory.count({
          where: {
            categoryId: subcat.id,
          },
        });
        countryTotal += count;
      }

      if (countryTotal > 0) {
        const flag = country.countryCode ? `[${country.countryCode}]` : '   ';
        console.log(`   ${flag} ${country.name.padEnd(25)} ${countryTotal.toString().padStart(5)} streams`);
      }
    }

    console.log('\n');
    console.log('═'.repeat(60));
    console.log('\n✅ Analysis Complete!\n');

  } catch (error) {
    console.error('❌ Error during analysis:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

analyzeFinalImport();
