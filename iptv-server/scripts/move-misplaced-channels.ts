import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function moveChannelsToCorrectCountries() {
  console.log('🔄 Moving misplaced channels to correct country categories...\n');

  // Target category IDs
  const categories = {
    indeInfo: 626,
    pakistanInfo: 696,
    bangladeshInfo: 1030,
    usaInfo: 826,
    saudiSeries: 589,
  };

  // India channels to move
  const indiaChannels = ['IN ZEE NEWS', 'IN NEWS X'];

  // Pakistan channels to move
  const pakistanChannels = [
    'IN BOL NEWS', 'PK BOL NEWS', 'PK ARY NEWS LIVE', 
    'PK KTN NEWS', 'PUNJABI ABBTAKK NEWS'
  ];

  // Bangladesh channels to move
  const bangladeshChannels = ['BANGLA ATN NEWS', 'BD NEWS 24'];

  // USA channels to move
  const usaChannels = [
    'USA NBC NEWS NOW', 'USA ABC FORT MYERS', 
    'USA CBS FORT MYERS', 'USA NBC FORT MYERS'
  ];

  // Move India channels
  console.log('📺 Moving India channels to INDE/INFO...');
  let indiaCount = 0;
  for (const name of indiaChannels) {
    const result = await prisma.stream.updateMany({
      where: {
        categoryId: 135, // FRANCE INFO
        name: name,
      },
      data: {
        categoryId: categories.indeInfo,
      },
    });
    if (result.count > 0) {
      console.log(`   ✓ Moved ${name} (${result.count} stream(s))`);
      indiaCount += result.count;
    }
  }
  console.log(`   Total: ${indiaCount} India channels moved\n`);

  // Move Pakistan channels
  console.log('📺 Moving Pakistan channels to PAKISTAN/INFO...');
  let pakistanCount = 0;
  for (const name of pakistanChannels) {
    const result = await prisma.stream.updateMany({
      where: {
        categoryId: 135, // FRANCE INFO
        name: name,
      },
      data: {
        categoryId: categories.pakistanInfo,
      },
    });
    if (result.count > 0) {
      console.log(`   ✓ Moved ${name} (${result.count} stream(s))`);
      pakistanCount += result.count;
    }
  }
  console.log(`   Total: ${pakistanCount} Pakistan channels moved\n`);

  // Move Bangladesh channels
  console.log('📺 Moving Bangladesh channels to BANGLADESH/INFO...');
  let bangladeshCount = 0;
  for (const name of bangladeshChannels) {
    const result = await prisma.stream.updateMany({
      where: {
        categoryId: 135, // FRANCE INFO
        name: name,
      },
      data: {
        categoryId: categories.bangladeshInfo,
      },
    });
    if (result.count > 0) {
      console.log(`   ✓ Moved ${name} (${result.count} stream(s))`);
      bangladeshCount += result.count;
    }
  }
  console.log(`   Total: ${bangladeshCount} Bangladesh channels moved\n`);

  // Move USA channels
  console.log('📺 Moving USA channels to ÉTATS-UNIS/INFO...');
  let usaCount = 0;
  for (const name of usaChannels) {
    const result = await prisma.stream.updateMany({
      where: {
        categoryId: 135, // FRANCE INFO
        name: name,
      },
      data: {
        categoryId: categories.usaInfo,
      },
    });
    if (result.count > 0) {
      console.log(`   ✓ Moved ${name} (${result.count} stream(s))`);
      usaCount += result.count;
    }
  }
  console.log(`   Total: ${usaCount} USA channels moved\n`);

  // Move SHAHID channels to Saudi Arabia Series
  console.log('📺 Moving SHAHID channels to ARABIE SAOUDITE/SÉRIES...');
  const shahidResult = await prisma.stream.updateMany({
    where: {
      categoryId: 143, // FRANCE SÉRIES
      name: {
        contains: 'SHAHID',
      },
    },
    data: {
      categoryId: categories.saudiSeries,
    },
  });
  console.log(`   ✓ Moved ${shahidResult.count} SHAHID channels\n`);

  console.log('✅ Migration completed!');
  console.log(`\n📊 Summary:`);
  console.log(`   India: ${indiaCount} channels`);
  console.log(`   Pakistan: ${pakistanCount} channels`);
  console.log(`   Bangladesh: ${bangladeshCount} channels`);
  console.log(`   USA: ${usaCount} channels`);
  console.log(`   Saudi Arabia: ${shahidResult.count} SHAHID channels`);
  console.log(`   Total: ${indiaCount + pakistanCount + bangladeshCount + usaCount + shahidResult.count} channels moved`);
}

moveChannelsToCorrectCountries()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
