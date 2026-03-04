import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { AbrProfile, EncodingMode } from '@prisma/client';
import { getStreamingConfig, getBufferSizeKbits, StreamingConfig } from './StreamingSettings.js';
import { forceKill } from '../../utils/process.js';

// Constants for viewer tracking and cleanup
const ABR_VIEWER_TTL_SECONDS = 30; // Viewer heartbeat TTL
const ABR_IDLE_TIMEOUT_MS = 30000; // Stop stream after 30 seconds of no viewers
const ABR_CLEANUP_INTERVAL_MS = 5000; // Check every 5 seconds

interface AbrVariant {
  name: string;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
  maxBitrate?: number;
}

interface AbrStreamInstance {
  streamId: number;
  ffmpegPids: number[];
  processes: ChildProcess[];
  outputDir: string;
  sourceUrl: string;
  profile: AbrProfile;
  variants: AbrVariant[];
  startedAt: Date;
  restartCount: number;
  lastViewerAt: Date;
  stopTimer: NodeJS.Timeout | null;
}

/**
 * AbrStreamManager - Manages Adaptive Bitrate (multi-quality) HLS streams
 * 
 * Creates multiple quality variants of a stream and a master playlist
 * that allows players to switch between qualities based on bandwidth.
 */
export class AbrStreamManager extends EventEmitter {
  private runningStreams: Map<number, AbrStreamInstance> = new Map();
  private startingStreams: Map<number, Promise<AbrStreamInstance>> = new Map();
  private readonly hlsBasePath: string;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.hlsBasePath = config.ffmpeg.hlsSegmentPath;
  }

  /**
   * Start the manager - begins periodic cleanup checks
   */
  start(): void {
    if (this.cleanupInterval) return;
    
    this.cleanupInterval = setInterval(() => {
      this.checkIdleStreams();
    }, ABR_CLEANUP_INTERVAL_MS);

    logger.info('AbrStreamManager started with idle stream cleanup');
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
    for (const instance of this.runningStreams.values()) {
      if (instance.stopTimer) {
        clearTimeout(instance.stopTimer);
      }
    }

    logger.info('AbrStreamManager stopped');
  }

  /**
   * Start an ABR stream with the specified profile
   */
  async startAbrStream(streamId: number, abrProfileId: number, sourceUrl?: string): Promise<AbrStreamInstance> {
    // Check if already running
    const existing = this.runningStreams.get(streamId);
    if (existing) {
      logger.warn({ streamId }, 'ABR stream already running, returning existing instance');
      return existing;
    }

    // Check if currently starting (race condition prevention)
    const pendingStart = this.startingStreams.get(streamId);
    if (pendingStart) {
      logger.warn({ streamId }, 'ABR stream is already being started, waiting for completion');
      return pendingStart;
    }

    // Create and track the start promise
    const startPromise = this.doStartAbrStream(streamId, abrProfileId, sourceUrl);
    this.startingStreams.set(streamId, startPromise);

    try {
      const instance = await startPromise;
      return instance;
    } finally {
      this.startingStreams.delete(streamId);
    }
  }

  /**
   * Internal method to start ABR stream
   */
  private async doStartAbrStream(
    streamId: number,
    abrProfileId: number,
    sourceUrl?: string
  ): Promise<AbrStreamInstance> {
    // Get ABR profile
    const abrProfile = await prisma.abrProfile.findUnique({
      where: { id: abrProfileId },
    });

    if (!abrProfile) {
      throw new Error(`ABR profile ${abrProfileId} not found`);
    }

    // Get stream from database
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    const streamSourceUrl = sourceUrl || stream.sourceUrl;
    if (!streamSourceUrl) {
      throw new Error(`No source URL for stream ${streamId}`);
    }

    // Parse variants from JSON (may be string, array, or Prisma JsonValue)
    let variants: AbrVariant[];
    if (typeof abrProfile.variants === 'string') {
      variants = JSON.parse(abrProfile.variants);
    } else if (Array.isArray(abrProfile.variants)) {
      // Cast from Prisma JsonValue array to AbrVariant array
      variants = abrProfile.variants as unknown as AbrVariant[];
    } else {
      variants = [];
    }
    
    if (!variants || variants.length === 0) {
      throw new Error(`ABR profile ${abrProfileId} has no variants configured`);
    }

    // Create output directory
    const outputDir = path.join(this.hlsBasePath, `stream_${streamId}`);
    await fs.mkdir(outputDir, { recursive: true });

    // Update status to STARTING
    await prisma.stream.update({
      where: { id: streamId },
      data: { streamStatus: 'STARTING' },
    });

    logger.info({
      streamId,
      profileId: abrProfileId,
      profileName: abrProfile.name,
      variants: variants.map(v => v.name),
    }, 'Starting ABR stream');

    try {
      // Determine custom User-Agent (from stream setting)
      const customUserAgent = stream.customUserAgent || null;

      // Load streaming config from settings
      const streamingConfig = await getStreamingConfig();

      // Build and spawn FFmpeg command for all variants
      const { process: ffmpegProcess, pid } = await this.spawnAbrFfmpeg(
        streamSourceUrl,
        outputDir,
        abrProfile,
        variants,
        customUserAgent,
        streamingConfig,
        stream.analyzeDuration ?? undefined,
        stream.probeSize ?? undefined
      );

      // Create master playlist
      await this.createMasterPlaylist(outputDir, variants, abrProfile);

      // Create instance
      const instance: AbrStreamInstance = {
        streamId,
        ffmpegPids: [pid],
        processes: [ffmpegProcess],
        outputDir,
        sourceUrl: streamSourceUrl,
        profile: abrProfile,
        variants,
        startedAt: new Date(),
        restartCount: 0,
        lastViewerAt: new Date(),
        stopTimer: null,
      };

      // Store in memory
      this.runningStreams.set(streamId, instance);

      // Update database
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          ffmpegPid: pid,
          streamStatus: 'RUNNING',
          lastStartedAt: new Date(),
          lastError: null,
        },
      });

      // Setup process handlers
      this.setupProcessHandlers(instance, ffmpegProcess);

      // Wait for master playlist to be ready
      await this.waitForPlaylist(path.join(outputDir, 'master.m3u8'));

      logger.info({
        streamId,
        pid,
        variants: variants.length,
      }, 'ABR stream started successfully');

      this.emit('abr:started', { streamId, variants: variants.map(v => v.name) });

      return instance;
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to start ABR stream');
      
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          streamStatus: 'ERROR',
          lastError: error.message,
        },
      });

      throw error;
    }
  }

  /**
   * Spawn FFmpeg process for ABR encoding with all variants
   */
  private async spawnAbrFfmpeg(
    sourceUrl: string,
    outputDir: string,
    profile: AbrProfile,
    variants: AbrVariant[],
    customUserAgent: string | null,
    streamingConfig: StreamingConfig,
    analyzeDuration?: number,
    probeSize?: number
  ): Promise<{ process: ChildProcess; pid: number }> {
    const args = this.buildAbrFfmpegCommand(sourceUrl, outputDir, profile, variants, customUserAgent, streamingConfig, analyzeDuration, probeSize);

    logger.debug({
      command: `${config.ffmpeg.path} ${args.join(' ')}`,
    }, 'ABR FFmpeg command');

    const ffmpegProcess = spawn(config.ffmpeg.path, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    if (!ffmpegProcess.pid) {
      throw new Error('Failed to spawn FFmpeg process');
    }

    return { process: ffmpegProcess, pid: ffmpegProcess.pid };
  }

  /**
   * Build FFmpeg command for ABR encoding
   * Uses filter_complex to create multiple outputs from single input
   */
  private buildAbrFfmpegCommand(
    sourceUrl: string,
    outputDir: string,
    profile: AbrProfile,
    variants: AbrVariant[],
    customUserAgent: string | null,
    streamingConfig: StreamingConfig,
    analyzeDuration?: number,
    probeSize?: number
  ): string[] {
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      // Threading - use all available cores
      '-threads', '0',
      // Reconnection settings
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      // Input buffer tuning - optimized for low latency with A/V sync
      '-fflags', '+genpts+discardcorrupt+fastseek',
      '-flags', 'low_delay',
      // Stream detection - balanced for fast startup + sync
      '-analyzeduration', String(analyzeDuration || 1000000),  // 1s default
      '-probesize', String(probeSize || 1000000),              // 1MB default
      // Flush packets immediately for lower latency
      '-flush_packets', '1',
    ];

    // Add custom User-Agent if specified
    if (customUserAgent) {
      args.push('-user_agent', customUserAgent);
    }

    // Add hardware acceleration if needed
    if (profile.encodingMode === 'NVENC' && profile.nvencEnabled) {
      args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
    } else if (profile.encodingMode === 'QSV' && profile.qsvEnabled) {
      args.push('-hwaccel', 'qsv', '-qsv_device', '/dev/dri/renderD128');
    } else if (profile.encodingMode === 'VAAPI' && profile.vaapiEnabled) {
      const vaapiDevice = profile.vaapiDevice || '/dev/dri/renderD128';
      args.push('-vaapi_device', vaapiDevice);
    }

    // Input
    args.push('-i', sourceUrl);

    // Build filter_complex for scaling to different resolutions
    // We need to split the input first, then scale each copy
    const filterParts: string[] = [];
    
    // First, split the video stream into N copies (one for each variant)
    const splitOutputs = variants.map((_, i) => `[v${i}split]`).join('');
    
    if (profile.encodingMode === 'NVENC' && profile.nvencEnabled) {
      // For CUDA, split first then scale each
      filterParts.push(`[0:v]split=${variants.length}${splitOutputs}`);
      variants.forEach((variant, index) => {
        filterParts.push(`[v${index}split]scale_cuda=${variant.width}:${variant.height}[v${index}]`);
      });
    } else if (profile.encodingMode === 'VAAPI' && profile.vaapiEnabled) {
      // For VAAPI, split first then scale each
      filterParts.push(`[0:v]split=${variants.length}${splitOutputs}`);
      variants.forEach((variant, index) => {
        filterParts.push(`[v${index}split]format=nv12,hwupload,scale_vaapi=w=${variant.width}:h=${variant.height}[v${index}]`);
      });
    } else {
      // Software scaling - split first, then optionally deinterlace and scale each copy
      filterParts.push(`[0:v]split=${variants.length}${splitOutputs}`);
      variants.forEach((variant, index) => {
        // Use yadif only if needed (deint=1 means only deinterlace if interlaced)
        filterParts.push(`[v${index}split]yadif=mode=0:parity=-1:deint=1,scale=${variant.width}:${variant.height}:flags=lanczos[v${index}]`);
      });
    }

    args.push('-filter_complex', filterParts.join(';'));

    // Add encoding settings for each variant
    variants.forEach((variant, index) => {
      // Map video
      args.push('-map', `[v${index}]`);
      // Map audio (same for all variants) - use '0:a?' to make audio optional
      args.push('-map', '0:a?');
    });

    // Add global preset and tune for software encoding (applies to all streams)
    if (profile.encodingMode === 'SOFTWARE' || 
        (!profile.nvencEnabled && !profile.qsvEnabled && !profile.vaapiEnabled)) {
      args.push('-preset', profile.videoPreset || 'fast');
      if (profile.videoCodec !== 'h265') {
        args.push('-tune', 'zerolatency');
      }
      // Force keyframes at segment boundaries for clean ABR switching
      const hlsTime = profile.hlsSegmentDuration || streamingConfig.hlsSegmentDuration;
      args.push('-force_key_frames', `expr:gte(t,n_forced*${hlsTime})`);
    }

    // Get buffer size from settings
    const bufferSizeKb = getBufferSizeKbits(streamingConfig);
    const maxBitrate = streamingConfig.maxBitrate;

    // Video encoding settings for each variant
    variants.forEach((variant, index) => {
      const streamIndex = index;
      
      // Video codec
      if (profile.encodingMode === 'NVENC' && profile.nvencEnabled) {
        args.push(`-c:v:${streamIndex}`, profile.videoCodec === 'h265' ? 'hevc_nvenc' : 'h264_nvenc');
        if (profile.nvencPreset) {
          args.push('-preset', profile.nvencPreset);
        }
      } else if (profile.encodingMode === 'QSV' && profile.qsvEnabled) {
        args.push(`-c:v:${streamIndex}`, profile.videoCodec === 'h265' ? 'hevc_qsv' : 'h264_qsv');
      } else if (profile.encodingMode === 'VAAPI' && profile.vaapiEnabled) {
        args.push(`-c:v:${streamIndex}`, profile.videoCodec === 'h265' ? 'hevc_vaapi' : 'h264_vaapi');
      } else {
        // Software encoding
        const codec = profile.videoCodec === 'h265' ? 'libx265' : 'libx264';
        args.push(`-c:v:${streamIndex}`, codec);
      }

      // Bitrate - use variant maxBitrate or fall back to settings
      args.push(`-b:v:${streamIndex}`, `${variant.videoBitrate}k`);
      const variantMaxBitrate = variant.maxBitrate || maxBitrate;
      args.push(`-maxrate:v:${streamIndex}`, `${variantMaxBitrate}k`);
      args.push(`-bufsize:v:${streamIndex}`, `${bufferSizeKb}k`);

      // GOP size
      args.push(`-g:v:${streamIndex}`, String(profile.gopSize || 60));
      
      // B-frames
      if (profile.bFrames !== null && profile.bFrames !== undefined) {
        args.push(`-bf:v:${streamIndex}`, String(profile.bFrames));
      }
    });

    // Audio encoding (same settings for all variants)
    variants.forEach((variant, index) => {
      const audioCodec = profile.audioCodec === 'opus' ? 'libopus' :
                         profile.audioCodec === 'mp3' ? 'libmp3lame' : 'aac';
      args.push(`-c:a:${index}`, audioCodec);
      args.push(`-b:a:${index}`, `${variant.audioBitrate}k`);
      args.push(`-ar:a:${index}`, String(profile.audioSampleRate || 48000));
      args.push(`-ac:a:${index}`, String(profile.audioChannels || 2));
    });

    // HLS output settings from streaming config (profile overrides settings)
    const hlsTime = profile.hlsSegmentDuration || streamingConfig.hlsSegmentDuration;
    const hlsListSize = profile.hlsPlaylistSize || streamingConfig.hlsPlaylistLength;

    // Create variant stream map
    const varStreamMap = variants.map((_, i) => `v:${i},a:${i}`).join(' ');

    // HLS output settings with fMP4 for LOW LATENCY streaming
    // 
    // Low-latency optimizations:
    // 1. Short segments (1s default) - faster first segment delivery
    // 2. Short init time (0.2s) - faster initial playback
    // 3. temp_file flag - segment available as soon as written
    // 4. fMP4 with frag_keyframe - allows partial segment playback
    // 5. program_date_time - enables player sync and catch-up
    // 6. split_by_time - ensures segments are exactly hls_time duration
    //
    // Expected latency: segment_duration × (playlist_length + 1) + ~2s encoding
    // With 1s × 4 + 2s = ~6-8 seconds (vs 30s with 6s × 5)
    args.push(
      '-f', 'hls',
      '-hls_time', String(hlsTime),
      '-hls_init_time', '0.2',  // Very short initial segment (200ms) for fastest startup
      '-hls_list_size', String(hlsListSize),
      // HLS flags for low-latency streaming:
      // - temp_file: segment is available immediately when complete
      // - program_date_time: enables player sync and live edge detection
      // - independent_segments: allows players to start from any segment
      // - split_by_time: ensures segments are exactly hls_time duration
      '-hls_flags', 'delete_segments+append_list+independent_segments+temp_file+omit_endlist+program_date_time+split_by_time',
      '-hls_segment_type', 'fmp4',  // Use fragmented MP4 for faster startup
      '-hls_fmp4_init_filename', 'init.mp4',
      // fMP4 flags for low-latency:
      // - frag_keyframe: new fragment at each keyframe (enables partial playback)
      // - empty_moov: no samples in moov (faster init)
      // - default_base_moof: required for fMP4 HLS
      // - negative_cts_offsets: better B-frame handling
      '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof+negative_cts_offsets',
      '-hls_allow_cache', '0',   // Disable caching for live streams
      '-hls_start_number_source', 'epoch',
      '-master_pl_name', 'master.m3u8',
      '-var_stream_map', varStreamMap,
      // Use %d instead of %05d when using epoch timestamps (epoch numbers are 10 digits, not 5)
      '-hls_segment_filename', path.join(outputDir, 'stream_%v/segment_%d.m4s'),
      path.join(outputDir, 'stream_%v/playlist.m3u8')
    );

    return args;
  }

  /**
   * Create master playlist with bandwidth and resolution info
   */
  private async createMasterPlaylist(
    outputDir: string,
    variants: AbrVariant[],
    profile: AbrProfile
  ): Promise<void> {
    const lines: string[] = ['#EXTM3U', '#EXT-X-VERSION:7'];

    variants.forEach((variant, index) => {
      const bandwidth = (variant.videoBitrate + variant.audioBitrate) * 1000;
      const resolution = `${variant.width}x${variant.height}`;
      
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution},NAME="${variant.name}"`,
        `stream_${index}/playlist.m3u8`
      );
    });

    const masterContent = lines.join('\n') + '\n';
    
    // Create directories for each variant
    for (let i = 0; i < variants.length; i++) {
      await fs.mkdir(path.join(outputDir, `stream_${i}`), { recursive: true });
    }

    // Write master playlist (FFmpeg will also create one, but we create it early for faster startup)
    await fs.writeFile(path.join(outputDir, 'master.m3u8'), masterContent);
    
    logger.debug({ outputDir, variants: variants.length }, 'Master playlist created');
  }

  /**
   * Stop an ABR stream
   */
  async stopAbrStream(streamId: number, cleanup: boolean = true): Promise<void> {
    logger.info({ streamId, cleanup }, 'Stopping ABR stream');

    const instance = this.runningStreams.get(streamId);

    try {
      if (instance) {
        // Kill all FFmpeg processes
        for (const process of instance.processes) {
          await this.killProcess(process);
        }
        this.runningStreams.delete(streamId);
      }

      // Also check database for PID
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { ffmpegPid: true },
      });

      if (stream?.ffmpegPid) {
        this.killProcessByPid(stream.ffmpegPid);
      }

      // Clean up directory if requested
      if (cleanup) {
        const outputDir = path.join(this.hlsBasePath, `stream_${streamId}`);
        await fs.rm(outputDir, { recursive: true, force: true });
      }

      // Update database
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          ffmpegPid: null,
          streamStatus: 'STOPPED',
          lastStoppedAt: new Date(),
        },
      });

      logger.info({ streamId }, 'ABR stream stopped successfully');
      this.emit('abr:stopped', { streamId });
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Error stopping ABR stream');
      throw error;
    }
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(instance: AbrStreamInstance, process: ChildProcess): void {
    const { streamId } = instance;

    process.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Only log actual errors, not progress info
      if (message.includes('Error') || message.includes('error') ||
          message.includes('Connection refused') || message.includes('Connection timed out')) {
        logger.error({ streamId, message }, 'ABR FFmpeg error');
        this.emit('abr:error', { streamId, error: message });
      }
    });

    process.on('close', async (code) => {
      logger.info({ streamId, code }, 'ABR FFmpeg process closed');
      
      this.runningStreams.delete(streamId);
      
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          ffmpegPid: null,
          streamStatus: code === 0 ? 'STOPPED' : 'ERROR',
          lastError: code !== 0 ? `FFmpeg exited with code ${code}` : null,
        },
      });

      this.emit('abr:closed', { streamId, code });
    });

    process.on('error', async (err) => {
      logger.error({ streamId, error: err }, 'ABR FFmpeg process error');
      
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          streamStatus: 'ERROR',
          lastError: err.message,
        },
      });

      this.emit('abr:error', { streamId, error: err.message });
    });
  }

  /**
   * Kill FFmpeg process gracefully
   */
  private async killProcess(process: ChildProcess): Promise<void> {
    return new Promise((resolve) => {
      if (!process || process.killed) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        try {
          process.kill('SIGKILL');
        } catch {
          // Process already dead
        }
        resolve();
      }, 5000);

      process.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });

      try {
        process.kill('SIGTERM');
      } catch {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  /**
   * Kill process by PID.
   * Uses safe process.kill() instead of shell exec to prevent command injection.
   */
  private killProcessByPid(pid: number): void {
    forceKill(pid);
  }

  /**
   * Wait for playlist file to be created
   */
  private async waitForPlaylist(playlistPath: string, timeout: number = 30000): Promise<void> {
    const start = Date.now();
    let pollInterval = 100; // Start with faster polling

    while (Date.now() - start < timeout) {
      try {
        await fs.access(playlistPath);
        // Verify playlist has content
        const content = await fs.readFile(playlistPath, 'utf-8');
        if (content.includes('.m3u8') || content.includes('.ts')) {
          return;
        }
      } catch {
        // File doesn't exist yet
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      // Gradually increase poll interval to reduce CPU usage
      pollInterval = Math.min(pollInterval + 50, 500);
    }

    throw new Error(`Playlist not created within ${timeout}ms`);
  }

  /**
   * Check if ABR stream is running
   */
  isAbrStreamRunning(streamId: number): boolean {
    return this.runningStreams.has(streamId) || this.startingStreams.has(streamId);
  }

  /**
   * Get the current ABR profile ID for a running stream
   */
  getRunningProfileId(streamId: number): number | null {
    const instance = this.runningStreams.get(streamId);
    return instance ? instance.profile.id : null;
  }

  /**
   * Restart an ABR stream with a new profile
   * Kills the current FFmpeg process and starts a new one with the new profile
   */
  async restartWithNewProfile(streamId: number, newAbrProfileId: number, sourceUrl?: string): Promise<AbrStreamInstance | null> {
    const existing = this.runningStreams.get(streamId);
    
    // If not running, just start with the new profile
    if (!existing) {
      logger.info({ streamId, newAbrProfileId }, 'Stream not running, starting with new ABR profile');
      return this.startAbrStream(streamId, newAbrProfileId, sourceUrl);
    }

    // If same profile, no need to restart
    if (existing.profile.id === newAbrProfileId) {
      logger.debug({ streamId, profileId: newAbrProfileId }, 'ABR profile unchanged, skipping restart');
      return existing;
    }

    logger.info({ 
      streamId, 
      oldProfileId: existing.profile.id, 
      newProfileId: newAbrProfileId 
    }, 'Restarting ABR stream with new profile');

    // Stop the current stream (cleanup HLS files since we'll regenerate them)
    await this.stopAbrStream(streamId, true);

    // Start with the new profile
    return this.startAbrStream(streamId, newAbrProfileId, sourceUrl || existing.sourceUrl);
  }

  /**
   * Get ABR stream instance
   */
  getAbrStreamInstance(streamId: number): AbrStreamInstance | undefined {
    return this.runningStreams.get(streamId);
  }

  /**
   * Get all running ABR stream IDs
   */
  getRunningAbrStreamIds(): number[] {
    return Array.from(this.runningStreams.keys());
  }

  // ==================== VIEWER TRACKING ====================

  /**
   * Register a viewer for an ABR stream
   * Call this when a client requests the master playlist
   */
  async registerViewer(streamId: number, viewerId: string): Promise<void> {
    // Always track viewer in Redis with TTL, even if instance not in memory
    // This handles cases where server restarted but FFmpeg is still running
    const viewerKey = `abr:${streamId}:viewer:${viewerId}`;
    await redis.setex(viewerKey, ABR_VIEWER_TTL_SECONDS, Date.now().toString());

    // Update in-memory instance if it exists
    const instance = this.runningStreams.get(streamId);
    if (instance) {
      // Cancel any pending stop timer
      if (instance.stopTimer) {
        clearTimeout(instance.stopTimer);
        instance.stopTimer = null;
      }
      instance.lastViewerAt = new Date();
    }

    logger.debug({ streamId, viewerId }, 'ABR viewer registered');
  }

  /**
   * Refresh viewer heartbeat - call this on segment requests
   */
  async refreshViewer(streamId: number, viewerId: string): Promise<void> {
    const viewerKey = `abr:${streamId}:viewer:${viewerId}`;
    
    // Check if key exists first
    const exists = await redis.exists(viewerKey);
    if (exists) {
      await redis.expire(viewerKey, ABR_VIEWER_TTL_SECONDS);
    } else {
      // Re-register the viewer
      await redis.setex(viewerKey, ABR_VIEWER_TTL_SECONDS, Date.now().toString());
    }

    // Update last viewer time in memory
    const instance = this.runningStreams.get(streamId);
    if (instance) {
      instance.lastViewerAt = new Date();
      // Cancel any pending stop timer
      if (instance.stopTimer) {
        clearTimeout(instance.stopTimer);
        instance.stopTimer = null;
      }
    }
  }

  /**
   * Unregister a viewer from an ABR stream
   */
  async unregisterViewer(streamId: number, viewerId: string): Promise<void> {
    const viewerKey = `abr:${streamId}:viewer:${viewerId}`;
    await redis.del(viewerKey);

    logger.debug({ streamId, viewerId }, 'ABR viewer unregistered');

    // Cleanup associated HLS connection (fire-and-forget)
    this.cleanupHlsConnection(viewerId);

    // Check if there are still viewers
    const viewerCount = await this.getViewerCount(streamId);
    if (viewerCount === 0) {
      this.scheduleStop(streamId);
    }
  }

  /**
   * Get viewer count for an ABR stream
   */
  async getViewerCount(streamId: number): Promise<number> {
    const keys = await redis.keys(`abr:${streamId}:viewer:*`);
    return keys.length;
  }

  /**
   * Schedule stream stop after timeout
   */
  private scheduleStop(streamId: number): void {
    const instance = this.runningStreams.get(streamId);
    if (!instance) return;

    // Clear any existing timer
    if (instance.stopTimer) {
      clearTimeout(instance.stopTimer);
    }

    logger.info({ streamId, timeoutMs: ABR_IDLE_TIMEOUT_MS }, 'Scheduling ABR stream stop due to no viewers');

    instance.stopTimer = setTimeout(async () => {
      await this.stopStreamIfNoViewers(streamId);
    }, ABR_IDLE_TIMEOUT_MS);
  }

  /**
   * Stop stream if there are still no viewers
   */
  private async stopStreamIfNoViewers(streamId: number): Promise<void> {
    const instance = this.runningStreams.get(streamId);
    if (!instance) return;

    // Double-check viewer count
    const viewerCount = await this.getViewerCount(streamId);

    if (viewerCount > 0) {
      logger.debug({ streamId, viewerCount }, 'ABR stream has viewers, not stopping');
      instance.stopTimer = null;
      return;
    }

    // Check if stream is always-on
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { alwaysOn: true },
    });

    if (stream?.alwaysOn) {
      logger.debug({ streamId }, 'ABR stream is always-on, not stopping');
      instance.stopTimer = null;
      return;
    }

    logger.info({ streamId }, 'Stopping ABR stream due to no viewers');

    try {
      await this.stopAbrStream(streamId, true);
      
      // Clean up any stale viewer keys
      const keys = await redis.keys(`abr:${streamId}:viewer:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }

      this.emit('abr:stopped', { streamId, reason: 'no_viewers' });
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to stop idle ABR stream');
      instance.stopTimer = null;
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
   * Cleanup all HLS connections associated with an ABR stream
   */
  private async cleanupAllHlsConnectionsForStream(streamId: number): Promise<void> {
    try {
      const viewerKeys = await redis.keys(`abr:${streamId}:viewer:*`);
      const viewerIds = viewerKeys.map(key => {
        const parts = key.split(':');
        return parts[parts.length - 1];
      });

      if (viewerIds.length === 0) return;

      logger.debug({ streamId, viewerCount: viewerIds.length }, 'Cleaning up HLS connections for stopped ABR stream');

      const { cleanupHlsConnectionByViewerId } = await import('../../api/middlewares/auth.js');
      await Promise.all(
        viewerIds.map(viewerId => 
          cleanupHlsConnectionByViewerId(viewerId).catch(() => {})
        )
      );
    } catch (err) {
      logger.debug({ err, streamId }, 'Failed to cleanup HLS connections for ABR stream');
    }
  }

  /**
   * Check for idle ABR streams and stop them
   */
  private async checkIdleStreams(): Promise<void> {
    const now = Date.now();

    for (const [streamId, instance] of this.runningStreams) {
      // Skip if already has a stop timer pending
      if (instance.stopTimer) continue;

      // Get viewer count from Redis
      const viewerCount = await this.getViewerCount(streamId);

      if (viewerCount === 0) {
        const idleTime = now - instance.lastViewerAt.getTime();
        
        if (idleTime >= ABR_IDLE_TIMEOUT_MS) {
          logger.info({ streamId, idleTime }, 'Idle ABR stream detected, stopping immediately');
          await this.stopStreamIfNoViewers(streamId);
        } else if (!instance.stopTimer) {
          // Schedule stop for remaining time
          const remainingTime = ABR_IDLE_TIMEOUT_MS - idleTime;
          logger.debug({ streamId, remainingTime }, 'Scheduling ABR stream stop');
          
          instance.stopTimer = setTimeout(async () => {
            await this.stopStreamIfNoViewers(streamId);
          }, remainingTime);
        }
      }
    }
  }

  /**
   * Get debug info about ABR streams
   */
  getDebugInfo(): {
    runningStreams: number;
    streams: Array<{
      streamId: number;
      startedAt: Date;
      lastViewerAt: Date;
      hasStopTimer: boolean;
      variants: string[];
    }>;
  } {
    const streams = Array.from(this.runningStreams.values()).map(instance => ({
      streamId: instance.streamId,
      startedAt: instance.startedAt,
      lastViewerAt: instance.lastViewerAt,
      hasStopTimer: !!instance.stopTimer,
      variants: instance.variants.map(v => v.name),
    }));

    return {
      runningStreams: this.runningStreams.size,
      streams,
    };
  }

  /**
   * Stop all ABR streams
   */
  async stopAllAbrStreams(): Promise<void> {
    const streamIds = this.getRunningAbrStreamIds();
    
    await Promise.all(
      streamIds.map(id => this.stopAbrStream(id, true).catch(err => {
        logger.error({ streamId: id, error: err }, 'Error stopping ABR stream');
      }))
    );
  }
}

// Export singleton instance
export const abrStreamManager = new AbrStreamManager();
export default abrStreamManager;
