import { EventEmitter } from 'events';
import axios from 'axios';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { ServerStatus, DistributionRole } from '@prisma/client';
import { streamDistributionService } from './StreamDistributionService.js';
import { loadBalancer } from '../loadbalancer/LoadBalancer.js';

// Redis pub/sub channel for cascade events
const CHANNEL_CASCADE_FAILOVER = 'cascade:failover';

interface ParentHealthStatus {
  serverId: number;
  streamId: number;
  healthy: boolean;
  latency: number;
  lastCheck: Date;
  consecutiveFailures: number;
  error?: string;
}

interface FailoverEvent {
  streamId: number;
  childServerId: number;
  oldParentId: number;
  newParentId: number;
  reason: string;
  timestamp: Date;
}

interface CascadeFailoverConfig {
  healthCheckIntervalMs: number;
  healthCheckTimeoutMs: number;
  maxConsecutiveFailures: number;
  enabled: boolean;
}

const DEFAULT_CONFIG: CascadeFailoverConfig = {
  healthCheckIntervalMs: 5000, // Check every 5 seconds
  healthCheckTimeoutMs: 3000, // 3 second timeout
  maxConsecutiveFailures: 3, // Failover after 3 consecutive failures
  enabled: true,
};

/**
 * CascadeFailoverService - Monitors parent servers in cascade hierarchies
 * and automatically switches to alternate parents when failures are detected
 */
export class CascadeFailoverService extends EventEmitter {
  private config: CascadeFailoverConfig;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private parentHealth: Map<string, ParentHealthStatus> = new Map(); // key: `${streamId}:${childServerId}`
  private subscriber: typeof redis | null = null;

