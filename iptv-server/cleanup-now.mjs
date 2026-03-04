import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

try {
  const connectionSetKey = 'connections:1';
  const members = await redis.smembers(connectionSetKey);

  console.log('Checking', members.length, 'connections...');

  for (const member of members) {
    if (member.startsWith('hls:')) {
      const viewerId = member.substring(4);
      const hlsConnectionKey = `hls:user:1:${viewerId}`;
      const exists = await redis.exists(hlsConnectionKey);

      if (!exists) {
        console.log('Removing expired connection:', member);
        await redis.srem(connectionSetKey, member);
      } else {
        console.log('Active connection:', member);
      }
    }
  }

  const finalCount = await redis.scard(connectionSetKey);
  console.log('\nFinal connection count:', finalCount);

  await redis.quit();
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
