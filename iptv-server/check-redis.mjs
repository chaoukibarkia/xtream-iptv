import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

try {
  console.log('\n=== Checking Redis connections ===');

  // Get all connection keys
  const connectionKeys = await redis.keys('connections:*');
  console.log('Connection keys:', connectionKeys);

  for (const key of connectionKeys) {
    const members = await redis.smembers(key);
    const ttl = await redis.ttl(key);
    console.log(`\n${key}:`);
    console.log('  Members:', members);
    console.log('  Count:', members.length);
    console.log('  TTL:', ttl, 'seconds');

    // Check if each connection actually exists
    for (const member of members) {
      if (member.startsWith('hls:')) {
        const viewerId = member.substring(4);
        const userId = key.split(':')[1];
        const hlsKey = `hls:user:${userId}:${viewerId}`;
        const exists = await redis.exists(hlsKey);
        const viewerKey = `hls:viewer:${viewerId}`;
        const viewerExists = await redis.exists(viewerKey);
        console.log(`    ${member}:`);
        console.log(`      Connection exists: ${exists ? 'YES' : 'NO'}`);
        console.log(`      Viewer mapping exists: ${viewerExists ? 'YES' : 'NO'}`);
      } else {
        console.log(`    ${member}: (non-HLS connection)`);
      }
    }
  }

  // Check viewer keys
  const liveViewers = await redis.keys('stream:*:viewer:*');
  const abrViewers = await redis.keys('abr:*:viewer:*');
  const vodViewers = await redis.keys('vod:*:viewer:*');

  console.log('\n=== Viewer tracking keys ===');
  console.log('Live viewers:', liveViewers.length);
  console.log('ABR viewers:', abrViewers.length);
  console.log('VOD viewers:', vodViewers.length);

  await redis.quit();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
