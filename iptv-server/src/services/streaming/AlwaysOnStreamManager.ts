import { EventEmitter } from 'events';
import axios from 'axios';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { streamSourceManager } from './StreamSourceManager.js';
import { streamLifecycleManager } from './StreamLifecycleManager.js';
import { alwaysOnHealthMonitor, HealthCheckConfig } from '../monitoring/AlwaysOnHealthMonitor.js';

interface AlwaysOnStream {
  streamId: number;
  name: string;
  sourceUrl: string;
  backupUrls: string[];
  ffmpegPid: number | null;
  status: 'starting' | 'running' | 'error' | 'stopped';
  startedAt?: Date;
  lastError?: string;
  restartCount: number;
  viewers: number;
  // Store event listener references for cleanup
  closeHandler?: (event: { streamId: number; code: number }) => void;
  errorHandler?: (event: { streamId: number; error: string }) => void;
}

interface AlwaysOnStats {
  totalStreams: number;
  runningStreams: number;
  errorStreams: number;
  totalViewers: number;
}

// Configuration
const STARTUP_DELAY_MS = 5000; // Wait 5 seconds between starting streams
const RESTART_DELAY_MS = 30000; // Wait 30 seconds before restarting failed stream (increased from 10s)
const MAX_RESTART_ATTEMPTS = 10; // Max restarts before giving up
const HEALTH_CHECK_INTERVAL_MS = 60000; // Check stream health every minute
const STATS_UPDATE_INTERVAL_MS = 30000; // Update stats every 30 seconds

class AlwaysOnStreamManager extends EventEmitter {
  private streams: Map<number, AlwaysOnStream> = new Map();
  private statsUpdateInterval: NodeJS.Timeout | null = null;
  private isStarting = false;
  private isRunning = false;

