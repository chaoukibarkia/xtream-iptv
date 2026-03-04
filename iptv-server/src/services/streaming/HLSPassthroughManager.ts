import axios from 'axios';
import { logger } from '../../config/logger.js';

/**
 * Represents a variant stream in an HLS master playlist
 */
export interface HLSVariant {
  bandwidth: number;
  resolution?: string;
  codecs?: string;
  name?: string;
  url: string;
  absoluteUrl: string;
  audioGroup?: string;  // AUDIO group reference
}

/**
 * Represents an audio/subtitle track in an HLS master playlist (#EXT-X-MEDIA)
 */
export interface HLSMediaTrack {
  type: 'AUDIO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
  groupId: string;
  name: string;
  language?: string;
  isDefault: boolean;
  autoSelect: boolean;
  url?: string;
  absoluteUrl?: string;
  channels?: string;
}

/**
 * Represents parsed HLS master playlist info
 */
export interface HLSMasterInfo {
  isMultiBitrate: boolean;
  variants: HLSVariant[];
  mediaTracks: HLSMediaTrack[];  // Audio/subtitle tracks
  baseUrl: string;
  rawContent: string;
}

/**
 * Cache entry for HLS master info
 */
interface HLSCacheEntry {
  info: HLSMasterInfo;
  sourceUrl: string;
  timestamp: number;
}

/**
 * HLS Passthrough Manager
 * 
 * Handles multi-bitrate HLS streams by detecting variant playlists
 * and proxying them through to clients while maintaining the
 * original stream quality options.
 */
export class HLSPassthroughManager {
  // Cache HLS master info to avoid re-fetching
  private masterCache: Map<number, HLSCacheEntry> = new Map();
  // Also store source URL for re-analysis when cache expires
  private sourceUrlCache: Map<number, string> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minute cache for master playlist info

  /**
   * Check if a URL points to an HLS stream
   */
  isHLSUrl(url: string): boolean {
    return url.endsWith('.m3u8') || url.includes('.m3u8?');
  }

  /**
   * Fetch and parse an HLS master playlist to detect if it's multi-bitrate
   */
  async analyzeHLSSource(streamId: number, sourceUrl: string, customUserAgent?: string): Promise<HLSMasterInfo> {
    // Store source URL for later re-analysis if needed
    this.sourceUrlCache.set(streamId, sourceUrl);
    
    // Check cache first - return immediately if valid
    const cached = this.masterCache.get(streamId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug({ streamId, cacheAge: Date.now() - cached.timestamp }, 'Using cached HLS master info');
      return cached.info;
    }

    // If cache is stale but exists, return it immediately and refresh in background
    if (cached) {
      logger.debug({ streamId }, 'Using stale cache, refreshing in background');
      // Trigger background refresh without waiting
      this.refreshCacheInBackground(streamId, sourceUrl, customUserAgent);
      return cached.info;
    }

    const baseUrl = this.getBaseUrl(sourceUrl);
    const startTime = Date.now();

    try {
      const response = await axios.get(sourceUrl, {
        timeout: 5000, // Reduced from 10s to 5s
        headers: {
          'User-Agent': customUserAgent || 'IPTV-Server/1.0',
        },
        responseType: 'text',
      });
      
      logger.debug({ streamId, fetchTime: Date.now() - startTime }, 'Fetched HLS master playlist');

      const content = response.data as string;
      const info = this.parseMasterPlaylist(content, baseUrl, sourceUrl);

      // Cache the result with source URL
      this.masterCache.set(streamId, {
        info,
        sourceUrl,
        timestamp: Date.now(),
      });

      logger.info({
        streamId,
        isMultiBitrate: info.isMultiBitrate,
        variantCount: info.variants.length,
        variants: info.variants.map(v => ({
          bandwidth: v.bandwidth,
          resolution: v.resolution,
          name: v.name,
        })),
      }, 'Analyzed HLS source');

      return info;
    } catch (error) {
      logger.error({ streamId, sourceUrl, error }, 'Failed to analyze HLS source');
      // Return non-multibitrate info on error
      return {
        isMultiBitrate: false,
        variants: [],
        mediaTracks: [],
        baseUrl,
        rawContent: '',
      };
    }
  }

