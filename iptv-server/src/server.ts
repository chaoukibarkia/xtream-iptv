import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createReadStream } from 'fs';
import mime from 'mime-types';

import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { connectRedis, disconnectRedis, redis } from './config/redis.js';
import { logger } from './config/logger.js';

// Routes
import { playerApiRoutes } from './api/routes/player.js';
import { streamingRoutes } from './api/routes/streaming.js';
import { playlistRoutes } from './api/routes/playlist.js';
import { epgRoutes } from './api/routes/epg.js';
import { adminRoutes } from './api/routes/admin.js';
import { tmdbRoutes } from './api/routes/tmdb.js';
import { serverRoutes } from './api/routes/servers.js';
import { authRoutes } from './api/routes/auth.js';
import { transcodingRoutes } from './api/routes/transcoding.js';
import { vodRoutes } from './api/routes/vod.js';
import { settingsRoutes } from './api/routes/settings.js';
import { internalServerRoutes } from './api/routes/internalServer.js';
import { activationAdminRoutes, activationPublicRoutes } from './api/routes/activation.js';
import creditRoutes from './api/routes/credits.js';
import { roleRoutes } from './api/routes/roles.js';
import notificationRoutes from './api/routes/notifications.js';
import applicationsRoutes from './api/routes/applications.js';

// Services
import { hlsManager } from './services/streaming/HLSSegmenter.js';
import { streamSourceManager } from './services/streaming/StreamSourceManager.js';
import { alwaysOnStreamManager } from './services/streaming/AlwaysOnStreamManager.js';
import { onDemandStreamManager } from './services/streaming/OnDemandStreamManager.js';
import { abrStreamManager } from './services/streaming/AbrStreamManager.js';
import { dbLogger } from './services/logging/DatabaseLogger.js';
import { settingsService } from './services/settings/index.js';
import { ipGeoService } from './services/geo/IpGeoService.js';

// Workers
import { tmdbSyncWorker } from './workers/TmdbSyncWorker.js';
import { connectionCleanupWorker } from './workers/ConnectionCleanupWorker.js';
import { lineExpirationNotificationWorker } from './workers/LineExpirationNotificationWorker.js';
import { streamHealthMonitor } from './services/monitoring/StreamHealthMonitor.js';
import { alwaysOnHealthMonitor } from './services/monitoring/AlwaysOnHealthMonitor.js';
import { sourceStatusChecker } from './services/monitoring/SourceStatusChecker.js';
import { hybridSourceChecker } from './services/monitoring/HybridSourceChecker.js';
import { startMetricsCollection, stopMetricsCollection } from './services/monitoring/SystemMetrics.js';

// Server Registration
import { ensureMainServerRegistered } from './services/MainServerRegistration.js';

