import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { TranscodingProfile, EncodingMode, StreamStatus, DistributionRole } from '@prisma/client';
import { streamSourceManager } from './StreamSourceManager.js';
import { dbLogger } from '../logging/DatabaseLogger.js';
import { getStreamingConfig, getBufferSizeKbits, StreamingConfig } from './StreamingSettings.js';
import { hlsRelayService } from './HLSRelayService.js';
import { isProcessRunning as checkProcessRunning, terminateProcess } from '../../utils/process.js';

export interface StreamInstance {
  streamId: number;
  ffmpegPid: number;
  process: ChildProcess;
  outputDir: string;
  sourceUrl: string;
  profile: TranscodingProfile | null;
  startedAt: Date;
  restartCount: number;
}

export interface StartStreamOptions {
  sourceUrl?: string;
  profileId?: number;
  serverId?: number;
  enableFailover?: boolean;
}

/**
 * StreamLifecycleManager - Comprehensive stream process management
 * 
 * Handles:
 * - Starting streams with proper transcoding profile (including passthrough)
 * - Storing PID in database
 * - Stopping streams by PID
 * - Restarting streams
 * - Cleaning HLS segments
 */
export class StreamLifecycleManager extends EventEmitter {
  private runningStreams: Map<number, StreamInstance> = new Map();
  private startingStreams: Map<number, Promise<StreamInstance>> = new Map(); // Track streams being started
  private restartingStreams: Set<number> = new Set(); // Track streams being restarted
  private readonly hlsBasePath: string;

  constructor() {
    super();
    this.hlsBasePath = config.ffmpeg.hlsSegmentPath;
  }

  /**
   * Start a stream with the specified transcoding profile
   */
  async startStream(streamId: number, options: StartStreamOptions = {}): Promise<StreamInstance> {
    // Check if already running in memory
    const existing = this.runningStreams.get(streamId);
    if (existing) {
      logger.warn({ streamId }, 'Stream already running in memory, returning existing instance');
      return existing;
    }

    // Check if stream is currently being started (race condition prevention)
    const pendingStart = this.startingStreams.get(streamId);
    if (pendingStart) {
      logger.warn({ streamId }, 'Stream is already being started, waiting for existing start to complete');
      return pendingStart;
    }

    // Create a promise for this start operation and store it
    const startPromise = this.doStartStream(streamId, options);
    this.startingStreams.set(streamId, startPromise);

    try {
      const instance = await startPromise;
      return instance;
    } finally {
      // Always remove from starting map when done
      this.startingStreams.delete(streamId);
    }
  }

