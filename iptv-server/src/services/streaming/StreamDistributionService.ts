import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import { DistributionRole, ServerStatus } from '@prisma/client';

export interface StreamDistributionConfig {
  streamId: number;
  originServerId: number;
  childServerIds: number[];
}

/**
 * Cascade/Escalier configuration
 * Each server has a parent it pulls from (except origin which pulls from source)
 */
export interface CascadeServerConfig {
  serverId: number;
  pullFromServerId: number | null; // null = pulls from source (origin)
}

export interface StreamCascadeConfig {
  streamId: number;
  originServerId: number;
  cascade: CascadeServerConfig[]; // Servers in cascade order
}

export interface ServerPullUrl {
  serverId: number;
  serverName: string;
  pullUrl: string;
  role: DistributionRole;
  tier: number;
  pullFromServerId?: number;
}

export interface DistributionInfo {
  streamId: number;
  streamName: string;
  originServer: { id: number; name: string; status: string } | null;
  servers: Array<{
    serverId: number;
    serverName: string;
    serverStatus: string;
    serverType: string;
    role: DistributionRole;
    tier: number;
    pullFromServerId: number | null;
    pullFromServerName?: string;
    isActive: boolean;
    priority: number;
  }>;
}

/**
 * StreamDistributionService - Manages the origin/child server architecture
 * 
 * Supports multi-tier cascade (escalier):
 * Source URL -> Origin (tier 0) -> LB1 (tier 1) -> LB2 (tier 2) -> LB3 (tier 3)...
 */
export class StreamDistributionService {
  
  /**
   * Configure stream distribution with origin and flat child servers
   * All children pull from origin (simple mode)
   */
  async configureDistribution(config: StreamDistributionConfig): Promise<void> {
    const { streamId, originServerId, childServerIds } = config;

    // Convert to cascade config where all children pull from origin
    const cascade: CascadeServerConfig[] = childServerIds.map(serverId => ({
      serverId,
      pullFromServerId: originServerId,
    }));

    await this.configureCascade({
      streamId,
      originServerId,
      cascade,
    });
  }

  /**
   * Configure stream distribution with cascade hierarchy
   * Each server can have its own parent (escalier mode)
   */
  async configureCascade(config: StreamCascadeConfig): Promise<void> {
    const { streamId, originServerId, cascade } = config;

    if (!originServerId) {
      throw new Error('Origin server ID is required');
    }

    const cascadeServerIds = cascade.map(c => c.serverId);
    if (cascadeServerIds.includes(originServerId)) {
      throw new Error('Origin server cannot be in the cascade list');
    }

    this.validateNoCycles(originServerId, cascade);

    const allServerIds = [originServerId, ...cascadeServerIds];
    const servers = await prisma.server.findMany({
      where: { id: { in: allServerIds } },
      select: { id: true, name: true, status: true },
    });

    if (servers.length !== allServerIds.length) {
      const foundIds = servers.map(s => s.id);
      const missingIds = allServerIds.filter(id => !foundIds.includes(id));
      throw new Error(`Servers not found: ${missingIds.join(', ')}`);
    }

    const tierMap = this.calculateTiers(originServerId, cascade);

    await prisma.$transaction(async (tx) => {
      // 1. Clear existing distribution configuration
      await tx.streamServerDistribution.deleteMany({ where: { streamId } });

      // 2. Update Stream origin
      await tx.stream.update({
        where: { id: streamId },
        data: { originServerId },
      });

      // 3. Sync ServerStream assignments (for UI visibility)
      // First remove old assignments
      await tx.serverStream.deleteMany({ where: { streamId } });
      
      // Add new assignments for all servers in cascade
      const assignments = allServerIds.map(serverId => ({
        streamId,
        serverId,
        isActive: true,
        // priority: serverId === originServerId ? 1 : 100 // Optional priority
      }));
      
      await tx.serverStream.createMany({
        data: assignments,
      });

      // 4. Create new distribution configuration
      await tx.streamServerDistribution.create({
        data: {
          streamId,
          serverId: originServerId,
          role: DistributionRole.ORIGIN,
          tier: 0,
          pullFromServerId: null,
          isActive: true,
          priority: 1,
        },
      });

      for (const serverConfig of cascade) {
        const tier = tierMap.get(serverConfig.serverId) || 1;
        await tx.streamServerDistribution.create({
          data: {
            streamId,
            serverId: serverConfig.serverId,
            role: DistributionRole.CHILD,
            tier,
            pullFromServerId: serverConfig.pullFromServerId,
            isActive: true,
            priority: 10 + tier * 10,
          },
        });
      }
    });

    await this.invalidateCache(streamId);

    logger.info({
      streamId,
      originServerId,
      cascadeLength: cascade.length,
      maxTier: Math.max(...Array.from(tierMap.values()), 0),
    }, 'Stream cascade distribution configured');
  }

