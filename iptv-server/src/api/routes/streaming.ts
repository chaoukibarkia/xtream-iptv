import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { authenticateIptvLine, AuthQuery, registerConnection, unregisterConnection, checkConnectionLimit, registerHlsConnection, refreshHlsConnectionByViewerId, ConnectionOptions, HlsConnectionOptions, refreshConnectionTTL } from '../middlewares/auth.js';
import { streamProxy, TRANSCODE_PROFILES } from '../../services/streaming/StreamProxy.js';
import { streamLifecycleManager } from '../../services/streaming/StreamLifecycleManager.js';
import { onDemandStreamManager } from '../../services/streaming/OnDemandStreamManager.js';
import { abrStreamManager } from '../../services/streaming/AbrStreamManager.js';
import { hlsPassthroughManager } from '../../services/streaming/HLSPassthroughManager.js';
import { vodToHlsService } from '../../services/streaming/VodToHls.js';
import { vodViewerManager } from '../../services/streaming/VodViewerManager.js';
import { loadBalancer } from '../../services/loadbalancer/LoadBalancer.js';
import { isMainPanelServer } from '../../services/MainServerRegistration.js';
import { streamProber } from '../../services/streaming/StreamProber.js';
import { v4 as uuidv4 } from 'uuid';
import { StreamType, ContentType } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import * as path from 'path';
import { FastifyRequest } from 'fastify';

// Cache for stream health checks (1-minute TTL - short since we use FFprobe for accuracy)
const streamHealthCache = new Map<number, { healthy: boolean; checkedAt: number; error?: string }>();
const HEALTH_CACHE_TTL = 1 * 60 * 1000; // 1 minute

/**
 * Quick health check for stream source before registering connection
 * Uses caching to avoid repeated checks for the same stream
 */
async function checkStreamSourceHealth(
  streamId: number,
  sourceUrl: string,
  customUserAgent?: string | null
): Promise<{ healthy: boolean; error?: string; cached: boolean }> {
  logger.info({ streamId, sourceUrl: sourceUrl.substring(0, 60) }, 'Starting stream health check');
  
  // Check cache first
  const cached = streamHealthCache.get(streamId);
  if (cached && (Date.now() - cached.checkedAt) < HEALTH_CACHE_TTL) {
    logger.info({ streamId, healthy: cached.healthy, cached: true }, 'Using cached health check result');
    return { healthy: cached.healthy, error: cached.error, cached: true };
  }
  
  try {
    // Use FFprobe directly to validate actual stream content
    // HTTP check is NOT reliable - many IPTV sources return 200 even when broken
    // FFprobe actually reads the stream and checks for video/audio
    const result = await streamProber.checkHealthFfprobe(sourceUrl, customUserAgent || undefined);
    
    logger.info(
      { streamId, healthy: result.online, latency: result.latency, method: result.method, error: result.error },
      'Stream health check completed'
    );
    
    // Cache the result
    streamHealthCache.set(streamId, {
      healthy: result.online,
      checkedAt: Date.now(),
      error: result.error,
    });
    
    if (!result.online) {
      logger.warn(
        { streamId, sourceUrl: sourceUrl.substring(0, 50) + '...', error: result.error, latency: result.latency },
        'Stream source health check failed'
      );
    }
    
    return { healthy: result.online, error: result.error, cached: false };
  } catch (error: any) {
    logger.error({ streamId, error: error.message }, 'Stream health check error');
    return { healthy: false, error: error.message, cached: false };
  }
}

/**
 * Get the real client IP from request headers
 * Handles X-Real-IP, X-Forwarded-For, and falls back to request.ip
 */
function getClientIp(request: FastifyRequest): string {
  // Try X-Real-IP first (set by nginx)
  const xRealIp = request.headers['x-real-ip'];
  if (xRealIp && typeof xRealIp === 'string') {
    return xRealIp;
  }
  
  // Try X-Forwarded-For (first IP in the list is the original client)
  const xForwardedFor = request.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const forwardedIps = typeof xForwardedFor === 'string' 
      ? xForwardedFor.split(',').map(ip => ip.trim())
      : xForwardedFor;
    if (forwardedIps.length > 0 && forwardedIps[0]) {
      return forwardedIps[0];
    }
  }
  
  // Fall back to request.ip (which may be proxy IP if trustProxy doesn't work)
  return request.ip;
}

/**
 * Generate a stable viewer ID for HLS based on line, stream, and client info
 * This ensures the same client doesn't create multiple viewer entries on playlist refresh
 * BUT allows multiple player instances by checking if ID already exists and creating a new one
 */
function generateStableViewerId(lineId: number, streamId: number, ip: string, userAgent?: string): string {
  const data = `${lineId}:${streamId}:${ip}:${userAgent || 'unknown'}`;
  return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
}

/**
 * Convert ISO 639-1/639-2 language codes to human-readable names
 */
function getLanguageName(code: string): string {
  const languageNames: Record<string, string> = {
    'eng': 'English',
    'en': 'English',
    'fra': 'French',
    'fr': 'French',
    'deu': 'German',
    'de': 'German',
    'spa': 'Spanish',
    'es': 'Spanish',
    'ita': 'Italian',
    'it': 'Italian',
    'por': 'Portuguese',
    'pt': 'Portuguese',
    'rus': 'Russian',
    'ru': 'Russian',
    'ara': 'Arabic',
    'ar': 'Arabic',
    'zho': 'Chinese',
    'zh': 'Chinese',
    'jpn': 'Japanese',
    'ja': 'Japanese',
    'kor': 'Korean',
    'ko': 'Korean',
    'nld': 'Dutch',
    'nl': 'Dutch',
    'pol': 'Polish',
    'pl': 'Polish',
    'tur': 'Turkish',
    'tr': 'Turkish',
    'hin': 'Hindi',
    'hi': 'Hindi',
    'und': 'Unknown',
  };
  return languageNames[code.toLowerCase()] || code.toUpperCase();
}

interface StreamParams {
  username: string;
  password: string;
  streamId: string;
  ext?: string;
}

interface HLSSegmentParams {
  token: string;
  streamId: string;
  segment: string;
}

interface BouquetItem {
  bouquet: { id: number };
}

/**
 * Get the base URL from request headers, handling proxy chains
 * x-forwarded-proto can be "https, https" with multiple proxies
 * 
 * IMPORTANT: For external domains (*.zz00.org), we default to HTTPS
 * since the reverse proxy may not pass X-Forwarded-Proto correctly
 */
function getBaseUrl(request: any): string {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host = typeof forwardedHost === 'string'
    ? forwardedHost.split(',')[0].trim()
    : (forwardedHost?.[0] || request.headers.host || `localhost:${config.port}`);
  
  // Check X-Forwarded-Proto header
  const forwardedProto = request.headers['x-forwarded-proto'];
  let protocol = typeof forwardedProto === 'string' 
    ? forwardedProto.split(',')[0].trim() 
    : (forwardedProto?.[0] || request.protocol || 'http');
  
  // For external domains (like *.zz00.org), default to HTTPS
  // This handles cases where nginx doesn't pass X-Forwarded-Proto
  if (protocol === 'http' && host.includes('.zz00.org')) {
    protocol = 'https';
  }
  
  return `${protocol}://${host}`;
}

