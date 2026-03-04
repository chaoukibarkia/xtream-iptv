import { EventEmitter } from 'events';
import { spawn, exec, ChildProcess, ExecException } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { prisma } from '../../config/database.js';
import { streamLifecycleManager } from '../streaming/StreamLifecycleManager.js';
import { settingsService } from '../settings/SettingsService.js';
import { isProcessRunning } from '../../utils/process.js';

// Settings key prefix for health monitor config
const SETTINGS_PREFIX = 'healthMonitor';

// =============================================================================
// TYPES AND INTERFACES
// =============================================================================

export interface HealthCheckConfig {
  /** Health check interval in milliseconds (default: 30000 = 30 seconds) */
  checkIntervalMs: number;
  /** Timeout for probe operations in milliseconds */
  probeTimeoutMs: number;
  /** Max consecutive failures before restart */
  maxConsecutiveFailures: number;
  /** Memory threshold in MB - restart if exceeded */
  memoryThresholdMb: number;
  /** CPU threshold percentage - alert if exceeded */
  cpuThresholdPercent: number;
  /** Duration to analyze for frozen video detection (seconds) */
  frozenDetectionDuration: number;
  /** Duration to analyze for silent audio detection (seconds) */
  silentDetectionDuration: number;
  /** Minimum audio level (dB) - below this is considered silent */
  silentAudioThresholdDb: number;
  /** Maximum frame difference threshold for frozen video detection */
  frozenFrameThreshold: number;
  /** Cooldown between restarts in milliseconds */
  restartCooldownMs: number;
  /** Enable audio checks */
  enableAudioChecks: boolean;
  /** Enable video frozen checks */
  enableFrozenChecks: boolean;
  /** Enable process metrics monitoring */
  enableProcessMetrics: boolean;
  /** Enable HTTP reachability checks */
  enableHttpChecks: boolean;
}

export interface StreamHealthStatus {
  streamId: number;
  name: string;
  pid: number | null;
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastRestartAt: Date | null;
  restartCount: number;
  issues: HealthIssue[];
  metrics: ProcessMetrics | null;
  audioStatus: AudioStatus | null;
  videoStatus: VideoStatus | null;
}

export interface HealthIssue {
  type: 'http_error' | 'connection_lost' | 'timeout' | 'silent_audio' | 'frozen_video' | 
        'missing_audio' | 'missing_video' | 'high_memory' | 'high_cpu' | 'process_unresponsive';
  message: string;
  timestamp: Date;
  severity: 'warning' | 'critical';
}

export interface ProcessMetrics {
  pid: number;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  uptime: number;
  isResponsive: boolean;
}

export interface AudioStatus {
  hasAudio: boolean;
  isSilent: boolean;
  meanVolume: number | null;
  maxVolume: number | null;
  lastChecked: Date;
}

export interface VideoStatus {
  hasVideo: boolean;
  isFrozen: boolean;
  fps: number | null;
  resolution: string | null;
  frameDifference: number | null;
  lastChecked: Date;
}

export interface HealthCheckResult {
  streamId: number;
  success: boolean;
  issues: HealthIssue[];
  shouldRestart: boolean;
  metrics?: ProcessMetrics;
  audioStatus?: AudioStatus;
  videoStatus?: VideoStatus;
}

interface StreamState {
  streamId: number;
  name: string;
  sourceUrl: string;
  pid: number | null;
  consecutiveFailures: number;
  lastRestartAt: Date | null;
  restartCount: number;
  lastCheckAt: Date | null;
  issues: HealthIssue[];
  /** When the stream was first seen - used for startup grace period */
  firstSeenAt: Date;
}

/** Startup grace period - don't restart streams within this time of first seeing them */
const STARTUP_GRACE_PERIOD_MS = 120000; // 2 minutes

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: HealthCheckConfig = {
  checkIntervalMs: 30000,              // 30 seconds
  probeTimeoutMs: 15000,               // 15 seconds
  maxConsecutiveFailures: 8,           // Increased from 5 to 8 - requires 4 minutes of failures before restart
  memoryThresholdMb: 2048,             // 2GB
  cpuThresholdPercent: 90,
  frozenDetectionDuration: 10,         // Increased from 5 to 10 seconds for reliability
  silentDetectionDuration: 15,         // Increased from 10 to 15 seconds
  silentAudioThresholdDb: -80,         // Changed from -60 to -80 dB (more realistic silence threshold)
  frozenFrameThreshold: 0.0005,        // Lowered threshold to reduce false positives
  restartCooldownMs: 300000,           // Increased from 3 minutes to 5 minutes to prevent restart loops
  enableAudioChecks: false,            // Disabled by default - often causes false positives
  enableFrozenChecks: false,           // Disabled by default - often causes false positives
  enableProcessMetrics: true,
  enableHttpChecks: false,             // Disabled by default - source checks cause false positives
};

