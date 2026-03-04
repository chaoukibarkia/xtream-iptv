import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { ServerStatus, Stream } from '@prisma/client';
import axios from 'axios';

interface DistributionConfig {
  minServersPerStream: number;
  maxServersPerStream: number;
  replicationFactor: number;
  balanceThreshold: number;
}

export class StreamDistributor {
  private config: DistributionConfig = {
    minServersPerStream: 2,
    maxServersPerStream: 10,
    replicationFactor: 3,
    balanceThreshold: 20,
  };

  constructor(config?: Partial<DistributionConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * Distribute a new stream across available servers
   */
  async distributeStream(streamId: number): Promise<void> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      throw new Error('Stream not found');
    }

    // Get eligible servers
    const servers = await this.getEligibleServers(stream);

    if (servers.length === 0) {
      logger.warn({ streamId }, 'No eligible servers for stream distribution');
      return;
    }

    // Calculate how many servers to assign
    const targetCount = Math.min(
      this.config.replicationFactor,
      servers.length,
      this.config.maxServersPerStream
    );

    // Select servers with best capacity/distribution
    const selectedServers = this.selectServersForStream(servers, targetCount);

    // Create assignments
    await prisma.serverStream.createMany({
      data: selectedServers.map((server, index) => ({
        serverId: server.id,
        streamId,
        priority: index + 1,
        isActive: index === 0, // Only first server is initially active
      })),
      skipDuplicates: true,
    });

    // Notify servers to prepare stream
    await this.notifyServers(selectedServers, streamId, stream.sourceUrl);

