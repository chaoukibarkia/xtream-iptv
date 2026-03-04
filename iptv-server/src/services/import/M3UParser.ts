import { StreamType } from '@prisma/client';

/**
 * Parsed M3U channel/stream entry
 */
export interface M3UEntry {
  name: string;
  url: string;
  duration: number;
  
  // Extended attributes (M3U_PLUS)
  tvgId?: string;       // EPG channel ID (tvg-id)
  tvgName?: string;     // Channel name (tvg-name)
  tvgLogo?: string;     // Logo URL (tvg-logo)
  groupTitle?: string;  // Category/group (group-title)
  
  // Additional common attributes
  tvgLanguage?: string;
  tvgCountry?: string;
  tvgShift?: string;
  channelNumber?: string;
  
  // Catchup/TV Archive
  catchup?: string;
  catchupDays?: number;
  catchupSource?: string;
  
  // Radio detection
  radio?: boolean;
  
  // Raw attributes for any we don't explicitly parse
  rawAttributes?: Record<string, string>;
}

/**
 * M3U playlist metadata from header
 */
export interface M3UPlaylistInfo {
  urlTvg?: string;      // x-tvg-url - EPG URL
  tvgUrl?: string;      // tvg-url - EPG URL (alternative)
  tvgShift?: string;
  cacheTime?: number;
  refreshInterval?: number;
  entries: M3UEntry[];
}

/**
 * Import options
 */
export interface M3UParseOptions {
  defaultStreamType?: StreamType;
  detectRadio?: boolean;         // Try to detect radio streams
  normalizeNames?: boolean;      // Clean up channel names
  skipInvalid?: boolean;         // Skip entries without valid URLs
}

/**
 * M3U/M3U8/M3U_PLUS Parser
 * 
 * Supports:
 * - Basic M3U (#EXTINF:-1,Channel Name)
 * - M3U_PLUS with extended attributes (tvg-id, tvg-name, tvg-logo, group-title, etc.)
 * - Multiple attribute formats (quoted, unquoted)
 * - EPG URL extraction from playlist header
 */
export class M3UParser {
  private options: Required<M3UParseOptions>;

  constructor(options: M3UParseOptions = {}) {
    this.options = {
      defaultStreamType: options.defaultStreamType ?? StreamType.LIVE,
      detectRadio: options.detectRadio ?? true,
      normalizeNames: options.normalizeNames ?? true,
      skipInvalid: options.skipInvalid ?? true,
    };
  }

  /**
   * Parse M3U content from string
   */
  parse(content: string): M3UPlaylistInfo {
    const lines = content.split(/\r?\n/);
    const result: M3UPlaylistInfo = {
      entries: [],
    };

    // Check for M3U header
    if (!lines[0]?.trim().startsWith('#EXTM3U')) {
      throw new Error('Invalid M3U file: missing #EXTM3U header');
    }

    // Parse header attributes (x-tvg-url, etc.)
    const headerLine = lines[0].trim();
    const headerAttrs = this.parseAttributes(headerLine.substring(7)); // Skip #EXTM3U
    
    result.urlTvg = headerAttrs['url-tvg'] || headerAttrs['x-tvg-url'];
    result.tvgUrl = headerAttrs['tvg-url'];
    result.tvgShift = headerAttrs['tvg-shift'];
    if (headerAttrs['cache']) {
      result.cacheTime = parseInt(headerAttrs['cache'], 10) || undefined;
    }

    let currentEntry: Partial<M3UEntry> | null = null;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) continue;

