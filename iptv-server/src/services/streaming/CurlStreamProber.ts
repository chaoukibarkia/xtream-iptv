import { spawn } from 'child_process';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';

export interface CurlHealthResult {
  online: boolean;
  method: 'curl';
  latency: number;
  statusCode?: number;
  contentType?: string;
  contentLength?: number;
  redirectCount?: number;
  error?: string;
  httpVersion?: string;
  responseHeaders?: Record<string, string>;
}

const CURL_TIMEOUT = 15; // 15 seconds
const CACHE_TTL = 180;   // 3 minutes cache (shorter than FFprobe)

class CurlStreamProber {
  /**
   * Check stream health using curl with comprehensive HTTP analysis
   */
  async checkHealth(url: string, userAgent?: string): Promise<CurlHealthResult> {
    const startTime = Date.now();
    
    // Check cache first
    const cacheKey = `curl:health:${url}:${userAgent || 'default'}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    return new Promise((resolve) => {
      const curlArgs = [
        '--silent',                    // No progress bar
        '--show-error',               // Show errors
        '--location',                 // Follow redirects
        '--max-redirs', '5',          // Max 5 redirects
        '--connect-timeout', '10',    // Connection timeout
        '--max-time', CURL_TIMEOUT.toString(), // Total timeout
        '--write-out', JSON.stringify({
          'status_code': '%{http_code}',
          'content_type': '%{content_type}',
          'size_download': '%{size_download}',
          'time_total': '%{time_total}',
          'time_connect': '%{time_connect}',
          'time_starttransfer': '%{time_starttransfer}',
          'redirect_count': '%{num_redirects}',
          'http_version': '%{http_version}',
          'speed_download': '%{speed_download}',
          'url_effective': '%{url_effective}'
        }),
        '--output', '/dev/null',      // Discard body content
        '--head',                     // HEAD request only
      ];

      // Add user agent
      if (userAgent) {
        curlArgs.push('--user-agent', userAgent);
      } else {
        curlArgs.push('--user-agent', 'IPTV-HealthCheck-Curl/2.0');
      }

      // Add headers for better stream compatibility
      curlArgs.push(
        '--header', 'Accept: */*',
        '--header', 'Connection: close',
        '--header', 'Cache-Control: no-cache'
      );

      curlArgs.push(url);

      const curl = spawn('curl', curlArgs);
      let stdout = '';
      let stderr = '';

      const timeout = setTimeout(() => {
        curl.kill('SIGKILL');
        resolve({
          online: false,
          method: 'curl',
          latency: Date.now() - startTime,
          error: 'Curl timeout',
        });
      }, (CURL_TIMEOUT + 5) * 1000);

      curl.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      curl.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      curl.on('close', async (code) => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const stats = JSON.parse(stdout.trim());
            const result = this.parseResult(stats, latency);
            
            // Cache successful results
            if (result.online) {
              await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
            }
            
            resolve(result);
          } catch (e) {
            resolve({
              online: false,
              method: 'curl',
              latency,
              error: 'Failed to parse curl output',
            });
          }
        } else {
          resolve({
            online: false,
            method: 'curl',
            latency,
            error: stderr || `Curl exited with code ${code}`,
          });
        }
      });

      curl.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          online: false,
          method: 'curl',
          latency: Date.now() - startTime,
          error: `Curl error: ${err.message}`,
        });
      });
    });
  }

  /**
   * Enhanced stream check with partial content download for better validation
   */
  async checkStreamContent(url: string, userAgent?: string, maxBytes = 8192): Promise<CurlHealthResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
      const curlArgs = [
        '--silent',
        '--show-error',
        '--location',
        '--max-redirs', '5',
        '--connect-timeout', '10',
        '--max-time', CURL_TIMEOUT.toString(),
        '--range', `0-${maxBytes - 1}`,  // Download first 8KB
        '--write-out', JSON.stringify({
          'status_code': '%{http_code}',
          'content_type': '%{content_type}',
          'size_download': '%{size_download}',
          'time_total': '%{time_total}',
          'redirect_count': '%{num_redirects}',
          'url_effective': '%{url_effective}'
        }),
        '--output', '-',  // Output to stdout for content analysis
      ];

      if (userAgent) {
        curlArgs.push('--user-agent', userAgent);
      } else {
        curlArgs.push('--user-agent', 'IPTV-ContentCheck-Curl/2.0');
      }

      curlArgs.push(url);

      const curl = spawn('curl', curlArgs);
      let stdout = '';
      let stderr = '';
      let contentBuffer = Buffer.alloc(0);

      const timeout = setTimeout(() => {
        curl.kill('SIGKILL');
        resolve({
          online: false,
          method: 'curl',
          latency: Date.now() - startTime,
          error: 'Content check timeout',
        });
      }, (CURL_TIMEOUT + 5) * 1000);

      curl.stdout?.on('data', (data) => {
        const dataStr = data.toString();
        // Check if this looks like JSON stats (last line)
        if (dataStr.includes('"status_code"')) {
          stdout += dataStr;
        } else {
          // This is content data
          contentBuffer = Buffer.concat([contentBuffer, data]);
        }
      });

      curl.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      curl.on('close', (code) => {
        clearTimeout(timeout);
        const latency = Date.now() - startTime;

        if (code === 0 && stdout.trim()) {
          try {
            const stats = JSON.parse(stdout.trim());
            const result = this.parseResult(stats, latency);
            
            // Enhanced validation with content analysis
            if (result.online && contentBuffer.length > 0) {
              result.online = this.validateStreamContent(contentBuffer, result.contentType);
              if (!result.online) {
                result.error = 'Content validation failed - not a valid stream';
              }
            }
            
            resolve(result);
          } catch (e) {
            resolve({
              online: false,
              method: 'curl',
              latency,
              error: 'Failed to parse curl output',
            });
          }
        } else {
          resolve({
            online: false,
            method: 'curl',
            latency,
            error: stderr || `Curl exited with code ${code}`,
          });
        }
      });

      curl.on('error', (err) => {
        clearTimeout(timeout);
        resolve({
          online: false,
          method: 'curl',
          latency: Date.now() - startTime,
          error: `Curl error: ${err.message}`,
        });
      });
    });
  }

  /**
   * Parse curl statistics into our result format
   */
  private parseResult(stats: any, latency: number): CurlHealthResult {
    const statusCode = parseInt(stats.status_code) || 0;
    const contentType = stats.content_type || '';
    
    // Determine if stream is online based on status and content type
    const isValidStatus = statusCode >= 200 && statusCode < 400;
    const isValidContentType = this.isValidStreamContentType(contentType);
    
    return {
      online: isValidStatus && isValidContentType,
      method: 'curl',
      latency,
      statusCode,
      contentType,
      contentLength: parseInt(stats.size_download) || 0,
      redirectCount: parseInt(stats.redirect_count) || 0,
      httpVersion: stats.http_version,
      error: !isValidStatus ? `HTTP ${statusCode}` : 
             !isValidContentType ? `Invalid content type: ${contentType}` : undefined,
    };
  }

  /**
   * Check if content type indicates a valid stream
   */
  private isValidStreamContentType(contentType: string): boolean {
    if (!contentType) return false;
    
    const validTypes = [
      'video/',
      'audio/',
      'application/vnd.apple.mpegurl',  // HLS
      'application/x-mpegurl',          // HLS
      'application/dash+xml',           // DASH
      'application/octet-stream',       // Generic binary
      'video/mp2t',                     // MPEG-TS
      'video/mp4',
      'video/x-flv',
      'video/x-msvideo',
      'application/vnd.ms-sstr+xml',    // Smooth Streaming
    ];

    return validTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
  }

  /**
   * Validate actual stream content by examining binary data
   */
  private validateStreamContent(buffer: Buffer, contentType?: string): boolean {
    if (buffer.length < 4) return false;

    // Check for common stream format signatures
    const signatures = [
      // MPEG-TS sync byte
      { pattern: [0x47], offset: 0, name: 'MPEG-TS' },
      // MP4/MOV
      { pattern: [0x00, 0x00, 0x00], offset: 4, name: 'MP4' }, // ftyp box
      // FLV
      { pattern: [0x46, 0x4C, 0x56], offset: 0, name: 'FLV' },
      // HLS playlist
      { pattern: '#EXTM3U'.split('').map(c => c.charCodeAt(0)), offset: 0, name: 'HLS' },
      // WebM
      { pattern: [0x1A, 0x45, 0xDF, 0xA3], offset: 0, name: 'WebM' },
    ];

    for (const sig of signatures) {
      if (this.checkSignature(buffer, sig.pattern, sig.offset)) {
        logger.debug(`Stream content validated as ${sig.name}`);
        return true;
      }
    }

    // For HLS, also check for common playlist content
    if (contentType?.includes('mpegurl') || contentType?.includes('m3u')) {
      const content = buffer.toString('utf8', 0, Math.min(buffer.length, 1024));
      if (content.includes('#EXTINF') || content.includes('#EXT-X-')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if buffer contains signature at offset
   */
  private checkSignature(buffer: Buffer, pattern: number[], offset: number): boolean {
    if (buffer.length < offset + pattern.length) return false;
    
    for (let i = 0; i < pattern.length; i++) {
      if (buffer[offset + i] !== pattern[i]) return false;
    }
    
    return true;
  }

  /**
   * Clear cache for a URL
   */
  async clearCache(url: string): Promise<void> {
    const keys = await redis.keys(`curl:health:${url}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Batch health check for multiple URLs
   */
  async batchCheck(urls: string[], userAgent?: string, concurrency = 5): Promise<Map<string, CurlHealthResult>> {
    const results = new Map<string, CurlHealthResult>();
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchPromises = batch.map(async (url) => {
        const result = await this.checkHealth(url, userAgent);
        return { url, result };
      });
      
      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach(({ url, result }) => {
        results.set(url, result);
      });
      
      // Small delay between batches
      if (i + concurrency < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
}

// Export singleton
export const curlStreamProber = new CurlStreamProber();