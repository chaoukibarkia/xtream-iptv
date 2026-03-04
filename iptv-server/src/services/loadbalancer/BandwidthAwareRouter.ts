import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { Server, ServerStatus } from '@prisma/client';
import { EventEmitter } from 'events';

// Constants
const BANDWIDTH_UPDATE_INTERVAL_MS = 5000; // Update every 5 seconds
const BANDWIDTH_CACHE_TTL_SECONDS = 10;
const ROUTING_CACHE_TTL_SECONDS = 5;

export interface ServerBandwidthInfo {
  serverId: number;
  serverName: string;
  serverUrl: string;
  maxBandwidthMbps: number;
  currentBandwidthMbps: number;
  availableBandwidthMbps: number;
  usagePercent: number;
  activeConnections: number;
  maxConnections: number;
  healthScore: number;
  lastUpdated: Date;
}

export interface BandwidthRoutingDecision {
  serverId: number;
  serverUrl: string;
  reason: string;
  availableBandwidth: number;
  estimatedStreamBitrate: number;
}

/**
 * BandwidthAwareRouter - Routes users to servers based on real-time bandwidth usage
 * 
 * Features:
 * - Real-time bandwidth monitoring across all servers
 * - Automatic routing to least-loaded server
 * - Bandwidth reservation for new connections
 * - Overflow protection with configurable thresholds
 */
export class BandwidthAwareRouter extends EventEmitter {
  private updateInterval: NodeJS.Timeout | null = null;
  private serverBandwidthCache: Map<number, ServerBandwidthInfo> = new Map();

  constructor() {
    super();
  }

  /**
   * Start the bandwidth monitoring loop
   */
  start(): void {
    if (this.updateInterval) {
      return;
    }

    // Initial update
    this.updateAllServerBandwidth();

    // Periodic updates
    this.updateInterval = setInterval(() => {
      this.updateAllServerBandwidth();
    }, BANDWIDTH_UPDATE_INTERVAL_MS);

    logger.info('BandwidthAwareRouter started');
  }

  /**
   * Stop the bandwidth monitoring loop
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    logger.info('BandwidthAwareRouter stopped');
  }

  /**
   * Update bandwidth info for all active servers
   */
  private async updateAllServerBandwidth(): Promise<void> {
    try {
      const servers = await prisma.server.findMany({
        where: {
          status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
          type: { in: ['EDGE_STREAMER', 'TRANSCODER', 'MAIN'] },
        },
        select: {
          id: true,
          name: true,
          externalIp: true,
          httpPort: true,
          httpsPort: true,
          maxBandwidthMbps: true,
          currentBandwidth: true,
          currentConnections: true,
          maxConnections: true,
          healthScore: true,
          lastHeartbeat: true,
        },
      });

      for (const server of servers) {
        const info: ServerBandwidthInfo = {
          serverId: server.id,
          serverName: server.name,
          serverUrl: this.buildServerUrl(server),
          maxBandwidthMbps: server.maxBandwidthMbps,
          currentBandwidthMbps: server.currentBandwidth,
          availableBandwidthMbps: Math.max(0, server.maxBandwidthMbps - server.currentBandwidth),
          usagePercent: server.maxBandwidthMbps > 0 
            ? Math.round((server.currentBandwidth / server.maxBandwidthMbps) * 100) 
            : 0,
          activeConnections: server.currentConnections,
          maxConnections: server.maxConnections,
          healthScore: server.healthScore,
          lastUpdated: server.lastHeartbeat || new Date(),
        };

        this.serverBandwidthCache.set(server.id, info);

        // Store in Redis for distributed access
        await redis.setex(
          `bandwidth:server:${server.id}`,
          BANDWIDTH_CACHE_TTL_SECONDS,
          JSON.stringify(info)
        );
      }

      // Store server list for quick lookups
      const serverIds = servers.map(s => s.id);
      await redis.setex('bandwidth:servers', BANDWIDTH_CACHE_TTL_SECONDS, JSON.stringify(serverIds));

      this.emit('bandwidth:updated', Array.from(this.serverBandwidthCache.values()));
    } catch (error) {
      logger.error({ error }, 'Failed to update server bandwidth info');
    }
  }

