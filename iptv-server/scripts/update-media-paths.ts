import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OLD_PATH = '/storage-pool/iptv-media/';
const NEW_PATH = '/media/';

async function main() {
  console.log('=== UPDATING MEDIA PATHS ===\n');
  console.log(`Replacing: ${OLD_PATH}`);
  console.log(`With: ${NEW_PATH}\n`);
  
  // Update Stream sourceUrl (movies)
  console.log('Updating movie paths...');
  const streams = await prisma.stream.findMany({
    where: {
      sourceUrl: {
        startsWith: OLD_PATH,
      },
    },
  });
  
  console.log(`Found ${streams.length} streams to update`);
  
  let streamUpdated = 0;
  for (const stream of streams) {
    const newSourceUrl = stream.sourceUrl.replace(OLD_PATH, NEW_PATH);
    await prisma.stream.update({
      where: { id: stream.id },
      data: { sourceUrl: newSourceUrl },
    });
    streamUpdated++;
    if (streamUpdated % 50 === 0) {
      console.log(`  Updated ${streamUpdated} streams...`);
    }
  }
  console.log(`Updated ${streamUpdated} stream paths\n`);
  
  // Update Stream backupUrls
  console.log('Updating stream backup URLs...');
  const streamsWithBackups = await prisma.stream.findMany({
    where: {
      backupUrls: {
        isEmpty: false,
      },
    },
  });
  
  let backupUrlsUpdated = 0;
  for (const stream of streamsWithBackups) {
    const newBackupUrls = stream.backupUrls.map(url => 
      url.startsWith(OLD_PATH) ? url.replace(OLD_PATH, NEW_PATH) : url
    );
    
    if (JSON.stringify(newBackupUrls) !== JSON.stringify(stream.backupUrls)) {
      await prisma.stream.update({
        where: { id: stream.id },
        data: { backupUrls: newBackupUrls },
      });
      backupUrlsUpdated++;
    }
  }
  console.log(`Updated ${backupUrlsUpdated} stream backup URLs\n`);
  
  // Update Episode sourceUrl
  console.log('Updating episode paths...');
  const episodes = await prisma.episode.findMany({
    where: {
      sourceUrl: {
        startsWith: OLD_PATH,
      },
    },
  });
  
  console.log(`Found ${episodes.length} episodes to update`);
  
  let episodeUpdated = 0;
  for (const episode of episodes) {
    const newSourceUrl = episode.sourceUrl.replace(OLD_PATH, NEW_PATH);
    await prisma.episode.update({
      where: { id: episode.id },
      data: { sourceUrl: newSourceUrl },
    });
    episodeUpdated++;
    if (episodeUpdated % 50 === 0) {
      console.log(`  Updated ${episodeUpdated} episodes...`);
    }
  }
  console.log(`Updated ${episodeUpdated} episode paths\n`);
  
  // Update Episode backupUrls
  console.log('Updating episode backup URLs...');
  const episodesWithBackups = await prisma.episode.findMany({
    where: {
      backupUrls: {
        isEmpty: false,
      },
    },
  });
  
  let episodeBackupUrlsUpdated = 0;
  for (const episode of episodesWithBackups) {
    const newBackupUrls = episode.backupUrls.map(url => 
      url.startsWith(OLD_PATH) ? url.replace(OLD_PATH, NEW_PATH) : url
    );
    
    if (JSON.stringify(newBackupUrls) !== JSON.stringify(episode.backupUrls)) {
      await prisma.episode.update({
        where: { id: episode.id },
        data: { backupUrls: newBackupUrls },
      });
      episodeBackupUrlsUpdated++;
    }
  }
  console.log(`Updated ${episodeBackupUrlsUpdated} episode backup URLs\n`);
  
  console.log('=== UPDATE COMPLETE ===');
  console.log(`Total updates:`);
  console.log(`  - Streams: ${streamUpdated}`);
  console.log(`  - Stream backup URLs: ${backupUrlsUpdated}`);
  console.log(`  - Episodes: ${episodeUpdated}`);
  console.log(`  - Episode backup URLs: ${episodeBackupUrlsUpdated}`);
  
  // Verify with samples
  console.log('\n=== VERIFICATION SAMPLES ===');
  const sampleStream = await prisma.stream.findFirst({
    where: { sourceUrl: { startsWith: NEW_PATH } },
  });
  if (sampleStream) {
    console.log(`Sample movie path: ${sampleStream.sourceUrl}`);
  }
  
  const sampleEpisode = await prisma.episode.findFirst({
    where: { sourceUrl: { startsWith: NEW_PATH } },
  });
  if (sampleEpisode) {
    console.log(`Sample episode path: ${sampleEpisode.sourceUrl}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
