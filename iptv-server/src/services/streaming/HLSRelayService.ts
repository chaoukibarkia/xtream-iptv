import { EventEmitter } from 'events';
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { segmentNotificationService } from './SegmentNotificationService.js';

interface SegmentInfo {
  filename: string;
  duration: string;
  downloadedAt: number;
}

interface RelaySession {
  streamId: number;
  sourceUrl: string;
  isRunning: boolean;
  timer?: NodeJS.Timeout;
  lastSequence: number;
  segments: Map<string, SegmentInfo>; // filename -> info, maintains order
  usePushNotifications: boolean; // Use SSE for instant segment notifications
  sseClientId?: string;
  parentServerId?: number;
}

export class HLSRelayService extends EventEmitter {
  private sessions: Map<number, RelaySession> = new Map();
  private readonly POLL_INTERVAL = 500; // Poll every 500ms for faster segment pickup
  private readonly PUSH_POLL_INTERVAL = 2000; // 2s poll when using push notifications (as backup)
  private readonly TIMEOUT = 3000; // Reduced timeout for faster failure detection
  private readonly RETENTION_COUNT = 20; // Keep last 20 segments

  constructor() {
    super();

    // Listen for push segment notifications
    segmentNotificationService.on('segment:ready', (notification) => {
      this.handlePushNotification(notification);
    });
  }

  /**
   * Start relay with optional push notification support
   */
  async startRelay(
    streamId: number,
    sourceUrl: string,
    options?: { usePushNotifications?: boolean; parentServerId?: number }
  ): Promise<void> {
    if (this.sessions.has(streamId)) {
      logger.warn({ streamId }, 'Relay session already active');
      return;
    }

    // Create output directory
    const outputDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
    await fs.mkdir(outputDir, { recursive: true });

    const usePush = options?.usePushNotifications ?? false;
    const sseClientId = usePush ? `relay_${streamId}_${Date.now()}` : undefined;

    const session: RelaySession = {
      streamId,
      sourceUrl,
      isRunning: true,
      lastSequence: -1,
      segments: new Map(),
      usePushNotifications: usePush,
      sseClientId,
      parentServerId: options?.parentServerId,
    };

    this.sessions.set(streamId, session);

    // Mark relay as active in Redis (for load balancer detection)
    if (options?.parentServerId) {
      const serverId = process.env.SERVER_ID || '0';
      await redis.setex(`relay:${streamId}:${serverId}`, 120, Date.now().toString());
    }

    logger.info({ streamId, sourceUrl, usePush }, 'Starting HLS relay service');

    // Start polling (even with push, we poll as a backup)
    this.poll(session);
  }

  async stopRelay(streamId: number, cleanup: boolean = true): Promise<void> {
    const session = this.sessions.get(streamId);
    if (session) {
      session.isRunning = false;
      if (session.timer) clearTimeout(session.timer);

      // Clean up SSE subscription if using push notifications
      if (session.sseClientId) {
        segmentNotificationService.unregisterSSEClient(session.sseClientId);
      }

      this.sessions.delete(streamId);

      // Remove relay marker from Redis
      const serverId = process.env.SERVER_ID || '0';
      await redis.del(`relay:${streamId}:${serverId}`);

      logger.info({ streamId }, 'Stopped HLS relay service');
    }

    // Clean up HLS directory to remove stale segments
    if (cleanup) {
      const outputDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
      try {
        await fs.rm(outputDir, { recursive: true, force: true });
        logger.debug({ streamId, outputDir }, 'HLS relay directory cleaned');
      } catch (error) {
        logger.warn({ streamId, error }, 'Failed to cleanup HLS relay directory');
      }
    }
  }

  /**
   * Handle push notification for new segment
   */
  private async handlePushNotification(notification: {
    streamId: number;
    serverId: number;
    segmentFile: string;
    sequence: number;
  }): Promise<void> {
    const session = this.sessions.get(notification.streamId);

    // Only handle if we have an active session for this stream and using push mode
    if (!session || !session.isRunning || !session.usePushNotifications) {
      return;
    }

    // Check if this notification is from our parent server
    if (session.parentServerId && notification.serverId !== session.parentServerId) {
      return;
    }

    // Skip if we already have this segment
    if (session.segments.has(notification.segmentFile)) {
      return;
    }

    logger.debug(
      { streamId: notification.streamId, segment: notification.segmentFile },
      'Push notification received, fetching segment immediately'
    );

    // Trigger immediate poll to fetch the new segment
    // This is more reliable than trying to construct segment URL from notification
    try {
      await this.processPlaylist(session);
    } catch (err) {
      logger.error({ streamId: notification.streamId, err }, 'Failed to process playlist after push notification');
    }
  }

  private async poll(session: RelaySession) {
    if (!session.isRunning) return;

    try {
      await this.processPlaylist(session);

      // Refresh relay marker in Redis
      if (session.parentServerId) {
        const serverId = process.env.SERVER_ID || '0';
        await redis.setex(`relay:${session.streamId}:${serverId}`, 120, Date.now().toString());
      }
    } catch (error: any) {
      // Only log as error after we have segments (parent should be ready)
      // Before that, it's expected that parent might still be starting
      if (session.segments.size > 0) {
        logger.error({ streamId: session.streamId, error: error.message }, 'Relay poll error');
      } else {
        logger.debug({ streamId: session.streamId, error: error.message }, 'Relay poll waiting for parent');
      }
    }

    if (session.isRunning) {
      // Use longer poll interval when using push notifications (polling is just a backup)
      // Use shorter interval when we don't have any segments yet (parent still starting)
      const interval = session.usePushNotifications 
        ? this.PUSH_POLL_INTERVAL 
        : (session.segments.size === 0 ? 200 : this.POLL_INTERVAL); // 200ms initial, 500ms normal
      session.timer = setTimeout(() => this.poll(session), interval);
    }
  }

