import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import { EventEmitter } from 'events';

export interface VodTranscodeJob {
  streamId: number;
  sourceUrl: string;
  outputDir: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
}

interface TranscodeOptions {
  videoCodec?: string;
  audioCodec?: string;
  videoBitrate?: string;
  audioBitrate?: string;
  resolution?: string;
  segmentDuration?: number;
}

class VodTranscoder extends EventEmitter {
  private activeJobs: Map<number, VodTranscodeJob> = new Map();
  private ffmpegProcesses: Map<number, ChildProcess> = new Map();
  private hlsOutputBase: string;

  constructor() {
    super();
    this.hlsOutputBase = path.join(config.ffmpeg.hlsSegmentPath, 'vod');
  }

  /**
   * Check if a source URL needs HLS conversion
   */
  needsConversion(sourceUrl: string): boolean {
    const url = sourceUrl.toLowerCase();
    // MP4, MKV, AVI, and other file formats need conversion
    const fileExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
    return fileExtensions.some(ext => url.endsWith(ext) || url.includes(ext + '?'));
  }

  /**
   * Check if HLS output already exists for a stream
   */
  async hasHlsOutput(streamId: number): Promise<boolean> {
    const outputDir = path.join(this.hlsOutputBase, `stream_${streamId}`);
    const playlistPath = path.join(outputDir, 'master.m3u8');
    
    try {
      await fs.access(playlistPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the HLS playlist URL for a stream
   */
  getHlsUrl(streamId: number): string {
    return `/hls/vod/stream_${streamId}/master.m3u8`;
  }

  /**
   * Get the output directory for a stream's HLS files
   */
  getOutputDir(streamId: number): string {
    return path.join(this.hlsOutputBase, `stream_${streamId}`);
  }

  /**
   * Start transcoding a VOD to HLS
   */
  async transcode(streamId: number, sourceUrl: string, options: TranscodeOptions = {}): Promise<VodTranscodeJob> {
    // Check if already processing
    const existingJob = this.activeJobs.get(streamId);
    if (existingJob && existingJob.status === 'processing') {
      logger.warn({ streamId }, 'Transcode job already in progress');
      return existingJob;
    }

    const outputDir = this.getOutputDir(streamId);
    
    // Create job
    const job: VodTranscodeJob = {
      streamId,
      sourceUrl,
      outputDir,
      status: 'pending',
      progress: 0,
      startedAt: new Date(),
    };
    
    this.activeJobs.set(streamId, job);

    try {
      // Create output directory
      await fs.mkdir(outputDir, { recursive: true });

      // Resolve source URL to absolute path if it's a local file
      let resolvedSource = sourceUrl;
      if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
        // Remote URL - no transformation
      } else if (sourceUrl.startsWith('/') && await this.fileExists(sourceUrl)) {
        // Absolute path that exists - use as is
      } else if (sourceUrl.startsWith('/api-proxy/media/') || sourceUrl.startsWith('/media/')) {
        const filename = sourceUrl.replace('/api-proxy/media/', '').replace('/media/', '');
        const moviesPath = path.join(config.media.moviesPath, filename);
        const mediaPath = path.join(config.media.path, filename);
        if (await this.fileExists(moviesPath)) {
          resolvedSource = moviesPath;
        } else if (await this.fileExists(mediaPath)) {
          resolvedSource = mediaPath;
        } else {
          resolvedSource = moviesPath;
        }
      } else if (sourceUrl.startsWith('/')) {
        // Absolute path - use as is
        resolvedSource = sourceUrl;
      } else {
        // Relative path - resolve to configured media folders
        const moviesPath = path.join(config.media.moviesPath, sourceUrl);
        const mediaPath = path.join(config.media.path, sourceUrl);
        if (await this.fileExists(moviesPath)) {
          resolvedSource = moviesPath;
        } else if (await this.fileExists(mediaPath)) {
          resolvedSource = mediaPath;
        } else {
          resolvedSource = moviesPath;
        }
      }

      // Build FFmpeg arguments for HLS output
      const args = this.buildFfmpegArgs(resolvedSource, outputDir, options);

      logger.info({ streamId, sourceUrl: resolvedSource, outputDir }, 'Starting VOD transcode to HLS');

      job.status = 'processing';
      this.emit('started', job);

      const ffmpeg = spawn(config.ffmpeg.path, args);
      this.ffmpegProcesses.set(streamId, ffmpeg);

      let duration: number | null = null;
      let currentTime: number = 0;

      ffmpeg.stderr?.on('data', (data: Buffer) => {
        const message = data.toString();
        
        // Parse duration
        const durationMatch = message.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
        if (durationMatch && !duration) {
          duration = parseInt(durationMatch[1]) * 3600 + 
                     parseInt(durationMatch[2]) * 60 + 
                     parseInt(durationMatch[3]);
        }

        // Parse current time for progress
        const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2})/);
        if (timeMatch && duration) {
          currentTime = parseInt(timeMatch[1]) * 3600 + 
                        parseInt(timeMatch[2]) * 60 + 
                        parseInt(timeMatch[3]);
          job.progress = Math.min(100, Math.round((currentTime / duration) * 100));
          this.emit('progress', job);
        }

        // Check for errors
        if (message.includes('Error') || message.includes('error:')) {
          logger.error({ streamId, message: message.trim() }, 'FFmpeg error during transcode');
        }
      });

      await new Promise<void>((resolve, reject) => {
        ffmpeg.on('close', (code) => {
          this.ffmpegProcesses.delete(streamId);
          
          if (code === 0) {
            job.status = 'completed';
            job.progress = 100;
            job.completedAt = new Date();
            logger.info({ streamId, duration: job.completedAt.getTime() - job.startedAt!.getTime() }, 'VOD transcode completed');
            this.emit('completed', job);
            resolve();
          } else {
            job.status = 'failed';
            job.error = `FFmpeg exited with code ${code}`;
            logger.error({ streamId, code }, 'VOD transcode failed');
            this.emit('failed', job);
            reject(new Error(job.error));
          }
        });

        ffmpeg.on('error', (err) => {
          this.ffmpegProcesses.delete(streamId);
          job.status = 'failed';
          job.error = err.message;
          this.emit('failed', job);
          reject(err);
        });
      });

      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error';
      this.emit('failed', job);
      throw error;
    }
  }

  /**
   * Build FFmpeg arguments for HLS transcoding
   */
  private buildFfmpegArgs(sourceUrl: string, outputDir: string, options: TranscodeOptions): string[] {
    const {
      videoCodec = 'libx264',
      audioCodec = 'aac',
      videoBitrate = '2500k',
      audioBitrate = '128k',
      resolution,
      segmentDuration = 4,
    } = options;

    const masterPlaylist = path.join(outputDir, 'master.m3u8');
    const segmentPattern = path.join(outputDir, 'segment_%05d.ts');

    const args: string[] = [
      '-y',                             // Overwrite output files
      '-i', sourceUrl,                  // Input file
      
      // Video encoding
      '-c:v', videoCodec,
      '-preset', 'fast',
      '-b:v', videoBitrate,
      '-maxrate', videoBitrate,
      '-bufsize', `${parseInt(videoBitrate) * 2}k`,
      
      // Audio encoding  
      '-c:a', audioCodec,
      '-b:a', audioBitrate,
      '-ar', '48000',
      
      // HLS settings with fMP4 segments for better streaming
      '-f', 'hls',
      '-hls_time', segmentDuration.toString(),
      '-hls_list_size', '0',           // Keep all segments
      '-hls_segment_type', 'fmp4',     // Use fragmented MP4 for faster startup
      '-hls_fmp4_init_filename', 'init.mp4',
      '-movflags', '+faststart+frag_keyframe+empty_moov+default_base_moof',
      '-hls_segment_filename', segmentPattern.replace('.ts', '.m4s'),
      '-hls_playlist_type', 'vod',
      
      // Ensure keyframes at segment boundaries
      '-force_key_frames', `expr:gte(t,n_forced*${segmentDuration})`,
      
      masterPlaylist
    ];

    // Add resolution scaling if specified
    if (resolution) {
      const scaleIndex = args.indexOf('-c:v') + 2;
      args.splice(scaleIndex, 0, '-vf', `scale=${resolution}`);
    }

    return args;
  }

  /**
   * Cancel an active transcode job
   */
  async cancelJob(streamId: number): Promise<void> {
    const ffmpeg = this.ffmpegProcesses.get(streamId);
    if (ffmpeg) {
      ffmpeg.kill('SIGTERM');
      this.ffmpegProcesses.delete(streamId);
    }

    const job = this.activeJobs.get(streamId);
    if (job) {
      job.status = 'failed';
      job.error = 'Cancelled by user';
      this.emit('cancelled', job);
    }
  }

  /**
   * Delete HLS output for a stream
   */
  async deleteOutput(streamId: number): Promise<void> {
    const outputDir = this.getOutputDir(streamId);
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
      logger.info({ streamId, outputDir }, 'Deleted HLS output');
    } catch (error) {
      logger.error({ streamId, error }, 'Failed to delete HLS output');
    }
  }

  /**
   * Get job status
   */
  getJobStatus(streamId: number): VodTranscodeJob | undefined {
    return this.activeJobs.get(streamId);
  }

  /**
   * Get all active jobs
   */
  getAllJobs(): VodTranscodeJob[] {
    return Array.from(this.activeJobs.values());
  }

  /**
   * Check if transcoding is in progress for a stream
   */
  isTranscoding(streamId: number): boolean {
    const job = this.activeJobs.get(streamId);
    return job?.status === 'processing';
  }
}

export const vodTranscoder = new VodTranscoder();
