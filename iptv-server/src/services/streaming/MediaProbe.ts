import { spawn } from 'child_process';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import { existsSync } from 'fs';
import * as path from 'path';

export interface VideoTrack {
  index: number;
  codec: string;
  codecLong: string;
  width: number;
  height: number;
  frameRate: string;
  bitrate?: number;
  profile?: string;
  level?: string;
  pixelFormat?: string;
  colorSpace?: string;
  hdr?: boolean;
}

export interface AudioTrack {
  index: number;
  codec: string;
  codecLong: string;
  channels: number;
  channelLayout?: string;
  sampleRate: number;
  bitrate?: number;
  language?: string;
  title?: string;
  isDefault?: boolean;
}

export interface SubtitleTrack {
  index: number;
  codec: string;
  codecLong: string;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface MediaInfo {
  format: string;
  formatLong: string;
  duration: number;
  size: number;
  bitrate: number;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  chapters?: { start: number; end: number; title?: string }[];
}

export class MediaProbeService {
  private static instance: MediaProbeService;

  private constructor() {}

  static getInstance(): MediaProbeService {
    if (!MediaProbeService.instance) {
      MediaProbeService.instance = new MediaProbeService();
    }
    return MediaProbeService.instance;
  }

  /**
   * Resolve a source URL/path to an actual file path
   */
  resolveSourcePath(sourceUrl: string): string {
    // Handle API proxy paths for media
    if (sourceUrl.startsWith('/api-proxy/media/')) {
      const filename = sourceUrl.replace('/api-proxy/media/', '');
      // Check in movies folder first, then series
      const moviesPath = path.join(config.media.moviesPath, decodeURIComponent(filename));
      if (existsSync(moviesPath)) {
        return moviesPath;
      }
      const seriesPath = path.join(config.media.seriesPath, decodeURIComponent(filename));
      if (existsSync(seriesPath)) {
        return seriesPath;
      }
      // Fall back to base media path
      return path.join(config.media.path, decodeURIComponent(filename));
    } else if (sourceUrl.startsWith('/media/')) {
      // Path already includes /media/ - check if it's an absolute path that exists
      if (existsSync(sourceUrl)) {
        return sourceUrl;
      }
      // If not found, try extracting the relative part and checking in configured paths
      const relativePath = sourceUrl.replace('/media/', '');
      const moviesPath = path.join(config.media.moviesPath, decodeURIComponent(relativePath));
      if (existsSync(moviesPath)) {
        return moviesPath;
      }
      const seriesPath = path.join(config.media.seriesPath, decodeURIComponent(relativePath));
      if (existsSync(seriesPath)) {
        return seriesPath;
      }
      // Return the original path as fallback (might be correct but not accessible yet)
      return sourceUrl;
    } else if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
      // Remote URL - FFprobe can handle directly
      return sourceUrl;
    } else if (sourceUrl.startsWith('/')) {
      // Absolute file system path - check if it exists first
      if (existsSync(sourceUrl)) {
        return sourceUrl;
      }
      // If absolute path doesn't exist, try treating it as relative to media paths
      const relativePath = sourceUrl.startsWith('/media/') ? sourceUrl.replace('/media/', '') : sourceUrl.substring(1);
      const moviesPath = path.join(config.media.moviesPath, relativePath);
      if (existsSync(moviesPath)) {
        return moviesPath;
      }
      const seriesPath = path.join(config.media.seriesPath, relativePath);
      if (existsSync(seriesPath)) {
        return seriesPath;
      }
      // Return original path as fallback
      return sourceUrl;
    } else {
      // Relative path - check in movies, series, then base media path
      const moviesPath = path.join(config.media.moviesPath, sourceUrl);
      if (existsSync(moviesPath)) {
        return moviesPath;
      }
      const seriesPath = path.join(config.media.seriesPath, sourceUrl);
      if (existsSync(seriesPath)) {
        return seriesPath;
      }
      return path.join(config.media.path, sourceUrl);
    }
  }

  /**
   * Probe a media file and return detailed track information
   */
  async probeMedia(sourceUrl: string): Promise<MediaInfo> {
    const sourcePath = this.resolveSourcePath(sourceUrl);

    // For local files, check if it exists
    if (!sourcePath.startsWith('http://') && !sourcePath.startsWith('https://')) {
      if (!existsSync(sourcePath)) {
        throw new Error(`File not found: ${sourcePath}`);
      }
    }

    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        '-show_chapters',
        sourcePath
      ];

      logger.debug(`Running ffprobe: ${args.join(' ')}`);

      const ffprobe = spawn('ffprobe', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          logger.error(`FFprobe failed: ${stderr}`);
          reject(new Error(`FFprobe failed with code ${code}: ${stderr}`));
          return;
        }

