import { EventEmitter } from 'events';
import { PassThrough, Readable } from 'stream';
import axios, { AxiosResponse } from 'axios';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { dbLogger } from '../logging/DatabaseLogger.js';

// Configuration
const DEFAULT_BUFFER_SIZE = 2 * 1024 * 1024; // 2MB buffer per stream
const DEFAULT_IDLE_TIMEOUT_MS = 30000; // 30 seconds after last client
const RECONNECT_DELAY_MS = 2000; // 2 seconds between reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 5;
const STATS_UPDATE_INTERVAL_MS = 5000; // Update stats every 5 seconds
const CHUNK_HIGH_WATER_MARK = 64 * 1024; // 64KB chunks

export interface MultiplexerConfig {
  bufferSize?: number;
  idleTimeoutMs?: number;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export interface ClientInfo {
  id: string;
  connectedAt: Date;
  bytesDelivered: number;
  ip?: string;
  userAgent?: string;
}

export interface MultiplexedStreamInfo {
  streamId: number;
  sourceUrl: string;
  status: 'connecting' | 'active' | 'reconnecting' | 'idle' | 'stopped' | 'error';
  clientCount: number;
  clients: Map<string, ClientInfo>;
  bytesReceived: number;
  bytesDelivered: number;
  startedAt: Date;
  lastClientAt: Date;
  reconnectAttempts: number;
  lastError?: string;
  bitrateBps?: number;
}

interface BufferChunk {
  data: Buffer;
  timestamp: number;
}

/**
 * MultiplexedStream - Manages a single source connection shared by multiple clients
 * 
 * Features:
 * - Single HTTP connection to source
 * - Circular buffer for new client catch-up
 * - Automatic reconnection on source failure
 * - Idle timeout when no clients
 * - Per-client byte counters for bandwidth tracking
 */
class MultiplexedStream extends EventEmitter {
  private streamId: number;
  private sourceUrl: string;
  private config: Required<MultiplexerConfig>;
  
  // Source connection
  private sourceStream: Readable | null = null;
  private sourceResponse: AxiosResponse | null = null;
  private abortController: AbortController | null = null;
  
  // Client management
  private clients: Map<string, { stream: PassThrough; info: ClientInfo }> = new Map();
  
  // Buffering
  private ringBuffer: BufferChunk[] = [];
  private bufferSize: number = 0;
  private maxBufferSize: number;
  
  // State
  private status: MultiplexedStreamInfo['status'] = 'stopped';
  private bytesReceived: number = 0;
  private bytesDelivered: number = 0;
  private startedAt: Date = new Date();
  private lastClientAt: Date = new Date();
  private reconnectAttempts: number = 0;
  private lastError?: string;
  
  // Timers
  private idleTimer: NodeJS.Timeout | null = null;
  private statsInterval: NodeJS.Timeout | null = null;
  private bitrateWindow: { timestamp: number; bytes: number }[] = [];

  constructor(
    streamId: number,
    sourceUrl: string,
    config: Required<MultiplexerConfig>
  ) {
    super();
    this.streamId = streamId;
    this.sourceUrl = sourceUrl;
    this.config = config;
    this.maxBufferSize = config.bufferSize;
  }

  /**
   * Start the multiplexed stream - connects to source
   */
  async start(): Promise<void> {
    if (this.status === 'active' || this.status === 'connecting') {
      return;
    }

    this.status = 'connecting';
    this.startedAt = new Date();
    this.bytesReceived = 0;
    this.bytesDelivered = 0;
    this.reconnectAttempts = 0;

    await this.connectToSource();
    
    // Start stats collection
    this.statsInterval = setInterval(() => {
      this.updateStats();
    }, STATS_UPDATE_INTERVAL_MS);
  }

