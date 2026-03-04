import { Redis } from 'ioredis';
import { config } from './index.js';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  lazyConnect: true,
  // Connection pool and timeout settings
  connectTimeout: 10000, // 10 seconds to connect
  commandTimeout: 15000, // 15 seconds per command (increased from 5s to prevent crashes)
  keepAlive: 30000, // Send keepalive every 30 seconds
  enableReadyCheck: true,
  enableOfflineQueue: true,
  reconnectOnError(err) {
    // Reconnect on specific errors
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'NOAUTH', 'Connection is closed'];
    return targetErrors.some(e => err.message.includes(e));
  },
});

redis.on('error', (err: Error) => {
  console.error('Redis error:', err.message);
});

redis.on('connect', () => {
  console.log('✅ Redis connected');
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
    console.log('✅ Redis connected successfully');
  } catch (error: any) {
    console.error('❌ Redis connection failed:', error.message);
    // Don't throw - allow server to start without Redis
    // Redis-dependent features will fail gracefully
    console.warn('⚠️  Server will continue without Redis. Some features may be limited.');
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    console.log('Redis disconnected');
  } catch (error) {
    // Ignore errors during disconnect
  }
}

export function isRedisConnected(): boolean {
  return redis.status === 'ready';
}

// Cache helper functions
export const cache = {
  // TTLs in seconds
  TTL: {
    USER: 300,           // 5 minutes - for registered users (admin/reseller)
    LINE: 0,             // No cache - for IPTV lines (subscribers)
    CATEGORIES: 0,       // No cache
    STREAMS: 0,          // No cache
    EPG: 1800,           // 30 minutes
    HEALTH: 60,          // 1 minute
    CONNECTION: 3600,    // 1 hour
  },

  // Key generators
  KEYS: {
    // Registered users (admin/reseller)
    USER: (id: number) => `user:${id}`,
    USER_AUTH: (username: string, password: string) => `admin_auth:${username}:${password}`,
    
    // IPTV Lines (subscribers) - Xtream API compatible
    LINE: (id: number) => `line:${id}`,
    LINE_AUTH: (username: string, password: string) => `line_auth:${username}:${password}`,
    
    // Stream and content
    STREAM: (id: number) => `stream:${id}`,
    LIVE_CATEGORIES: 'categories:live',
    VOD_CATEGORIES: 'categories:vod',
    SERIES_CATEGORIES: 'categories:series',
    EPG_SHORT: (streamId: number) => `epg:short:${streamId}`,
    
    // Connections - uses lineId for IPTV subscribers
    ACTIVE_CONNECTIONS: (lineId: number) => `connections:${lineId}`,
    
    // Stream health and servers
    STREAM_HEALTH: (streamId: number) => `health:${streamId}`,
    AVAILABLE_SERVERS: (streamId: number) => `available_servers:${streamId}`,
    STREAM_TOKEN: (token: string) => `stream_token:${token}`,
  },

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    if (!isRedisConnected()) {
      // If Redis is not available, just fetch directly
      return await fetchFn();
    }
    
    try {
      const cached = await redis.get(key);
      
      if (cached) {
        return JSON.parse(cached);
      }

      const data = await fetchFn();
      await redis.setex(key, ttl, JSON.stringify(data));
      
      return data;
    } catch (error) {
      // If Redis operation fails, fall back to direct fetch
      return await fetchFn();
    }
  },

  async invalidatePattern(pattern: string): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }
    try {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      // Ignore Redis errors
    }
  },

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }
    try {
      if (ttl) {
        await redis.setex(key, ttl, JSON.stringify(value));
      } else {
        await redis.set(key, JSON.stringify(value));
      }
    } catch (error) {
      // Ignore Redis errors
    }
  },

  async get<T>(key: string): Promise<T | null> {
    if (!isRedisConnected()) {
      return null;
    }
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  },

  async del(key: string): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }
    try {
      await redis.del(key);
    } catch (error) {
      // Ignore Redis errors
    }
  },
};
