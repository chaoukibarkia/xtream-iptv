import { spawn } from 'child_process';
import axios from 'axios';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';

export interface StreamCodec {
  index: number;
  codec_name: string;
  codec_long_name: string;
  codec_type: 'video' | 'audio' | 'subtitle' | 'data';
  profile?: string;
  level?: number;
  width?: number;
  height?: number;
  display_aspect_ratio?: string;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  duration?: string;
  language?: string;
  title?: string;
}

export interface StreamProbeResult {
  success: boolean;
  url: string;
  format?: {
    format_name: string;
    format_long_name: string;
    duration: number;
    size: number;
    bit_rate: number;
    probe_score: number;
    start_time: number;
  };
  streams: StreamCodec[];
  video?: {
    codec: string;
    profile?: string;
    resolution: string;
    width: number;
    height: number;
    aspect_ratio?: string;
    frame_rate: string;
    bit_rate?: number;
    pixel_format?: string;
  };
  audio?: {
    codec: string;
    sample_rate?: number;
    channels?: number;
    channel_layout?: string;
    bit_rate?: number;
    language?: string;
  };
  metadata?: Record<string, string>;
  error?: string;
  probeTime: number;
}

export interface SimpleHealthResult {
  online: boolean;
  method: 'http' | 'ffprobe';
  latency: number;
  statusCode?: number;
  contentType?: string;
  error?: string;
}

const PROBE_TIMEOUT = 30000; // 30 seconds - allow time for on-demand streams to start
const HTTP_TIMEOUT = 10000;  // 10 seconds
const CACHE_TTL = 300;       // 5 minutes cache