// =============================================================================
// HELPER FUNCTIONS (Exported for reuse)
// =============================================================================

/**
 * Check if audio track is present and not silent
 * Uses FFmpeg's volumedetect filter to analyze audio levels
 * 
 * @param videoPath - Path to video file or stream URL
 * @param duration - Duration to analyze in seconds (default: 10)
 * @param silentThresholdDb - Volume threshold in dB (default: -60)
 * @returns AudioStatus object with analysis results
 */
export async function checkAudio(
  videoPath: string,
  duration: number = 10,
  silentThresholdDb: number = -60
): Promise<AudioStatus> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    
    // Use FFmpeg to analyze audio levels
    const args = [
      '-hide_banner',
      '-nostats',
      '-i', videoPath,
      '-t', String(duration),
      '-af', 'volumedetect',
      '-f', 'null',
      '-'
    ];

    const ffmpeg = spawn(config.ffmpeg.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let hasAudio = false;
    let meanVolume: number | null = null;
    let maxVolume: number | null = null;

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
    }, (duration + 5) * 1000);

    ffmpeg.on('close', () => {
      clearTimeout(timeout);
      
      // Parse volumedetect output
      const meanMatch = stderr.match(/mean_volume:\s*([-\d.]+)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
      
      if (meanMatch) {
        hasAudio = true;
        meanVolume = parseFloat(meanMatch[1]);
      }
      if (maxMatch) {
        maxVolume = parseFloat(maxMatch[1]);
      }

      // Check for audio stream in input
      if (stderr.includes('Audio:')) {
        hasAudio = true;
      }

      const isSilent = hasAudio && meanVolume !== null && meanVolume < silentThresholdDb;

      resolve({
        hasAudio,
        isSilent,
        meanVolume,
        maxVolume,
        lastChecked: new Date(),
      });
    });

    ffmpeg.on('error', () => {
      clearTimeout(timeout);
      resolve({
        hasAudio: false,
        isSilent: false,
        meanVolume: null,
        maxVolume: null,
        lastChecked: new Date(),
      });
    });
  });
}

/**
 * Detect if video is frozen (no frame changes)
 * Uses FFmpeg's blackdetect and freezedetect filters
 * 
 * @param videoPath - Path to video file or stream URL
 * @param duration - Duration to analyze in seconds (default: 5)
 * @param threshold - Frame difference threshold (default: 0.001)
 * @returns VideoStatus object with analysis results
 */
export async function isVideoFrozen(
  videoPath: string,
  duration: number = 5,
  threshold: number = 0.001
): Promise<VideoStatus> {
  return new Promise((resolve) => {
    // Use FFmpeg's freezedetect filter to detect frozen frames
    const args = [
      '-hide_banner',
      '-nostats',
      '-i', videoPath,
      '-t', String(duration),
      '-vf', `freezedetect=n=${threshold}:d=2`,
      '-f', 'null',
      '-'
    ];

    const ffmpeg = spawn(config.ffmpeg.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let hasVideo = false;
    let isFrozen = false;
    let fps: number | null = null;
    let resolution: string | null = null;

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      ffmpeg.kill('SIGKILL');
    }, (duration + 10) * 1000);

    ffmpeg.on('close', () => {
      clearTimeout(timeout);
      
      // Check for video stream
      const videoMatch = stderr.match(/Video:\s+(\w+).+?(\d+x\d+)/);
      if (videoMatch) {
        hasVideo = true;
        resolution = videoMatch[2];
      }

      // Check for fps
      const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s*fps/);
      if (fpsMatch) {
        fps = parseFloat(fpsMatch[1]);
      }

      // Check if freeze was detected
      if (stderr.includes('freeze_start') || stderr.includes('lavfi.freezedetect.freeze_start')) {
        isFrozen = true;
      }

      // Alternative: check for very low frame difference using mpdecimate
      const freezeDuration = stderr.match(/freeze_duration:\s*([\d.]+)/);
      if (freezeDuration && parseFloat(freezeDuration[1]) >= duration * 0.8) {
        isFrozen = true;
      }

      resolve({
        hasVideo,
        isFrozen,
        fps,
        resolution,
        frameDifference: isFrozen ? 0 : null,
        lastChecked: new Date(),
      });
    });

    ffmpeg.on('error', () => {
      clearTimeout(timeout);
      resolve({
        hasVideo: false,
        isFrozen: false,
        fps: null,
        resolution: null,
        frameDifference: null,
        lastChecked: new Date(),
      });
    });
  });
}

/**
 * Get CPU and memory metrics for a process by PID
 * 
 * @param pid - Process ID to monitor
 * @returns ProcessMetrics object or null if process not found
 */
