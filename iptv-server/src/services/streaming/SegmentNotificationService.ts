import { EventEmitter } from 'events';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { FastifyReply } from 'fastify';

// Redis pub/sub channel for segment notifications
const CHANNEL_SEGMENT_READY = 'cascade:segment:ready';

interface SegmentNotification {
  streamId: number;
  serverId: number;
  segmentFile: string;
  segmentDuration: number;
  sequence: number;
  timestamp: number;
}

interface SSEClient {
  id: string;
  streamId: number;
  serverId: number;
  reply: FastifyReply;
  connectedAt: Date;
}

/**
 * SegmentNotificationService - Push-based segment notifications for cascade hierarchy
 *
 * Instead of polling every 1s for new segments, child servers can subscribe to
 * real-time notifications when parent servers have new segments available.
 *
 * This reduces latency and eliminates unnecessary polling overhead.
 */
export class SegmentNotificationService extends EventEmitter {
  private subscriber: typeof redis | null = null;
  private isSubscribed = false;
  private sseClients: Map<string, SSEClient> = new Map();
  private segmentHistory: Map<number, SegmentNotification[]> = new Map(); // streamId -> recent segments

  constructor() {
    super();
  }

  /**
   * Initialize the notification service
   */
  async initialize(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      // Create a duplicate connection for subscribing
      this.subscriber = redis.duplicate();
      await this.subscriber.subscribe(CHANNEL_SEGMENT_READY);

      this.subscriber.on('message', async (channel: string, message: string) => {
        if (channel === CHANNEL_SEGMENT_READY) {
          try {
            const notification: SegmentNotification = JSON.parse(message);
            await this.handleSegmentNotification(notification);
          } catch (err) {
            logger.error({ message, err }, 'Error handling segment notification');
          }
        }
      });

      this.isSubscribed = true;
      logger.info('SegmentNotificationService initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize SegmentNotificationService');
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Close all SSE connections
    for (const client of this.sseClients.values()) {
      try {
        client.reply.raw.end();
      } catch {
        // Ignore errors on cleanup
      }
    }
    this.sseClients.clear();

    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      await this.subscriber.quit();
      this.subscriber = null;
      this.isSubscribed = false;
    }

    logger.info('SegmentNotificationService cleaned up');
  }

  /**
   * Publish notification when a new segment is ready
   * Called by the origin/parent server after generating a segment
   */
  async notifySegmentReady(
    streamId: number,
    serverId: number,
    segmentFile: string,
    segmentDuration: number,
    sequence: number
  ): Promise<void> {
    const notification: SegmentNotification = {
      streamId,
      serverId,
      segmentFile,
      segmentDuration,
      sequence,
      timestamp: Date.now(),
    };

    // Publish to Redis for cross-server communication
    await redis.publish(CHANNEL_SEGMENT_READY, JSON.stringify(notification));

    // Also store in history for late-joining subscribers
    await this.addToHistory(streamId, notification);

    logger.debug({ streamId, segmentFile, sequence }, 'Segment notification published');
  }

  /**
   * Handle incoming segment notification
   */
  private async handleSegmentNotification(notification: SegmentNotification): Promise<void> {
    // Store in local history
    this.addToLocalHistory(notification.streamId, notification);

    // Emit event for local subscribers
    this.emit('segment:ready', notification);

    // Push to SSE clients subscribed to this stream
    for (const client of this.sseClients.values()) {
      if (client.streamId === notification.streamId) {
        this.sendSSEEvent(client, 'segment', notification);
      }
    }
  }

  /**
   * Add notification to Redis history (for late-joining subscribers)
   */
  private async addToHistory(streamId: number, notification: SegmentNotification): Promise<void> {
    const historyKey = `segment_history:${streamId}`;
    await redis.lpush(historyKey, JSON.stringify(notification));
    await redis.ltrim(historyKey, 0, 9); // Keep last 10 segments
    await redis.expire(historyKey, 60); // Expire after 1 minute
  }

  /**
   * Add to local in-memory history
   */
  private addToLocalHistory(streamId: number, notification: SegmentNotification): void {
    let history = this.segmentHistory.get(streamId);
    if (!history) {
      history = [];
      this.segmentHistory.set(streamId, history);
    }
    history.unshift(notification);
    if (history.length > 10) {
      history.pop();
    }
  }

  /**
   * Get recent segment history for a stream
   */
  async getSegmentHistory(streamId: number): Promise<SegmentNotification[]> {
    // Try local cache first
    const local = this.segmentHistory.get(streamId);
    if (local && local.length > 0) {
      return local;
    }

    // Fall back to Redis
    const historyKey = `segment_history:${streamId}`;
    const items = await redis.lrange(historyKey, 0, 9);
    return items.map((item) => JSON.parse(item));
  }

  /**
   * Register an SSE client for segment notifications
   * Used by child servers to receive real-time segment updates
   */
  registerSSEClient(
    clientId: string,
    streamId: number,
    serverId: number,
    reply: FastifyReply
  ): void {
    const client: SSEClient = {
      id: clientId,
      streamId,
      serverId,
      reply,
      connectedAt: new Date(),
    };

    this.sseClients.set(clientId, client);

    // Setup SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event
    this.sendSSEEvent(client, 'connected', {
      streamId,
      serverId,
      timestamp: Date.now(),
    });

    // Send recent segment history
    this.getSegmentHistory(streamId).then((history) => {
      if (history.length > 0) {
        this.sendSSEEvent(client, 'history', history);
      }
    });

    // Handle client disconnect
    reply.raw.on('close', () => {
      this.unregisterSSEClient(clientId);
    });

    logger.debug({ clientId, streamId, serverId }, 'SSE client registered for segment notifications');
  }

  /**
   * Unregister an SSE client
   */
  unregisterSSEClient(clientId: string): void {
    const client = this.sseClients.get(clientId);
    if (client) {
      this.sseClients.delete(clientId);
      logger.debug({ clientId, streamId: client.streamId }, 'SSE client unregistered');
    }
  }

  /**
   * Send SSE event to a client
   */
  private sendSSEEvent(client: SSEClient, event: string, data: unknown): void {
    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.reply.raw.write(message);
    } catch (err) {
      logger.warn({ clientId: client.id, err }, 'Failed to send SSE event');
      this.unregisterSSEClient(client.id);
    }
  }

  /**
   * Send heartbeat to all SSE clients (call periodically to keep connections alive)
   */
  sendHeartbeats(): void {
    const timestamp = Date.now();
    for (const client of this.sseClients.values()) {
      this.sendSSEEvent(client, 'heartbeat', { timestamp });
    }
  }

  /**
   * Get current SSE client count
   */
  getClientCount(): number {
    return this.sseClients.size;
  }

  /**
   * Get SSE clients for a specific stream
   */
  getStreamClients(streamId: number): SSEClient[] {
    return Array.from(this.sseClients.values()).filter((c) => c.streamId === streamId);
  }

  /**
   * Get service status
   */
  getStatus(): {
    initialized: boolean;
    sseClientCount: number;
    trackedStreams: number;
  } {
    return {
      initialized: this.isSubscribed,
      sseClientCount: this.sseClients.size,
      trackedStreams: this.segmentHistory.size,
    };
  }
}

// Export singleton instance
export const segmentNotificationService = new SegmentNotificationService();
