import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { streamSourceManager } from './StreamSourceManager.js';
import { TranscodingProfile, EncodingMode } from '@prisma/client';
import { getStreamingConfig, getBufferSizeKbits, StreamingConfig } from './StreamingSettings.js';

export interface HLSOptions {
  segmentDuration?: number;
  listSize?: number;
  deleteSegments: boolean;
  enableFailover: boolean;
  maxRestarts: number;
  transcodingProfile?: TranscodingProfile | null;
  // Per-stream FFmpeg input tuning
  analyzeDuration?: number; // in microseconds (default: 500000 = 0.5s)
  probeSize?: number;       // in bytes (default: 1000000 = 1MB)
}

export class HLSSegmenter extends EventEmitter {
  private ffmpeg: ChildProcess | null = null;
  private outputDir: string;
  private streamId: number;
  private options: HLSOptions;
  private streamingConfig: StreamingConfig | null = null;
  private isRunning: boolean = false;
  private currentSourceUrl: string = '';
  private restartCount: number = 0;
  private lastRestartTime: number = 0;
  private isRestarting: boolean = false;

  constructor(
    streamId: number,
    options: Partial<HLSOptions> = {}
  ) {
    super();
    this.streamId = streamId;
    this.outputDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
    this.options = {
      segmentDuration: options.segmentDuration, // Will use settings if not provided
      listSize: options.listSize, // Will use settings if not provided
      deleteSegments: options.deleteSegments !== false,
      enableFailover: options.enableFailover !== false,
      maxRestarts: options.maxRestarts || 5,
      transcodingProfile: options.transcodingProfile || null,
    };
  }

