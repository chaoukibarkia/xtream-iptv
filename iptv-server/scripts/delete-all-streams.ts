import { PrismaClient } from '@prisma/client';
import * as readline from 'readline';

const prisma = new PrismaClient();

async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

async function deleteAllStreams() {
  console.log('🗑️  Stream Deletion Script\n');

  try {
    // Count existing streams
    const streamCount = await prisma.stream.count();
    const streamCategoryCount = await prisma.streamCategory.count();
    const serverDistributionCount = await prisma.streamServerDistribution.count();

    console.log('📊 Current Database State:');
    console.log(`   Streams: ${streamCount}`);
    console.log(`   Stream-Category Relations: ${streamCategoryCount}`);
    console.log(`   Server Distributions: ${serverDistributionCount}`);
    console.log('');

    if (streamCount === 0) {
      console.log('✅ No streams to delete. Database is already clean.');
      return;
    }

    // Show stream type breakdown
    const streamsByType = await prisma.stream.groupBy({
      by: ['streamType'],
      _count: true,
    });

    console.log('📈 Streams by Type:');
    streamsByType.forEach((item) => {
      console.log(`   ${item.streamType}: ${item._count}`);
    });
    console.log('');

    // Warning
    console.log('⚠️  WARNING: This will permanently delete all streams and related data!');
    console.log('⚠️  Make sure you have created a backup before proceeding.\n');

    const confirmed = await askConfirmation(
      '❓ Type "yes" to confirm deletion: '
    );

    if (!confirmed) {
      console.log('\n❌ Deletion cancelled by user.');
      return;
    }

    console.log('\n🗑️  Starting deletion process...\n');

    // Delete in order (respecting foreign key constraints)
    
    // 1. Delete StreamCategory (many-to-many relations)
    console.log('1️⃣  Deleting stream-category relations...');
    const deletedStreamCategories = await prisma.streamCategory.deleteMany({});
    console.log(`   ✅ Deleted ${deletedStreamCategories.count} relations`);

    // 2. Delete StreamServerDistribution
    console.log('2️⃣  Deleting server distributions...');
    const deletedDistributions = await prisma.streamServerDistribution.deleteMany({});
    console.log(`   ✅ Deleted ${deletedDistributions.count} distributions`);

    // 3. Delete BouquetStream (if exists)
    console.log('3️⃣  Deleting bouquet streams...');
    const deletedBouquets = await prisma.bouquetStream.deleteMany({});
    console.log(`   ✅ Deleted ${deletedBouquets.count} bouquet relations`);

    // 4. Delete EpgEntry
    console.log('4️⃣  Deleting EPG entries...');
    const deletedEpg = await prisma.epgEntry.deleteMany({});
    console.log(`   ✅ Deleted ${deletedEpg.count} EPG entries`);

    // 5. Delete ServerStream
    console.log('5️⃣  Deleting server streams...');
    const deletedServerStreams = await prisma.serverStream.deleteMany({});
    console.log(`   ✅ Deleted ${deletedServerStreams.count} server streams`);

    // 6. Delete Subtitle
    console.log('6️⃣  Deleting subtitles...');
    const deletedSubtitles = await prisma.subtitle.deleteMany({});
    console.log(`   ✅ Deleted ${deletedSubtitles.count} subtitles`);

    // 7. Delete StreamSourceCheck
    console.log('7️⃣  Deleting stream source checks...');
    const deletedSourceChecks = await prisma.streamSourceCheck.deleteMany({});
    console.log(`   ✅ Deleted ${deletedSourceChecks.count} source checks`);

    // 8. Finally delete Streams
    console.log('8️⃣  Deleting streams...');
    const deletedStreams = await prisma.stream.deleteMany({});
    console.log(`   ✅ Deleted ${deletedStreams.count} streams`);

    console.log('\n✅ All streams and related data deleted successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Streams: ${deletedStreams.count}`);
    console.log(`   Stream-Category Relations: ${deletedStreamCategories.count}`);
    console.log(`   Server Distributions: ${deletedDistributions.count}`);
    console.log(`   Bouquet Streams: ${deletedBouquets.count}`);
    console.log(`   EPG Entries: ${deletedEpg.count}`);
    console.log(`   Server Streams: ${deletedServerStreams.count}`);
    console.log(`   Subtitles: ${deletedSubtitles.count}`);
    console.log(`   Source Checks: ${deletedSourceChecks.count}`);

  } catch (error) {
    console.error('\n❌ Error during deletion:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteAllStreams();
