import { EventEmitter } from 'events';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';

export interface StreamSource {
  url: string;
  priority: number;
  isOnline: boolean;
  lastCheck: Date;
  failCount: number;
  recoveryCount: number; // Consecutive successful checks since recovery
  responseTime?: number;
  errorMessage?: string;
}

export interface StreamSourceStatus {
  streamId: number;
  streamName: string;
  activeSourceIndex: number;
  activeSourceUrl: string;
  sources: StreamSource[];
  failoverCount: number;
  lastFailover?: Date;
  isHealthy: boolean;
}

interface HealthCheckResult {
  isOnline: boolean;
  responseTime?: number;
  errorMessage?: string;
  statusCode?: number;
  contentType?: string;
}

interface ActiveStream {
  streamId: number;
  sourceIndex: number;
  ffmpegProcess?: ChildProcess;
  lastActivity: Date;
  failoverCount: number;
  onFailover?: (newUrl: string) => void;
}

// Configuration
const HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const MAX_FAIL_COUNT = 3; // Failover after 3 consecutive failures
const FAILOVER_COOLDOWN = 5000; // 5 seconds between failovers
const SOURCE_RECOVERY_CHECK_INTERVAL = 60000; // Check failed sources every 60 seconds
const PRIMARY_RECOVERY_CHECKS = 3; // Primary must be online for 3 consecutive checks before failback
const FAILBACK_ENABLED = true; // Automatically switch back to primary when it recovers

class StreamSourceManager extends EventEmitter {
  private activeStreams: Map<number, ActiveStream> = new Map();
  private sourceStatus: Map<number, StreamSource[]> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private recoveryCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the source manager
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Start health check loop
    this.healthCheckInterval = setInterval(() => {
      this.checkActiveStreamHealth();
    }, HEALTH_CHECK_INTERVAL);

    // Start recovery check loop (check if failed sources are back online)
    this.recoveryCheckInterval = setInterval(() => {
      this.checkFailedSourcesRecovery();
    }, SOURCE_RECOVERY_CHECK_INTERVAL);