  /**
   * Internal method to actually start the stream
   */
  private async doStartStream(streamId: number, options: StartStreamOptions = {}): Promise<StreamInstance> {
    // TIMING DEBUG: Track stream startup phases
    const timings: Record<string, number> = { start: Date.now() };

    // OPTIMIZATION: Single query to get stream with transcoding profile and check existing PID
    // This reduces database round-trips for faster startup
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        transcodingProfile: true,
      },
    });
    timings.dbQuery = Date.now();

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Check this server's role in the distribution
    const currentServerId = options.serverId || config.multiServer.serverId;
    let isChildServer = false;
    let distribution = null;
    
    if (currentServerId) {
      distribution = await prisma.streamServerDistribution.findUnique({
        where: {
          streamId_serverId: { streamId, serverId: currentServerId },
        },
      });
      isChildServer = distribution?.role === DistributionRole.CHILD;
    }

    // Check if stream is already running on ANOTHER server
    // This prevents the main panel from accidentally "starting" a stream that's
    // running on an edge server, which would incorrectly update lastStartedAt
    // EXCEPTION: CHILD servers should NOT throw this error - they need to start HLS relay
    if (stream.streamStatus === 'RUNNING' && stream.runningServerId) {
      // Stream is marked as running on a specific server
      if (stream.runningServerId !== currentServerId) {
        // It's running on a DIFFERENT server
        if (isChildServer) {
          // CHILD server: This is expected! The origin is running FFmpeg.
          // We'll start HLS relay below, not throw an error.
          logger.info({
            streamId,
            runningServerId: stream.runningServerId,
            currentServerId,
            role: 'CHILD',
          }, 'Stream running on origin server - CHILD will start HLS relay');
        } else {
          // Not a CHILD server - don't interfere
          logger.warn({
            streamId,
            runningServerId: stream.runningServerId,
            currentServerId,
            ffmpegPid: stream.ffmpegPid,
          }, 'Stream already running on different server, not starting locally');
          throw new Error(`Stream ${streamId} is already running on server ${stream.runningServerId}`);
        }
      }
      // Same server - might be a stale entry, continue with cleanup below
    }

    // Check for existing PID and kill it first
    // This handles cases where a previous instance wasn't properly cleaned up
    if (stream.ffmpegPid) {
      logger.warn({ streamId, oldPid: stream.ffmpegPid }, 'Found existing PID in database, killing it first');
      await this.killProcessByPid(stream.ffmpegPid);
      // Wait a bit for process to fully terminate (reduced from 500ms)
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Also stop through HLSManager in case it has a reference
    try {
      const { hlsManager } = await import('./HLSSegmenter.js');
      hlsManager.stopStream(streamId);
    } catch {
      // Ignore if HLSManager doesn't have this stream
    }

    // Update status to STARTING
    await this.updateStreamStatus(streamId, 'STARTING');

    try {

      // Determine source URL based on cascade distribution configuration
      let sourceUrl = options.sourceUrl || stream.sourceUrl;
      if (!sourceUrl) {
        throw new Error(`No source URL for stream ${streamId}`);
      }

      // Check if this server should pull from a parent server instead of the source
      // Note: We already fetched `distribution` and `isChildServer` above
      if (currentServerId && isChildServer && distribution?.pullFromServerId) {
          // This server is a child - USE HLS RELAY (no FFmpeg!)
          // Just like Xtream Codes: copy segment files from parent, don't re-encode
          const parentServer = await prisma.server.findUnique({
            where: { id: distribution.pullFromServerId },
            select: { id: true, name: true, domain: true, internalIp: true, externalIp: true, httpPort: true, apiKey: true },
          });

          if (parentServer) {
            const parentHost = parentServer.internalIp || parentServer.externalIp || parentServer.domain;
            const parentPort = parentServer.httpPort || 3001;
            const parentUrl = `http://${parentHost}:${parentPort}/internal/hls/${streamId}/playlist.m3u8`;
            
            logger.info({
              streamId,
              serverId: currentServerId,
              role: 'CHILD',
              parentServerId: parentServer.id,
              parentName: parentServer.name,
              parentUrl,
              mode: 'HLS_RELAY',
            }, 'Server is CHILD - using HLS Relay (segment copy, no FFmpeg)');
            
            // OPTIMIZATION: Notify ORIGIN server directly to start FFmpeg
            // This is faster than cascading through all parents
            // The origin server will start FFmpeg, then segments propagate through the cascade
            logger.info({
              streamId,
              originServerId: stream.originServerId,
              currentServerId,
              willNotifyOrigin: !!(stream.originServerId && stream.originServerId !== currentServerId),
            }, 'Checking if should notify origin server');
            
            if (stream.originServerId && stream.originServerId !== currentServerId) {
              const originServer = await prisma.server.findUnique({
                where: { id: stream.originServerId },
                select: { id: true, name: true, domain: true, internalIp: true, externalIp: true, httpPort: true, apiKey: true },
              });
              
              if (originServer) {
                const originHost = originServer.internalIp || originServer.externalIp || originServer.domain;
                const originPort = originServer.httpPort || 3001;
                const originApiUrl = `http://${originHost}:${originPort}/api/internal/streams/prepare`;
                
                try {
                  logger.info({ 
                    streamId, 
                    originApiUrl, 
                    originServer: originServer.name 
                  }, 'Notifying ORIGIN server directly to start FFmpeg');
                  
                  await axios.post(
                    originApiUrl,
                    { streamId, sourceUrl: sourceUrl },
                    {
                      headers: {
                        'X-Server-Key': originServer.apiKey || '',
                        'Content-Type': 'application/json',
                      },
                      timeout: 30000, // Wait for origin to have segments ready
                    }
                  );
                  
                  logger.info({ 
                    streamId, 
                    originServer: originServer.name 
                  }, 'Origin server confirmed stream is ready');
                } catch (error: any) {
                  logger.warn({ 
                    streamId, 
                    originServer: originServer.name, 
                    error: error.message 
                  }, 'Failed to notify origin server, falling back to cascade');
                }
              }
            }
            
            // Also notify parent to set up its relay (if parent is not the origin)
            // This ensures the cascade chain is ready
            if (parentServer.id !== stream.originServerId) {
              try {
                const parentApiUrl = `http://${parentHost}:${parentPort}/api/internal/streams/prepare`;
                logger.info({ streamId, parentApiUrl, parentServer: parentServer.name }, 'Notifying parent server to prepare relay');
                
                await axios.post(
                  parentApiUrl,
                  { streamId, sourceUrl: sourceUrl },
                  {
                    headers: {
                      'X-Server-Key': parentServer.apiKey || '',
                      'Content-Type': 'application/json',
                    },
                    timeout: 30000,
                  }
                );
                
                logger.info({ streamId, parentServer: parentServer.name }, 'Parent server relay ready');
              } catch (error: any) {
                logger.warn({ 
                  streamId, 
                  parentServer: parentServer.name, 
                  error: error.message 
                }, 'Failed to notify parent server, will try relay anyway');
              }
            }
            
            // Start HLS Relay - copies segments from parent, no FFmpeg needed!
            await hlsRelayService.startRelay(streamId, parentUrl);
            
            // Create output directory for the relay
            const outputDir = path.join(this.hlsBasePath, `stream_${streamId}`);
            
            // Create a "virtual" instance (no FFmpeg process)
            const instance: StreamInstance = {
              streamId,
              ffmpegPid: 0,
              process: null as any, // No process for relay mode
              outputDir,
              sourceUrl: parentUrl,
              profile: null,
              startedAt: new Date(),
              restartCount: 0,
            };
            
            this.runningStreams.set(streamId, instance);
            
            // Update database
            await prisma.stream.update({
              where: { id: streamId },
              data: {
                ffmpegPid: null,
                streamStatus: 'RUNNING',
                lastStartedAt: new Date(),
                lastError: null,
                runningServerId: options.serverId || null,
              },
            });
            
            // Wait for first playlist to be created (longer timeout for relay mode)
            await this.waitForPlaylist(outputDir, 30000);
            
            logger.info({ streamId, parentUrl }, 'HLS Relay stream started (no FFmpeg)');
            
            dbLogger.streamStarted(streamId, stream.name, {
              mode: 'HLS_RELAY',
              parentUrl,
              parentServer: parentServer.name,
            });
            
            this.emit('stream:started', { streamId, mode: 'relay' });
            
            return instance;
          }
        }
      
      // Log if this is an ORIGIN server
      if (distribution && distribution.role === DistributionRole.ORIGIN) {
        logger.info({
          streamId,
          serverId: currentServerId,
          role: 'ORIGIN',
          sourceUrl,
        }, 'Server is ORIGIN in cascade - pulling from external source');
      }

      // Track if we're pulling from TCP (not used currently, but keeping for future)
      let isTcpInput = sourceUrl.startsWith('tcp://');

      // Get transcoding profile (priority: options > stream.transcodingProfile > default passthrough)
      let profile: TranscodingProfile | null = null;
      
      if (options.profileId) {
        profile = await prisma.transcodingProfile.findUnique({
          where: { id: options.profileId },
        });
      } else if (stream.transcodeProfileId) {
        profile = stream.transcodingProfile;
      }

      // Create output directory
      const outputDir = path.join(this.hlsBasePath, `stream_${streamId}`);
      await fs.mkdir(outputDir, { recursive: true });
      
      // NOTE: For passthrough mode, we don't create subdirectories since we use simple playlist.m3u8
      // Subdirectories are only needed for transcoding with var_stream_map

      // Determine custom User-Agent (stream setting takes priority over profile setting)
      const customUserAgent = stream.customUserAgent || profile?.customUserAgent || null;

      // Load streaming config from settings
      const streamingConfig = await getStreamingConfig();
      timings.configLoaded = Date.now();

      // Build FFmpeg arguments based on profile
      const ffmpegArgs = this.buildFfmpegCommand(sourceUrl, outputDir, profile, customUserAgent, streamingConfig, {
        isTcpInput,
        analyzeDuration: stream.analyzeDuration ?? undefined,
        probeSize: stream.probeSize ?? undefined,
      });

      logger.info({
        streamId,
        sourceUrl,
        profile: profile?.name || 'passthrough (default)',
        encodingMode: profile?.encodingMode || 'PASSTHROUGH',
        hlsSegmentDuration: streamingConfig.hlsSegmentDuration,
        hlsPlaylistLength: streamingConfig.hlsPlaylistLength,
        command: `${config.ffmpeg.path} ${ffmpegArgs.join(' ')}`,
      }, 'Starting stream');

      // Spawn FFmpeg process
      timings.ffmpegSpawnStart = Date.now();
      const ffmpegProcess = spawn(config.ffmpeg.path, ffmpegArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });
      timings.ffmpegSpawned = Date.now();

      if (!ffmpegProcess.pid) {
        throw new Error('Failed to spawn FFmpeg process');
      }

      // Create stream instance
      const instance: StreamInstance = {
        streamId,
        ffmpegPid: ffmpegProcess.pid,
        process: ffmpegProcess,
        outputDir,
        sourceUrl,
        profile,
        startedAt: new Date(),
        restartCount: 0,
      };

      // Store in memory
      this.runningStreams.set(streamId, instance);

      // Update database with PID and status
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          ffmpegPid: ffmpegProcess.pid,
          streamStatus: 'RUNNING',
          lastStartedAt: new Date(),
          lastError: null,
          runningServerId: options.serverId || null,
        },
      });
      timings.dbUpdated = Date.now();

      // Register with source manager for failover
      if (options.enableFailover !== false) {
        streamSourceManager.registerStream(streamId, 0, async (newUrl) => {
          await this.handleFailover(streamId, newUrl);
        });
        streamSourceManager.setStreamProcess(streamId, ffmpegProcess);
      }

      // Setup process event handlers
      this.setupProcessHandlers(instance);

      // Wait for playlist to be created
      timings.waitPlaylistStart = Date.now();
      await this.waitForPlaylist(outputDir);
      timings.playlistReady = Date.now();

      // Calculate timing breakdown
      const totalTime = timings.playlistReady - timings.start;
      const dbQueryTime = timings.dbQuery - timings.start;
      const configTime = timings.configLoaded - timings.dbQuery;
      const ffmpegSpawnTime = timings.ffmpegSpawned - timings.ffmpegSpawnStart;
      const dbUpdateTime = timings.dbUpdated - timings.ffmpegSpawned;
      const playlistWaitTime = timings.playlistReady - timings.waitPlaylistStart;

      logger.info({
        streamId,
        pid: ffmpegProcess.pid,
        profile: profile?.name || 'passthrough',
        timing: {
          totalMs: totalTime,
          dbQueryMs: dbQueryTime,
          configLoadMs: configTime,
          ffmpegSpawnMs: ffmpegSpawnTime,
          dbUpdateMs: dbUpdateTime,
          playlistWaitMs: playlistWaitTime,
        },
      }, 'Stream started successfully with timing breakdown');

      // Log to database
      dbLogger.streamStarted(streamId, stream.name, {
        pid: ffmpegProcess.pid,
        profile: profile?.name || 'passthrough',
        sourceUrl,
        encodingMode: profile?.encodingMode || 'PASSTHROUGH',
      });

      this.emit('stream:started', { streamId, pid: ffmpegProcess.pid });

      return instance;
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to start stream');
      
      // Log to database
      dbLogger.streamError(streamId, `Stream ${streamId}`, `Failed to start: ${error.message}`, error);
      
      await this.updateStreamStatus(streamId, 'ERROR', error.message);
      
      throw error;
    }
  }

  /**
   * Stop a stream by ID (uses stored PID)
   */
  async stopStream(streamId: number, cleanup: boolean = true): Promise<void> {
    logger.info({ streamId, cleanup }, 'Stopping stream');

    // Update status
    await this.updateStreamStatus(streamId, 'STOPPING');

    try {
      // First try memory instance
      const instance = this.runningStreams.get(streamId);
      
      if (instance) {
        // Kill the FFmpeg process
        if (instance.process) {
          await this.killProcess(instance.process, instance.ffmpegPid);
          logger.info({ streamId, pid: instance.ffmpegPid }, 'Killed FFmpeg process from memory instance');
        }
        this.runningStreams.delete(streamId);
      }
      
      // ALWAYS check database for PID (in case memory doesn't have it)
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { ffmpegPid: true },
      });

      if (stream?.ffmpegPid) {
        logger.info({ streamId, pid: stream.ffmpegPid }, 'Killing FFmpeg process from database PID');
        await this.killProcessByPid(stream.ffmpegPid);
      }

      // Also stop through HLSManager in case it has a reference
      try {
        const { hlsManager } = await import('./HLSSegmenter.js');
        hlsManager.stopStream(streamId);
        logger.debug({ streamId }, 'Stopped stream through HLSManager');
      } catch {
        // Ignore if HLSManager doesn't have this stream
      }

      // Stop HLS Relay if running (for child servers in cascade)
      // Pass cleanup=false since cleanupHlsDirectory will handle it
      try {
        await hlsRelayService.stopRelay(streamId, false);
        logger.debug({ streamId }, 'Stopped HLS relay');
      } catch {
        // Ignore if relay wasn't running
      }

      // Wait for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 500));

      // Unregister from source manager
      streamSourceManager.unregisterStream(streamId);

      // Clean up HLS directory if requested
      if (cleanup) {
        await this.cleanupHlsDirectory(streamId);
      }

      // Update database
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          ffmpegPid: null,
          streamStatus: 'STOPPED',
          lastStoppedAt: new Date(),
          runningServerId: null,
        },
      });

      logger.info({ streamId }, 'Stream stopped successfully');
      
      // Log to database
      dbLogger.streamStopped(streamId, `Stream ${streamId}`, cleanup ? 'cleanup requested' : undefined);
      
      this.emit('stream:stopped', { streamId });
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Error stopping stream');
      
      // Log to database
      dbLogger.streamError(streamId, `Stream ${streamId}`, `Failed to stop: ${error.message}`, error);
      
      await this.updateStreamStatus(streamId, 'ERROR', error.message);
      throw error;
    }
  }

  /**
   * Restart a stream
   */
  async restartStream(streamId: number, options: StartStreamOptions = {}): Promise<StreamInstance> {
    logger.info({ streamId }, 'Restarting stream');

    // Mark as restarting so health monitor skips this stream
    this.restartingStreams.add(streamId);

    // Update status
    await this.updateStreamStatus(streamId, 'RESTARTING');

    try {
      // Stop the stream (with cleanup)
      await this.stopStream(streamId, true);

      // Small delay before restart
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the stream again
      const instance = await this.startStream(streamId, options);

      // Increment restart count
      instance.restartCount++;

      logger.info({ streamId, restartCount: instance.restartCount }, 'Stream restarted successfully');
      
      // Log to database
      dbLogger.streamRestarted(streamId, `Stream ${streamId}`, instance.restartCount);
      
      this.emit('stream:restarted', { streamId });

      return instance;
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to restart stream');
      
      // Log to database
      dbLogger.streamError(streamId, `Stream ${streamId}`, `Failed to restart: ${error.message}`, error);
      
      await this.updateStreamStatus(streamId, 'ERROR', error.message);
      throw error;
    } finally {
      // Always remove from restarting set when done
      this.restartingStreams.delete(streamId);
    }
  }

  /**
   * Build FFmpeg command based on transcoding profile
   * 
   * OPTIMIZATIONS APPLIED:
   * 1. Robust reconnection logic for network resilience (no max_delay to handle micro-interruptions)
   * 2. Low-latency flags for fast startup (-fflags, -flags low_delay)
   * 3. Dynamic hls_time/hls_list_size from database settings (with fallbacks)
   * 4. Modern HLS with fMP4 segments for instant playback
   * 5. Removed conflicting flags (+igndts removed, keeping +genpts)
   * 6. zerolatency tuning when transcoding
   */
  private buildFfmpegCommand(
    sourceUrl: string,
    outputDir: string,
    profile: TranscodingProfile | null,
    customUserAgent: string | null,
    streamingConfig: StreamingConfig,
    options: { isTcpInput?: boolean; analyzeDuration?: number; probeSize?: number } = {}
  ): string[] {
    // Determine if passthrough mode early - this affects output paths
    const isPassthrough = !profile || profile.encodingMode === 'PASSTHROUGH' || profile.videoCodec === 'copy';
    
    // For passthrough: use simple playlist.m3u8 (no var_stream_map)
    // For transcoding: use stream_%v variant structure (with var_stream_map)
    const playlistPath = isPassthrough 
      ? path.join(outputDir, 'playlist.m3u8')
      : path.join(outputDir, 'stream_%v', 'playlist.m3u8');  // %v = variant index
    
    // Use %d instead of %05d when using epoch timestamps (epoch numbers are 10 digits, not 5)
    const segmentPattern = isPassthrough
      ? path.join(outputDir, 'segment_%d.ts')
      : path.join(outputDir, 'stream_%v', 'segment_%d.ts');  // %v = variant index
    
    const isTcpInput = options.isTcpInput || sourceUrl.startsWith('tcp://');
    
    // Use per-stream overrides or fall back to optimized defaults
    // analyzeduration: 500ms for fast stream detection
    // probesize: 1MB for reliable codec detection
    const analyzeDuration = options.analyzeDuration ?? 500000;
    const probeSize = options.probeSize ?? 1000000;

    // =========================================
    // BASE INPUT ARGUMENTS
    // =========================================
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'warning',
      
      // Threading: 0 = use all available CPU cores automatically
      '-threads', '0',
    ];

    // =========================================
    // RECONNECTION SETTINGS (HTTP/HTTPS only)
    // Robust reconnection for network resilience during micro-interruptions
    // =========================================
    if (!isTcpInput) {
      args.push(
        '-reconnect', '1',                           // Enable reconnection
        '-reconnect_streamed', '1',                  // Reconnect for streamed content
        '-reconnect_delay_max', '5',                 // Max 5 seconds between retries
        '-reconnect_on_network_error', '1',          // Reconnect on network errors
        '-reconnect_on_http_error', '4xx,5xx',       // Reconnect on HTTP 4xx/5xx errors
      );
    }

    // =========================================
    // INPUT BUFFER TUNING - Low Latency with A/V Sync
    // Optimized for minimum latency while maintaining synchronization
    // =========================================
    args.push(
      // Fast flags for input processing:
      // - discardcorrupt: Drop corrupt frames to maintain sync
      // - genpts: Generate missing PTS for proper A/V synchronization
      // - fastseek: Enable fast seeking
      '-fflags', '+discardcorrupt+genpts+fastseek',
      
      // Low delay mode for reduced latency
      '-flags', 'low_delay',
      
      // Stream analysis settings - balanced for fast startup + sync
      // 1 second is enough for most IPTV sources, respects per-stream overrides
      '-analyzeduration', String(analyzeDuration || 1000000),  // 1s default
      '-probesize', String(probeSize || 1000000),              // 1MB default
      
      // Flush packets immediately for lower latency
      '-flush_packets', '1',
    );

    // =========================================
    // CUSTOM USER-AGENT (HTTP sources only)
    // =========================================
    if (customUserAgent && !isTcpInput) {
      args.push('-user_agent', customUserAgent);
    }

    // =========================================
    // HARDWARE ACCELERATION INPUT FLAGS
    // =========================================
    if (profile?.encodingMode === 'NVENC') {
      args.push('-hwaccel', 'cuda', '-hwaccel_output_format', 'cuda');
    } else if (profile?.encodingMode === 'QSV') {
      args.push('-hwaccel', 'qsv', '-qsv_device', '/dev/dri/renderD128');
    } else if (profile?.encodingMode === 'VAAPI') {
      const vaapiDevice = profile.vaapiDevice || '/dev/dri/renderD128';
      args.push('-vaapi_device', vaapiDevice);
    }

    // =========================================
    // INPUT SOURCE
    // =========================================
    args.push('-i', sourceUrl);

    // =========================================
    // ENCODING CONFIGURATION
    // =========================================
    // isPassthrough is already determined at the top of the function
    
    if (isPassthrough) {
      // PASSTHROUGH MODE - No re-encoding, just copy all streams
      // Simple single-playlist output (no var_stream_map) for maximum compatibility
      // This works with any number of audio streams without needing to know stream count ahead of time
      logger.debug({ sourceUrl }, 'Using PASSTHROUGH mode with simple HLS output');
      
      // Map first video stream and first audio stream
      // Using specific indices to avoid issues with multiple streams
      args.push('-map', '0:v:0?');  // First video stream (? = optional, don't fail if missing)
      args.push('-map', '0:a:0?'); // First audio stream (? = optional, don't fail if missing)
      
      // Copy video codec (no transcoding)
      args.push('-c:v', 'copy');
      
      // For fMP4 containers, we need to handle audio carefully:
      // - AAC ADTS from MPEG-TS needs aac_adtstoasc filter
      // - AC3/EAC3/other codecs fail with aac_adtstoasc
      // Solution: Transcode audio to AAC for universal fMP4 compatibility
      // This is lightweight (audio-only transcoding) and ensures all streams work
      args.push('-c:a', 'aac');
      args.push('-b:a', '128k');
      
      // NOTE: Not using var_stream_map for simple passthrough
      // This creates a single playlist.m3u8 instead of master.m3u8 + variants
      // This is more compatible with sources that have varying numbers of audio streams
      
      // NOTE: Removed -shortest as it can cause premature stream termination
      // Not needed for 24/7 IPTV restreaming
    } else {
      // TRANSCODING MODE - Apply encoding settings
      this.addVideoEncodingArgs(args, profile, streamingConfig);
      this.addAudioEncodingArgs(args, profile);
      
      // Force keyframes at segment boundaries for clean playback start
      // This ensures each segment can be played independently
      args.push('-force_key_frames', `expr:gte(t,n_forced*${streamingConfig.hlsSegmentDuration})`);
      
      // Zero latency tuning for transcoded streams
      // Reduces encoding delay by disabling lookahead optimizations
      args.push('-tune', 'zerolatency');
      
      // A/V SYNC for transcoding: async audio resampling with CFR
      // - aresample async=1: Stretches/squeezes audio to match video timestamps
      // - first_pts=0: Resets audio PTS to zero for proper alignment
      // - vsync cfr: Forces constant frame rate, eliminating VFR-related desync
      args.push('-af', 'aresample=async=1:first_pts=0');
      args.push('-vsync', 'cfr');
    }

    // =========================================
    // HLS OUTPUT SETTINGS
    // Dynamic values from database settings with fallback defaults:
    // - hlsSegmentDuration: from streaming.hlsSegmentDuration (default: 4s)
    // - hlsPlaylistLength: from streaming.hlsPlaylistLength (default: 6 segments)
    // =========================================
    const hlsTime = streamingConfig.hlsSegmentDuration;     // Dynamic from DB (fallback: 4)
    const hlsListSize = streamingConfig.hlsPlaylistLength;  // Dynamic from DB (fallback: 6)

    args.push(
      '-f', 'hls',
      
      // Dynamic segment duration from settings (default 2s for low latency)
      '-hls_time', hlsTime.toString(),
      
      // Short initial segment for faster playback start (500ms)
      // This creates a quick first segment so player can start faster
      '-hls_init_time', '0.5',
      
      // Dynamic playlist length from settings (default 4 for low latency)
      '-hls_list_size', hlsListSize.toString(),
      
      // HLS flags for low-latency live streaming:
      // - delete_segments: Remove old segments to save disk space
      // - independent_segments: Each segment can be decoded independently
      // - temp_file: Write to temp file first to avoid corrupt segments
      // - omit_endlist: Don't write #EXT-X-ENDLIST (live stream)
      // - program_date_time: Add date/time tags for better sync
      '-hls_flags', 'delete_segments+independent_segments+temp_file+omit_endlist+program_date_time',
      
      // Disable caching for fresher segments
      '-hls_allow_cache', '0',
      
      // Use epoch time for segment numbering (helps with cache busting)
      '-hls_start_number_source', 'epoch'
    );

    // Use fMP4 segments for all modes (faster startup and better seeking)
    const fmp4SegmentPattern = segmentPattern.replace('.ts', '.m4s');
    args.push(
      '-hls_segment_type', 'fmp4',
      '-hls_fmp4_init_filename', 'init.mp4',
      // fMP4 movflags for low-latency streaming
      '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof+delay_moov+negative_cts_offsets',
      '-hls_segment_filename', fmp4SegmentPattern,
      playlistPath
    );

    return args;
  }

  /**
   * Add video encoding arguments based on profile
   */
  private addVideoEncodingArgs(args: string[], profile: TranscodingProfile, streamingConfig: StreamingConfig): void {
    switch (profile.encodingMode) {
      case 'NVENC':
        this.addNvencArgs(args, profile, streamingConfig);
        break;
      case 'QSV':
        this.addQsvArgs(args, profile, streamingConfig);
        break;
      case 'VAAPI':
        this.addVaapiArgs(args, profile, streamingConfig);
        break;
      case 'SOFTWARE':
      default:
        this.addSoftwareArgs(args, profile, streamingConfig);
        break;
    }
  }

  /**
   * Add software encoding arguments
   */
  private addSoftwareArgs(args: string[], profile: TranscodingProfile, streamingConfig: StreamingConfig): void {
    // Determine codec
    const codec = profile.videoCodec === 'h265' ? 'libx265' :
                  profile.videoCodec === 'vp9' ? 'libvpx-vp9' :
                  profile.videoCodec === 'av1' ? 'libsvtav1' : 'libx264';
    
    args.push('-c:v', codec);
    args.push('-preset', profile.videoPreset || 'medium');

    // Use settings for maxBitrate and bufferSize if profile doesn't specify
    const maxBitrate = profile.maxBitrate || streamingConfig.maxBitrate;
    const bufferSizeKb = profile.bufferSize || getBufferSizeKbits(streamingConfig);

    // Bitrate settings
    if (profile.videoBitrateMode === 'crf' && profile.crfValue !== null) {
      args.push('-crf', String(profile.crfValue));
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    } else if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    }

    // Resolution
    if (profile.resolutionWidth && profile.resolutionHeight) {
      const scaling = profile.scalingAlgorithm || 'lanczos';
      args.push('-vf', `scale=${profile.resolutionWidth}:${profile.resolutionHeight}:flags=${scaling}`);
    }

    // Frame rate
    if (profile.frameRate) {
      args.push('-r', String(profile.frameRate));
    }

    // GOP settings
    args.push('-g', String(profile.gopSize || 60));
    if (profile.bFrames !== null && profile.bFrames !== undefined) {
      args.push('-bf', String(profile.bFrames));
    }

    // NOTE: -tune zerolatency is now added in buildFfmpegCommand after all encoding args
    // This ensures it's only added once for transcoding mode (not passthrough)
  }

  /**
   * Add NVENC (NVIDIA GPU) encoding arguments
   */
  private addNvencArgs(args: string[], profile: TranscodingProfile, streamingConfig: StreamingConfig): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_nvenc' : 'h264_nvenc';
    args.push('-c:v', codec);

    // NVENC preset
    if (profile.nvencPreset) {
      args.push('-preset', profile.nvencPreset);
    }

    // Rate control
    if (profile.nvencRcMode) {
      args.push('-rc', profile.nvencRcMode);
    }

    // Tuning
    if (profile.nvencTuning) {
      args.push('-tune', profile.nvencTuning);
    }

    // Use settings for maxBitrate and bufferSize if profile doesn't specify
    const maxBitrate = profile.maxBitrate || streamingConfig.maxBitrate;
    const bufferSizeKb = profile.bufferSize || getBufferSizeKbits(streamingConfig);

    // Bitrate
    if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    }

    // Resolution (need to download from GPU first for scaling)
    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale_cuda=${profile.resolutionWidth}:${profile.resolutionHeight}`);
    }

    // GOP
    args.push('-g', String(profile.gopSize || 60));

    // B-frames
    if (profile.nvencBFrames !== null && profile.nvencBFrames !== undefined) {
      args.push('-b_ref_mode', 'middle');
      args.push('-bf', String(profile.nvencBFrames));
    }

    // Lookahead
    if (profile.nvencLookahead) {
      args.push('-rc-lookahead', String(profile.nvencLookahead));
    }

    // Low latency
    args.push('-zerolatency', '1');
  }

  /**
   * Add QSV (Intel Quick Sync) encoding arguments
   */
  private addQsvArgs(args: string[], profile: TranscodingProfile, streamingConfig: StreamingConfig): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_qsv' : 'h264_qsv';
    args.push('-c:v', codec);

    if (profile.qsvPreset) {
      args.push('-preset', profile.qsvPreset);
    }

    // Use settings for maxBitrate and bufferSize if profile doesn't specify
    const maxBitrate = profile.maxBitrate || streamingConfig.maxBitrate;
    const bufferSizeKb = profile.bufferSize || getBufferSizeKbits(streamingConfig);

    if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    }

    // Resolution
    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale_qsv=${profile.resolutionWidth}:${profile.resolutionHeight}`);
    }

    args.push('-g', String(profile.gopSize || 60));
  }

  /**
   * Add VAAPI (AMD/Intel VA-API) encoding arguments
   */
  private addVaapiArgs(args: string[], profile: TranscodingProfile, streamingConfig: StreamingConfig): void {
    const codec = profile.videoCodec === 'h265' ? 'hevc_vaapi' : 'h264_vaapi';
    
    // For VAAPI, we need to upload to GPU, scale, then encode
    let vfChain = 'format=nv12,hwupload';
    
    if (profile.resolutionWidth && profile.resolutionHeight) {
      vfChain += `,scale_vaapi=w=${profile.resolutionWidth}:h=${profile.resolutionHeight}`;
    }

    args.push('-vf', vfChain);
    args.push('-c:v', codec);

    // Use settings for maxBitrate and bufferSize if profile doesn't specify
    const maxBitrate = profile.maxBitrate || streamingConfig.maxBitrate;
    const bufferSizeKb = profile.bufferSize || getBufferSizeKbits(streamingConfig);

    if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      args.push('-maxrate', `${maxBitrate}k`);
      args.push('-bufsize', `${bufferSizeKb}k`);
    }

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

    // Determine audio codec
    const audioCodec = profile.audioCodec === 'opus' ? 'libopus' :
                       profile.audioCodec === 'mp3' ? 'libmp3lame' : 'aac';

    args.push('-c:a', audioCodec);
    args.push('-b:a', `${profile.audioBitrate || 128}k`);
    args.push('-ar', String(profile.audioSampleRate || 48000));
    args.push('-ac', String(profile.audioChannels || 2));
  }

  /**
   * Setup process event handlers
   */
  private setupProcessHandlers(instance: StreamInstance): void {
    const { process: ffmpeg, streamId } = instance;
    
    // Skip if no process (relay mode)
    if (!ffmpeg) {
      logger.debug({ streamId }, 'No FFmpeg process to setup handlers for (relay mode)');
      return;
    }

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      if (message.includes('Error') || message.includes('error') ||
          message.includes('Connection refused') || message.includes('Connection timed out')) {
        logger.error({ streamId, message }, 'FFmpeg error');
        this.emit('stream:error', { streamId, error: message });
        
        // Report failure for potential failover
        streamSourceManager.reportSourceFailure(streamId, message);
      }
    });

    ffmpeg.on('close', async (code) => {
      logger.info({ streamId, code }, 'FFmpeg process closed');
      
      const currentInstance = this.runningStreams.get(streamId);

      // Ignore stale close events from an older process after a restart
      if (currentInstance && currentInstance.ffmpegPid !== instance.ffmpegPid) {
        logger.warn({
          streamId,
          stalePid: instance.ffmpegPid,
          currentPid: currentInstance.ffmpegPid,
        }, 'Ignoring stale FFmpeg close event for replaced process');
        return;
      }

      this.runningStreams.delete(streamId);
      
      // Update database only if this PID is still the active one to avoid clobbering newer restarts
      await prisma.stream.updateMany({
        where: {
          id: streamId,
          ffmpegPid: instance.ffmpegPid,
        },
        data: {
          ffmpegPid: null,
          streamStatus: code === 0 ? 'STOPPED' : 'ERROR',
          lastError: code !== 0 ? `FFmpeg exited with code ${code}` : null,
        },
      });

      this.emit('stream:closed', { streamId, code });
    });

    ffmpeg.on('error', async (err) => {
      logger.error({ streamId, error: err }, 'FFmpeg process error');
      
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          streamStatus: 'ERROR',
          lastError: err.message,
        },
      });

      this.emit('stream:error', { streamId, error: err.message });
    });
  }

  /**
   * Handle failover to a new source URL
   */
  private async handleFailover(streamId: number, newUrl: string): Promise<void> {
    logger.info({ streamId, newUrl }, 'Handling failover');
    
    try {
      await this.restartStream(streamId, { sourceUrl: newUrl });
      this.emit('stream:failover', { streamId, newUrl });
    } catch (error) {
      logger.error({ streamId, error }, 'Failover failed');
      this.emit('stream:failover:failed', { streamId, error });
    }
  }

  /**
   * Kill FFmpeg process gracefully
   */
  private async killProcess(process: ChildProcess, pid: number): Promise<void> {
    return new Promise((resolve) => {
      if (!process || process.killed) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
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
   * Kill a process by PID with verification.
   * Uses safe process.kill() instead of shell exec to prevent command injection.
   */
  private async killProcessByPid(pid: number): Promise<void> {
    logger.debug({ pid }, 'Attempting to kill process by PID');
    await terminateProcess(pid, 3000);
  }

  /**
   * Clean up HLS directory for a stream
   */
  async cleanupHlsDirectory(streamId: number): Promise<void> {
    const outputDir = path.join(this.hlsBasePath, `stream_${streamId}`);
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      logger.debug({ streamId, outputDir }, 'HLS directory cleaned');
    } catch (error) {
      logger.error({ streamId, error }, 'Failed to cleanup HLS directory');
    }
  }

  /**
   * Wait for playlist file to be created
   * Uses fs.watch for instant notification when file is created/modified
   * Falls back to polling if watch fails (e.g., on some filesystems)
   */
  private async waitForPlaylist(outputDir: string, timeout: number = 45000): Promise<void> {
    // Check for master playlist first (var_stream_map mode), fallback to regular playlist
    const masterPlaylistPath = path.join(outputDir, 'master.m3u8');
    const playlistPath = path.join(outputDir, 'playlist.m3u8');
    const start = Date.now();

    // Helper to check if playlist is ready (has segment references)
    // Support both TS segments (.ts) and fMP4 segments (.m4s)
    const isPlaylistReady = async (): Promise<boolean> => {
      try {
        // Try master playlist first
        let content: string;
        try {
          content = await fs.readFile(masterPlaylistPath, 'utf-8');
          // Master playlist should reference variant playlists
          return content.includes('stream_');
        } catch {
          // Fallback to regular playlist
          content = await fs.readFile(playlistPath, 'utf-8');
          return content.includes('.ts') || content.includes('.m4s');
        }
      } catch {
        return false;
      }
    };

    // First, quick check if already ready
    if (await isPlaylistReady()) {
      logger.debug({ outputDir, elapsed: Date.now() - start }, 'Playlist already ready');
      return;
    }

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      let watcher: ReturnType<typeof import('fs').watch> | null = null;
      let pollTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (watcher) {
          try { watcher.close(); } catch { /* ignore */ }
          watcher = null;
        }
        if (pollTimer) {
          clearTimeout(pollTimer);
          pollTimer = null;
        }
      };

      const done = (error?: Error) => {
        if (resolved) return;
        resolved = true;
        cleanup();
        if (error) {
          reject(error);
        } else {
          const elapsed = Date.now() - start;
          logger.debug({ outputDir, elapsed }, 'Playlist ready with segments');
          resolve();
        }
      };

      // Timeout handler
      const timeoutTimer = setTimeout(() => {
        done(new Error(`Playlist not created within ${timeout}ms`));
      }, timeout);

      // Try to use fs.watch for instant notification
      try {
        const fsSync = require('fs');
        const w = fsSync.watch(outputDir, async (eventType: string, filename: string | null) => {
          // Watch for both TS (.ts) and fMP4 (.m4s) segments
          if (filename === 'playlist.m3u8' || filename?.endsWith('.ts') || filename?.endsWith('.m4s')) {
            if (await isPlaylistReady()) {
              clearTimeout(timeoutTimer);
              done();
            }
          }
        });
        watcher = w;

        w.on('error', () => {
          // Watch failed, fall back to polling
          watcher = null;
        });
      } catch {
        // fs.watch not available, use polling
      }

      // Also poll as fallback (in case watch misses events or isn't available)
      // Use fast polling since we're racing against watch
      const poll = async () => {
        if (resolved) return;
        if (await isPlaylistReady()) {
          clearTimeout(timeoutTimer);
          done();
          return;
        }
        // Fast polling at 30ms since this is the critical startup path
        pollTimer = setTimeout(poll, 30);
      };
      poll();
    });
  }

  /**
   * Update stream status in database
   */
  private async updateStreamStatus(
    streamId: number,
    status: 'STOPPED' | 'STARTING' | 'RUNNING' | 'STOPPING' | 'ERROR' | 'RESTARTING',
    error?: string
  ): Promise<void> {
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        streamStatus: status,
        lastError: error || null,
      },
    });
  }

  /**
   * Get stream instance
   */
  getStreamInstance(streamId: number): StreamInstance | undefined {
    return this.runningStreams.get(streamId);
  }

  /**
   * Get all running stream IDs
   */
  getRunningStreamIds(): number[] {
    return Array.from(this.runningStreams.keys());
  }

  /**
   * Check if a stream is running or being started
   */
  isStreamRunning(streamId: number): boolean {
    return this.runningStreams.has(streamId) || this.startingStreams.has(streamId);
  }

  /**
   * Check if a stream is currently being restarted
   */
  isStreamRestarting(streamId: number): boolean {
    return this.restartingStreams.has(streamId);
  }

  /**
   * Get stream status from database and memory
   */
  async getStreamStatus(streamId: number): Promise<{
    status: string;
    pid: number | null;
    sourceUrl: string | null;
    profile: string | null;
    startedAt: Date | null;
    error: string | null;
  }> {
    // Check in-memory state first (most accurate)
    const memoryInstance = this.runningStreams.get(streamId);
    
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        streamStatus: true,
        ffmpegPid: true,
        sourceUrl: true,
        lastStartedAt: true,
        lastError: true,
        transcodingProfile: {
          select: { name: true },
        },
      },
    });

    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    // Prefer in-memory PID over database (handles race conditions)
    const actualPid = memoryInstance?.ffmpegPid ?? stream.ffmpegPid;

    return {
      status: stream.streamStatus,
      pid: actualPid,
      sourceUrl: stream.sourceUrl,
      profile: stream.transcodingProfile?.name || null,
      startedAt: memoryInstance?.startedAt || stream.lastStartedAt,
      error: stream.lastError,
    };
  }

  /**
   * Stop all running streams
   */
  async stopAllStreams(): Promise<void> {
    const streamIds = this.getRunningStreamIds();
    
    await Promise.all(
      streamIds.map(id => this.stopStream(id, true).catch(err => {
        logger.error({ streamId: id, error: err }, 'Error stopping stream');
      }))
    );
  }

  /**
   * Recovery: Check database for streams that should be running but aren't
   */
  async recoverOrphanedStreams(): Promise<void> {
    const orphanedStreams = await prisma.stream.findMany({
      where: {
        streamStatus: 'RUNNING',
        ffmpegPid: { not: null },
      },
    });

    for (const stream of orphanedStreams) {
      // Check if process is actually running
      const isRunning = this.isProcessRunning(stream.ffmpegPid!);
      
      if (!isRunning) {
        logger.warn({ streamId: stream.id, pid: stream.ffmpegPid }, 'Found orphaned stream, cleaning up');
        await prisma.stream.update({
          where: { id: stream.id },
          data: {
            ffmpegPid: null,
            streamStatus: 'STOPPED',
            lastError: 'Process died unexpectedly',
          },
        });
        
        // Restart if alwaysOn
        if (stream.alwaysOn) {
          logger.info({ streamId: stream.id }, 'Restarting always-on stream');
          try {
            await this.startStream(stream.id);
          } catch (error) {
            logger.error({ streamId: stream.id, error }, 'Failed to restart always-on stream');
          }
        }
      }
    }
  }

  /**
   * Check if a process is running by PID.
   * Uses safe process.kill(pid, 0) instead of shell exec.
   */
  private isProcessRunning(pid: number): boolean {
    return checkProcessRunning(pid);
  }
}

// Export singleton instance
export const streamLifecycleManager = new StreamLifecycleManager();