  /**
   * Stop the multiplexed stream
   */
  stop(): void {
    this.status = 'stopped';
    
    // Clear timers
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    // Abort source connection
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Close all client streams
    for (const [clientId, client] of this.clients) {
      client.stream.end();
      this.clients.delete(clientId);
    }

    // Clear buffer
    this.ringBuffer = [];
    this.bufferSize = 0;

    this.emit('stopped', { streamId: this.streamId });
    logger.info({ streamId: this.streamId }, 'Multiplexed stream stopped');
  }

  /**
   * Add a client to receive the stream
   */
  addClient(
    clientId: string,
    ip?: string,
    userAgent?: string
  ): PassThrough {
    // Cancel idle timer
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    // Create client stream
    const clientStream = new PassThrough({
      highWaterMark: CHUNK_HIGH_WATER_MARK,
    });

    const clientInfo: ClientInfo = {
      id: clientId,
      connectedAt: new Date(),
      bytesDelivered: 0,
      ip,
      userAgent,
    };

    this.clients.set(clientId, { stream: clientStream, info: clientInfo });
    this.lastClientAt = new Date();

    // Send buffered data to new client for quick start
    this.sendBufferedData(clientStream, clientInfo);

    // Handle client disconnect
    clientStream.on('close', () => {
      this.removeClient(clientId);
    });

    clientStream.on('error', (err) => {
      logger.debug({ streamId: this.streamId, clientId, error: err.message }, 'Client stream error');
      this.removeClient(clientId);
    });

    logger.debug(
      { streamId: this.streamId, clientId, clientCount: this.clients.size },
      'Client added to multiplexed stream'
    );

    this.emit('client:added', { streamId: this.streamId, clientId, clientCount: this.clients.size });

    // Start stream if not already running
    if (this.status === 'stopped' || this.status === 'idle') {
      this.start().catch((err) => {
        logger.error({ streamId: this.streamId, error: err }, 'Failed to start multiplexed stream');
      });
    }

    return clientStream;
  }

  /**
   * Remove a client
   */
  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Update total bytes delivered
    this.bytesDelivered += client.info.bytesDelivered;

    // End client stream if not already ended
    if (!client.stream.destroyed) {
      client.stream.end();
    }

    this.clients.delete(clientId);
    this.lastClientAt = new Date();

    logger.debug(
      { streamId: this.streamId, clientId, clientCount: this.clients.size },
      'Client removed from multiplexed stream'
    );

    this.emit('client:removed', { streamId: this.streamId, clientId, clientCount: this.clients.size });

    // Schedule idle timeout if no more clients
    if (this.clients.size === 0) {
      this.scheduleIdleStop();
    }
  }

  /**
   * Get stream info
   */
  getInfo(): MultiplexedStreamInfo {
    return {
      streamId: this.streamId,
      sourceUrl: this.sourceUrl,
      status: this.status,
      clientCount: this.clients.size,
      clients: new Map(
        Array.from(this.clients.entries()).map(([id, c]) => [id, { ...c.info }])
      ),
      bytesReceived: this.bytesReceived,
      bytesDelivered: this.bytesDelivered + this.getCurrentBytesDelivered(),
      startedAt: this.startedAt,
      lastClientAt: this.lastClientAt,
      reconnectAttempts: this.reconnectAttempts,
      lastError: this.lastError,
      bitrateBps: this.calculateBitrate(),
    };
  }

  /**
   * Get client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Check if stream is active
   */
  isActive(): boolean {
    return this.status === 'active' || this.status === 'connecting' || this.status === 'reconnecting';
  }

  // Private methods

