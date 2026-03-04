import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

/**
 * Lua script for atomic viewer registration
 * Handles race conditions when multiple viewers register/unregister simultaneously
 */
const REGISTER_VIEWER_SCRIPT = `
local streamKey = KEYS[1]
local viewerKey = KEYS[2]
local viewerId = ARGV[1]
local ttl = tonumber(ARGV[2])
local timestamp = ARGV[3]

-- Check if this viewer already exists
local exists = redis.call('EXISTS', viewerKey)

-- Set the viewer key with TTL
redis.call('SETEX', viewerKey, ttl, timestamp)

-- Add to the viewers set
redis.call('SADD', streamKey, viewerId)
redis.call('EXPIRE', streamKey, 300)

-- Return 1 if new viewer, 0 if existing
if exists == 0 then
  return 1
else
  return 0
end
`;

/**
 * Lua script for atomic viewer unregistration
 */
const UNREGISTER_VIEWER_SCRIPT = `
local streamKey = KEYS[1]
local viewerKey = KEYS[2]
local viewerId = ARGV[1]

-- Remove the viewer key
redis.call('DEL', viewerKey)

-- Remove from the viewers set
redis.call('SREM', streamKey, viewerId)

-- Get remaining viewer count by counting valid viewer keys
local members = redis.call('SMEMBERS', streamKey)
local count = 0
for i, member in ipairs(members) do
  local memberKey = 'stream:' .. KEYS[3] .. ':viewer:' .. member
  if redis.call('EXISTS', memberKey) == 1 then
    count = count + 1
  else
    -- Clean up stale member from set
    redis.call('SREM', streamKey, member)
  end
end

return count
`;

/**
 * Lua script for atomic viewer count with cleanup
 */
const COUNT_VIEWERS_SCRIPT = `
local streamKey = KEYS[1]
local streamId = ARGV[1]

local members = redis.call('SMEMBERS', streamKey)
local count = 0
local stale = {}

for i, member in ipairs(members) do
  local viewerKey = 'stream:' .. streamId .. ':viewer:' .. member
  if redis.call('EXISTS', viewerKey) == 1 then
    count = count + 1
  else
    table.insert(stale, member)
  end
end

-- Clean up stale members
for i, member in ipairs(stale) do
  redis.call('SREM', streamKey, member)
end

return count
`;

/**
 * Lua script for batch viewer refresh (multiple streams at once)
 */
const BATCH_REFRESH_SCRIPT = `
local timestamp = ARGV[1]
local ttl = tonumber(ARGV[2])
local count = tonumber(ARGV[3])

for i = 1, count do
  local viewerKey = KEYS[i]
  redis.call('SETEX', viewerKey, ttl, timestamp)
end

return count
`;

/**
 * Lua script for getting viewer stats across multiple streams
 */
const GET_STREAM_STATS_SCRIPT = `
local streamIds = cjson.decode(ARGV[1])
local results = {}

for i, streamId in ipairs(streamIds) do
  local streamKey = 'stream:' .. streamId .. ':viewers'
  local members = redis.call('SMEMBERS', streamKey)
  local count = 0

  for j, member in ipairs(members) do
    local viewerKey = 'stream:' .. streamId .. ':viewer:' .. member
    if redis.call('EXISTS', viewerKey) == 1 then
      count = count + 1
    end
  end

  results[tostring(streamId)] = count
end

return cjson.encode(results)
`;

// Script SHAs for EVALSHA (more efficient than EVAL)
let registerViewerSha: string | null = null;
let unregisterViewerSha: string | null = null;
let countViewersSha: string | null = null;
let batchRefreshSha: string | null = null;
let getStreamStatsSha: string | null = null;

/**
 * ViewerTracker - Atomic viewer counting using Redis Lua scripts
 * Prevents race conditions and ensures accurate viewer counts
 */
export class ViewerTracker {
  private static instance: ViewerTracker;
  private initialized = false;
  private readonly VIEWER_TTL_SECONDS = 60;

  private constructor() {}

  static getInstance(): ViewerTracker {
    if (!ViewerTracker.instance) {
      ViewerTracker.instance = new ViewerTracker();
    }
    return ViewerTracker.instance;
  }

  /**
   * Initialize Lua scripts (load into Redis)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load scripts and get their SHAs
      registerViewerSha = await redis.script('LOAD', REGISTER_VIEWER_SCRIPT) as string;
      unregisterViewerSha = await redis.script('LOAD', UNREGISTER_VIEWER_SCRIPT) as string;
      countViewersSha = await redis.script('LOAD', COUNT_VIEWERS_SCRIPT) as string;
      batchRefreshSha = await redis.script('LOAD', BATCH_REFRESH_SCRIPT) as string;
      getStreamStatsSha = await redis.script('LOAD', GET_STREAM_STATS_SCRIPT) as string;

      this.initialized = true;
      logger.info('ViewerTracker Lua scripts loaded');
    } catch (err) {
      logger.error({ err }, 'Failed to load ViewerTracker Lua scripts');
      throw err;
    }
  }

  /**
   * Atomically register a viewer for a stream
   * Returns true if this is a new viewer, false if existing
   */
  async registerViewer(streamId: number, connectionId: string): Promise<boolean> {
    await this.ensureInitialized();

    const streamKey = `stream:${streamId}:viewers`;
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
    const timestamp = Date.now().toString();

    try {
      const result = await redis.evalsha(
        registerViewerSha!,
        2,
        streamKey,
        viewerKey,
        connectionId,
        this.VIEWER_TTL_SECONDS.toString(),
        timestamp
      );

      const isNew = result === 1;
      logger.debug({ streamId, connectionId, isNew }, 'Viewer registered atomically');
      return isNew;
    } catch (err: any) {
      // Handle NOSCRIPT error by reloading script
      if (err.message?.includes('NOSCRIPT')) {
        await this.reloadScripts();
        return this.registerViewer(streamId, connectionId);
      }
      throw err;
    }
  }