  constructor(config?: Partial<CascadeFailoverConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the failover service
   */
  async start(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Cascade failover service disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('Cascade failover service already running');
      return;
    }

    this.isRunning = true;

    // Initialize pub/sub for cross-instance coordination
    await this.initPubSub();

    // Run initial health check after 10 seconds
    setTimeout(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Initial cascade health check failed')
      );
    }, 10000);

    // Schedule periodic checks
    this.healthCheckTimer = setInterval(() => {
      this.runHealthChecks().catch((err) =>
        logger.error({ err }, 'Cascade health check failed')
      );
    }, this.config.healthCheckIntervalMs);

    logger.info(
      { intervalMs: this.config.healthCheckIntervalMs },
      'Cascade failover service started'
    );
  }

  /**
   * Stop the failover service
   */
  async stop(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.subscriber) {
      await this.subscriber.unsubscribe();
      await this.subscriber.quit();
      this.subscriber = null;
    }

    this.isRunning = false;
    this.parentHealth.clear();
    logger.info('Cascade failover service stopped');
  }

  /**
   * Initialize pub/sub for failover coordination
   */
  private async initPubSub(): Promise<void> {
    try {
      this.subscriber = redis.duplicate();
      await this.subscriber.subscribe(CHANNEL_CASCADE_FAILOVER);

      this.subscriber.on('message', async (channel: string, message: string) => {
        if (channel === CHANNEL_CASCADE_FAILOVER) {
          try {
            const event: FailoverEvent = JSON.parse(message);
            this.emit('failover', event);
            logger.info({ event }, 'Received cascade failover event');
          } catch (err) {
            logger.error({ message, err }, 'Error parsing failover event');
          }
        }
      });

      logger.debug('Cascade failover pub/sub initialized');
    } catch (err) {
      logger.error({ err }, 'Failed to initialize cascade failover pub/sub');
    }
  }

  /**
   * Publish failover event for cross-instance coordination
   */
  private async publishFailoverEvent(event: FailoverEvent): Promise<void> {
    await redis.publish(CHANNEL_CASCADE_FAILOVER, JSON.stringify(event));
  }

  /**
   * Run health checks for all child servers in active cascades
   */
  async runHealthChecks(): Promise<void> {
    // Get all active child distributions
    const childDistributions = await prisma.streamServerDistribution.findMany({
      where: {
        role: DistributionRole.CHILD,
        isActive: true,
        pullFromServerId: { not: null },
      },
      include: {
        stream: {
          select: {
            id: true,
            name: true,
            streamStatus: true,
          },
        },
        server: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });

    // Get parent server details for each distribution
    const parentServerIds = [...new Set(childDistributions.map(d => d.pullFromServerId).filter(Boolean))] as number[];
    const parentServers = await prisma.server.findMany({
      where: { id: { in: parentServerIds } },
      select: {
        id: true,
        name: true,
        status: true,
        internalIp: true,
        externalIp: true,
        httpPort: true,
        httpsPort: true,
      },
    });
    const parentServerMap = new Map(parentServers.map(s => [s.id, s]));

    // Filter to only running streams on online child servers
    const activeDistributions = childDistributions.filter(
      (d) =>
        d.stream.streamStatus === 'RUNNING' &&
        (d.server.status === ServerStatus.ONLINE || d.server.status === ServerStatus.DEGRADED) &&
        d.pullFromServerId &&
        parentServerMap.has(d.pullFromServerId)
    );

    if (activeDistributions.length === 0) {
      return;
    }

    // Check each parent health
    const results = await Promise.all(
      activeDistributions.map(async (dist) => {
        const key = `${dist.streamId}:${dist.serverId}`;
        const parentServer = parentServerMap.get(dist.pullFromServerId!)!;

        // Build parent health check URL
        const host = parentServer.internalIp || parentServer.externalIp;
        const port = parentServer.httpsPort || parentServer.httpPort;
        const healthUrl = `http://${host}:${port}/api/internal/stream/${dist.streamId}/health`;

        const health = await this.checkParentHealth(
          dist.streamId,
          dist.serverId,
          parentServer.id,
          healthUrl
        );

        // Update health tracking
        const existingHealth = this.parentHealth.get(key);
        const consecutiveFailures = health.healthy
          ? 0
          : (existingHealth?.consecutiveFailures || 0) + 1;

        const status: ParentHealthStatus = {
          serverId: parentServer.id,
          streamId: dist.streamId,
          healthy: health.healthy,
          latency: health.latency,
          lastCheck: new Date(),
          consecutiveFailures,
          error: health.error,
        };

        this.parentHealth.set(key, status);

        // Check if failover is needed
        if (consecutiveFailures >= this.config.maxConsecutiveFailures) {
          await this.handleParentFailure({
            streamId: dist.streamId,
            serverId: dist.serverId,
            pullFromServerId: dist.pullFromServerId,
            tier: dist.tier,
            stream: dist.stream,
            server: dist.server,
            pullFromServer: parentServer,
          }, status);
        }

        return { dist, status };
      })
    );

    // Emit check complete event
    const unhealthy = results.filter((r) => !r.status.healthy).length;
    if (unhealthy > 0) {
      logger.debug(
        { total: results.length, unhealthy },
        'Cascade health check completed'
      );
    }
  }

  /**
   * Check health of a parent server for a specific stream
   */
  private async checkParentHealth(
    streamId: number,
    childServerId: number,
    parentServerId: number,
    healthUrl: string
  ): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      const response = await axios.get(healthUrl, {
        timeout: this.config.healthCheckTimeoutMs,
        headers: {
          'X-Server-Key': process.env.SERVER_API_KEY || '',
        },
        validateStatus: () => true,
      });

      const latency = Date.now() - startTime;
      const healthy = response.status === 200;

      return { healthy, latency };
    } catch (error: any) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error.code || error.message,
      };
    }
  }

  /**
   * Handle parent server failure - find and switch to alternate parent
   */
  private async handleParentFailure(
    dist: {
      streamId: number;
      serverId: number;
      pullFromServerId: number | null;
      tier: number;
      stream: { id: number; name: string };
      server: { id: number; name: string };
      pullFromServer: { id: number; name: string } | null;
    },
    status: ParentHealthStatus
  ): Promise<void> {
    logger.warn(
      {
        streamId: dist.streamId,
        childServer: dist.server.name,
        failedParent: dist.pullFromServer?.name,
        consecutiveFailures: status.consecutiveFailures,
      },
      'Parent server failed, initiating failover'
    );

    // Find alternate parent
    const alternateParent = await this.findAlternateParent(
      dist.streamId,
      dist.serverId,
      dist.pullFromServerId!,
      dist.tier
    );

    if (!alternateParent) {
      logger.error(
        {
          streamId: dist.streamId,
          childServer: dist.server.name,
        },
        'No alternate parent found for failover'
      );
      this.emit('failover:failed', {
        streamId: dist.streamId,
        childServerId: dist.serverId,
        reason: 'no_alternate_parent',
      });
      return;
    }

    // Perform failover
    try {
      await this.performFailover(
        dist.streamId,
        dist.serverId,
        dist.pullFromServerId!,
        alternateParent.serverId
      );

      // Reset health tracking for this child
      const key = `${dist.streamId}:${dist.serverId}`;
      this.parentHealth.delete(key);

      // Publish failover event
      const event: FailoverEvent = {
        streamId: dist.streamId,
        childServerId: dist.serverId,
        oldParentId: dist.pullFromServerId!,
        newParentId: alternateParent.serverId,
        reason: `consecutive_failures:${status.consecutiveFailures}`,
        timestamp: new Date(),
      };

      await this.publishFailoverEvent(event);
      this.emit('failover:success', event);

      logger.info(
        {
          streamId: dist.streamId,
          childServer: dist.server.name,
          oldParent: dist.pullFromServer?.name,
          newParent: alternateParent.serverName,
        },
        'Cascade failover completed successfully'
      );
    } catch (error: any) {
      logger.error(
        {
          streamId: dist.streamId,
          error: error.message,
        },
        'Cascade failover failed'
      );
      this.emit('failover:error', {
        streamId: dist.streamId,
        childServerId: dist.serverId,
        error: error.message,
      });
    }
  }

  /**
   * Find an alternate parent server for failover
   */
  private async findAlternateParent(
    streamId: number,
    childServerId: number,
    failedParentId: number,
    childTier: number
  ): Promise<{ serverId: number; serverName: string } | null> {
    // Get all servers in this stream's distribution at lower tiers
    const candidates = await prisma.streamServerDistribution.findMany({
      where: {
        streamId,
        isActive: true,
        tier: { lt: childTier },
        serverId: { notIn: [childServerId, failedParentId] },
        server: {
          status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
        },
      },
      include: {
        server: {
          select: {
            id: true,
            name: true,
            status: true,
            healthScore: true,
            currentConnections: true,
            maxConnections: true,
          },
        },
      },
      orderBy: [
        { tier: 'asc' }, // Prefer servers at lower tiers (closer to origin)
      ],
    });

    if (candidates.length === 0) {
      // No alternate parents in distribution - try falling back to origin
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: {
          originServerId: true,
          originServer: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
      });

      if (
        stream?.originServerId &&
        stream.originServerId !== failedParentId &&
        stream.originServer &&
        (stream.originServer.status === ServerStatus.ONLINE ||
          stream.originServer.status === ServerStatus.DEGRADED)
      ) {
        return {
          serverId: stream.originServerId,
          serverName: stream.originServer.name,
        };
      }

      return null;
    }

    // Score candidates by health and capacity
    const scored = candidates.map((c) => {
      let score = c.server.healthScore;

      // Prefer lower tiers
      score += (childTier - c.tier) * 10;

      // Penalize high load
      const loadRatio = c.server.currentConnections / c.server.maxConnections;
      score -= loadRatio * 20;

      // Prefer ONLINE over DEGRADED
      if (c.server.status === ServerStatus.ONLINE) {
        score += 10;
      }

      return { candidate: c, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    return best
      ? { serverId: best.candidate.serverId, serverName: best.candidate.server.name }
      : null;
  }

  /**
   * Perform the actual failover - update distribution and restart relay
   */
  private async performFailover(
    streamId: number,
    childServerId: number,
    _oldParentId: number,
    newParentId: number
  ): Promise<void> {
    // Update distribution to new parent
    await streamDistributionService.changeServerParent(
      streamId,
      childServerId,
      newParentId
    );

    // Notify the child server to reconnect to new parent
    // This is done via Redis pub/sub - the child server's HLSRelayService
    // will pick up the change and reconnect
    await redis.publish(
      `cascade:reconnect:${childServerId}`,
      JSON.stringify({
        streamId,
        newParentId,
        action: 'reconnect',
      })
    );

    // Invalidate load balancer caches
    await loadBalancer.publishStreamStateChange(streamId, 'stopped');
    await loadBalancer.publishStreamStateChange(streamId, 'started');
  }

  /**
   * Manually trigger failover for a specific child server
   */
  async manualFailover(
    streamId: number,
    childServerId: number,
    newParentId: number
  ): Promise<void> {
    const dist = await prisma.streamServerDistribution.findUnique({
      where: { streamId_serverId: { streamId, serverId: childServerId } },
    });

    if (!dist) {
      throw new Error(`Child server ${childServerId} not in distribution for stream ${streamId}`);
    }

    if (dist.role !== DistributionRole.CHILD) {
      throw new Error('Can only failover child servers');
    }

    const oldParentId = dist.pullFromServerId;
    if (!oldParentId) {
      throw new Error('Child server has no current parent');
    }

    await this.performFailover(streamId, childServerId, oldParentId, newParentId);

    const event: FailoverEvent = {
      streamId,
      childServerId,
      oldParentId,
      newParentId,
      reason: 'manual',
      timestamp: new Date(),
    };

    await this.publishFailoverEvent(event);
    this.emit('failover:manual', event);

    logger.info({ streamId, childServerId, newParentId }, 'Manual failover completed');
  }

  /**
   * Get health status for all monitored parent connections
   */
  getHealthStatus(): ParentHealthStatus[] {
    return Array.from(this.parentHealth.values());
  }

  /**
   * Get service status
   */
  getStatus(): {
    running: boolean;
    config: CascadeFailoverConfig;
    monitoredConnections: number;
    unhealthyConnections: number;
  } {
    const statuses = Array.from(this.parentHealth.values());
    const unhealthy = statuses.filter((s) => !s.healthy).length;

    return {
      running: this.isRunning,
      config: this.config,
      monitoredConnections: statuses.length,
      unhealthyConnections: unhealthy,
    };
  }
}

// Export singleton instance
export const cascadeFailoverService = new CascadeFailoverService();