    logger.info('Stream Source Manager started');
  }

  /**
   * Stop the source manager
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval);
      this.recoveryCheckInterval = null;
    }

    logger.info('Stream Source Manager stopped');
  }

  /**
   * Get all source URLs for a stream (primary + backups)
   */
  async getStreamSources(streamId: number): Promise<StreamSource[]> {
    // Check cache first
    const cached = this.sourceStatus.get(streamId);
    if (cached) return cached;

    // Fetch from database
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { sourceUrl: true, backupUrls: true },
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Build sources list with primary first, then backups
    const sources: StreamSource[] = [
      {
        url: stream.sourceUrl,
        priority: 0, // Primary always has priority 0
        isOnline: true, // Assume online until checked
        lastCheck: new Date(),
        failCount: 0,
        recoveryCount: 0,
      },
      ...stream.backupUrls.map((url, index) => ({
        url,
        priority: index + 1,
        isOnline: true,
        lastCheck: new Date(),
        failCount: 0,
        recoveryCount: 0,
      })),
    ];

    this.sourceStatus.set(streamId, sources);
    return sources;
  }

  /**
   * Get the best available source URL for a stream
   */
  async getBestSource(streamId: number): Promise<string> {
    const sources = await this.getStreamSources(streamId);
    
    // Find first online source (sorted by priority)
    const onlineSource = sources
      .sort((a, b) => a.priority - b.priority)
      .find(s => s.isOnline);

    if (!onlineSource) {
      // No online sources, try the primary anyway
      logger.warn({ streamId }, 'No online sources found, using primary');
      return sources[0]?.url || '';
    }

    return onlineSource.url;
  }

  /**
   * Register an active stream for health monitoring
   */
  registerStream(
    streamId: number, 
    sourceIndex: number = 0,
    onFailover?: (newUrl: string) => void
  ): void {
    this.activeStreams.set(streamId, {
      streamId,
      sourceIndex,
      lastActivity: new Date(),
      failoverCount: 0,
      onFailover,
    });

    logger.debug({ streamId, sourceIndex }, 'Stream registered for failover monitoring');
  }

  /**
   * Update stream's FFmpeg process reference
   */
  setStreamProcess(streamId: number, process: ChildProcess): void {
    const stream = this.activeStreams.get(streamId);
    if (stream) {
      stream.ffmpegProcess = process;
      stream.lastActivity = new Date();
    }
  }

  /**
   * Unregister a stream from monitoring
   */
  unregisterStream(streamId: number): void {
    this.activeStreams.delete(streamId);
    logger.debug({ streamId }, 'Stream unregistered from failover monitoring');
  }

  /**
   * Report a source failure (called by stream handlers on error)
   */
  async reportSourceFailure(streamId: number, errorMessage?: string): Promise<string | null> {
    const sources = this.sourceStatus.get(streamId);
    const activeStream = this.activeStreams.get(streamId);
    
    if (!sources || !activeStream) {
      return null;
    }

    const currentSource = sources[activeStream.sourceIndex];
    if (!currentSource) return null;

    // Increment fail count
    currentSource.failCount++;
    currentSource.errorMessage = errorMessage;
    currentSource.lastCheck = new Date();

    logger.warn({ 
      streamId, 
      sourceUrl: currentSource.url, 
      failCount: currentSource.failCount,
      errorMessage 
    }, 'Stream source failure reported');

    // Check if we should failover
    if (currentSource.failCount >= MAX_FAIL_COUNT) {
      return this.performFailover(streamId);
    }

    return null;
  }

  /**
   * Perform failover to next available source
   */
  async performFailover(streamId: number): Promise<string | null> {
    const sources = this.sourceStatus.get(streamId);
    const activeStream = this.activeStreams.get(streamId);
    
    if (!sources || !activeStream) {
      return null;
    }

    // Mark current source as offline
    const currentSource = sources[activeStream.sourceIndex];
    if (currentSource) {
      currentSource.isOnline = false;
      currentSource.lastCheck = new Date();
    }

    // Find next online source
    const nextSourceIndex = sources.findIndex(
      (s, i) => i !== activeStream.sourceIndex && s.isOnline
    );

    if (nextSourceIndex === -1) {
      logger.error({ streamId }, 'No backup sources available for failover');
      this.emit('failover:failed', { streamId, reason: 'no_backup_sources' });
      return null;
    }

    const newSource = sources[nextSourceIndex];
    
    // Update active stream
    activeStream.sourceIndex = nextSourceIndex;
    activeStream.failoverCount++;
    activeStream.lastActivity = new Date();

    logger.info({ 
      streamId, 
      fromUrl: currentSource?.url,
      toUrl: newSource.url,
      failoverCount: activeStream.failoverCount
    }, 'Stream failover performed');

    // Store failover event in Redis for analytics
    await redis.lpush(`stream:${streamId}:failovers`, JSON.stringify({
      timestamp: new Date().toISOString(),
      fromSource: currentSource?.url,
      toSource: newSource.url,
      reason: currentSource?.errorMessage || 'source_failure',
    }));
    await redis.ltrim(`stream:${streamId}:failovers`, 0, 99); // Keep last 100

    // Emit failover event
    this.emit('failover', { 
      streamId, 
      newUrl: newSource.url, 
      previousUrl: currentSource?.url,
      failoverCount: activeStream.failoverCount
    });

    // Call the failover callback if registered
    if (activeStream.onFailover) {
      activeStream.onFailover(newSource.url);
    }

    return newSource.url;
  }

  /**
   * Check health of a single source URL
   */
  async checkSourceHealth(url: string): Promise<HealthCheckResult> {
    try {
      // First, try a HEAD request (faster)
      const startTime = Date.now();
      
      const response = await axios.head(url, {
        timeout: HEALTH_CHECK_TIMEOUT,
        validateStatus: () => true, // Accept any status
        headers: {
          'User-Agent': 'IPTV-HealthCheck/1.0',
        },
      });

      const responseTime = Date.now() - startTime;

      // Check if it's a valid stream response
      const contentType = response.headers['content-type'] || '';
      const isValidStream = 
        response.status === 200 ||
        response.status === 206 ||
        contentType.includes('video') ||
        contentType.includes('mpegurl') ||
        contentType.includes('octet-stream') ||
        contentType.includes('mpeg');

      if (isValidStream) {
        return {
          isOnline: true,
          responseTime,
          statusCode: response.status,
          contentType,
        };
      }

      // If HEAD failed, try probing with FFmpeg
      return await this.probeWithFfmpeg(url);

    } catch (error: any) {
      // Network error, try FFmpeg probe as fallback
      return await this.probeWithFfmpeg(url);
    }
  }

  /**
   * Probe URL with FFmpeg (more thorough but slower)
   */
  private probeWithFfmpeg(url: string): Promise<HealthCheckResult> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ffprobe.kill('SIGKILL');
        resolve({
          isOnline: false,
          errorMessage: 'Probe timeout',
        });
      }, HEALTH_CHECK_TIMEOUT);

      const ffprobe = spawn(config.ffmpeg.path.replace('ffmpeg', 'ffprobe'), [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-i', url,
      ]);

      let stdout = '';
      ffprobe.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0 && stdout) {
          try {
            const info = JSON.parse(stdout);
            resolve({
              isOnline: true,
              contentType: info.format?.format_name,
            });
          } catch {
            resolve({ isOnline: true });
          }
        } else {
          resolve({
            isOnline: false,
            errorMessage: `FFprobe exit code: ${code}`,
          });
        }
      });

      ffprobe.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          isOnline: false,
          errorMessage: err.message,
        });
      });
    });
  }

  /**
   * Check health of all active streams
   */
  private async checkActiveStreamHealth(): Promise<void> {
    for (const [streamId, activeStream] of this.activeStreams) {
      const sources = this.sourceStatus.get(streamId);
      if (!sources) continue;

      const currentSource = sources[activeStream.sourceIndex];
      if (!currentSource) continue;

      const result = await this.checkSourceHealth(currentSource.url);
      
      currentSource.lastCheck = new Date();
      currentSource.responseTime = result.responseTime;

      if (!result.isOnline) {
        currentSource.failCount++;
        currentSource.errorMessage = result.errorMessage;
        
        logger.warn({ 
          streamId, 
          url: currentSource.url,
          failCount: currentSource.failCount,
          error: result.errorMessage
        }, 'Active stream health check failed');

        if (currentSource.failCount >= MAX_FAIL_COUNT) {
          await this.performFailover(streamId);
        }
      } else {
        // Reset fail count on successful check
        currentSource.failCount = 0;
        currentSource.errorMessage = undefined;
      }
    }
  }

  /**
   * Check if previously failed sources are back online
   * If the PRIMARY source recovers, automatically failback to it
   */
  private async checkFailedSourcesRecovery(): Promise<void> {
    for (const [streamId, sources] of this.sourceStatus) {
      const activeStream = this.activeStreams.get(streamId);
      
      for (const source of sources) {
        if (!source.isOnline) {
          const result = await this.checkSourceHealth(source.url);
          
          if (result.isOnline) {
            source.recoveryCount++;
            source.lastCheck = new Date();
            source.responseTime = result.responseTime;
            
            // Require multiple successful checks before marking as recovered
            if (source.recoveryCount >= PRIMARY_RECOVERY_CHECKS) {
              source.isOnline = true;
              source.failCount = 0;
              source.errorMessage = undefined;
              
              logger.info({ 
                streamId, 
                url: source.url,
                priority: source.priority,
                recoveryChecks: source.recoveryCount
              }, 'Source recovered after consecutive successful checks');

              this.emit('source:recovered', { streamId, url: source.url });
              
              // Check if this is the PRIMARY source and we should failback
              if (FAILBACK_ENABLED && source.priority === 0 && activeStream) {
                const currentSourceIndex = activeStream.sourceIndex;
                
                // Only failback if we're currently on a backup source
                if (currentSourceIndex > 0) {
                  logger.info({ 
                    streamId, 
                    primaryUrl: source.url,
                    currentBackupIndex: currentSourceIndex
                  }, 'Primary source recovered - initiating failback');
                  
                  await this.performFailback(streamId);
                }
              }
            } else {
              logger.debug({ 
                streamId, 
                url: source.url,
                recoveryCount: source.recoveryCount,
                required: PRIMARY_RECOVERY_CHECKS
              }, 'Source check passed, waiting for more recovery checks');
            }
          } else {
            // Reset recovery count on failure
            source.recoveryCount = 0;
          }
        }
      }
    }
  }

  /**
   * Failback to primary source
   */
  async performFailback(streamId: number): Promise<string | null> {
    const sources = this.sourceStatus.get(streamId);
    const activeStream = this.activeStreams.get(streamId);
    
    if (!sources || !activeStream) {
      return null;
    }

    // Find primary source (priority 0)
    const primarySource = sources.find(s => s.priority === 0);
    
    if (!primarySource || !primarySource.isOnline) {
      logger.warn({ streamId }, 'Cannot failback - primary source not available');
      return null;
    }

    // Already on primary
    if (activeStream.sourceIndex === 0) {
      return null;
    }

    const previousSource = sources[activeStream.sourceIndex];
    
    // Switch to primary
    activeStream.sourceIndex = 0;
    activeStream.lastActivity = new Date();

    logger.info({ 
      streamId, 
      fromUrl: previousSource?.url,
      toUrl: primarySource.url,
    }, 'Failback to primary source performed');

    // Store failback event in Redis
    await redis.lpush(`stream:${streamId}:failovers`, JSON.stringify({
      timestamp: new Date().toISOString(),
      fromSource: previousSource?.url,
      toSource: primarySource.url,
      reason: 'primary_recovered',
      type: 'failback',
    }));
    await redis.ltrim(`stream:${streamId}:failovers`, 0, 99);

    // Emit failback event
    this.emit('failback', { 
      streamId, 
      primaryUrl: primarySource.url, 
      previousUrl: previousSource?.url,
    });

    // Call the failover callback to switch the stream
    if (activeStream.onFailover) {
      activeStream.onFailover(primarySource.url);
    }

    return primarySource.url;
  }

  /**
   * Get status of all sources for a stream
   */
  async getStreamStatus(streamId: number): Promise<StreamSourceStatus | null> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { name: true },
    });

    if (!stream) return null;

    const sources = await this.getStreamSources(streamId);
    const activeStream = this.activeStreams.get(streamId);

    // Get failover history from Redis
    const failovers = await redis.lrange(`stream:${streamId}:failovers`, 0, 0);
    const lastFailover = failovers[0] ? JSON.parse(failovers[0]).timestamp : undefined;

    return {
      streamId,
      streamName: stream.name,
      activeSourceIndex: activeStream?.sourceIndex || 0,
      activeSourceUrl: sources[activeStream?.sourceIndex || 0]?.url || '',
      sources,
      failoverCount: activeStream?.failoverCount || 0,
      lastFailover: lastFailover ? new Date(lastFailover) : undefined,
      isHealthy: sources.some(s => s.isOnline),
    };
  }

  /**
   * Manually trigger failover for a stream
   */
  async manualFailover(streamId: number): Promise<string | null> {
    return this.performFailover(streamId);
  }

  /**
   * Update stream sources (called when admin updates stream config)
   */
  async updateStreamSources(streamId: number): Promise<void> {
    // Clear cached sources to force refresh
    this.sourceStatus.delete(streamId);
    await this.getStreamSources(streamId);
    
    logger.info({ streamId }, 'Stream sources updated');
  }

  /**
   * Pre-check all sources for a stream
   */
  async precheckAllSources(streamId: number): Promise<StreamSource[]> {
    const sources = await this.getStreamSources(streamId);
    
    const checkPromises = sources.map(async (source) => {
      const result = await this.checkSourceHealth(source.url);
      source.isOnline = result.isOnline;
      source.responseTime = result.responseTime;
      source.errorMessage = result.errorMessage;
      source.lastCheck = new Date();
      return source;
    });

    return Promise.all(checkPromises);
  }
}

// Export singleton instance
export const streamSourceManager = new StreamSourceManager();

