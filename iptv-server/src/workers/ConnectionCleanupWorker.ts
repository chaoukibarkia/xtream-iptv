import { logger } from '../config/logger.js';
import { redis } from '../config/redis.js';
import { prisma } from '../config/database.js';
import { cleanupExpiredHlsConnections } from '../api/middlewares/auth.js';

interface WorkerConfig {
  // Cleanup interval in milliseconds
  cleanupInterval: number;
  // Stale connection threshold in milliseconds (connections older than this are considered stale)
  staleConnectionThreshold: number;
  // Enable/disable
  enabled: boolean;
}

const DEFAULT_CONFIG: WorkerConfig = {
  cleanupInterval: 15 * 1000, // 15 seconds - reduced for faster disconnect detection
  staleConnectionThreshold: 5 * 60 * 1000, // 5 minutes - MPEG-TS connections older than this without activity are stale
  enabled: true,
};

export class ConnectionCleanupWorker {
  private config: WorkerConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the worker
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Connection cleanup worker disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Connection cleanup worker already running');
      return;
    }

    this.isRunning = true;

    // Run initial cleanup after 1 minute (let server start up)
    setTimeout(() => {
      this.cleanup().catch((err) =>
        logger.error({ err }, 'Initial connection cleanup failed')
      );
    }, 60000);

    // Schedule periodic cleanup
    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((err) =>
        logger.error({ err }, 'Connection cleanup failed')
      );
    }, this.config.cleanupInterval);

    logger.info(
      {
        cleanupInterval: `${this.config.cleanupInterval / 1000} seconds`,
        staleThreshold: `${this.config.staleConnectionThreshold / 60000} minutes`,
      },
      'Connection cleanup worker started'
    );
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.isRunning = false;
    logger.info('Connection cleanup worker stopped');
  }

  /**
   * Cleanup expired connections from all users
   */
  private async cleanup(): Promise<void> {
    try {
      let hlsCleaned = 0;
      let cursor = '0';

      // 1. Clean up expired HLS connections from Redis
      do {
        const [nextCursor, keys] = await redis.scan(
          cursor,
          'MATCH',
          'connections:*',
          'COUNT',
          100
        );
        cursor = nextCursor;

        for (const key of keys) {
          // Extract userId from key pattern "connections:{userId}"
          const userId = parseInt(key.split(':')[1], 10);
          if (!isNaN(userId)) {
            const beforeCount = await redis.scard(key);
            await cleanupExpiredHlsConnections(userId);
            const afterCount = await redis.scard(key);
            const cleaned = beforeCount - afterCount;

            if (cleaned > 0) {
              hlsCleaned += cleaned;
              logger.debug(
                { userId, cleaned },
                'Cleaned up expired HLS connections for user'
              );
            }
          }
        }
      } while (cursor !== '0');

      // 2. Clean up stale MPEG-TS connections from database
      // These are connections that were created but never properly closed
      // (e.g., due to network drop, client crash, etc.)
      const staleThreshold = new Date(Date.now() - this.config.staleConnectionThreshold);
      
      const staleConnections = await prisma.lineConnection.findMany({
        where: {
          startedAt: { lt: staleThreshold },
        },
        select: {
          id: true,
          lineId: true,
        },
      });

      if (staleConnections.length > 0) {
        // Remove from Redis sets first
        for (const conn of staleConnections) {
          const connectionKey = `connections:${conn.lineId}`;
          await redis.srem(connectionKey, conn.id);
        }

        // Then delete from database
        const deleteResult = await prisma.lineConnection.deleteMany({
          where: {
            id: { in: staleConnections.map(c => c.id) },
          },
        });

        logger.info(
          { staleConnectionsCleaned: deleteResult.count },
          'Cleaned up stale MPEG-TS connections from database'
        );
      }

      // 3. Clean up stale viewer keys that have expired TTL
      const viewerKeysCleaned = await this.cleanupStaleViewerKeys();

      // 4. Sync Redis connection sets with database
      // Remove any connection IDs from Redis that don't exist in database
      // (except HLS connections which are tracked differently)
      await this.syncRedisWithDatabase();

      if (hlsCleaned > 0 || viewerKeysCleaned > 0) {
        logger.info({ hlsCleaned, viewerKeysCleaned }, 'Connection cleanup completed');
      }
    } catch (error) {
      logger.error({ error }, 'Error during connection cleanup');
      throw error;
    }
  }

  /**
   * Cleanup stale viewer keys that have expired TTL
   * Removes orphaned viewer keys from stream:*:viewer:*, abr:*:viewer:*, and vod:*:viewer:* patterns
   */
  private async cleanupStaleViewerKeys(): Promise<number> {
    let cleanedCount = 0;

    try {
      // Cleanup regular stream viewers
      const streamViewerKeys = await redis.keys('stream:*:viewer:*');
      for (const key of streamViewerKeys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1 || ttl === -2) {
          // Key has no TTL or doesn't exist - remove it
          await redis.del(key);
          cleanedCount++;
        }
      }

      // Cleanup ABR stream viewers
      const abrViewerKeys = await redis.keys('abr:*:viewer:*');
      for (const key of abrViewerKeys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1 || ttl === -2) {
          await redis.del(key);
          cleanedCount++;
        }
      }

      // Cleanup VOD viewers
      const vodViewerKeys = await redis.keys('vod:*:viewer:*');
      for (const key of vodViewerKeys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1 || ttl === -2) {
          await redis.del(key);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.debug({ cleanedCount }, 'Cleaned up stale viewer keys');
      }
    } catch (error) {
      logger.error({ error }, 'Error cleaning up stale viewer keys');
    }

    return cleanedCount;
  }

  /**
   * Sync Redis connection sets with database
   * Removes connection IDs from Redis that no longer exist in database
   * (excludes HLS connections which use TTL-based tracking)
   */
  private async syncRedisWithDatabase(): Promise<void> {
    let cursor = '0';
    let syncedCount = 0;

    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        'connections:*',
        'COUNT',
        100
      );
      cursor = nextCursor;

      for (const key of keys) {
        const members = await redis.smembers(key);
        
        for (const member of members) {
          // Skip HLS connections (they're tracked by TTL)
          if (member.startsWith('hls:')) continue;

          // Check if this connection exists in database
          const exists = await prisma.lineConnection.findUnique({
            where: { id: member },
            select: { id: true },
          });

          if (!exists) {
            // Connection doesn't exist in database, remove from Redis
            await redis.srem(key, member);
            syncedCount++;
          }
        }
      }
    } while (cursor !== '0');

    if (syncedCount > 0) {
      logger.debug({ syncedCount }, 'Synced Redis connection sets with database');
    }
  }
}

// Export singleton
export const connectionCleanupWorker = new ConnectionCleanupWorker();