  async start(sourceUrl: string): Promise<void> {
    if (this.isRunning) {
      logger.warn({ streamId: this.streamId }, 'HLS segmenter already running');
      return;
    }

    this.currentSourceUrl = sourceUrl;

    // Load streaming config from settings
    this.streamingConfig = await getStreamingConfig();

    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });

    const playlistPath = path.join(this.outputDir, 'playlist.m3u8');
    // Use %d instead of %05d when using epoch timestamps (epoch numbers are 10 digits, not 5)
    const segmentPattern = path.join(this.outputDir, 'segment_%d.ts');

    // Build FFmpeg arguments based on transcoding profile
    const args = this.buildFfmpegArgs(sourceUrl, playlistPath, segmentPattern);

    const profile = this.options.transcodingProfile;
    logger.info({ 
      streamId: this.streamId, 
      sourceUrl,
      profile: profile?.name || 'passthrough (default)',
      encodingMode: profile?.encodingMode || 'PASSTHROUGH',
      hlsSegmentDuration: this.streamingConfig.hlsSegmentDuration,
      hlsPlaylistLength: this.streamingConfig.hlsPlaylistLength,
    }, 'Starting HLS segmenter');

    this.ffmpeg = spawn(config.ffmpeg.path, args);
    this.isRunning = true;

    // Register with source manager for failover
    if (this.options.enableFailover) {
      streamSourceManager.registerStream(this.streamId, 0, (newUrl) => {
        this.handleFailover(newUrl);
      });
      streamSourceManager.setStreamProcess(this.streamId, this.ffmpeg);
    }

    this.ffmpeg.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      if (message.includes('Error') || message.includes('error') || 
          message.includes('Connection refused') || message.includes('Connection timed out') ||
          message.includes('Server returned') || message.includes('HTTP error')) {
        logger.error({ streamId: this.streamId, message }, 'HLS FFmpeg error');
        this.emit('error', new Error(message));
        
        // Report failure for potential failover
        if (this.options.enableFailover) {
          streamSourceManager.reportSourceFailure(this.streamId, message);
        }
      } else {
        this.emit('log', message);
      }
    });

    this.ffmpeg.on('close', (code) => {
      this.isRunning = false;
      logger.info({ streamId: this.streamId, code }, 'HLS segmenter closed');
      
      // Handle unexpected close (not from stop())
      if (code !== 0 && code !== null && !this.isRestarting) {
        this.handleUnexpectedClose(code);
      }
      
      this.emit('close', code);
    });

    this.ffmpeg.on('error', (err) => {
      this.isRunning = false;
      logger.error({ streamId: this.streamId, error: err }, 'HLS segmenter process error');
      this.emit('error', err);
      
      // Report failure for potential failover
      if (this.options.enableFailover) {
        streamSourceManager.reportSourceFailure(this.streamId, err.message);
      }
    });

    // Wait for first segment to be created
    await this.waitForPlaylist(playlistPath);
  }

  /**
   * Handle failover to a new source URL
   */
  private async handleFailover(newUrl: string): Promise<void> {
    logger.info({ streamId: this.streamId, newUrl }, 'Handling failover to new source');
    
    this.isRestarting = true;
    this.stop();
    
    // Small delay before restart
    await new Promise(r => setTimeout(r, 1000));
    
    try {
      await this.start(newUrl);
      this.emit('failover', { newUrl, previousUrl: this.currentSourceUrl });
    } catch (error) {
      logger.error({ streamId: this.streamId, error }, 'Failover restart failed');
      this.emit('failover:failed', { error });
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Handle unexpected FFmpeg close
   */
  private async handleUnexpectedClose(exitCode: number): Promise<void> {
    const now = Date.now();
    
    // Reset restart count if last restart was more than 5 minutes ago
    if (now - this.lastRestartTime > 300000) {
      this.restartCount = 0;
    }

    if (this.restartCount >= this.options.maxRestarts) {
      logger.error({ 
        streamId: this.streamId, 
        restartCount: this.restartCount 
      }, 'Max restarts reached, attempting failover');
      
      // Try failover
      if (this.options.enableFailover) {
        const newUrl = await streamSourceManager.reportSourceFailure(
          this.streamId, 
          `FFmpeg exited with code ${exitCode} after ${this.restartCount} restarts`
        );
        
        if (newUrl) {
          await this.handleFailover(newUrl);
          return;
        }
      }
      
      this.emit('maxRestarts');
      return;
    }

    // Attempt restart with current source
    this.restartCount++;
    this.lastRestartTime = now;
    
    logger.warn({ 
      streamId: this.streamId, 
      exitCode,
      restartCount: this.restartCount,
      maxRestarts: this.options.maxRestarts
    }, 'Attempting stream restart');

    this.isRestarting = true;
    await new Promise(r => setTimeout(r, 2000)); // Wait 2 seconds before restart

    try {
      await this.start(this.currentSourceUrl);
    } catch (error) {
      logger.error({ streamId: this.streamId, error }, 'Restart failed');
    } finally {
      this.isRestarting = false;
    }
  }

  getCurrentSource(): string {
    return this.currentSourceUrl;
  }

  /**
   * Build FFmpeg arguments based on transcoding profile
   */
  private buildFfmpegArgs(sourceUrl: string, playlistPath: string, segmentPattern: string): string[] {
    const profile = this.options.transcodingProfile;
    
    // Base input args with reconnection and buffer tuning
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'error',
      // Threading - use all available cores
      '-threads', '0',
      // Reconnection settings for live streams
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-reconnect_on_network_error', '1',
      '-reconnect_on_http_error', '4xx,5xx',
      // Input buffer tuning - optimized for low latency with A/V sync
      '-fflags', '+genpts+discardcorrupt+fastseek',
      '-flags', 'low_delay',
      // Stream detection - balanced for fast startup + sync
      '-analyzeduration', String(this.options.analyzeDuration || 1000000),  // 1s default
      '-probesize', String(this.options.probeSize || 1000000),              // 1MB default
      // Flush packets immediately for lower latency
      '-flush_packets', '1',
    ];

    // Add hardware acceleration input flags if needed
    if (profile?.encodingMode === 'NVENC') {
      args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
    } else if (profile?.encodingMode === 'QSV') {
      args.push('-hwaccel', 'qsv', '-qsv_device', '/dev/dri/renderD128');
    } else if (profile?.encodingMode === 'VAAPI') {
      const vaapiDevice = profile.vaapiDevice || '/dev/dri/renderD128';
      args.push('-vaapi_device', vaapiDevice);
    }

    // Input source
    args.push('-i', sourceUrl);

    // Handle encoding based on profile
    const isPassthrough = !profile || profile.encodingMode === 'PASSTHROUGH' || profile.videoCodec === 'copy';
    
    if (isPassthrough) {
      // PASSTHROUGH MODE - Always use copy
      // Note: Cannot use -force_key_frames in copy mode
      logger.debug({ streamId: this.streamId }, 'Using PASSTHROUGH mode: -c:v copy -c:a copy');
      
      // Explicitly map all streams to ensure video is not dropped
      // This is crucial for cascade where input is HLS
      args.push('-map', '0');
      args.push('-c:v', 'copy');
      args.push('-c:a', 'copy');
      // NOTE: Removed -bsf:a aac_adtstoasc as it only works with AAC audio
      // Streams with AC3, EAC3, MP3, etc. would fail with this filter
      // For fMP4 containers, FFmpeg handles most audio formats correctly without this filter
      
      // Ensure stream IDs are preserved or generated correctly
      args.push('-ignore_unknown'); 
    } else {
      // TRANSCODING MODE
      this.addVideoEncodingArgs(args, profile);
      this.addAudioEncodingArgs(args, profile);
    }

    // Get HLS settings from config (use options override if provided, else use settings)
    const segmentDuration = this.options.segmentDuration ?? this.streamingConfig!.hlsSegmentDuration;
    const playlistLength = this.options.listSize ?? this.streamingConfig!.hlsPlaylistLength;

    // Force keyframes at segment boundaries - only when transcoding (not in copy mode)
    if (!isPassthrough) {
      args.push('-force_key_frames', `expr:gte(t,n_forced*${segmentDuration})`);
    }
    
    // HLS output settings - optimized for LOW LATENCY with fMP4
    // fMP4 (fragmented MP4) provides faster startup than MPEG-TS
    // 
    // Low-latency optimizations:
    // 1. Short segments (1s) - faster first segment delivery
    // 2. Short init time (0.2s) - faster initial playback
    // 3. temp_file flag - segment available as soon as written
    // 4. fMP4 with frag_keyframe - allows partial segment playback
    // 5. program_date_time - enables player sync and catch-up
    //
    // Expected latency: segment_duration × (playlist_length + 1) + ~2s encoding
    // With 1s × 4 + 2s = ~6-8 seconds (vs 30s with 6s × 5)
    const fmp4SegmentPattern = segmentPattern.replace('.ts', '.m4s');
    args.push(
      '-f', 'hls',
      '-hls_time', segmentDuration.toString(),
      '-hls_init_time', '0.2',  // Very short initial segment (200ms) for fastest startup
      '-hls_list_size', playlistLength.toString(),
      // HLS flags for low-latency streaming:
      // - temp_file: segment is available immediately when complete (not renamed)
      // - program_date_time: enables player sync and live edge detection
      // - independent_segments: allows players to start from any segment
      // - split_by_time: ensures segments are exactly hls_time duration
      '-hls_flags', this.options.deleteSegments
        ? 'delete_segments+append_list+independent_segments+temp_file+omit_endlist+program_date_time+split_by_time'
        : 'append_list+independent_segments+temp_file+omit_endlist+program_date_time+split_by_time',
      '-hls_segment_type', 'fmp4',  // Use fragmented MP4 for faster startup
      '-hls_fmp4_init_filename', 'init.mp4',
      // fMP4 flags for low-latency:
      // - frag_keyframe: new fragment at each keyframe (enables partial playback)
      // - empty_moov: no samples in moov (faster init)
      // - default_base_moof: required for fMP4 HLS
      // - negative_cts_offsets: better B-frame handling
      '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof+negative_cts_offsets',
      '-hls_allow_cache', '0',   // Disable caching for live streams
      // Start segment numbers from epoch for consistency
      '-hls_start_number_source', 'epoch',
      // NOTE: Removed -start_at_zero and -copyts (they fight each other causing A/V desync)
      // Let FFmpeg regenerate clean timestamps automatically
      '-hls_segment_filename', fmp4SegmentPattern,
      playlistPath
    );

    return args;
  }

  /**
   * Add video encoding arguments based on profile
   */
  private addVideoEncodingArgs(args: string[], profile: TranscodingProfile): void {
    switch (profile.encodingMode) {
      case 'NVENC':
        this.addNvencArgs(args, profile);
        break;
      case 'QSV':
        this.addQsvArgs(args, profile);
        break;
      case 'VAAPI':
        this.addVaapiArgs(args, profile);
        break;
      case 'SOFTWARE':
      default:
        this.addSoftwareArgs(args, profile);
        break;
    }
  }

  /**
   * Add software encoding arguments
   */
  private addSoftwareArgs(args: string[], profile: TranscodingProfile): void {
    const codec = profile.videoCodec === 'h265' ? 'libx265' :
                  profile.videoCodec === 'vp9' ? 'libvpx-vp9' :
                  profile.videoCodec === 'av1' ? 'libsvtav1' : 'libx264';
    
    args.push('-c:v', codec);
    args.push('-preset', profile.videoPreset || 'medium');

    // Use settings for maxBitrate and bufferSize if profile doesn't specify
    const maxBitrate = profile.maxBitrate || this.streamingConfig?.maxBitrate || 8000;
    const bufferSizeKb = profile.bufferSize || getBufferSizeKbits(this.streamingConfig!);

    if (profile.videoBitrateMode === 'crf' && profile.crfValue !== null) {
      args.push('-crf', String(profile.crfValue));
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    } else if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    }

    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale=${profile.resolutionWidth}:${profile.resolutionHeight}:flags=${profile.scalingAlgorithm || 'lanczos'}`);
    }

    if (profile.frameRate) {
      args.push('-r', String(profile.frameRate));
    }

    args.push('-g', String(profile.gopSize || 60));
    if (profile.bFrames !== null && profile.bFrames !== undefined) {
      args.push('-bf', String(profile.bFrames));
    }

    const segmentDuration = this.options.segmentDuration ?? this.streamingConfig!.hlsSegmentDuration;
    if (codec === 'libx264') {
      args.push('-tune', 'zerolatency');
      // Force keyframe at segment boundaries for clean cuts
      args.push('-force_key_frames', `expr:gte(t,n_forced*${segmentDuration})`);
    }
  }

  /**
   * Add NVENC (NVIDIA GPU) encoding arguments
   */
  private addNvencArgs(args: string[], profile: TranscodingProfile): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_nvenc' : 'h264_nvenc';
    args.push('-c:v', codec);

    if (profile.nvencPreset) args.push('-preset', profile.nvencPreset);
    if (profile.nvencRcMode) args.push('-rc', profile.nvencRcMode);
    if (profile.nvencTuning) args.push('-tune', profile.nvencTuning);
    if (profile.videoBitrate) args.push('-b:v', `${profile.videoBitrate}k`);

    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale_cuda=${profile.resolutionWidth}:${profile.resolutionHeight}`);
    }

    args.push('-g', String(profile.gopSize || 60));
    args.push('-zerolatency', '1');
  }

  /**
   * Add QSV (Intel Quick Sync) encoding arguments
   */
  private addQsvArgs(args: string[], profile: TranscodingProfile): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_qsv' : 'h264_qsv';
    args.push('-c:v', codec);

    if (profile.qsvPreset) args.push('-preset', profile.qsvPreset);
    if (profile.videoBitrate) args.push('-b:v', `${profile.videoBitrate}k`);

    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale_qsv=${profile.resolutionWidth}:${profile.resolutionHeight}`);
    }

    args.push('-g', String(profile.gopSize || 60));
  }

  /**
   * Add VAAPI (AMD/Intel VA-API) encoding arguments
   */
  private addVaapiArgs(args: string[], profile: TranscodingProfile): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_vaapi' : 'h264_vaapi';
    
    let vfChain = 'format=nv12,hwupload';
    if (profile.resolutionWidth && profile.resolutionHeight) {
      vfChain += `,scale_vaapi=w=${profile.resolutionWidth}:h=${profile.resolutionHeight}`;
    }

    args.push('-vf', vfChain);
    args.push('-c:v', codec);

    if (profile.videoBitrate) args.push('-b:v', `${profile.videoBitrate}k`);
    args.push('-g', String(profile.gopSize || 60));
  }

  /**
   * Add audio encoding arguments
   */
  private addAudioEncodingArgs(args: string[], profile: TranscodingProfile): void {
    if (profile.audioCodec === 'copy') {
      args.push('-c:a', 'copy');
      return;
    }

    const audioCodec = profile.audioCodec === 'opus' ? 'libopus' :
                       profile.audioCodec === 'mp3' ? 'libmp3lame' : 'aac';

    args.push('-c:a', audioCodec);
    args.push('-b:a', `${profile.audioBitrate || 128}k`);
    args.push('-ar', String(profile.audioSampleRate || 48000));
    args.push('-ac', String(profile.audioChannels || 2));
  }

  stop(): void {
    if (this.ffmpeg) {
      logger.info({ streamId: this.streamId }, 'Stopping HLS segmenter');
      this.ffmpeg.kill('SIGTERM');
      this.ffmpeg = null;
      this.isRunning = false;
      
      // Unregister from source manager
      if (this.options.enableFailover && !this.isRestarting) {
        streamSourceManager.unregisterStream(this.streamId);
      }
    }
  }

  getPlaylistPath(): string {
    return path.join(this.outputDir, 'playlist.m3u8');
  }

  getSegmentPath(segmentName: string): string {
    return path.join(this.outputDir, segmentName);
  }

  async getPlaylist(): Promise<string | null> {
    try {
      return await fs.readFile(this.getPlaylistPath(), 'utf-8');
    } catch {
      return null;
    }
  }

  async getSegment(segmentName: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.getSegmentPath(segmentName));
    } catch {
      return null;
    }
  }

  isActive(): boolean {
    return this.isRunning;
  }

  private async waitForPlaylist(
    playlistPath: string,
    timeout: number = 45000
  ): Promise<void> {
    const start = Date.now();
    let pollInterval = 100; // Start with faster polling

    while (Date.now() - start < timeout) {
      try {
        await fs.access(playlistPath);
        // Verify playlist has content (at least one segment reference)
        // Support both TS segments (.ts) and fMP4 segments (.m4s)
        const content = await fs.readFile(playlistPath, 'utf-8');
        if (content.includes('.ts') || content.includes('.m4s')) {
          return;
        }
      } catch {
        // File doesn't exist yet
      }
      await new Promise((r) => setTimeout(r, pollInterval));
      // Gradually increase poll interval to reduce CPU usage
      pollInterval = Math.min(pollInterval + 50, 500);
    }

    throw new Error(`Playlist not created within ${timeout}ms`);
  }

  async cleanup(): Promise<void> {
    this.stop();
    try {
      await fs.rm(this.outputDir, { recursive: true, force: true });
      logger.debug({ streamId: this.streamId }, 'HLS directory cleaned up');
    } catch (error) {
      logger.error({ streamId: this.streamId, error }, 'Failed to cleanup HLS directory');
    }
  }
}

// Manager for multiple HLS streams with automatic failover
export class HLSManager {
  private segmenters: Map<number, HLSSegmenter> = new Map();

  /**
   * Start a stream with automatic source selection and failover
   * @param streamId - The stream ID
   * @param sourceUrl - Optional specific source URL, if not provided will use best available
   * @param transcodingProfile - Optional transcoding profile to use
   */
  async startStream(
    streamId: number, 
    sourceUrl?: string,
    transcodingProfile?: TranscodingProfile | null
  ): Promise<HLSSegmenter> {
    // Check if already running
    let segmenter = this.segmenters.get(streamId);
    if (segmenter?.isActive()) {
      return segmenter;
    }

    // Get best source URL if not provided
    const actualSourceUrl = sourceUrl || await streamSourceManager.getBestSource(streamId);
    
    if (!actualSourceUrl) {
      throw new Error(`No source URL available for stream ${streamId}`);
    }

    // Create new segmenter with failover enabled and transcoding profile
    segmenter = new HLSSegmenter(streamId, {
      enableFailover: true,
      transcodingProfile: transcodingProfile || null,
    });

    logger.info({
      streamId,
      sourceUrl: actualSourceUrl,
      profile: transcodingProfile?.name || 'passthrough (default)',
      encodingMode: transcodingProfile?.encodingMode || 'PASSTHROUGH',
    }, 'Starting HLS stream');
    
    segmenter.on('close', () => {
      // Don't remove immediately, allow for restart attempts
      setTimeout(() => {
        if (!segmenter?.isActive()) {
          this.segmenters.delete(streamId);
        }
      }, 5000);
    });

    segmenter.on('error', (error) => {
      logger.error({ streamId, error }, 'HLS stream error');
    });

    segmenter.on('failover', ({ newUrl, previousUrl }) => {
      logger.info({ streamId, newUrl, previousUrl }, 'Stream failed over to backup source');
    });

    segmenter.on('maxRestarts', () => {
      logger.error({ streamId }, 'Stream reached max restarts, giving up');
      this.segmenters.delete(streamId);
    });

    await segmenter.start(actualSourceUrl);
    this.segmenters.set(streamId, segmenter);

    return segmenter;
  }

  /**
   * Manually trigger failover for a stream
   */
  async triggerFailover(streamId: number): Promise<boolean> {
    const newUrl = await streamSourceManager.manualFailover(streamId);
    return !!newUrl;
  }

  /**
   * Get the current source URL for a stream
   */
  getCurrentSource(streamId: number): string | null {
    const segmenter = this.segmenters.get(streamId);
    return segmenter?.getCurrentSource() || null;
  }

  /**
   * Get stream source status including all sources and failover info
   */
  async getStreamSourceStatus(streamId: number) {
    return streamSourceManager.getStreamStatus(streamId);
  }

  /**
   * Pre-check all sources for a stream
   */
  async precheckSources(streamId: number) {
    return streamSourceManager.precheckAllSources(streamId);
  }

  stopStream(streamId: number): void {
    const segmenter = this.segmenters.get(streamId);
    if (segmenter) {
      segmenter.stop();
      this.segmenters.delete(streamId);
    }
  }

  getSegmenter(streamId: number): HLSSegmenter | undefined {
    return this.segmenters.get(streamId);
  }

  getActiveStreams(): number[] {
    return Array.from(this.segmenters.keys());
  }

  async stopAll(): Promise<void> {
    const cleanupPromises = Array.from(this.segmenters.values()).map(
      (segmenter) => segmenter.cleanup()
    );
    await Promise.all(cleanupPromises);
    this.segmenters.clear();
  }
}

// Export singleton instance
export const hlsManager = new HLSManager();