  private async connectToSource(): Promise<void> {
    try {
      this.abortController = new AbortController();

      const response = await axios({
        method: 'get',
        url: this.sourceUrl,
        responseType: 'stream',
        timeout: 30000,
        signal: this.abortController.signal,
        headers: {
          'User-Agent': 'IPTV-Multiplexer/1.0',
          'Connection': 'keep-alive',
        },
        maxRedirects: 5,
      });

      this.sourceResponse = response;
      this.sourceStream = response.data;
      this.status = 'active';
      this.reconnectAttempts = 0;

      logger.info(
        { streamId: this.streamId, contentType: response.headers['content-type'] },
        'Connected to source for multiplexing'
      );

      this.emit('connected', { streamId: this.streamId });

      // Use non-null assertion since we just assigned it
      const sourceStream = this.sourceStream!;

      // Handle incoming data
      sourceStream.on('data', (chunk: Buffer) => {
        this.handleSourceData(chunk);
      });

      // Handle source end
      sourceStream.on('end', () => {
        logger.info({ streamId: this.streamId }, 'Source stream ended');
        this.handleSourceDisconnect();
      });

      // Handle source error
      sourceStream.on('error', (err: Error) => {
        logger.error({ streamId: this.streamId, error: err.message }, 'Source stream error');
        this.lastError = err.message;
        this.handleSourceDisconnect();
      });

    } catch (error: any) {
      this.lastError = error.message;
      logger.error(
        { streamId: this.streamId, error: error.message },
        'Failed to connect to source'
      );
      
      // Try to reconnect if we have clients
      if (this.clients.size > 0) {
        await this.attemptReconnect();
      } else {
        this.status = 'error';
        this.emit('error', { streamId: this.streamId, error: error.message });
      }
    }
  }

  private handleSourceData(chunk: Buffer): void {
    this.bytesReceived += chunk.length;

    // Track for bitrate calculation
    this.bitrateWindow.push({ timestamp: Date.now(), bytes: chunk.length });
    
    // Keep only last 10 seconds of samples
    const cutoff = Date.now() - 10000;
    this.bitrateWindow = this.bitrateWindow.filter(s => s.timestamp > cutoff);

    // Add to ring buffer
    this.addToBuffer(chunk);

    // Distribute to all connected clients
    for (const [clientId, client] of this.clients) {
      if (!client.stream.destroyed && client.stream.writable) {
        const written = client.stream.write(chunk);
        if (written) {
          client.info.bytesDelivered += chunk.length;
        }
      }
    }
  }

  private addToBuffer(chunk: Buffer): void {
    const bufferChunk: BufferChunk = {
      data: chunk,
      timestamp: Date.now(),
    };

    this.ringBuffer.push(bufferChunk);
    this.bufferSize += chunk.length;

    // Remove old chunks if buffer exceeds max size
    while (this.bufferSize > this.maxBufferSize && this.ringBuffer.length > 1) {
      const removed = this.ringBuffer.shift()!;
      this.bufferSize -= removed.data.length;
    }
  }

  private sendBufferedData(clientStream: PassThrough, clientInfo: ClientInfo): void {
    // Send buffered data to new client for quick playback start
    for (const chunk of this.ringBuffer) {
      if (!clientStream.destroyed && clientStream.writable) {
        const written = clientStream.write(chunk.data);
        if (written) {
          clientInfo.bytesDelivered += chunk.data.length;
        }
      }
    }
  }