  /**
   * Initialize and start all always-on streams
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('AlwaysOnStreamManager already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting AlwaysOnStreamManager...');

    // Load and start all always-on streams
    await this.loadAndStartStreams();

    // Start the advanced health monitor (handles audio/video/process monitoring)
    // This also loads config from database
    await alwaysOnHealthMonitor.start();

    // Listen for health monitor events
    alwaysOnHealthMonitor.on('streamRestarted', (event) => {
      logger.info({ streamId: event.streamId, name: event.name }, 'Stream restarted by health monitor');
      // Update our local tracking
      const stream = this.streams.get(event.streamId);
      if (stream) {
        stream.restartCount++;
      }
      this.emit('stream:health-restart', event);
    });

    alwaysOnHealthMonitor.on('restartFailed', (event) => {
      logger.error({ streamId: event.streamId, name: event.name }, 'Health monitor restart failed');
      this.emit('stream:health-restart-failed', event);
    });

    // NOTE: We no longer run our own health check loop here.
    // The AlwaysOnHealthMonitor is more sophisticated and handles all health checks.
    // Having two health check systems caused race conditions and duplicate restarts.
    // The basic checkStreamHealth() method is kept for manual debugging but not called automatically.

    // Start stats update loop
    this.statsUpdateInterval = setInterval(() => {
      this.updateStats();
    }, STATS_UPDATE_INTERVAL_MS);

    logger.info({ streamCount: this.streams.size }, 'AlwaysOnStreamManager started');
  }

  /**
   * Stop all always-on streams
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;

    // Stop the advanced health monitor
    alwaysOnHealthMonitor.stop();
    alwaysOnHealthMonitor.removeAllListeners();

    // Note: healthCheckInterval was removed - AlwaysOnHealthMonitor handles all health checks now

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
      this.statsUpdateInterval = null;
    }

    // Stop all streams
    for (const [streamId, stream] of this.streams) {
      await this.stopStream(streamId);
    }

    this.streams.clear();
    logger.info('AlwaysOnStreamManager stopped');
  }

  /**
   * Load all always-on streams from database and start them
   * Only starts streams that are assigned to THIS server
   */
  private async loadAndStartStreams(): Promise<void> {
    if (this.isStarting) return;
    this.isStarting = true;

    try {
      const currentServerId = config.multiServer.serverId;
      
      // Build query based on whether this server has an ID
      let streams: { id: number; name: string; sourceUrl: string; backupUrls: string[] }[];
      
      if (currentServerId) {
        // This server has an ID - only start streams assigned to it via StreamServerDistribution
        const distributions = await prisma.streamServerDistribution.findMany({
          where: {
            serverId: currentServerId,
            isActive: true,
          },
          include: {
            stream: {
              select: {
                id: true,
                name: true,
                sourceUrl: true,
                backupUrls: true,
                alwaysOn: true,
                isActive: true,
                streamType: true,
              },
            },
          },
        });
        
        // Filter to only always-on, active, live streams
        streams = distributions
          .filter(d => d.stream.alwaysOn && d.stream.isActive && d.stream.streamType === 'LIVE')
          .map(d => d.stream);
        
        logger.info({ 
          serverId: currentServerId, 
          totalDistributions: distributions.length,
          alwaysOnCount: streams.length 
        }, 'Found always-on streams assigned to this server');
      } else {
        // No SERVER_ID configured - this is likely the main/panel server
        // Don't start any always-on streams here - let edge servers handle them
        logger.info('No SERVER_ID configured - skipping always-on stream startup (edge servers will handle)');
        streams = [];
      }

      // Start streams with delay between each to avoid overwhelming the system
      for (const stream of streams) {
        await this.startStream(stream.id, stream.name, stream.sourceUrl, stream.backupUrls);
        
        // Small delay between starts to prevent resource spikes
        if (streams.indexOf(stream) < streams.length - 1) {
          await new Promise(r => setTimeout(r, STARTUP_DELAY_MS));
        }
      }
    } catch (error) {
      logger.error({ error }, 'Failed to load always-on streams');
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Start a single always-on stream
   * Uses StreamLifecycleManager for proper process management
   */
  async startStream(
    streamId: number, 
    name: string, 
    sourceUrl: string, 
    backupUrls: string[] = []
  ): Promise<boolean> {
    // Check if already running in our map
    const existing = this.streams.get(streamId);
    if (existing && existing.status === 'running') {
      logger.debug({ streamId, name }, 'Stream already running in AlwaysOnManager');
      return true;
    }

    // Check if already running in StreamLifecycleManager
    if (streamLifecycleManager.isStreamRunning(streamId)) {
      logger.debug({ streamId, name }, 'Stream already running in StreamLifecycleManager');
      const instance = streamLifecycleManager.getStreamInstance(streamId);
      
      // Update our tracking - preserve existing startedAt to avoid resetting the timer
      const streamInfo: AlwaysOnStream = {
        streamId,
        name,
        sourceUrl,
        backupUrls,
        ffmpegPid: instance?.ffmpegPid || null,
        status: 'running',
        startedAt: existing?.startedAt || instance?.startedAt || new Date(),
        restartCount: existing?.restartCount || 0,
        viewers: existing?.viewers || 0,
      };
      this.streams.set(streamId, streamInfo);
      return true;
    }

    const streamInfo: AlwaysOnStream = {
      streamId,
      name,
      sourceUrl,
      backupUrls,
      ffmpegPid: null,
      status: 'starting',
      restartCount: existing?.restartCount || 0,
      viewers: 0,
    };

    this.streams.set(streamId, streamInfo);

    try {
      logger.info({ streamId, name }, 'Starting always-on stream via StreamLifecycleManager');

      // Use StreamLifecycleManager which properly handles:
      // - Killing existing processes
      // - Storing PID in database
      // - Using correct transcoding profile
      // - Cascade distribution (pulling from parent server if configured)
      const instance = await streamLifecycleManager.startStream(streamId, {
        sourceUrl: sourceUrl,
        enableFailover: true,
        serverId: config.multiServer.serverId,
      });
      
      streamInfo.ffmpegPid = instance.ffmpegPid;
      streamInfo.status = 'running';
      streamInfo.startedAt = new Date();
      streamInfo.lastError = undefined;

      // Listen for lifecycle events
      // NOTE: We store these handlers for proper cleanup and only log errors
      // DO NOT auto-restart here - health monitor will detect issues and restart
      // Auto-restarting on close events causes restart loops and race conditions
      const handleClosed = async (event: { streamId: number; code: number }) => {
        if (event.streamId === streamId && this.isRunning) {
          if (event.code !== 0) {
            logger.warn({ streamId, name, code: event.code }, 'Always-on stream FFmpeg exited with error');
            // Clean up HLS segments
            await streamLifecycleManager.cleanupHlsDirectory(streamId);
            // Update status but don't auto-restart - health monitor will handle it
            streamInfo.status = 'error';
            streamInfo.lastError = `FFmpeg exited with code ${event.code}`;
            this.saveStreamStatus(streamId);
          } else {
            logger.info({ streamId, name }, 'Always-on stream FFmpeg exited gracefully');
            // Clean up HLS segments even on graceful exit
            await streamLifecycleManager.cleanupHlsDirectory(streamId);
          }
        }
      };
      
      const handleError = async (event: { streamId: number; error: string }) => {
        if (event.streamId === streamId && this.isRunning) {
          logger.error({ streamId, name, error: event.error }, 'Always-on stream FFmpeg error');
          // Clean up HLS segments on error
          await streamLifecycleManager.cleanupHlsDirectory(streamId);
          // Update status but don't auto-restart - health monitor will handle it
          streamInfo.status = 'error';
          streamInfo.lastError = event.error;
          this.saveStreamStatus(streamId);
        }
      };

      // Store handlers for cleanup
      streamInfo.closeHandler = handleClosed;
      streamInfo.errorHandler = handleError;

      streamLifecycleManager.on('stream:closed', handleClosed);
      streamLifecycleManager.on('stream:error', handleError);

      // Store status in Redis
      await this.saveStreamStatus(streamId);

      this.emit('stream:started', { streamId, name });
      logger.info({ streamId, name, pid: instance.ffmpegPid }, 'Always-on stream started successfully');

      return true;
    } catch (error: any) {
      // Check if the stream is already running on a different server
      // This is NOT an error condition - it's expected for child/relay servers
      if (error.message?.includes('already running on server')) {
        // Extract the server ID from the error message
        const match = error.message.match(/already running on server (\d+)/);
        const runningServerId = match ? parseInt(match[1], 10) : null;
        
        // Mark as running (on another server) - don't schedule restart
        streamInfo.status = 'running';
        streamInfo.lastError = undefined;
        await this.saveStreamStatus(streamId);
        
        logger.debug({ 
          streamId, 
          name, 
          runningServerId,
          currentServerId: config.multiServer.serverId 
        }, 'Stream running on different server - no action needed');
        
        return true; // Return true since the stream IS running (just not on this server)
      }
      
      streamInfo.status = 'error';
      streamInfo.lastError = error.message;
      await this.saveStreamStatus(streamId);

      logger.error({ streamId, name, error: error.message }, 'Failed to start always-on stream');
      
      // Schedule restart only for real errors
      this.scheduleRestart(streamId);
      
      return false;
    }
  }

  /**
   * Stop a single always-on stream
   */
  async stopStream(streamId: number): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    stream.status = 'stopped';

    // Remove event listeners to prevent leaks and duplicate handlers
    if (stream.closeHandler) {
      streamLifecycleManager.removeListener('stream:closed', stream.closeHandler);
    }
    if (stream.errorHandler) {
      streamLifecycleManager.removeListener('stream:error', stream.errorHandler);
    }

    // Use StreamLifecycleManager to stop
    try {
      await streamLifecycleManager.stopStream(streamId, true);
    } catch (error) {
      logger.warn({ streamId, error }, 'Error stopping stream via StreamLifecycleManager');
    }

    stream.ffmpegPid = null;

    await this.saveStreamStatus(streamId);
    this.emit('stream:stopped', { streamId, name: stream.name });
    
    logger.info({ streamId, name: stream.name }, 'Always-on stream stopped');
  }

  /**
   * Handle stream errors
   */
  private handleStreamError(streamId: number, error: Error): void {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    stream.status = 'error';
    stream.lastError = error.message;
    stream.restartCount++;

    logger.error({ 
      streamId, 
      name: stream.name, 
      error: error.message,
      restartCount: stream.restartCount
    }, 'Always-on stream error');

    this.saveStreamStatus(streamId);
    this.emit('stream:error', { streamId, name: stream.name, error: error.message });

    // Schedule restart if under max attempts
    if (stream.restartCount <= MAX_RESTART_ATTEMPTS) {
      this.scheduleRestart(streamId);
    } else {
      logger.error({ streamId, name: stream.name }, 'Max restart attempts reached, giving up');
      this.emit('stream:failed', { streamId, name: stream.name });
    }
  }

  /**
   * Schedule a stream restart
   */
  private scheduleRestart(streamId: number): void {
    const stream = this.streams.get(streamId);
    if (!stream || !this.isRunning) return;

    const delay = RESTART_DELAY_MS * Math.min(stream.restartCount, 10); // Exponential backoff, max 10x

    logger.info({ 
      streamId, 
      name: stream.name, 
      delayMs: delay,
      attempt: stream.restartCount
    }, 'Scheduling stream restart');

    setTimeout(async () => {
      if (!this.isRunning) return;
      
      const currentStream = this.streams.get(streamId);
      if (currentStream && currentStream.status !== 'running') {
        await this.startStream(
          streamId, 
          currentStream.name, 
          currentStream.sourceUrl, 
          currentStream.backupUrls
        );
      }
    }, delay);
  }

  /**
   * Check health of all running streams (for manual debugging only)
   * NOTE: This is no longer called automatically. AlwaysOnHealthMonitor handles all health checks.
   * Keeping this method for manual debugging via API if needed.
   */
  async checkStreamHealthDebug(): Promise<{ streamId: number; name: string; running: boolean }[]> {
    const results: { streamId: number; name: string; running: boolean }[] = [];
    for (const [streamId, stream] of this.streams) {
      const running = streamLifecycleManager.isStreamRunning(streamId);
      results.push({ streamId, name: stream.name, running });
      if (!running && stream.status === 'running') {
        // Just update status, don't trigger restart - health monitor handles that
        stream.status = 'error';
        stream.lastError = 'Process not found (detected by debug check)';
        logger.warn({ streamId, name: stream.name }, 'Always-on stream no longer running (debug check)');
      }
    }
    return results;
  }

  /**
   * Update statistics in Redis (with live viewer counts)
   */
  private async updateStats(): Promise<void> {
    const stats: AlwaysOnStats = {
      totalStreams: this.streams.size,
      runningStreams: 0,
      errorStreams: 0,
      totalViewers: 0,
    };

    for (const stream of this.streams.values()) {
      if (stream.status === 'running') stats.runningStreams++;
      if (stream.status === 'error') stats.errorStreams++;
      // Get live viewer count from Redis
      const viewerCount = await this.getViewerCount(stream.streamId);
      stats.totalViewers += viewerCount;
    }

    await redis.set('alwayson:stats', JSON.stringify(stats));
  }

  /**
   * Save individual stream status to Redis
   */
  private async saveStreamStatus(streamId: number): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) return;

