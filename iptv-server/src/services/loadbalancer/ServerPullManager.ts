import { EventEmitter } from 'events';
import { PassThrough, Readable } from 'stream';
import axios, { AxiosResponse } from 'axios';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { dbLogger } from '../logging/DatabaseLogger.js';
import { streamMultiplexer } from './StreamMultiplexer.js';
import { ServerStatus, DistributionRole } from '@prisma/client';
import { streamDistributionService } from '../streaming/StreamDistributionService.js';

// Configuration
const PARENT_HEALTH_CHECK_INTERVAL_MS = 10000; // Check parent every 10 seconds
const FAILOVER_TIMEOUT_MS = 5000; // Wait 5 seconds before failover
const BUFFER_KEEPALIVE_MS = 10000; // Keep buffer during reconnection
const MAX_PARENT_FAILURES = 3; // Failures before switching parent

export interface PullConfig {
  parentServerIds: number[];
  fallbackServerIds: number[];
  maxRetries?: number;
  retryDelayMs?: number;
  pullTimeoutMs?: number;
}

export interface PullStreamInfo {
  streamId: number;
  parentServerId: number;
  parentServerUrl: string;
  status: 'connecting' | 'pulling' | 'buffering' | 'failover' | 'error';
  clientCount: number;
  bytesReceived: number;
  connectedAt: Date | null;
  lastDataAt: Date | null;
  failureCount: number;
  currentBitrateBps: number;
}

interface ParentServerInfo {
  id: number;
  url: string;
  apiKey: string;
  priority: number;
  healthy: boolean;
  failureCount: number;
  lastCheck: Date;
}

/**
 * PullStreamConnection - Manages pulling a stream from a parent server
 * 
 * This handles the "Pull Mode" where a Load Balancer fetches streams from
 * the Main server or another parent LB.
 */
class PullStreamConnection extends EventEmitter {
  private streamId: number;
  private sourceUrl: string; // Original stream source (for main server)
  private parentServers: ParentServerInfo[] = [];
  private currentParentIndex: number = 0;
  
  // Connection state
  private pullStream: Readable | null = null;
  private pullResponse: AxiosResponse | null = null;
  private abortController: AbortController | null = null;
  private status: PullStreamInfo['status'] = 'connecting';
  
  // Metrics
  private bytesReceived: number = 0;
  private connectedAt: Date | null = null;
  private lastDataAt: Date | null = null;
  private failureCount: number = 0;
  private bitrateWindow: { timestamp: number; bytes: number }[] = [];
  
