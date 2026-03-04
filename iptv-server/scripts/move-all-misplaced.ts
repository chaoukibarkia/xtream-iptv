import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Target category IDs map
const categoryMap = {
  "IN": { "INFO": 626, "MUSIQUE": 629, "ENFANTS": 628, "SÉRIES": 630 },
  "PK": { "INFO": 696, "MUSIQUE": 699, "ENFANTS": 698, "SÉRIES": 700 },
  "BD": { "INFO": 1030, "MUSIQUE": 1036, "ENFANTS": 1034, "SÉRIES": 1032 },
  "USA": { "INFO": 826, "MUSIQUE": 829, "ENFANTS": 828, "SÉRIES": 830 },
  "US": { "INFO": 826, "MUSIQUE": 829, "ENFANTS": 828, "SÉRIES": 830 },
  "DE": { "INFO": 575, "MUSIQUE": 578, "ENFANTS": 577, "SÉRIES": 579 },
  "ES": { "INFO": 1008, "MUSIQUE": 1014, "ENFANTS": 1012, "SÉRIES": 1010 },
  "IT": { "INFO": 646, "MUSIQUE": 649, "ENFANTS": 648, "SÉRIES": 650 },
  "UK": { "INFO": 756, "MUSIQUE": 759, "ENFANTS": 758, "SÉRIES": 760 },
  "TR": { "INFO": 796, "MUSIQUE": 799, "ENFANTS": 798, "SÉRIES": 800 },
  "AE": { "INFO": 1052, "MUSIQUE": 1058, "ENFANTS": 1056, "SÉRIES": 1054 },
  "SA": { "INFO": 585, "MUSIQUE": 588, "ENFANTS": 587, "SÉRIES": 589 },
  "PT": { "INFO": 736, "MUSIQUE": 739, "ENFANTS": 738, "SÉRIES": 740 },
  "NL": { "INFO": 716, "MUSIQUE": 719, "ENFANTS": 718, "SÉRIES": 720 }
};

// France subcategory IDs
const franceSubCategories = {
  "INFO": 135,
  "MUSIQUE": 139,
  "ENFANTS": 138,
  "SÉRIES": 143
};

async function moveAllMisplacedChannels() {
  console.log('🔄 Moving ALL misplaced channels from FRANCE subcategories...\n');

  let totalMoved = 0;

  for (const [subCatName, subCatId] of Object.entries(franceSubCategories)) {
    console.log(`\n📺 Processing ${subCatName}...`);

    // Get all streams in this France subcategory
    const streams = await prisma.stream.findMany({
      where: { categoryId: subCatId },
      select: { id: true, name: true }
    });

    const stats = {};

    for (const stream of streams) {
      // Check if stream name starts with a country prefix
      for (const [prefix, categories] of Object.entries(categoryMap)) {
        if (stream.name.startsWith(prefix + ' ')) {
          const targetCategoryId = categories[subCatName];

          if (!targetCategoryId) {
            console.log(`   ⚠ No target for ${prefix} in ${subCatName}`);
            continue;
          }

          // Move the stream
          await prisma.stream.update({
            where: { id: stream.id },
            data: { categoryId: targetCategoryId }
          });

          if (!stats[prefix]) stats[prefix] = 0;
          stats[prefix]++;
          totalMoved++;
          break;
        }
      }
    }

    if (Object.keys(stats).length > 0) {
      console.log(`   ✅ Moved channels:`);
      for (const [prefix, count] of Object.entries(stats)) {
        console.log(`      ${prefix}: ${count} channels`);
      }
    } else {
      console.log(`   ✓ No misplaced channels found`);
    }
  }

  console.log(`\n\n✅ Migration completed!`);
  console.log(`📊 Total channels moved: ${totalMoved}`);
}

moveAllMisplacedChannels()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