      // Parse #EXTINF line
      if (line.startsWith('#EXTINF:')) {
        currentEntry = this.parseExtInf(line);
      }
      // Parse additional tags before URL
      else if (line.startsWith('#EXTGRP:')) {
        if (currentEntry && !currentEntry.groupTitle) {
          currentEntry.groupTitle = line.substring(8).trim();
        }
      }
      else if (line.startsWith('#EXTVLCOPT:')) {
        // VLC options - skip but could parse for http-user-agent, etc.
      }
      else if (line.startsWith('#KODIPROP:')) {
        // Kodi properties - skip
      }
      else if (line.startsWith('#')) {
        // Other comments/directives - skip
      }
      // Stream URL
      else if (currentEntry) {
        if (this.isValidUrl(line)) {
          currentEntry.url = line;
          
          // Finalize entry
          const entry = this.finalizeEntry(currentEntry);
          if (entry && (!this.options.skipInvalid || entry.url)) {
            result.entries.push(entry);
          }
        }
        currentEntry = null;
      }
    }

    return result;
  }

  /**
   * Parse #EXTINF line
   * Format: #EXTINF:duration [attributes],title
   */
  private parseExtInf(line: string): Partial<M3UEntry> {
    const entry: Partial<M3UEntry> = {
      duration: -1,
      rawAttributes: {},
    };

    // Remove #EXTINF: prefix
    let content = line.substring(8);

    // Find duration (first number after colon, before space or comma)
    const durationMatch = content.match(/^(-?\d+)/);
    if (durationMatch) {
      entry.duration = parseInt(durationMatch[1], 10);
      content = content.substring(durationMatch[0].length);
    }

    // Find the last comma that separates attributes from title
    // This is tricky because commas can appear in attribute values
    let commaIndex = -1;
    let inQuote = false;
    
    for (let i = content.length - 1; i >= 0; i--) {
      const char = content[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        commaIndex = i;
        break;
      }
    }

    if (commaIndex > 0) {
      const attributesPart = content.substring(0, commaIndex).trim();
      const titlePart = content.substring(commaIndex + 1).trim();
      
      entry.name = titlePart;
      
      // Parse attributes
      const attrs = this.parseAttributes(attributesPart);
      entry.rawAttributes = attrs;
      
      // Map known attributes
      entry.tvgId = attrs['tvg-id'] || attrs['tvg_id'] || attrs['channel-id'];
      entry.tvgName = attrs['tvg-name'] || attrs['tvg_name'];
      entry.tvgLogo = attrs['tvg-logo'] || attrs['tvg_logo'] || attrs['logo'];
      entry.groupTitle = attrs['group-title'] || attrs['group_title'] || attrs['group'];
      entry.tvgLanguage = attrs['tvg-language'] || attrs['language'];
      entry.tvgCountry = attrs['tvg-country'] || attrs['country'];
      entry.tvgShift = attrs['tvg-shift'];
      entry.channelNumber = attrs['tvg-chno'] || attrs['channel-number'];
      
      // Catchup attributes
      entry.catchup = attrs['catchup'];
      if (attrs['catchup-days']) {
        entry.catchupDays = parseInt(attrs['catchup-days'], 10);
      }
      entry.catchupSource = attrs['catchup-source'];
      
      // Radio detection from attribute
      if (attrs['radio'] === 'true' || attrs['tvg-type'] === 'radio') {
        entry.radio = true;
      }
    } else {
      // No attributes, just title after comma or duration
      const titleMatch = content.match(/,(.+)$/);
      if (titleMatch) {
        entry.name = titleMatch[1].trim();
      }
    }

    return entry;
  }

  /**
   * Parse attribute string into key-value pairs
   * Handles: key="value" key='value' key=value
   */
  private parseAttributes(str: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    
    // Match patterns like: key="value" or key='value' or key=value
    const regex = /([a-zA-Z_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"',]+))/g;
    let match;
    
    while ((match = regex.exec(str)) !== null) {
      const key = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? '';
      attrs[key] = value;
    }
    
    return attrs;
  }

  /**
   * Check if string is a valid stream URL
   */
  private isValidUrl(url: string): boolean {
    if (!url) return false;
    
    // Must start with http(s):// or rtmp:// or rtsp:// or mms://
    const validProtocols = ['http://', 'https://', 'rtmp://', 'rtsp://', 'mms://'];
    return validProtocols.some(p => url.toLowerCase().startsWith(p));
  }

  /**
   * Finalize and clean up entry
   */
  private finalizeEntry(partial: Partial<M3UEntry>): M3UEntry | null {
    if (!partial.name && !partial.tvgName) {
      return null;
    }

    let name = partial.name || partial.tvgName || 'Unknown Channel';
    
    if (this.options.normalizeNames) {
      name = this.normalizeName(name);
    }

    // Detect radio from name/group if not set
    let isRadio = partial.radio;
    if (!isRadio && this.options.detectRadio) {
      const radioIndicators = ['radio', 'fm ', 'am ', 'musik', 'music'];
      const lowerName = name.toLowerCase();
      const lowerGroup = (partial.groupTitle || '').toLowerCase();
      isRadio = radioIndicators.some(r => lowerName.includes(r) || lowerGroup.includes(r));
    }

    return {
      name,
      url: partial.url || '',
      duration: partial.duration ?? -1,
      tvgId: partial.tvgId,
      tvgName: partial.tvgName,
      tvgLogo: partial.tvgLogo,
      groupTitle: partial.groupTitle,
      tvgLanguage: partial.tvgLanguage,
      tvgCountry: partial.tvgCountry,
      tvgShift: partial.tvgShift,
      channelNumber: partial.channelNumber,
      catchup: partial.catchup,
      catchupDays: partial.catchupDays,
      catchupSource: partial.catchupSource,
      radio: isRadio,
      rawAttributes: partial.rawAttributes,
    };
  }

  /**
   * Normalize channel name
   */
  private normalizeName(name: string): string {
    return name
      .trim()
      // Remove common prefixes/suffixes
      .replace(/^\[.*?\]\s*/g, '')
      .replace(/\s*\(.*?\)$/g, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Suggest stream type based on entry data
   */
  suggestStreamType(entry: M3UEntry): StreamType {
    if (entry.radio) {
      return StreamType.RADIO;
    }

    const url = entry.url.toLowerCase();
    const name = entry.name.toLowerCase();
    const group = (entry.groupTitle || '').toLowerCase();

    // Check for VOD indicators
    const vodIndicators = ['vod', 'movies', 'films', 'film', 'movie'];
    if (vodIndicators.some(v => group.includes(v) || name.includes(v))) {
      return StreamType.VOD;
    }

    // Check for series indicators
    const seriesIndicators = ['series', 'shows', 'episodes', 'seasons'];
    if (seriesIndicators.some(s => group.includes(s) || name.includes(s))) {
      return StreamType.SERIES;
    }

    // Check for radio indicators
    const radioIndicators = ['radio', 'fm', 'am ', 'musik'];
    if (radioIndicators.some(r => group.includes(r) || name.includes(r))) {
      return StreamType.RADIO;
    }

    // Check URL for file extensions
    if (url.match(/\.(mp4|mkv|avi|mov|wmv)(\?|$)/i)) {
      return StreamType.VOD;
    }

    return this.options.defaultStreamType;
  }

  /**
   * Group entries by their group-title
   */
  groupByCategory(entries: M3UEntry[]): Map<string, M3UEntry[]> {
    const groups = new Map<string, M3UEntry[]>();
    
    for (const entry of entries) {
      const groupName = entry.groupTitle || 'Uncategorized';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName)!.push(entry);
    }
    
    return groups;
  }

  /**
   * Get statistics about parsed playlist
   */
  getStats(playlist: M3UPlaylistInfo): {
    totalEntries: number;
    categories: number;
    withEpgId: number;
    withLogo: number;
    withCatchup: number;
    byType: Record<string, number>;
  } {
    const grouped = this.groupByCategory(playlist.entries);
    
    let withEpgId = 0;
    let withLogo = 0;
    let withCatchup = 0;
    const byType: Record<string, number> = {
      LIVE: 0,
      VOD: 0,
      SERIES: 0,
      RADIO: 0,
    };

    for (const entry of playlist.entries) {
      if (entry.tvgId) withEpgId++;
      if (entry.tvgLogo) withLogo++;
      if (entry.catchup) withCatchup++;
      
      const type = this.suggestStreamType(entry);
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      totalEntries: playlist.entries.length,
      categories: grouped.size,
      withEpgId,
      withLogo,
      withCatchup,
      byType,
    };
  }
}

// Default singleton instance
export const m3uParser = new M3UParser();
