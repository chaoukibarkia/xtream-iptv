import { EventEmitter } from 'events';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { streamLifecycleManager } from './StreamLifecycleManager.js';
import { dbLogger } from '../logging/DatabaseLogger.js';
import { viewerTracker } from './ViewerTracker.js';
import { loadBalancer } from '../loadbalancer/LoadBalancer.js';
import { isMainPanelServer } from '../MainServerRegistration.js';

const ON_DEMAND_TIMEOUT_MS = 30000; // 30 seconds after last viewer
const VIEWER_TTL_SECONDS = 60; // Viewer heartbeat TTL (allow time for stream startup)
const CLEANUP_INTERVAL_MS = 5000; // Check every 5 seconds (more frequent)

interface OnDemandStreamInfo {
  streamId: number;
  viewerCount: number;
  lastViewerAt: Date;
  stopTimer: NodeJS.Timeout | null;
  status: 'on_demand' | 'active' | 'stopping';
}

/**
 * Manages on-demand streams that start when viewers connect
 * and stop after 30 seconds of no viewers
 */
class OnDemandStreamManager extends EventEmitter {
  private streams: Map<number, OnDemandStreamInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  /**
   * Start the manager
   */
  async start(): Promise<void> {
    // Initialize ViewerTracker Lua scripts
    try {
      await viewerTracker.initialize();
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize ViewerTracker, falling back to non-atomic operations');
    }

    // Periodic cleanup check every 5 seconds (more frequent for better responsiveness)
    this.cleanupInterval = setInterval(() => {
      this.checkIdleStreams();
    }, CLEANUP_INTERVAL_MS);

    logger.info('OnDemandStreamManager started');
  }