        try {
          const probeData = JSON.parse(stdout);
          const mediaInfo = this.parseProbeData(probeData);
          resolve(mediaInfo);
        } catch (error) {
          logger.error(`Failed to parse FFprobe output: ${error}`);
          reject(new Error(`Failed to parse FFprobe output: ${error}`));
        }
      });

      ffprobe.on('error', (error) => {
        logger.error(`FFprobe error: ${error}`);
        reject(error);
      });
    });
  }

  /**
   * Parse FFprobe JSON output into MediaInfo
   */
  private parseProbeData(data: any): MediaInfo {
    const format = data.format || {};
    const streams = data.streams || [];
    const chapters = data.chapters || [];

    const videoTracks: VideoTrack[] = [];
    const audioTracks: AudioTrack[] = [];
    const subtitleTracks: SubtitleTrack[] = [];

    for (const stream of streams) {
      if (stream.codec_type === 'video' && stream.codec_name !== 'mjpeg') {
        // Skip embedded images (album art, etc.)
        const frameRateParts = (stream.avg_frame_rate || stream.r_frame_rate || '0/1').split('/');
        const frameRate = frameRateParts[1] !== '0' 
          ? (parseInt(frameRateParts[0]) / parseInt(frameRateParts[1])).toFixed(2)
          : '0';

        // Check for HDR
        const isHdr = stream.color_transfer === 'smpte2084' || 
                      stream.color_transfer === 'arib-std-b67' ||
                      stream.color_primaries === 'bt2020';

        videoTracks.push({
          index: stream.index,
          codec: stream.codec_name,
          codecLong: stream.codec_long_name || stream.codec_name,
          width: stream.width,
          height: stream.height,
          frameRate: `${frameRate} fps`,
          bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
          profile: stream.profile,
          level: stream.level?.toString(),
          pixelFormat: stream.pix_fmt,
          colorSpace: stream.color_space,
          hdr: isHdr,
        });
      } else if (stream.codec_type === 'audio') {
        const tags = stream.tags || {};
        audioTracks.push({
          index: stream.index,
          codec: stream.codec_name,
          codecLong: stream.codec_long_name || stream.codec_name,
          channels: stream.channels,
          channelLayout: stream.channel_layout,
          sampleRate: parseInt(stream.sample_rate) || 0,
          bitrate: stream.bit_rate ? parseInt(stream.bit_rate) : undefined,
          language: tags.language || tags.LANGUAGE,
          title: tags.title || tags.TITLE,
          isDefault: stream.disposition?.default === 1,
        });
      } else if (stream.codec_type === 'subtitle') {
        const tags = stream.tags || {};
        subtitleTracks.push({
          index: stream.index,
          codec: stream.codec_name,
          codecLong: stream.codec_long_name || stream.codec_name,
          language: tags.language || tags.LANGUAGE,
          title: tags.title || tags.TITLE,
          isDefault: stream.disposition?.default === 1,
          isForced: stream.disposition?.forced === 1,
        });
      }
    }

    return {
      format: format.format_name || 'unknown',
      formatLong: format.format_long_name || format.format_name || 'Unknown',
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      bitrate: parseInt(format.bit_rate) || 0,
      videoTracks,
      audioTracks,
      subtitleTracks,
      chapters: chapters.map((ch: any) => ({
        start: parseFloat(ch.start_time) || 0,
        end: parseFloat(ch.end_time) || 0,
        title: ch.tags?.title,
      })),
    };
  }

  /**
   * Get a human-readable resolution label
   */
  getResolutionLabel(width: number, height: number): string {
    if (height >= 2160) return '4K UHD';
    if (height >= 1440) return '2K QHD';
    if (height >= 1080) return '1080p FHD';
    if (height >= 720) return '720p HD';
    if (height >= 576) return '576p SD';
    if (height >= 480) return '480p SD';
    return `${width}x${height}`;
  }

  /**
   * Get a human-readable audio channel label
   */
  getChannelLabel(channels: number, layout?: string): string {
    if (layout) {
      const layoutMap: Record<string, string> = {
        'mono': '1.0 Mono',
        'stereo': '2.0 Stereo',
        '2.1': '2.1',
        'quad': '4.0 Quad',
        '5.0': '5.0 Surround',
        '5.1': '5.1 Surround',
        '5.1(side)': '5.1 Surround',
        '6.1': '6.1 Surround',
        '7.1': '7.1 Surround',
        '7.1(wide)': '7.1 Surround',
      };
      if (layoutMap[layout]) return layoutMap[layout];
    }
    
    switch (channels) {
      case 1: return '1.0 Mono';
      case 2: return '2.0 Stereo';
      case 6: return '5.1 Surround';
      case 8: return '7.1 Surround';
      default: return `${channels} channels`;
    }
  }

  /**
   * Format file size in human-readable format
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Format bitrate in human-readable format
   */
  formatBitrate(bps: number): string {
    if (bps === 0) return 'N/A';
    if (bps >= 1000000) {
      return (bps / 1000000).toFixed(2) + ' Mbps';
    }
    return (bps / 1000).toFixed(0) + ' Kbps';
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(seconds: number): string {
    if (!seconds || isNaN(seconds)) return 'N/A';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}h ${mins}m ${secs}s`;
    }
    return `${mins}m ${secs}s`;
  }
}

export const mediaProbeService = MediaProbeService.getInstance();