export async function getProcessMetrics(pid: number): Promise<ProcessMetrics | null> {
  // Validate PID is a positive integer to prevent command injection
  if (!Number.isInteger(pid) || pid <= 0) {
    logger.warn({ pid }, 'Invalid PID provided to getProcessMetrics');
    return null;
  }

  return new Promise((resolve) => {
    // Use ps command to get process metrics
    // Format: %cpu %mem rss etime
    exec(
      `ps -p ${pid} -o %cpu,%mem,rss,etime --no-headers 2>/dev/null`,
      { timeout: 5000 },
      (error: ExecException | null, stdout: string, stderr: string) => {
        if (error) {
          // Process doesn't exist or other error
          resolve(null);
          return;
        }

        const parts = stdout.trim().split(/\s+/);
        if (parts.length < 4) {
          resolve(null);
          return;
        }

        const cpuPercent = parseFloat(parts[0]) || 0;
        const memoryPercent = parseFloat(parts[1]) || 0;
        const rssKb = parseInt(parts[2], 10) || 0;
        const etimeStr = parts[3];

        // Parse elapsed time (format: [[DD-]HH:]MM:SS)
        let uptime = 0;
        const etimeParts = etimeStr.split(/[-:]/).reverse();
        if (etimeParts.length >= 1) uptime += parseInt(etimeParts[0], 10) || 0;        // seconds
        if (etimeParts.length >= 2) uptime += (parseInt(etimeParts[1], 10) || 0) * 60;  // minutes
        if (etimeParts.length >= 3) uptime += (parseInt(etimeParts[2], 10) || 0) * 3600; // hours
        if (etimeParts.length >= 4) uptime += (parseInt(etimeParts[3], 10) || 0) * 86400; // days

        resolve({
          pid,
          cpuPercent,
          memoryPercent,
          memoryMb: rssKb / 1024,
          uptime,
          isResponsive: true,
        });
      }
    );
  });
}

/**
 * Check if a process is responsive by sending signal 0.
 * Uses safe process.kill(pid, 0) instead of shell exec to prevent command injection.
 *
 * @param pid - Process ID to check
 * @returns boolean indicating if process is responsive
 */
export function isProcessResponsive(pid: number): boolean {
  return isProcessRunning(pid);
}

/**
 * Check HTTP stream accessibility
 * 
 * @param url - Stream URL to check
 * @param timeoutMs - Timeout in milliseconds
 * @param userAgent - Optional custom User-Agent header
 * @returns Object with online status and any error
 */
export async function checkHttpStream(
  url: string,
  timeoutMs: number = 10000,
  userAgent?: string | null
): Promise<{ online: boolean; statusCode?: number; error?: string }> {
  return new Promise((resolve) => {
    // Use FFmpeg probe to check stream - more reliable than HTTP HEAD for streams
    const args = [
      '-hide_banner',
    ];
    
    // Add custom User-Agent if specified
    if (userAgent) {
      args.push('-user_agent', userAgent);
    }
    
    args.push(
      '-i', url,
      '-t', '2',
      '-f', 'null',
      '-'
    );

    const ffmpeg = spawn(config.ffmpeg.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ffmpeg.kill('SIGKILL');
        resolve({ online: false, error: 'Timeout' });
      }
    }, timeoutMs);

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', (code) => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;

      // Check for common error patterns
      if (stderr.includes('Connection refused')) {
        resolve({ online: false, error: 'Connection refused' });
      } else if (stderr.includes('Connection timed out')) {
        resolve({ online: false, error: 'Connection timed out' });
      } else if (stderr.includes('404') || stderr.includes('Not Found')) {
        resolve({ online: false, statusCode: 404, error: 'Not found' });
      } else if (stderr.includes('403') || stderr.includes('Forbidden')) {
        resolve({ online: false, statusCode: 403, error: 'Forbidden' });
      } else if (stderr.includes('401') || stderr.includes('Unauthorized')) {
        resolve({ online: false, statusCode: 401, error: 'Unauthorized' });
      } else if (stderr.includes('HTTP error')) {
        const match = stderr.match(/HTTP error (\d+)/);
        resolve({ 
          online: false, 
          statusCode: match ? parseInt(match[1], 10) : undefined,
          error: 'HTTP error' 
        });
      } else if (code === 0 || stderr.includes('Stream #')) {
        resolve({ online: true });
      } else {
        resolve({ online: false, error: 'Unknown error' });
      }
    });

    ffmpeg.on('error', (err) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ online: false, error: err.message });
      }
    });
  });
}

/**
 * Restart a stream with logging
 * 
 * @param streamId - Stream ID to restart
 * @returns boolean indicating success
 */
