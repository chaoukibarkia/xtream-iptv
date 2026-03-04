import { prisma } from './iptv-server/src/config/database.js';

async function checkStream() {
  const stream = await prisma.stream.findUnique({
    where: { id: 1859 },
    include: {
      category: true,
      transcodingProfile: true,
      abrProfile: true,
      server: true
    }
  });

  if (stream) {
    console.log(JSON.stringify(stream, null, 2));
  } else {
    console.log('Stream 1859 not found');
  }

  await prisma.$disconnect();
}

checkStream();