  /**
   * Stop the manager
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Clear all stop timers
    for (const info of this.streams.values()) {
      if (info.stopTimer) {
        clearTimeout(info.stopTimer);
      }
    }
    this.streams.clear();

    logger.info('OnDemandStreamManager stopped');
  }

  /**
   * Register a viewer for a stream
   * Starts the stream if it's not already running
   * Uses atomic operations via ViewerTracker to prevent race conditions
   */
  async registerViewer(streamId: number, connectionId: string): Promise<void> {
    // Check if stream is always-on (those are managed by AlwaysOnStreamManager)
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { alwaysOn: true, name: true },
    });

    if (!stream) return;

    if (stream.alwaysOn) {
      // For always-on streams, still track viewers in Redis but don't manage stream lifecycle
      await this.registerAlwaysOnViewer(streamId, connectionId);
      return;
    }

    let info = this.streams.get(streamId);

    if (!info) {
      info = {
        streamId,
        viewerCount: 0,
        lastViewerAt: new Date(),
        stopTimer: null,
        status: 'on_demand',
      };
      this.streams.set(streamId, info);
    }

    // Cancel any pending stop timer
    if (info.stopTimer) {
      clearTimeout(info.stopTimer);
      info.stopTimer = null;
    }

    info.lastViewerAt = new Date();

    // Use atomic viewer registration via Lua script
    // This prevents race conditions when multiple viewers register simultaneously
    let isNewViewer: boolean;
    try {
      isNewViewer = await viewerTracker.registerViewer(streamId, connectionId);
    } catch (err) {
      // Fallback to non-atomic operation if Lua script fails
      logger.warn({ err, streamId }, 'Atomic viewer registration failed, using fallback');
      const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
      isNewViewer = !(await redis.exists(viewerKey));
      await redis.setex(viewerKey, VIEWER_TTL_SECONDS, Date.now().toString());
      await redis.sadd(`stream:${streamId}:viewers`, connectionId);
      await redis.expire(`stream:${streamId}:viewers`, 300);
    }

    // Update in-memory count
    if (isNewViewer) {
      info.viewerCount++;
    }

    // Start the stream if not already running
    if (!streamLifecycleManager.isStreamRunning(streamId)) {
      // IMPORTANT: Check if this server should start the stream
      // If stream has distribution, only the ORIGIN server (tier 0) should start it
      // Main panel should NOT start streams that belong to edge servers
      const currentServerId = config.multiServer.serverId;
      const isMainPanel = await isMainPanelServer();
      
      logger.info({
        streamId,
        currentServerId,
        isMainPanel,
      }, 'OnDemandStreamManager: Checking distribution before starting stream');
      
      if (currentServerId && !isMainPanel) {
        // This is an edge server - check its role for this stream
        const distribution = await prisma.streamServerDistribution.findUnique({
          where: {
            streamId_serverId: { streamId, serverId: currentServerId },
          },
        });

        // CHILD servers should start HLS relay (via StreamLifecycleManager)
        // StreamLifecycleManager.startStream() handles CHILD role properly:
        // - It notifies the ORIGIN to start FFmpeg if needed
        // - It starts HLS relay to fetch segments from parent
        // So we should NOT return early here for CHILD servers
        if (distribution && distribution.tier !== 0) {
          logger.info({
            streamId,
            serverId: currentServerId,
            tier: distribution.tier,
            role: distribution.role,
          }, 'CHILD server will start HLS relay (notifying origin if needed)');
          // Continue to startStream() below - it handles CHILD servers properly
        }
      } else if (isMainPanel) {
        // Main panel - check if stream has ANY distribution
        const hasDistribution = await prisma.streamServerDistribution.findFirst({
          where: { streamId, isActive: true },
        });
        
        logger.info({
          streamId,
          hasDistribution: !!hasDistribution,
          distributionDetails: hasDistribution ? { serverId: hasDistribution.serverId, role: hasDistribution.role } : null,
        }, 'OnDemandStreamManager: Distribution check for main panel');
        
        if (hasDistribution) {
          logger.warn({
            streamId,
            originServerId: hasDistribution.serverId,
          }, 'Main panel cannot start stream - it has distribution to edge servers');
          // Don't start on main panel - edge server should handle it
          return;
        }
      }
      
      info.status = 'active';
      logger.info({ streamId, viewers: info.viewerCount }, 'Starting on-demand stream for viewer');

      try {
        await streamLifecycleManager.startStream(streamId);

        // Update database status
        await prisma.stream.update({
          where: { id: streamId },
          data: { streamStatus: 'RUNNING' },
        });

        // Notify load balancer of stream state change for cache invalidation
        await loadBalancer.publishStreamStateChange(streamId, 'started');

        // Log to database
        dbLogger.logStream('INFO', `On-demand stream started for viewer`, streamId, {
          reason: 'viewer_connected',
          connectionId,
          viewerCount: info.viewerCount,
        });

        this.emit('stream:started', { streamId, reason: 'on_demand' });
      } catch (error: any) {
        logger.error({ streamId, error }, 'Failed to start on-demand stream');
        info.status = 'on_demand';

        // Log error to database
        dbLogger.streamError(streamId, `Stream ${streamId}`, `Failed to start on-demand stream: ${error.message}`, error);
      }
    } else {
      info.status = 'active';
    }

    logger.debug({ streamId, viewerCount: info.viewerCount, connectionId }, 'Viewer registered');
  }

  /**
   * Register a viewer for an always-on stream (viewer tracking only, no lifecycle management)
   */
  private async registerAlwaysOnViewer(streamId: number, connectionId: string): Promise<void> {
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
    
    // Set viewer key with TTL
    await redis.setex(viewerKey, VIEWER_TTL_SECONDS, Date.now().toString());
    
    // Also add to set for easy counting
    await redis.sadd(`stream:${streamId}:viewers`, connectionId);
    await redis.expire(`stream:${streamId}:viewers`, 300);

    logger.debug({ streamId, connectionId }, 'Always-on stream viewer registered');
  }

  /**
   * Unregister a viewer from an always-on stream
   */
  private async unregisterAlwaysOnViewer(streamId: number, connectionId: string): Promise<void> {
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
    await redis.del(viewerKey);
    await redis.srem(`stream:${streamId}:viewers`, connectionId);

    logger.debug({ streamId, connectionId }, 'Always-on stream viewer unregistered');
  }

  /**
   * Refresh viewer heartbeat - call this when segments are requested
   */
  async refreshViewer(streamId: number, connectionId: string): Promise<void> {
    // Use ViewerTracker for consistent refresh
    try {
      await viewerTracker.refreshViewer(streamId, connectionId);
    } catch (err) {
      // Fallback to direct Redis operation
      const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
      await redis.setex(viewerKey, VIEWER_TTL_SECONDS, Date.now().toString());
    }

    // Also update last viewer time in memory
    const info = this.streams.get(streamId);
    if (info) {
      info.lastViewerAt = new Date();
      // Cancel any pending stop timer since we have an active viewer
      if (info.stopTimer) {
        clearTimeout(info.stopTimer);
        info.stopTimer = null;
      }
    }
  }

  /**
   * Unregister a viewer from a stream
   * Schedules stream stop if no more viewers
   * Uses atomic operations via ViewerTracker to prevent race conditions
   */
  async unregisterViewer(streamId: number, connectionId: string): Promise<void> {
    // Check if stream is always-on
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { alwaysOn: true },
    });

    if (!stream) return;

    if (stream.alwaysOn) {
      // For always-on streams, just remove the viewer from Redis
      await this.unregisterAlwaysOnViewer(streamId, connectionId);
      // Cleanup HLS connection if connectionId is a viewerId
      this.cleanupHlsConnection(connectionId);
      return;
    }

    const info = this.streams.get(streamId);
    if (!info) return;

    info.lastViewerAt = new Date();

    // Use atomic viewer unregistration via Lua script
    // Returns the remaining viewer count atomically
    let viewerCount: number;
    try {
      viewerCount = await viewerTracker.unregisterViewer(streamId, connectionId);
    } catch (err) {
      // Fallback to non-atomic operation if Lua script fails
      logger.warn({ err, streamId }, 'Atomic viewer unregistration failed, using fallback');
      const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
      await redis.del(viewerKey);
      await redis.srem(`stream:${streamId}:viewers`, connectionId);
      viewerCount = await this.getViewerCount(streamId);
    }

    info.viewerCount = viewerCount;

    logger.debug({ streamId, viewerCount, connectionId }, 'Viewer unregistered');

    // Cleanup associated HLS connection (fire-and-forget)
    this.cleanupHlsConnection(connectionId);

    // If no more viewers, schedule stop
    if (viewerCount === 0) {
      this.scheduleStop(streamId);
    }
  }

  /**
   * Schedule stream stop after timeout
   */
  private scheduleStop(streamId: number): void {
    const info = this.streams.get(streamId);
    if (!info) return;

    // Clear any existing timer
    if (info.stopTimer) {
      clearTimeout(info.stopTimer);
    }

    logger.info({ streamId, timeoutMs: ON_DEMAND_TIMEOUT_MS }, 'Scheduling on-demand stream stop');

    info.stopTimer = setTimeout(async () => {
      await this.stopStreamIfNoViewers(streamId);
    }, ON_DEMAND_TIMEOUT_MS);
  }

  /**
   * Stop stream if there are still no viewers
   */
  private async stopStreamIfNoViewers(streamId: number): Promise<void> {
    const info = this.streams.get(streamId);
    if (!info) return;

    // Double-check viewer count from Redis using individual viewer keys (not the set)
    const viewerCount = await this.getViewerCount(streamId);

    if (viewerCount > 0) {
      logger.debug({ streamId, viewerCount }, 'Stream has viewers, not stopping');
      info.viewerCount = viewerCount;
      info.stopTimer = null;
      return;
    }

    // Check if stream is still not always-on
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { alwaysOn: true },
    });

    if (stream?.alwaysOn) {
      logger.debug({ streamId }, 'Stream became always-on, not stopping');
      info.stopTimer = null;
      return;
    }

    // Check if stream is actually running before trying to stop
    if (!streamLifecycleManager.isStreamRunning(streamId)) {
      logger.debug({ streamId }, 'Stream already stopped');
      info.status = 'on_demand';
      info.stopTimer = null;
      return;
    }

    info.status = 'stopping';
    logger.info({ streamId }, 'Stopping on-demand stream due to no viewers');

    // Cleanup all associated HLS connections before stopping
    await this.cleanupAllHlsConnectionsForStream(streamId);

    try {
      await streamLifecycleManager.stopStream(streamId, true);

      // Update database status
      await prisma.stream.update({
        where: { id: streamId },
        data: { streamStatus: 'STOPPED' },
      });

      // Notify load balancer of stream state change for cache invalidation
      await loadBalancer.publishStreamStateChange(streamId, 'stopped');

      info.status = 'on_demand';
      info.stopTimer = null;

      // Clean up viewer tracking data
      await this.cleanupStaleViewers(streamId);

      // Log to database
      dbLogger.streamStopped(streamId, `Stream ${streamId}`, 'no_viewers');

      this.emit('stream:stopped', { streamId, reason: 'no_viewers' });
      logger.info({ streamId }, 'On-demand stream stopped successfully');
    } catch (error: any) {
      logger.error({ streamId, error }, 'Failed to stop on-demand stream');
      info.status = 'on_demand';
      info.stopTimer = null;

      // Log error to database
      dbLogger.streamError(streamId, `Stream ${streamId}`, `Failed to stop on-demand stream: ${error.message}`, error);
    }
  }

  /**
   * Check for idle streams and stop them
   */
  private async checkIdleStreams(): Promise<void> {
    const now = Date.now();

    // First, check streams we're tracking in memory
    for (const [streamId, info] of this.streams) {
      // Skip if already has a stop timer pending
      if (info.stopTimer) continue;

      // Check viewer count from Redis - count individual viewer keys with TTL
      const viewerCount = await this.getViewerCount(streamId);
      info.viewerCount = viewerCount;

      // If stream is running but has no viewers, schedule stop
      if (viewerCount === 0 && streamLifecycleManager.isStreamRunning(streamId)) {
        const idleTime = now - info.lastViewerAt.getTime();
        if (idleTime >= ON_DEMAND_TIMEOUT_MS) {
          logger.info({ streamId, idleTime }, 'Idle stream detected, stopping immediately');
          await this.stopStreamIfNoViewers(streamId);
        } else if (!info.stopTimer) {
          // Schedule stop for remaining time
          this.scheduleStop(streamId);
        }
      }
    }

    // Also check for running streams in database that we're not tracking
    // This handles edge cases where streams might have started without proper registration
    await this.checkOrphanedOnDemandStreams();
  }

  /**
   * Check for running on-demand streams that we're not tracking
   * and stop them if they have no viewers
   */
  private async checkOrphanedOnDemandStreams(): Promise<void> {
    try {
      // Find running non-always-on streams from database
      const runningStreams = await prisma.stream.findMany({
        where: {
          streamStatus: 'RUNNING',
          alwaysOn: false,
          ffmpegPid: { not: null },
        },
        select: { id: true, name: true },
      });

      for (const stream of runningStreams) {
        // Skip if we're already tracking this stream
        if (this.streams.has(stream.id)) continue;

        // Check if it has viewers
        const viewerCount = await this.getViewerCount(stream.id);

        if (viewerCount === 0) {
          logger.warn({ streamId: stream.id, name: stream.name }, 
            'Found orphaned running on-demand stream with no viewers, stopping');
          
          // Log warning to database
          dbLogger.logStream('WARNING', `Found orphaned on-demand stream with no viewers`, stream.id, {
            streamName: stream.name,
            action: 'stopping',
          });
          
          // Add to tracking and schedule stop
          this.streams.set(stream.id, {
            streamId: stream.id,
            viewerCount: 0,
            lastViewerAt: new Date(Date.now() - ON_DEMAND_TIMEOUT_MS), // Mark as already idle
            stopTimer: null,
            status: 'active',
          });
          
          await this.stopStreamIfNoViewers(stream.id);
        }
      }
    } catch (error) {
      logger.error({ error }, 'Error checking orphaned on-demand streams');
    }
  }

  /**
   * Cleanup HLS connection by viewerId (fire-and-forget)
   */
  private cleanupHlsConnection(viewerId: string): void {
    import('../../api/middlewares/auth.js')
      .then(({ cleanupHlsConnectionByViewerId }) => {
        return cleanupHlsConnectionByViewerId(viewerId);
      })
      .catch((err) => {
        logger.debug({ err, viewerId }, 'Failed to cleanup HLS connection');
      });
  }

  /**
   * Cleanup all HLS connections associated with a stream
   */
  private async cleanupAllHlsConnectionsForStream(streamId: number): Promise<void> {
    try {
      const viewerKeys = await redis.keys(`stream:${streamId}:viewer:*`);
      const viewerIds = viewerKeys.map(key => {
        const parts = key.split(':');
        return parts[parts.length - 1];
      });

      if (viewerIds.length === 0) return;

      logger.debug({ streamId, viewerCount: viewerIds.length }, 'Cleaning up HLS connections for stopped stream');

      const { cleanupHlsConnectionByViewerId } = await import('../../api/middlewares/auth.js');
      await Promise.all(
        viewerIds.map(viewerId => 
          cleanupHlsConnectionByViewerId(viewerId).catch(() => {})
        )
      );
    } catch (err) {
      logger.debug({ err, streamId }, 'Failed to cleanup HLS connections for stream');
    }
  }

  /**
   * Get viewer count for a stream
   * Uses atomic Lua script for accurate count with automatic cleanup
   */
  async getViewerCount(streamId: number): Promise<number> {
    try {
      return await viewerTracker.getViewerCount(streamId);
    } catch (err) {
      // Fallback to key counting
      const keys = await redis.keys(`stream:${streamId}:viewer:*`);
      return keys.length;
    }
  }

  /**
   * Clean up stale viewer entries from the set
   */
  async cleanupStaleViewers(streamId: number): Promise<void> {
    const setKey = `stream:${streamId}:viewers`;
    const members = await redis.smembers(setKey);
    
    for (const connectionId of members) {
      const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
      const exists = await redis.exists(viewerKey);
      if (!exists) {
        // Individual viewer key expired, remove from set
        await redis.srem(setKey, connectionId);
      }
    }
  }

  /**
   * Get stream status (active/on_demand)
   */
  getStreamStatus(streamId: number): 'active' | 'on_demand' | 'stopping' {
    const info = this.streams.get(streamId);
    if (!info) {
      // Check if running
      if (streamLifecycleManager.isStreamRunning(streamId)) {
        return 'active';
      }
      return 'on_demand';
    }
    return info.status;
  }

  /**
   * Get all on-demand stream statuses
   */
  getAllStatuses(): Map<number, OnDemandStreamInfo> {
    return new Map(this.streams);
  }

  /**
   * Force stop all idle on-demand streams immediately
   * Useful for testing and recovery
   */
  async forceStopAllIdleStreams(): Promise<number> {
    let stoppedCount = 0;

    // Check all running non-always-on streams
    const runningStreams = await prisma.stream.findMany({
      where: {
        streamStatus: 'RUNNING',
        alwaysOn: false,
      },
      select: { id: true, name: true },
    });

    for (const stream of runningStreams) {
      const viewerCount = await this.getViewerCount(stream.id);
      
      if (viewerCount === 0) {
        logger.info({ streamId: stream.id, name: stream.name }, 'Force stopping idle on-demand stream');
        
        try {
          await streamLifecycleManager.stopStream(stream.id, true);
          await prisma.stream.update({
            where: { id: stream.id },
            data: { streamStatus: 'STOPPED' },
          });
          stoppedCount++;
          
          // Log to database
          dbLogger.streamStopped(stream.id, stream.name, 'force_stop_idle');
          
          // Remove from tracking
          const info = this.streams.get(stream.id);
          if (info?.stopTimer) {
            clearTimeout(info.stopTimer);
          }
          this.streams.delete(stream.id);
        } catch (error: any) {
          logger.error({ streamId: stream.id, error }, 'Failed to force stop stream');
          
          // Log error to database
          dbLogger.streamError(stream.id, stream.name, `Failed to force stop stream: ${error.message}`, error);
        }
      }
    }

    return stoppedCount;
  }

  /**
   * Get info about tracked streams for debugging
   */
  getDebugInfo(): { 
    trackedStreams: number; 
    streams: Array<{ 
      streamId: number; 
      viewerCount: number; 
      lastViewerAt: Date; 
      status: string; 
      hasStopTimer: boolean 
    }> 
  } {
    const streams = Array.from(this.streams.values()).map(info => ({
      streamId: info.streamId,
      viewerCount: info.viewerCount,
      lastViewerAt: info.lastViewerAt,
      status: info.status,
      hasStopTimer: !!info.stopTimer,
    }));

    return {
      trackedStreams: this.streams.size,
      streams,
    };
  }
}

export const onDemandStreamManager = new OnDemandStreamManager();
export default onDemandStreamManager;