    await redis.hset('alwayson:streams', streamId.toString(), JSON.stringify({
      streamId: stream.streamId,
      name: stream.name,
      status: stream.status,
      startedAt: stream.startedAt?.toISOString(),
      lastError: stream.lastError,
      restartCount: stream.restartCount,
      viewers: stream.viewers,
    }));
  }

  /**
   * Add a stream to always-on (called when admin enables it)
   * If this is the main panel and stream has distribution, notify origin server
   * If this is the origin server for the stream, start locally
   */
  async enableAlwaysOn(streamId: number): Promise<boolean> {
    const currentServerId = config.multiServer.serverId;
    
    // Update database first
    const stream = await prisma.stream.update({
      where: { id: streamId },
      data: { alwaysOn: true },
      select: { id: true, name: true, sourceUrl: true, backupUrls: true, originServerId: true },
    });

    // Find distribution for this stream - who is the ORIGIN?
    const distributions = await prisma.streamServerDistribution.findMany({
      where: { streamId, isActive: true },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            internalIp: true,
            apiPort: true,
            apiKey: true,
          },
        },
      },
      orderBy: { tier: 'asc' }, // Tier 0 = ORIGIN
    });

    const originDistribution = distributions.find(d => d.tier === 0);
    
    // If this server IS the origin (or stream.originServerId matches), start locally
    if (currentServerId && originDistribution?.serverId === currentServerId) {
      logger.info({ streamId, name: stream.name, serverId: currentServerId }, 
        'This server is the ORIGIN, starting always-on stream locally');
      return this.startStream(stream.id, stream.name, stream.sourceUrl, stream.backupUrls);
    }

    // If there's an origin server configured, notify it to start the stream
    if (originDistribution) {
      const originServer = originDistribution.server;
      logger.info({ 
        streamId, 
        name: stream.name, 
        originServerId: originServer.id,
        originServerName: originServer.name,
      }, 'Notifying ORIGIN server to start always-on stream');

      try {
        const apiUrl = `http://${originServer.internalIp}:${originServer.apiPort}`;
        await axios.post(
          `${apiUrl}/api/internal/always-on/start`,
          { streamId, sourceUrl: stream.sourceUrl, backupUrls: stream.backupUrls },
          {
            headers: { 'X-Server-Key': originServer.apiKey },
            timeout: 30000, // 30 seconds for stream to start
          }
        );
        logger.info({ streamId, name: stream.name }, 'Origin server acknowledged always-on start');
        return true;
      } catch (error: any) {
        logger.error({ 
          error: error.message, 
          streamId, 
          originServerId: originServer.id 
        }, 'Failed to notify origin server to start always-on stream');
        // Don't start locally on main panel - that defeats the purpose
        return false;
      }
    }

    // No distribution configured - check if we should start locally or skip
    if (!currentServerId) {
      // This is main panel with no SERVER_ID - don't start here
      logger.warn({ streamId, name: stream.name }, 
        'No server distribution configured and this is main panel - stream not started. Configure distribution first.');
      return false;
    }

    // This server has an ID but stream has no distribution - start locally (legacy behavior)
    logger.info({ streamId, name: stream.name, serverId: currentServerId }, 
      'No distribution configured, starting always-on stream locally');
    return this.startStream(stream.id, stream.name, stream.sourceUrl, stream.backupUrls);
  }

  /**
   * Remove a stream from always-on
   * If this is the main panel and stream has distribution, notify origin server
   */
  async disableAlwaysOn(streamId: number): Promise<void> {
    const currentServerId = config.multiServer.serverId;
    
    // Update database first
    await prisma.stream.update({
      where: { id: streamId },
      data: { alwaysOn: false },
    });

    // Find distribution for this stream - who is the ORIGIN?
    const distributions = await prisma.streamServerDistribution.findMany({
      where: { streamId, isActive: true },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            internalIp: true,
            apiPort: true,
            apiKey: true,
          },
        },
      },
      orderBy: { tier: 'asc' },
    });

    const originDistribution = distributions.find(d => d.tier === 0);

    // If this server IS the origin, stop locally
    if (currentServerId && originDistribution?.serverId === currentServerId) {
      await this.stopStream(streamId);
      this.streams.delete(streamId);
      await redis.hdel('alwayson:streams', streamId.toString());
      return;
    }

    // If there's an origin server configured, notify it to stop the stream
    if (originDistribution) {
      const originServer = originDistribution.server;
      logger.info({ 
        streamId, 
        originServerId: originServer.id,
        originServerName: originServer.name,
      }, 'Notifying ORIGIN server to stop always-on stream');

      try {
        const apiUrl = `http://${originServer.internalIp}:${originServer.apiPort}`;
        await axios.post(
          `${apiUrl}/api/internal/always-on/stop`,
          { streamId },
          {
            headers: { 'X-Server-Key': originServer.apiKey },
            timeout: 10000,
          }
        );
        logger.info({ streamId }, 'Origin server acknowledged always-on stop');
      } catch (error: any) {
        logger.error({ 
          error: error.message, 
          streamId, 
          originServerId: originServer.id 
        }, 'Failed to notify origin server to stop always-on stream');
      }
    }

    // Cleanup local state (even if not running locally)
    this.streams.delete(streamId);
    await redis.hdel('alwayson:streams', streamId.toString());
  }

  /**
   * Restart an always-on stream (respects server distribution)
   */
  async restartAlwaysOn(streamId: number): Promise<boolean> {
    const currentServerId = config.multiServer.serverId;
    
    // Get stream info
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, name: true, sourceUrl: true, backupUrls: true, alwaysOn: true },
    });

    if (!stream || !stream.alwaysOn) {
      logger.warn({ streamId }, 'Cannot restart: stream not found or not always-on');
      return false;
    }

    // Find distribution for this stream
    const distributions = await prisma.streamServerDistribution.findMany({
      where: { streamId, isActive: true },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            internalIp: true,
            apiPort: true,
            apiKey: true,
          },
        },
      },
      orderBy: { tier: 'asc' },
    });

    const originDistribution = distributions.find(d => d.tier === 0);

    // If this server IS the origin, restart locally
    if (currentServerId && originDistribution?.serverId === currentServerId) {
      logger.info({ streamId, name: stream.name, serverId: currentServerId }, 
        'This server is the ORIGIN, restarting always-on stream locally');
      await this.stopStream(streamId);
      return this.startStream(stream.id, stream.name, stream.sourceUrl, stream.backupUrls);
    }

    // If there's an origin server configured, notify it to restart the stream
    if (originDistribution) {
      const originServer = originDistribution.server;
      logger.info({ 
        streamId, 
        name: stream.name, 
        originServerId: originServer.id,
        originServerName: originServer.name,
      }, 'Notifying ORIGIN server to restart always-on stream');

      try {
        const apiUrl = `http://${originServer.internalIp}:${originServer.apiPort}`;
        await axios.post(
          `${apiUrl}/api/internal/always-on/restart`,
          { streamId },
          {
            headers: { 'X-Server-Key': originServer.apiKey },
            timeout: 30000,
          }
        );
        logger.info({ streamId, name: stream.name }, 'Origin server acknowledged always-on restart');
        return true;
      } catch (error: any) {
        logger.error({ 
          error: error.message, 
          streamId, 
          originServerId: originServer.id 
        }, 'Failed to notify origin server to restart always-on stream');
        return false;
      }
    }

    // No distribution - restart locally if we have a server ID
    if (currentServerId) {
      await this.stopStream(streamId);
      return this.startStream(stream.id, stream.name, stream.sourceUrl, stream.backupUrls);
    }

    logger.warn({ streamId }, 'No distribution and no server ID - cannot restart');
    return false;
  }

  /**
   * Update viewer count for a stream (legacy - now using Redis)
   * @deprecated Use getViewerCount instead
   */
  updateViewers(streamId: number, delta: number): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.viewers = Math.max(0, stream.viewers + delta);
    }
  }

  /**
   * Get viewer count for a stream from Redis
   * Includes both standard viewers and ABR viewers
   * Excludes cascade connections (server-to-server, not real viewers)
   */
  async getViewerCount(streamId: number): Promise<number> {
    // Count both standard viewers and ABR viewers
    const [standardKeys, abrKeys] = await Promise.all([
      redis.keys(`stream:${streamId}:viewer:*`),
      redis.keys(`abr:${streamId}:viewer:*`),
    ]);
    // Filter out cascade keys (server-to-server connections, not real viewers)
    const realStandardKeys = standardKeys.filter(k => !k.includes(':viewer:cascade:'));
    const realAbrKeys = abrKeys.filter(k => !k.includes(':viewer:cascade:'));
    return realStandardKeys.length + realAbrKeys.length;
  }

  /**
   * Get status of all always-on streams
   */
  getStatus(): Map<number, AlwaysOnStream> {
    return this.streams;
  }

  /**
   * Get status of a single stream (with live viewer count from Redis)
   */
  async getStreamStatusAsync(streamId: number): Promise<(AlwaysOnStream & { viewers: number }) | undefined> {
    const stream = this.streams.get(streamId);
    if (!stream) return undefined;
    
    const viewerCount = await this.getViewerCount(streamId);
    return { ...stream, viewers: viewerCount };
  }

  /**
   * Get status of a single stream (sync version - may have stale viewer count)
   */
  getStreamStatus(streamId: number): AlwaysOnStream | undefined {
    return this.streams.get(streamId);
  }

  /**
   * Get statistics (with live viewer counts from Redis)
   */
  async getStats(): Promise<AlwaysOnStats> {
    // Calculate live total viewers from Redis
    let totalViewers = 0;
    for (const stream of this.streams.values()) {
      const viewerCount = await this.getViewerCount(stream.streamId);
      totalViewers += viewerCount;
    }

    return {
      totalStreams: this.streams.size,
      runningStreams: Array.from(this.streams.values()).filter(s => s.status === 'running').length,
      errorStreams: Array.from(this.streams.values()).filter(s => s.status === 'error').length,
      totalViewers,
    };
  }

  /**
   * Check if a stream is always-on and running
   */
  isAlwaysOnRunning(streamId: number): boolean {
    const stream = this.streams.get(streamId);
    return stream?.status === 'running';
  }

  /**
   * Reload always-on streams (e.g., after config change)
   */
  async reload(): Promise<void> {
    logger.info('Reloading always-on streams...');
    
    // Stop streams that are no longer always-on
    const dbStreams = await prisma.stream.findMany({
      where: { alwaysOn: true, isActive: true, streamType: 'LIVE' },
      select: { id: true },
    });
    
    const dbStreamIds = new Set(dbStreams.map(s => s.id));
    
    for (const [streamId] of this.streams) {
      if (!dbStreamIds.has(streamId)) {
        await this.stopStream(streamId);
        this.streams.delete(streamId);
      }
    }

    // Start new always-on streams
    await this.loadAndStartStreams();
  }

  /**
   * Get comprehensive health status for a stream
   */
  async getStreamHealthStatus(streamId: number) {
    return alwaysOnHealthMonitor.getStreamHealthStatus(streamId);
  }

  /**
   * Get comprehensive health status for all streams
   */
  async getAllHealthStatus() {
    return alwaysOnHealthMonitor.getAllHealthStatus();
  }

  /**
   * Get health statistics summary
   */
  async getHealthStats() {
    return alwaysOnHealthMonitor.getHealthStats();
  }

  /**
   * Force a health check on a specific stream
   */
  async forceHealthCheck(streamId: number) {
    return alwaysOnHealthMonitor.forceCheck(streamId);
  }

  /**
   * Update health monitor configuration (persists to database)
   */
  async updateHealthMonitorConfig(config: Partial<HealthCheckConfig>) {
    await alwaysOnHealthMonitor.updateConfig(config);
  }

  /**
   * Get health monitor configuration
   */
  getHealthMonitorConfig() {
    return alwaysOnHealthMonitor.getConfig();
  }
}

// Export singleton
export const alwaysOnStreamManager = new AlwaysOnStreamManager();

