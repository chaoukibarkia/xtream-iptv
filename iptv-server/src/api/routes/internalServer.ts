import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { streamProxy } from '../../services/streaming/StreamProxy.js';
import { streamMultiplexer } from '../../services/loadbalancer/StreamMultiplexer.js';
import { streamLifecycleManager } from '../../services/streaming/StreamLifecycleManager.js';
import { alwaysOnStreamManager } from '../../services/streaming/AlwaysOnStreamManager.js';
import { bandwidthRouter } from '../../services/loadbalancer/BandwidthAwareRouter.js';
import { ServerStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Internal API routes for server-to-server communication
 * 
 * These routes are used by Load Balancers to:
 * - Pull streams from parent servers (Main or other LBs)
 * - Register/deregister with the main server
 * - Report metrics and health status
 * - Receive stream control commands
 * 
 * All routes require X-Server-Key header for authentication
 */
export const internalServerRoutes: FastifyPluginAsync = async (fastify) => {
  // Middleware to verify server API key
  fastify.addHook('preHandler', async (request, reply) => {
    const serverKey = request.headers['x-server-key'] as string;
    
    if (!serverKey) {
      return reply.status(401).send({ error: 'Server key required' });
    }

    // Verify the key belongs to a registered server
    const server = await prisma.server.findFirst({
      where: { apiKey: serverKey },
    });

    if (!server) {
      return reply.status(401).send({ error: 'Invalid server key' });
    }

    // Attach server to request for use in handlers
    (request as any).callingServer = server;
  });

  // ==================== STREAM PULL ENDPOINTS ====================

  /**
   * Pull a stream from this server
   * GET /api/internal/stream/:streamId
   * 
   * This is the main endpoint that Load Balancers call to pull streams.
   * The stream is multiplexed so multiple LBs can pull the same stream
   * while only one connection is made to the original source.
   * 
   * Headers:
   * - X-Server-Key: Required for authentication
   * - X-Original-Source: Optional, the original stream source URL
   */
  fastify.get<{ Params: { streamId: string } }>(
    '/stream/:streamId',
    async (request, reply) => {
      const { streamId } = request.params;
      const callingServer = (request as any).callingServer;
      const originalSource = request.headers['x-original-source'] as string;

      try {
        // Get stream info
        const stream = await prisma.stream.findUnique({
          where: { id: parseInt(streamId) },
          select: {
            id: true,
            name: true,
            sourceUrl: true,
            transcodeProfile: true,
            isActive: true,
          },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'Stream not found' });
        }

        if (!stream.isActive) {
          return reply.status(403).send({ error: 'Stream is not active' });
        }

        const sourceUrl = originalSource || stream.sourceUrl;
        const clientId = `server_${callingServer.id}_${uuidv4().substring(0, 8)}`;

        logger.info({
          streamId: stream.id,
          callingServerId: callingServer.id,
          callingServerName: callingServer.name,
          clientId,
        }, 'Load Balancer pulling stream');

        // Reserve bandwidth for this pull connection
        const estimatedBitrate = 5; // Assume 5 Mbps average
        const canReserve = await bandwidthRouter.reserveBandwidth(
          callingServer.id,
          estimatedBitrate
        );

        if (!canReserve) {
          logger.warn({
            streamId: stream.id,
            callingServerId: callingServer.id,
          }, 'Bandwidth limit exceeded for server pull');
          return reply.status(503).send({ error: 'Server bandwidth limit exceeded' });
        }

        // Get client stream from multiplexer
        // This ensures we only have one connection to source, even if multiple LBs pull
        const clientStream = streamMultiplexer.getClientStream(
          stream.id,
          sourceUrl,
          clientId,
          callingServer.externalIp,
          `Server/${callingServer.name}`
        );

        // Handle cleanup when connection closes
        request.raw.on('close', () => {
          streamMultiplexer.disconnectClient(stream.id, clientId);
          bandwidthRouter.releaseBandwidth(callingServer.id, estimatedBitrate);
          
          logger.info({
            streamId: stream.id,
            callingServerId: callingServer.id,
            clientId,
          }, 'Load Balancer stream pull ended');
        });

        // Set appropriate headers
        reply.header('Content-Type', 'video/MP2T');
        reply.header('Cache-Control', 'no-cache, no-store');
        reply.header('Connection', 'keep-alive');
        reply.header('X-Stream-Id', stream.id.toString());
        reply.header('X-Stream-Name', stream.name);

        return reply.send(clientStream);
      } catch (error: any) {
        logger.error({ error, streamId }, 'Error serving stream to Load Balancer');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Get stream info without pulling
   * GET /api/internal/stream/:streamId/info
   */
  fastify.get<{ Params: { streamId: string } }>(
    '/stream/:streamId/info',
    async (request, reply) => {
      const { streamId } = request.params;

      const stream = await prisma.stream.findUnique({
        where: { id: parseInt(streamId) },
        select: {
          id: true,
          name: true,
          streamType: true,
          isActive: true,
          transcodeProfile: true,
          streamStatus: true,
          ffmpegPid: true,
          runningServerId: true,
          lastStartedAt: true,
        },
      });

      if (!stream) {
        return reply.status(404).send({ error: 'Stream not found' });
      }

      // Get multiplexer stats if stream is being multiplexed
      const multiplexInfo = streamMultiplexer.getStreamInfo(stream.id);

      return {
        stream,
        multiplexing: multiplexInfo ? {
          status: multiplexInfo.status,
          clientCount: multiplexInfo.clientCount,
          bytesReceived: multiplexInfo.bytesReceived,
          bytesDelivered: multiplexInfo.bytesDelivered,
          bitrateBps: multiplexInfo.bitrateBps,
          startedAt: multiplexInfo.startedAt,
        } : null,
      };
    }
  );

  // ==================== STREAM CONTROL ENDPOINTS ====================

  /**
   * Prepare stream on this server (called by Main to edge servers)
   * POST /api/internal/streams/prepare
   */
  fastify.post<{ Body: { streamId: number; sourceUrl: string } }>(
    '/streams/prepare',
    async (request, reply) => {
      const { streamId, sourceUrl } = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        callingServerId: callingServer.id,
      }, 'Received prepare stream command');

      try {
        // Start the stream if not already running
        // WAIT for stream to be ready (have segments) before responding
        // This ensures the cascade chain works properly - child servers need segments available
        if (!streamLifecycleManager.isStreamRunning(streamId)) {
          logger.info({ streamId }, 'Stream not running, starting it now');
          
          try {
            // Wait for the stream to fully start (including first segments)
            await streamLifecycleManager.startStream(streamId, {
              sourceUrl,
              enableFailover: true,
            });
            logger.info({ streamId }, 'Stream started successfully, ready for child servers');
          } catch (err: any) {
            logger.error({ err, streamId }, 'Stream start failed');
            return reply.status(503).send({ error: 'Stream failed to start', message: err.message });
          }
        } else {
          logger.info({ streamId }, 'Stream already running');
        }

        // Update stream assignment
        await prisma.serverStream.upsert({
          where: {
            serverId_streamId: {
              serverId: callingServer.id,
              streamId,
            },
          },
          update: { isActive: true },
          create: {
            serverId: callingServer.id,
            streamId,
            isActive: true,
            priority: 1,
          },
        });

        return { success: true, status: 'prepared' };
      } catch (error: any) {
        logger.error({ error, streamId }, 'Failed to prepare stream');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Stop stream on this server
   * POST /api/internal/streams/stop
   */
  fastify.post<{ Body: { streamId: number } }>(
    '/streams/stop',
    async (request, reply) => {
      const { streamId } = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        callingServerId: callingServer.id,
      }, 'Received stop stream command');

      try {
        // Stop the stream
        if (streamLifecycleManager.isStreamRunning(streamId)) {
          await streamLifecycleManager.stopStream(streamId, true);
        }

        // Also stop multiplexing if active
        streamMultiplexer.stopStream(streamId);

        // Update assignment
        await prisma.serverStream.updateMany({
          where: {
            streamId,
            serverId: callingServer.id,
          },
          data: { isActive: false },
        });

        return { success: true, status: 'stopped' };
      } catch (error: any) {
        logger.error({ error, streamId }, 'Failed to stop stream');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Start an always-on stream on this server (called by Main panel)
   * POST /api/internal/always-on/start
   */
  fastify.post<{ Body: { streamId: number; sourceUrl: string; backupUrls?: string[] } }>(
    '/always-on/start',
    async (request, reply) => {
      const { streamId, sourceUrl, backupUrls = [] } = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        callingServerId: callingServer?.id,
      }, 'Received always-on start command from main panel');

      try {
        // Get stream name from database
        const stream = await prisma.stream.findUnique({
          where: { id: streamId },
          select: { name: true },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'Stream not found' });
        }

        // Start the always-on stream via the manager
        const success = await alwaysOnStreamManager.startStream(
          streamId,
          stream.name,
          sourceUrl,
          backupUrls
        );

        if (!success) {
          return reply.status(503).send({ 
            error: 'Failed to start stream',
            message: 'Stream failed to start - check source URL and FFmpeg logs'
          });
        }

        return { success: true, status: 'started', streamId };
      } catch (error: any) {
        logger.error({ error, streamId }, 'Failed to start always-on stream');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Stop an always-on stream on this server (called by Main panel)
   * POST /api/internal/always-on/stop
   */
  fastify.post<{ Body: { streamId: number } }>(
    '/always-on/stop',
    async (request, reply) => {
      const { streamId } = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        callingServerId: callingServer?.id,
      }, 'Received always-on stop command from main panel');

      try {
        await alwaysOnStreamManager.stopStream(streamId);
        return { success: true, status: 'stopped', streamId };
      } catch (error: any) {
        logger.error({ error, streamId }, 'Failed to stop always-on stream');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Restart an always-on stream on this server (called by Main panel)
   * POST /api/internal/always-on/restart
   */
  fastify.post<{ Body: { streamId: number } }>(
    '/always-on/restart',
    async (request, reply) => {
      const { streamId } = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        callingServerId: callingServer?.id,
      }, 'Received always-on restart command from main panel');

      try {
        // Get stream info
        const stream = await prisma.stream.findUnique({
          where: { id: streamId },
          select: { name: true, sourceUrl: true, backupUrls: true },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'Stream not found' });
        }

        // Stop then start
        await alwaysOnStreamManager.stopStream(streamId);
        const success = await alwaysOnStreamManager.startStream(
          streamId,
          stream.name,
          stream.sourceUrl,
          stream.backupUrls
        );

        return { success, status: success ? 'restarted' : 'failed', streamId };
      } catch (error: any) {
        logger.error({ error, streamId }, 'Failed to restart always-on stream');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  // ==================== SERVER REGISTRATION ====================

  /**
   * Register this server with the main panel
   * POST /api/internal/servers/register
   * 
   * Called by edge servers on startup to announce themselves
   */
  fastify.post<{
    Body: {
      name: string;
      type: string;
      externalIp: string;
      internalIp?: string;
      httpPort: number;
      httpsPort?: number;
      maxBandwidthMbps: number;
      maxConnections: number;
      capabilities: {
        canTranscode: boolean;
        supportsHls: boolean;
        supportsMpegts: boolean;
        hasNvenc: boolean;
        hasQsv: boolean;
        hasVaapi: boolean;
      };
    };
  }>(
    '/servers/register',
    async (request, reply) => {
      const data = request.body;
      const callingServer = (request as any).callingServer;

      logger.info({
        serverName: data.name,
        existingServerId: callingServer.id,
      }, 'Server registration request');

      try {
        // Update server info
        const server = await prisma.server.update({
          where: { id: callingServer.id },
          data: {
            name: data.name,
            externalIp: data.externalIp,
            internalIp: data.internalIp,
            httpPort: data.httpPort,
            httpsPort: data.httpsPort ?? undefined,
            maxBandwidthMbps: data.maxBandwidthMbps,
            maxConnections: data.maxConnections,
            canTranscode: data.capabilities.canTranscode,
            supportsHls: data.capabilities.supportsHls,
            supportsMpegts: data.capabilities.supportsMpegts,
            hasNvenc: data.capabilities.hasNvenc,
            hasQsv: data.capabilities.hasQsv,
            hasVaapi: data.capabilities.hasVaapi,
            status: ServerStatus.ONLINE,
            lastHeartbeat: new Date(),
          },
        });

        return {
          success: true,
          serverId: server.id,
          status: server.status,
        };
      } catch (error: any) {
        logger.error({ error }, 'Server registration failed');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Deregister server (going offline)
   * POST /api/internal/servers/deregister
   */
  fastify.post('/servers/deregister', async (request, reply) => {
    const callingServer = (request as any).callingServer;

    logger.info({
      serverId: callingServer.id,
      name: callingServer.name,
    }, 'Server deregistration request');

    try {
      await prisma.server.update({
        where: { id: callingServer.id },
        data: {
          status: ServerStatus.OFFLINE,
          currentConnections: 0,
          currentBandwidth: 0,
        },
      });

      return { success: true };
    } catch (error: any) {
      logger.error({ error }, 'Server deregistration failed');
      return reply.status(500).send({ error: error.message });
    }
  });

  // ==================== METRICS & HEALTH ====================

  /**
   * Report server metrics (detailed heartbeat)
   * POST /api/internal/servers/metrics
   */
  fastify.post<{
    Body: {
      cpuUsage: number;
      memoryUsage: number;
      currentBandwidth: number;
      currentConnections: number;
      activeStreams: number[];
      diskUsage?: number;
      networkIn?: number;
      networkOut?: number;
      gpuUsage?: number;
      transcodeSessions?: number;
    };
  }>(
    '/servers/metrics',
    async (request, reply) => {
      const metrics = request.body;
      const callingServer = (request as any).callingServer;

      try {
        // Update server metrics
        await prisma.server.update({
          where: { id: callingServer.id },
          data: {
            cpuUsage: metrics.cpuUsage,
            memoryUsage: metrics.memoryUsage,
            currentBandwidth: metrics.currentBandwidth,
            currentConnections: metrics.currentConnections,
            lastHeartbeat: new Date(),
            failedChecks: 0,
          },
        });

        // Calculate health score
        const healthScore = calculateHealthScore(metrics);

        await prisma.server.update({
          where: { id: callingServer.id },
          data: { healthScore },
        });

        // Determine if server status should change
        let newStatus: ServerStatus = ServerStatus.ONLINE;
        if (metrics.cpuUsage > 90 || metrics.memoryUsage > 90) {
          newStatus = ServerStatus.OVERLOADED;
        } else if (metrics.cpuUsage > 70 || metrics.memoryUsage > 70) {
          newStatus = ServerStatus.DEGRADED;
        }

        if (newStatus !== callingServer.status) {
          await prisma.server.update({
            where: { id: callingServer.id },
            data: { status: newStatus },
          });
        }

        return {
          success: true,
          healthScore,
          status: newStatus,
        };
      } catch (error: any) {
        logger.error({ error }, 'Failed to update server metrics');
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * Health check endpoint
   * GET /api/internal/health
   */
  fastify.get('/health', async (request, reply) => {
    const callingServer = (request as any).callingServer;

    // Get multiplexer stats
    const multiplexStats = streamMultiplexer.getStats();

    // Get bandwidth router status
    const bandwidthStatus = await bandwidthRouter.getSystemBandwidthStatus();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      server: {
        id: callingServer.id,
        name: callingServer.name,
      },
      multiplexer: multiplexStats,
      bandwidth: bandwidthStatus,
    };
  });

  // ==================== STREAM STATUS SYNC ====================

  /**
   * Get list of active streams on this server
   * GET /api/internal/streams/active
   */
  fastify.get('/streams/active', async (request, reply) => {
    const callingServer = (request as any).callingServer;

    // Get multiplexed streams
    const multiplexedStreams = streamMultiplexer.getAllStreamsInfo();

    // Get running streams from lifecycle manager
    const runningStreams = await prisma.stream.findMany({
      where: {
        streamStatus: 'RUNNING',
        OR: [
          { runningServerId: callingServer.id },
          { runningServerId: null }, // Local streams
        ],
      },
      select: {
        id: true,
        name: true,
        streamType: true,
        ffmpegPid: true,
        lastStartedAt: true,
      },
    });

    return {
      multiplexed: multiplexedStreams.map(s => ({
        streamId: s.streamId,
        status: s.status,
        clientCount: s.clientCount,
        bytesReceived: s.bytesReceived,
        bitrateBps: s.bitrateBps,
      })),
      running: runningStreams,
      totalMultiplexedClients: multiplexedStreams.reduce((sum, s) => sum + s.clientCount, 0),
    };
  });

  /**
   * Notify that stream is ready (for handoff)
   * POST /api/internal/streams/:streamId/ready
   */
  fastify.post<{ Params: { streamId: string } }>(
    '/streams/:streamId/ready',
    async (request, reply) => {
      const { streamId } = request.params;
      const callingServer = (request as any).callingServer;

      logger.info({
        streamId,
        serverId: callingServer.id,
      }, 'Stream ready notification received');

      // Store in Redis for quick lookup
      const { redis } = await import('../../config/redis.js');
      await redis.setex(
        `stream_ready:${callingServer.id}:${streamId}`,
        60, // 1 minute TTL
        '1'
      );

      return { success: true };
    }
  );
};

/**
 * Calculate health score based on metrics (0-100)
 */
function calculateHealthScore(metrics: {
  cpuUsage: number;
  memoryUsage: number;
  currentBandwidth?: number;
  currentConnections?: number;
  diskUsage?: number;
}): number {
  let score = 100;

  // CPU penalty (max 30 points)
  if (metrics.cpuUsage > 90) score -= 30;
  else if (metrics.cpuUsage > 70) score -= 15;
  else if (metrics.cpuUsage > 50) score -= 5;

  // Memory penalty (max 30 points)
  if (metrics.memoryUsage > 90) score -= 30;
  else if (metrics.memoryUsage > 70) score -= 15;
  else if (metrics.memoryUsage > 50) score -= 5;

  // Disk penalty (max 20 points)
  if (metrics.diskUsage) {
    if (metrics.diskUsage > 95) score -= 20;
    else if (metrics.diskUsage > 85) score -= 10;
    else if (metrics.diskUsage > 75) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

export default internalServerRoutes;