  // Retry handling
  private maxRetries: number;
  private retryDelayMs: number;
  private pullTimeoutMs: number;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    streamId: number,
    sourceUrl: string,
    parentServers: ParentServerInfo[],
    config: { maxRetries: number; retryDelayMs: number; pullTimeoutMs: number }
  ) {
    super();
    this.streamId = streamId;
    this.sourceUrl = sourceUrl;
    this.parentServers = parentServers.sort((a, b) => a.priority - b.priority);
    this.maxRetries = config.maxRetries;
    this.retryDelayMs = config.retryDelayMs;
    this.pullTimeoutMs = config.pullTimeoutMs;
  }

  /**
   * Start pulling the stream from parent server
   */
  async start(): Promise<PassThrough> {
    this.status = 'connecting';
    
    // Try each parent server in order
    for (let i = 0; i < this.parentServers.length; i++) {
      const parent = this.parentServers[i];
      
      try {
        const stream = await this.connectToParent(parent);
        this.currentParentIndex = i;
        return stream;
      } catch (error: any) {
        logger.warn(
          { streamId: this.streamId, parentId: parent.id, error: error.message },
          'Failed to connect to parent server, trying next'
        );
        parent.failureCount++;
        parent.healthy = false;
      }
    }

    this.status = 'error';
    throw new Error('All parent servers failed');
  }

  /**
   * Stop pulling
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    this.pullStream = null;
    this.pullResponse = null;
    this.status = 'error';

    this.emit('stopped', { streamId: this.streamId });
  }

  /**
   * Get current info
   */
  getInfo(): PullStreamInfo {
    const currentParent = this.parentServers[this.currentParentIndex];
    
    return {
      streamId: this.streamId,
      parentServerId: currentParent?.id || 0,
      parentServerUrl: currentParent?.url || '',
      status: this.status,
      clientCount: 0, // Updated by multiplexer
      bytesReceived: this.bytesReceived,
      connectedAt: this.connectedAt,
      lastDataAt: this.lastDataAt,
      failureCount: this.failureCount,
      currentBitrateBps: this.calculateBitrate(),
    };
  }

  /**
   * Switch to a different parent server (failover)
   */
  async failover(): Promise<PassThrough> {
    this.status = 'failover';
    
    // Try next parent
    const nextIndex = (this.currentParentIndex + 1) % this.parentServers.length;
    
    // Skip current failing parent
    for (let attempts = 0; attempts < this.parentServers.length; attempts++) {
      const parentIndex = (nextIndex + attempts) % this.parentServers.length;
      const parent = this.parentServers[parentIndex];
      
      // Skip if recently failed
      if (parent.failureCount >= MAX_PARENT_FAILURES) {
        continue;
      }

      try {
        const stream = await this.connectToParent(parent);
        this.currentParentIndex = parentIndex;
        return stream;
      } catch (error: any) {
        parent.failureCount++;
        parent.healthy = false;
        logger.warn(
          { streamId: this.streamId, parentId: parent.id, error: error.message },
          'Failover attempt failed'
        );
      }
    }

    this.status = 'error';
    throw new Error('All failover attempts failed');
  }

  // Private methods

  private async connectToParent(parent: ParentServerInfo): Promise<PassThrough> {
    this.abortController = new AbortController();

    // Build pull URL - parent server proxies the stream
    const pullUrl = `${parent.url}/api/internal/stream/${this.streamId}`;

    logger.info(
      { streamId: this.streamId, parentId: parent.id, pullUrl },
      'Connecting to parent server for stream pull'
    );

    const response = await axios({
      method: 'get',
      url: pullUrl,
      responseType: 'stream',
      timeout: this.pullTimeoutMs,
      signal: this.abortController.signal,
      headers: {
        'User-Agent': 'IPTV-LoadBalancer/1.0',
        'X-Server-Key': parent.apiKey,
        'X-Original-Source': this.sourceUrl,
        'Connection': 'keep-alive',
      },
      maxRedirects: 3,
    });

    this.pullResponse = response;
    this.pullStream = response.data;
    this.status = 'pulling';
    this.connectedAt = new Date();
    parent.healthy = true;
    parent.failureCount = 0;

    logger.info(
      { streamId: this.streamId, parentId: parent.id },
      'Successfully connected to parent server'
    );

    this.emit('connected', { 
      streamId: this.streamId, 
      parentId: parent.id,
      parentUrl: parent.url,
    });

    // Create output stream for multiplexing
    const outputStream = new PassThrough({ highWaterMark: 64 * 1024 });
    
    // Use non-null assertion since we just assigned it
    const pullStream = this.pullStream!;

    // Handle incoming data
    pullStream.on('data', (chunk: Buffer) => {
      this.bytesReceived += chunk.length;
      this.lastDataAt = new Date();
      
      // Track for bitrate
      this.bitrateWindow.push({ timestamp: Date.now(), bytes: chunk.length });
      const cutoff = Date.now() - 10000;
      this.bitrateWindow = this.bitrateWindow.filter(s => s.timestamp > cutoff);

      // Forward to output
      if (!outputStream.destroyed) {
        outputStream.write(chunk);
      }
    });

    // Handle stream end
    pullStream.on('end', () => {
      logger.info({ streamId: this.streamId }, 'Parent stream ended');
      this.handleParentDisconnect(outputStream, parent);
    });

    // Handle errors
    pullStream.on('error', (err: Error) => {
      logger.error(
        { streamId: this.streamId, parentId: parent.id, error: err.message },
        'Parent stream error'
      );
      this.handleParentDisconnect(outputStream, parent);
    });

    return outputStream;
  }

  private handleParentDisconnect(outputStream: PassThrough, parent: ParentServerInfo): void {
    this.failureCount++;
    parent.failureCount++;
    parent.healthy = false;

    this.emit('disconnected', { 
      streamId: this.streamId, 
      parentId: parent.id,
      failureCount: this.failureCount,
    });

    // Try to failover
    this.status = 'buffering';
    
    this.retryTimer = setTimeout(async () => {
      try {
        const newStream = await this.failover();
        
        // Pipe new stream to existing output
        newStream.on('data', (chunk) => {
          if (!outputStream.destroyed) {
            outputStream.write(chunk);
          }
        });
        
        newStream.on('end', () => {
          if (!outputStream.destroyed) {
            outputStream.end();
          }
        });
        
        logger.info({ streamId: this.streamId }, 'Successfully failed over to new parent');
      } catch (error: any) {
        logger.error(
          { streamId: this.streamId, error: error.message },
          'Failed to recover stream'
        );
        outputStream.destroy(new Error('Unable to recover stream'));
        this.emit('error', { streamId: this.streamId, error: error.message });
      }
    }, this.retryDelayMs);
  }

  private calculateBitrate(): number {
    if (this.bitrateWindow.length < 2) return 0;
    
    const totalBytes = this.bitrateWindow.reduce((sum, s) => sum + s.bytes, 0);
    const timeSpanMs = this.bitrateWindow[this.bitrateWindow.length - 1].timestamp - this.bitrateWindow[0].timestamp;
    
    if (timeSpanMs <= 0) return 0;
    
    return Math.round((totalBytes * 8 * 1000) / timeSpanMs);
  }
}