  /**
   * Atomically unregister a viewer and get remaining count
   */
  async unregisterViewer(streamId: number, connectionId: string): Promise<number> {
    await this.ensureInitialized();

    const streamKey = `stream:${streamId}:viewers`;
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;

    try {
      const remainingCount = await redis.evalsha(
        unregisterViewerSha!,
        3,
        streamKey,
        viewerKey,
        streamId.toString(),
        connectionId
      );

      logger.debug({ streamId, connectionId, remainingCount }, 'Viewer unregistered atomically');
      return remainingCount as number;
    } catch (err: any) {
      if (err.message?.includes('NOSCRIPT')) {
        await this.reloadScripts();
        return this.unregisterViewer(streamId, connectionId);
      }
      throw err;
    }
  }

  /**
   * Refresh viewer heartbeat
   */
  async refreshViewer(streamId: number, connectionId: string): Promise<void> {
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
    const timestamp = Date.now().toString();
    await redis.setex(viewerKey, this.VIEWER_TTL_SECONDS, timestamp);
  }

  /**
   * Batch refresh multiple viewers at once (more efficient)
   */
  async batchRefreshViewers(viewers: Array<{ streamId: number; connectionId: string }>): Promise<void> {
    if (viewers.length === 0) return;
    await this.ensureInitialized();

    const keys = viewers.map(v => `stream:${v.streamId}:viewer:${v.connectionId}`);
    const timestamp = Date.now().toString();

    try {
      await redis.evalsha(
        batchRefreshSha!,
        keys.length,
        ...keys,
        timestamp,
        this.VIEWER_TTL_SECONDS.toString(),
        keys.length.toString()
      );
    } catch (err: any) {
      if (err.message?.includes('NOSCRIPT')) {
        await this.reloadScripts();
        return this.batchRefreshViewers(viewers);
      }
      throw err;
    }
  }

  /**
   * Get accurate viewer count with automatic cleanup
   */
  async getViewerCount(streamId: number): Promise<number> {
    await this.ensureInitialized();

    const streamKey = `stream:${streamId}:viewers`;

    try {
      const count = await redis.evalsha(
        countViewersSha!,
        1,
        streamKey,
        streamId.toString()
      );
      return count as number;
    } catch (err: any) {
      if (err.message?.includes('NOSCRIPT')) {
        await this.reloadScripts();
        return this.getViewerCount(streamId);
      }
      throw err;
    }
  }

  /**
   * Get viewer counts for multiple streams at once
   */
  async getStreamStats(streamIds: number[]): Promise<Record<number, number>> {
    if (streamIds.length === 0) return {};
    await this.ensureInitialized();

    try {
      const resultJson = await redis.evalsha(
        getStreamStatsSha!,
        0,
        JSON.stringify(streamIds)
      );

      const result = JSON.parse(resultJson as string);

      // Convert string keys to numbers
      const stats: Record<number, number> = {};
      for (const [key, value] of Object.entries(result)) {
        stats[parseInt(key, 10)] = value as number;
      }
      return stats;
    } catch (err: any) {
      if (err.message?.includes('NOSCRIPT')) {
        await this.reloadScripts();
        return this.getStreamStats(streamIds);
      }

      // Fallback to individual counts if batch fails
      logger.warn({ err }, 'Batch stats failed, falling back to individual counts');
      const stats: Record<number, number> = {};
      for (const streamId of streamIds) {
        stats[streamId] = await this.getViewerCount(streamId);
      }
      return stats;
    }
  }

  /**
   * Check if a specific viewer is active
   */
  async isViewerActive(streamId: number, connectionId: string): Promise<boolean> {
    const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
    return (await redis.exists(viewerKey)) === 1;
  }

  /**
   * Get all active viewer IDs for a stream
   */
  async getActiveViewers(streamId: number): Promise<string[]> {
    const streamKey = `stream:${streamId}:viewers`;
    const members = await redis.smembers(streamKey);

    // Filter to only active viewers
    const active: string[] = [];
    for (const connectionId of members) {
      if (await this.isViewerActive(streamId, connectionId)) {
        active.push(connectionId);
      }
    }
    return active;
  }

  /**
   * Force cleanup of stale viewers for a stream
   */
  async cleanupStaleViewers(streamId: number): Promise<number> {
    const streamKey = `stream:${streamId}:viewers`;
    const members = await redis.smembers(streamKey);

    let cleaned = 0;
    for (const connectionId of members) {
      const viewerKey = `stream:${streamId}:viewer:${connectionId}`;
      const exists = await redis.exists(viewerKey);
      if (!exists) {
        await redis.srem(streamKey, connectionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ streamId, cleaned }, 'Cleaned up stale viewers');
    }

    return cleaned;
  }

  /**
   * Ensure scripts are initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Reload scripts (e.g., after Redis restart)
   */
  private async reloadScripts(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }
}

// Export singleton instance
export const viewerTracker = ViewerTracker.getInstance();