export async function restartStream(streamId: number): Promise<boolean> {
  const timestamp = new Date().toISOString();
  
  try {
    logger.warn({ streamId, timestamp }, 'Health monitor initiating stream restart');
    
    // Get stream info for logging
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { name: true, sourceUrl: true },
    });

    if (!stream) {
      logger.error({ streamId }, 'Cannot restart: stream not found');
      return false;
    }

    // Use StreamLifecycleManager for proper restart
    await streamLifecycleManager.restartStream(streamId);

    logger.info({ 
      streamId, 
      name: stream.name,
      timestamp: new Date().toISOString(),
    }, 'Stream restarted successfully by health monitor');

    return true;
  } catch (error: any) {
    logger.error({ 
      streamId, 
      error: error.message,
      timestamp,
    }, 'Failed to restart stream');
    return false;
  }
}

// =============================================================================
// ALWAYS-ON HEALTH MONITOR CLASS
// =============================================================================

export class AlwaysOnHealthMonitor extends EventEmitter {
  private config: HealthCheckConfig;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private streamStates: Map<number, StreamState> = new Map();
  private lastFullCheck: Date | null = null;
  private configLoaded = false;
  private startedAt: number | null = null;

  constructor(config?: Partial<HealthCheckConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Load configuration from database
   */
  async loadConfigFromDb(): Promise<void> {
    try {
      // settingsService.get() already handles JSON parsing when type is 'json'
      const savedConfig = await settingsService.get<Partial<HealthCheckConfig>>(`${SETTINGS_PREFIX}.config`);
      if (savedConfig && typeof savedConfig === 'object') {
        this.config = { ...DEFAULT_CONFIG, ...savedConfig };
        logger.info({ config: this.config }, 'Loaded health monitor config from database');
      } else {
        logger.info('No saved health monitor config found, using defaults');
      }
      this.configLoaded = true;
    } catch (error) {
      logger.error({ error }, 'Failed to load health monitor config from database, using defaults');
      this.configLoaded = true;
    }
  }

  /**
   * Save configuration to database
   */
  async saveConfigToDb(): Promise<void> {
    try {
      await settingsService.set(`${SETTINGS_PREFIX}.config`, JSON.stringify(this.config), 'json');
      logger.info('Health monitor config saved to database');
    } catch (error) {
      logger.error({ error }, 'Failed to save health monitor config to database');
    }
  }

  /**
   * Start the health monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('AlwaysOnHealthMonitor already running');
      return;
    }

    // Load config from database if not already loaded
    if (!this.configLoaded) {
      await this.loadConfigFromDb();
    }

    this.isRunning = true;
    this.startedAt = Date.now();
    logger.info({ 
      checkIntervalMs: this.config.checkIntervalMs,
      enableAudioChecks: this.config.enableAudioChecks,
      enableFrozenChecks: this.config.enableFrozenChecks,
      enableProcessMetrics: this.config.enableProcessMetrics,
    }, 'Starting AlwaysOnHealthMonitor');

    // Run initial check after a longer delay to let always-on streams fully start
    setTimeout(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Initial always-on health check failed')
      );
    }, 45000); // 45 second delay for streams to start

    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Always-on health check failed')
      );
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop the health monitor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    logger.info('AlwaysOnHealthMonitor stopped');
  }

  /**
   * Update configuration (also saves to database)
   */
  async updateConfig(newConfig: Partial<HealthCheckConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'AlwaysOnHealthMonitor config updated');
    
    // Save to database for persistence across restarts
    await this.saveConfigToDb();
    
    // Restart with new interval if running
    if (this.isRunning && this.checkInterval) {
      this.stop();
      await this.start();
    }
  }

