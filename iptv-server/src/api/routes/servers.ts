import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { loadBalancer } from '../../services/loadbalancer/LoadBalancer.js';
import { streamDistributor } from '../../services/loadbalancer/StreamDistributor.js';
import { edgeServerDeployment } from '../../services/deployment/EdgeServerDeployment.js';
import { ServerType, ServerStatus } from '@prisma/client';
import { ensureMainServerRegistered } from '../../services/MainServerRegistration.js';
import { getSystemMetrics, formatBytes, formatBandwidth, formatUptime, getAccurateCpuUsage, getCurrentBandwidth } from '../../services/monitoring/SystemMetrics.js';

// Validation schemas
const createServerSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(ServerType),
  domain: z.string().optional(),
  internalIp: z.string().ip(),
  externalIp: z.string().ip(),
  httpPort: z.number().int().positive().default(80),
  httpsPort: z.number().int().positive().default(443),
  rtmpPort: z.number().int().positive().optional().default(1935),
  apiPort: z.number().int().positive().default(8080),
  maxBandwidthMbps: z.number().int().positive().default(10000),
  maxConnections: z.number().int().positive().default(5000),
  maxTranscodes: z.number().int().min(0).default(10),
  region: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  // Capabilities
  canTranscode: z.boolean().default(true),
  transcodeProfiles: z.array(z.string()).default(['passthrough', 'h264_720p', 'h264_1080p']),
  supportsHls: z.boolean().default(true),
  supportsMpegts: z.boolean().default(true),
  supportsRtmp: z.boolean().default(false),
  // Hardware acceleration
  hasNvenc: z.boolean().default(false),
  nvencGpuModel: z.string().optional(),
  nvencMaxSessions: z.number().int().min(0).default(0),
  hasQsv: z.boolean().default(false),
  qsvModel: z.string().optional(),
  hasVaapi: z.boolean().default(false),
  vaapiDevice: z.string().optional(),
});

const updateServerSchema = createServerSchema.partial();

const updateStatusSchema = z.object({
  status: z.nativeEnum(ServerStatus),
});

const heartbeatSchema = z.object({
  cpuUsage: z.number().min(0).max(100),
  memoryUsage: z.number().min(0).max(100),
  currentBandwidth: z.number().int().min(0),
  currentConnections: z.number().int().min(0),
  activeStreams: z.array(z.number()).optional(),
});

const createLbRuleSchema = z.object({
  name: z.string().min(1),
  priority: z.number().int().default(100),
  isActive: z.boolean().default(true),
  matchRegion: z.string().optional(),
  matchCountry: z.string().optional(),
  matchStreamType: z.enum(['LIVE', 'VOD', 'SERIES', 'RADIO']).optional(),
  matchCategoryId: z.number().int().optional(),
  routeType: z.enum([
    'ROUND_ROBIN',
    'LEAST_CONNECTIONS',
    'LEAST_BANDWIDTH',
    'GEOGRAPHIC',
    'WEIGHTED',
    'FAILOVER',
  ]).default('ROUND_ROBIN'),
  targetServerIds: z.array(z.number().int()),
});