  private async processPlaylist(session: RelaySession) {
    const { streamId, sourceUrl } = session;
    const outputDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);

    // Fetch playlist from parent
    const response = await axios.get(sourceUrl, { timeout: this.TIMEOUT });
    const playlistContent = response.data as string;
    
    const lines = playlistContent.split('\n');
    const parentSegments: Array<{ url: string; filename: string; duration: string }> = [];
    let currentMediaSequence = 0;
    let targetDuration = 10;
    let hlsVersion = 3;
    let initMapUri: string | null = null;

    // Parse parent playlist
    let currentDuration = '';
    const sourceBaseUrl = sourceUrl.substring(0, sourceUrl.lastIndexOf('/') + 1);

    for (const line of lines) {
      if (line.startsWith('#EXT-X-VERSION:')) {
        hlsVersion = parseInt(line.split(':')[1]);
      } else if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) {
        currentMediaSequence = parseInt(line.split(':')[1]);
      } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        targetDuration = parseInt(line.split(':')[1]);
      } else if (line.startsWith('#EXT-X-MAP:')) {
        // Parse fMP4 init segment: #EXT-X-MAP:URI="init.mp4"
        const match = line.match(/URI="([^"]+)"/);
        if (match) {
          initMapUri = match[1];
        }
      } else if (line.startsWith('#EXTINF:')) {
        currentDuration = line;
      } else if (line.trim() && !line.startsWith('#')) {
        const segmentUrl = line.startsWith('http') ? line : sourceBaseUrl + line;
        const filename = line.split('/').pop() || `segment_${Date.now()}.ts`;
        parentSegments.push({ url: segmentUrl, filename, duration: currentDuration });
      }
    }

    // Download init.mp4 for fMP4 streams (only once)
    if (initMapUri && !session.segments.has(initMapUri)) {
      try {
        const initUrl = initMapUri.startsWith('http') ? initMapUri : sourceBaseUrl + initMapUri;
        await this.downloadSegment(initUrl, path.join(outputDir, initMapUri));
        session.segments.set(initMapUri, {
          filename: initMapUri,
          duration: '',
          downloadedAt: Date.now(),
        });
        logger.info({ streamId, initFile: initMapUri }, 'Downloaded fMP4 init segment');
      } catch (err) {
        logger.error({ streamId, initFile: initMapUri, err }, 'Failed to download init segment');
      }
    }

    // Download new segments from parent
    for (const seg of parentSegments) {
      if (!session.segments.has(seg.filename)) {
        try {
          await this.downloadSegment(seg.url, path.join(outputDir, seg.filename));
          session.segments.set(seg.filename, {
            filename: seg.filename,
            duration: seg.duration,
            downloadedAt: Date.now(),
          });
          logger.debug({ streamId, segment: seg.filename }, 'Downloaded segment');
        } catch (err) {
          logger.error({ streamId, segment: seg.filename, err }, 'Failed to download segment');
        }
      }
    }

    session.lastSequence = currentMediaSequence;

    // Build local playlist with ALL segments we have that match the parent's window
    // Use the same segments as the parent playlist to maintain sync
    const parentFilenames = new Set(parentSegments.map(s => s.filename));
    
    // Preserve the original HLS version (important for fMP4 which needs version 7)
    let localPlaylist = '#EXTM3U\n';
    localPlaylist += `#EXT-X-VERSION:${hlsVersion}\n`;
    localPlaylist += `#EXT-X-TARGETDURATION:${targetDuration}\n`;
    localPlaylist += `#EXT-X-MEDIA-SEQUENCE:${currentMediaSequence}\n`;
    
    // Add EXT-X-MAP for fMP4 init segment (required for VLC and other players)
    if (initMapUri && session.segments.has(initMapUri)) {
      localPlaylist += `#EXT-X-MAP:URI="${initMapUri}"\n`;
    }
    
    // Add segments in the same order as parent, but only if we have them
    for (const seg of parentSegments) {
      if (session.segments.has(seg.filename)) {
        localPlaylist += `${seg.duration}\n${seg.filename}\n`;
      }
    }

    await fs.writeFile(path.join(outputDir, 'playlist.m3u8'), localPlaylist);

    // Cleanup: remove segments not in parent's current playlist
    // Don't remove init.mp4 - it's needed for the entire stream
    const segmentsToRemove: string[] = [];
    for (const [filename] of session.segments) {
      if (!parentFilenames.has(filename) && filename !== initMapUri) {
        segmentsToRemove.push(filename);
      }
    }
    
    for (const filename of segmentsToRemove) {
      session.segments.delete(filename);
      try {
        await fs.unlink(path.join(outputDir, filename));
      } catch {
        // Ignore if already deleted
      }
    }
  }

  private async downloadSegment(url: string, outputPath: string) {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: this.TIMEOUT
    });
    await fs.writeFile(outputPath, response.data);
  }

}

export const hlsRelayService = new HLSRelayService();