  private handleSourceDisconnect(): void {
    this.sourceStream = null;
    this.sourceResponse = null;

    // If we have clients, try to reconnect
    if (this.clients.size > 0 && this.status !== 'stopped') {
      this.attemptReconnect();
    } else {
      this.status = 'idle';
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error(
        { streamId: this.streamId, attempts: this.reconnectAttempts },
        'Max reconnection attempts reached'
      );
      this.status = 'error';
      this.lastError = 'Max reconnection attempts reached';
      
      // Notify all clients of failure
      for (const [, client] of this.clients) {
        client.stream.destroy(new Error('Source connection lost'));
      }
      this.clients.clear();
      
      this.emit('error', { streamId: this.streamId, error: this.lastError });
      return;
    }

    this.status = 'reconnecting';
    this.reconnectAttempts++;

    logger.info(
      { streamId: this.streamId, attempt: this.reconnectAttempts },
      'Attempting to reconnect to source'
    );

    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, this.config.reconnectDelayMs));

    // Only reconnect if we still have clients and haven't been stopped
    if (this.clients.size > 0 && this.status === 'reconnecting') {
      await this.connectToSource();
    }
  }

  private scheduleIdleStop(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    logger.debug(
      { streamId: this.streamId, timeoutMs: this.config.idleTimeoutMs },
      'Scheduling multiplexed stream idle stop'
    );

    this.idleTimer = setTimeout(() => {
      if (this.clients.size === 0) {
        logger.info({ streamId: this.streamId }, 'Stopping idle multiplexed stream');
        this.status = 'idle';
        
        // Close source connection to save resources
        if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
        }
        
        this.emit('idle', { streamId: this.streamId });
      }
    }, this.config.idleTimeoutMs);
  }

  private calculateBitrate(): number {
    if (this.bitrateWindow.length < 2) return 0;
    
    const totalBytes = this.bitrateWindow.reduce((sum, s) => sum + s.bytes, 0);
    const timeSpanMs = this.bitrateWindow[this.bitrateWindow.length - 1].timestamp - this.bitrateWindow[0].timestamp;
    
    if (timeSpanMs <= 0) return 0;
    
    // Convert to bits per second
    return Math.round((totalBytes * 8 * 1000) / timeSpanMs);
  }

  private getCurrentBytesDelivered(): number {
    let total = 0;
    for (const [, client] of this.clients) {
      total += client.info.bytesDelivered;
    }
    return total;
  }

  private async updateStats(): Promise<void> {
    const info = this.getInfo();
    
    // Store stats in Redis for distributed access
    try {
      await redis.setex(
        `multiplex:stream:${this.streamId}`,
        30,
        JSON.stringify({
          status: info.status,
          clientCount: info.clientCount,
          bytesReceived: info.bytesReceived,
          bytesDelivered: info.bytesDelivered,
          bitrateBps: info.bitrateBps,
          startedAt: info.startedAt.toISOString(),
          lastClientAt: info.lastClientAt.toISOString(),
        })
      );
    } catch (error) {
      // Ignore Redis errors
    }
  }
}

/**
 * StreamMultiplexer - Manages all multiplexed streams
 * 
 * This is the main entry point for stream multiplexing.
 * It maintains a pool of MultiplexedStream instances and routes clients to them.
 */