  /**
   * Get the best server for a new stream connection based on bandwidth
   * 
   * @param streamId - The stream to route
   * @param estimatedBitrateMbps - Estimated bitrate needed (default 5 Mbps)
   * @param preferredServerId - Optional preferred server ID
   */
  async routeByBandwidth(
    streamId: number,
    estimatedBitrateMbps: number = 5,
    preferredServerId?: number
  ): Promise<BandwidthRoutingDecision> {
    // Check cache first
    const cacheKey = `routing:stream:${streamId}:${estimatedBitrateMbps}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get servers assigned to this stream
    const assignments = await prisma.serverStream.findMany({
      where: {
        streamId,
        isActive: true,
        server: {
          status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
        },
      },
      include: {
        server: true,
      },
    });

    if (assignments.length === 0) {
      throw new Error(`No servers available for stream ${streamId}`);
    }

    // Score each server based on available bandwidth
    const scoredServers = assignments.map(a => {
      const server = a.server;
      const availableBw = Math.max(0, server.maxBandwidthMbps - server.currentBandwidth);
      const availableConnections = Math.max(0, server.maxConnections - server.currentConnections);
      
      // Calculate score (higher is better)
      let score = 0;
      
      // Primary factor: Available bandwidth (0-50 points)
      const bwPercent = server.maxBandwidthMbps > 0 
        ? availableBw / server.maxBandwidthMbps 
        : 0;
      score += bwPercent * 50;
      
      // Secondary factor: Health score (0-30 points)
      score += (server.healthScore / 100) * 30;
      
      // Tertiary factor: Available connections (0-20 points)
      const connPercent = server.maxConnections > 0 
        ? availableConnections / server.maxConnections 
        : 0;
      score += connPercent * 20;
      
      // Bonus for preferred server
      if (preferredServerId && server.id === preferredServerId) {
        score += 10;
      }
      
      // Penalty for servers that can't handle the estimated bitrate
      if (availableBw < estimatedBitrateMbps) {
        score -= 50;
      }
      
      return {
        server,
        availableBw,
        score,
      };
    });

    // Sort by score (descending)
    scoredServers.sort((a, b) => b.score - a.score);

    const best = scoredServers[0];
    
    if (best.availableBw < estimatedBitrateMbps) {
      logger.warn({
        streamId,
        requiredMbps: estimatedBitrateMbps,
        bestAvailableMbps: best.availableBw,
      }, 'All servers are near capacity, routing to best available');
    }

    const decision: BandwidthRoutingDecision = {
      serverId: best.server.id,
      serverUrl: this.buildServerUrl(best.server),
      reason: this.determineReason(best, estimatedBitrateMbps),
      availableBandwidth: best.availableBw,
      estimatedStreamBitrate: estimatedBitrateMbps,
    };

    // Cache the decision briefly
    await redis.setex(cacheKey, ROUTING_CACHE_TTL_SECONDS, JSON.stringify(decision));

    logger.debug({
      streamId,
      selectedServer: best.server.name,
      availableBw: best.availableBw,
      score: best.score,
    }, 'Routed stream by bandwidth');

    return decision;
  }

  /**
   * Reserve bandwidth on a server for a new connection
   */
  async reserveBandwidth(serverId: number, bandwidthMbps: number): Promise<boolean> {
    try {
      const server = await prisma.server.findUnique({
        where: { id: serverId },
        select: { maxBandwidthMbps: true, currentBandwidth: true },
      });

      if (!server) {
        return false;
      }

      const newBandwidth = server.currentBandwidth + bandwidthMbps;
      
      // Allow slight oversubscription (110% of max)
      if (newBandwidth > server.maxBandwidthMbps * 1.1) {
        logger.warn({
          serverId,
          currentBw: server.currentBandwidth,
          requestedBw: bandwidthMbps,
          maxBw: server.maxBandwidthMbps,
        }, 'Bandwidth reservation rejected - server at capacity');
        return false;
      }

      await prisma.server.update({
        where: { id: serverId },
        data: {
          currentBandwidth: newBandwidth,
          currentConnections: { increment: 1 },
        },
      });

      // Update local cache
      const cached = this.serverBandwidthCache.get(serverId);
      if (cached) {
        cached.currentBandwidthMbps = newBandwidth;
        cached.availableBandwidthMbps = Math.max(0, cached.maxBandwidthMbps - newBandwidth);
        cached.activeConnections++;
      }

      return true;
    } catch (error) {
      logger.error({ error, serverId, bandwidthMbps }, 'Failed to reserve bandwidth');
      return false;
    }
  }

  /**
   * Release bandwidth when a connection ends
   */
  async releaseBandwidth(serverId: number, bandwidthMbps: number): Promise<void> {
    try {
      await prisma.server.update({
        where: { id: serverId },
        data: {
          currentBandwidth: { decrement: bandwidthMbps },
          currentConnections: { decrement: 1 },
        },
      });

      // Update local cache
      const cached = this.serverBandwidthCache.get(serverId);
      if (cached) {
        cached.currentBandwidthMbps = Math.max(0, cached.currentBandwidthMbps - bandwidthMbps);
        cached.availableBandwidthMbps = cached.maxBandwidthMbps - cached.currentBandwidthMbps;
        cached.activeConnections = Math.max(0, cached.activeConnections - 1);
      }
    } catch (error) {
      logger.error({ error, serverId, bandwidthMbps }, 'Failed to release bandwidth');
    }
  }

  /**
   * Get bandwidth info for all servers
   */
  async getAllServerBandwidth(): Promise<ServerBandwidthInfo[]> {
    // Try local cache first
    if (this.serverBandwidthCache.size > 0) {
      return Array.from(this.serverBandwidthCache.values());
    }

    // Fall back to Redis
    const serverIdsJson = await redis.get('bandwidth:servers');
    if (!serverIdsJson) {
      await this.updateAllServerBandwidth();
      return Array.from(this.serverBandwidthCache.values());
    }

    const serverIds: number[] = JSON.parse(serverIdsJson);
    const results: ServerBandwidthInfo[] = [];

    for (const id of serverIds) {
      const infoJson = await redis.get(`bandwidth:server:${id}`);
      if (infoJson) {
        results.push(JSON.parse(infoJson));
      }
    }

    return results;
  }

  /**
   * Get bandwidth info for a specific server
   */
  async getServerBandwidth(serverId: number): Promise<ServerBandwidthInfo | null> {
    // Try local cache
    const cached = this.serverBandwidthCache.get(serverId);
    if (cached) {
      return cached;
    }

    // Try Redis
    const infoJson = await redis.get(`bandwidth:server:${serverId}`);
    if (infoJson) {
      return JSON.parse(infoJson);
    }

    return null;
  }

  /**
   * Get servers sorted by available bandwidth
   */
  async getServersByAvailableBandwidth(): Promise<ServerBandwidthInfo[]> {
    const servers = await this.getAllServerBandwidth();
    return servers.sort((a, b) => b.availableBandwidthMbps - a.availableBandwidthMbps);
  }

  /**
   * Check if a server can accept a new connection
   */
  async canAcceptConnection(serverId: number, requiredBandwidthMbps: number = 5): Promise<boolean> {
    const info = await this.getServerBandwidth(serverId);
    if (!info) {
      return false;
    }

    return info.availableBandwidthMbps >= requiredBandwidthMbps &&
           info.activeConnections < info.maxConnections;
  }

  /**
   * Get overall system bandwidth status
   */
  async getSystemBandwidthStatus(): Promise<{
    totalMaxBandwidth: number;
    totalCurrentBandwidth: number;
    totalAvailableBandwidth: number;
    overallUsagePercent: number;
    serverCount: number;
    healthyServerCount: number;
  }> {
    const servers = await this.getAllServerBandwidth();
    
    let totalMax = 0;
    let totalCurrent = 0;
    let healthyCount = 0;

    for (const server of servers) {
      totalMax += server.maxBandwidthMbps;
      totalCurrent += server.currentBandwidthMbps;
      if (server.healthScore >= 50) {
        healthyCount++;
      }
    }

    return {
      totalMaxBandwidth: totalMax,
      totalCurrentBandwidth: totalCurrent,
      totalAvailableBandwidth: Math.max(0, totalMax - totalCurrent),
      overallUsagePercent: totalMax > 0 ? Math.round((totalCurrent / totalMax) * 100) : 0,
      serverCount: servers.length,
      healthyServerCount: healthyCount,
    };
  }

  private buildServerUrl(server: { externalIp: string; httpPort: number; httpsPort: number | null }): string {
    const protocol = server.httpsPort ? 'https' : 'http';
    const port = server.httpsPort || server.httpPort;
    return `${protocol}://${server.externalIp}:${port}`;
  }

  private determineReason(
    scored: { server: Server; availableBw: number; score: number },
    requiredBw: number
  ): string {
    if (scored.availableBw >= requiredBw * 2) {
      return 'high_bandwidth_available';
    }
    if (scored.availableBw >= requiredBw) {
      return 'sufficient_bandwidth';
    }
    if (scored.server.healthScore >= 80) {
      return 'best_health_score';
    }
    return 'best_available';
  }
}

// Export singleton instance
export const bandwidthRouter = new BandwidthAwareRouter();