  /**
   * Run health checks for always-on streams assigned to this server
   */
  async runHealthChecks(): Promise<void> {
    const startTime = Date.now();
    this.lastFullCheck = new Date();

    // Skip checks during startup grace period to avoid false negatives while streams register
    if (this.startedAt && Date.now() - this.startedAt < STARTUP_GRACE_PERIOD_MS) {
      logger.debug({ remainingMs: STARTUP_GRACE_PERIOD_MS - (Date.now() - this.startedAt) }, 'Startup grace period active, skipping health check run');
      return;
    }

    const currentServerId = config.multiServer.serverId;

    let streams: Array<{
      id: number;
      name: string;
      sourceUrl: string;
      ffmpegPid: number | null;
      streamStatus: string;
      customUserAgent: string | null;
    }>;

    // Track which streams are ORIGIN (tier 0) vs CHILD (tier > 0)
    // CHILD servers use HLS relay and don't have FFmpeg processes
    const streamRoles = new Map<number, { tier: number; role: string }>();

    if (currentServerId) {
      // Get always-on streams assigned to THIS server via StreamServerDistribution
      const distributions = await prisma.streamServerDistribution.findMany({
        where: {
          serverId: currentServerId,
          isActive: true,
          stream: {
            alwaysOn: true,
            isActive: true,
            streamType: 'LIVE',
          },
        },
        include: {
          stream: {
            select: {
              id: true,
              name: true,
              sourceUrl: true,
              ffmpegPid: true,
              streamStatus: true,
              customUserAgent: true,
            },
          },
        },
      });

      // Build role map and extract streams
      for (const d of distributions) {
        streamRoles.set(d.stream.id, { tier: d.tier, role: d.role });
      }
      streams = distributions.map(d => d.stream);

      const originCount = distributions.filter(d => d.tier === 0).length;
      const childCount = distributions.filter(d => d.tier > 0).length;

      logger.debug({
        serverId: currentServerId,
        count: streams.length,
        originCount,
        childCount,
      }, 'Running health checks for always-on streams assigned to this server');
    } else {
      // No SERVER_ID configured - this is the main/panel server
      // Don't monitor any always-on streams - edge servers handle them
      logger.debug('No SERVER_ID configured - skipping always-on health checks (edge servers handle these)');
      return;
    }

    if (streams.length === 0) {
      logger.debug('No always-on streams assigned to this server');
      return;
    }

    const results: HealthCheckResult[] = [];
    let healthyCount = 0;
    let unhealthyCount = 0;
    let restartedCount = 0;

    for (const stream of streams) {
      try {
        // Initialize or get stream state
        let state = this.streamStates.get(stream.id);
        if (!state) {
          state = {
            streamId: stream.id,
            name: stream.name,
            sourceUrl: stream.sourceUrl,
            pid: stream.ffmpegPid,
            consecutiveFailures: 0,
            lastRestartAt: null,
            restartCount: 0,
            lastCheckAt: null,
            issues: [],
            firstSeenAt: new Date(),
          };
          this.streamStates.set(stream.id, state);
        }

        // Skip streams currently being restarted by StreamLifecycleManager
        if (streamLifecycleManager.isStreamRestarting(stream.id)) {
          logger.debug({
            streamId: stream.id,
            name: stream.name,
          }, 'Stream is being restarted, skipping health check');
          continue;
        }

        // Check if this server is ORIGIN (tier 0) or CHILD (tier > 0) for this stream
        const streamRole = streamRoles.get(stream.id);
        const isOriginServer = streamRole?.tier === 0;
        const isChildServer = streamRole && streamRole.tier > 0;

        // Get PID from in-memory StreamLifecycleManager (more accurate than DB)
        const liveInstance = streamLifecycleManager.getStreamInstance(stream.id);
        const actualPid = liveInstance?.ffmpegPid ?? stream.ffmpegPid;

        // For ORIGIN servers: Skip streams that aren't in memory yet - they're still starting up
        // For CHILD servers: They use HLS relay and don't have FFmpeg processes, so skip this check
        if (isOriginServer && !liveInstance && !stream.ffmpegPid) {
          logger.debug({
            streamId: stream.id,
            name: stream.name,
          }, 'Stream not yet in memory, skipping health check (startup in progress)');
          continue;
        }

        // Update state with the most accurate PID (will be null for CHILD servers using relay)
        state.pid = isChildServer ? null : actualPid;
        state.sourceUrl = stream.sourceUrl;

        // Run health check - pass isChildServer flag to skip FFmpeg PID checks for relay servers
        const result = await this.checkStreamHealth(stream.id, stream.sourceUrl, isChildServer ? null : actualPid, stream.customUserAgent, isChildServer);
        results.push(result);

        state.lastCheckAt = new Date();
        state.issues = result.issues;

        if (result.success) {
          healthyCount++;
          state.consecutiveFailures = 0;
        } else {
          unhealthyCount++;
          state.consecutiveFailures++;

          // Log detailed issue information to help debug restart causes
          logger.warn({
            streamId: stream.id,
            name: stream.name,
            issues: result.issues.map(i => ({ type: i.type, message: i.message, severity: i.severity })),
            consecutiveFailures: state.consecutiveFailures,
            maxConsecutiveFailures: this.config.maxConsecutiveFailures,
            pid: state.pid,
            willRestartAt: state.consecutiveFailures >= this.config.maxConsecutiveFailures 
              ? `${this.config.maxConsecutiveFailures} failures reached` 
              : `${this.config.maxConsecutiveFailures - state.consecutiveFailures} more failures needed`,
          }, 'HEALTH_CHECK: Stream failed health check');
        }

        // Trigger restart if needed (AlwaysOnStreamManager no longer auto-restarts on close events)
        // Health monitor is now the ONLY system that triggers restarts, avoiding race conditions
        if (result.shouldRestart && this.shouldRestart(state)) {
          const restarted = await this.handleRestart(state);
          if (restarted) {
            restartedCount++;
          }
        }

        // Store status in Redis
        await this.saveStreamHealthStatus(state, result);

      } catch (error: any) {
        logger.error({ streamId: stream.id, error: error.message }, 'Error checking stream health');
      }
    }

    const duration = Date.now() - startTime;

    logger.info({
      total: streams.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      restarted: restartedCount,
      durationMs: duration,
    }, 'Always-on health check completed');

    this.emit('checkComplete', {
      total: streams.length,
      healthy: healthyCount,
      unhealthy: unhealthyCount,
      restarted: restartedCount,
      duration,
      results,
    });
  }

