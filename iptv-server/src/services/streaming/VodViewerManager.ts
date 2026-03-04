import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

// VOD viewer TTL - viewers expire after 60 seconds without activity
const VOD_VIEWER_TTL_SECONDS = 60;

/**
 * VodViewerManager - Track viewers for VOD/Movie content
 * 
 * Enables tracking of:
 * - How many users are watching a specific movie
 * - Real-time viewer counts for VOD content
 * - Viewer session management with auto-expiry
 */
class VodViewerManager {
  /**
   * Register a viewer for a VOD stream
   * @param streamId - The VOD stream ID
   * @param viewerId - Unique viewer identifier
   */
  async registerViewer(streamId: number, viewerId: string): Promise<void> {
    const viewerKey = `vod:${streamId}:viewer:${viewerId}`;
    await redis.setex(viewerKey, VOD_VIEWER_TTL_SECONDS, Date.now().toString());
    logger.debug({ streamId, viewerId }, 'VOD viewer registered');
  }

  /**
   * Refresh viewer heartbeat - call this on segment requests
   * @param streamId - The VOD stream ID
   * @param viewerId - Unique viewer identifier
   */
  async refreshViewer(streamId: number, viewerId: string): Promise<void> {
    const viewerKey = `vod:${streamId}:viewer:${viewerId}`;
    const exists = await redis.exists(viewerKey);
    
    if (exists) {
      await redis.expire(viewerKey, VOD_VIEWER_TTL_SECONDS);
    } else {
      // Re-register if expired
      await redis.setex(viewerKey, VOD_VIEWER_TTL_SECONDS, Date.now().toString());
    }
  }

  /**
   * Unregister a viewer from a VOD stream
   * @param streamId - The VOD stream ID
   * @param viewerId - Unique viewer identifier
   */
  async unregisterViewer(streamId: number, viewerId: string): Promise<void> {
    const viewerKey = `vod:${streamId}:viewer:${viewerId}`;
    await redis.del(viewerKey);
    logger.debug({ streamId, viewerId }, 'VOD viewer unregistered');
  }

  /**
   * Get viewer count for a specific VOD stream
   * @param streamId - The VOD stream ID
   * @returns Number of active viewers
   */
  async getViewerCount(streamId: number): Promise<number> {
    const keys = await redis.keys(`vod:${streamId}:viewer:*`);
    return keys.length;
  }

  /**
   * Get viewer counts for multiple VOD streams
   * @param streamIds - Array of VOD stream IDs
   * @returns Map of streamId to viewer count
   */
  async getViewerCounts(streamIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    
    // Use pipeline for efficiency
    for (const streamId of streamIds) {
      const keys = await redis.keys(`vod:${streamId}:viewer:*`);
      counts.set(streamId, keys.length);
    }
    
    return counts;
  }

  /**
   * Get all VOD streams with active viewers
   * @returns Array of {streamId, viewerCount}
   */
  async getActiveVodStreams(): Promise<Array<{ streamId: number; viewerCount: number }>> {
    // Get all VOD viewer keys
    const allKeys = await redis.keys('vod:*:viewer:*');
    
    // Parse stream IDs and count
    const streamCounts = new Map<number, number>();
    
    for (const key of allKeys) {
      // Key format: vod:{streamId}:viewer:{viewerId}
      const parts = key.split(':');
      if (parts.length >= 3) {
        const streamId = parseInt(parts[1], 10);
        if (!isNaN(streamId)) {
          streamCounts.set(streamId, (streamCounts.get(streamId) || 0) + 1);
        }
      }
    }
    
    return Array.from(streamCounts.entries()).map(([streamId, viewerCount]) => ({
      streamId,
      viewerCount,
    }));
  }

  /**
   * Get total VOD viewer count across all streams
   * @returns Total number of VOD viewers
   */
  async getTotalViewerCount(): Promise<number> {
    const keys = await redis.keys('vod:*:viewer:*');
    return keys.length;
  }
}

// Export singleton
export const vodViewerManager = new VodViewerManager();
