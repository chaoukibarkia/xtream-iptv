import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import { getStreamingConfig } from './StreamingSettings.js';

export interface SubtitleInfo {
  index: number;
  language: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
  filename: string;
}

export interface AudioTrackInfo {
  index: number;
  language: string;
  title?: string;
  codec: string;
  channels: number;
  sampleRate: number;
  bitrate?: number;
  isDefault: boolean;
}

export interface HlsConversionJob {
  id: number;
  sourcePath: string;
  outputDir: string;
  status: 'pending' | 'converting' | 'ready' | 'error';
  progress: number;
  segmentsReady: number;
  subtitles: SubtitleInfo[];
  audioTracks: AudioTrackInfo[];
  error?: string;
  process?: ChildProcess;
  startedAt?: Date;
  completedAt?: Date;
}

// In-memory job tracking
const activeJobs: Map<number, HlsConversionJob> = new Map();

// Base directory for HLS output - use config or fallback
const getHlsBaseDir = () => {
  return process.env.HLS_OUTPUT_DIR || '/media/hls-segments';
};

export class VodToHlsService {
  private static instance: VodToHlsService;
  private hlsBaseDir: string;

  private constructor() {
    this.hlsBaseDir = getHlsBaseDir();
    // Ensure base directory exists
    if (!fs.existsSync(this.hlsBaseDir)) {
      fs.mkdirSync(this.hlsBaseDir, { recursive: true });
    }
  }

  static getInstance(): VodToHlsService {
    if (!VodToHlsService.instance) {
      VodToHlsService.instance = new VodToHlsService();
    }
    return VodToHlsService.instance;
  }

  /**
   * Get output directory for a specific VOD
   */
  getOutputDir(vodId: number): string {
    return path.join(this.hlsBaseDir, `stream_${vodId}`);
  }

  /**
   * Get master playlist path
   */
  getPlaylistPath(vodId: number): string {
    const outputDir = this.getOutputDir(vodId);
    const masterPath = path.join(outputDir, 'master.m3u8');
    const legacyPath = path.join(outputDir, 'playlist.m3u8');
    
    // Check for master playlist first (multi-audio)
    if (fs.existsSync(masterPath)) {
      return masterPath;
    }
    // Check for legacy playlist
    if (fs.existsSync(legacyPath)) {
      return legacyPath;
    }
    // Default to master for new conversions
    return masterPath;
  }

  /**
   * Check if file needs conversion (is MP4, MKV, etc.)
   */
  needsConversion(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'].includes(ext);
  }

  /**
   * Check if HLS output already exists and is complete
   */
  hasCompleteHlsOutput(vodId: number): boolean {
    const playlistPath = this.getPlaylistPath(vodId);
    if (!fs.existsSync(playlistPath)) {
      return false;
    }

    // Check if playlist has EXT-X-ENDLIST (conversion complete)
    try {
      const content = fs.readFileSync(playlistPath, 'utf-8');
      return content.includes('#EXT-X-ENDLIST');
    } catch {
      return false;
    }
  }

  /**
   * Check if HLS has enough segments to start playback
   */
  hasMinimumSegments(vodId: number, minSegments: number = 3): boolean {
    const outputDir = this.getOutputDir(vodId);
    const playlistPath = this.getPlaylistPath(vodId);
    
    if (!fs.existsSync(playlistPath)) {
      return false;
    }

    try {
      const files = fs.readdirSync(outputDir);
      const segmentCount = files.filter(f => f.endsWith('.ts') || f.endsWith('.m4s')).length;
      return segmentCount >= minSegments;
    } catch {
      return false;
    }
  }