  /**
   * Check health of a single stream
   * 
   * @param streamId - Stream ID to check
   * @param sourceUrl - Source URL of the stream
   * @param pid - FFmpeg process PID (null for CHILD servers using HLS relay)
   * @param customUserAgent - Custom user agent for HTTP checks
   * @param isChildServer - True if this server is a CHILD (relay) server for this stream
   */
  private async checkStreamHealth(
    streamId: number,
    sourceUrl: string,
    pid: number | null,
    customUserAgent?: string | null,
    isChildServer: boolean = false
  ): Promise<HealthCheckResult> {
    const issues: HealthIssue[] = [];
    let shouldRestart = false;
    let metrics: ProcessMetrics | undefined;
    let audioStatus: AudioStatus | undefined;
    let videoStatus: VideoStatus | undefined;

    // 1. Check if process is running
    // SKIP this check for CHILD servers - they use HLS relay and don't have FFmpeg processes
    if (!isChildServer && !pid) {
      issues.push({
        type: 'process_unresponsive',
        message: 'No FFmpeg process PID found',
        timestamp: new Date(),
        severity: 'critical',
      });
      shouldRestart = true;
    } else if (!isChildServer && pid) {
      // 2. Check process metrics
      if (this.config.enableProcessMetrics) {
        const processMetrics = await getProcessMetrics(pid);
        
        if (!processMetrics) {
          issues.push({
            type: 'process_unresponsive',
            message: 'FFmpeg process not found or unresponsive',
            timestamp: new Date(),
            severity: 'critical',
          });
          shouldRestart = true;
        } else {
          metrics = processMetrics;

          // Check memory threshold
          if (processMetrics.memoryMb > this.config.memoryThresholdMb) {
            issues.push({
              type: 'high_memory',
              message: `Memory usage ${processMetrics.memoryMb.toFixed(0)}MB exceeds threshold ${this.config.memoryThresholdMb}MB`,
              timestamp: new Date(),
              severity: 'critical',
            });
            shouldRestart = true;
          }

          // Check CPU threshold (warning only, don't restart)
          if (processMetrics.cpuPercent > this.config.cpuThresholdPercent) {
            issues.push({
              type: 'high_cpu',
              message: `CPU usage ${processMetrics.cpuPercent.toFixed(1)}% exceeds threshold ${this.config.cpuThresholdPercent}%`,
              timestamp: new Date(),
              severity: 'warning',
            });
          }
        }
      }
    }

    // 3. Check HTTP stream reachability
    if (this.config.enableHttpChecks && !shouldRestart) {
      const httpCheck = await checkHttpStream(sourceUrl, this.config.probeTimeoutMs, customUserAgent);
      
      if (!httpCheck.online) {
        issues.push({
          type: httpCheck.error === 'Timeout' ? 'timeout' : 
                httpCheck.error === 'Connection refused' ? 'connection_lost' : 'http_error',
          message: httpCheck.error || 'Stream not reachable',
          timestamp: new Date(),
          severity: 'critical',
        });
        shouldRestart = true;
      }
    }

    // 4. Check HLS playlist/segments health
    if (!shouldRestart) {
      const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
      const playlistPath = path.join(hlsDir, 'playlist.m3u8');
      
      try {
        const stats = await fs.stat(playlistPath);
        const ageMs = Date.now() - stats.mtimeMs;
        
        // Playlist should be updated within 120 seconds for a healthy stream
        // (increased from 90s to reduce false positives during source issues)
        // (accounts for segment duration + encoding delay + network jitter + reconnection attempts + source buffering)
        if (ageMs > 120000) {
          issues.push({
            type: 'frozen_video',
            message: `HLS playlist not updated for ${(ageMs / 1000).toFixed(0)}s`,
            timestamp: new Date(),
            severity: 'critical',
          });
          shouldRestart = true;
        } else if (ageMs > 90000) {
          // Warning level for 90-120 seconds staleness
          issues.push({
            type: 'frozen_video',
            message: `HLS playlist getting stale (${(ageMs / 1000).toFixed(0)}s old)`,
            timestamp: new Date(),
            severity: 'warning',
          });
        }
      } catch {
        // Playlist doesn't exist - stream might be starting
        // Only log as warning, don't trigger restart (startup grace period)
        if (pid) {
          issues.push({
            type: 'missing_video',
            message: 'HLS playlist not found (may be starting)',
            timestamp: new Date(),
            severity: 'warning',
          });
        }
      }
    }

    // 5. Check for frozen video (expensive check, run very rarely - 5% of checks)
    // Only run if stream has been up for a while to avoid startup false positives
    const streamState = this.streamStates.get(streamId);
    const streamUptime = streamState ? Date.now() - streamState.firstSeenAt.getTime() : 0;
    const isStreamMature = streamUptime > STARTUP_GRACE_PERIOD_MS;
    
    if (this.config.enableFrozenChecks && !shouldRestart && isStreamMature && Math.random() < 0.05) {
      const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
      const playlistPath = path.join(hlsDir, 'playlist.m3u8');
      
      try {
        await fs.access(playlistPath);
        videoStatus = await isVideoFrozen(
          playlistPath,
          this.config.frozenDetectionDuration,
          this.config.frozenFrameThreshold
        );

        if (!videoStatus.hasVideo) {
          issues.push({
            type: 'missing_video',
            message: 'No video stream detected',
            timestamp: new Date(),
            severity: 'critical',
          });
          shouldRestart = true;
        } else if (videoStatus.isFrozen) {
          issues.push({
            type: 'frozen_video',
            message: 'Video stream appears frozen',
            timestamp: new Date(),
            severity: 'critical',
          });
          shouldRestart = true;
        }
      } catch {
        // Playlist not accessible
      }
    }

    // 6. Check for silent audio (expensive check, run very rarely - 3% of checks)
    // Only run if stream has been up for a while to avoid startup false positives
    if (this.config.enableAudioChecks && !shouldRestart && isStreamMature && Math.random() < 0.03) {
      const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
      const playlistPath = path.join(hlsDir, 'playlist.m3u8');
      
      try {
        await fs.access(playlistPath);
        audioStatus = await checkAudio(
          playlistPath,
          this.config.silentDetectionDuration,
          this.config.silentAudioThresholdDb
        );

        if (!audioStatus.hasAudio) {
          issues.push({
            type: 'missing_audio',
            message: 'No audio stream detected',
            timestamp: new Date(),
            severity: 'warning', // Not critical - some streams are video-only
          });
        } else if (audioStatus.isSilent) {
          issues.push({
            type: 'silent_audio',
            message: `Audio is silent (mean volume: ${audioStatus.meanVolume?.toFixed(1)}dB)`,
            timestamp: new Date(),
            severity: 'warning', // Not critical - might be intentional silence
          });
        }
      } catch {
        // Playlist not accessible
      }
    }

    return {
      streamId,
      success: issues.filter(i => i.severity === 'critical').length === 0,
      issues,
      shouldRestart,
      metrics,
      audioStatus,
      videoStatus,
    };
  }

