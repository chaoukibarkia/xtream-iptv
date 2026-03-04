import { prisma } from '../../config/database.js';
import { cache, redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import geoip from 'geoip-lite';
import { Server, ServerStatus, StreamType } from '@prisma/client';

// Redis pub/sub channels for real-time cache invalidation
const CHANNEL_SERVER_STATE = 'lb:server:state';
const CHANNEL_STREAM_STATE = 'lb:stream:state';

interface RoutingDecision {
  serverId: number;
  serverUrl: string;
  reason: string;
}

interface ServerWithAssignments extends Server {
  streamAssignments: {
    streamId: number;
    isActive: boolean;
  }[];
}

interface RunningStreamInfo {
  serverId: number;
  server: Server;
  viewerCount: number;
  hasCapacity: boolean;
}

export class LoadBalancer {
  private roundRobinIndex: Map<string, number> = new Map();
  private subscriber: typeof redis | null = null;
  private isSubscribed = false;

  /**
   * Initialize pub/sub for real-time cache invalidation
   */
  async initPubSub(): Promise<void> {
    if (this.isSubscribed) return;

    try {
      // Create a duplicate connection for subscribing
      this.subscriber = redis.duplicate();
      await this.subscriber.subscribe(CHANNEL_SERVER_STATE, CHANNEL_STREAM_STATE);

      this.subscriber.on('message', async (channel: string, message: string) => {
        try {
          const data = JSON.parse(message);
          await this.handlePubSubMessage(channel, data);
        } catch (err) {
          logger.error({ channel, message, err }, 'Error handling pub/sub message');
        }
      });

      this.isSubscribed = true;
      logger.info('LoadBalancer pub/sub initialized for real-time cache invalidation');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize LoadBalancer pub/sub');
    }
  }

  /**
   * Handle pub/sub messages for cache invalidation
   */
  private async handlePubSubMessage(channel: string, data: { type: string; id: number; status?: string }): Promise<void> {
    if (channel === CHANNEL_SERVER_STATE) {
      // Server went offline/online - invalidate all stream caches for this server
      if (data.type === 'offline' || data.type === 'status_change') {
        const assignments = await prisma.serverStream.findMany({
          where: { serverId: data.id },
          select: { streamId: true },
        });
        for (const a of assignments) {
          await cache.del(cache.KEYS.AVAILABLE_SERVERS(a.streamId));
        }
        logger.debug({ serverId: data.id, invalidatedStreams: assignments.length }, 'Cache invalidated via pub/sub');
      }
    } else if (channel === CHANNEL_STREAM_STATE) {
      // Stream started/stopped - invalidate running streams cache
      await cache.del(cache.KEYS.AVAILABLE_SERVERS(data.id));
      await cache.del(`running_stream:${data.id}`);
    }
  }

  /**
   * Publish server state change for real-time cache invalidation
   */
  async publishServerStateChange(serverId: number, type: 'online' | 'offline' | 'status_change'): Promise<void> {
    await redis.publish(CHANNEL_SERVER_STATE, JSON.stringify({ type, id: serverId }));
  }

  /**
   * Publish stream state change for real-time cache invalidation
   */
  async publishStreamStateChange(streamId: number, type: 'started' | 'stopped'): Promise<void> {
    await redis.publish(CHANNEL_STREAM_STATE, JSON.stringify({ type, id: streamId }));
  }

  /**
   * Get the best server for a given stream and user
   * Implements stream affinity - prefers servers already running the stream
   */
  async routeStream(
    streamId: number,
    _userId: number,
    userIp: string,
    preferredOutput: string
  ): Promise<RoutingDecision> {
    // Get user's geographic info
    const geo = geoip.lookup(userIp);
    const userRegion = geo?.region || null;
    const userCountry = geo?.country || null;
    const userCoords = geo?.ll as [number, number] | undefined;

    // Check for custom routing rules first
    const customRoute = await this.checkCustomRules(streamId, userRegion, userCountry);
    if (customRoute) {
      return customRoute;
    }

    // STREAM AFFINITY: Check if stream is already running on any server
    const runningServers = await this.getServersRunningStream(streamId);

    if (runningServers.length > 0) {
      // Find best running server with capacity
      const bestRunning = this.selectBestRunningServer(
        runningServers,
        userRegion,
        userCountry,
        userCoords
      );

      if (bestRunning && bestRunning.hasCapacity) {
        logger.debug({
          streamId,
          serverId: bestRunning.serverId,
          viewerCount: bestRunning.viewerCount
        }, 'Stream affinity: routing to server already running stream');

        return {
          serverId: bestRunning.serverId,
          serverUrl: this.buildServerUrl(bestRunning.server),
          reason: 'stream_affinity (already running)',
        };
      }
    }

    // No running server with capacity - find best ORIGIN server to start stream
    // Only ORIGIN servers can start streams from source, CHILD servers can only relay
    const availableServers = await this.getAvailableServers(streamId, preferredOutput, true);

    if (availableServers.length === 0) {
      // Fall back to any server if no ORIGIN servers available
      const fallbackServers = await this.getAvailableServers(streamId, preferredOutput, false);
      if (fallbackServers.length === 0) {
        throw new Error('No servers available for this stream');
      }
      logger.warn({
        streamId,
        fallbackCount: fallbackServers.length,
      }, 'No ORIGIN servers available, falling back to any available server');
      
      const server = await this.selectBestServer(
        fallbackServers,
        userRegion,
        userCountry,
        userCoords
      );

      return {
        serverId: server.id,
        serverUrl: this.buildServerUrl(server),
        reason: `Selected via ${server.routeReason} (fallback, no ORIGIN)`,
      };
    }

    // Apply routing strategy
    const server = await this.selectBestServer(
      availableServers,
      userRegion,
      userCountry,
      userCoords
    );

    return {
      serverId: server.id,
      serverUrl: this.buildServerUrl(server),
      reason: `Selected via ${server.routeReason}`,
    };
  }

  /**
   * Get servers where this stream is currently running
   * Uses Redis for fast lookup with short TTL
   */
  async getServersRunningStream(streamId: number): Promise<RunningStreamInfo[]> {
    const cacheKey = `running_stream:${streamId}`;
    const cached = await cache.get<RunningStreamInfo[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // Query database for servers running this stream
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: {
        streamStatus: true,
        runningServerId: true,
        ffmpegPid: true,
      },
    });

    if (!stream || stream.streamStatus !== 'RUNNING' || !stream.runningServerId) {
      await cache.set(cacheKey, [], 10); // Cache empty result for 10s
      return [];
    }

    // Get server details
    const server = await prisma.server.findUnique({
      where: { id: stream.runningServerId },
    });

    if (!server || (server.status !== ServerStatus.ONLINE && server.status !== ServerStatus.DEGRADED)) {
      await cache.set(cacheKey, [], 10);
      return [];
    }

    // Get viewer count from Redis
    const viewerKeys = await redis.keys(`stream:${streamId}:viewer:*`);
    const viewerCount = viewerKeys.length;

    // Check capacity (allow up to 80% of max connections per stream for safety margin)
    const hasCapacity = server.currentConnections < server.maxConnections * 0.95;

    const result: RunningStreamInfo[] = [{
      serverId: server.id,
      server,
      viewerCount,
      hasCapacity,
    }];

    // Also check cascade child servers that might be running this stream
    const childServers = await prisma.streamServerDistribution.findMany({
      where: {
        streamId,
        isActive: true,
        role: 'CHILD',
      },
      include: {
        server: true,
      },
    });

    for (const child of childServers) {
      if (child.server.status === ServerStatus.ONLINE || child.server.status === ServerStatus.DEGRADED) {
        // Check if this child server has active relay
        const relayActive = await redis.exists(`relay:${streamId}:${child.serverId}`);
        if (relayActive) {
          const childHasCapacity = child.server.currentConnections < child.server.maxConnections * 0.95;
          result.push({
            serverId: child.serverId,
            server: child.server,
            viewerCount: 0, // Child servers don't track viewers separately
            hasCapacity: childHasCapacity,
          });
        }
      }
    }

    // Cache for 5 seconds (short TTL for running state)
    await cache.set(cacheKey, result, 5);

    return result;
  }

  /**
   * Select the best server from those already running the stream
   */
  private selectBestRunningServer(
    runningServers: RunningStreamInfo[],
    userRegion: string | null,
    userCountry: string | null,
    userCoords: [number, number] | undefined
  ): RunningStreamInfo | null {
    // Filter to servers with capacity
    const withCapacity = runningServers.filter(s => s.hasCapacity);

    if (withCapacity.length === 0) {
      return null;
    }

    // Score each server
    const scored = withCapacity.map(info => {
      let score = info.server.healthScore;

      // Boost for same region
      if (userRegion && info.server.region === userRegion) {
        score += 25;
      }

      // Boost for same country
      if (userCountry && info.server.country === userCountry) {
        score += 20;
      }

      // Penalize high load
      const loadPenalty = (info.server.currentConnections / info.server.maxConnections) * 30;
      score -= loadPenalty;

      // Geographic distance bonus
      if (userCoords && info.server.latitude && info.server.longitude) {
        const distance = this.haversineDistance(userCoords, [
          info.server.latitude,
          info.server.longitude,
        ]);
        const distanceBonus = Math.max(0, 15 - distance / 100);
        score += distanceBonus;
      }

      // Prefer origin server slightly (more stable, direct source)
      // Child servers might have slight relay delay
      const isOrigin = info.viewerCount > 0; // Origin tracks viewers
      if (isOrigin) {
        score += 5;
      }

      return { info, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.info || null;
  }

  /**
   * Check custom load balancer rules
   */
  private async checkCustomRules(
    _streamId: number,
    userRegion: string | null,
    userCountry: string | null
  ): Promise<RoutingDecision | null> {
    const rules = await prisma.loadBalancerRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });

    for (const rule of rules) {
      // Check if rule matches
      if (rule.matchRegion && rule.matchRegion !== userRegion) continue;
      if (rule.matchCountry && rule.matchCountry !== userCountry) continue;

      // Get target servers
      const servers = await prisma.server.findMany({
        where: {
          id: { in: rule.targetServerIds },
          status: ServerStatus.ONLINE,
        },
      });

      if (servers.length === 0) continue;

      // Apply route type
      let selectedServer: Server;
      switch (rule.routeType) {
        case 'ROUND_ROBIN':
          selectedServer = this.roundRobin(servers, `rule_${rule.id}`);
          break;
        case 'LEAST_CONNECTIONS':
          selectedServer = this.leastConnections(servers);
          break;
        case 'LEAST_BANDWIDTH':
          selectedServer = this.leastBandwidth(servers);
          break;
        default:
          selectedServer = servers[0];
      }

      return {
        serverId: selectedServer.id,
        serverUrl: this.buildServerUrl(selectedServer),
        reason: `Matched rule: ${rule.name}`,
      };
    }

    return null;
  }

  /**
   * Get servers that can handle this stream
   * Checks both ServerStream (legacy) and StreamServerDistribution (new cascade architecture)
   * 
   * @param streamId - The stream ID to get servers for
   * @param preferredOutput - Output format preference (m3u8, ts)
   * @param originOnly - If true, only return ORIGIN servers (tier 0) that can start the stream
   *                     When stream is not running, only ORIGIN servers can start it from source
   */
  private async getAvailableServers(
    streamId: number,
    preferredOutput: string,
    originOnly: boolean = false
  ): Promise<ServerWithAssignments[]> {
    const cacheKey = originOnly 
      ? `${cache.KEYS.AVAILABLE_SERVERS(streamId)}:origin` 
      : cache.KEYS.AVAILABLE_SERVERS(streamId);
    const cached = await cache.get<ServerWithAssignments[]>(cacheKey);

    if (cached) {
      return cached;
    }

    // First check StreamServerDistribution (new cascade architecture)
    // When originOnly is true, filter to only ORIGIN role (tier 0) servers
    const distributedServers = await prisma.streamServerDistribution.findMany({
      where: {
        streamId,
        isActive: true,
        ...(originOnly && { role: 'ORIGIN' }), // Only ORIGIN servers can start streams from source
        server: {
          status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
        },
      },
      include: {
        server: true,
      },
    });

    if (distributedServers.length > 0) {
      // Convert to ServerWithAssignments format for compatibility
      const servers: ServerWithAssignments[] = distributedServers.map(d => ({
        ...d.server,
        streamAssignments: [{ streamId, isActive: true }],
      }));

      // Filter by output format support
      const filteredServers = servers.filter((s) => {
        if (preferredOutput === 'm3u8' && !s.supportsHls) return false;
        if (preferredOutput === 'ts' && !s.supportsMpegts) return false;
        return true;
      });

      // Cache for 30 seconds
      await cache.set(cacheKey, filteredServers, 30);

      logger.debug({
        streamId,
        serverCount: filteredServers.length,
        originOnly,
        servers: filteredServers.map(s => ({ id: s.id, name: s.name, status: s.status })),
      }, 'Found available servers via StreamServerDistribution');

      return filteredServers;
    }

    // Fallback to ServerStream (legacy assignment table)
    const servers = await prisma.server.findMany({
      where: {
        status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
        type: { in: ['EDGE_STREAMER', 'TRANSCODER'] },
        streamAssignments: {
          some: {
            streamId,
            isActive: true,
          },
        },
      },
      include: {
        streamAssignments: {
          where: { streamId },
          select: { streamId: true, isActive: true },
        },
      },
    });

    // Filter by output format support
    const filteredServers = servers.filter((s) => {
      if (preferredOutput === 'm3u8' && !s.supportsHls) return false;
      if (preferredOutput === 'ts' && !s.supportsMpegts) return false;
      return true;
    });

    // Cache for 30 seconds
    await cache.set(cacheKey, filteredServers, 30);

    return filteredServers;
  }

  /**
   * Select the best server using multiple criteria
   */
  private async selectBestServer(
    servers: ServerWithAssignments[],
    userRegion: string | null,
    userCountry: string | null,
    userCoords: [number, number] | undefined
  ): Promise<Server & { routeReason: string }> {
    // Score each server
    const scored = servers.map((server) => {
      let score = server.healthScore;
      let reason = 'health_score';

      // Boost for same region
      if (userRegion && server.region === userRegion) {
        score += 20;
        reason = 'same_region';
      }

      // Boost for same country
      if (userCountry && server.country === userCountry) {
        score += 15;
        reason = 'same_country';
      }

      // Penalize high load
      const loadPenalty =
        (server.currentConnections / server.maxConnections) * 30;
      score -= loadPenalty;

      // Penalize high bandwidth usage
      const bwPenalty =
        (server.currentBandwidth / server.maxBandwidthMbps) * 20;
      score -= bwPenalty;

      // Geographic distance bonus (if coords available)
      if (userCoords && server.latitude && server.longitude) {
        const distance = this.haversineDistance(userCoords, [
          server.latitude,
          server.longitude,
        ]);
        // Closer servers get bonus (max 10 points for <100km)
        const distanceBonus = Math.max(0, 10 - distance / 100);
        score += distanceBonus;
        if (distanceBonus > 5) reason = 'geographic_proximity';
      }

      return { server, score, reason };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return { ...best.server, routeReason: best.reason };
  }

  /**
   * Round-robin selection
   */
  private roundRobin(servers: Server[], key: string): Server {
    const currentIndex = this.roundRobinIndex.get(key) || 0;
    const server = servers[currentIndex % servers.length];
    this.roundRobinIndex.set(key, currentIndex + 1);
    return server;
  }

  /**
   * Select server with least connections
   */
  private leastConnections(servers: Server[]): Server {
    return servers.reduce((min, s) =>
      s.currentConnections < min.currentConnections ? s : min
    );
  }

  /**
   * Select server with most available bandwidth
   */
  private leastBandwidth(servers: Server[]): Server {
    return servers.reduce((best, s) => {
      const available = s.maxBandwidthMbps - s.currentBandwidth;
      const bestAvailable = best.maxBandwidthMbps - best.currentBandwidth;
      return available > bestAvailable ? s : best;
    });
  }

  /**
   * Calculate distance between two coordinates
   */
  private haversineDistance(
    coord1: [number, number],
    coord2: [number, number]
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(coord2[0] - coord1[0]);
    const dLon = this.toRad(coord2[1] - coord1[1]);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(coord1[0])) *
        Math.cos(this.toRad(coord2[0])) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private buildServerUrl(server: Server): string {
    const protocol = server.httpsPort ? 'https' : 'http';
    const port = server.httpsPort || server.httpPort;
    return `${protocol}://${server.externalIp}:${port}`;
  }

  /**
   * Update server metrics from heartbeat
   */
  async updateServerMetrics(
    serverId: number,
    metrics: {
      cpuUsage: number;
      memoryUsage: number;
      currentBandwidth: number;
      currentConnections: number;
    }
  ): Promise<void> {
    await prisma.server.update({
      where: { id: serverId },
      data: {
        cpuUsage: metrics.cpuUsage,
        memoryUsage: metrics.memoryUsage,
        currentBandwidth: metrics.currentBandwidth,
        currentConnections: metrics.currentConnections,
        lastHeartbeat: new Date(),
        failedChecks: 0,
      },
    });

    // Store historical metrics in Redis
    const metricsKey = `server_metrics:${serverId}`;
    await redis.lpush(
      metricsKey,
      JSON.stringify({
        ...metrics,
        timestamp: new Date().toISOString(),
      })
    );
    await redis.ltrim(metricsKey, 0, 60); // Keep last 60 entries
  }

  /**
   * Mark server as offline after failed health checks
   */
  async markServerOffline(serverId: number): Promise<void> {
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.OFFLINE,
        healthScore: 0,
      },
    });

    // Publish state change for real-time cache invalidation across all instances
    await this.publishServerStateChange(serverId, 'offline');

    // Also invalidate locally (for single-instance setups)
    const assignments = await prisma.serverStream.findMany({
      where: { serverId },
      select: { streamId: true },
    });

    for (const assignment of assignments) {
      await cache.del(cache.KEYS.AVAILABLE_SERVERS(assignment.streamId));
    }

    logger.warn({ serverId }, 'Server marked offline');
  }

  /**
   * Mark server as online
   */
  async markServerOnline(serverId: number): Promise<void> {
    await prisma.server.update({
      where: { id: serverId },
      data: {
        status: ServerStatus.ONLINE,
        failedChecks: 0,
      },
    });

    // Publish state change for real-time cache invalidation
    await this.publishServerStateChange(serverId, 'online');

    logger.info({ serverId }, 'Server marked online');
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      await this.subscriber.quit();
      this.subscriber = null;
      this.isSubscribed = false;
    }
    logger.info('LoadBalancer cleaned up');
  }
}

// Export singleton
export const loadBalancer = new LoadBalancer();