  /**
   * Add a server to the cascade at a specific position
   */
  async addServerToCascade(
    streamId: number,
    serverId: number,
    pullFromServerId: number
  ): Promise<void> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: { serverDistribution: true },
    });

    if (!stream) throw new Error('Stream not found');
    if (!stream.originServerId) throw new Error('Stream has no origin server');

    const pullFromExists = stream.serverDistribution.some(d => d.serverId === pullFromServerId);
    if (!pullFromExists) {
      throw new Error(`Server ${pullFromServerId} is not in the stream distribution`);
    }

    const parentDist = stream.serverDistribution.find(d => d.serverId === pullFromServerId);
    const newTier = (parentDist?.tier || 0) + 1;

    if (await this.wouldCreateCycle(streamId, serverId, pullFromServerId)) {
      throw new Error('This configuration would create a circular reference');
    }

    await prisma.streamServerDistribution.upsert({
      where: { streamId_serverId: { streamId, serverId } },
      update: { pullFromServerId, tier: newTier, role: DistributionRole.CHILD },
      create: {
        streamId,
        serverId,
        pullFromServerId,
        tier: newTier,
        role: DistributionRole.CHILD,
        isActive: true,
        priority: 10 + newTier * 10,
      },
    });

    await this.invalidateCache(streamId);
  }

  /**
   * Change the parent of a server in the cascade
   */
  async changeServerParent(
    streamId: number,
    serverId: number,
    newPullFromServerId: number
  ): Promise<void> {
    const distribution = await prisma.streamServerDistribution.findUnique({
      where: { streamId_serverId: { streamId, serverId } },
    });

    if (!distribution) throw new Error(`Server ${serverId} not in distribution`);
    if (distribution.role === DistributionRole.ORIGIN) {
      throw new Error('Cannot change parent of origin. Use changeOriginServer.');
    }

    if (await this.wouldCreateCycle(streamId, serverId, newPullFromServerId)) {
      throw new Error('This would create a circular reference');
    }

    const parentDist = await prisma.streamServerDistribution.findUnique({
      where: { streamId_serverId: { streamId, serverId: newPullFromServerId } },
    });

    const newTier = (parentDist?.tier || 0) + 1;

    await prisma.streamServerDistribution.update({
      where: { id: distribution.id },
      data: { pullFromServerId: newPullFromServerId, tier: newTier, priority: 10 + newTier * 10 },
    });

    await this.recalculateDescendantTiers(streamId, serverId, newTier);
    await this.invalidateCache(streamId);
  }

  /**
   * Get the pull URL for a specific server
   */
  async getPullUrl(streamId: number, serverId: number): Promise<string> {
    const cacheKey = `stream:${streamId}:pullUrl:${serverId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return cached;

    const distribution = await prisma.streamServerDistribution.findUnique({
      where: { streamId_serverId: { streamId, serverId } },
      include: { stream: { select: { sourceUrl: true } } },
    });

    if (!distribution) {
      throw new Error(`Server ${serverId} is not configured for stream ${streamId}`);
    }

    let pullUrl: string;

    if (distribution.role === DistributionRole.ORIGIN) {
      pullUrl = distribution.stream.sourceUrl;
    } else {
      const pullFromServerId = distribution.pullFromServerId;
      if (!pullFromServerId) {
        throw new Error(`Child server ${serverId} has no pullFromServerId`);
      }

      const pullFromServer = await prisma.server.findUnique({
        where: { id: pullFromServerId },
        select: { internalIp: true, externalIp: true, httpPort: true, httpsPort: true },
      });

      if (!pullFromServer) throw new Error(`Pull source server ${pullFromServerId} not found`);

      const host = pullFromServer.internalIp || pullFromServer.externalIp;
      const port = pullFromServer.httpsPort || pullFromServer.httpPort;
      pullUrl = `http://${host}:${port}/api/internal/stream/${streamId}`;
    }

    await redis.setex(cacheKey, 300, pullUrl);
    return pullUrl;
  }

  /**
   * Get all pull URLs for a stream
   */
  async getAllPullUrls(streamId: number): Promise<ServerPullUrl[]> {
    const distributions = await prisma.streamServerDistribution.findMany({
      where: { streamId, isActive: true },
      include: { server: { select: { id: true, name: true } } },
      orderBy: { tier: 'asc' },
    });

    const results: ServerPullUrl[] = [];
    for (const dist of distributions) {
      const pullUrl = await this.getPullUrl(streamId, dist.serverId);
      results.push({
        serverId: dist.serverId,
        serverName: dist.server.name,
        pullUrl,
        role: dist.role,
        tier: dist.tier,
        pullFromServerId: dist.pullFromServerId || undefined,
      });
    }
    return results;
  }

  /**
   * Get distribution config for a stream
   */
  async getDistribution(streamId: number): Promise<DistributionInfo | null> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: {
        originServer: { select: { id: true, name: true, status: true } },
        serverDistribution: {
          include: {
            server: { select: { id: true, name: true, status: true, type: true } },
          },
          orderBy: { tier: 'asc' },
        },
      },
    });

    if (!stream) return null;

    // Build lookup for server names
    const serverMap = new Map<number, string>();
    for (const d of stream.serverDistribution) {
      serverMap.set(d.serverId, d.server.name);
    }

    return {
      streamId: stream.id,
      streamName: stream.name,
      originServer: stream.originServer,
      servers: stream.serverDistribution.map(d => ({
        serverId: d.server.id,
        serverName: d.server.name,
        serverStatus: d.server.status,
        serverType: d.server.type,
        role: d.role,
        tier: d.tier,
        pullFromServerId: d.pullFromServerId,
        pullFromServerName: d.pullFromServerId ? serverMap.get(d.pullFromServerId) : undefined,
        isActive: d.isActive,
        priority: d.priority,
      })),
    };
  }

  /**
   * Remove a server from stream distribution
   */
  async removeServerFromDistribution(streamId: number, serverId: number): Promise<void> {
    const distribution = await prisma.streamServerDistribution.findUnique({
      where: { streamId_serverId: { streamId, serverId } },
    });

    if (!distribution) return;
    if (distribution.role === DistributionRole.ORIGIN) {
      throw new Error('Cannot remove origin server. Assign a new origin first.');
    }

    // Check if any servers depend on this one
    const dependents = await prisma.streamServerDistribution.findMany({
      where: { streamId, pullFromServerId: serverId },
    });

    if (dependents.length > 0) {
      throw new Error(`Cannot remove server: ${dependents.length} other servers pull from it`);
    }

    await prisma.streamServerDistribution.delete({ where: { id: distribution.id } });
    await this.invalidateCache(streamId);
  }

  /**
   * Change the origin server for a stream
   */
  async changeOriginServer(streamId: number, newOriginServerId: number): Promise<void> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      include: { serverDistribution: true },
    });

    if (!stream) throw new Error('Stream not found');

    await prisma.$transaction(async (tx) => {
      // Set old origin to CHILD pulling from new origin
      if (stream.originServerId && stream.originServerId !== newOriginServerId) {
        await tx.streamServerDistribution.updateMany({
          where: { streamId, serverId: stream.originServerId },
          data: { role: DistributionRole.CHILD, tier: 1, pullFromServerId: newOriginServerId },
        });
      }

      // Set new origin
      const existsInDist = stream.serverDistribution.some(d => d.serverId === newOriginServerId);
      if (existsInDist) {
        await tx.streamServerDistribution.update({
          where: { streamId_serverId: { streamId, serverId: newOriginServerId } },
          data: { role: DistributionRole.ORIGIN, tier: 0, pullFromServerId: null, priority: 1 },
        });
      } else {
        await tx.streamServerDistribution.create({
          data: {
            streamId,
            serverId: newOriginServerId,
            role: DistributionRole.ORIGIN,
            tier: 0,
            pullFromServerId: null,
            priority: 1,
            isActive: true,
          },
        });
      }

      // Update children that pulled from old origin to pull from new origin
      if (stream.originServerId) {
        await tx.streamServerDistribution.updateMany({
          where: { streamId, pullFromServerId: stream.originServerId, serverId: { not: newOriginServerId } },
          data: { pullFromServerId: newOriginServerId },
        });
      }

      await tx.stream.update({
        where: { id: streamId },
        data: { originServerId: newOriginServerId },
      });
    });

    await this.invalidateCache(streamId);
    logger.info({ streamId, newOriginServerId }, 'Origin server changed');
  }

  /**
   * Get available servers for distribution
   */
  async getAvailableServers(excludeServerIds: number[] = []) {
    return prisma.server.findMany({
      where: {
        id: { notIn: excludeServerIds },
        status: { in: [ServerStatus.ONLINE, ServerStatus.DEGRADED] },
      },
      select: {
        id: true, name: true, type: true, status: true,
        region: true, country: true, healthScore: true,
        currentConnections: true, maxConnections: true,
        currentBandwidth: true, maxBandwidthMbps: true,
      },
      orderBy: [{ type: 'asc' }, { healthScore: 'desc' }],
    });
  }

  // ==================== PRIVATE METHODS ====================

  private validateNoCycles(originServerId: number, cascade: CascadeServerConfig[]): void {
    const graph = new Map<number, number | null>();
    graph.set(originServerId, null);
    
    for (const c of cascade) {
      graph.set(c.serverId, c.pullFromServerId);
    }

    for (const c of cascade) {
      const visited = new Set<number>();
      let current: number | null = c.serverId;
      
      while (current !== null) {
        if (visited.has(current)) {
          throw new Error(`Circular reference detected involving server ${current}`);
        }
        visited.add(current);
        current = graph.get(current) ?? null;
      }
    }
  }

  private calculateTiers(originServerId: number, cascade: CascadeServerConfig[]): Map<number, number> {
    const tierMap = new Map<number, number>();
    tierMap.set(originServerId, 0);

    let changed = true;
    let iterations = 0;
    const maxIterations = cascade.length + 1;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      for (const c of cascade) {
        if (tierMap.has(c.serverId)) continue;

        const parentId = c.pullFromServerId;
        if (parentId !== null && tierMap.has(parentId)) {
          tierMap.set(c.serverId, tierMap.get(parentId)! + 1);
          changed = true;
        }
      }
    }

    // Assign remaining servers (shouldn't happen if config is valid)
    for (const c of cascade) {
      if (!tierMap.has(c.serverId)) {
        tierMap.set(c.serverId, 1);
      }
    }

    return tierMap;
  }

  private async wouldCreateCycle(
    streamId: number,
    serverId: number,
    newPullFromServerId: number
  ): Promise<boolean> {
    if (serverId === newPullFromServerId) return true;

    const distributions = await prisma.streamServerDistribution.findMany({
      where: { streamId },
    });

    const graph = new Map<number, number | null>();
    for (const d of distributions) {
      graph.set(d.serverId, d.pullFromServerId);
    }
    graph.set(serverId, newPullFromServerId);

    const visited = new Set<number>();
    let current: number | null = serverId;

    while (current !== null) {
      if (visited.has(current)) return true;
      visited.add(current);
      current = graph.get(current) ?? null;
    }

    return false;
  }

  private async recalculateDescendantTiers(
    streamId: number,
    parentServerId: number,
    parentTier: number
  ): Promise<void> {
    const children = await prisma.streamServerDistribution.findMany({
      where: { streamId, pullFromServerId: parentServerId },
    });

    for (const child of children) {
      const newTier = parentTier + 1;
      await prisma.streamServerDistribution.update({
        where: { id: child.id },
        data: { tier: newTier, priority: 10 + newTier * 10 },
      });
      await this.recalculateDescendantTiers(streamId, child.serverId, newTier);
    }
  }

  private async invalidateCache(streamId: number): Promise<void> {
    const keys = await redis.keys(`stream:${streamId}:pullUrl:*`);
    if (keys.length > 0) await redis.del(...keys);
    await redis.del(`stream:${streamId}:distribution`);
  }

  validateDistribution(config: StreamDistributionConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!config.originServerId) errors.push('Origin server is required');
    if (config.childServerIds.includes(config.originServerId)) {
      errors.push('Origin server cannot be in child servers list');
    }
    const unique = [...new Set(config.childServerIds)];
    if (unique.length !== config.childServerIds.length) {
      errors.push('Duplicate child servers detected');
    }
    return { valid: errors.length === 0, errors };
  }
}

export const streamDistributionService = new StreamDistributionService();