  /**
   * Determine if a stream should be restarted based on state
   */
  private shouldRestart(state: StreamState): boolean {
    // Check startup grace period - don't restart streams that just started
    const timeSinceFirstSeen = Date.now() - state.firstSeenAt.getTime();
    if (timeSinceFirstSeen < STARTUP_GRACE_PERIOD_MS) {
      logger.debug({
        streamId: state.streamId,
        gracePeriodRemaining: STARTUP_GRACE_PERIOD_MS - timeSinceFirstSeen,
      }, 'Stream in startup grace period, skipping restart');
      return false;
    }

    // Check consecutive failures threshold
    if (state.consecutiveFailures < this.config.maxConsecutiveFailures) {
      return false;
    }

    // Check restart cooldown
    if (state.lastRestartAt) {
      const timeSinceRestart = Date.now() - state.lastRestartAt.getTime();
      if (timeSinceRestart < this.config.restartCooldownMs) {
        logger.debug({
          streamId: state.streamId,
          cooldownRemaining: this.config.restartCooldownMs - timeSinceRestart,
        }, 'Stream in restart cooldown');
        return false;
      }
    }

    return true;
  }

  /**
   * Handle stream restart
   */
  private async handleRestart(state: StreamState): Promise<boolean> {
    const timestamp = new Date();
    
    // Detailed logging to help debug restart causes
    logger.warn({
      streamId: state.streamId,
      name: state.name,
      consecutiveFailures: state.consecutiveFailures,
      previousRestarts: state.restartCount,
      lastRestartAt: state.lastRestartAt?.toISOString() || 'never',
      timeSinceLastRestart: state.lastRestartAt 
        ? `${Math.round((Date.now() - state.lastRestartAt.getTime()) / 1000)}s ago`
        : 'N/A',
      issues: state.issues.map(i => ({ type: i.type, message: i.message, severity: i.severity })),
      pid: state.pid,
      cooldownMs: this.config.restartCooldownMs,
      maxFailures: this.config.maxConsecutiveFailures,
    }, 'HEALTH_MONITOR: Initiating automatic stream restart');

    const success = await restartStream(state.streamId);

    if (success) {
      state.lastRestartAt = timestamp;
      state.restartCount++;
      state.consecutiveFailures = 0;
      state.issues = [];

      this.emit('streamRestarted', {
        streamId: state.streamId,
        name: state.name,
        restartCount: state.restartCount,
        timestamp,
      });
    } else {
      this.emit('restartFailed', {
        streamId: state.streamId,
        name: state.name,
        timestamp,
      });
    }

    return success;
  }

