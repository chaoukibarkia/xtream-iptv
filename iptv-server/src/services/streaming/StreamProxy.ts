import { PassThrough, Readable } from 'stream';
import { spawn, ChildProcess } from 'child_process';
import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';

export interface TranscodeProfile {
  name: string;
  videoCodec: string;
  videoBitrate: string;
  resolution?: string;
  preset: string;
  audioCodec: string;
  audioBitrate: string;
}

export const TRANSCODE_PROFILES: Record<string, TranscodeProfile> = {
  passthrough: {
    name: 'passthrough',
    videoCodec: 'copy',
    videoBitrate: '',
    preset: '',
    audioCodec: 'copy',
    audioBitrate: '',
  },
  h264_360p: {
    name: 'h264_360p',
    videoCodec: 'libx264',
    videoBitrate: '800k',
    resolution: '640x360',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '96k',
  },
  h264_480p: {
    name: 'h264_480p',
    videoCodec: 'libx264',
    videoBitrate: '1500k',
    resolution: '854x480',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '128k',
  },
  h264_720p: {
    name: 'h264_720p',
    videoCodec: 'libx264',
    videoBitrate: '2500k',
    resolution: '1280x720',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '128k',
  },
  h264_1080p: {
    name: 'h264_1080p',
    videoCodec: 'libx264',
    videoBitrate: '5000k',
    resolution: '1920x1080',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '192k',
  },
};

export interface ProxyOptions {
  timeout?: number;
  userAgent?: string;
  referer?: string;
  headers?: Record<string, string>;
}

export interface StreamSession {
  id: string;
  streamId: number;
  userId: number;
  startedAt: Date;
  process?: ChildProcess;
  stop: () => void;
}

export class StreamProxy {
  private activeSessions: Map<string, StreamSession> = new Map();

  /**
   * Proxy a live stream directly (no transcoding)
   */
  async proxyStream(
    source: string,
    options: ProxyOptions = {}
  ): Promise<Readable> {
    const {
      timeout = 30000,
      userAgent = 'IPTV-Server/1.0',
      referer,
      headers = {},
    } = options;

    const requestHeaders: Record<string, string> = {
      'User-Agent': userAgent,
      ...headers,
    };

    if (referer) {
      requestHeaders['Referer'] = referer;
    }

    try {
      const response = await axios({
        method: 'get',
        url: source,
        responseType: 'stream',
        timeout,
        headers: requestHeaders,
        maxRedirects: 5,
      });

      const passthrough = new PassThrough();
      
      response.data.on('error', (err: Error) => {
        logger.error({ error: err, source }, 'Source stream error');
        passthrough.destroy(err);
      });

      response.data.on('end', () => {
        logger.debug({ source }, 'Source stream ended');
      });

      response.data.pipe(passthrough);

      return passthrough;
    } catch (error) {
      logger.error({ error, source }, 'Failed to proxy stream');
      throw error;
    }
  }

  /**
   * Transcode a stream using FFmpeg
   */
  transcodeStream(
    source: string,
    profile: string | TranscodeProfile,
    outputFormat: 'mpegts' | 'hls' = 'mpegts'
  ): { stream: Readable; process: ChildProcess } {
    const transcodeProfile = typeof profile === 'string' 
      ? TRANSCODE_PROFILES[profile] || TRANSCODE_PROFILES.passthrough
      : profile;

    const ffmpegArgs = this.buildFFmpegArgs(source, transcodeProfile, outputFormat);
    
    logger.debug({ source, profile: transcodeProfile.name, args: ffmpegArgs }, 'Starting FFmpeg transcode');

    const ffmpeg = spawn(config.ffmpeg.path, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      const message = data.toString();
      // Only log errors, not progress
      if (message.includes('Error') || message.includes('error')) {
        logger.error({ message }, 'FFmpeg error');
      }
    });

    ffmpeg.on('error', (err) => {
      logger.error({ error: err }, 'FFmpeg process error');
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0 && code !== null) {
        logger.warn({ code }, 'FFmpeg exited with non-zero code');
      }
    });

    return { stream: ffmpeg.stdout!, process: ffmpeg };
  }

  /**
   * Build FFmpeg command arguments
   */
  private buildFFmpegArgs(
    source: string,
    profile: TranscodeProfile,
    outputFormat: 'mpegts' | 'hls'
  ): string[] {
    const args: string[] = [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', source,
    ];

    if (profile.name === 'passthrough') {
      args.push('-c', 'copy');
    } else {
      // Video settings
      args.push('-c:v', profile.videoCodec);
      if (profile.videoBitrate) {
        args.push('-b:v', profile.videoBitrate);
      }
      if (profile.resolution) {
        args.push('-s', profile.resolution);
      }
      if (profile.preset) {
        args.push('-preset', profile.preset);
      }

      // Audio settings
      args.push('-c:a', profile.audioCodec);
      if (profile.audioBitrate) {
        args.push('-b:a', profile.audioBitrate);
      }
    }

    // Output format
    if (outputFormat === 'mpegts') {
      args.push('-f', 'mpegts', '-');
    } else if (outputFormat === 'hls') {
      args.push(
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        '-'
      );
    }

    return args;
  }

  /**
   * Create a stream session
   */
  createSession(
    sessionId: string,
    streamId: number,
    userId: number,
    process?: ChildProcess
  ): StreamSession {
    const session: StreamSession = {
      id: sessionId,
      streamId,
      userId,
      startedAt: new Date(),
      process,
      stop: () => {
        if (process) {
          process.kill('SIGTERM');
        }
        this.activeSessions.delete(sessionId);
      },
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Get active session
   */
  getSession(sessionId: string): StreamSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Stop a session
   */
  stopSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.stop();
    }
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  /**
   * Check if a source URL is accessible
   */
  async checkSourceHealth(url: string): Promise<{
    online: boolean;
    latency: number;
    statusCode?: number;
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      const response = await axios.head(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'IPTV-HealthCheck/1.0' },
        maxRedirects: 3,
      });

      return {
        online: response.status >= 200 && response.status < 300,
        latency: Date.now() - startTime,
        statusCode: response.status,
      };
    } catch (error: any) {
      return {
        online: false,
        latency: Date.now() - startTime,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const streamProxy = new StreamProxy();