async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logging.level,
      transport: config.env === 'development' 
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
            },
          }
        : undefined,
    },
    trustProxy: true,
    // Connection settings to prevent resets
    connectionTimeout: 30000, // 30 seconds to establish connection
    keepAliveTimeout: 72000, // 72 seconds (longer than ALB/nginx defaults of 60s)
    requestTimeout: 0, // No timeout for streaming requests (handled per-route)
    bodyLimit: 10485760, // 10MB body limit
  });

  // Security plugins
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin for streaming
    crossOriginOpenerPolicy: false, // Disable for video playback
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  // Multipart file uploads (for application uploads)
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB max file size for APK/IPA files
      files: 1, // Max 1 file per request
    },
  });

  // Rate limiting - exclude streaming routes which have high request volumes by design
  await app.register(rateLimit, {
    max: 300, // Increased for admin dashboard which makes many parallel requests
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      return (request as any).user?.id?.toString() || request.ip;
    },
    allowList: (request) => {
      const url = request.url;
      // Streaming routes: HLS segments/playlists, live streams, VOD, series
      // These have naturally high request rates and should not be rate limited
      return url.startsWith('/hls/') ||
             url.startsWith('/hls-abr/') ||
             url.startsWith('/hls-passthrough/') ||
             url.startsWith('/vod-hls/') ||
             url.startsWith('/live/') ||
             url.startsWith('/movie/') ||
             url.startsWith('/series/') ||
             url.startsWith('/timeshift/') ||
             // Internal server-to-server routes (HLS relay, cascade distribution)
             url.startsWith('/internal/') ||
             // Internal server-to-server API (authenticated via X-Server-Key)
             url.startsWith('/api/internal/') ||
             // Media files (logos, images)
             url.startsWith('/media/') ||
             // Flag files (country flags)
             url.startsWith('/flags/') ||
             // Admin routes - frontend makes many parallel requests for dashboard
             url.startsWith('/admin/') ||
             // Xtream simple format: /:username/:password/:streamId.ext
             /^\/[^/]+\/[^/]+\/\d+\.\w+$/.test(url);
    },
  });

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Manual media file serving (custom route) - supports both GET and HEAD
  // Use absolute path /media which is the mount point for persistent storage in the container
  // This maps to /storage-pool/iptv-media on the host
  const mediaPath = '/media';
  
  // __dirname is still needed for serving static files from the public folder
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const serveMediaFile = async (request: any, reply: any) => {
    try {
      // Extract file path from params - Fastify wildcard stores in request.params['*']
      // For route /media/:path*, params will be { '*': 'images/logo.png' }
      const filePath = (request.params as any)['*'] || '';
      
      if (!filePath) {
        return reply.code(404).send({ error: 'File not found' });
      }
      
      const fullPath = path.join(mediaPath, filePath);
      
      // Security: prevent directory traversal
      const resolvedPath = path.resolve(fullPath);
      const resolvedMediaPath = path.resolve(mediaPath);
      if (!resolvedPath.startsWith(resolvedMediaPath)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      let actualPath = resolvedPath;
      
      // Check if file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        // File not found - try to find a timestamped version
        // This handles cases where DB has /media/images/foo.png but file is foo_1234567890.png
        const dir = path.dirname(resolvedPath);
        const ext = path.extname(resolvedPath);
        const baseName = path.basename(resolvedPath, ext);
        
        try {
          const files = await fs.readdir(dir);
          // Look for files matching pattern: baseName_timestamp.ext
          const matchingFile = files.find(f => {
            // Match pattern: baseName_<digits>.ext (e.g., elhiwar-ettounsi_1734567890123.png)
            const pattern = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_\\d+${ext.replace('.', '\\.')}$`);
            return pattern.test(f);
          });
          
          if (matchingFile) {
            actualPath = path.join(dir, matchingFile);
            logger.debug({ requested: resolvedPath, found: actualPath }, 'Serving timestamped logo file');
          } else {
            return reply.code(404).send({ error: 'File not found' });
          }
        } catch {
          return reply.code(404).send({ error: 'File not found' });
        }
      }

      // Get file stats and mime type
      const stats = await fs.stat(actualPath);
      const mimeType = mime.lookup(actualPath) || 'application/octet-stream';

      // Set headers
      reply.header('Content-Type', mimeType);
      reply.header('Content-Length', stats.size);
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // For HEAD requests, don't send the body
      if (request.method === 'HEAD') {
        return reply.send();
      }

      // Stream the file for GET requests
      const stream = createReadStream(actualPath);
      return reply.send(stream);
    } catch (error) {
      logger.error({ error, url: request.url }, 'Error serving media file');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  };

  // Register media routes with proper Fastify wildcard syntax: /media/*
  app.get('/media/*', serveMediaFile);
  app.head('/media/*', serveMediaFile);
  logger.info('✅ Media file serving routes registered');

  // Serve flag files from public/flags directory
  const publicPath = path.join(__dirname, 'public');

  const serveFlagFile = async (request: any, reply: any) => {
    try {
      const filePath = (request.params as any)['*'] || '';
      
      if (!filePath) {
        return reply.code(404).send({ error: 'File not found' });
      }
      
      const fullPath = path.join(publicPath, 'flags', filePath);
      
      // Security: prevent directory traversal
      const resolvedPath = path.resolve(fullPath);
      const resolvedPublicPath = path.resolve(path.join(publicPath, 'flags'));
      if (!resolvedPath.startsWith(resolvedPublicPath)) {
        return reply.code(403).send({ error: 'Forbidden' });
      }

      // Check if file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        return reply.code(404).send({ error: 'File not found' });
      }

      // Get file stats and mime type
      const stats = await fs.stat(resolvedPath);
      const mimeType = mime.lookup(resolvedPath) || 'application/octet-stream';

      // Set headers
      reply.header('Content-Type', mimeType);
      reply.header('Content-Length', stats.size);
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // For HEAD requests, don't send the body
      if (request.method === 'HEAD') {
        return reply.send();
      }

      // Stream the file for GET requests
      const stream = createReadStream(resolvedPath);
      return reply.send(stream);
    } catch (error) {
      logger.error({ error, url: request.url }, 'Error serving flag file');
      return reply.code(500).send({ error: 'Internal server error' });
    }
  };

  // Register flag routes
  app.get('/flags/*', serveFlagFile);
  app.head('/flags/*', serveFlagFile);
  logger.info('✅ Flag file serving routes registered');

  // Register routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(playerApiRoutes);
  await app.register(streamingRoutes);  // No prefix - uses /live/, /movie/, /series/, /hls/
  await app.register(playlistRoutes);
  await app.register(epgRoutes);
  await app.register(adminRoutes, { prefix: '/admin' });
  await app.register(tmdbRoutes, { prefix: '/admin/tmdb' });
  await app.register(serverRoutes, { prefix: '/admin/servers' });
  await app.register(transcodingRoutes, { prefix: '/admin/transcoding' });
  await app.register(vodRoutes, { prefix: '/admin/vod' });
  await app.register(settingsRoutes, { prefix: '/admin/settings' });
  await app.register(activationAdminRoutes, { prefix: '/admin/activation-codes' });
  await app.register(creditRoutes); // Credit routes (includes /admin/credit-packages and /admin/credits)
  await app.register(roleRoutes, { prefix: '/admin' }); // RBAC routes (/admin/roles, /admin/permissions, etc.)
  await app.register(notificationRoutes); // Notification routes (/admin/notifications)
  await app.register(applicationsRoutes); // Application management routes

  // Public activation endpoint (no auth required)
  await app.register(activationPublicRoutes, { prefix: '/activate' });

  // Internal server-to-server API (for Load Balancers to pull streams)
  await app.register(internalServerRoutes, { prefix: '/api/internal' });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error({ error, url: request.url }, 'Request error');

    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation Error',
        message: error.message,
      });
    }

    return reply.status(error.statusCode || 500).send({
      error: 'Internal Server Error',
      message: config.env === 'development' ? error.message : 'Something went wrong',
    });
  });

  return app;
}

async function start() {
  try {
    // Connect to databases
    await connectDatabase();
    await connectRedis();

    // Initialize system settings
    await settingsService.initialize();
    logger.info('⚙️  System settings initialized');

    // Initialize IP geolocation service (MaxMind databases)
    await ipGeoService.initialize();
    logger.info('🌍 IP geolocation service initialized');

    // Register main server in database
    await ensureMainServerRegistered();
    logger.info('🖥️  Main server registered in database');

    // Start system metrics collection (every 10 seconds)
    startMetricsCollection(10000);
    logger.info('📊 System metrics collection started');

    // Start bandwidth-aware router for load balancing
    const { bandwidthRouter } = await import('./services/loadbalancer/BandwidthAwareRouter.js');
    bandwidthRouter.start();
    logger.info('📡 Bandwidth-aware router started');

    // Start stream multiplexer for server-to-server distribution
    const { streamMultiplexer } = await import('./services/loadbalancer/StreamMultiplexer.js');
    streamMultiplexer.start();
    logger.info('🔄 Stream Multiplexer started');

    // Build and start server
    const app = await buildServer();

    await app.listen({
      host: config.host,
      port: config.port,
    });

    logger.info(`🚀 Server running at http://${config.host}:${config.port}`);
    logger.info(`📺 Player API: http://${config.host}:${config.port}/player_api.php`);
    logger.info(`📋 Playlist: http://${config.host}:${config.port}/get.php`);
    logger.info(`📡 EPG: http://${config.host}:${config.port}/xmltv.php`);
    logger.info(`⚙️  Admin API: http://${config.host}:${config.port}/admin`);
    logger.info(`🎬 TMDB API: http://${config.host}:${config.port}/admin/tmdb`);
    logger.info(`🖥️  Servers API: http://${config.host}:${config.port}/admin/servers`);
    logger.info(`🎛️  Transcoding API: http://${config.host}:${config.port}/admin/transcoding`);

    // Start background workers
    tmdbSyncWorker.start();
    connectionCleanupWorker.start();
    lineExpirationNotificationWorker.start();
    streamHealthMonitor.start();
    streamSourceManager.start();
    logger.info('📡 Stream Source Manager started (failover enabled)');
    
    // Start database logger with cleanup job
    dbLogger.startCleanupJob();
    logger.info('📝 Database Logger started with auto-cleanup');
    
    // Start always-on streams (includes health monitor) - DISABLED for on-demand only
    // await alwaysOnStreamManager.start();
    // logger.info('🔴 Always-On Stream Manager started');
    // logger.info('🏥 Always-On Health Monitor started (audio/video/process monitoring)');

    // Start on-demand stream manager
    onDemandStreamManager.start();
    logger.info('📺 On-Demand Stream Manager started');

    // Start ABR stream manager with idle cleanup
    abrStreamManager.start();
    logger.info('🎬 ABR Stream Manager started');

    // Start hybrid source status checker (curl + ffprobe fallback) - DISABLED
    // await hybridSourceChecker.start();
    // logger.info('🔍 Hybrid Source Status Checker started');

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);

      try {
        // Stop workers first
        tmdbSyncWorker.stop();
        connectionCleanupWorker.stop();
        lineExpirationNotificationWorker.stop();
        streamHealthMonitor.stop();
        // alwaysOnHealthMonitor.stop(); // DISABLED - on-demand streams only
        // hybridSourceChecker.stop(); // Stop hybrid source status checker - DISABLED
        streamSourceManager.stop();
        onDemandStreamManager.stop();
        abrStreamManager.stop();
        dbLogger.stopCleanupJob();
        stopMetricsCollection(); // Stop system metrics collection
        // await alwaysOnStreamManager.stop(); // DISABLED - on-demand streams only

        await app.close();
        await hlsManager.stopAll();
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Server shut down successfully');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle unhandled promise rejections (e.g., Redis timeouts)
    // Without this, the process crashes on any unhandled rejection
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, '❌ Unhandled Promise Rejection - this would normally crash the process');
      
      // Check if it's a Redis timeout error
      if (reason instanceof Error && reason.message.includes('Command timed out')) {
        logger.warn('Redis command timed out - continuing without restart');
      }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ error }, '❌ Uncaught Exception');
      
      // If it's a Redis error, log and continue
      if (error.message?.includes('Redis') || error.message?.includes('Command timed out')) {
        logger.warn('Redis error caught - continuing without restart');
        return;
      }
      
      // For other errors, shut down gracefully
      shutdown('UNCAUGHT_EXCEPTION').catch(() => process.exit(1));
    });

  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