export const serverRoutes: FastifyPluginAsync = async (fastify) => {
  // ==================== SERVER MANAGEMENT ====================

  /**
   * List all servers
   * GET /admin/servers
   */
  fastify.get('/', async (request, reply) => {
    // Ensure main server is registered (safety check in case startup registration failed)
    try {
      await ensureMainServerRegistered();
    } catch (err) {
      logger.warn({ err }, 'Failed to ensure main server registration');
    }

    const servers = await prisma.server.findMany({
      include: {
        _count: {
          select: {
            streamAssignments: true,
            activeConnections: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const formattedServers = servers.map((s) => ({
      ...s,
      assignedStreams: s._count.streamAssignments,
      activeConnectionsCount: s._count.activeConnections,
      loadPercentage: Math.round((s.currentConnections / s.maxConnections) * 100),
      bandwidthPercentage: Math.round((s.currentBandwidth / s.maxBandwidthMbps) * 100),
    }));

    return {
      servers: formattedServers,
      pagination: {
        page: 1,
        limit: servers.length,
        total: servers.length,
        pages: 1,
      },
    };
  });

  /**
   * Get server by ID with details
   * GET /admin/servers/:id
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const server = await prisma.server.findUnique({
      where: { id: parseInt(id) },
      include: {
        streamAssignments: {
          include: {
            stream: {
              select: { id: true, name: true, streamType: true },
            },
          },
        },
        activeConnections: {
          take: 50,
          orderBy: { startedAt: 'desc' },
        },
      },
    });

    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    // Get historical metrics from Redis
    const metricsKey = `server_metrics:${id}`;
    const metrics = await redis.lrange(metricsKey, 0, 60);

    return {
      ...server,
      metrics: metrics.map((m: string) => JSON.parse(m)),
    };
  });

  /**
   * Add new server
   * POST /admin/servers
   */
  fastify.post('/', async (request, reply) => {
    const data = createServerSchema.parse(request.body);

    // Check for duplicate name
    const existing = await prisma.server.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Server name already exists' });
    }

    // Generate unique API key for this server
    const apiKey = crypto.randomUUID();

    const server = await prisma.server.create({
      data: {
        ...data,
        apiKey,
        status: ServerStatus.OFFLINE, // Will become ONLINE after first heartbeat
      },
    });

    logger.info({ serverId: server.id, name: server.name }, 'New server added');

    return reply.status(201).send({
      server,
      apiKey, // Return API key only once at creation
    });
  });

  /**
   * Update server
   * PUT /admin/servers/:id
   */
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const serverId = parseInt(id);

    logger.info({ serverId, body: request.body }, 'Update server request received');

    // Validate request body
    let data;
    try {
      data = updateServerSchema.parse(request.body);
      logger.info({ serverId, validatedData: data }, 'Request body validated successfully');
    } catch (validationError: any) {
      logger.error({ serverId, error: validationError.errors || validationError.message }, 'Validation failed');
      return reply.status(400).send({
        error: 'Validation failed',
        details: validationError.errors || validationError.message,
      });
    }

    // Check if server exists
    const existingServer = await prisma.server.findUnique({
      where: { id: serverId },
    });

    if (!existingServer) {
      logger.warn({ serverId }, 'Server not found for update');
      return reply.status(404).send({ error: 'Server not found' });
    }

    // Check for name uniqueness if name is being updated
    if (data.name && data.name !== existingServer.name) {
      const nameExists = await prisma.server.findUnique({
        where: { name: data.name },
      });
      if (nameExists) {
        logger.warn({ serverId, name: data.name }, 'Server name already exists');
        return reply.status(400).send({ error: 'Server name already exists' });
      }
    }

    try {
      logger.info({ serverId, updateData: data }, 'Executing Prisma update');
      const server = await prisma.server.update({
        where: { id: serverId },
        data,
      });
      logger.info({ serverId, updatedServer: server }, 'Server updated successfully');
      return server;
    } catch (dbError: any) {
      logger.error({ serverId, error: dbError.message, code: dbError.code }, 'Database update failed');
      return reply.status(500).send({
        error: 'Failed to update server',
        details: dbError.message,
      });
    }
  });

  /**
   * Delete server
   * DELETE /admin/servers/:id
   */
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Check if server has active connections
    const server = await prisma.server.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: { select: { activeConnections: true } },
      },
    });

    if (!server) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    if (server._count.activeConnections > 0) {
      return reply.status(400).send({
        error: 'Cannot delete server with active connections',
        activeConnections: server._count.activeConnections,
      });
    }

    await prisma.server.delete({
      where: { id: parseInt(id) },
    });

    logger.info({ serverId: parseInt(id), name: server.name }, 'Server deleted');

    return { success: true };
  });

  /**
   * Update server status (enable/disable/maintenance)
   * PUT /admin/servers/:id/status
   */
  fastify.put('/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = updateStatusSchema.parse(request.body);

    const server = await prisma.server.update({
      where: { id: parseInt(id) },
      data: { status },
    });

    // If taking offline, we should migrate streams
    if (status === ServerStatus.MAINTENANCE || status === ServerStatus.OFFLINE) {
      // Find active stream assignments
      const assignments = await prisma.serverStream.findMany({
        where: { serverId: parseInt(id), isActive: true },
      });

      if (assignments.length > 0) {
        logger.info(
          { serverId: parseInt(id), streams: assignments.length },
          'Migrating streams from server going offline'
        );

        // Try to migrate each stream to another server
        for (const assignment of assignments) {
          try {
            const alternative = await prisma.serverStream.findFirst({
              where: {
                streamId: assignment.streamId,
                serverId: { not: parseInt(id) },
                server: { status: ServerStatus.ONLINE },
              },
            });

            if (alternative) {
              await prisma.serverStream.update({
                where: { id: assignment.id },
                data: { isActive: false },
              });

              await prisma.serverStream.update({
                where: { id: alternative.id },
                data: { isActive: true },
              });
            }
          } catch (error) {
            logger.warn(
              { error, streamId: assignment.streamId },
              'Failed to migrate stream'
            );
          }
        }
      }
    }

    logger.info({ serverId: parseInt(id), status }, 'Server status updated');

    return server;
  });

  /**
   * Regenerate server API key
   * POST /admin/servers/:id/regenerate-key
   */
  fastify.post('/:id/regenerate-key', async (request, reply) => {
    const { id } = request.params as { id: string };

    const newApiKey = crypto.randomUUID();

    await prisma.server.update({
      where: { id: parseInt(id) },
      data: { apiKey: newApiKey },
    });

    return { apiKey: newApiKey };
  });

  // ==================== HEARTBEAT (for edge servers) ====================

  /**
   * Server heartbeat endpoint (called by edge servers)
   * POST /admin/servers/:id/heartbeat
   */
  fastify.post('/:id/heartbeat', async (request, reply) => {
    const { id } = request.params as { id: string };
    const apiKey = request.headers['x-server-key'] as string;

    if (!apiKey) {
      return reply.status(401).send({ error: 'API key required' });
    }

    // Verify API key
    const server = await prisma.server.findUnique({
      where: { id: parseInt(id) },
    });

    if (!server || server.apiKey !== apiKey) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    const metrics = heartbeatSchema.parse(request.body);

    // Update server metrics
    await loadBalancer.updateServerMetrics(parseInt(id), metrics);

    // Mark server as online if it was offline
    if (server.status === ServerStatus.OFFLINE) {
      await prisma.server.update({
        where: { id: parseInt(id) },
        data: { status: ServerStatus.ONLINE },
      });
      logger.info({ serverId: parseInt(id) }, 'Server came online');
    }

    // Check if server is overloaded
    const isOverloaded =
      metrics.cpuUsage > 90 ||
      metrics.memoryUsage > 90 ||
      metrics.currentConnections >= server.maxConnections * 0.95;

    if (isOverloaded && server.status === ServerStatus.ONLINE) {
      await prisma.server.update({
        where: { id: parseInt(id) },
        data: { status: ServerStatus.OVERLOADED },
      });
      logger.warn({ serverId: parseInt(id), metrics }, 'Server overloaded');
    } else if (!isOverloaded && server.status === ServerStatus.OVERLOADED) {
      await prisma.server.update({
        where: { id: parseInt(id) },
        data: { status: ServerStatus.ONLINE },
      });
    }

    return { success: true };
  });

  // ==================== STREAM ASSIGNMENT ====================

  /**
   * Assign stream to server
   * POST /admin/servers/:id/streams
   */
  fastify.post('/:id/streams', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamId, priority = 100 } = request.body as {
      streamId: number;
      priority?: number;
    };

    const assignment = await prisma.serverStream.upsert({
      where: {
        serverId_streamId: {
          serverId: parseInt(id),
          streamId,
        },
      },
      update: { priority },
      create: {
        serverId: parseInt(id),
        streamId,
        priority,
        isActive: false,
      },
    });

    return assignment;
  });

  /**
   * Remove stream from server
   * DELETE /admin/servers/:id/streams/:streamId
   */
  fastify.delete('/:id/streams/:streamId', async (request, reply) => {
    const { id, streamId } = request.params as { id: string; streamId: string };

    await prisma.serverStream.delete({
      where: {
        serverId_streamId: {
          serverId: parseInt(id),
          streamId: parseInt(streamId),
        },
      },
    });

    return { success: true };
  });

  // ==================== LOAD BALANCER RULES ====================

  /**
   * List load balancer rules
   * GET /admin/servers/lb-rules
   */
  fastify.get('/lb-rules', async () => {
    return prisma.loadBalancerRule.findMany({
      orderBy: { priority: 'asc' },
    });
  });

  /**
   * Create load balancer rule
   * POST /admin/servers/lb-rules
   */
  fastify.post('/lb-rules', async (request, reply) => {
    const data = createLbRuleSchema.parse(request.body);

    const rule = await prisma.loadBalancerRule.create({
      data: {
        ...data,
        matchStreamType: data.matchStreamType as any,
      },
    });

    return reply.status(201).send(rule);
  });

  /**
   * Update load balancer rule
   * PUT /admin/servers/lb-rules/:id
   */
  fastify.put('/lb-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createLbRuleSchema.partial().parse(request.body);

    const rule = await prisma.loadBalancerRule.update({
      where: { id: parseInt(id) },
      data: {
        ...data,
        matchStreamType: data.matchStreamType as any,
      },
    });

    return rule;
  });

  /**
   * Delete load balancer rule
   * DELETE /admin/servers/lb-rules/:id
   */
  fastify.delete('/lb-rules/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.loadBalancerRule.delete({
      where: { id: parseInt(id) },
    });

    return { success: true };
  });

  // ==================== REBALANCING ====================

  /**
   * Trigger stream rebalancing across servers
   * POST /admin/servers/rebalance
   */
  fastify.post('/rebalance', async (request, reply) => {
    logger.info('Triggering manual rebalance');

    try {
      await streamDistributor.rebalanceAll();
      return { success: true, message: 'Rebalance initiated' };
    } catch (error: any) {
      logger.error({ error }, 'Rebalance failed');
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * Auto-distribute a stream across available servers
   * POST /admin/servers/distribute/:streamId
   */
  fastify.post('/distribute/:streamId', async (request, reply) => {
    const { streamId } = request.params as { streamId: string };

    try {
      await streamDistributor.distributeStream(parseInt(streamId));
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ==================== STATISTICS ====================

  /**
   * Get overall server statistics
   * GET /admin/servers/stats
   */
  fastify.get('/stats', async () => {
    const servers = await prisma.server.findMany({
      include: {
        _count: {
          select: { activeConnections: true, streamAssignments: true },
        },
      },
    });

    const online = servers.filter((s) => s.status === ServerStatus.ONLINE).length;
    const offline = servers.filter((s) => s.status === ServerStatus.OFFLINE).length;
    const degraded = servers.filter(
      (s) => s.status === ServerStatus.DEGRADED || s.status === ServerStatus.OVERLOADED
    ).length;

    const totalBandwidth = servers.reduce((sum, s) => sum + s.maxBandwidthMbps, 0);
    const usedBandwidth = servers.reduce((sum, s) => sum + s.currentBandwidth, 0);

    const totalConnections = servers.reduce((sum, s) => sum + s.maxConnections, 0);
    const activeConnections = servers.reduce((sum, s) => sum + s.currentConnections, 0);

    return {
      servers: {
        total: servers.length,
        online,
        offline,
        degraded,
      },
      bandwidth: {
        total: totalBandwidth,
        used: usedBandwidth,
        percentage: totalBandwidth > 0 ? Math.round((usedBandwidth / totalBandwidth) * 100) : 0,
      },
      connections: {
        total: totalConnections,
        active: activeConnections,
        percentage: totalConnections > 0 ? Math.round((activeConnections / totalConnections) * 100) : 0,
      },
      byRegion: servers.reduce((acc, s) => {
        const region = s.region || 'Unknown';
        if (!acc[region]) {
          acc[region] = { count: 0, online: 0, connections: 0 };
        }
        acc[region].count++;
        if (s.status === ServerStatus.ONLINE) acc[region].online++;
        acc[region].connections += s.currentConnections;
        return acc;
      }, {} as Record<string, { count: number; online: number; connections: number }>),
    };
  });

  /**
   * Get real-time system metrics for the main server
   * GET /admin/servers/system-metrics
   */
  fastify.get('/system-metrics', async () => {
    const metrics = getSystemMetrics();
    const cpuUsage = getAccurateCpuUsage();
    const bandwidth = getCurrentBandwidth();
    
    // Get active user connections count from Redis viewer sets
    let activeConnections = 0;
    try {
      const viewerKeys = await redis.keys('stream:*:viewers');
      if (viewerKeys.length > 0) {
        for (const key of viewerKeys) {
          const count = await redis.scard(key);
          activeConnections += count;
        }
      }
    } catch {
      // Fallback to database count
      activeConnections = await prisma.lineConnection.count();
    }
    
    // Get main server info
    const mainServer = await prisma.server.findFirst({
      where: { type: ServerType.MAIN },
    });
    
    return {
      cpu: {
        usage: cpuUsage,
        cores: metrics.cpuCores,
      },
      memory: {
        usage: metrics.memoryUsage,
        total: metrics.memoryTotal,
        used: metrics.memoryUsed,
        free: metrics.memoryFree,
        totalFormatted: formatBytes(metrics.memoryTotal),
        usedFormatted: formatBytes(metrics.memoryUsed),
        freeFormatted: formatBytes(metrics.memoryFree),
      },
      load: {
        load1m: metrics.loadAverage[0],
        load5m: metrics.loadAverage[1],
        load15m: metrics.loadAverage[2],
      },
      system: {
        uptime: metrics.uptime,
        uptimeFormatted: formatUptime(metrics.uptime),
        platform: metrics.platform,
        hostname: metrics.hostname,
      },
      connections: {
        active: activeConnections,
        max: mainServer?.maxConnections || 5000,
      },
      bandwidth: {
        in: bandwidth.in,
        out: bandwidth.out,
        inFormatted: formatBandwidth(bandwidth.in),
        outFormatted: formatBandwidth(bandwidth.out),
        total: bandwidth.in + bandwidth.out,
        totalFormatted: formatBandwidth(bandwidth.in + bandwidth.out),
        // Legacy fields for compatibility
        current: Math.round((bandwidth.in + bandwidth.out) / (1024 * 1024)), // MB/s
        max: mainServer?.maxBandwidthMbps || 10000,
        currentFormatted: formatBandwidth(bandwidth.in + bandwidth.out),
        maxFormatted: `${mainServer?.maxBandwidthMbps || 10000} Mb/s`,
      },
      server: mainServer ? {
        id: mainServer.id,
        name: mainServer.name,
        status: mainServer.status,
        lastHeartbeat: mainServer.lastHeartbeat,
      } : null,
    };
  });

  // ==================== EDGE SERVER DEPLOYMENT ====================

  // Validation schemas for deployment
  const testConnectionSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().positive().default(22),
    username: z.string().min(1),
    password: z.string().optional(),
    privateKey: z.string().optional(),
  });

  const probeServerSchema = testConnectionSchema;

  const startDeploymentSchema = z.object({
    host: z.string().min(1),
    port: z.number().int().positive().default(22),
    username: z.string().min(1),
    password: z.string().optional(),
    privateKey: z.string().optional(),
    serverName: z.string().min(1).max(100),
    externalIp: z.string().ip().optional(),
    domain: z.string().optional(),
    sslEmail: z.string().email().optional(),
    maxConnections: z.number().int().positive().default(5000),
    skipNvidia: z.boolean().default(false),
    skipHttps: z.boolean().default(false),
  });

  /**
   * Test SSH connection to a remote server
   * POST /admin/servers/deploy/test-connection
   */
  fastify.post('/deploy/test-connection', async (request, reply) => {
    const data = testConnectionSchema.parse(request.body);

    try {
      const result = await edgeServerDeployment.testConnection({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        privateKey: data.privateKey,
      });

      return result;
    } catch (error: any) {
      logger.error({ error }, 'Connection test failed');
      return reply.status(500).send({ success: false, error: error.message });
    }
  });

  /**
   * Probe a remote server for system information
   * POST /admin/servers/deploy/probe
   */
  fastify.post('/deploy/probe', async (request, reply) => {
    const data = probeServerSchema.parse(request.body);

    try {
      const result = await edgeServerDeployment.probeServer({
        host: data.host,
        port: data.port,
        username: data.username,
        password: data.password,
        privateKey: data.privateKey,
      });

      return result;
    } catch (error: any) {
      logger.error({ error }, 'Server probe failed');
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * Start a new edge server deployment
   * POST /admin/servers/deploy/start
   */
  fastify.post('/deploy/start', async (request, reply) => {
    const data = startDeploymentSchema.parse(request.body);

    // Check for duplicate server name
    const existing = await prisma.server.findUnique({
      where: { name: data.serverName },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Server name already exists' });
    }

    // Get main panel URL from config
    const mainPanelUrl = `http://${process.env.HOST || 'localhost'}:${process.env.PORT || 3000}`;

    try {
      const deploymentId = await edgeServerDeployment.startDeployment({
        ...data,
        mainPanelUrl,
      });

      logger.info({ deploymentId, host: data.host, serverName: data.serverName }, 'Edge server deployment started');

      return reply.status(202).send({
        deploymentId,
        message: 'Deployment started',
      });
    } catch (error: any) {
      logger.error({ error }, 'Failed to start deployment');
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * Get deployment status
   * GET /admin/servers/deploy/:deploymentId
   */
  fastify.get('/deploy/:deploymentId', async (request, reply) => {
    const { deploymentId } = request.params as { deploymentId: string };

    const status = await edgeServerDeployment.getDeploymentStatus(deploymentId);

    if (!status) {
      return reply.status(404).send({ error: 'Deployment not found' });
    }

    return status;
  });

  /**
   * Cancel a running deployment
   * DELETE /admin/servers/deploy/:deploymentId
   */
  fastify.delete('/deploy/:deploymentId', async (request, reply) => {
    const { deploymentId } = request.params as { deploymentId: string };

    const cancelled = await edgeServerDeployment.cancelDeployment(deploymentId);

    if (cancelled) {
      return { success: true, message: 'Deployment cancelled' };
    }

    return reply.status(404).send({ error: 'Deployment not found or already completed' });
  });

  /**
   * List all active deployments
   * GET /admin/servers/deploy
   */
  fastify.get('/deploy', async () => {
    return edgeServerDeployment.getActiveDeployments();
  });

  // ==================== FILE BROWSER ====================

  /**
   * Browse media files on a server (local or remote)
   * GET /admin/servers/files?path=/media&serverId=1
   */
  fastify.get('/files', async (request, reply) => {
    const { path: dirPath = '/media', serverId, extensions } = request.query as {
      path?: string;
      serverId?: string;
      extensions?: string;
    };

    const fs = await import('fs/promises');
    const nodePath = await import('path');

    // Parse allowed extensions (default: video files)
    const allowedExtensions = extensions
      ? extensions.split(',').map(e => e.toLowerCase().trim())
      : ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'];

    // Helper to check if server is local
    const isLocalServer = (ip: string): boolean => {
      const localIps = ['127.0.0.1', 'localhost', '0.0.0.0'];
      // Also check if it matches the host's IP
      return localIps.includes(ip) || ip === process.env.HOST;
    };

    try {
      // If serverId is provided, check if it's a remote server or the local main server
      if (serverId) {
        const server = await prisma.server.findUnique({
          where: { id: parseInt(serverId) },
        });

        if (!server) {
          return reply.status(404).send({ error: 'Server not found' });
        }

        // Check if this is the main/local server (type MAIN or local IP)
        const serverIp = server.internalIp || server.externalIp;
        const isMainServer = server.type === 'MAIN' || isLocalServer(serverIp);

        if (!isMainServer) {
          // Use SSH to browse remote server
          try {
            const result = await edgeServerDeployment.browseRemoteFiles({
              host: serverIp,
              port: 22,
              path: dirPath,
              allowedExtensions,
            });

            return result;
          } catch (remoteError: any) {
            logger.error({ error: remoteError, serverId, path: dirPath }, 'Remote file browser error');
            return reply.status(500).send({ 
              error: `Failed to browse remote server: ${remoteError.message}`,
              hint: 'Make sure the server has SSH configured and the main panel has access.'
            });
          }
        }
        // If it's the main server, fall through to local file browsing
      }

      // Browse local filesystem
      const absolutePath = nodePath.default.resolve(dirPath);

      // Security: block access to sensitive system directories
      const blockedPaths = [
        '/proc', '/sys', '/dev', '/boot', '/etc/shadow', '/etc/passwd',
        '/root/.ssh', '/root/.gnupg', '/root/.bash_history',
        '/var/log', '/run', '/snap'
      ];
      const isBlockedPath = blockedPaths.some(p => absolutePath.startsWith(p) || absolutePath === p);
      
      if (isBlockedPath) {
        return reply.status(403).send({ error: 'Access denied to this system path' });
      }

      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      
      const items = entries
        .filter(entry => {
          if (entry.isDirectory()) return true;
          const ext = nodePath.default.extname(entry.name).toLowerCase();
          return allowedExtensions.includes(ext);
        })
        .map(entry => ({
          name: entry.name,
          path: nodePath.default.join(absolutePath, entry.name),
          isDirectory: entry.isDirectory(),
          extension: entry.isDirectory() ? null : nodePath.default.extname(entry.name).toLowerCase(),
        }))
        .sort((a, b) => {
          // Directories first, then files
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      // Get parent path - allow navigating up to root
      const parentPath = absolutePath !== '/' 
        ? nodePath.default.dirname(absolutePath) 
        : null;

      return {
        currentPath: absolutePath,
        parentPath,
        items,
        totalFiles: items.filter(i => !i.isDirectory).length,
        totalDirs: items.filter(i => i.isDirectory).length,
      };
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return reply.status(404).send({ error: 'Directory not found' });
      }
      if (error.code === 'EACCES') {
        return reply.status(403).send({ error: 'Permission denied' });
      }
      logger.error({ error, path: dirPath }, 'File browser error');
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * Search for media files on a server (local or remote)
   * GET /admin/servers/files/search?query=movie&path=/media&serverId=1
   */
  fastify.get('/files/search', async (request, reply) => {
    const { query, path: basePath = '/media', maxResults = '100', serverId } = request.query as {
      query: string;
      path?: string;
      maxResults?: string;
      serverId?: string;
    };

    if (!query || query.length < 2) {
      return reply.status(400).send({ error: 'Query must be at least 2 characters' });
    }

    const fs = await import('fs/promises');
    const nodePath = await import('path');

    const allowedExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.m2ts'];
    const limit = parseInt(maxResults) || 100;

    // Helper to check if server is local
    const isLocalServer = (ip: string): boolean => {
      const localIps = ['127.0.0.1', 'localhost', '0.0.0.0'];
      return localIps.includes(ip) || ip === process.env.HOST;
    };

    try {
      // If serverId is provided, check if it's remote or the local main server
      if (serverId) {
        const server = await prisma.server.findUnique({
          where: { id: parseInt(serverId) },
        });

        if (!server) {
          return reply.status(404).send({ error: 'Server not found' });
        }

        // Check if this is the main/local server
        const serverIp = server.internalIp || server.externalIp;
        const isMainServer = server.type === 'MAIN' || isLocalServer(serverIp);

        if (!isMainServer) {
          // Search on remote server via SSH
          try {
            const result = await edgeServerDeployment.searchRemoteFiles({
              host: serverIp,
              port: 22,
              basePath,
              query,
              limit,
              allowedExtensions,
            });

            return result;
          } catch (remoteError: any) {
            logger.error({ error: remoteError, serverId, query }, 'Remote file search error');
            return reply.status(500).send({ 
              error: `Failed to search remote server: ${remoteError.message}` 
            });
          }
        }
        // If it's the main server, fall through to local search
      }

      // Local file search
      const results: Array<{ name: string; path: string; directory: string }> = [];

      async function searchDir(dirPath: string): Promise<void> {
        if (results.length >= limit) return;

        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });

          for (const entry of entries) {
            if (results.length >= limit) break;

            const fullPath = nodePath.default.join(dirPath, entry.name);

            if (entry.isDirectory()) {
              await searchDir(fullPath);
            } else {
              const ext = nodePath.default.extname(entry.name).toLowerCase();
              if (allowedExtensions.includes(ext)) {
                const nameWithoutExt = nodePath.default.basename(entry.name, ext);
                if (nameWithoutExt.toLowerCase().includes(query.toLowerCase())) {
                  results.push({
                    name: entry.name,
                    path: fullPath,
                    directory: dirPath,
                  });
                }
              }
            }
          }
        } catch (error) {
          // Skip directories we can't access
        }
      }

      const mediaRoot = process.env.MEDIA_ROOT || '/media';
      const absolutePath = nodePath.default.resolve(basePath);

      if (!absolutePath.startsWith(mediaRoot) && !absolutePath.startsWith('/tmp')) {
        return reply.status(403).send({ error: 'Access denied to this path' });
      }

      await searchDir(absolutePath);

      return {
        query,
        results,
        total: results.length,
        truncated: results.length >= limit,
      };
    } catch (error: any) {
      logger.error({ error, query, path: basePath }, 'File search error');
      return reply.status(500).send({ error: error.message });
    }
  });
};

export default serverRoutes;