  /**
   * Refresh cache in background without blocking
   */
  private async refreshCacheInBackground(streamId: number, sourceUrl: string, customUserAgent?: string): Promise<void> {
    const baseUrl = this.getBaseUrl(sourceUrl);
    
    try {
      const response = await axios.get(sourceUrl, {
        timeout: 5000,
        headers: {
          'User-Agent': customUserAgent || 'IPTV-Server/1.0',
        },
        responseType: 'text',
      });

      const content = response.data as string;
      const info = this.parseMasterPlaylist(content, baseUrl, sourceUrl);

      // Update cache
      this.masterCache.set(streamId, {
        info,
        sourceUrl,
        timestamp: Date.now(),
      });

      logger.debug({ streamId }, 'Background cache refresh completed');
    } catch (error) {
      logger.warn({ streamId, error }, 'Background cache refresh failed');
    }
  }

  /**
   * Parse HLS master playlist content to extract variants and media tracks
   */
  private parseMasterPlaylist(content: string, baseUrl: string, originalUrl: string): HLSMasterInfo {
    const lines = content.split('\n').map(l => l.trim());
    const variants: HLSVariant[] = [];
    const mediaTracks: HLSMediaTrack[] = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Parse #EXT-X-MEDIA tags for audio/subtitle tracks
      if (line.startsWith('#EXT-X-MEDIA:')) {
        const mediaTrack = this.parseMediaTag(line, baseUrl, originalUrl);
        if (mediaTrack) {
          mediaTracks.push(mediaTrack);
        }
      }

      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        // Parse stream info attributes
        const attributes = this.parseStreamInfAttributes(line);
        
        // Next non-empty, non-comment line should be the URL
        i++;
        while (i < lines.length && (lines[i] === '' || lines[i].startsWith('#'))) {
          i++;
        }

        if (i < lines.length && lines[i] && !lines[i].startsWith('#')) {
          const variantUrl = lines[i].trim();
          const absoluteUrl = this.resolveUrl(variantUrl, baseUrl, originalUrl);

          variants.push({
            bandwidth: attributes.bandwidth || 0,
            resolution: attributes.resolution,
            codecs: attributes.codecs,
            name: attributes.name,
            url: variantUrl,
            absoluteUrl,
            audioGroup: attributes.audioGroup,
          });
        }
      }
      i++;
    }

    // Check if this is a multi-bitrate master playlist
    // A master playlist has EXT-X-STREAM-INF tags
    const isMultiBitrate = variants.length > 0;

    logger.debug({
      variantCount: variants.length,
      mediaTrackCount: mediaTracks.length,
      audioTracks: mediaTracks.filter(t => t.type === 'AUDIO').map(t => ({ name: t.name, lang: t.language })),
    }, 'Parsed HLS master playlist');

    return {
      isMultiBitrate,
      variants,
      mediaTracks,
      baseUrl,
      rawContent: content,
    };
  }

  /**
   * Parse #EXT-X-MEDIA tag for audio/subtitle tracks
   */
  private parseMediaTag(line: string, baseUrl: string, originalUrl: string): HLSMediaTrack | null {
    const attrString = line.replace('#EXT-X-MEDIA:', '');
    
    // Parse TYPE
    const typeMatch = attrString.match(/TYPE=([^,\s]+)/);
    if (!typeMatch) return null;
    const type = typeMatch[1] as 'AUDIO' | 'SUBTITLES' | 'CLOSED-CAPTIONS';
    
    // Parse GROUP-ID
    const groupMatch = attrString.match(/GROUP-ID="([^"]+)"/);
    if (!groupMatch) return null;
    const groupId = groupMatch[1];
    
    // Parse NAME
    const nameMatch = attrString.match(/NAME="([^"]+)"/);
    const name = nameMatch ? nameMatch[1] : 'default';
    
    // Parse LANGUAGE
    const langMatch = attrString.match(/LANGUAGE="([^"]+)"/);
    const language = langMatch ? langMatch[1] : undefined;
    
    // Parse DEFAULT
    const defaultMatch = attrString.match(/DEFAULT=(YES|NO)/);
    const isDefault = defaultMatch ? defaultMatch[1] === 'YES' : false;
    
    // Parse AUTOSELECT
    const autoSelectMatch = attrString.match(/AUTOSELECT=(YES|NO)/);
    const autoSelect = autoSelectMatch ? autoSelectMatch[1] === 'YES' : false;
    
    // Parse CHANNELS
    const channelsMatch = attrString.match(/CHANNELS="([^"]+)"/);
    const channels = channelsMatch ? channelsMatch[1] : undefined;
    
    // Parse URI (optional - some audio may be muxed in video)
    const uriMatch = attrString.match(/URI="([^"]+)"/);
    const url = uriMatch ? uriMatch[1] : undefined;
    const absoluteUrl = url ? this.resolveUrl(url, baseUrl, originalUrl) : undefined;
    
    return {
      type,
      groupId,
      name,
      language,
      isDefault,
      autoSelect,
      channels,
      url,
      absoluteUrl,
    };
  }

  /**
   * Parse EXT-X-STREAM-INF attributes
   */
  private parseStreamInfAttributes(line: string): {
    bandwidth?: number;
    resolution?: string;
    codecs?: string;
    name?: string;
    audioGroup?: string;
  } {
    const result: {
      bandwidth?: number;
      resolution?: string;
      codecs?: string;
      name?: string;
      audioGroup?: string;
    } = {};

    // Remove the tag prefix
    const attrString = line.replace('#EXT-X-STREAM-INF:', '');

    // Match BANDWIDTH
    const bandwidthMatch = attrString.match(/BANDWIDTH=(\d+)/);
    if (bandwidthMatch) {
      result.bandwidth = parseInt(bandwidthMatch[1], 10);
    }

    // Match RESOLUTION
    const resolutionMatch = attrString.match(/RESOLUTION=([^\s,]+)/);
    if (resolutionMatch) {
      result.resolution = resolutionMatch[1];
    }

    // Match CODECS (quoted string)
    const codecsMatch = attrString.match(/CODECS="([^"]+)"/);
    if (codecsMatch) {
      result.codecs = codecsMatch[1];
    }

    // Match NAME (quoted string)
    const nameMatch = attrString.match(/NAME="([^"]+)"/);
    if (nameMatch) {
      result.name = nameMatch[1];
    }

    // Match AUDIO group
    const audioMatch = attrString.match(/AUDIO="([^"]+)"/);
    if (audioMatch) {
      result.audioGroup = audioMatch[1];
    }

    return result;
  }

  /**
   * Get base URL from a full URL
   */
  private getBaseUrl(url: string): string {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    pathParts.pop(); // Remove filename
    return `${urlObj.origin}${pathParts.join('/')}`;
  }

  /**
   * Resolve a relative URL to absolute
   */
  private resolveUrl(relativeUrl: string, baseUrl: string, originalUrl: string): string {
    // If already absolute, return as-is
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    // If starts with /, use origin
    if (relativeUrl.startsWith('/')) {
      const origin = new URL(originalUrl).origin;
      return `${origin}${relativeUrl}`;
    }

    // Relative to base URL
    return `${baseUrl}/${relativeUrl}`;
  }

  /**
   * Generate a proxied master playlist for multi-bitrate streaming
   * Includes audio tracks (#EXT-X-MEDIA) if present in source
   */
  generateProxiedMasterPlaylist(
    streamId: number,
    masterInfo: HLSMasterInfo,
    viewerToken: string,
    serverBaseUrl: string
  ): string {
    const lines: string[] = ['#EXTM3U'];

    // Add audio/media tracks first (#EXT-X-MEDIA tags)
    // These must come before #EXT-X-STREAM-INF tags that reference them
    if (masterInfo.mediaTracks && masterInfo.mediaTracks.length > 0) {
      for (let i = 0; i < masterInfo.mediaTracks.length; i++) {
        const track = masterInfo.mediaTracks[i];
        
        // Build #EXT-X-MEDIA tag
        let mediaTag = `#EXT-X-MEDIA:TYPE=${track.type},GROUP-ID="${track.groupId}",NAME="${track.name}"`;
        
        if (track.language) {
          mediaTag += `,LANGUAGE="${track.language}"`;
        }
        if (track.channels) {
          mediaTag += `,CHANNELS="${track.channels}"`;
        }
        mediaTag += `,DEFAULT=${track.isDefault ? 'YES' : 'NO'}`;
        mediaTag += `,AUTOSELECT=${track.autoSelect ? 'YES' : 'NO'}`;
        
        // Add proxied URI for audio track if it has a separate playlist
        if (track.url && track.absoluteUrl) {
          // Use audio index for the proxy URL
          mediaTag += `,URI="${serverBaseUrl}/hls-passthrough/${viewerToken}/${streamId}/audio/${i}/playlist.m3u8"`;
        }
        
        lines.push(mediaTag);
      }
    }

    // Add video variants
    for (const variant of masterInfo.variants) {
      // Build the EXT-X-STREAM-INF line
      let streamInf = `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth}`;
      
      if (variant.codecs) {
        streamInf += `,CODECS="${variant.codecs}"`;
      }
      if (variant.resolution) {
        streamInf += `,RESOLUTION=${variant.resolution}`;
      }
      if (variant.name) {
        streamInf += `,NAME="${variant.name}"`;
      }
      // Include AUDIO group reference if present
      if (variant.audioGroup) {
        streamInf += `,AUDIO="${variant.audioGroup}"`;
      }

      lines.push(streamInf);

      // Generate a variant index based on position
      const variantIndex = masterInfo.variants.indexOf(variant);
      
      // Add the proxied URL for this variant
      // Format: /hls-passthrough/:token/:streamId/variant/:variantIndex/playlist.m3u8
      lines.push(`${serverBaseUrl}/hls-passthrough/${viewerToken}/${streamId}/variant/${variantIndex}/playlist.m3u8`);
    }

    return lines.join('\n') + '\n';
  }

  /**
   * Fetch a variant playlist and rewrite segment URLs for proxying
   */
  async fetchAndRewriteVariantPlaylist(
    streamId: number,
    variantIndex: number,
    viewerToken: string,
    serverBaseUrl: string,
    customUserAgent?: string,
    sourceUrl?: string
  ): Promise<string | null> {
    let cached = this.masterCache.get(streamId);
    
    // If cache is missing or expired, try to re-analyze
    if (!cached || Date.now() - cached.timestamp >= this.CACHE_TTL) {
      // Get source URL from cache or use provided one
      const url = sourceUrl || this.sourceUrlCache.get(streamId) || cached?.sourceUrl;
      if (!url) {
        logger.error({ streamId }, 'No cached master info and no source URL for variant playlist fetch');
        return null;
      }
      
      logger.info({ streamId, variantIndex }, 'Re-analyzing HLS source for variant playlist request');
      await this.analyzeHLSSource(streamId, url, customUserAgent);
      cached = this.masterCache.get(streamId);
      
      if (!cached) {
        logger.error({ streamId }, 'Failed to re-analyze HLS source');
        return null;
      }
    }

    const variant = cached.info.variants[variantIndex];
    if (!variant) {
      logger.error({ streamId, variantIndex, totalVariants: cached.info.variants.length }, 'Variant index out of range');
      return null;
    }

    try {
      const response = await axios.get(variant.absoluteUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': customUserAgent || 'IPTV-Server/1.0',
        },
        responseType: 'text',
      });

      const content = response.data as string;
      const variantBaseUrl = this.getBaseUrl(variant.absoluteUrl);

      // Rewrite segment URLs in the playlist
      const rewrittenPlaylist = this.rewriteVariantPlaylist(
        content,
        streamId,
        variantIndex,
        viewerToken,
        serverBaseUrl,
        variantBaseUrl,
        variant.absoluteUrl
      );

      return rewrittenPlaylist;
    } catch (error) {
      logger.error({ streamId, variantIndex, error }, 'Failed to fetch variant playlist');
      return null;
    }
  }

  /**
   * Fetch an audio playlist and rewrite segment URLs for proxying
   */
  async fetchAndRewriteAudioPlaylist(
    streamId: number,
    audioIndex: number,
    viewerToken: string,
    serverBaseUrl: string,
    customUserAgent?: string,
    sourceUrl?: string
  ): Promise<string | null> {
    let cached = this.masterCache.get(streamId);
    
    // If cache is missing or expired, try to re-analyze
    if (!cached || Date.now() - cached.timestamp >= this.CACHE_TTL) {
      const url = sourceUrl || this.sourceUrlCache.get(streamId) || cached?.sourceUrl;
      if (!url) {
        logger.error({ streamId }, 'No cached master info for audio playlist fetch');
        return null;
      }
      
      logger.info({ streamId, audioIndex }, 'Re-analyzing HLS source for audio playlist request');
      await this.analyzeHLSSource(streamId, url, customUserAgent);
      cached = this.masterCache.get(streamId);
      
      if (!cached) {
        logger.error({ streamId }, 'Failed to re-analyze HLS source');
        return null;
      }
    }

    const audioTrack = cached.info.mediaTracks?.[audioIndex];
    if (!audioTrack || !audioTrack.absoluteUrl) {
      logger.error({ streamId, audioIndex, totalTracks: cached.info.mediaTracks?.length }, 'Audio track index out of range or no URL');
      return null;
    }

    try {
      const response = await axios.get(audioTrack.absoluteUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': customUserAgent || 'IPTV-Server/1.0',
        },
        responseType: 'text',
      });

      const content = response.data as string;
      const audioBaseUrl = this.getBaseUrl(audioTrack.absoluteUrl);

      // Rewrite segment URLs - use 'audio' instead of 'variant' in the proxy URL
      const rewrittenPlaylist = this.rewriteAudioPlaylist(
        content,
        streamId,
        audioIndex,
        viewerToken,
        serverBaseUrl,
        audioBaseUrl,
        audioTrack.absoluteUrl
      );

      return rewrittenPlaylist;
    } catch (error) {
      logger.error({ streamId, audioIndex, error }, 'Failed to fetch audio playlist');
      return null;
    }
  }

  /**
   * Rewrite segment URLs in an audio playlist
   */
  private rewriteAudioPlaylist(
    content: string,
    streamId: number,
    audioIndex: number,
    viewerToken: string,
    serverBaseUrl: string,
    audioBaseUrl: string,
    audioAbsoluteUrl: string
  ): string {
    const lines = content.split('\n');
    const rewrittenLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments (except for M3U tags)
      if (trimmedLine === '' || (trimmedLine.startsWith('#') && !trimmedLine.startsWith('#EXT'))) {
        rewrittenLines.push(line);
        continue;
      }

      // Keep M3U tags as-is
      if (trimmedLine.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }

      // This should be a segment URL - rewrite it
      const segmentUrl = trimmedLine;
      const absoluteSegmentUrl = this.resolveUrl(segmentUrl, audioBaseUrl, audioAbsoluteUrl);
      
      // Encode the segment URL for safe passing as a query parameter
      const encodedSegmentUrl = encodeURIComponent(absoluteSegmentUrl);
      
      // Generate proxied segment URL - use 'audio' path
      const proxiedUrl = `${serverBaseUrl}/hls-passthrough/${viewerToken}/${streamId}/audio/${audioIndex}/segment?url=${encodedSegmentUrl}`;
      
      rewrittenLines.push(proxiedUrl);
    }

    return rewrittenLines.join('\n');
  }

  /**
   * Rewrite segment URLs in a variant playlist
   */
  private rewriteVariantPlaylist(
    content: string,
    streamId: number,
    variantIndex: number,
    viewerToken: string,
    serverBaseUrl: string,
    variantBaseUrl: string,
    variantAbsoluteUrl: string
  ): string {
    const lines = content.split('\n');
    const rewrittenLines: string[] = [];

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines and comments (except for M3U tags)
      if (trimmedLine === '' || (trimmedLine.startsWith('#') && !trimmedLine.startsWith('#EXT'))) {
        rewrittenLines.push(line);
        continue;
      }

      // Keep M3U tags as-is
      if (trimmedLine.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }

      // This should be a segment URL - rewrite it
      const segmentUrl = trimmedLine;
      const absoluteSegmentUrl = this.resolveUrl(segmentUrl, variantBaseUrl, variantAbsoluteUrl);
      
      // Encode the segment URL for safe passing as a path parameter
      const encodedSegmentUrl = encodeURIComponent(absoluteSegmentUrl);
      
      // Generate proxied segment URL
      // Format: /hls-passthrough/:token/:streamId/variant/:variantIndex/segment?url=<encoded-url>
      const proxiedUrl = `${serverBaseUrl}/hls-passthrough/${viewerToken}/${streamId}/variant/${variantIndex}/segment?url=${encodedSegmentUrl}`;
      
      rewrittenLines.push(proxiedUrl);
    }

    return rewrittenLines.join('\n');
  }

  /**
   * Proxy a segment from the source
   */
  async proxySegment(segmentUrl: string, customUserAgent?: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(segmentUrl, {
        timeout: 30000,
        headers: {
          'User-Agent': customUserAgent || 'IPTV-Server/1.0',
        },
        responseType: 'arraybuffer',
      });

      return Buffer.from(response.data);
    } catch (error) {
      logger.error({ segmentUrl, error }, 'Failed to proxy segment');
      return null;
    }
  }

  /**
   * Get cached master info for a stream
   */
  getCachedMasterInfo(streamId: number): HLSMasterInfo | null {
    const cached = this.masterCache.get(streamId);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.info;
    }
    return null;
  }

  /**
   * Clear cache for a stream
   */
  clearCache(streamId: number): void {
    this.masterCache.delete(streamId);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.masterCache.clear();
  }
}

// Export singleton instance
export const hlsPassthroughManager = new HLSPassthroughManager();