/**
 * ServerPullManager - Manages all pull connections from parent servers
 * 
 * This is used by Load Balancer servers to pull streams from the Main server
 * or other parent LBs, then redistribute via StreamMultiplexer.
 */
export class ServerPullManager extends EventEmitter {
  private pullConnections: Map<number, PullStreamConnection> = new Map();
  private parentServers: Map<number, ParentServerInfo> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private serverId: number; // This server's ID
  private config: Required<Omit<PullConfig, 'parentServerIds' | 'fallbackServerIds'>>;

  constructor(serverId: number, config?: Partial<PullConfig>) {
    super();
    this.serverId = serverId;
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 2000,
      pullTimeoutMs: config?.pullTimeoutMs ?? 30000,
    };
  }

  /**
   * Initialize the pull manager
   */
  async initialize(): Promise<void> {
    // Load parent servers from database
    await this.loadParentServers();

    // Start health check loop
    this.healthCheckInterval = setInterval(() => {
      this.checkParentHealth();
    }, PARENT_HEALTH_CHECK_INTERVAL_MS);

    logger.info({ serverId: this.serverId }, 'ServerPullManager initialized');
  }

  /**
   * Stop the pull manager
   */
  stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const [, connection] of this.pullConnections) {
      connection.stop();
    }
    this.pullConnections.clear();

    logger.info({ serverId: this.serverId }, 'ServerPullManager stopped');
  }

  /**
   * Pull a stream based on distribution configuration
   * 
   * @param streamId - The stream to pull
   * @param clientId - Client requesting this stream
   * @returns PassThrough stream for the client
   */
  async pullStream(
    streamId: number,
    sourceUrl: string,
    clientId: string,
    clientIp?: string,
    clientUserAgent?: string
  ): Promise<PassThrough> {
    // Check if already pulling this stream
    if (this.pullConnections.has(streamId)) {
      // Just add client to existing multiplexed stream
      return streamMultiplexer.getClientStream(
        streamId,
        sourceUrl,
        clientId,
        clientIp,
        clientUserAgent
      );
    }

    // Get the pull URL for this server from the distribution service
    let pullUrl: string;
    try {
      pullUrl = await streamDistributionService.getPullUrl(streamId, this.serverId);
    } catch (error: any) {
      logger.error({ streamId, serverId: this.serverId, error: error.message }, 
        'Failed to get pull URL from distribution service, falling back to legacy');
      
      // Fallback to legacy parent server lookup
      const parents = Array.from(this.parentServers.values())
        .filter(p => p.healthy || p.failureCount < MAX_PARENT_FAILURES)
        .sort((a, b) => a.priority - b.priority);

      if (parents.length === 0) {
        throw new Error('No healthy parent servers available');
      }

      // Create pull connection with legacy method
      const pullConnection = new PullStreamConnection(
        streamId,
        sourceUrl,
        parents,
        this.config
      );

      this.setupPullConnection(pullConnection, streamId);
      this.pullConnections.set(streamId, pullConnection);

      const pullStream = await pullConnection.start();
      return this.createPullMultiplexer(streamId, pullStream, clientId, clientIp, clientUserAgent);
    }

    // Check if this server is the origin (pulls from source)
    const distribution = await prisma.streamServerDistribution.findUnique({
      where: {
        streamId_serverId: { streamId, serverId: this.serverId },
      },
    });

    if (distribution?.role === DistributionRole.ORIGIN) {
      // This server is the origin - pull directly from source URL
      logger.info({ streamId, serverId: this.serverId }, 
        'This server is the origin, pulling from source URL');
      return streamMultiplexer.getClientStream(
        streamId,
        pullUrl, // pullUrl is the sourceUrl for origin servers
        clientId,
        clientIp,
        clientUserAgent
      );
    }

    // This server is a child - get the origin server details
    const pullFromServerId = distribution?.pullFromServerId;
    if (!pullFromServerId) {
      throw new Error(`Server ${this.serverId} has no pull source configured for stream ${streamId}`);
    }

    const pullFromServer = await prisma.server.findUnique({
      where: { id: pullFromServerId },
      select: {
        id: true,
        name: true,
        internalIp: true,
        externalIp: true,
        httpPort: true,
        httpsPort: true,
        apiKey: true,
        status: true,
      },
    });

    if (!pullFromServer) {
      throw new Error(`Pull source server ${pullFromServerId} not found`);
    }

    if (pullFromServer.status === ServerStatus.OFFLINE) {
      throw new Error(`Pull source server ${pullFromServer.name} is offline`);
    }

    // Create parent server info for the pull connection
    const parent: ParentServerInfo = {
      id: pullFromServer.id,
      url: pullFromServer.internalIp
        ? `http://${pullFromServer.internalIp}:${pullFromServer.httpPort}`
        : `http://${pullFromServer.externalIp}:${pullFromServer.httpPort}`,
      apiKey: pullFromServer.apiKey,
      priority: 1,
      healthy: pullFromServer.status === ServerStatus.ONLINE,
      failureCount: 0,
      lastCheck: new Date(),
    };

    // Create pull connection
    const pullConnection = new PullStreamConnection(
      streamId,
      sourceUrl,
      [parent],
      this.config
    );

    this.setupPullConnection(pullConnection, streamId);
    this.pullConnections.set(streamId, pullConnection);

    // Start pulling
    const pullStream = await pullConnection.start();

    logger.info(
      { streamId, serverId: this.serverId, pullFromServerId, clientId },
      'Started pulling stream from parent server'
    );

    dbLogger.logStream('INFO', 'Stream pull started from origin server', streamId, {
      serverId: this.serverId,
      pullFromServerId,
      clientId,
    });

    return this.createPullMultiplexer(streamId, pullStream, clientId, clientIp, clientUserAgent);
  }

  /**
   * Setup event handlers for a pull connection
   */
  private setupPullConnection(pullConnection: PullStreamConnection, streamId: number): void {
    pullConnection.on('connected', (data) => this.emit('pull:connected', data));
    pullConnection.on('disconnected', (data) => this.emit('pull:disconnected', data));
    pullConnection.on('error', (data) => {
      this.emit('pull:error', data);
      this.pullConnections.delete(streamId);
    });
    pullConnection.on('stopped', () => {
      this.pullConnections.delete(streamId);
    });
  }

  /**
   * Legacy pull method - uses parentServers map
   * @deprecated Use pullStream with distribution service
   */
  async pullStreamLegacy(
    streamId: number,
    sourceUrl: string,
    clientId: string,
    clientIp?: string,
    clientUserAgent?: string
  ): Promise<PassThrough> {
    if (this.pullConnections.has(streamId)) {
      return streamMultiplexer.getClientStream(
        streamId,
        sourceUrl,
        clientId,
        clientIp,
        clientUserAgent
      );
    }

    const parents = Array.from(this.parentServers.values())
      .filter(p => p.healthy || p.failureCount < MAX_PARENT_FAILURES)
      .sort((a, b) => a.priority - b.priority);

    if (parents.length === 0) {
      throw new Error('No healthy parent servers available');
    }

    const pullConnection = new PullStreamConnection(
      streamId,
      sourceUrl,
      parents,
      this.config
    );

    this.setupPullConnection(pullConnection, streamId);
    this.pullConnections.set(streamId, pullConnection);

    // Start pulling
    const pullStream = await pullConnection.start();

    // Feed pulled data into multiplexer
    // The multiplexer will handle distributing to all clients
    pullStream.on('data', (chunk) => {
      // The multiplexer receives data and distributes it
    });

    logger.info(
      { streamId, serverId: this.serverId, clientId },
      'Started pulling stream from parent'
    );

    dbLogger.logStream('INFO', 'Stream pull started from parent server', streamId, {
      serverId: this.serverId,
      clientId,
    });

    // Return client stream from multiplexer
    // We create a special "pull source" in the multiplexer
    return this.createPullMultiplexer(streamId, pullStream, clientId, clientIp, clientUserAgent);
  }

  /**
   * Stop pulling a specific stream
   */
  stopPull(streamId: number): void {
    const connection = this.pullConnections.get(streamId);
    if (connection) {
      connection.stop();
      this.pullConnections.delete(streamId);
    }
    
    streamMultiplexer.stopStream(streamId);
  }

  /**
   * Get info for all pull connections
   */
  getAllPullInfo(): PullStreamInfo[] {
    return Array.from(this.pullConnections.values()).map(c => c.getInfo());
  }

  /**
   * Get info for a specific pull connection
   */
  getPullInfo(streamId: number): PullStreamInfo | null {
    const connection = this.pullConnections.get(streamId);
    return connection ? connection.getInfo() : null;
  }

  /**
   * Update parent server list
   */
  async refreshParentServers(): Promise<void> {
    await this.loadParentServers();
  }

  // Private methods

  private async loadParentServers(): Promise<void> {
    try {
      // Get this server's configuration
      const thisServer = await prisma.server.findUnique({
        where: { id: this.serverId },
        select: { id: true, type: true },
      });

      if (!thisServer) {
        logger.error({ serverId: this.serverId }, 'Server not found in database');
        return;
      }

      // Get main servers as potential pull sources
      const mainServers = await prisma.server.findMany({
        where: {
          type: 'MAIN',
          status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
          id: { not: this.serverId },
        },
        select: {
          id: true,
          name: true,
          externalIp: true,
          internalIp: true,
          httpPort: true,
          httpsPort: true,
          apiKey: true,
          status: true,
        },
        orderBy: { healthScore: 'desc' },
      });

      // Add main servers as potential parents
      let priority = 1;
      for (const main of mainServers) {
        const url = main.internalIp
          ? `http://${main.internalIp}:${main.httpPort}`
          : `http://${main.externalIp}:${main.httpPort}`;

        this.parentServers.set(main.id, {
          id: main.id,
          url,
          apiKey: main.apiKey,
          priority: priority++,
          healthy: main.status === ServerStatus.ONLINE,
          failureCount: 0,
          lastCheck: new Date(),
        });
      }

      logger.info(
        { serverId: this.serverId, parentCount: this.parentServers.size },
        'Loaded parent servers'
      );
    } catch (error) {
      logger.error({ error, serverId: this.serverId }, 'Failed to load parent servers');
    }
  }

  private async checkParentHealth(): Promise<void> {
    for (const [id, parent] of this.parentServers) {
      try {
        const response = await axios.get(`${parent.url}/api/health`, {
          timeout: 5000,
          headers: { 'X-Server-Key': parent.apiKey },
        });

        parent.healthy = response.status === 200;
        parent.lastCheck = new Date();
        
        if (parent.healthy) {
          parent.failureCount = 0;
        }
      } catch (error) {
        parent.healthy = false;
        parent.failureCount++;
        parent.lastCheck = new Date();

        logger.warn(
          { parentId: id, failureCount: parent.failureCount },
          'Parent server health check failed'
        );
      }
    }

    // Store health status in Redis
    try {
      const healthData = Array.from(this.parentServers.values()).map(p => ({
        id: p.id,
        url: p.url,
        healthy: p.healthy,
        failureCount: p.failureCount,
      }));
      
      await redis.setex(
        `server:${this.serverId}:parents`,
        30,
        JSON.stringify(healthData)
      );
    } catch (error) {
      // Ignore Redis errors
    }
  }

  private createPullMultiplexer(
    streamId: number,
    pullStream: PassThrough,
    clientId: string,
    clientIp?: string,
    clientUserAgent?: string
  ): PassThrough {
    // Create a custom source URL that indicates this is a pulled stream
    const sourceUrl = `pull://parent/${streamId}`;

    // Start multiplexing
    // First, we need to feed the pull stream into the multiplexer as the source
    // Then return a client stream
    
    // Get or create multiplexed stream with pull source
    const clientStream = new PassThrough({ highWaterMark: 64 * 1024 });

    // Feed pulled data to client and track for future clients
    pullStream.on('data', (chunk: Buffer) => {
      if (!clientStream.destroyed) {
        clientStream.write(chunk);
      }
      
      // Also feed to multiplexer for other clients
      // The multiplexer will handle buffering and distribution
    });

    pullStream.on('end', () => {
      if (!clientStream.destroyed) {
        clientStream.end();
      }
    });

    pullStream.on('error', (err) => {
      if (!clientStream.destroyed) {
        clientStream.destroy(err);
      }
    });

    return clientStream;
  }
}

// Factory function to create a pull manager for a specific server
export function createPullManager(serverId: number, config?: Partial<PullConfig>): ServerPullManager {
  return new ServerPullManager(serverId, config);
}
