import { EventEmitter } from 'events';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { settingsService } from '../settings/SettingsService.js';
import { SourceStatus, StreamType, Stream } from '@prisma/client';
import { curlStreamProber } from '../streaming/CurlStreamProber.js';

export interface CurlSourceCheckResult {
  sourceUrl: string;
  isPrimary: boolean;
  status: SourceStatus;
  error: string | null;
  responseTimeMs: number;
  statusCode?: number;
  contentType?: string;
  redirectCount?: number;
}

export interface CurlStreamCheckResult {
  streamId: number;
  streamName: string;
  sourceStatus: SourceStatus;
  onlineCount: number;
  totalCount: number;
  sources: CurlSourceCheckResult[];
}

interface CurlCheckerConfig {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
  useContentValidation: boolean;
  maxConcurrentChecks: number;
}

const DEFAULT_CONFIG: CurlCheckerConfig = {
  enabled: true,
  intervalMinutes: 30,
  batchSize: 20,  // Larger batch since curl is faster than FFprobe
  useContentValidation: false,  // Disable by default for speed
  maxConcurrentChecks: 10,
};

export class CurlSourceStatusChecker extends EventEmitter {
  private config: CurlCheckerConfig = DEFAULT_CONFIG;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTime: Date | null = null;
  private nextCheckTime: Date | null = null;

  constructor() {
    super();
  }