class StreamProber {
  /**
   * Full probe with ffprobe - returns all stream information
   */
  async probe(url: string, useCache = true, userAgent?: string): Promise<StreamProbeResult> {
    const startTime = Date.now();

    // Check cache (include userAgent in cache key if provided)
    const cacheKey = userAgent ? `probe:${url}:${userAgent}` : `probe:${url}`;
    if (useCache) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    return new Promise((resolve) => {
      const ffprobePath = config.ffmpeg.path.replace('ffmpeg', 'ffprobe');
      
      // Build ffprobe arguments
      const ffprobeArgs = [
        '-v', 'error',  // Show errors (not quiet) so we can capture failure reasons
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-show_entries', 'stream_tags',
        '-analyzeduration', '5000000',
        '-probesize', '5000000',
      ];
      
      // Add user agent if provided
      if (userAgent) {
        ffprobeArgs.push('-user_agent', userAgent);
      }
      
      ffprobeArgs.push('-i', url);
      
      const ffprobe = spawn(ffprobePath, ffprobeArgs);

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        ffprobe.kill('SIGKILL');
        resolve({
          success: false,
          url,
          streams: [],
          error: 'Probe timeout - stream may be offline or slow to respond',
          probeTime: Date.now() - startTime,
        });
      }, PROBE_TIMEOUT);

      ffprobe.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', async (code) => {
        clearTimeout(timeout);
        const probeTime = Date.now() - startTime;

        if (code === 0 && stdout) {
          try {
            const data = JSON.parse(stdout);
            const result = this.parseProbeData(url, data, probeTime);
            
            // Cache the result
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
            
            resolve(result);
          } catch (e) {
            resolve({
              success: false,
              url,
              streams: [],
              error: 'Failed to parse probe data',
              probeTime,
            });
          }
        } else {
          resolve({
            success: false,
            url,
            streams: [],
            error: stderr || `FFprobe exited with code ${code}`,
            probeTime,
          });
        }
      });

      ffprobe.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          success: false,
          url,
          streams: [],
          error: `FFprobe error: ${err.message}`,
          probeTime: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Parse ffprobe JSON output into our structured result
   */
  private parseProbeData(url: string, data: any, probeTime: number): StreamProbeResult {
    const streams: StreamCodec[] = (data.streams || []).map((s: any) => ({
      index: s.index,
      codec_name: s.codec_name,
      codec_long_name: s.codec_long_name,
      codec_type: s.codec_type,
      profile: s.profile,
      level: s.level,
      width: s.width,
      height: s.height,
      display_aspect_ratio: s.display_aspect_ratio,
      pix_fmt: s.pix_fmt,
      r_frame_rate: s.r_frame_rate,
      avg_frame_rate: s.avg_frame_rate,
      bit_rate: s.bit_rate,
      sample_rate: s.sample_rate,
      channels: s.channels,
      channel_layout: s.channel_layout,
      duration: s.duration,
      language: s.tags?.language,
      title: s.tags?.title,
    }));

    // Extract video stream info
    const videoStream = streams.find(s => s.codec_type === 'video');
    const audioStream = streams.find(s => s.codec_type === 'audio');

    const video = videoStream ? {
      codec: videoStream.codec_name,
      profile: videoStream.profile,
      resolution: `${videoStream.width}x${videoStream.height}`,
      width: videoStream.width!,
      height: videoStream.height!,
      aspect_ratio: videoStream.display_aspect_ratio,
      frame_rate: this.parseFrameRate(videoStream.r_frame_rate || videoStream.avg_frame_rate),
      bit_rate: videoStream.bit_rate ? parseInt(videoStream.bit_rate) : undefined,
      pixel_format: videoStream.pix_fmt,
    } : undefined;

    const audio = audioStream ? {
      codec: audioStream.codec_name,
      sample_rate: audioStream.sample_rate ? parseInt(audioStream.sample_rate) : undefined,
      channels: audioStream.channels,
      channel_layout: audioStream.channel_layout,
      bit_rate: audioStream.bit_rate ? parseInt(audioStream.bit_rate) : undefined,
      language: audioStream.language,
    } : undefined;

    const format = data.format ? {
      format_name: data.format.format_name,
      format_long_name: data.format.format_long_name,
      duration: parseFloat(data.format.duration) || 0,
      size: parseInt(data.format.size) || 0,
      bit_rate: parseInt(data.format.bit_rate) || 0,
      probe_score: data.format.probe_score || 0,
      start_time: parseFloat(data.format.start_time) || 0,
    } : undefined;

    return {
      success: true,
      url,
      format,
      streams,
      video,
      audio,
      metadata: data.format?.tags,
      probeTime,
    };
  }

  /**
   * Parse frame rate string (e.g., "30000/1001") to readable format
   */
  private parseFrameRate(rate?: string): string {
    if (!rate) return 'unknown';
    
    const parts = rate.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (den > 0) {
        return (num / den).toFixed(2) + ' fps';
      }
    }
    return rate;
  }

  /**
   * Quick health check without FFmpeg (HTTP HEAD/GET)
   */
  async checkHealthHttp(url: string, userAgent?: string): Promise<SimpleHealthResult> {
    const startTime = Date.now();

    try {
      // First try HEAD request
      const response = await axios.head(url, {
        timeout: HTTP_TIMEOUT,
        validateStatus: () => true,
        maxRedirects: 5,
        headers: {
          'User-Agent': userAgent || 'IPTV-HealthCheck/2.0',
        },
      });

      const latency = Date.now() - startTime;
      const contentType = response.headers['content-type'] || '';
      
      // Check for valid stream content types
      const isValid = 
        response.status >= 200 && response.status < 400 &&
        (contentType.includes('video') ||
         contentType.includes('audio') ||
         contentType.includes('mpegurl') ||
         contentType.includes('octet-stream') ||
         contentType.includes('mpeg') ||
         contentType.includes('mp4') ||
         contentType.includes('x-flv'));

      return {
        online: isValid,
        method: 'http',
        latency,
        statusCode: response.status,
        contentType,
        error: isValid ? undefined : `Invalid content type or status: ${response.status}`,
      };
    } catch (error: any) {
      return {
        online: false,
        method: 'http',
        latency: Date.now() - startTime,
        error: error.message || 'HTTP request failed',
      };
    }
  }

  /**
   * Quick health check with FFmpeg probe
   */
  async checkHealthFfprobe(url: string, userAgent?: string): Promise<SimpleHealthResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const ffprobePath = config.ffmpeg.path.replace('ffmpeg', 'ffprobe');
      
      // Build ffprobe arguments
      const ffprobeArgs = [
        '-v', 'error',
        '-show_entries', 'stream=codec_type',
        '-of', 'csv=p=0',
      ];
      
      // Add user agent if provided
      if (userAgent) {
        ffprobeArgs.push('-user_agent', userAgent);
      }
      
      ffprobeArgs.push('-i', url);
      
      const ffprobe = spawn(ffprobePath, ffprobeArgs);

      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        ffprobe.kill('SIGKILL');
        resolve({
          online: false,
          method: 'ffprobe',
          latency: Date.now() - startTime,
          error: 'FFprobe timeout',
        });
      }, HTTP_TIMEOUT);

      ffprobe.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          resolve({
            online: true,
            method: 'ffprobe',
            latency,
          });
        } else {
          resolve({
            online: false,
            method: 'ffprobe',
            latency,
            error: stderr || `Exit code: ${code}`,
          });
        }
      });

      ffprobe.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          online: false,
          method: 'ffprobe',
          latency: Date.now() - startTime,
          error: err.message,
        });
      });
    });
  }

  /**
   * Combined health check - tries HTTP first, then FFprobe
   */
  async checkHealth(url: string, useFfprobe = true, userAgent?: string): Promise<SimpleHealthResult> {
    // Try HTTP first (faster)
    const httpResult = await this.checkHealthHttp(url, userAgent);
    
    if (httpResult.online) {
      return httpResult;
    }

    // If HTTP fails and FFprobe is enabled, try FFprobe
    if (useFfprobe) {
      const ffprobeResult = await this.checkHealthFfprobe(url, userAgent);
      return ffprobeResult;
    }

    return httpResult;
  }

  /**
   * Clear probe cache for a URL
   */
  async clearCache(url: string): Promise<void> {
    await redis.del(`probe:${url}`);
  }
}

// Export singleton
export const streamProber = new StreamProber();

