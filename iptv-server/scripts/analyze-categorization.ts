import { prisma } from '../src/config/database.js';

/**
 * Analyze current categorization state
 * Check for mismatches where secondary categories don't match primary category's country
 */

async function main() {
  console.log('🔍 Analyzing categorization state...\n');

  // Get all streams with their categories
  const streams = await prisma.stream.findMany({
    where: {
      streamType: 'LIVE',
    },
    include: {
      categories: {
        include: {
          category: {
            include: {
              parent: true,
            },
          },
        },
        orderBy: {
          isPrimary: 'desc',
        },
      },
    },
  });

  let totalStreams = streams.length;
  let streamsWithPrimary = 0;
  let streamsWithSecondary = 0;
  let correctSecondary = 0;
  let incorrectSecondary = 0;
  let streamsWithMultipleSecondary = 0;

  const mismatches: Array<{
    streamId: number;
    streamName: string;
    primaryCategory: string;
    primaryCountry: string | null;
    secondaryCategories: Array<{ name: string; country: string | null }>;
  }> = [];

  for (const stream of streams) {
    if (stream.categories.length === 0) continue;

    const primaryCat = stream.categories.find((c) => c.isPrimary);
    const secondaryCats = stream.categories.filter((c) => !c.isPrimary);

    if (primaryCat) {
      streamsWithPrimary++;

      // Get primary category's country
      let primaryCountryId: number | null = null;
      let primaryCountryName: string | null = null;

      if (primaryCat.category.parentId) {
        primaryCountryId = primaryCat.category.parentId;
        primaryCountryName = primaryCat.category.parent?.name || null;
      } else if (primaryCat.category.countryCode) {
        primaryCountryId = primaryCat.category.id;
        primaryCountryName = primaryCat.category.name;
      }

      if (secondaryCats.length > 0) {
        streamsWithSecondary++;

        if (secondaryCats.length > 1) {
          streamsWithMultipleSecondary++;
        }

        // Check if secondary categories match primary's country
        for (const secondaryCat of secondaryCats) {
          let secondaryCountryId: number | null = null;

          if (secondaryCat.category.parentId) {
            secondaryCountryId = secondaryCat.category.parentId;
          } else if (secondaryCat.category.countryCode) {
            secondaryCountryId = secondaryCat.category.id;
          }

          if (primaryCountryId && secondaryCountryId === primaryCountryId) {
            correctSecondary++;
          } else {
            incorrectSecondary++;
          }
        }

        // Log mismatches (first 10 for review)
        if (mismatches.length < 10) {
          const hasIncorrect = secondaryCats.some((sc) => {
            const scCountryId = sc.category.parentId || (sc.category.countryCode ? sc.category.id : null);
            return scCountryId !== primaryCountryId;
          });

          if (hasIncorrect) {
            mismatches.push({
              streamId: stream.id,
              streamName: stream.name,
              primaryCategory: primaryCat.category.name,
              primaryCountry: primaryCountryName,
              secondaryCategories: secondaryCats.map((sc) => ({
                name: sc.category.name,
                country: sc.category.parent?.name || (sc.category.countryCode ? sc.category.name : null),
              })),
            });
          }
        }
      }
    }
  }

  console.log('📊 ANALYSIS RESULTS\n');
  console.log('═══════════════════════════════════════\n');
  console.log(`Total LIVE streams:                ${totalStreams}`);
  console.log(`Streams with primary category:     ${streamsWithPrimary}`);
  console.log(`Streams with secondary categories: ${streamsWithSecondary}`);
  console.log(`Streams with multiple secondary:   ${streamsWithMultipleSecondary}\n`);

  console.log('SECONDARY CATEGORIZATION:\n');
  console.log(`✅ Correct (same country):         ${correctSecondary}`);
  console.log(`❌ Incorrect (different country):  ${incorrectSecondary}\n`);

  if (mismatches.length > 0) {
    console.log('🔴 SAMPLE MISMATCHES (first 10):\n');
    for (const mismatch of mismatches) {
      console.log(`Stream ID: ${mismatch.streamId}`);
      console.log(`Name: ${mismatch.streamName}`);
      console.log(`Primary: ${mismatch.primaryCountry}/${mismatch.primaryCategory}`);
      console.log(`Secondary:`);
      for (const sec of mismatch.secondaryCategories) {
        const match = sec.country === mismatch.primaryCountry ? '✅' : '❌';
        console.log(`  ${match} ${sec.country}/${sec.name}`);
      }
      console.log('');
    }
  }

  // Count secondary categorizations by date
  const secondaryByDate = await prisma.streamCategory.groupBy({
    by: ['createdAt'],
    where: {
      isPrimary: false,
    },
    _count: true,
  });

  console.log('\n📅 SECONDARY CATEGORIZATIONS BY DATE:\n');
  const dateCounts = new Map<string, number>();
  for (const item of secondaryByDate) {
    const date = item.createdAt.toISOString().split('T')[0];
    dateCounts.set(date, (dateCounts.get(date) || 0) + item._count);
  }

  for (const [date, count] of Array.from(dateCounts.entries()).sort()) {
    console.log(`  ${date}: ${count} entries`);
  }

  console.log('\n✅ Analysis complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
