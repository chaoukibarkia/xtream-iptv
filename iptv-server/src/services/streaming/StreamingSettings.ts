import { settingsService } from '../settings/SettingsService.js';
import { logger } from '../../config/logger.js';

/**
 * Streaming configuration from the database settings table
 * 
 * These values are stored in the `SystemSettings` table with keys:
 * - streaming.hlsSegmentDuration (int) - HLS segment duration in seconds
 * - streaming.hlsPlaylistLength (int) - Number of segments in playlist
 * - streaming.bufferSize (int) - Buffer size in MB
 * - streaming.maxBitrate (int) - Maximum bitrate in kbps
 */
export interface StreamingConfig {
  hlsSegmentDuration: number;  // seconds (default: 4)
  hlsPlaylistLength: number;   // number of segments (default: 6)
  bufferSize: number;          // MB (default: 32)
  maxBitrate: number;          // kbps (default: 8000)
}

/**
 * Default values for streaming configuration
 * 
 * These are used when database values are missing or null.
 * Balanced for COMPATIBILITY and reasonable latency:
 * - 2s segments = good compatibility with all players (VLC, mpv, etc.)
 * - 6 segments in playlist = 12 seconds buffer for network latency
 * 
 * Latency calculation:
 * - Segment duration × (Playlist length + 1) + encoding delay
 * - 2s × 7 + ~2s encoding = ~16 seconds total latency
 * 
 * For lower latency, reduce segment duration to 1s and playlist to 4.
 * But this may cause issues with slow network connections.
 */
const DEFAULT_CONFIG: StreamingConfig = {
  hlsSegmentDuration: 2,   // 2 seconds per segment (better compatibility)
  hlsPlaylistLength: 6,    // 6 segments in playlist (~12 seconds buffer for network latency)
  bufferSize: 8,           // 8 MB buffer (reduced for faster response)
  maxBitrate: 8000,        // 8 Mbps max bitrate
};

// Cached config to avoid repeated DB calls
let cachedConfig: StreamingConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get streaming configuration from settings table
 * 
 * Reads from database keys:
 * - streaming.hlsSegmentDuration → hlsSegmentDuration (fallback: 4)
 * - streaming.hlsPlaylistLength → hlsPlaylistLength (fallback: 6)
 * - streaming.bufferSize → bufferSize (fallback: 32)
 * - streaming.maxBitrate → maxBitrate (fallback: 8000)
 * 
 * Results are cached for 1 minute to minimize database queries.
 * If database values are missing or null, defaults are used.
 */
export async function getStreamingConfig(): Promise<StreamingConfig> {
  const now = Date.now();
  
  // Return cached config if still valid
  if (cachedConfig && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    // Fetch all settings in parallel for efficiency
    const [hlsSegmentDuration, hlsPlaylistLength, bufferSize, maxBitrate] = await Promise.all([
      settingsService.getOrDefault<number>('streaming.hlsSegmentDuration', DEFAULT_CONFIG.hlsSegmentDuration),
      settingsService.getOrDefault<number>('streaming.hlsPlaylistLength', DEFAULT_CONFIG.hlsPlaylistLength),
      settingsService.getOrDefault<number>('streaming.bufferSize', DEFAULT_CONFIG.bufferSize),
      settingsService.getOrDefault<number>('streaming.maxBitrate', DEFAULT_CONFIG.maxBitrate),
    ]);

    cachedConfig = {
      hlsSegmentDuration,
      hlsPlaylistLength,
      bufferSize,
      maxBitrate,
    };
    cacheTimestamp = now;

    logger.debug({ config: cachedConfig }, 'Loaded streaming config from settings');
    return cachedConfig;
  } catch (error) {
    logger.error({ error }, 'Failed to load streaming config, using defaults');
    return DEFAULT_CONFIG;
  }
}

/**
 * Clear the cached config
 * Call this after settings are changed to force reload on next getStreamingConfig()
 */
export function clearStreamingConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Get buffer size in kilobits (for FFmpeg -bufsize parameter)
 * Converts MB to kbits: 1 MB = 8,000 kbits
 */
export function getBufferSizeKbits(config: StreamingConfig): number {
  return config.bufferSize * 8000;
}

/**
 * Get default streaming config (without database lookup)
 * Useful for initialization or when database is unavailable
 */
export function getDefaultStreamingConfig(): StreamingConfig {
  return { ...DEFAULT_CONFIG };
}