export const streamingRoutes: FastifyPluginAsync = async (fastify) => {
  
  // ============================================================
  // INTERNAL HLS ROUTE - For server-to-server cascade streaming
  // No user authentication, but requires valid server API key
  // ============================================================
  fastify.get<{
    Params: { streamId: string };
    Headers: { 'x-server-key'?: string };
  }>('/internal/hls/:streamId/playlist.m3u8', async (request, reply) => {
    const { streamId } = request.params;
    const serverKey = request.headers['x-server-key'];
    const streamIdNum = parseInt(streamId);
    
    // Validate server API key if provided, otherwise allow for internal network
    // In production, you should always require the server key
    if (serverKey) {
      const server = await prisma.server.findFirst({
        where: { apiKey: serverKey },
      });
      if (!server) {
        return reply.status(401).send({ error: 'Invalid server key' });
      }
    }
    
    const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
    const playlistPath = path.join(hlsDir, 'playlist.m3u8');
    
    try {
      // CRITICAL: Check if the stream is actually running before serving the playlist
      // This prevents serving stale playlists from old stream sessions (e.g., after server restart)
      if (!streamLifecycleManager.isStreamRunning(streamIdNum)) {
        // Stream isn't running - check if playlist is fresh (modified in last 30 seconds)
        const stats = await fs.stat(playlistPath);
        const ageMs = Date.now() - stats.mtimeMs;
        const MAX_STALE_AGE_MS = 30000; // 30 seconds - if older, it's from a dead stream
        
        if (ageMs > MAX_STALE_AGE_MS) {
          logger.warn({ 
            streamId, 
            ageMs, 
            isRunning: false 
          }, 'Internal HLS request for stale playlist from stopped stream');
          return reply.status(404).send({ error: 'Stream not active' });
        }
      }
      
      // CRITICAL: Refresh stream activity when child servers fetch content
      // This prevents the origin from killing the stream due to "idle" detection
      // Child edge servers are downstream viewers - their requests indicate active streaming
      const remoteAddress = request.ip || request.headers['x-forwarded-for']?.toString().split(',')[0].trim();
      const cascadeConnectionId = `cascade:${remoteAddress || 'unknown'}`;
      onDemandStreamManager.refreshViewer(streamIdNum, cascadeConnectionId).catch((err) => {
        logger.debug({ streamId, err }, 'Failed to refresh cascade viewer');
      });
      
      const playlist = await fs.readFile(playlistPath, 'utf-8');
      
      // Return raw playlist with relative segment paths
      // The requesting server will handle the segments themselves
      reply.header('Content-Type', 'application/vnd.apple.mpegurl');
      reply.header('Cache-Control', 'no-cache');
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(playlist);
    } catch (error) {
      logger.error({ streamId, error }, 'Failed to read internal HLS playlist');
      return reply.status(404).send({ error: 'HLS playlist not found' });
    }
  });

  // Internal HLS segment route - serves raw TS segments, fMP4 segments (.m4s), and init files
  fastify.get<{
    Params: { streamId: string; segment: string };
  }>('/internal/hls/:streamId/:segment', async (request, reply) => {
    const { streamId, segment } = request.params;
    
    const segmentPath = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`, segment);
    
    try {
      const segmentData = await fs.readFile(segmentPath);
      
      // Set correct Content-Type based on file extension
      // .ts = MPEG-TS segments, .m4s/.mp4 = fMP4 segments/init
      let contentType = 'video/MP2T';
      if (segment.endsWith('.m4s') || segment.endsWith('.mp4')) {
        contentType = 'video/mp4';
      }
      
      reply.header('Content-Type', contentType);
      reply.header('Cache-Control', 'public, max-age=3600');
      reply.header('Access-Control-Allow-Origin', '*');
      return reply.send(segmentData);
    } catch (error) {
      return reply.status(404).send({ error: 'Segment not found' });
    }
  });

  // Handler for live streams - shared between routes
  const handleLiveStream = async (request: any, reply: any) => {
    const requestStartTime = Date.now();
    const { streamId, ext } = request.params;
    // Access line through request.line (or request.user for backwards compatibility)
    const line = (request.line || request.user)!;

    // Check connection limit
    await checkConnectionLimit(request as any, reply);
    if (reply.sent) return;

    try {
      // Get stream from database with ABR profile
      const dbQueryStart = Date.now();
      const stream = await prisma.stream.findUnique({
        where: { 
          id: parseInt(streamId),
          streamType: StreamType.LIVE,
          isActive: true,
        },
        include: {
          abrProfile: true,
        },
      });
      const dbQueryTime = Date.now() - dbQueryStart;

      if (!stream) {
        return reply.status(404).send({ error: 'Stream not found' });
      }

      // HEALTH CHECK: Verify stream source is working BEFORE registering connection
      // This prevents wasting connections on broken streams
      const healthCheck = await checkStreamSourceHealth(
        stream.id,
        stream.sourceUrl,
        stream.customUserAgent
      );
      
      if (!healthCheck.healthy) {
        logger.warn(
          { streamId: stream.id, streamName: stream.name, error: healthCheck.error, cached: healthCheck.cached },
          'Stream source unavailable - not registering connection'
        );
        return reply.status(503).send({
          error: 'Stream source unavailable',
          message: 'The channel source is currently not responding. Please try again later or choose another channel.',
          details: healthCheck.error,
        });
      }

      // Check if line has access (via bouquets) - admins can access all streams
      const isAdmin = line.owner?.role === 'ADMIN';
      if (!isAdmin) {
        const bouquetIds = line.bouquets.map((b: BouquetItem) => b.bouquet.id);
        if (bouquetIds.length > 0) {
          const hasAccess = await prisma.bouquetStream.findFirst({
            where: {
              streamId: stream.id,
              bouquetId: { in: bouquetIds },
            },
          });

          if (!hasAccess) {
            return reply.status(403).send({ error: 'Access denied' });
          }
        }
      }

      // Determine output format
      const outputFormat = ext === 'm3u8' ? 'hls' : 'mpegts';
      const profile = stream.transcodeProfile || 'passthrough';

      if (outputFormat === 'hls') {
        // Generate a stable viewer ID based on line+stream+IP+user-agent
        // This prevents playlist refreshes from creating duplicate viewers
        // Note: Multiple players from same client will share the same viewer ID
        // This is a trade-off - accurate counting requires session cookies which many players don't support
        const viewerId = generateStableViewerId(
          line.id,
          stream.id,
          getClientIp(request),
          request.headers['user-agent'] as string
        );

        // Check if stream has ABR profile - use ABR streaming
        // IMPORTANT: Check ABR BEFORE registerViewer to avoid starting two FFmpeg processes
        // Only use ABR if the stream actually has an ABR profile configured
        // Old directory structures (master.m3u8, stream_0/) from previous runs should not trigger ABR mode
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${stream.id}`);
        const masterPlaylistPath = path.join(hlsDir, 'master.m3u8');
        
        // Only check for existing ABR structure if stream has ABR profile
        // This prevents old passthrough directories from triggering ABR mode
        const hasAbrProfile = stream.abrProfile && stream.abrProfileId;
        
        if (hasAbrProfile) {
          
          // If ABR stream is not running, start it
          if (!abrStreamManager.isAbrStreamRunning(stream.id)) {
            logger.info({ streamId: stream.id, abrProfile: stream.abrProfile?.name }, 'Starting ABR stream for HLS playback');
            await abrStreamManager.startAbrStream(stream.id, stream.abrProfileId!, stream.sourceUrl);

            // Wait for master playlist and at least one variant playlist to be created
            // Optimized: 100ms intervals (was 500ms) for faster startup, max 3 seconds total
            let attempts = 0;
            const maxAttempts = 30;
            const pollInterval = 100;
            while (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, pollInterval));
              try {
                // Check if master playlist exists
                await fs.access(masterPlaylistPath);
                // Check if first variant playlist exists
                const variant0Path = path.join(hlsDir, 'stream_0', 'playlist.m3u8');
                await fs.access(variant0Path);
                // Both exist, we can proceed
                logger.debug({ streamId: stream.id, attempts, elapsedMs: attempts * pollInterval }, 'ABR playlists ready');
                break;
              } catch {
                attempts++;
              }
            }

            if (attempts >= maxAttempts) {
              logger.warn({ streamId: stream.id }, 'ABR stream startup timeout, proceeding anyway');
            }
          }

          // Register ABR viewer for idle timeout tracking
          await abrStreamManager.registerViewer(stream.id, viewerId);
          
          // Register HLS connection for line connection tracking with content info
          await registerHlsConnection(
            line.id,
            stream.id,
            viewerId,
            getClientIp(request),
            request.headers['user-agent'] as string,
            {
              contentType: ContentType.LIVE,
              contentName: stream.name,
            }
          );

          // Read the master playlist from filesystem
          let masterPlaylist: string;
          try {
            masterPlaylist = await fs.readFile(masterPlaylistPath, 'utf-8');
          } catch (error) {
            logger.error({ streamId: stream.id, error }, 'Failed to read ABR master playlist');
            return reply.status(503).send({ error: 'ABR stream not ready' });
          }

          // Get server base URL for absolute URLs (important for external access)
          const baseUrl = getBaseUrl(request);

          // Modify playlist URLs to include auth - use absolute URLs for better compatibility
          const modifiedPlaylist = masterPlaylist.replace(
            /stream_(\d+)\/playlist\.m3u8/g,
            `${baseUrl}/hls-abr/${viewerId}/${streamId}/stream_$1/playlist.m3u8`
          );

          reply.header('Content-Type', 'application/vnd.apple.mpegurl');
          reply.header('Cache-Control', 'no-cache');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(modifiedPlaylist);
        }

        // IMPORTANT: Check distribution BEFORE registering viewer
        // Main panel should redirect to edge servers for streams with distribution
        const currentServerId = config.multiServer.serverId;
        const isMainPanel = await isMainPanelServer();
        
        logger.info({
          streamId: stream.id,
          currentServerId,
          isMainPanel,
        }, 'Checking if main panel should redirect to edge server');
        
        if (isMainPanel) {
          // Main panel - check if stream has distribution and should be redirected
          const hasDistribution = await prisma.streamServerDistribution.findFirst({
            where: { streamId: stream.id, isActive: true },
          });
          
          logger.info({
            streamId: stream.id,
            hasDistribution: !!hasDistribution,
            distributionServerId: hasDistribution?.serverId,
          }, 'Distribution check result');
          
          if (hasDistribution) {
            // Redirect to edge server for HLS
            const { username, password } = request.params;
            const clientIp = getClientIp(request);
            
            try {
              const routingDecision = await loadBalancer.routeStream(
                stream.id,
                line.id,
                clientIp,
                ext || 'm3u8'
              );
              
              // Build redirect URL to edge server
              const targetServer = await prisma.server.findUnique({
                where: { id: routingDecision.serverId },
                select: { domain: true, externalIp: true, httpsPort: true, httpPort: true },
              });
              
              let redirectBaseUrl: string;
              if (targetServer?.domain) {
                redirectBaseUrl = `https://${targetServer.domain}`;
              } else {
                redirectBaseUrl = routingDecision.serverUrl;
              }
              
              // Preserve query string parameters (e.g., device_id)
              const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
              const redirectUrl = `${redirectBaseUrl}/live/${username}/${password}/${streamId}.${ext || 'm3u8'}${queryString}`;
              
              logger.info({
                streamId: stream.id,
                targetServerId: routingDecision.serverId,
                redirectUrl,
                reason: routingDecision.reason,
                clientIp,
                format: 'hls',
              }, 'Main panel redirecting HLS stream request to edge server');
              
              return reply.redirect(redirectUrl, 302);
            } catch (routeError: any) {
              logger.error({
                streamId: stream.id,
                error: routeError.message,
              }, 'Failed to route HLS stream to edge server');
              return reply.status(503).send({ 
                error: 'No edge servers available for this stream',
                details: routeError.message,
              });
            }
          }
        }

        // Check if source is multi-bitrate HLS - use passthrough streaming BEFORE registering viewer
        // This prevents OnDemandStreamManager from starting FFmpeg for passthrough streams
        const isHLS = hlsPassthroughManager.isHLSUrl(stream.sourceUrl);
        const isPassthrough = !stream.transcodeProfile || stream.transcodeProfile === 'passthrough';
        
        if (isHLS && isPassthrough) {
          const masterInfo = await hlsPassthroughManager.analyzeHLSSource(
            stream.id, 
            stream.sourceUrl,
            stream.customUserAgent || undefined
          );

          if (masterInfo.isMultiBitrate) {
            logger.info({ 
              streamId: stream.id, 
              variantCount: masterInfo.variants.length,
              audioTracks: masterInfo.mediaTracks?.filter(t => t.type === 'AUDIO').length || 0,
            }, 'Using HLS passthrough for multi-bitrate source');

            // Register HLS connection for passthrough viewer tracking
            await registerHlsConnection(
              line.id,
              stream.id,
              viewerId,
              getClientIp(request),
              request.headers['user-agent'] as string,
              {
                contentType: ContentType.LIVE,
                contentName: stream.name,
              }
            );

            // Get server base URL
            const serverBaseUrl = getBaseUrl(request);

            // Generate proxied master playlist
            const proxiedMasterPlaylist = hlsPassthroughManager.generateProxiedMasterPlaylist(
              stream.id,
              masterInfo,
              viewerId,
              serverBaseUrl
            );

            reply.header('Content-Type', 'application/vnd.apple.mpegurl');
            reply.header('Cache-Control', 'no-cache');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
            reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
            return reply.send(proxiedMasterPlaylist);
          }
        }

        // Register viewer with unique ID for non-passthrough streams
        // Only for non-ABR streams - ABR streams are managed separately
        await onDemandStreamManager.registerViewer(stream.id, viewerId);
        
        // Register HLS connection for line connection tracking with content info
        await registerHlsConnection(
          line.id,
          stream.id,
          viewerId,
          getClientIp(request),
          request.headers['user-agent'] as string,
          {
            contentType: ContentType.LIVE,
            contentName: stream.name,
          }
        );

        // Standard single-bitrate HLS
        // Use hlsDir and masterPlaylistPath already declared above
        // Check for master.m3u8 first (passthrough mode with var_stream_map), then playlist.m3u8
        const regularPlaylistPath = path.join(hlsDir, 'playlist.m3u8');
        
        // If stream is not running locally, check if we should start it here or use HLS relay
        // Note: registerViewer() in OnDemandStreamManager already checks distribution,
        // but this is a fallback for edge cases (e.g., direct playlist access)
        if (!streamLifecycleManager.isStreamRunning(stream.id)) {
          const currentServerId = config.multiServer.serverId;

          // Check stream distribution to determine this server's role
          let distribution = null;
          let isChildServer = false;
          
          if (currentServerId) {
            distribution = await prisma.streamServerDistribution.findUnique({
              where: {
                streamId_serverId: { streamId: stream.id, serverId: currentServerId },
              },
            });
            isChildServer = distribution?.role === 'CHILD';
          }

          // Check if stream is running on another server
          const streamStatus = await prisma.stream.findUnique({
            where: { id: stream.id },
            select: { streamStatus: true, runningServerId: true },
          });

          const isRunningElsewhere = streamStatus?.streamStatus === 'RUNNING' && 
                                     streamStatus.runningServerId && 
                                     streamStatus.runningServerId !== currentServerId;

          // If this is a CHILD server, start HLS relay (will notify origin to start if needed)
          // This works whether or not the stream is already running on the origin:
          // - If origin is running: relay will start fetching segments immediately
          // - If origin is NOT running: StreamLifecycleManager will notify origin first
          if (isChildServer) {
            logger.info({
              streamId: stream.id,
              currentServerId,
              runningServerId: streamStatus?.runningServerId,
              isRunningElsewhere,
              role: 'CHILD',
              pullFromServerId: distribution?.pullFromServerId,
            }, 'CHILD server starting HLS relay (will notify origin if needed)');

            // Start the stream via StreamLifecycleManager which will detect CHILD role
            // and start HLS relay instead of FFmpeg. It also notifies origin to start if needed.
            try {
              await streamLifecycleManager.startStream(stream.id, {
                sourceUrl: stream.sourceUrl,
                enableFailover: true,
                serverId: currentServerId,
              });
            } catch (error: any) {
              // If it fails because stream is already running elsewhere, that's expected
              // The HLS relay should still work
              if (!error.message?.includes('already running on server')) {
                throw error;
              }
              logger.debug({ streamId: stream.id }, 'Stream already running on origin, HLS relay will fetch from there');
            }
          } else if (isRunningElsewhere && !isChildServer) {
            // Not a CHILD server and stream is running elsewhere - return error
            logger.warn({
              streamId: stream.id,
              runningServerId: streamStatus?.runningServerId,
              currentServerId
            }, 'Stream is running on different server and this is not a CHILD');
            return reply.status(503).send({
              error: 'Stream is running on a different server',
              runningServerId: streamStatus?.runningServerId
            });
          } else {
            // Check if we should start the stream here (ORIGIN or no distribution)
            let shouldStartHere = true;

            if (currentServerId) {
              // Only start if this is the origin (tier 0) or no distribution
              shouldStartHere = !distribution || distribution.tier === 0;
            } else {
              // Main panel - only start if no distribution exists
              const hasDistribution = await prisma.streamServerDistribution.findFirst({
                where: { streamId: stream.id, isActive: true },
              });
              shouldStartHere = !hasDistribution;
            }

            if (shouldStartHere) {
              logger.info({ streamId: stream.id }, 'Starting stream for HLS playback');
              await streamLifecycleManager.startStream(stream.id, {
                sourceUrl: stream.sourceUrl,
                enableFailover: true,
              });
              // waitForPlaylist() in StreamLifecycleManager already ensures segments are ready
            } else {
              // Edge server that's not the ORIGIN - should not start stream here
              logger.warn({ streamId: stream.id, currentServerId }, 'Stream requested on wrong server - it should run on origin');
              return reply.status(503).send({ error: 'Stream is not running on this server, use the correct edge server' });
            }
          }
        }

        // Read the playlist from filesystem
        // If stream was just started, we may need to wait a bit for the first segments
        // For relay streams, we need more time as there's a cascade of servers
        // Check for master.m3u8 (passthrough with var_stream_map) first, then regular playlist.m3u8
        let playlist: string;
        let useMasterPlaylist = false;
        let readAttempts = 0;
        const maxReadAttempts = 100; // 100 * 50ms = 5 seconds max additional wait (faster polling)
        const pollInterval = 50; // 50ms between checks for faster detection
        
        while (readAttempts < maxReadAttempts) {
          try {
            // Try master playlist first (passthrough mode with var_stream_map)
            try {
              const masterContent = await fs.readFile(masterPlaylistPath, 'utf-8');
              // Master playlist should reference variant stream directories
              if (masterContent.includes('stream_')) {
                playlist = masterContent;
                useMasterPlaylist = true;
                break;
              }
            } catch {
              // Master playlist doesn't exist, try regular playlist
            }
            
            // Try regular playlist (transcoding mode or HLS relay)
            const content = await fs.readFile(regularPlaylistPath, 'utf-8');
            // Make sure playlist has at least one segment reference
            // Support both TS segments (.ts) and fMP4 segments (.m4s)
            if (content.includes('.ts') || content.includes('.m4s')) {
              playlist = content;
              break;
            }
            // Playlist exists but no segments yet, wait a bit
            readAttempts++;
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          } catch (error) {
            // Playlist doesn't exist yet, wait a bit
            readAttempts++;
            if (readAttempts >= maxReadAttempts) {
              logger.error({ streamId: stream.id, error }, 'Failed to read HLS playlist after max attempts');
              return reply.status(503).send({ error: 'HLS stream not ready' });
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }
        
        if (!playlist!) {
          logger.error({ streamId: stream.id }, 'Playlist not ready after waiting');
          return reply.status(503).send({ error: 'HLS stream not ready' });
        }

        // Log timing for stream startup performance tracking
        const totalRequestTime = Date.now() - requestStartTime;
        logger.info({
          streamId: stream.id,
          timing: {
            totalMs: totalRequestTime,
            dbQueryMs: dbQueryTime,
            playlistReadMs: readAttempts * pollInterval, // Approximate time waiting for playlist
          },
          wasRunning: streamLifecycleManager.isStreamRunning(stream.id),
          useMasterPlaylist,
        }, 'HLS playlist request completed - timing breakdown');

        // Modify playlist URLs to include auth - use absolute URLs for VLC/mpv compatibility
        const baseUrl = getBaseUrl(request);
        let modifiedPlaylist: string;
        
        if (useMasterPlaylist) {
          // Master playlist: rewrite variant stream URLs
          // Format: stream_0/playlist.m3u8 -> {baseUrl}/hls/{viewerId}/{streamId}/stream_0/playlist.m3u8
          modifiedPlaylist = playlist.replace(
            /stream_(\d+)\/playlist\.m3u8/g,
            `${baseUrl}/hls/${viewerId}/${streamId}/stream_$1/playlist.m3u8`
          );
        } else {
          // Regular playlist: rewrite segment URLs
          // Support both MPEG-TS (.ts) and fMP4 (.m4s + init.mp4) segments
          modifiedPlaylist = playlist
            // Replace .ts segments
            .replace(/segment_(\d+)\.ts/g, `${baseUrl}/hls/${viewerId}/${streamId}/$&`)
            // Replace .m4s segments
            .replace(/segment_(\d+)\.m4s/g, `${baseUrl}/hls/${viewerId}/${streamId}/$&`)
            // Replace init.mp4 in URI attribute (standard EXT-X-MAP format)
            .replace(/URI="init\.mp4"/g, `URI="${baseUrl}/hls/${viewerId}/${streamId}/init.mp4"`)
            // Also match bare init.mp4 references (in case of non-standard format)
            .replace(/^init\.mp4$/gm, `${baseUrl}/hls/${viewerId}/${streamId}/init.mp4`);
        }

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(modifiedPlaylist);
      } else {
        // MPEG-TS streaming
        // Check if source is HLS - if so, redirect to HLS format since MPEG-TS passthrough won't work
        const sourceUrl = stream.sourceUrl.toLowerCase();
        const isHlsSource = sourceUrl.endsWith('.m3u8') || sourceUrl.includes('.m3u8?') || sourceUrl.includes('/hls/');
        
        if (isHlsSource && (profile === 'passthrough' || !stream.transcodeProfile)) {
          // Source is HLS and no transcoding - redirect to HLS format
          const { username, password } = request.params;
          const baseUrl = getBaseUrl(request);
          const hlsUrl = `${baseUrl}/live/${username}/${password}/${streamId}.m3u8`;
          
          logger.info({
            streamId: stream.id,
            sourceUrl: stream.sourceUrl,
            redirectTo: hlsUrl,
          }, 'Redirecting MPEG-TS request to HLS - source is HLS format');
          
          return reply.redirect(hlsUrl, 302);
        }
        
        // Check if main panel should redirect to edge server
        const isMainPanel = await isMainPanelServer();
        
        if (isMainPanel) {
          // Main panel - check if stream has distribution and should be redirected
          const hasDistribution = await prisma.streamServerDistribution.findFirst({
            where: { streamId: stream.id, isActive: true },
          });
          
          if (hasDistribution) {
            // Redirect to edge server for MPEG-TS
            const { username, password } = request.params;
            const clientIp = getClientIp(request);
            
            try {
              const routingDecision = await loadBalancer.routeStream(
                stream.id,
                line.id,
                clientIp,
                ext || 'ts'
              );
              
              // Build redirect URL to edge server
              const targetServer = await prisma.server.findUnique({
                where: { id: routingDecision.serverId },
                select: { domain: true, externalIp: true, httpsPort: true, httpPort: true },
              });
              
              let redirectBaseUrl: string;
              if (targetServer?.domain) {
                redirectBaseUrl = `https://${targetServer.domain}`;
              } else {
                redirectBaseUrl = routingDecision.serverUrl;
              }
              
              // Preserve query string parameters (e.g., device_id)
              const queryString = request.url.includes('?') ? request.url.substring(request.url.indexOf('?')) : '';
              const redirectUrl = `${redirectBaseUrl}/live/${username}/${password}/${streamId}.${ext || 'ts'}${queryString}`;
              
              logger.info({
                streamId: stream.id,
                targetServerId: routingDecision.serverId,
                redirectUrl,
                reason: routingDecision.reason,
                clientIp,
                format: 'mpegts',
              }, 'Main panel redirecting MPEG-TS stream request to edge server');
              
              return reply.redirect(redirectUrl, 302);
            } catch (routeError: any) {
              logger.error({
                streamId: stream.id,
                error: routeError.message,
              }, 'Failed to route MPEG-TS stream to edge server');
              return reply.status(503).send({ 
                error: 'No edge servers available for this stream',
                details: routeError.message,
              });
            }
          }
        }
        
        // Direct stream or transcode to MPEG-TS - use connection tracking
        const connectionId = await registerConnection(
          line.id,
          stream.id,
          getClientIp(request),
          request.headers['user-agent'],
          {
            contentType: ContentType.LIVE,
            contentName: stream.name,
          }
        );

        // Register viewer for MPEG-TS
        await onDemandStreamManager.registerViewer(stream.id, connectionId);

        // Set up periodic viewer refresh for MPEG-TS (every 20 seconds)
        // This keeps the viewer alive in Redis since there's no segment requests like HLS
        // Also refreshes the connection TTL to prevent it from expiring during long streams
        const viewerRefreshInterval = setInterval(() => {
          onDemandStreamManager.refreshViewer(stream.id, connectionId).catch(() => {
            // Ignore errors - connection might be closing
          });
          // Refresh connection TTL to keep it visible in active connections
          refreshConnectionTTL(line.id).catch(() => {
            // Ignore errors
          });
        }, 20000);

        // Handle cleanup on connection close for MPEG-TS
        request.raw.on('close', () => {
          clearInterval(viewerRefreshInterval);
          unregisterConnection(line.id, connectionId);
          onDemandStreamManager.unregisterViewer(stream.id, connectionId);
        });

        if (profile === 'passthrough' || TRANSCODE_PROFILES[profile]?.name === 'passthrough') {
          // Direct proxy
          const proxyStream = await streamProxy.proxyStream(stream.sourceUrl);
          reply.header('Content-Type', 'video/MP2T');
          reply.header('Cache-Control', 'no-cache');
          return reply.send(proxyStream);
        } else {
          // Transcode
          const { stream: transcodeStream } = streamProxy.transcodeStream(
            stream.sourceUrl,
            profile,
            'mpegts'
          );
          reply.header('Content-Type', 'video/MP2T');
          reply.header('Cache-Control', 'no-cache');
          return reply.send(transcodeStream);
        }
      }
    } catch (error) {
      logger.error({ error, streamId }, 'Stream error');
      return reply.status(500).send({ error: 'Stream error' });
    }
  };

  const liveStreamPreHandler = async (request: any, reply: any) => {
    request.query.username = request.params.username;
    request.query.password = request.params.password;
    await authenticateIptvLine(request, reply);
  };

  // Route 1: Xtream Codes format - /live/:username/:password/:streamId.ext
  fastify.get<{ Params: StreamParams; Querystring: AuthQuery }>(
    '/live/:username/:password/:streamId.:ext',
    { preHandler: liveStreamPreHandler },
    handleLiveStream
  );

  // Route 2: Simple format - /:username/:password/:streamId.ext
  fastify.get<{ Params: StreamParams; Querystring: AuthQuery }>(
    '/:username/:password/:streamId.:ext',
    { preHandler: liveStreamPreHandler },
    handleLiveStream
  );

  // Route 3: HLS segments for live streams - /live/:username/:password/:streamId/:segment
  // This serves fMP4 segments (.m4s) and init files (init.mp4) for HLS playback
  fastify.get<{ Params: { username: string; password: string; streamId: string; segment: string } }>(
    '/live/:username/:password/:streamId/:segment',
    { preHandler: liveStreamPreHandler },
    async (request, reply) => {
      const { streamId, segment } = request.params;

      const segmentPath = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`, segment);

      try {
        const segmentData = await fs.readFile(segmentPath);

        // Set correct Content-Type based on file extension
        let contentType = 'video/MP2T';
        if (segment.endsWith('.m4s') || segment.endsWith('.mp4')) {
          contentType = 'video/mp4';
        }

        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'public, max-age=3600');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(segmentData);
      } catch (error) {
        return reply.status(404).send({ error: 'Segment not found' });
      }
    }
  );

  // HLS segment endpoint - /hls/:token/:streamId/:segment
  fastify.get<{ Params: HLSSegmentParams }>(
    '/hls/:token/:streamId/:segment',
    async (request, reply) => {
      const { token, streamId, segment } = request.params;

      // Token is the viewerId - refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        // Also refresh HLS user connection TTL
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors - viewer might be for always-on stream
      }
      
      try {
        // Read segment directly from filesystem
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
        const segmentPath = path.join(hlsDir, segment);

        try {
          const segmentData = await fs.readFile(segmentPath);
          
          // Set correct Content-Type based on file extension
          let contentType = 'video/MP2T';
          if (segment.endsWith('.m4s') || segment.endsWith('.mp4')) {
            contentType = 'video/mp4';
          }
          
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'max-age=60');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(segmentData);
        } catch (error) {
          // Segment not found
          return reply.status(404).send({ error: 'Segment not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, segment }, 'HLS segment error');
        return reply.status(500).send({ error: 'Segment error' });
      }
    }
  );

  // HLS variant playlist endpoint for passthrough streams - /hls/:token/:streamId/stream_:variant/playlist.m3u8
  // This serves the variant playlists referenced by master.m3u8 in passthrough mode
  fastify.get<{ Params: { token: string; streamId: string; variant: string } }>(
    '/hls/:token/:streamId/stream_:variant/playlist.m3u8',
    async (request, reply) => {
      const { token, streamId, variant } = request.params;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
        const variantPlaylistPath = path.join(hlsDir, `stream_${variant}`, 'playlist.m3u8');

        try {
          let playlist = await fs.readFile(variantPlaylistPath, 'utf-8');
          
          // Get server base URL for absolute URLs
          const baseUrl = getBaseUrl(request);

          // Modify segment URLs to include full absolute path
          // Support both TS segments (.ts) and fMP4 segments (.m4s + init.mp4)
          playlist = playlist
            .replace(
              /segment_(\d+)\.ts/g,
              `${baseUrl}/hls/${token}/${streamId}/stream_${variant}/$&`
            )
            .replace(
              /segment_(\d+)\.m4s/g,
              `${baseUrl}/hls/${token}/${streamId}/stream_${variant}/$&`
            )
            // Match init.mp4 in URI attribute (standard EXT-X-MAP format)
            .replace(
              /URI="init\.mp4"/g,
              `URI="${baseUrl}/hls/${token}/${streamId}/stream_${variant}/init.mp4"`
            )
            // Also match bare init.mp4 references
            .replace(
              /^init\.mp4$/gm,
              `${baseUrl}/hls/${token}/${streamId}/stream_${variant}/init.mp4`
            );

          reply.header('Content-Type', 'application/vnd.apple.mpegurl');
          reply.header('Cache-Control', 'no-cache');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(playlist);
        } catch (error) {
          return reply.status(404).send({ error: 'Variant playlist not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, variant }, 'HLS variant playlist error');
        return reply.status(500).send({ error: 'Playlist error' });
      }
    }
  );

  // HLS variant segment endpoint for passthrough streams - /hls/:token/:streamId/stream_:variant/:segment
  // This serves segments from variant stream directories
  fastify.get<{ Params: { token: string; streamId: string; variant: string; segment: string } }>(
    '/hls/:token/:streamId/stream_:variant/:segment',
    async (request, reply) => {
      const { token, streamId, variant, segment } = request.params;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }
      
      try {
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
        const segmentPath = path.join(hlsDir, `stream_${variant}`, segment);

        try {
          const segmentData = await fs.readFile(segmentPath);
          
          // Set correct Content-Type based on file extension
          let contentType = 'video/MP2T';
          if (segment.endsWith('.m4s') || segment.endsWith('.mp4')) {
            contentType = 'video/mp4';
          }
          
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'max-age=60');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(segmentData);
        } catch (error) {
          return reply.status(404).send({ error: 'Segment not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, variant, segment }, 'HLS variant segment error');
        return reply.status(500).send({ error: 'Segment error' });
      }
    }
  );

  // ABR HLS variant playlist endpoint - /hls-abr/:token/:streamId/stream_:variant/playlist.m3u8
  fastify.get<{ Params: { token: string; streamId: string; variant: string } }>(
    '/hls-abr/:token/:streamId/stream_:variant/playlist.m3u8',
    async (request, reply) => {
      const { token, streamId, variant } = request.params;

      // Refresh ABR viewer heartbeat and user connection
      try {
        await abrStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
        const variantPlaylistPath = path.join(hlsDir, `stream_${variant}`, 'playlist.m3u8');

        try {
          let playlist = await fs.readFile(variantPlaylistPath, 'utf-8');
          
          // Get server base URL for absolute URLs (important for external access)
          const baseUrl = getBaseUrl(request);

          // Modify segment URLs to include full absolute path
          playlist = playlist.replace(
            /segment_(\d+)\.ts/g,
            `${baseUrl}/hls-abr/${token}/${streamId}/stream_${variant}/$&`
          );

          reply.header('Content-Type', 'application/vnd.apple.mpegurl');
          reply.header('Cache-Control', 'no-cache');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(playlist);
        } catch (error) {
          logger.error({ streamId, variant, error }, 'Failed to read ABR variant playlist');
          return reply.status(404).send({ error: 'Variant playlist not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, variant }, 'ABR variant playlist error');
        return reply.status(500).send({ error: 'Playlist error' });
      }
    }
  );

  // ABR HLS segment endpoint - /hls-abr/:token/:streamId/stream_:variant/:segment
  fastify.get<{ Params: { token: string; streamId: string; variant: string; segment: string } }>(
    '/hls-abr/:token/:streamId/stream_:variant/:segment',
    async (request, reply) => {
      const { token, streamId, variant, segment } = request.params;

      // Refresh ABR viewer heartbeat and user connection
      try {
        await abrStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const hlsDir = path.join(config.ffmpeg.hlsSegmentPath, `stream_${streamId}`);
        const segmentPath = path.join(hlsDir, `stream_${variant}`, segment);

        try {
          const segmentData = await fs.readFile(segmentPath);
          
          // Set correct Content-Type based on file extension
          let contentType = 'video/MP2T';
          if (segment.endsWith('.m4s') || segment.endsWith('.mp4')) {
            contentType = 'video/mp4';
          }
          
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'max-age=60');
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(segmentData);
        } catch (error) {
          return reply.status(404).send({ error: 'ABR segment not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, variant, segment }, 'ABR HLS segment error');
        return reply.status(500).send({ error: 'Segment error' });
      }
    }
  );

  // ==================== HLS PASSTHROUGH ROUTES ====================
  // These routes handle multi-bitrate HLS passthrough streaming
  // allowing all source quality variants to be preserved

  // HLS Passthrough variant playlist endpoint
  // /hls-passthrough/:token/:streamId/variant/:variantIndex/playlist.m3u8
  fastify.get<{ Params: { token: string; streamId: string; variantIndex: string } }>(
    '/hls-passthrough/:token/:streamId/variant/:variantIndex/playlist.m3u8',
    async (request, reply) => {
      const { token, streamId, variantIndex } = request.params;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors - viewer might be for always-on stream
      }

      try {
        // Get stream to fetch custom user agent and source URL
        const stream = await prisma.stream.findUnique({
          where: { id: parseInt(streamId) },
          select: { customUserAgent: true, sourceUrl: true },
        });

        // Get server base URL
        const serverBaseUrl = getBaseUrl(request);

        const playlist = await hlsPassthroughManager.fetchAndRewriteVariantPlaylist(
          parseInt(streamId),
          parseInt(variantIndex),
          token,
          serverBaseUrl,
          stream?.customUserAgent || undefined,
          stream?.sourceUrl || undefined
        );

        if (!playlist) {
          return reply.status(404).send({ error: 'Variant playlist not found' });
        }

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(playlist);
      } catch (error) {
        logger.error({ error, streamId, variantIndex }, 'HLS passthrough variant playlist error');
        return reply.status(500).send({ error: 'Playlist error' });
      }
    }
  );

  // HLS Passthrough segment proxy endpoint
  // /hls-passthrough/:token/:streamId/variant/:variantIndex/segment?url=<encoded-url>
  fastify.get<{ 
    Params: { token: string; streamId: string; variantIndex: string }; 
    Querystring: { url: string } 
  }>(
    '/hls-passthrough/:token/:streamId/variant/:variantIndex/segment',
    async (request, reply) => {
      const { token, streamId, variantIndex } = request.params;
      const { url: encodedUrl } = request.query;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      if (!encodedUrl) {
        return reply.status(400).send({ error: 'Missing segment URL' });
      }

      try {
        const segmentUrl = decodeURIComponent(encodedUrl);

        // Get stream to fetch custom user agent
        const stream = await prisma.stream.findUnique({
          where: { id: parseInt(streamId) },
          select: { customUserAgent: true },
        });

        const segmentData = await hlsPassthroughManager.proxySegment(
          segmentUrl,
          stream?.customUserAgent || undefined
        );

        if (!segmentData) {
          return reply.status(404).send({ error: 'Segment not found' });
        }

        // Detect segment type from URL
        let contentType = 'video/MP2T';
        if (segmentUrl.endsWith('.m4s') || segmentUrl.endsWith('.mp4')) {
          contentType = 'video/mp4';
        }

        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'max-age=60');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(segmentData);
      } catch (error) {
        logger.error({ error, streamId, variantIndex }, 'HLS passthrough segment error');
        return reply.status(500).send({ error: 'Segment error' });
      }
    }
  );

  // HLS Passthrough audio playlist endpoint
  // /hls-passthrough/:token/:streamId/audio/:audioIndex/playlist.m3u8
  fastify.get<{ Params: { token: string; streamId: string; audioIndex: string } }>(
    '/hls-passthrough/:token/:streamId/audio/:audioIndex/playlist.m3u8',
    async (request, reply) => {
      const { token, streamId, audioIndex } = request.params;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors - viewer might be for always-on stream
      }

      try {
        // Get stream to fetch custom user agent
        const stream = await prisma.stream.findUnique({
          where: { id: parseInt(streamId) },
          select: { customUserAgent: true, sourceUrl: true },
        });

        // Get server base URL
        const serverBaseUrl = getBaseUrl(request);

        const playlist = await hlsPassthroughManager.fetchAndRewriteAudioPlaylist(
          parseInt(streamId),
          parseInt(audioIndex),
          token,
          serverBaseUrl,
          stream?.customUserAgent || undefined,
          stream?.sourceUrl || undefined
        );

        if (!playlist) {
          return reply.status(404).send({ error: 'Audio playlist not found' });
        }

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(playlist);
      } catch (error) {
        logger.error({ error, streamId, audioIndex }, 'HLS passthrough audio playlist error');
        return reply.status(500).send({ error: 'Audio playlist error' });
      }
    }
  );

  // HLS Passthrough audio segment proxy endpoint
  // /hls-passthrough/:token/:streamId/audio/:audioIndex/segment?url=<encoded-url>
  fastify.get<{ 
    Params: { token: string; streamId: string; audioIndex: string }; 
    Querystring: { url: string } 
  }>(
    '/hls-passthrough/:token/:streamId/audio/:audioIndex/segment',
    async (request, reply) => {
      const { token, streamId, audioIndex } = request.params;
      const { url: encodedUrl } = request.query;

      // Refresh viewer heartbeat and user connection
      try {
        await onDemandStreamManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      if (!encodedUrl) {
        return reply.status(400).send({ error: 'Missing segment URL' });
      }

      try {
        const segmentUrl = decodeURIComponent(encodedUrl);

        // Get stream to fetch custom user agent
        const stream = await prisma.stream.findUnique({
          where: { id: parseInt(streamId) },
          select: { customUserAgent: true },
        });

        const segmentData = await hlsPassthroughManager.proxySegment(
          segmentUrl,
          stream?.customUserAgent || undefined
        );

        if (!segmentData) {
          return reply.status(404).send({ error: 'Audio segment not found' });
        }

        // Audio segments are typically AAC in TS or M4S containers
        let contentType = 'audio/aac';
        if (segmentUrl.endsWith('.ts')) {
          contentType = 'video/MP2T';
        } else if (segmentUrl.endsWith('.m4s') || segmentUrl.endsWith('.m4a')) {
          contentType = 'audio/mp4';
        }

        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'max-age=60');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(segmentData);
      } catch (error) {
        logger.error({ error, streamId, audioIndex }, 'HLS passthrough audio segment error');
        return reply.status(500).send({ error: 'Audio segment error' });
      }
    }
  );

  // VOD stream endpoint: /movie/:username/:password/:vodId.ext
  fastify.get<{ Params: StreamParams; Querystring: AuthQuery }>(
    '/movie/:username/:password/:streamId.:ext',
    {
      preHandler: async (request, reply) => {
        request.query.username = request.params.username;
        request.query.password = request.params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { streamId, ext } = request.params;
      // Access line through request.line (or request.user for backwards compatibility)
      const line = (request.line || request.user)!;

      try {
        const stream = await prisma.stream.findUnique({
          where: {
            id: parseInt(streamId),
            streamType: StreamType.VOD,
            isActive: true,
          },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'VOD not found' });
        }

        // HEALTH CHECK: For remote VOD sources, verify they're accessible
        // Skip for local files (they'll fail with file-not-found instead)
        if (stream.sourceUrl.startsWith('http://') || stream.sourceUrl.startsWith('https://')) {
          const healthCheck = await checkStreamSourceHealth(
            stream.id,
            stream.sourceUrl,
            stream.customUserAgent
          );
          
          if (!healthCheck.healthy) {
            logger.warn(
              { streamId: stream.id, streamName: stream.name, error: healthCheck.error },
              'VOD source unavailable - not registering connection'
            );
            return reply.status(503).send({
              error: 'VOD source unavailable',
              message: 'The movie source is currently not responding. Please try again later.',
              details: healthCheck.error,
            });
          }
        }

        // Check access - admins can access all streams
        const isAdmin = line.owner?.role === 'ADMIN';
        if (!isAdmin) {
          const bouquetIds = line.bouquets.map((b: BouquetItem) => b.bouquet.id);
          if (bouquetIds.length > 0) {
            const hasAccess = await prisma.bouquetStream.findFirst({
              where: {
                streamId: stream.id,
                bouquetId: { in: bouquetIds },
              },
            });

            if (!hasAccess) {
              return reply.status(403).send({ error: 'Access denied' });
            }
          }
        }

        // Handle HLS request - convert VOD to HLS
        if (ext === 'm3u8') {
          // Check if source file is local or needs to be downloaded
          let sourcePath = stream.sourceUrl;
          
          // Resolve various URL/path formats to absolute file paths
          // Priority: check if path exists as-is first, then try configured media paths
          if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
            // Remote URL - will be handled by FFmpeg directly
            // No transformation needed
          } else if (sourcePath.startsWith('/') && existsSync(sourcePath)) {
            // Absolute path that exists - use as is (e.g., /media/movies/file.mp4)
          } else if (sourcePath.startsWith('/api-proxy/media/') || sourcePath.startsWith('/media/')) {
            // Media URL path - resolve to configured media folder
            const filename = sourcePath.replace('/api-proxy/media/', '').replace('/media/', '');
            // Try movies path first, then general media path
            const moviesPath = path.join(config.media.moviesPath, decodeURIComponent(filename));
            const mediaPath = path.join(config.media.path, decodeURIComponent(filename));
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            } else {
              sourcePath = moviesPath; // Default to movies path
            }
          } else if (sourcePath.startsWith('/')) {
            // Absolute path that doesn't exist - error
            logger.error({ streamId, sourcePath }, 'VOD source file not found');
            return reply.status(404).send({ error: 'Source file not found' });
          } else {
            // Relative path - resolve to configured media folders
            const moviesPath = path.join(config.media.moviesPath, sourcePath);
            const mediaPath = path.join(config.media.path, sourcePath);
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            } else {
              sourcePath = moviesPath; // Default to movies path
            }
          }
          
          logger.info({ streamId, originalUrl: stream.sourceUrl, resolvedPath: sourcePath }, 'Resolved VOD source path');
          
          const needsConversion = vodToHlsService.needsConversion(sourcePath);
          logger.info({ streamId, sourcePath, needsConversion }, 'VOD needsConversion check');
          
          // For local files, check if it needs conversion
          if (needsConversion) {
            // Start or get existing conversion
            const job = vodToHlsService.getOrStartConversion(parseInt(streamId), sourcePath);
            logger.info({ streamId, jobStatus: job.status, segmentsReady: job.segmentsReady }, 'VOD conversion job status');
            
            if (job.status === 'error') {
              logger.error({ streamId, error: job.error }, 'VOD HLS conversion failed');
              return reply.status(500).send({ error: 'Conversion failed: ' + job.error });
            }
            
            // Wait for minimum segments if converting
            if (job.status === 'converting') {
              logger.info({ streamId, segmentsReady: job.segmentsReady }, 'Waiting for HLS segments');
              const ready = await vodToHlsService.waitForMinimumSegments(parseInt(streamId), 3, 30000);
              
              if (!ready) {
                return reply.status(503).send({ error: 'HLS stream not ready yet, please retry' });
              }
            }
            
            // Generate stable viewer ID for this VOD viewing session
            // Uses line+stream+IP+user-agent to prevent playlist refreshes from creating duplicates
            // Note: Multiple players from same client share the same viewer ID (HLS limitation)
            const viewerId = generateStableViewerId(
              line.id,
              parseInt(streamId),
              getClientIp(request),
              request.headers['user-agent'] as string
            );
            
            // Register VOD viewer (refreshes TTL if already registered)
            await vodViewerManager.registerViewer(parseInt(streamId), viewerId);
            
            // Register HLS connection for line connection tracking with VOD content info
            await registerHlsConnection(
              line.id,
              parseInt(streamId),
              viewerId,
              getClientIp(request),
              request.headers['user-agent'] as string,
              {
                contentType: ContentType.VOD,
                contentName: stream.name,
              }
            );
            
            // Check for subtitles and audio tracks from extraction
            const subtitles = vodToHlsService.getExtractedSubtitles(parseInt(streamId));
            const audioTracks = vodToHlsService.getAudioTracks(parseInt(streamId));
            
            // Read FFmpeg-generated master.m3u8 which contains audio tracks with variant stream map
            try {
              const masterPlaylistPath = vodToHlsService.getPlaylistPath(parseInt(streamId));
              let masterPlaylist = await fs.readFile(masterPlaylistPath, 'utf-8');
              
              // Check if master playlist has audio tracks
              const hasAudioTracksInPlaylist = masterPlaylist.includes('#EXT-X-MEDIA:TYPE=AUDIO');
              logger.info({ streamId, hasAudioTracksInPlaylist, audioTracksCount: audioTracks.length }, 'Master playlist audio track check');
              
              // Normalize audio group ID from "group_audio" to "audio" for HLS.js compatibility
              // Also fix DEFAULT flags (only first track should be DEFAULT=YES)
              if (hasAudioTracksInPlaylist && audioTracks.length > 0) {
                // Replace GROUP-ID="group_audio" with GROUP-ID="audio"
                masterPlaylist = masterPlaylist.replace(/GROUP-ID="group_audio"/g, 'GROUP-ID="audio"');
                // Replace AUDIO="group_audio" with AUDIO="audio"
                masterPlaylist = masterPlaylist.replace(/AUDIO="group_audio"/g, 'AUDIO="audio"');
                
                // Fix DEFAULT flags - only first track should be DEFAULT=YES
                let defaultFixed = false;
                masterPlaylist = masterPlaylist.replace(/#EXT-X-MEDIA:TYPE=AUDIO([^\n]*),DEFAULT=YES([^\n]*)\n/g, (match, before, after) => {
                  if (!defaultFixed) {
                    defaultFixed = true;
                    return match; // Keep first DEFAULT=YES
                  }
                  // Replace subsequent DEFAULT=YES with DEFAULT=NO
                  return `#EXT-X-MEDIA:TYPE=AUDIO${before},DEFAULT=NO${after}\n`;
                });
                
                logger.info({ streamId }, 'Normalized audio group ID and DEFAULT flags in master playlist');
              }
              
              // If FFmpeg didn't generate audio tracks but we have probed audio tracks, add them manually
              if (!hasAudioTracksInPlaylist && audioTracks.length > 0) {
                logger.warn({ streamId }, 'Master playlist missing audio tracks, adding them manually');
                
                // Build audio track EXT-X-MEDIA tags
                let audioMediaTags = '';
                for (let i = 0; i < audioTracks.length; i++) {
                  const track = audioTracks[i];
                  const langName = getLanguageName(track.language);
                  const isDefault = i === 0 || track.isDefault ? 'YES' : 'NO';
                  const trackName = track.title || langName || `Audio ${i + 1}`;
                  audioMediaTags += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${trackName}",LANGUAGE="${track.language}",DEFAULT=${isDefault},AUTOSELECT=YES,URI="/vod-hls/${viewerId}/${streamId}/stream_a${i}/index.m3u8"\n`;
                }
                
                // Insert audio tags before the first #EXT-X-STREAM-INF
                masterPlaylist = masterPlaylist.replace(
                  /#EXT-X-STREAM-INF/,
                  audioMediaTags + '#EXT-X-STREAM-INF'
                );
                
                // Add AUDIO="audio" to all EXT-X-STREAM-INF that don't already have it
                masterPlaylist = masterPlaylist.replace(
                  /#EXT-X-STREAM-INF:([^\n]+?)(?!AUDIO)(\n)/g,
                  (match, attrs, newline) => {
                    if (attrs.includes('AUDIO=')) return match;
                    return `#EXT-X-STREAM-INF:${attrs},AUDIO="audio"${newline}`;
                  }
                );
              }
              
              // Rewrite all stream URLs to go through our proxy
              const baseUrl = getBaseUrl(request);
              masterPlaylist = masterPlaylist
                // Rewrite stream_v0/index.m3u8 -> /vod-hls/viewerId/streamId/stream_v0/index.m3u8
                .replace(/stream_([^\/]+)\/index\.m3u8/g, `/vod-hls/${viewerId}/${streamId}/stream_$1/index.m3u8`)
                // Rewrite audio track URIs in EXT-X-MEDIA
                .replace(/URI="stream_([^"]+)\/index\.m3u8"/g, `URI="/vod-hls/${viewerId}/${streamId}/stream_$1/index.m3u8"`)
                // For legacy playlists that contain direct segment references (not variant streams):
                // Rewrite segment files (.ts and .m4s)
                .replace(/segment_(\d+)\.ts/g, `${baseUrl}/vod-hls/${viewerId}/${streamId}/$&`)
                .replace(/segment_(\d+)\.m4s/g, `${baseUrl}/vod-hls/${viewerId}/${streamId}/$&`)
                // Rewrite init.mp4 in URI attribute
                .replace(/URI="init\.mp4"/g, `URI="${baseUrl}/vod-hls/${viewerId}/${streamId}/init.mp4"`);
              
              // If we have subtitles, add them to the manifest
              if (subtitles.length > 0) {
                // Insert subtitle EXT-X-MEDIA tags after the audio EXT-X-MEDIA tags
                let subtitleTags = '';
                for (let i = 0; i < subtitles.length; i++) {
                  const sub = subtitles[i];
                  const langName = getLanguageName(sub.language);
                  const isDefault = i === 0 || sub.isDefault ? 'YES' : 'NO';
                  subtitleTags += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${sub.language}",NAME="${langName}",DEFAULT=${isDefault},AUTOSELECT=YES,FORCED=${sub.isForced ? 'YES' : 'NO'},URI="/vod-hls/${viewerId}/${streamId}/subs_${sub.index}.m3u8"\n`;
                }
                
                // Insert subtitle tags before the first #EXT-X-STREAM-INF
                masterPlaylist = masterPlaylist.replace(
                  /#EXT-X-STREAM-INF/,
                  subtitleTags + '#EXT-X-STREAM-INF'
                );
                
                // Add SUBTITLES="subs" to all EXT-X-STREAM-INF that don't already have it
                masterPlaylist = masterPlaylist.replace(
                  /#EXT-X-STREAM-INF:([^\n]+?)(?!SUBTITLES)(\n)/g,
                  (match, attrs, newline) => {
                    if (attrs.includes('SUBTITLES=')) return match;
                    return `#EXT-X-STREAM-INF:${attrs},SUBTITLES="subs"${newline}`;
                  }
                );
              }
              
              logger.info({ streamId, audioTracks: audioTracks.length, subtitleCount: subtitles.length }, 'Serving master playlist with audio tracks and subtitles');
              
              reply.header('Content-Type', 'application/vnd.apple.mpegurl');
              reply.header('Cache-Control', 'no-cache');
              reply.header('Access-Control-Allow-Origin', '*');
              reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
              reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
              return reply.send(masterPlaylist);
            } catch (masterError) {
              // Fallback: master.m3u8 doesn't exist, use old method with media.m3u8
              logger.warn({ streamId, error: masterError }, 'master.m3u8 not found, falling back to simple playlist');
              
              // Create a proper master playlist with subtitle tracks for better player compatibility
              if (subtitles.length > 0) {
                // Build master playlist with subtitle tracks
                let masterPlaylist = '#EXTM3U\n#EXT-X-VERSION:7\n';
                
                // Add subtitle media tags
                for (let i = 0; i < subtitles.length; i++) {
                  const sub = subtitles[i];
                  const langName = getLanguageName(sub.language);
                  const isDefault = i === 0 || sub.isDefault ? 'YES' : 'NO';
                  masterPlaylist += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${sub.language}",NAME="${langName}",DEFAULT=${isDefault},AUTOSELECT=YES,FORCED=${sub.isForced ? 'YES' : 'NO'},URI="/vod-hls/${viewerId}/${streamId}/subs_${sub.index}.m3u8"\n`;
                }
                
                masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=5000000,SUBTITLES="subs"\n`;
                masterPlaylist += `/vod-hls/${viewerId}/${streamId}/media.m3u8\n`;
                
                reply.header('Content-Type', 'application/vnd.apple.mpegurl');
                reply.header('Cache-Control', 'no-cache');
                reply.header('Access-Control-Allow-Origin', '*');
                reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
                reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
                return reply.send(masterPlaylist);
              }
              
              // No subtitles - serve media playlist directly
              try {
                const playlistPath = vodToHlsService.getPlaylistPath(parseInt(streamId));
                let playlist = await fs.readFile(playlistPath, 'utf-8');

                // Rewrite segment URLs
                const baseUrl = getBaseUrl(request);
                playlist = playlist
                  .replace(/segment_(\d+)\.ts/g, `${baseUrl}/vod-hls/${viewerId}/${streamId}/$&`)
                  .replace(/segment_(\d+)\.m4s/g, `${baseUrl}/vod-hls/${viewerId}/${streamId}/$&`)
                  // Match init.mp4 in URI attribute (standard EXT-X-MAP format)
                  .replace(/URI="init\.mp4"/g, `URI="${baseUrl}/vod-hls/${viewerId}/${streamId}/init.mp4"`)
                  // Also match bare init.mp4 references (in case of non-standard format)
                  .replace(/^init\.mp4$/gm, `${baseUrl}/vod-hls/${viewerId}/${streamId}/init.mp4`);
                
                reply.header('Content-Type', 'application/vnd.apple.mpegurl');
                reply.header('Cache-Control', 'no-cache');
                reply.header('Access-Control-Allow-Origin', '*');
                reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
                reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
                return reply.send(playlist);
              } catch (error) {
                logger.error({ streamId, error }, 'Failed to read VOD HLS playlist');
                return reply.status(503).send({ error: 'HLS stream not ready' });
              }
            }
          } else {
            // Source is already HLS, proxy it
            const proxyStream = await streamProxy.proxyStream(sourcePath);
            reply.header('Content-Type', 'application/vnd.apple.mpegurl');
            reply.header('Cache-Control', 'no-cache');
            return reply.send(proxyStream);
          }
        }

        // Non-HLS request (MP4/MKV) - direct file streaming with HTTP range support
        // Resolve the source path (same logic as HLS)
        let sourcePath = stream.sourceUrl;
        
        if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
          // Remote URL - proxy it with connection tracking
          const connectionId = await registerConnection(
            line.id,
            stream.id,
            getClientIp(request),
            request.headers['user-agent'],
            {
              contentType: ContentType.VOD,
              contentName: stream.name,
            }
          );

          // Set up periodic TTL refresh for long-running VOD streams
          const ttlRefreshInterval = setInterval(() => {
            refreshConnectionTTL(line.id).catch(() => {});
          }, 20000);

          request.raw.on('close', () => {
            clearInterval(ttlRefreshInterval);
            unregisterConnection(line.id, connectionId);
          });

          const proxyStream = await streamProxy.proxyStream(stream.sourceUrl);
          const contentType = getContentType(stream.containerExtension || ext || 'mp4');
          reply.header('Content-Type', contentType);
          return reply.send(proxyStream);
        }
        
        // Resolve local file path
        if (!sourcePath.startsWith('/') || !existsSync(sourcePath)) {
          if (sourcePath.startsWith('/api-proxy/media/') || sourcePath.startsWith('/media/')) {
            const filename = sourcePath.replace('/api-proxy/media/', '').replace('/media/', '');
            const moviesPath = path.join(config.media.moviesPath, decodeURIComponent(filename));
            const mediaPath = path.join(config.media.path, decodeURIComponent(filename));
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            }
          } else if (!sourcePath.startsWith('/')) {
            const moviesPath = path.join(config.media.moviesPath, sourcePath);
            const mediaPath = path.join(config.media.path, sourcePath);
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            }
          }
        }
        
        // Check file exists
        if (!existsSync(sourcePath)) {
          logger.error({ streamId, sourcePath }, 'VOD file not found for direct streaming');
          return reply.status(404).send({ error: 'File not found' });
        }
        
        // Get file stats for range support
        const stat = await fs.stat(sourcePath);
        const fileSize = stat.size;
        const range = request.headers.range;
        
        // Register connection with VOD content info
        const connectionId = await registerConnection(
          line.id,
          stream.id,
          getClientIp(request),
          request.headers['user-agent'],
          {
            contentType: ContentType.VOD,
            contentName: stream.name,
          }
        );

        // Set up periodic TTL refresh for long-running VOD streams
        const ttlRefreshInterval = setInterval(() => {
          refreshConnectionTTL(line.id).catch(() => {});
        }, 20000);

        request.raw.on('close', () => {
          clearInterval(ttlRefreshInterval);
          unregisterConnection(line.id, connectionId);
        });

        // Set appropriate content type based on extension
        const contentType = getContentType(ext || stream.containerExtension || 'mp4');
        
        if (range) {
          // Parse range header (e.g., "bytes=0-1023" or "bytes=1024-")
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          
          logger.debug({ streamId, start, end, chunkSize, fileSize }, 'VOD range request');
          
          const fileStream = createReadStream(sourcePath, { start, end });
          
          reply.code(206);
          reply.header('Content-Type', contentType);
          reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Length', chunkSize);
          reply.header('Cache-Control', 'public, max-age=3600');
          
          return reply.send(fileStream);
        } else {
          // No range - send entire file
          const fileStream = createReadStream(sourcePath);
          
          reply.header('Content-Type', contentType);
          reply.header('Content-Length', fileSize);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Cache-Control', 'public, max-age=3600');
          
          return reply.send(fileStream);
        }
      } catch (error) {
        logger.error({ error, streamId }, 'VOD stream error');
        return reply.status(500).send({ error: 'Stream error' });
      }
    }
  );

  // Admin preview endpoint for VOD: /admin-preview/vod/:streamId.:ext
  // Requires X-API-Key header for authentication
  fastify.get<{ Params: { streamId: string; ext: string } }>(
    '/admin-preview/vod/:streamId.:ext',
    {
      preHandler: async (request, reply) => {
        const apiKey = request.headers['x-api-key'];
        if (!apiKey) {
          return reply.status(401).send({ error: 'API key required' });
        }
        // For admin preview, we just verify an API key exists
        // Full admin auth is handled by the frontend
      },
    },
    async (request, reply) => {
      const { streamId, ext } = request.params;

      try {
        const stream = await prisma.stream.findUnique({
          where: {
            id: parseInt(streamId),
            streamType: StreamType.VOD,
          },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'VOD not found' });
        }

        // Handle HLS request
        if (ext === 'm3u8') {
          let sourcePath = stream.sourceUrl;
          
          // Resolve source path - use configured media paths
          if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
            // Remote URL - no transformation
          } else if (sourcePath.startsWith('/') && existsSync(sourcePath)) {
            // Absolute path that exists - use as is
          } else if (sourcePath.startsWith('/api-proxy/media/') || sourcePath.startsWith('/media/')) {
            const filename = sourcePath.replace('/api-proxy/media/', '').replace('/media/', '');
            const moviesPath = path.join(config.media.moviesPath, decodeURIComponent(filename));
            const mediaPath = path.join(config.media.path, decodeURIComponent(filename));
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            } else {
              sourcePath = moviesPath;
            }
          } else if (sourcePath.startsWith('/')) {
            // Absolute path that doesn't exist
            logger.error({ streamId, sourcePath }, 'Admin preview - VOD source file not found');
            return reply.status(404).send({ error: 'Source file not found' });
          } else {
            // Relative path - resolve to configured media folders
            const moviesPath = path.join(config.media.moviesPath, sourcePath);
            const mediaPath = path.join(config.media.path, sourcePath);
            if (existsSync(moviesPath)) {
              sourcePath = moviesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            } else {
              sourcePath = moviesPath;
            }
          }
          
          logger.info({ streamId, resolvedPath: sourcePath }, 'Admin preview - resolved VOD source path');
          
          if (vodToHlsService.needsConversion(sourcePath)) {
            const job = vodToHlsService.getOrStartConversion(parseInt(streamId), sourcePath);
            
            if (job.status === 'error') {
              return reply.status(500).send({ error: 'Conversion failed: ' + job.error });
            }
            
            if (job.status === 'converting') {
              const ready = await vodToHlsService.waitForMinimumSegments(parseInt(streamId), 3, 30000);
              if (!ready) {
                return reply.status(503).send({ error: 'HLS stream not ready yet, please retry' });
              }
            }
            
            // Generate admin viewer ID
            const viewerId = `admin-${Date.now()}`;
            
            // Get subtitles from database
            const subtitles = await prisma.subtitle.findMany({
              where: { streamId: parseInt(streamId) },
              orderBy: [{ isDefault: 'desc' }, { language: 'asc' }],
            });
            
            // Generate master playlist with subtitles
            let masterPlaylist = '#EXTM3U\n';
            masterPlaylist += '#EXT-X-VERSION:7\n';
            
            if (subtitles.length > 0) {
              for (let i = 0; i < subtitles.length; i++) {
                const sub = subtitles[i];
                const langName = getLanguageName(sub.language);
                const isDefault = i === 0 || sub.isDefault ? 'YES' : 'NO';
                masterPlaylist += `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",LANGUAGE="${sub.language}",NAME="${langName}",DEFAULT=${isDefault},AUTOSELECT=YES,FORCED=${sub.isForced ? 'YES' : 'NO'},URI="/vod-hls/${viewerId}/${streamId}/subs_${sub.id}.m3u8"\n`;
              }
              masterPlaylist += `#EXT-X-STREAM-INF:BANDWIDTH=5000000,SUBTITLES="subs"\n`;
              masterPlaylist += `/vod-hls/${viewerId}/${streamId}/media.m3u8\n`;
            } else {
              masterPlaylist += '#EXT-X-STREAM-INF:BANDWIDTH=5000000\n';
              masterPlaylist += `/vod-hls/${viewerId}/${streamId}/media.m3u8\n`;
            }
            
            reply.header('Content-Type', 'application/vnd.apple.mpegurl');
            reply.header('Cache-Control', 'no-cache');
            reply.header('Access-Control-Allow-Origin', '*');
            return reply.send(masterPlaylist);
          }
          
          // Source is already HLS - redirect
          reply.header('Content-Type', 'application/vnd.apple.mpegurl');
          reply.header('Cache-Control', 'no-cache');
          reply.header('Access-Control-Allow-Origin', '*');
          return reply.redirect(sourcePath);
        }

        // Non-HLS - proxy directly
        const proxyStream = await streamProxy.proxyStream(stream.sourceUrl);
        const contentType = getContentType(stream.containerExtension || ext || 'mp4');
        reply.header('Content-Type', contentType);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(proxyStream);
      } catch (error) {
        logger.error({ error, streamId }, 'Admin VOD preview error');
        return reply.status(500).send({ error: 'Stream error' });
      }
    }
  );

  // VOD HLS media playlist endpoint - /vod-hls/:token/:streamId/media.m3u8
  // This is referenced by the master playlist when subtitles are available
  fastify.get<{ Params: { token: string; streamId: string } }>(
    '/vod-hls/:token/:streamId/media.m3u8',
    async (request, reply) => {
      const { token, streamId } = request.params;

      // Refresh VOD viewer heartbeat and user connection on playlist request
      try {
        await vodViewerManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const playlistPath = vodToHlsService.getPlaylistPath(parseInt(streamId));
        let playlist = await fs.readFile(playlistPath, 'utf-8');

        // Rewrite segment URLs to go through our proxy - use absolute URLs for VLC/mpv compatibility
        // Support both MPEG-TS (.ts) and fMP4 (.m4s + init.mp4) segments
        const baseUrl = getBaseUrl(request);
        playlist = playlist
          // Replace .ts segments
          .replace(/segment_(\d+)\.ts/g, `${baseUrl}/vod-hls/${token}/${streamId}/$&`)
          // Replace .m4s segments
          .replace(/segment_(\d+)\.m4s/g, `${baseUrl}/vod-hls/${token}/${streamId}/$&`)
          // Replace init.mp4 in URI attribute (standard EXT-X-MAP format)
          .replace(/URI="init\.mp4"/g, `URI="${baseUrl}/vod-hls/${token}/${streamId}/init.mp4"`)
          // Also match bare init.mp4 references (in case of non-standard format)
          .replace(/^init\.mp4$/gm, `${baseUrl}/vod-hls/${token}/${streamId}/init.mp4`);

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(playlist);
      } catch (error) {
        logger.error({ error, streamId }, 'VOD HLS media playlist error');
        return reply.status(500).send({ error: 'Playlist error' });
      }
    }
  );

  // VOD HLS variant playlist endpoint - /vod-hls/:token/:streamId/stream_:variant/index.m3u8
  // This handles the video and audio variant playlists generated by FFmpeg with var_stream_map
  fastify.get<{ Params: { token: string; streamId: string; variant: string } }>(
    '/vod-hls/:token/:streamId/stream_:variant/index.m3u8',
    async (request, reply) => {
      const { token, streamId, variant } = request.params;

      // Refresh VOD viewer heartbeat
      try {
        await vodViewerManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const outputDir = vodToHlsService.getOutputDir(parseInt(streamId));
        const playlistPath = path.join(outputDir, `stream_${variant}`, 'index.m3u8');

        let playlist = await fs.readFile(playlistPath, 'utf-8');

        // Rewrite segment URLs to go through our proxy
        const baseUrl = getBaseUrl(request);
        playlist = playlist
          // Replace seg_XXXXXX.m4s segments
          .replace(/seg_(\d+)\.m4s/g, `${baseUrl}/vod-hls/${token}/${streamId}/stream_${variant}/$&`)
          // Replace init segments (fMP4 initialization segment) - handles both init.mp4 and init_XX.mp4
          .replace(/init(?:_[^.]+)?\.mp4/g, `${baseUrl}/vod-hls/${token}/${streamId}/stream_${variant}/$&`);

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'no-cache');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(playlist);
      } catch (error) {
        logger.error({ error, streamId, variant }, 'VOD HLS variant playlist error');
        return reply.status(404).send({ error: 'Variant playlist not found' });
      }
    }
  );

  // VOD HLS variant segment endpoint - /vod-hls/:token/:streamId/stream_:variant/:segment
  // This handles segments within variant subdirectories (seg_XXXXXX.m4s, init_XX.mp4)
  fastify.get<{ Params: { token: string; streamId: string; variant: string; segment: string } }>(
    '/vod-hls/:token/:streamId/stream_:variant/:segment',
    async (request, reply) => {
      const { token, streamId, variant, segment } = request.params;

      // Refresh VOD viewer heartbeat on segment request
      try {
        await vodViewerManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const outputDir = vodToHlsService.getOutputDir(parseInt(streamId));
        const segmentPath = path.join(outputDir, `stream_${variant}`, segment);

        // Determine content type based on segment extension
        const contentType = segment.endsWith('.m4s') || segment.endsWith('.mp4')
          ? 'video/mp4'
          : 'video/MP2T';

        const segmentData = await fs.readFile(segmentPath);
        reply.header('Content-Type', contentType);
        reply.header('Cache-Control', 'max-age=3600');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(segmentData);
      } catch (error) {
        logger.error({ error, streamId, variant, segment }, 'VOD HLS variant segment error');
        return reply.status(404).send({ error: 'Segment not found' });
      }
    }
  );

  // VOD HLS segment endpoint - /vod-hls/:token/:streamId/:segment
  fastify.get<{ Params: { token: string; streamId: string; segment: string } }>(
    '/vod-hls/:token/:streamId/:segment',
    async (request, reply) => {
      const { token, streamId, segment } = request.params;

      // Refresh VOD viewer heartbeat and user connection on segment request
      try {
        await vodViewerManager.refreshViewer(parseInt(streamId), token);
        await refreshHlsConnectionByViewerId(token);
      } catch {
        // Ignore errors
      }

      try {
        const outputDir = vodToHlsService.getOutputDir(parseInt(streamId));
        const segmentPath = path.join(outputDir, segment);

        // Determine content type based on segment extension
        // .ts = MPEG-TS, .m4s/.mp4 = fMP4
        const contentType = segment.endsWith('.m4s') || segment.endsWith('.mp4')
          ? 'video/mp4'
          : 'video/MP2T';

        try {
          const segmentData = await fs.readFile(segmentPath);
          reply.header('Content-Type', contentType);
          reply.header('Cache-Control', 'max-age=3600'); // Cache VOD segments longer
          reply.header('Access-Control-Allow-Origin', '*');
          reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
          reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
          return reply.send(segmentData);
        } catch (error) {
          // Segment might not be ready yet if conversion is in progress
          const job = vodToHlsService.getJobStatus(parseInt(streamId));
          if (job && job.status === 'converting') {
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
              const segmentData = await fs.readFile(segmentPath);
              reply.header('Content-Type', contentType);
              reply.header('Cache-Control', 'max-age=3600');
              reply.header('Access-Control-Allow-Origin', '*');
              return reply.send(segmentData);
            } catch {
              return reply.status(404).send({ error: 'Segment not ready' });
            }
          }
          return reply.status(404).send({ error: 'Segment not found' });
        }
      } catch (error) {
        logger.error({ error, streamId, segment }, 'VOD HLS segment error');
        return reply.status(500).send({ error: 'Segment error' });
      }
    }
  );

  // VOD subtitle list endpoint - /vod-hls/:token/:streamId/subtitles.json
  fastify.get<{ Params: { token: string; streamId: string } }>(
    '/vod-hls/:token/:streamId/subtitles.json',
    async (request, reply) => {
      const { streamId } = request.params;

      try {
        const subtitles = vodToHlsService.getExtractedSubtitles(parseInt(streamId));
        
        reply.header('Content-Type', 'application/json');
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(subtitles || []);
      } catch (error) {
        // Return empty array if no subtitles found (not an error condition)
        logger.debug({ error, streamId }, 'No subtitles available for VOD');
        reply.header('Content-Type', 'application/json');
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send([]);
      }
    }
  );

  // VOD audio tracks endpoint - /vod-hls/:token/:streamId/audio_tracks.json
  fastify.get<{ Params: { token: string; streamId: string } }>(
    '/vod-hls/:token/:streamId/audio_tracks.json',
    async (request, reply) => {
      const { streamId } = request.params;

      try {
        const audioTracks = vodToHlsService.getAudioTracks(parseInt(streamId));
        
        reply.header('Content-Type', 'application/json');
        reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send(audioTracks || []);
      } catch (error) {
        // Return empty array if no audio tracks found (not an error condition)
        logger.debug({ error, streamId }, 'No audio track info available for VOD');
        reply.header('Content-Type', 'application/json');
        reply.header('Cache-Control', 'max-age=60');
        reply.header('Access-Control-Allow-Origin', '*');
        return reply.send([]);
      }
    }
  );

  // VOD subtitle file endpoint - /vod-hls/:token/:streamId/subtitle_:index.vtt
  fastify.get<{ Params: { token: string; streamId: string; index: string } }>(
    '/vod-hls/:token/:streamId/subtitle_:index.vtt',
    async (request, reply) => {
      const { streamId, index } = request.params;

      try {
        const subtitlePath = vodToHlsService.getSubtitlePath(parseInt(streamId), parseInt(index));
        
        if (!subtitlePath) {
          return reply.status(404).send({ error: 'Subtitle not found' });
        }

        const subtitleData = await fs.readFile(subtitlePath, 'utf-8');
        
        reply.header('Content-Type', 'text/vtt; charset=utf-8');
        reply.header('Cache-Control', 'max-age=86400'); // Cache subtitles for 24 hours
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type');
        return reply.send(subtitleData);
      } catch (error) {
        logger.error({ error, streamId, index }, 'VOD subtitle error');
        return reply.status(500).send({ error: 'Subtitle error' });
      }
    }
  );

  // VOD subtitle HLS playlist endpoint - /vod-hls/:token/:streamId/subs_:index.m3u8
  // VLC requires subtitles to be served as HLS media playlist, not direct VTT files
  fastify.get<{ Params: { token: string; streamId: string; index: string } }>(
    '/vod-hls/:token/:streamId/subs_:index.m3u8',
    async (request, reply) => {
      const { token, streamId, index } = request.params;

      try {
        const subtitles = vodToHlsService.getExtractedSubtitles(parseInt(streamId));
        const subtitle = subtitles.find(s => s.index === parseInt(index));
        
        if (!subtitle) {
          return reply.status(404).send({ error: 'Subtitle track not found' });
        }

        // Get the video duration to create proper subtitle playlist
        // Read the media playlist to get the total duration
        const playlistPath = vodToHlsService.getPlaylistPath(parseInt(streamId));
        const mediaPlaylist = await fs.readFile(playlistPath, 'utf-8');
        
        // Parse total duration from media playlist
        let totalDuration = 0;
        const durationMatches = mediaPlaylist.matchAll(/#EXTINF:([\d.]+),/g);
        for (const match of durationMatches) {
          totalDuration += parseFloat(match[1]);
        }

        // Create HLS subtitle playlist that references the VTT file
        // This format is compatible with VLC and other HLS players
        let subtitlePlaylist = '#EXTM3U\n';
        subtitlePlaylist += '#EXT-X-VERSION:7\n';
        subtitlePlaylist += `#EXT-X-TARGETDURATION:${Math.ceil(totalDuration)}\n`;
        subtitlePlaylist += '#EXT-X-MEDIA-SEQUENCE:0\n';
        subtitlePlaylist += '#EXT-X-PLAYLIST-TYPE:VOD\n';
        subtitlePlaylist += `#EXTINF:${totalDuration.toFixed(6)},\n`;
        subtitlePlaylist += `/vod-hls/${token}/${streamId}/${subtitle.filename}\n`;
        subtitlePlaylist += '#EXT-X-ENDLIST\n';

        reply.header('Content-Type', 'application/vnd.apple.mpegurl');
        reply.header('Cache-Control', 'max-age=3600');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Content-Type, Range');
        return reply.send(subtitlePlaylist);
      } catch (error) {
        logger.error({ error, streamId, index }, 'VOD subtitle playlist error');
        return reply.status(500).send({ error: 'Subtitle playlist error' });
      }
    }
  );

  // Series episode endpoint: /series/:username/:password/:episodeId.ext
  fastify.get<{ Params: StreamParams; Querystring: AuthQuery }>(
    '/series/:username/:password/:streamId.:ext',
    {
      preHandler: async (request, reply) => {
        request.query.username = request.params.username;
        request.query.password = request.params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { streamId: episodeId, ext } = request.params;
      // Access line through request.line (or request.user for backwards compatibility)
      const line = (request.line || request.user)!;

      try {
        const episode = await prisma.episode.findUnique({
          where: { id: parseInt(episodeId) },
          include: { series: true },
        });

        if (!episode) {
          return reply.status(404).send({ error: 'Episode not found' });
        }

        // HEALTH CHECK: For remote episode sources, verify they're accessible
        if (episode.sourceUrl.startsWith('http://') || episode.sourceUrl.startsWith('https://')) {
          const healthCheck = await checkStreamSourceHealth(
            episode.id,
            episode.sourceUrl,
            undefined // Episodes don't have custom user agent
          );
          
          if (!healthCheck.healthy) {
            logger.warn(
              { episodeId: episode.id, seriesName: episode.series.name, error: healthCheck.error },
              'Episode source unavailable - not registering connection'
            );
            return reply.status(503).send({
              error: 'Episode source unavailable',
              message: 'The episode source is currently not responding. Please try again later.',
              details: healthCheck.error,
            });
          }
        }

        // Determine source path
        let sourcePath = episode.sourceUrl;
        
        // Handle remote URLs
        if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
          // Register connection
          const connectionId = await registerConnection(
            line.id,
            parseInt(episodeId),
            getClientIp(request),
            request.headers['user-agent'],
            {
              contentType: ContentType.SERIES,
              contentName: `${episode.series.name} S${episode.seasonNumber}E${episode.episodeNumber}`,
              episodeId: episode.id,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
            }
          );

          // Set up periodic TTL refresh for long-running streams
          const ttlRefreshInterval = setInterval(() => {
            refreshConnectionTTL(line.id).catch(() => {});
          }, 20000);

          request.raw.on('close', () => {
            clearInterval(ttlRefreshInterval);
            unregisterConnection(line.id, connectionId);
          });

          // Proxy remote stream
          const proxyStream = await streamProxy.proxyStream(episode.sourceUrl);
          const contentType = getContentType(episode.containerExtension || ext || 'mp4');
          reply.header('Content-Type', contentType);
          reply.header('Accept-Ranges', 'bytes');
          return reply.send(proxyStream);
        }
        
        // Handle local files
        // Resolve path if needed
        if (!sourcePath.startsWith('/') || !existsSync(sourcePath)) {
          if (sourcePath.startsWith('/media/')) {
            const filename = sourcePath.replace('/media/', '');
            const seriesPath = path.join(config.media.seriesPath || config.media.path, filename);
            const mediaPath = path.join(config.media.path, filename);
            if (existsSync(seriesPath)) {
              sourcePath = seriesPath;
            } else if (existsSync(mediaPath)) {
              sourcePath = mediaPath;
            }
          }
        }
        
        // Check file exists
        if (!existsSync(sourcePath)) {
          logger.error({ episodeId, sourcePath, originalPath: episode.sourceUrl }, 'Episode file not found');
          return reply.status(404).send({ error: 'Episode file not found' });
        }
        
        // Get file stats for range support
        const stat = await fs.stat(sourcePath);
        const fileSize = stat.size;
        const range = request.headers.range;
        
        // Register connection
        const connectionId = await registerConnection(
          line.id,
          parseInt(episodeId),
          getClientIp(request),
          request.headers['user-agent'],
          {
            contentType: ContentType.SERIES,
            contentName: `${episode.series.name} S${episode.seasonNumber}E${episode.episodeNumber}`,
            episodeId: episode.id,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
          }
        );

        // Set up periodic TTL refresh for long-running streams
        const ttlRefreshInterval = setInterval(() => {
          refreshConnectionTTL(line.id).catch(() => {});
        }, 20000);

        request.raw.on('close', () => {
          clearInterval(ttlRefreshInterval);
          unregisterConnection(line.id, connectionId);
        });

        const contentType = getContentType(episode.containerExtension || ext || 'mp4');
        
        if (range) {
          // Parse range header
          const parts = range.replace(/bytes=/, '').split('-');
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunkSize = end - start + 1;
          
          reply.status(206);
          reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
          reply.header('Accept-Ranges', 'bytes');
          reply.header('Content-Length', chunkSize);
          reply.header('Content-Type', contentType);
          
          const fileStream = createReadStream(sourcePath, { start, end });
          return reply.send(fileStream);
        } else {
          // Full file request
          reply.header('Content-Length', fileSize);
          reply.header('Content-Type', contentType);
          reply.header('Accept-Ranges', 'bytes');
          
          const fileStream = createReadStream(sourcePath);
          return reply.send(fileStream);
        }
      } catch (error) {
        logger.error({ error, episodeId }, 'Series stream error');
        return reply.status(500).send({ error: 'Stream error' });
      }
    }
  );

  // Timeshift/Catchup endpoint
  fastify.get<{
    Params: {
      username: string;
      password: string;
      duration: string;
      start: string;
      streamId: string;
      ext: string;
    };
    Querystring: AuthQuery;
  }>(
    '/timeshift/:username/:password/:duration/:start/:streamId.:ext',
    {
      preHandler: async (request, reply) => {
        request.query.username = request.params.username;
        request.query.password = request.params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { streamId, duration, start } = request.params;

      try {
        const stream = await prisma.stream.findUnique({
          where: {
            id: parseInt(streamId),
            tvArchive: true,
          },
        });

        if (!stream) {
          return reply.status(404).send({ error: 'Stream not found or catchup not available' });
        }

        // In a real implementation, you would have a catchup/DVR system
        // that stores past stream segments and retrieves them based on
        // the start timestamp and duration

        return reply.status(501).send({ 
          error: 'Timeshift not implemented',
          message: 'This feature requires a catchup/DVR storage system',
        });
      } catch (error) {
        logger.error({ error, streamId }, 'Timeshift error');
        return reply.status(500).send({ error: 'Timeshift error' });
      }
    }
  );
};

function getContentType(extension: string): string {
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    mkv: 'video/x-matroska',
    avi: 'video/x-msvideo',
    ts: 'video/MP2T',
    m3u8: 'application/vnd.apple.mpegurl',
    webm: 'video/webm',
    flv: 'video/x-flv',
  };
  return types[extension.toLowerCase()] || 'application/octet-stream';
}

export default streamingRoutes;
