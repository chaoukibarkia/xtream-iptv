import { EventEmitter } from 'events';
import axios from 'axios';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { StreamType } from '@prisma/client';

export interface HealthStatus {
  online: boolean;
  latency: number;
  lastCheck: Date;
  statusCode?: number;
  contentType?: string;
  error?: string;
}

export interface StreamHealth {
  streamId: number;
  name: string;
  sourceUrl: string;
  health: HealthStatus;
}

interface MonitorConfig {
  checkIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  batchSize: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: MonitorConfig = {
  checkIntervalMs: 60000, // 1 minute
  timeoutMs: 10000, // 10 seconds
  maxRetries: 2,
  batchSize: 50,
  enabled: true,
};

export class StreamHealthMonitor extends EventEmitter {
  private config: MonitorConfig;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastCheckResults: Map<number, HealthStatus> = new Map();

  constructor(config?: Partial<MonitorConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the health monitor
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('Stream health monitor disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Stream health monitor already running');
      return;
    }

    this.isRunning = true;

    // Run initial check after 60 seconds
    setTimeout(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Initial health check failed')
      );
    }, 60000);

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Health check failed')
      );
    }, this.config.checkIntervalMs);

    logger.info(
      { intervalMs: this.config.checkIntervalMs },
      'Stream health monitor started'
    );
  }

  /**
   * Stop the health monitor
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isRunning = false;
    logger.info('Stream health monitor stopped');
  }

  /**
   * Run health checks for all active live streams
   */
  async runHealthChecks(): Promise<void> {
    const startTime = Date.now();

    // Get all active live streams
    const streams = await prisma.stream.findMany({
      where: {
        streamType: StreamType.LIVE,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sourceUrl: true,
        backupUrls: true,
        customUserAgent: true,
      },
    });

    if (streams.length === 0) {
      logger.debug('No active streams to check');
      return;
    }

    let healthy = 0;
    let unhealthy = 0;
    let switched = 0;

    // Process in batches
    for (let i = 0; i < streams.length; i += this.config.batchSize) {
      const batch = streams.slice(i, i + this.config.batchSize);

      const results = await Promise.all(
        batch.map(async (stream) => {
          const health = await this.checkStream(stream.sourceUrl, 0, stream.customUserAgent || undefined);

          // Store result in memory and Redis
          this.lastCheckResults.set(stream.id, health);
          await redis.setex(
            `health:${stream.id}`,
            120,
            JSON.stringify(health)
          );

          if (health.online) {
            healthy++;
          } else {
            unhealthy++;

            // Try backup URLs if main source is down
            if (stream.backupUrls.length > 0) {
              for (const backupUrl of stream.backupUrls) {
                const backupHealth = await this.checkStream(backupUrl, 0, stream.customUserAgent || undefined);
                if (backupHealth.online) {
                  // Emit event for stream source switch
                  this.emit('switchToBackup', {
                    streamId: stream.id,
                    name: stream.name,
                    failedUrl: stream.sourceUrl,
                    backupUrl,
                  });

                  // Update source URL in database
                  await this.switchToBackup(stream.id, backupUrl, stream.sourceUrl);
                  switched++;
                  break;
                }
              }
            }
          }

          return { stream, health };
        })
      );

      // Emit batch results
      this.emit('batchComplete', results);
    }

    const duration = Date.now() - startTime;

    logger.info(
      {
        total: streams.length,
        healthy,
        unhealthy,
        switched,
        durationMs: duration,
      },
      'Health check completed'
    );

    // Emit summary
    this.emit('checkComplete', {
      total: streams.length,
      healthy,
      unhealthy,
      switched,
      duration,
    });
  }

  /**
   * Check a single stream URL
   */
  async checkStream(url: string, retries = 0, userAgent?: string): Promise<HealthStatus> {
    const startTime = Date.now();

    try {
      const response = await axios.head(url, {
        timeout: this.config.timeoutMs,
        headers: {
          'User-Agent': userAgent || 'IPTV-HealthCheck/1.0',
        },
        maxRedirects: 3,
        validateStatus: () => true, // Accept all status codes
      });

      const latency = Date.now() - startTime;
      const isOnline = response.status >= 200 && response.status < 400;

      return {
        online: isOnline,
        latency,
        lastCheck: new Date(),
        statusCode: response.status,
        contentType: response.headers['content-type'],
      };
    } catch (error: any) {
      // Retry if we haven't exhausted retries
      if (retries < this.config.maxRetries) {
        await new Promise((r) => setTimeout(r, 1000));
        return this.checkStream(url, retries + 1, userAgent);
      }

      return {
        online: false,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        error: error.code || error.message,
      };
    }
  }

  /**
   * Switch stream to backup URL
   */
  private async switchToBackup(
    streamId: number,
    backupUrl: string,
    oldUrl: string
  ): Promise<void> {
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        sourceUrl: backupUrl,
        backupUrls: {
          set: [oldUrl], // Move old URL to backup
        },
      },
    });

    logger.warn(
      { streamId, oldUrl, newUrl: backupUrl },
      'Switched to backup stream source'
    );
  }

  /**
   * Get health status for a specific stream
   */
  async getStreamHealth(streamId: number): Promise<HealthStatus | null> {
    // Check memory cache first
    const cached = this.lastCheckResults.get(streamId);
    if (cached) {
      return cached;
    }

    // Check Redis
    const redisData = await redis.get(`health:${streamId}`);
    if (redisData) {
      return JSON.parse(redisData);
    }

    // Perform live check
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { sourceUrl: true, customUserAgent: true },
    });

    if (!stream) {
      return null;
    }

    return this.checkStream(stream.sourceUrl, 0, stream.customUserAgent || undefined);
  }

  /**
   * Get health status for all checked streams
   */
  async getAllStreamHealth(): Promise<StreamHealth[]> {
    const streams = await prisma.stream.findMany({
      where: {
        streamType: StreamType.LIVE,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        sourceUrl: true,
      },
    });

    const results: StreamHealth[] = [];

    for (const stream of streams) {
      let health = this.lastCheckResults.get(stream.id);

      if (!health) {
        const redisData = await redis.get(`health:${stream.id}`);
        if (redisData) {
          health = JSON.parse(redisData);
        }
      }

      if (health) {
        results.push({
          streamId: stream.id,
          name: stream.name,
          sourceUrl: stream.sourceUrl,
          health,
        });
      }
    }

    return results;
  }

  /**
   * Get overall health statistics
   */
  async getHealthStats(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
    avgLatency: number;
  }> {
    const streams = await prisma.stream.findMany({
      where: {
        streamType: StreamType.LIVE,
        isActive: true,
      },
      select: { id: true },
    });

    let healthy = 0;
    let unhealthy = 0;
    let unknown = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const stream of streams) {
      const health = this.lastCheckResults.get(stream.id);

      if (!health) {
        unknown++;
      } else if (health.online) {
        healthy++;
        totalLatency += health.latency;
        latencyCount++;
      } else {
        unhealthy++;
      }
    }

    return {
      total: streams.length,
      healthy,
      unhealthy,
      unknown,
      avgLatency: latencyCount > 0 ? Math.round(totalLatency / latencyCount) : 0,
    };
  }

  /**
   * Get current status
   */
  getStatus(): {
    running: boolean;
    config: MonitorConfig;
    lastCheckCount: number;
  } {
    return {
      running: this.isRunning,
      config: this.config,
      lastCheckCount: this.lastCheckResults.size,
    };
  }
}

// Export singleton instance
export const streamHealthMonitor = new StreamHealthMonitor();