  /**
   * Count available segments
   */
  countSegments(vodId: number): number {
    const outputDir = this.getOutputDir(vodId);
    
    if (!fs.existsSync(outputDir)) {
      return 0;
    }

    try {
      const files = fs.readdirSync(outputDir);
      return files.filter(f => f.endsWith('.ts') || f.endsWith('.m4s')).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get or start conversion job
   */
  getOrStartConversion(vodId: number, sourcePath: string): HlsConversionJob {
    // Check if job already exists
    const existingJob = activeJobs.get(vodId);
    if (existingJob) {
      // If job is in error state, allow retry by removing it and starting fresh
      if (existingJob.status === 'error') {
        logger.info({ vodId, previousError: existingJob.error }, 'Retrying failed conversion job');
        activeJobs.delete(vodId);
        // Continue to start a new conversion below
      } else {
        // Update segment count for active/completed jobs
        existingJob.segmentsReady = this.countSegments(vodId);
        existingJob.subtitles = this.getExtractedSubtitles(vodId);
        existingJob.audioTracks = this.getAudioTracks(vodId);
        return existingJob;
      }
    }

    // Check if already converted
    if (this.hasCompleteHlsOutput(vodId)) {
      const existingSubtitles = this.getExtractedSubtitles(vodId);
      const existingAudioTracks = this.getAudioTracks(vodId);
      
      // If no subtitles/audio tracks were extracted, try to extract them now
      // This handles cases where conversion completed but extraction was skipped
      if (existingSubtitles.length === 0) {
        logger.info({ vodId, sourcePath }, 'Attempting late subtitle extraction');
        this.extractSubtitles(vodId, sourcePath).then(subs => {
          logger.info({ vodId, subtitleCount: subs.length }, 'Late subtitle extraction completed');
        }).catch(err => {
          logger.error({ vodId, error: err, sourcePath }, 'Late subtitle extraction failed');
        });
      }
      
      if (existingAudioTracks.length === 0) {
        this.probeAudioTracks(vodId, sourcePath).then(tracks => {
          logger.info({ vodId, audioTrackCount: tracks.length }, 'Late audio track probing completed');
        }).catch(err => {
          logger.debug({ vodId, error: err }, 'Late audio track probing failed');
        });
      }
      
      const job: HlsConversionJob = {
        id: vodId,
        sourcePath,
        outputDir: this.getOutputDir(vodId),
        status: 'ready',
        progress: 100,
        segmentsReady: this.countSegments(vodId),
        subtitles: existingSubtitles,
        audioTracks: existingAudioTracks,
        completedAt: new Date()
      };
      return job;
    }

    // Start new conversion
    return this.startConversion(vodId, sourcePath);
  }

  /**
   * Get list of extracted subtitle files
   */
  getExtractedSubtitles(vodId: number): SubtitleInfo[] {
    try {
      const outputDir = this.getOutputDir(vodId);
      const subtitlesInfoPath = path.join(outputDir, 'subtitles.json');
      
      if (fs.existsSync(subtitlesInfoPath)) {
        try {
          return JSON.parse(fs.readFileSync(subtitlesInfoPath, 'utf-8'));
        } catch {
          return [];
        }
      }
      return [];
    } catch (error) {
      logger.debug({ error, vodId }, 'Error getting subtitles, returning empty array');
      return [];
    }
  }

  /**
   * Get subtitle file path
   */
  getSubtitlePath(vodId: number, index: number): string | null {
    const outputDir = this.getOutputDir(vodId);
    const filename = `subtitle_${index}.vtt`;
    const filePath = path.join(outputDir, filename);
    
    if (fs.existsSync(filePath)) {
      return filePath;
    }
    return null;
  }

  /**
   * Get list of audio tracks from source file
   */
  getAudioTracks(vodId: number): AudioTrackInfo[] {
    try {
      const outputDir = this.getOutputDir(vodId);
      const audioInfoPath = path.join(outputDir, 'audio_tracks.json');
      
      if (fs.existsSync(audioInfoPath)) {
        try {
          return JSON.parse(fs.readFileSync(audioInfoPath, 'utf-8'));
        } catch {
          return [];
        }
      }
      return [];
    } catch (error) {
      logger.debug({ error, vodId }, 'Error getting audio tracks, returning empty array');
      return [];
    }
  }

  /**
   * Extract subtitles from source file using FFprobe and FFmpeg
   */
  private async extractSubtitles(vodId: number, sourcePath: string): Promise<SubtitleInfo[]> {
    const outputDir = this.getOutputDir(vodId);
    const subtitles: SubtitleInfo[] = [];

    return new Promise((resolve) => {
      // First, probe the file for subtitle streams
      const probeArgs = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 's',
        sourcePath
      ];

      const probe = spawn('ffprobe', probeArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let probeOutput = '';
      probe.stdout.on('data', (data) => {
        probeOutput += data.toString();
      });

      probe.on('close', async (code) => {
        if (code !== 0 || !probeOutput) {
          logger.info({ vodId, code, hasOutput: !!probeOutput, sourcePath }, 'No subtitles found or probe failed');
          resolve([]);
          return;
        }

        try {
          const data = JSON.parse(probeOutput);
          const streams = data.streams || [];

          if (streams.length === 0) {
            resolve([]);
            return;
          }

          logger.info({ vodId, count: streams.length }, 'Found subtitle streams, extracting...');

          // Extract each subtitle stream
          for (let i = 0; i < streams.length; i++) {
            const stream = streams[i];
            const tags = stream.tags || {};
            const filename = `subtitle_${stream.index}.vtt`;
            const outputPath = path.join(outputDir, filename);

            const subInfo: SubtitleInfo = {
              index: stream.index,
              language: tags.language || 'und',
              title: tags.title,
              isDefault: stream.disposition?.default === 1,
              isForced: stream.disposition?.forced === 1,
              filename
            };

            // Extract to WebVTT format
            const extractArgs = [
              '-i', sourcePath,
              '-map', `0:${stream.index}`,
              '-c:s', 'webvtt',
              '-y',
              outputPath
            ];

            await new Promise<void>((extractResolve) => {
              const extract = spawn('ffmpeg', extractArgs, {
                stdio: ['ignore', 'ignore', 'pipe']
              });

              extract.on('close', (extractCode) => {
                if (extractCode === 0 && fs.existsSync(outputPath)) {
                  subtitles.push(subInfo);
                  logger.info({ vodId, index: stream.index, language: subInfo.language }, 'Extracted subtitle');
                } else {
                  logger.warn({ vodId, index: stream.index }, 'Failed to extract subtitle');
                }
                extractResolve();
              });

              extract.on('error', () => extractResolve());
            });
          }

          // Save subtitle info
          if (subtitles.length > 0) {
            const subtitlesInfoPath = path.join(outputDir, 'subtitles.json');
            fs.writeFileSync(subtitlesInfoPath, JSON.stringify(subtitles, null, 2));
          }

          resolve(subtitles);
        } catch (error) {
          logger.error({ vodId, error }, 'Failed to parse subtitle probe output');
          resolve([]);
        }
      });

      probe.on('error', () => resolve([]));
    });
  }

  /**
   * Probe audio tracks from source file using FFprobe
   */
  private async probeAudioTracks(vodId: number, sourcePath: string): Promise<AudioTrackInfo[]> {
    const outputDir = this.getOutputDir(vodId);
    const audioTracks: AudioTrackInfo[] = [];

    // Ensure output directory exists before saving audio track info
    if (!fs.existsSync(outputDir)) {
      try {
        fs.mkdirSync(outputDir, { recursive: true });
      } catch (err) {
        logger.warn({ vodId, outputDir, error: err }, 'Failed to create output directory for audio probing');
      }
    }

    return new Promise((resolve) => {
      const probeArgs = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-select_streams', 'a',
        sourcePath
      ];

      const probe = spawn('ffprobe', probeArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let probeOutput = '';
      probe.stdout.on('data', (data) => {
        probeOutput += data.toString();
      });

      probe.on('close', (code) => {
        if (code !== 0 || !probeOutput) {
          logger.info({ vodId }, 'No audio tracks found or probe failed');
          resolve([]);
          return;
        }

        try {
          const data = JSON.parse(probeOutput);
          const streams = data.streams || [];

          for (const stream of streams) {
            const tags = stream.tags || {};
            audioTracks.push({
              index: stream.index,
              language: tags.language || 'und',
              title: tags.title,
              codec: stream.codec_name || 'unknown',
              channels: stream.channels || 2,
              sampleRate: parseInt(stream.sample_rate) || 48000,
              bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
              isDefault: stream.disposition?.default === 1
            });
          }

          // Save audio track info
          if (audioTracks.length > 0) {
            try {
              const audioInfoPath = path.join(outputDir, 'audio_tracks.json');
              fs.writeFileSync(audioInfoPath, JSON.stringify(audioTracks, null, 2));
              logger.info({ vodId, count: audioTracks.length, audioTracks }, 'Found and saved audio tracks');
            } catch (err) {
              logger.error({ vodId, outputDir, error: err }, 'Failed to save audio track info');
            }
          } else {
            logger.warn({ vodId, sourcePath }, 'No audio tracks found in source file');
          }

          resolve(audioTracks);
        } catch (error) {
          logger.error({ vodId, error }, 'Failed to parse audio probe output');
          resolve([]);
        }
      });

      probe.on('error', () => resolve([]));
    });
  }

  /**
   * Start HLS conversion with FFmpeg
   */
  private startConversion(vodId: number, sourcePath: string): HlsConversionJob {
    const outputDir = this.getOutputDir(vodId);
    const playlistPath = this.getPlaylistPath(vodId);

    // Create output directory (clean up any existing partial conversion)
    if (fs.existsSync(outputDir)) {
      logger.info({ vodId, outputDir }, 'Cleaning up existing HLS output directory');
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    try {
      fs.mkdirSync(outputDir, { recursive: true });
      logger.info({ vodId, outputDir }, 'Created HLS output directory');
    } catch (err) {
      logger.error({ vodId, outputDir, error: err }, 'Failed to create output directory');
      throw err;
    }

    const job: HlsConversionJob = {
      id: vodId,
      sourcePath,
      outputDir,
      status: 'converting',
      progress: 0,
      segmentsReady: 0,
      subtitles: [],
      audioTracks: [],
      startedAt: new Date()
    };

    // Start subtitle extraction in parallel (don't wait for it)
    this.extractSubtitles(vodId, sourcePath).then(subs => {
      job.subtitles = subs;
      logger.info({ vodId, subtitleCount: subs.length }, 'Subtitle extraction completed');
    }).catch(err => {
      logger.error({ vodId, error: err }, 'Subtitle extraction failed');
    });

    // Start audio track probing in parallel
    this.probeAudioTracks(vodId, sourcePath).then(tracks => {
      job.audioTracks = tracks;
      logger.info({ vodId, audioTrackCount: tracks.length }, 'Audio track probing completed');
    }).catch(err => {
      logger.error({ vodId, error: err }, 'Audio track probing failed');
    });

    // First probe the video codec and load settings
    Promise.all([
      this.probeVideoCodec(sourcePath),
      this.probeAudioTracks(vodId, sourcePath),
      getStreamingConfig()
    ]).then(([videoCodec, audioTracks, streamingConfig]) => {
      const hlsSegmentDuration = streamingConfig.hlsSegmentDuration;
      
      // Check if audio needs transcoding (browsers don't support EAC3/AC3/DTS)
      const incompatibleAudioCodecs = ['eac3', 'ac3', 'dts', 'dca', 'truehd', 'mlp'];
      const hasIncompatibleAudio = audioTracks.some(t => 
        incompatibleAudioCodecs.includes(t.codec.toLowerCase())
      );
      
      // Video: always copy (browsers support H.264, HEVC, AV1)
      // Audio: transcode to AAC if incompatible codec, otherwise copy
      const audioCodecMode = hasIncompatibleAudio ? 'aac' : 'copy';
      
      logger.info({ 
        vodId, 
        videoCodec, 
        audioTracks: audioTracks.length,
        hasIncompatibleAudio,
        audioCodecMode 
      }, hasIncompatibleAudio 
        ? 'Using video copy + audio transcode to AAC (incompatible audio codec detected)'
        : 'Using fast remux mode (no transcoding)');
      
      const ffmpegArgs: string[] = [
        '-threads', '0',
        '-fflags', '+genpts+discardcorrupt',
        '-i', sourcePath,
        '-map', '0:v:0',           // Map first video stream
        '-map', '0:a',             // Map all audio streams
        '-c:v', 'copy',            // Copy video (no re-encoding)
        '-c:a', audioCodecMode,    // Copy or transcode audio
      ];
      
      // If transcoding audio to AAC, add quality settings
      if (hasIncompatibleAudio) {
        ffmpegArgs.push(
          '-b:a', '192k',          // Audio bitrate per channel
          '-ar', '48000'           // Sample rate
        );
      }

      // Add language metadata for each audio track
      // Note: This must match the order of mapped audio streams
      audioTracks.forEach((track, idx) => {
        const lang = track.language || 'und';
        ffmpegArgs.push('-metadata:s:a:' + idx, `language=${lang}`);
        if (track.title) {
          ffmpegArgs.push('-metadata:s:a:' + idx, `title=${track.title}`);
        }
      });
      
      logger.info({ vodId, audioTracksCount: audioTracks.length, audioTracks, audioCodecMode }, 'Audio tracks for FFmpeg mapping');

      ffmpegArgs.push(
        '-f', 'hls',
        '-hls_time', String(hlsSegmentDuration),
        '-hls_playlist_type', 'vod',
        '-hls_segment_type', 'fmp4',
        '-hls_flags', 'independent_segments+program_date_time',
        '-hls_list_size', '0',
      );

      // Build variant stream map and create directories BEFORE running FFmpeg
      // For multi-audio HLS with FFmpeg var_stream_map:
      // - FFmpeg does NOT allow the same stream in multiple variant definitions
      // - So we use: video-only stream (v:0) + separate audio streams (a:0, a:1, etc.)
      // - HLS.js will automatically associate audio via the AUDIO group
      const varStreamMap: string[] = [];
      const streamNames: string[] = [];
      
      // Video-only stream - audio will be linked via EXT-X-MEDIA in master playlist
      // The agroup:audio links this video to the audio group for HLS.js
      varStreamMap.push('v:0,agroup:audio,name:v0');
      streamNames.push('v0');
      
      // Add all audio streams as separate variants
      // HLS.js will use the first one as default and allow switching
      if (audioTracks.length > 0) {
        audioTracks.forEach((track, idx) => {
          const name = `a${idx}`;
          // Each audio track gets its own variant, all in the same agroup for switching
          varStreamMap.push(`a:${idx},agroup:audio,name:${name},default:${idx === 0 ? 'yes' : 'no'}`);
          streamNames.push(name);
        });
        logger.info({ vodId, varStreamMap: varStreamMap.join(' ') }, 'Built variant stream map: video-only (v0) + separate audio tracks');
      } else {
        // Fallback: assume one audio stream exists (even if probing failed)
        logger.warn({ vodId }, 'No audio tracks probed, using fallback single audio stream');
        varStreamMap.push('a:0,agroup:audio,name:a0,default:yes');
        streamNames.push('a0');
      }

      // Create directories for each stream BEFORE running FFmpeg
      // FFmpeg doesn't auto-create directories, so we must create them
      for (const name of streamNames) {
        const streamDir = path.join(outputDir, `stream_${name}`);
        try {
          fs.mkdirSync(streamDir, { recursive: true });
          logger.debug({ vodId, streamDir }, 'Created stream directory');
        } catch (err) {
          logger.error({ vodId, streamDir, error: err }, 'Failed to create stream directory');
          throw err;
        }
      }

      ffmpegArgs.push(
        '-master_pl_name', 'master.m3u8',
        '-var_stream_map', varStreamMap.join(' '),
        '-hls_fmp4_init_filename', 'init_%v.mp4',
        '-hls_segment_filename', path.join(outputDir, 'stream_%v', 'seg_%06d.m4s'),
        path.join(outputDir, 'stream_%v', 'index.m3u8')
      );

      logger.info(`Starting HLS conversion for VOD ${vodId}: ${sourcePath}`);
      logger.debug(`FFmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);

      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      job.process = ffmpegProcess;

      // Parse FFmpeg stderr for progress and errors
      let duration = 0;
      let errorOutput = '';
      ffmpegProcess.stderr?.on('data', (data: Buffer) => {
        const output = data.toString();
        errorOutput += output;
        
        // Extract duration
        const durationMatch = output.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
        if (durationMatch) {
          const hours = parseInt(durationMatch[1]);
          const minutes = parseInt(durationMatch[2]);
          const seconds = parseInt(durationMatch[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
        }

        // Extract current time
        const timeMatch = output.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch && duration > 0) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseInt(timeMatch[3]);
          const currentTime = hours * 3600 + minutes * 60 + seconds;
          job.progress = Math.min(100, Math.round((currentTime / duration) * 100));
        }

        // Log errors immediately
        if (output.includes('Error') || output.includes('error:') || output.includes('Invalid')) {
          logger.error({ vodId, ffmpegOutput: output.trim() }, 'FFmpeg error detected');
        }

        // Update segment count
        job.segmentsReady = this.countSegments(vodId);
      });

      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          job.status = 'ready';
          job.progress = 100;
          job.segmentsReady = this.countSegments(vodId);
          job.completedAt = new Date();
          logger.info({ vodId, outputDir }, `HLS conversion completed for VOD ${vodId}`);
          
          // Verify master playlist was created
          const masterPath = path.join(outputDir, 'master.m3u8');
          if (!fs.existsSync(masterPath)) {
            logger.warn({ vodId, masterPath }, 'Master playlist not found after conversion');
          }
        } else {
          job.status = 'error';
          // Extract last few lines of error output for better debugging
          const errorLines = errorOutput.split('\n').filter(l => l.trim()).slice(-10).join('\n');
          job.error = `FFmpeg exited with code ${code}. Last output: ${errorLines}`;
          logger.error({ 
            vodId, 
            code, 
            errorOutput: errorLines,
            ffmpegCommand: ffmpegArgs.join(' '),
            outputDir,
            audioTracksCount: audioTracks.length
          }, `HLS conversion failed for VOD ${vodId}`);
        }
        delete job.process;
      });

      ffmpegProcess.on('error', (error) => {
        job.status = 'error';
        job.error = error.message;
        logger.error(`HLS conversion error for VOD ${vodId}: ${error.message}`);
        delete job.process;
      });
    }).catch(err => {
      job.status = 'error';
      job.error = `Failed to probe video: ${err.message}`;
      logger.error({ vodId, error: err }, 'Failed to probe video codec');
    });

    activeJobs.set(vodId, job);
    return job;
  }

  /**
   * Probe video codec from source file
   */
  private async probeVideoCodec(sourcePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const probeArgs = [
        '-v', 'quiet',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'csv=p=0',
        sourcePath
      ];

      const probe = spawn('ffprobe', probeArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let output = '';
      probe.stdout.on('data', (data) => {
        output += data.toString();
      });

      probe.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim().split('\n')[0] || 'unknown');
        } else {
          reject(new Error(`ffprobe exited with code ${code}`));
        }
      });

      probe.on('error', reject);
    });
  }

  /**
   * Wait for minimum segments to be available
   */
  async waitForMinimumSegments(vodId: number, minSegments: number = 3, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      if (this.hasMinimumSegments(vodId, minSegments)) {
        return true;
      }
      
      // Check if job failed
      const job = activeJobs.get(vodId);
      if (job && job.status === 'error') {
        return false;
      }
      
      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return false;
  }

  /**
   * Get current job status
   */
  getJobStatus(vodId: number): HlsConversionJob | null {
    return activeJobs.get(vodId) || null;
  }

  /**
   * Cancel a running conversion
   */
  cancelConversion(vodId: number): boolean {
    const job = activeJobs.get(vodId);
    if (job && job.process) {
      job.process.kill('SIGTERM');
      activeJobs.delete(vodId);
      return true;
    }
    return false;
  }

  /**
   * Clean up HLS output for a VOD
   */
  cleanupHlsOutput(vodId: number): boolean {
    const outputDir = this.getOutputDir(vodId);
    
    // Cancel any running conversion first
    this.cancelConversion(vodId);
    
    if (fs.existsSync(outputDir)) {
      try {
        fs.rmSync(outputDir, { recursive: true, force: true });
        return true;
      } catch (error) {
        logger.error(`Failed to cleanup HLS for VOD ${vodId}: ${error}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Get all active jobs
   */
  getAllJobs(): HlsConversionJob[] {
    return Array.from(activeJobs.values()).map(job => ({
      ...job,
      process: undefined // Don't include process in response
    }));
  }

  /**
   * Clear a failed job from cache (allows retry)
   */
  clearFailedJob(vodId: number): boolean {
    const job = activeJobs.get(vodId);
    if (job && job.status === 'error') {
      activeJobs.delete(vodId);
      logger.info({ vodId, previousError: job.error }, 'Cleared failed job from cache');
      return true;
    }
    return false;
  }

  /**
   * Clear all failed jobs from cache
   */
  clearAllFailedJobs(): number {
    let clearedCount = 0;
    for (const [vodId, job] of activeJobs.entries()) {
      if (job.status === 'error') {
        activeJobs.delete(vodId);
        clearedCount++;
        logger.info({ vodId, previousError: job.error }, 'Cleared failed job from cache');
      }
    }
    logger.info({ clearedCount }, 'Cleared all failed jobs from cache');
    return clearedCount;
  }

  /**
   * Get failed jobs count
   */
  getFailedJobsCount(): number {
    let count = 0;
    for (const job of activeJobs.values()) {
      if (job.status === 'error') {
        count++;
      }
    }
    return count;
  }
}

export const vodToHlsService = VodToHlsService.getInstance();
