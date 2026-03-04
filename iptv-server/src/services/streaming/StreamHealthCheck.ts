import { streamProber } from './StreamProber.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';

export interface HealthCheckConfig {
  enabled: boolean;
  method: 'http' | 'ffprobe' | 'both';
  timeout: number;
  cacheResults: boolean;
  cacheTTL: number;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
  enabled: true,
  method: 'http', // Fast HTTP check first
  timeout: 5000,  // 5 seconds max
  cacheResults: true,
  cacheTTL: 300,  // 5 minutes
};

export interface StreamHealthResult {
  healthy: boolean;
  latency: number;
  error?: string;
  checkedAt: Date;
}

class StreamHealthChecker {
  private config: HealthCheckConfig;

  constructor(config?: Partial<HealthCheckConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if a stream source is working before starting it
   * This prevents registering connections for broken streams
   */
  async checkStreamHealth(
    streamId: number,
    sourceUrl: string,
    userAgent?: string
  ): Promise<StreamHealthResult> {
    const startTime = Date.now();

    // If health check disabled, assume healthy
    if (!this.config.enabled) {
      return {
        healthy: true,
        latency: 0,
        checkedAt: new Date(),
      };
    }

    // Check cache first
    if (this.config.cacheResults) {
      const cacheKey = `stream:health:${streamId}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const result = JSON.parse(cached);
        logger.debug(
          { streamId, cached: true, healthy: result.healthy },
          'Using cached health check result'
        );
        return result;
      }
    }

    // Perform health check
    try {
      const result = await streamProber.checkHealth(
        sourceUrl,
        this.config.method === 'both' || this.config.method === 'ffprobe',
        userAgent
      );

      const healthResult: StreamHealthResult = {
        healthy: result.online,
        latency: result.latency,
        error: result.error,
        checkedAt: new Date(),
      };

      // Cache the result
      if (this.config.cacheResults) {
        const cacheKey = `stream:health:${streamId}`;
        await redis.setex(
          cacheKey,
          this.config.cacheTTL,
          JSON.stringify(healthResult)
        );
      }

      logger.info(
        {
          streamId,
          healthy: healthResult.healthy,
          latency: healthResult.latency,
          method: result.method,
          error: healthResult.error,
        },
        'Stream health check completed'
      );

      return healthResult;
    } catch (error: any) {
      logger.error(
        { streamId, error: error.message },
        'Stream health check failed'
      );

      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.message,
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Clear health check cache for a stream
   */
  async clearCache(streamId: number): Promise<void> {
    const cacheKey = `stream:health:${streamId}`;
    await redis.del(cacheKey);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const streamHealthChecker = new StreamHealthChecker();
