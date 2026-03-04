import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { LogLevel } from '@prisma/client';

// Log sources - these are stored as strings in the database
export type LogSource = 'STREAM' | 'AUTH' | 'USER' | 'SERVER' | 'EPG' | 'TRANSCODE' | 'SYSTEM' | 'API';

export interface LogEntry {
  level: LogLevel;
  source: string;
  message: string;
  details?: Record<string, any>;
  streamId?: number;
  userId?: number;
  serverId?: number;
  ipAddress?: string;
  userAgent?: string;
  errorCode?: string;
  stackTrace?: string;
}

export interface LogQueryOptions {
  level?: LogLevel;
  source?: LogSource;
  streamId?: number;
  userId?: number;
  serverId?: number;
  search?: string;
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Database Logger Service
 * Writes important system events to the database for viewing in the admin UI
 */
class DatabaseLoggerService {
  private queue: LogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly batchSize = 50;
  private readonly flushIntervalMs = 5000; // Flush every 5 seconds
  private readonly cleanupIntervalMs = 24 * 60 * 60 * 1000; // Cleanup every 24 hours
  private readonly retentionDays = 7;
  private isStarted = false;

  /**
   * Start the logger (begin background flushing)
   */
  start(): void {
    if (this.isStarted) return;
    
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
    
    this.isStarted = true;
    logger.info('DatabaseLogger started');
  }

  /**
   * Stop the logger (flush remaining and stop)
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flush();
    this.isStarted = false;
    logger.info('DatabaseLogger stopped');
  }

  /**
   * Log a debug message
   */
  debug(source: string, message: string, details?: Record<string, any>): void {
    this.log({ level: 'DEBUG', source, message, details });
  }

  /**
   * Log an info message
   */
  info(source: string, message: string, details?: Record<string, any>): void {
    this.log({ level: 'INFO', source, message, details });
  }

  /**
   * Log a warning message
   */
  warn(source: string, message: string, details?: Record<string, any>): void {
    this.log({ level: 'WARNING', source, message, details });
  }

  /**
   * Log an error message
   */
  error(source: string, message: string, details?: Record<string, any>, error?: Error): void {
    this.log({
      level: 'ERROR',
      source,
      message,
      details,
      stackTrace: error?.stack,
      errorCode: error?.name,
    });
  }

  /**
   * Log a critical error message
   */
  critical(source: string, message: string, details?: Record<string, any>, error?: Error): void {
    this.log({
      level: 'CRITICAL',
      source,
      message,
      details,
      stackTrace: error?.stack,
      errorCode: error?.name,
    });
  }

  // ==================== STREAM-SPECIFIC LOGGING ====================

  /**
   * Generic stream logging method
   */
  logStream(level: LogLevel | 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL', message: string, streamId?: number, details?: Record<string, any>): void {
    this.log({
      level: level as LogLevel,
      source: 'StreamService',
      message,
      details,
      streamId,
    });
  }

  /**
   * Log stream started event
   */
  streamStarted(streamId: number, streamName: string, details?: Record<string, any>): void {
    this.log({
      level: 'INFO',
      source: 'StreamService',
      message: `Stream #${streamId} "${streamName}" started successfully`,
      details,
      streamId,
    });
  }

  /**
   * Log stream stopped event
   */
  streamStopped(streamId: number, streamName: string, reason?: string): void {
    this.log({
      level: 'INFO',
      source: 'StreamService',
      message: `Stream #${streamId} "${streamName}" stopped${reason ? `: ${reason}` : ''}`,
      details: reason ? { reason } : undefined,
      streamId,
    });
  }

  /**
   * Log stream error event
   */
  streamError(streamId: number, streamName: string, errorMessage: string, error?: Error): void {
    this.log({
      level: 'ERROR',
      source: 'StreamService',
      message: `Stream #${streamId} "${streamName}" error: ${errorMessage}`,
      details: { error: errorMessage },
      streamId,
      stackTrace: error?.stack,
      errorCode: error?.name,
    });
  }

  /**
   * Log stream failover event
   */
  streamFailover(streamId: number, streamName: string, fromUrl: string, toUrl: string): void {
    this.log({
      level: 'WARNING',
      source: 'StreamService',
      message: `Stream #${streamId} "${streamName}" failover triggered`,
      details: { fromUrl, toUrl },
      streamId,
    });
  }

  /**
   * Log FFmpeg crash
   */
  ffmpegCrash(streamId: number, streamName: string, exitCode: number, pid: number): void {
    this.log({
      level: 'ERROR',
      source: 'TranscodeWorker',
      message: `FFmpeg process crashed for stream #${streamId} "${streamName}" (PID: ${pid}, exit code: ${exitCode})`,
      details: { exitCode, pid },
      streamId,
      errorCode: `FFMPEG_EXIT_${exitCode}`,
    });
  }

  /**
   * Log stream restarted event
   */
  streamRestarted(streamId: number, streamName: string, restartCount: number): void {
    this.log({
      level: 'INFO',
      source: 'StreamService',
      message: `Stream #${streamId} "${streamName}" restarted (attempt #${restartCount})`,
      details: { restartCount },
      streamId,
    });
  }

  /**
   * Log on-demand stream started for viewer
   */
  onDemandStreamStarted(streamId: number, streamName: string, viewerCount: number): void {
    this.log({
      level: 'INFO',
      source: 'OnDemandManager',
      message: `On-demand stream #${streamId} "${streamName}" started for viewer`,
      details: { viewerCount },
      streamId,
    });
  }