  /**
   * Save stream health status to Redis
   */
  private async saveStreamHealthStatus(state: StreamState, result: HealthCheckResult): Promise<void> {
    try {
      const status: StreamHealthStatus = {
        streamId: state.streamId,
        name: state.name,
        pid: state.pid,
        isHealthy: result.success,
        lastCheck: new Date(),
        consecutiveFailures: state.consecutiveFailures,
        lastRestartAt: state.lastRestartAt,
        restartCount: state.restartCount,
        issues: result.issues,
        metrics: result.metrics || null,
        audioStatus: result.audioStatus || null,
        videoStatus: result.videoStatus || null,
      };

      await redis.hset(
        'alwayson:health',
        state.streamId.toString(),
        JSON.stringify(status)
      );

      // Also set a TTL on individual health status
      await redis.setex(
        `alwayson:health:${state.streamId}`,
        300, // 5 minutes TTL
        JSON.stringify(status)
      );
    } catch (error) {
      // Log but don't crash on Redis errors
      logger.warn({ 
        streamId: state.streamId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to save stream health status to Redis');
    }
  }

  /**
   * Get health status for a specific stream
   */
  async getStreamHealthStatus(streamId: number): Promise<StreamHealthStatus | null> {
    try {
      const cached = await redis.get(`alwayson:health:${streamId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      logger.warn({ streamId, error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get stream health status from Redis');
    }

    const state = this.streamStates.get(streamId);
    if (!state) {
      return null;
    }

    return {
      streamId: state.streamId,
      name: state.name,
      pid: state.pid,
      isHealthy: state.consecutiveFailures === 0,
      lastCheck: state.lastCheckAt || new Date(),
      consecutiveFailures: state.consecutiveFailures,
      lastRestartAt: state.lastRestartAt,
      restartCount: state.restartCount,
      issues: state.issues,
      metrics: null,
      audioStatus: null,
      videoStatus: null,
    };
  }

  /**
   * Get health status for all always-on streams
   */
  async getAllHealthStatus(): Promise<StreamHealthStatus[]> {
    try {
      const allStatus = await redis.hgetall('alwayson:health');
      
      if (!allStatus || Object.keys(allStatus).length === 0) {
        return [];
      }

      return Object.values(allStatus).map((data) => JSON.parse(data as string));
    } catch (error) {
      logger.warn({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to get all health status from Redis');
      return [];
    }
  }

  /**
   * Get overall health statistics
   */
  async getHealthStats(): Promise<{
    total: number;
    healthy: number;
    unhealthy: number;
    totalRestarts: number;
    lastCheck: Date | null;
  }> {
    const allStatus = await this.getAllHealthStatus();

    return {
      total: allStatus.length,
      healthy: allStatus.filter(s => s.isHealthy).length,
      unhealthy: allStatus.filter(s => !s.isHealthy).length,
      totalRestarts: allStatus.reduce((sum, s) => sum + s.restartCount, 0),
      lastCheck: this.lastFullCheck,
    };
  }

  /**
   * Force a health check for a specific stream
   */
  async forceCheck(streamId: number): Promise<HealthCheckResult | null> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        id: true,
        name: true,
        sourceUrl: true,
        ffmpegPid: true,
      },
    });

    if (!stream) {
      return null;
    }

    return this.checkStreamHealth(stream.id, stream.sourceUrl, stream.ffmpegPid);
  }

  /**
   * Get current configuration
   */
  getConfig(): HealthCheckConfig {
    return { ...this.config };
  }

  /**
   * Check if monitor is running
   */
  isMonitorRunning(): boolean {
    return this.isRunning;
  }
}

// Export singleton instance
export const alwaysOnHealthMonitor = new AlwaysOnHealthMonitor();