export class StreamMultiplexer extends EventEmitter {
  private streams: Map<number, MultiplexedStream> = new Map();
  private config: Required<MultiplexerConfig>;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config?: MultiplexerConfig) {
    super();
    this.config = {
      bufferSize: config?.bufferSize ?? DEFAULT_BUFFER_SIZE,
      idleTimeoutMs: config?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      maxReconnectAttempts: config?.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS,
      reconnectDelayMs: config?.reconnectDelayMs ?? RECONNECT_DELAY_MS,
    };
  }

  /**
   * Start the multiplexer
   */
  start(): void {
    // Periodic cleanup of idle streams
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleStreams();
    }, 60000); // Every minute

    logger.info('StreamMultiplexer started');
  }

  /**
   * Stop the multiplexer and all streams
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    for (const [, stream] of this.streams) {
      stream.stop();
    }
    this.streams.clear();

    logger.info('StreamMultiplexer stopped');
  }

  /**
   * Get or create a client connection to a stream
   * 
   * This is the main method for Load Balancers to use.
   * It returns a PassThrough stream that receives the multiplexed data.
   */
  getClientStream(
    streamId: number,
    sourceUrl: string,
    clientId: string,
    ip?: string,
    userAgent?: string
  ): PassThrough {
    let multiplexedStream = this.streams.get(streamId);

    if (!multiplexedStream) {
      // Create new multiplexed stream
      multiplexedStream = new MultiplexedStream(streamId, sourceUrl, this.config);
      this.streams.set(streamId, multiplexedStream);

      // Forward events
      multiplexedStream.on('connected', (data) => this.emit('stream:connected', data));
      multiplexedStream.on('stopped', (data) => this.emit('stream:stopped', data));
      multiplexedStream.on('error', (data) => this.emit('stream:error', data));
      multiplexedStream.on('idle', (data) => {
        this.emit('stream:idle', data);
        // Optionally remove idle streams after some time
      });
      multiplexedStream.on('client:added', (data) => this.emit('client:added', data));
      multiplexedStream.on('client:removed', (data) => this.emit('client:removed', data));

      logger.info({ streamId, sourceUrl }, 'Created new multiplexed stream');
      
      dbLogger.logStream('INFO', 'Multiplexed stream created', streamId, {
        sourceUrl,
        bufferSize: this.config.bufferSize,
      });
    }

    return multiplexedStream.addClient(clientId, ip, userAgent);
  }

  /**
   * Disconnect a specific client
   */
  disconnectClient(streamId: number, clientId: string): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.removeClient(clientId);
    }
  }

  /**
   * Stop a specific stream
   */
  stopStream(streamId: number): void {
    const stream = this.streams.get(streamId);
    if (stream) {
      stream.stop();
      this.streams.delete(streamId);
    }
  }

  /**
   * Get info for a specific stream
   */
  getStreamInfo(streamId: number): MultiplexedStreamInfo | null {
    const stream = this.streams.get(streamId);
    return stream ? stream.getInfo() : null;
  }

  /**
   * Get info for all streams
   */
  getAllStreamsInfo(): MultiplexedStreamInfo[] {
    return Array.from(this.streams.values()).map(s => s.getInfo());
  }

  /**
   * Get total client count across all streams
   */
  getTotalClientCount(): number {
    let total = 0;
    for (const [, stream] of this.streams) {
      total += stream.getClientCount();
    }
    return total;
  }

  /**
   * Get stats summary
   */
  getStats(): {
    activeStreams: number;
    totalClients: number;
    totalBytesReceived: number;
    totalBytesDelivered: number;
  } {
    let totalBytesReceived = 0;
    let totalBytesDelivered = 0;
    let activeStreams = 0;

    for (const [, stream] of this.streams) {
      const info = stream.getInfo();
      if (stream.isActive()) {
        activeStreams++;
      }
      totalBytesReceived += info.bytesReceived;
      totalBytesDelivered += info.bytesDelivered;
    }

    return {
      activeStreams,
      totalClients: this.getTotalClientCount(),
      totalBytesReceived,
      totalBytesDelivered,
    };
  }

  /**
   * Check if a stream is currently multiplexed
   */
  isStreamMultiplexed(streamId: number): boolean {
    const stream = this.streams.get(streamId);
    return stream ? stream.isActive() : false;
  }

  /**
   * Update source URL for a stream (for failover)
   */
  async updateSourceUrl(streamId: number, newSourceUrl: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }

    const info = stream.getInfo();
    const clients = Array.from(info.clients.values());

    // Stop old stream
    stream.stop();
    this.streams.delete(streamId);

    // Create new stream with updated URL
    const newStream = new MultiplexedStream(streamId, newSourceUrl, this.config);
    this.streams.set(streamId, newStream);

    // Reconnect all clients
    for (const client of clients) {
      newStream.addClient(client.id, client.ip, client.userAgent);
    }

    logger.info({ streamId, oldUrl: info.sourceUrl, newUrl: newSourceUrl }, 'Updated multiplexed stream source');
  }

  // Private methods

  private cleanupIdleStreams(): void {
    const now = Date.now();
    const idleThreshold = this.config.idleTimeoutMs * 2; // Double the idle timeout before cleanup

    for (const [streamId, stream] of this.streams) {
      const info = stream.getInfo();
      
      if (info.status === 'idle' || info.status === 'stopped') {
        const idleTime = now - info.lastClientAt.getTime();
        
        if (idleTime > idleThreshold) {
          logger.info({ streamId, idleTimeMs: idleTime }, 'Cleaning up idle multiplexed stream');
          stream.stop();
          this.streams.delete(streamId);
        }
      }
    }
  }
}

// Export singleton instance
export const streamMultiplexer = new StreamMultiplexer();