  /**
   * Log on-demand stream stopped (no viewers)
   */
  onDemandStreamStopped(streamId: number, streamName: string): void {
    this.log({
      level: 'INFO',
      source: 'OnDemandManager',
      message: `On-demand stream #${streamId} "${streamName}" stopped (no viewers)`,
      streamId,
    });
  }

  // ==================== SERVER-SPECIFIC LOGGING ====================

  /**
   * Log server status change
   */
  serverStatusChange(serverId: number, serverName: string, oldStatus: string, newStatus: string): void {
    const level = newStatus === 'OFFLINE' || newStatus === 'OVERLOADED' ? 'WARNING' : 'INFO';
    this.log({
      level,
      source: 'ServerMonitor',
      message: `Server ${serverName} status changed: ${oldStatus} → ${newStatus}`,
      details: { oldStatus, newStatus },
      serverId,
    });
  }

  /**
   * Log server high load warning
   */
  serverHighLoad(serverId: number, serverName: string, cpuUsage: number, memoryUsage: number): void {
    this.log({
      level: 'WARNING',
      source: 'ServerMonitor',
      message: `Server ${serverName} experiencing high load (CPU: ${cpuUsage}%, Memory: ${memoryUsage}%)`,
      details: { cpuUsage, memoryUsage },
      serverId,
    });
  }

  // ==================== USER-SPECIFIC LOGGING ====================

  /**
   * Log failed login attempt
   */
  loginFailed(username: string, ipAddress: string, reason: string): void {
    this.log({
      level: 'WARNING',
      source: 'AuthService',
      message: `Failed login attempt for user "${username}" from IP ${ipAddress}: ${reason}`,
      details: { username, reason },
      ipAddress,
    });
  }

  /**
   * Log successful login
   */
  loginSuccess(userId: number, username: string, ipAddress: string): void {
    this.log({
      level: 'INFO',
      source: 'AuthService',
      message: `User "${username}" logged in from IP ${ipAddress}`,
      details: { username },
      userId,
      ipAddress,
    });
  }

  /**
   * Log connection limit exceeded
   */
  connectionLimitExceeded(userId: number, username: string, currentConnections: number, maxConnections: number): void {
    this.log({
      level: 'WARNING',
      source: 'AuthService',
      message: `User "${username}" exceeded connection limit (${currentConnections}/${maxConnections})`,
      details: { currentConnections, maxConnections },
      userId,
    });
  }

  // ==================== INTERNAL METHODS ====================

  /**
   * Add a log entry to the queue
   */
  private log(entry: LogEntry): void {
    this.queue.push(entry);

    // Flush immediately if batch size reached
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush the queue to the database
   */
  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const entries = [...this.queue];
    this.queue = [];

    try {
      await prisma.systemLog.createMany({
        data: entries.map(entry => ({
          level: entry.level,
          source: entry.source,
          message: entry.message,
          details: entry.details ? entry.details : undefined,
          streamId: entry.streamId,
          userId: entry.userId,
          serverId: entry.serverId,
          ipAddress: entry.ipAddress,
          userAgent: entry.userAgent,
          errorCode: entry.errorCode,
          stackTrace: entry.stackTrace,
        })),
      });
    } catch (error) {
      // Don't log to database logger to avoid recursion
      logger.error({ error, count: entries.length }, 'Failed to flush logs to database');
      // Put entries back in queue for retry (limited to prevent memory issues)
      if (this.queue.length < 500) {
        this.queue.unshift(...entries);
      }
    }
  }

  /**
   * Force flush all pending logs (useful for shutdown)
   */
  async forceFlush(): Promise<void> {
    await this.flush();
  }

  /**
   * Get queue size (for monitoring)
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  // ==================== CLEANUP METHODS ====================

  /**
   * Start the cleanup job (automatic log retention)
   */
  startCleanupJob(): void {
    // Also start the flush interval if not started
    this.start();

    // Run cleanup once on startup
    this.cleanupOldLogs();

    // Schedule periodic cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldLogs();
    }, this.cleanupIntervalMs);
  }

  /**
   * Stop the cleanup job
   */
  stopCleanupJob(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.stop();
  }

  /**
   * Clean up logs older than retention period
   */
  private async cleanupOldLogs(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

      const result = await prisma.systemLog.deleteMany({
        where: { timestamp: { lt: cutoffDate } },
      });

      if (result.count > 0) {
        logger.info({ deletedCount: result.count, retentionDays: this.retentionDays }, 
          'Cleaned up old logs');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to cleanup old logs');
    }
  }

  // ==================== QUERY METHODS ====================

  /**
   * Query logs with filtering and pagination
   */
  async queryLogs(options: LogQueryOptions): Promise<{ logs: any[]; total: number; limit: number; offset: number }> {
    const {
      level,
      source,
      streamId,
      userId,
      serverId,
      search,
      limit = 50,
      offset = 0,
      startDate,
      endDate,
    } = options;

    const where: any = {};

    if (level) where.level = level;
    if (source) where.source = source;
    if (streamId) where.streamId = streamId;
    if (userId) where.userId = userId;
    if (serverId) where.serverId = serverId;
    if (search) {
      where.message = { contains: search, mode: 'insensitive' };
    }
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) where.timestamp.gte = startDate;
      if (endDate) where.timestamp.lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return { logs, total, limit, offset };
  }
}

// Export singleton instance
export const dbLogger = new DatabaseLoggerService();
export default dbLogger;