    logger.info(
      { streamId, servers: selectedServers.map((s) => s.id) },
      'Stream distributed'
    );
  }

  /**
   * Remove stream from all servers
   */
  async removeStream(streamId: number): Promise<void> {
    const assignments = await prisma.serverStream.findMany({
      where: { streamId },
      include: { server: true },
    });

    // Notify servers to stop stream
    await Promise.all(
      assignments.map((a) =>
        this.notifyServerStopStream(a.server, streamId).catch((err) =>
          logger.error({ err, serverId: a.serverId }, 'Failed to notify server')
        )
      )
    );

    // Delete assignments
    await prisma.serverStream.deleteMany({
      where: { streamId },
    });

    // Clear cache
    await cache.del(cache.KEYS.AVAILABLE_SERVERS(streamId));
  }

  /**
   * Migrate stream from one server to another
   */
  async migrateStream(
    streamId: number,
    fromServerId: number,
    toServerId: number
  ): Promise<void> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      throw new Error('Stream not found');
    }

    const toServer = await prisma.server.findUnique({
      where: { id: toServerId },
    });

    if (!toServer) {
      throw new Error('Target server not found');
    }

    // Start stream on new server first
    await prisma.serverStream.upsert({
      where: {
        serverId_streamId: {
          serverId: toServerId,
          streamId,
        },
      },
      update: { isActive: true },
      create: {
        serverId: toServerId,
        streamId,
        isActive: true,
        priority: 1,
      },
    });

    // Notify new server to prepare stream
    await this.notifyServerPrepareStream(toServer, streamId, stream.sourceUrl);

    // Wait for stream to be ready
    await this.waitForStreamReady(toServerId, streamId);

    // Deactivate on old server
    await prisma.serverStream.update({
      where: {
        serverId_streamId: {
          serverId: fromServerId,
          streamId,
        },
      },
      data: { isActive: false },
    });

    // Invalidate routing cache
    await cache.del(cache.KEYS.AVAILABLE_SERVERS(streamId));

    logger.info(
      { streamId, fromServerId, toServerId },
      'Stream migrated'
    );
  }

  /**
   * Rebalance streams across all servers
   */
  async rebalanceAll(): Promise<void> {
    const servers = await prisma.server.findMany({
      where: { status: ServerStatus.ONLINE, type: 'EDGE_STREAMER' },
      include: {
        streamAssignments: true,
      },
    });

    if (servers.length < 2) {
      logger.info('Not enough servers for rebalancing');
      return;
    }

    // Calculate load for each server
    const serverLoads = servers.map((s) => ({
      server: s,
      load: this.calculateServerLoad(s),
      streamCount: s.streamAssignments.length,
    }));

    // Find overloaded and underloaded servers
    const avgLoad =
      serverLoads.reduce((sum, s) => sum + s.load, 0) / serverLoads.length;

    const overloaded = serverLoads.filter(
      (s) => s.load > avgLoad + this.config.balanceThreshold
    );
    const underloaded = serverLoads.filter(
      (s) => s.load < avgLoad - this.config.balanceThreshold
    );

    logger.info(
      {
        avgLoad,
        overloaded: overloaded.length,
        underloaded: underloaded.length,
      },
      'Starting rebalance'
    );

    // Move streams from overloaded to underloaded
    for (const over of overloaded) {
      const streamsToMove = Math.ceil((over.load - avgLoad) / 10);

      // Get streams that can be moved
      const movableStreams = await prisma.serverStream.findMany({
        where: {
          serverId: over.server.id,
          isActive: true,
        },
        take: streamsToMove,
      });

      for (const assignment of movableStreams) {
        // Find best underloaded server
        const target = underloaded.find(
          (u) =>
            !u.server.streamAssignments.some(
              (sa) => sa.streamId === assignment.streamId
            )
        );

        if (target) {
          await this.migrateStream(
            assignment.streamId,
            over.server.id,
            target.server.id
          ).catch((err) =>
            logger.error(
              { err, streamId: assignment.streamId },
              'Migration failed'
            )
          );
        }
      }
    }

    logger.info('Rebalance completed');
  }

  private async getEligibleServers(stream: Stream) {
    return prisma.server.findMany({
      where: {
        status: ServerStatus.ONLINE,
        type: { in: ['EDGE_STREAMER', 'TRANSCODER'] },
        // Check transcoding capability if needed
        ...(stream.transcodeProfile && stream.transcodeProfile !== 'passthrough'
          ? { canTranscode: true }
          : {}),
      },
      orderBy: [{ currentConnections: 'asc' }, { healthScore: 'desc' }],
    });
  }

  private selectServersForStream<T extends { id: number; region: string | null }>(
    servers: T[],
    count: number
  ): T[] {
    // Prefer geographic distribution
    const regions = new Set<string>();
    const selected: T[] = [];

    // First pass: one server per region
    for (const server of servers) {
      if (selected.length >= count) break;
      if (server.region && !regions.has(server.region)) {
        selected.push(server);
        regions.add(server.region);
      }
    }

    // Second pass: fill remaining slots
    for (const server of servers) {
      if (selected.length >= count) break;
      if (!selected.includes(server)) {
        selected.push(server);
      }
    }

    return selected;
  }

  private calculateServerLoad(server: {
    currentConnections: number;
    maxConnections: number;
    currentBandwidth: number;
    maxBandwidthMbps: number;
    cpuUsage: number;
  }): number {
    const connLoad = (server.currentConnections / server.maxConnections) * 40;
    const bwLoad = (server.currentBandwidth / server.maxBandwidthMbps) * 40;
    const cpuLoad = server.cpuUsage * 0.2;
    return connLoad + bwLoad + cpuLoad;
  }

  private async notifyServers(
    servers: { id: number; internalIp: string; apiPort: number; apiKey: string }[],
    streamId: number,
    sourceUrl: string
  ): Promise<void> {
    await Promise.all(
      servers.map((server) =>
        this.notifyServerPrepareStream(server, streamId, sourceUrl).catch(
          (err) =>
            logger.error(
              { err, serverId: server.id },
              'Failed to notify server'
            )
        )
      )
    );
  }

  private async notifyServerPrepareStream(
    server: { internalIp: string; apiPort: number; apiKey: string },
    streamId: number,
    sourceUrl: string
  ): Promise<void> {
    await axios.post(
      `http://${server.internalIp}:${server.apiPort}/api/streams/prepare`,
      { streamId, sourceUrl },
      {
        headers: { 'X-Server-Key': server.apiKey },
        timeout: 5000,
      }
    );
  }

  private async notifyServerStopStream(
    server: { internalIp: string; apiPort: number; apiKey: string },
    streamId: number
  ): Promise<void> {
    await axios.post(
      `http://${server.internalIp}:${server.apiPort}/api/streams/stop`,
      { streamId },
      {
        headers: { 'X-Server-Key': server.apiKey },
        timeout: 5000,
      }
    );
  }

  private async waitForStreamReady(
    serverId: number,
    streamId: number,
    timeout: number = 30000
  ): Promise<void> {
    const start = Date.now();
    const key = `stream_ready:${serverId}:${streamId}`;

    while (Date.now() - start < timeout) {
      const ready = await cache.get<string>(key);
      if (ready === '1') return;
      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(
      `Stream ${streamId} not ready on server ${serverId} within timeout`
    );
  }
}

// Export singleton
export const streamDistributor = new StreamDistributor();