  /**
   * Start the curl-based source status checker
   */
  async start(): Promise<void> {
    await this.loadConfig();

    if (!this.config.enabled) {
      logger.info('Curl source status checker disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Curl source status checker already running');
      return;
    }

    this.isRunning = true;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    // Run initial check after 1 minute (faster startup than FFprobe version)
    setTimeout(() => {
      this.runFullCheck().catch((err) =>
        logger.error({ err }, 'Initial curl source status check failed')
      );
    }, 60000);

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.runFullCheck().catch((err) =>
        logger.error({ err }, 'Curl source status check failed')
      );
    }, intervalMs);

    this.updateNextCheckTime();

    logger.info(
      { 
        intervalMinutes: this.config.intervalMinutes,
        batchSize: this.config.batchSize,
        contentValidation: this.config.useContentValidation 
      },
      'Curl source status checker started'
    );
  }

  /**
   * Stop the checker
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isRunning = false;
    this.nextCheckTime = null;
    logger.info('Curl source status checker stopped');
  }

  /**
   * Reload configuration
   */
  async reloadConfig(): Promise<void> {
    const wasRunning = this.isRunning;

    if (wasRunning) {
      this.stop();
    }

    await this.loadConfig();

    if (wasRunning && this.config.enabled) {
      await this.start();
    }
  }

  /**
   * Load configuration from SystemSettings
   */
  private async loadConfig(): Promise<void> {
    this.config = {
      enabled: await settingsService.getOrDefault<boolean>('curlSourceChecker.enabled', true),
      intervalMinutes: await settingsService.getOrDefault<number>('curlSourceChecker.intervalMinutes', 30),
      batchSize: await settingsService.getOrDefault<number>('curlSourceChecker.batchSize', 20),
      useContentValidation: await settingsService.getOrDefault<boolean>('curlSourceChecker.useContentValidation', false),
      maxConcurrentChecks: await settingsService.getOrDefault<number>('curlSourceChecker.maxConcurrentChecks', 10),
    };

    logger.debug({ config: this.config }, 'Curl source status checker config loaded');
  }

  /**
   * Run a full check of all active LIVE streams using curl
   */
  async runFullCheck(): Promise<void> {
    if (this.isChecking) {
      logger.warn('Curl source status check already in progress, skipping');
      return;
    }

    this.isChecking = true;
    const startTime = Date.now();

    try {
      // Get all active LIVE streams
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
        logger.debug('No active LIVE streams to check');
        this.lastCheckTime = new Date();
        this.updateNextCheckTime();
        return;
      }

      let totalOnline = 0;
      let totalOffline = 0;
      let totalUnknown = 0;

      // Process in batches with controlled concurrency
      for (let i = 0; i < streams.length; i += this.config.batchSize) {
        const batch = streams.slice(i, i + this.config.batchSize);

        const results = await this.processBatch(batch);

        for (const result of results) {
          if (result.sourceStatus === 'ONLINE') {
            totalOnline++;
          } else if (result.sourceStatus === 'OFFLINE') {
            totalOffline++;
          } else {
            totalUnknown++;
          }
        }

        // Emit batch progress
        this.emit('batchComplete', {
          processed: Math.min(i + this.config.batchSize, streams.length),
          total: streams.length,
        });

        // Shorter delay between batches since curl is faster
        if (i + this.config.batchSize < streams.length) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 0.5 second delay
        }
      }

      const duration = Date.now() - startTime;
      this.lastCheckTime = new Date();
      this.updateNextCheckTime();

      logger.info(
        {
          total: streams.length,
          online: totalOnline,
          offline: totalOffline,
          unknown: totalUnknown,
          durationMs: duration,
          avgTimePerStream: Math.round(duration / streams.length),
        },
        'Curl source status check completed'
      );

      // Emit completion event
      this.emit('checkComplete', {
        total: streams.length,
        online: totalOnline,
        offline: totalOffline,
        unknown: totalUnknown,
        duration,
      });

    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Process a batch of streams with controlled concurrency
   */
  private async processBatch(streams: Array<{
    id: number;
    name: string;
    sourceUrl: string;
    backupUrls: string[];
    customUserAgent: string | null;
  }>): Promise<CurlStreamCheckResult[]> {
    // Process streams in smaller concurrent groups
    const results: CurlStreamCheckResult[] = [];
    
    for (let i = 0; i < streams.length; i += this.config.maxConcurrentChecks) {
      const concurrentBatch = streams.slice(i, i + this.config.maxConcurrentChecks);
      
      const batchResults = await Promise.all(
        concurrentBatch.map(stream => this.checkStream(stream))
      );
      
      results.push(...batchResults);
    }
    
    return results;
  }

  /**
   * Check all sources for a single stream using curl
   */
  private async checkStream(stream: {
    id: number;
    name: string;
    sourceUrl: string;
    backupUrls: string[];
    customUserAgent: string | null;
  }): Promise<CurlStreamCheckResult> {
    // Build list of all sources
    const sources = [
      { url: stream.sourceUrl, isPrimary: true },
      ...stream.backupUrls.map((url) => ({ url, isPrimary: false })),
    ];

    // Check all sources using curl batch check for efficiency
    const urls = sources.map(s => s.url);
    const curlResults = await curlStreamProber.batchCheck(
      urls, 
      stream.customUserAgent || undefined,
      this.config.maxConcurrentChecks
    );

    // Convert curl results to our format
    const results: CurlSourceCheckResult[] = [];
    for (const source of sources) {
      const curlResult = curlResults.get(source.url);
      if (curlResult) {
        results.push({
          sourceUrl: source.url,
          isPrimary: source.isPrimary,
          status: curlResult.online ? 'ONLINE' : 'OFFLINE',
          error: curlResult.error || null,
          responseTimeMs: curlResult.latency,
          statusCode: curlResult.statusCode,
          contentType: curlResult.contentType,
          redirectCount: curlResult.redirectCount,
        });

        // Store detailed check result in database
        await this.storeSourceCheck(stream.id, source.url, source.isPrimary, curlResult);
      }
    }

    // Aggregate results
    const onlineCount = results.filter((r) => r.status === 'ONLINE').length;
    const aggregateStatus: SourceStatus = onlineCount > 0 ? 'ONLINE' : 'OFFLINE';

    // Update stream with aggregated status
    await prisma.stream.update({
      where: { id: stream.id },
      data: {
        sourceStatus: aggregateStatus,
        lastSourceCheck: new Date(),
        onlineSourceCount: onlineCount,
        totalSourceCount: sources.length,
      },
    });

    return {
      streamId: stream.id,
      streamName: stream.name,
      sourceStatus: aggregateStatus,
      onlineCount,
      totalCount: sources.length,
      sources: results,
    };
  }

  /**
   * Store curl check result in database
   */
  private async storeSourceCheck(
    streamId: number,
    url: string,
    isPrimary: boolean,
    curlResult: any
  ): Promise<void> {
    const status: SourceStatus = curlResult.online ? 'ONLINE' : 'OFFLINE';
    const error = curlResult.error || null;
    const responseTimeMs = curlResult.latency;

    // Upsert to database
    const existingCheck = await prisma.streamSourceCheck.findUnique({
      where: {
        streamId_sourceUrl: { streamId, sourceUrl: url },
      },
    });

    if (existingCheck) {
      // Update existing record
      await prisma.streamSourceCheck.update({
        where: { id: existingCheck.id },
        data: {
          isPrimary,
          status,
          lastChecked: new Date(),
          lastOnlineAt: status === 'ONLINE' ? new Date() : existingCheck.lastOnlineAt,
          lastError: error,
          responseTimeMs: status === 'ONLINE' ? responseTimeMs : null,
          consecutiveFailures: status === 'OFFLINE'
            ? existingCheck.consecutiveFailures + 1
            : 0,
        },
      });
    } else {
      // Create new record
      await prisma.streamSourceCheck.create({
        data: {
          streamId,
          sourceUrl: url,
          isPrimary,
          status,
          lastChecked: new Date(),
          lastOnlineAt: status === 'ONLINE' ? new Date() : null,
          lastError: error,
          responseTimeMs: status === 'ONLINE' ? responseTimeMs : null,
          consecutiveFailures: status === 'OFFLINE' ? 1 : 0,
        },
      });
    }
  }

  /**
   * Update the next check time
   */
  private updateNextCheckTime(): void {
    if (this.isRunning && this.config.enabled) {
      this.nextCheckTime = new Date(Date.now() + this.config.intervalMinutes * 60 * 1000);
    }
  }

  /**
   * Get current status and statistics
   */
  async getStatus(): Promise<{
    running: boolean;
    checking: boolean;
    config: CurlCheckerConfig;
    lastCheckTime: Date | null;
    nextCheckTime: Date | null;
  }> {
    return {
      running: this.isRunning,
      checking: this.isChecking,
      config: this.config,
      lastCheckTime: this.lastCheckTime,
      nextCheckTime: this.nextCheckTime,
    };
  }

  /**
   * Force a manual check of a specific stream
   */
  async checkStreamManual(streamId: number): Promise<CurlStreamCheckResult | null> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        name: true,
        sourceUrl: true,
        backupUrls: true,
        customUserAgent: true,
        streamType: true,
        isActive: true,
      },
    });

    if (!stream || stream.streamType !== StreamType.LIVE || !stream.isActive) {
      return null;
    }

    return this.checkStream(stream);
  }

  /**
   * Get performance comparison with FFprobe checker
   */
  async getPerformanceStats(): Promise<{
    avgResponseTime: number;
    successRate: number;
    totalChecksLast24h: number;
    fastestCheck: number;
    slowestCheck: number;
  }> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const checks = await prisma.streamSourceCheck.findMany({
      where: {
        lastChecked: { gte: since },
        responseTimeMs: { not: null },
      },
      select: {
        responseTimeMs: true,
        status: true,
      },
    });

    if (checks.length === 0) {
      return {
        avgResponseTime: 0,
        successRate: 0,
        totalChecksLast24h: 0,
        fastestCheck: 0,
        slowestCheck: 0,
      };
    }

    const responseTimes = checks
      .map(c => c.responseTimeMs!)
      .filter(t => t > 0);
    
    const successCount = checks.filter(c => c.status === 'ONLINE').length;

    return {
      avgResponseTime: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
      successRate: Math.round((successCount / checks.length) * 100),
      totalChecksLast24h: checks.length,
      fastestCheck: Math.min(...responseTimes),
      slowestCheck: Math.max(...responseTimes),
    };
  }
}

// Export singleton instance
export const curlSourceStatusChecker = new CurlSourceStatusChecker();