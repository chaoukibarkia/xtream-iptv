import { EventEmitter } from 'events';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { settingsService } from '../settings/SettingsService.js';
import { SourceStatus, StreamType, Stream } from '@prisma/client';
import { streamProber } from '../streaming/StreamProber.js';

export interface SourceCheckResult {
  sourceUrl: string;
  isPrimary: boolean;
  status: SourceStatus;
  error: string | null;
  responseTimeMs: number;
}

export interface StreamCheckResult {
  streamId: number;
  streamName: string;
  sourceStatus: SourceStatus;
  onlineCount: number;
  totalCount: number;
  sources: SourceCheckResult[];
}

interface CheckerConfig {
  enabled: boolean;
  intervalMinutes: number;
  batchSize: number;
}

const DEFAULT_CONFIG: CheckerConfig = {
  enabled: true,
  intervalMinutes: 30,
  batchSize: 10,  // Small batch to avoid rate limiting from source servers
};

export class SourceStatusChecker extends EventEmitter {
  private config: CheckerConfig = DEFAULT_CONFIG;
  private checkTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTime: Date | null = null;
  private nextCheckTime: Date | null = null;

  constructor() {
    super();
  }

  /**
   * Start the source status checker
   */
  async start(): Promise<void> {
    await this.loadConfig();

    if (!this.config.enabled) {
      logger.info('Source status checker disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Source status checker already running');
      return;
    }

    this.isRunning = true;
    const intervalMs = this.config.intervalMinutes * 60 * 1000;

    // Run initial check after 2 minutes (allow other services to start)
    setTimeout(() => {
      this.runFullCheck().catch((err) =>
        logger.error({ err }, 'Initial source status check failed')
      );
    }, 120000);

    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.runFullCheck().catch((err) =>
        logger.error({ err }, 'Source status check failed')
      );
    }, intervalMs);

    this.updateNextCheckTime();

    logger.info(
      { intervalMinutes: this.config.intervalMinutes },
      'Source status checker started'
    );
  }

  /**
   * Stop the source status checker
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.isRunning = false;
    this.nextCheckTime = null;
    logger.info('Source status checker stopped');
  }

  /**
   * Reload configuration from settings
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
      enabled: await settingsService.getOrDefault<boolean>('sourceChecker.enabled', true),
      intervalMinutes: await settingsService.getOrDefault<number>('sourceChecker.intervalMinutes', 30),
      batchSize: await settingsService.getOrDefault<number>('sourceChecker.batchSize', 50),
    };

    logger.debug({ config: this.config }, 'Source status checker config loaded');
  }

  /**
   * Run a full check of all active LIVE streams
   */
  async runFullCheck(): Promise<void> {
    if (this.isChecking) {
      logger.warn('Source status check already in progress, skipping');
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

      // Process in batches with delay between batches to avoid rate limiting
      for (let i = 0; i < streams.length; i += this.config.batchSize) {
        const batch = streams.slice(i, i + this.config.batchSize);

        const results = await Promise.all(
          batch.map((stream) => this.checkStream(stream))
        );

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

        // Add delay between batches to avoid overwhelming source servers
        if (i + this.config.batchSize < streams.length) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
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
        },
        'Source status check completed'
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
   * Check all sources for a single stream and update database
   */
  private async checkStream(stream: {
    id: number;
    name: string;
    sourceUrl: string;
    backupUrls: string[];
    customUserAgent: string | null;
  }): Promise<StreamCheckResult> {
    // Build list of all sources
    const sources = [
      { url: stream.sourceUrl, isPrimary: true },
      ...stream.backupUrls.map((url) => ({ url, isPrimary: false })),
    ];

    // Check all sources in parallel
    const results = await Promise.all(
      sources.map((s) => this.checkSource(stream.id, s.url, s.isPrimary, stream.customUserAgent))
    );

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
   * Check a single source URL using StreamProber and store the result
   */
  private async checkSource(
    streamId: number,
    url: string,
    isPrimary: boolean,
    customUserAgent: string | null
  ): Promise<SourceCheckResult> {
    const startTime = Date.now();
    let status: SourceStatus = 'OFFLINE';
    let error: string | null = null;

    try {
      // Use full probe for accurate stream validation - checks video/audio codecs
      const probeResult = await streamProber.probe(url, false, customUserAgent || undefined);
      
      if (probeResult.success && (probeResult.video || probeResult.audio)) {
        status = 'ONLINE';
        logger.debug(
          { streamId, url: url.substring(0, 80), video: probeResult.video?.codec, audio: probeResult.audio?.codec },
          'Stream probe successful'
        );
      } else {
        status = 'OFFLINE';
        error = probeResult.error || 'No video/audio streams found';
      }
    } catch (err: any) {
      status = 'OFFLINE';
      error = err.message || 'Unknown error';
    }

    const responseTimeMs = Date.now() - startTime;

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

    return {
      sourceUrl: url,
      isPrimary,
      status,
      error,
      responseTimeMs,
    };
  }

  /**
   * Update the next check time based on interval
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
    config: CheckerConfig;
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
   * Get overall source status statistics
   */
  async getStats(): Promise<{
    totalStreams: number;
    online: number;
    offline: number;
    unknown: number;
    lastFullCheck: Date | null;
    nextScheduledCheck: Date | null;
  }> {
    const stats = await prisma.stream.groupBy({
      by: ['sourceStatus'],
      where: {
        streamType: StreamType.LIVE,
        isActive: true,
      },
      _count: {
        id: true,
      },
    });

    let online = 0;
    let offline = 0;
    let unknown = 0;

    for (const stat of stats) {
      if (stat.sourceStatus === 'ONLINE') {
        online = stat._count.id;
      } else if (stat.sourceStatus === 'OFFLINE') {
        offline = stat._count.id;
      } else {
        unknown = stat._count.id;
      }
    }

    return {
      totalStreams: online + offline + unknown,
      online,
      offline,
      unknown,
      lastFullCheck: this.lastCheckTime,
      nextScheduledCheck: this.nextCheckTime,
    };
  }

  /**
   * Get all offline streams
   */
  async getOfflineStreams(options?: {
    page?: number;
    limit?: number;
    categoryId?: number;
  }): Promise<{
    streams: Array<{
      id: number;
      name: string;
      sourceStatus: SourceStatus;
      lastSourceCheck: Date | null;
      onlineSourceCount: number;
      totalSourceCount: number;
      categoryName: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = {
      streamType: StreamType.LIVE,
      isActive: true,
      sourceStatus: 'OFFLINE',
    };

    if (options?.categoryId) {
      where.categoryId = options.categoryId;
    }

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({
        where,
        select: {
          id: true,
          name: true,
          sourceStatus: true,
          lastSourceCheck: true,
          onlineSourceCount: true,
          totalSourceCount: true,
          category: {
            select: { name: true },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.stream.count({ where }),
    ]);

    return {
      streams: streams.map((s) => ({
        id: s.id,
        name: s.name,
        sourceStatus: s.sourceStatus,
        lastSourceCheck: s.lastSourceCheck,
        onlineSourceCount: s.onlineSourceCount,
        totalSourceCount: s.totalSourceCount,
        categoryName: s.category?.name || '',
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Get source check details for a specific stream
   */
  async getStreamSourceChecks(streamId: number): Promise<{
    streamId: number;
    streamName: string;
    sourceStatus: SourceStatus;
    lastSourceCheck: Date | null;
    sources: Array<{
      id: number;
      sourceUrl: string;
      isPrimary: boolean;
      status: SourceStatus;
      lastChecked: Date | null;
      lastOnlineAt: Date | null;
      lastError: string | null;
      responseTimeMs: number | null;
      consecutiveFailures: number;
    }>;
  } | null> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        name: true,
        sourceStatus: true,
        lastSourceCheck: true,
        sourceChecks: {
          orderBy: [{ isPrimary: 'desc' }, { sourceUrl: 'asc' }],
        },
      },
    });

    if (!stream) {
      return null;
    }

    return {
      streamId: stream.id,
      streamName: stream.name,
      sourceStatus: stream.sourceStatus,
      lastSourceCheck: stream.lastSourceCheck,
      sources: stream.sourceChecks.map((sc) => ({
        id: sc.id,
        sourceUrl: sc.sourceUrl,
        isPrimary: sc.isPrimary,
        status: sc.status,
        lastChecked: sc.lastChecked,
        lastOnlineAt: sc.lastOnlineAt,
        lastError: sc.lastError,
        responseTimeMs: sc.responseTimeMs,
        consecutiveFailures: sc.consecutiveFailures,
      })),
    };
  }
}

// Export singleton instance
export const sourceStatusChecker = new SourceStatusChecker();
