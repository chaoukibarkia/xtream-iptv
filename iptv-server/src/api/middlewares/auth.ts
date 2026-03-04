import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database.js';
import { cache, redis } from '../../config/redis.js';
import { IptvLineWithBouquets } from '../../types/user.js';
import { logger } from '../../config/logger.js';
import { ipGeoService } from '../../services/geo/IpGeoService.js';
import { ContentType } from '@prisma/client';
import { config } from '../../config/index.js';

// Extend FastifyRequest to include IPTV line (for streaming authentication)
declare module 'fastify' {
  interface FastifyRequest {
    line?: IptvLineWithBouquets;
    // Legacy alias for backwards compatibility
    user?: IptvLineWithBouquets;
  }
}

export interface AuthQuery {
  username: string;
  password: string;
  device_id?: string;
}

/**
 * Authenticate IPTV Line (subscriber) for streaming access
 * Uses Xtream Codes compatible username/password query parameters
 */
export async function authenticateIptvLine(
  request: FastifyRequest<{ Querystring: AuthQuery }>,
  reply: FastifyReply
): Promise<void> {
  const { username, password } = request.query;

  if (!username || !password) {
    reply.status(401).send({
      user_info: {
        auth: 0,
        status: 'Disabled',
        message: 'Authentication required',
      },
    });
    return;
  }

  try {
    // Check cache first
    const cacheKey = cache.KEYS.LINE_AUTH(username, password);
    const cached = await cache.get<IptvLineWithBouquets>(cacheKey);
    
    if (cached) {
      // Check if expired
      if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
        reply.status(403).send({
          user_info: {
            auth: 0,
            status: 'Expired',
            message: 'Account expired',
          },
        });
        return;
      }
      
      // Check if banned/disabled
      if (cached.status !== 'active') {
        reply.status(403).send({
          user_info: {
            auth: 0,
            status: cached.status,
            message: `Account ${cached.status}`,
          },
        });
        return;
      }

      // Check device lock (cached path)
      if (cached.lockedDeviceId) {
        const deviceId = request.query.device_id || (request.headers['x-device-id'] as string);
        if (!deviceId) {
          reply.status(403).send({
            user_info: {
              auth: 0,
              status: 'Device Required',
              message: 'Device ID is required for this account',
            },
          });
          return;
        }
        if (cached.lockedDeviceId !== deviceId) {
          reply.status(403).send({
            user_info: {
              auth: 0,
              status: 'Device Mismatch',
              message: 'This account is locked to a different device',
            },
          });
          return;
        }
      }

      request.line = cached;
      request.user = cached; // Legacy alias
      return;
    }

    // Database lookup - search in IptvLine table
    const line = await prisma.iptvLine.findFirst({
      where: {
        username,
        password, // Plain text comparison for Xtream API compatibility
      },
      include: {
        bouquets: {
          include: {
            bouquet: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            role: true,
          },
        },
      },
    });

    if (!line) {
      reply.status(401).send({
        user_info: {
          auth: 0,
          status: 'Disabled',
          message: 'Invalid credentials',
        },
      });
      return;
    }

    // Check subscription status
    if (line.expiresAt && new Date(line.expiresAt) < new Date()) {
      // Update status to expired
      await prisma.iptvLine.update({
        where: { id: line.id },
        data: { status: 'expired' },
      });
      
      reply.status(403).send({
        user_info: {
          auth: 0,
          status: 'Expired',
          message: 'Account expired',
        },
      });
      return;
    }

    // Check if banned/disabled
    if (line.status !== 'active') {
      reply.status(403).send({
        user_info: {
          auth: 0,
          status: line.status,
          message: `Account ${line.status}`,
        },
      });
      return;
    }

    // Check device lock
    if (line.lockedDeviceId) {
      const deviceId = request.query.device_id || (request.headers['x-device-id'] as string);
      if (!deviceId) {
        reply.status(403).send({
          user_info: {
            auth: 0,
            status: 'Device Required',
            message: 'Device ID is required for this account',
          },
        });
        return;
      }
      if (line.lockedDeviceId !== deviceId) {
        logger.warn(
          { lineId: line.id, expectedDevice: line.lockedDeviceId, providedDevice: deviceId },
          'Device lock violation'
        );
        reply.status(403).send({
          user_info: {
            auth: 0,
            status: 'Device Mismatch',
            message: 'This account is locked to a different device',
          },
        });
        return;
      }
    }

    // Cache line for 5 minutes
    await cache.set(cacheKey, line, cache.TTL.LINE);
    
    // Update last activity
    await prisma.iptvLine.update({
      where: { id: line.id },
      data: { lastActivity: new Date() },
    });

    request.line = line as IptvLineWithBouquets;
    request.user = line as IptvLineWithBouquets; // Legacy alias
  } catch (error) {
    logger.error({ error }, 'Authentication error');
    reply.status(500).send({
      user_info: {
        auth: 0,
        status: 'Disabled',
        message: 'Server error',
      },
    });
  }
}

export async function checkConnectionLimit(
  request: FastifyRequest<{ Params: { streamId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const line = request.line;
  
  if (!line) {
    reply.status(401).send({ error: 'Unauthorized' });
    return;
  }

  const streamId = request.params.streamId;
  const connectionKey = cache.KEYS.ACTIVE_CONNECTIONS(line.id);
  
  // Clean up expired HLS connections before counting
  // This ensures stale connections from channel zapping don't block new connections
  await cleanupExpiredHlsConnections(line.id);
  
  // Also cleanup stale database connections (MPEG-TS/VOD)
  // This handles cases where connection cleanup failed
  await cleanupStaleDbConnections(line.id);
  
  // Get active connections count
  const activeConnections = await redis.scard(connectionKey);
  
  if (activeConnections >= line.maxConnections) {
    reply.status(403).send({ 
      error: 'Maximum connections reached',
      message: `You have reached your connection limit of ${line.maxConnections}`,
    });
    return;
  }
}

export interface ConnectionOptions {
  contentType?: ContentType;
  contentName?: string;
  episodeId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  serverId?: number;
}

export async function registerConnection(
  lineId: number,
  streamId: number,
  ipAddress: string,
  userAgent?: string,
  options?: ConnectionOptions
): Promise<string> {
  // ZAPPING FIX: Cleanup connections from the SAME CLIENT before registering new one
  // This handles channel zapping correctly - when user switches from Stream A to Stream B,
  // we immediately remove their old connection instead of waiting for TCP close or timeout.
  // This is critical for maxConnections=1 users who can't wait 5+ minutes to switch channels.
  await cleanupClientConnections(lineId, ipAddress, userAgent);

  // Also cleanup any stale connections (older than 5 minutes)
  await cleanupStaleDbConnections(lineId);

  // Get country code asynchronously (don't block on it)
  const countryCode = await ipGeoService.getCountryCode(ipAddress).catch(() => null);
  
  // Use provided serverId or fallback to current server from config
  const serverId = options?.serverId ?? config.multiServer.serverId ?? null;
  
  const connection = await prisma.lineConnection.create({
    data: {
      lineId,
      streamId,
      ipAddress,
      userAgent,
      countryCode,
      serverId,
      contentType: options?.contentType || ContentType.LIVE,
      contentName: options?.contentName,
      episodeId: options?.episodeId,
      seasonNumber: options?.seasonNumber,
      episodeNumber: options?.episodeNumber,
    },
  });

  // Add to Redis set for quick counting
  const connectionKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  await redis.sadd(connectionKey, connection.id);
  await redis.expire(connectionKey, cache.TTL.CONNECTION);

  return connection.id;
}

export async function unregisterConnection(
  lineId: number,
  connectionId: string
): Promise<void> {
  await prisma.lineConnection.delete({
    where: { id: connectionId },
  }).catch(() => {
    // Connection might already be deleted
  });

  const connectionKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  await redis.srem(connectionKey, connectionId);
}

export async function getActiveConnectionCount(lineId: number): Promise<number> {
  const connectionKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  return await redis.scard(connectionKey);
}

/**
 * Refresh the TTL for an active connection
 * This should be called periodically for long-running MPEG-TS streams
 * to prevent the Redis key from expiring while the stream is still active
 */
export async function refreshConnectionTTL(lineId: number): Promise<void> {
  const connectionKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  await redis.expire(connectionKey, cache.TTL.CONNECTION);
}

// TTL for HLS connections (30 seconds - refreshed on each segment request)
// Reduced from 60s to 30s for faster disconnect detection when users stop watching
const HLS_CONNECTION_TTL = 30;

export interface HlsConnectionOptions {
  contentType?: ContentType;
  contentName?: string;
  episodeId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  serverId?: number;
}

/**
 * Register an HLS connection for an IPTV line
 * HLS connections use TTL-based tracking since there's no persistent connection
 * The viewerId is used as the connection identifier
 */
export async function registerHlsConnection(
  lineId: number,
  streamId: number,
  viewerId: string,
  ipAddress: string,
  userAgent?: string,
  options?: HlsConnectionOptions
): Promise<void> {
  // Use a Redis key per line-viewer combination with TTL
  const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
  const connectionSetKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  // Store viewerId -> lineId mapping for segment request lookups
  const viewerLookupKey = `hls:viewer:${viewerId}`;
  
  // Use provided serverId or fallback to current server from config
  const serverId = options?.serverId ?? config.multiServer.serverId ?? null;
  
  // Check if this HLS connection already exists
  const exists = await redis.exists(hlsConnectionKey);

  if (!exists) {
    // ZAPPING FIX: Before creating a new connection, cleanup any existing connections
    // from the SAME CLIENT (same IP + user-agent). This handles channel zapping correctly:
    // When user switches from Stream A to Stream B, the viewerId changes (it includes streamId),
    // so the old connection would remain until TTL expires (30s), blocking maxConnections=1 users.
    await cleanupClientConnections(lineId, ipAddress, userAgent);

    // Also cleanup any expired HLS connections (TTL based)
    await cleanupExpiredHlsConnections(lineId);

    // Get country code asynchronously
    const countryCode = await ipGeoService.getCountryCode(ipAddress).catch(() => null);
    
    // New HLS connection - store connection data
    await redis.hset(hlsConnectionKey, {
      streamId: streamId.toString(),
      ipAddress,
      userAgent: userAgent || '',
      startedAt: new Date().toISOString(),
      countryCode: countryCode || '',
      serverId: serverId?.toString() || '',
      contentType: options?.contentType || 'LIVE',
      contentName: options?.contentName || '',
      episodeId: options?.episodeId?.toString() || '',
      seasonNumber: options?.seasonNumber?.toString() || '',
      episodeNumber: options?.episodeNumber?.toString() || '',
    });
    
    // Store the viewer -> line mapping
    await redis.set(viewerLookupKey, lineId.toString());
    
    // Add to line's active connections set
    await redis.sadd(connectionSetKey, `hls:${viewerId}`);
  }
  
  // Set/refresh TTL on all keys
  await redis.expire(hlsConnectionKey, HLS_CONNECTION_TTL);
  await redis.expire(viewerLookupKey, HLS_CONNECTION_TTL);
  await redis.expire(connectionSetKey, cache.TTL.CONNECTION);
}

/**
 * Refresh an HLS connection TTL by viewerId
 * Called on each segment request to keep the connection alive
 * Looks up the lineId from the viewer mapping
 */
export async function refreshHlsConnectionByViewerId(
  viewerId: string
): Promise<void> {
  // Look up lineId from viewerId
  const viewerLookupKey = `hls:viewer:${viewerId}`;
  const lineIdStr = await redis.get(viewerLookupKey);

  if (!lineIdStr) {
    // No mapping found, connection may have expired
    return;
  }

  const lineId = parseInt(lineIdStr, 10);
  const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;

  // Check if connection still exists before refreshing
  const exists = await redis.exists(hlsConnectionKey);
  if (!exists) {
    // Connection expired, cleanup viewer lookup key
    await redis.del(viewerLookupKey);
    return;
  }

  // Refresh TTL on connection-specific keys
  await redis.expire(hlsConnectionKey, HLS_CONNECTION_TTL);
  await redis.expire(viewerLookupKey, HLS_CONNECTION_TTL);

  // Aggressive cleanup - run on every refresh to ensure stale connections are removed immediately
  // This is fire-and-forget for performance (don't await)
  cleanupExpiredHlsConnections(lineId).catch(() => {});
}

/**
 * Refresh an HLS connection TTL (when lineId is known)
 * Called on each segment request to keep the connection alive
 */
export async function refreshHlsConnection(
  lineId: number,
  viewerId: string
): Promise<void> {
  const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
  const viewerLookupKey = `hls:viewer:${viewerId}`;

  // Refresh TTL on connection-specific keys
  const exists = await redis.exists(hlsConnectionKey);
  if (exists) {
    await redis.expire(hlsConnectionKey, HLS_CONNECTION_TTL);
    await redis.expire(viewerLookupKey, HLS_CONNECTION_TTL);

    // Cleanup expired connections from the set
    // Run cleanup on every refresh to ensure stale connections are removed quickly
    await cleanupExpiredHlsConnections(lineId);
  }
}

/**
 * Cleanup expired HLS connections from the active connections set
 * Also removes HLS connections that are too old (stuck retrying on broken channels)
 * This should be called periodically to remove stale entries
 */
export async function cleanupExpiredHlsConnections(lineId: number): Promise<void> {
  const connectionSetKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  const members = await redis.smembers(connectionSetKey);
  
  // HLS connection max age: 10 minutes
  // If HLS connection is older than this, the stream is likely broken or user abandoned it
  const HLS_MAX_AGE_MS = 10 * 60 * 1000;
  const maxAgeThreshold = Date.now() - HLS_MAX_AGE_MS;
  
  let cleanedCount = 0;
  let timedOutCount = 0;
  
  for (const member of members) {
    if (member.startsWith('hls:')) {
      const viewerId = member.substring(4); // Remove 'hls:' prefix
      const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
      const exists = await redis.exists(hlsConnectionKey);
      
      if (!exists) {
        // HLS connection expired (TTL), remove from set
        await redis.srem(connectionSetKey, member);
        cleanedCount++;
      } else {
        // Check connection age
        const connData = await redis.hgetall(hlsConnectionKey);
        if (connData && connData.startedAt) {
          const startedAt = new Date(connData.startedAt).getTime();
          if (startedAt < maxAgeThreshold) {
            // Connection too old, likely stuck retrying on broken channel
            logger.info(
              { 
                lineId, 
                viewerId, 
                age: Math.round((Date.now() - startedAt) / 1000),
                threshold: 600,
                contentName: connData.contentName 
              }, 
              'Removing stuck HLS connection (exceeded max age)'
            );
            
            // Force cleanup
            await redis.del(hlsConnectionKey);
            await redis.del(`hls:viewer:${viewerId}`);
            await redis.srem(connectionSetKey, member);
            timedOutCount++;
          }
        }
      }
    }
  }
  
  if (cleanedCount > 0 || timedOutCount > 0) {
    logger.debug(
      { lineId, cleanedCount, timedOutCount }, 
      'Cleaned up expired/timed-out HLS connections'
    );
  }
}

/**
 * Cleanup a specific HLS connection by viewerId
 * Used when explicitly unregistering viewers from streams
 */
export async function cleanupHlsConnectionByViewerId(viewerId: string): Promise<void> {
  const viewerLookupKey = `hls:viewer:${viewerId}`;
  const lineIdStr = await redis.get(viewerLookupKey);
  
  if (!lineIdStr) {
    return;
  }
  
  const lineId = parseInt(lineIdStr, 10);
  const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
  const connectionSetKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  
  // Remove all HLS connection keys
  await Promise.all([
    redis.del(hlsConnectionKey),
    redis.del(viewerLookupKey),
    redis.srem(connectionSetKey, `hls:${viewerId}`),
  ]);
}

/**
 * Cleanup connections from the same client (IP + user-agent) for channel zapping
 * This handles the case where a user switches channels quickly (zapping):
 * - For MPEG-TS: The TCP close event may be delayed, leaving old connection active
 * - For HLS: The viewerId changes per stream, so old connection remains until TTL
 * By cleaning up connections from the same client, we allow immediate channel switching.
 */
export async function cleanupClientConnections(
  lineId: number,
  ipAddress: string,
  userAgent?: string
): Promise<void> {
  const connectionSetKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  const members = await redis.smembers(connectionSetKey);

  let dbCleaned = 0;
  let hlsCleaned = 0;

  for (const member of members) {
    if (member.startsWith('hls:')) {
      // HLS connection - check in Redis
      const viewerId = member.substring(4);
      const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
      const connData = await redis.hgetall(hlsConnectionKey);

      if (connData && connData.ipAddress === ipAddress) {
        // Same IP - check user-agent if provided
        const sameClient = !userAgent || !connData.userAgent || connData.userAgent === userAgent;
        if (sameClient) {
          // Same client, remove this HLS connection
          const viewerLookupKey = `hls:viewer:${viewerId}`;
          await Promise.all([
            redis.del(hlsConnectionKey),
            redis.del(viewerLookupKey),
            redis.srem(connectionSetKey, member),
          ]);
          hlsCleaned++;
        }
      }
    } else {
      // Database connection (MPEG-TS/VOD) - check in DB
      const connection = await prisma.lineConnection.findUnique({
        where: { id: member },
        select: { id: true, ipAddress: true, userAgent: true },
      });

      if (connection && connection.ipAddress === ipAddress) {
        // Same IP - check user-agent if provided
        const sameClient = !userAgent || !connection.userAgent || connection.userAgent === userAgent;
        if (sameClient) {
          // Same client, remove this connection
          await prisma.lineConnection.delete({
            where: { id: member },
          }).catch(() => {
            // Already deleted, ignore
          });
          await redis.srem(connectionSetKey, member);
          dbCleaned++;
        }
      }
    }
  }

  if (dbCleaned > 0 || hlsCleaned > 0) {
    logger.debug(
      { lineId, ipAddress, dbCleaned, hlsCleaned },
      'Cleaned up connections from same client for channel zapping'
    );
  }
}

/**
 * Cleanup stale database connections (MPEG-TS/VOD) for a line
 * Removes connections from Redis set that no longer exist in database
 * Also removes connections that are older than CONNECTION_TIMEOUT (stuck/zombie connections)
 * This handles cases where connection cleanup failed (network issues, crashes, broken channels, etc.)
 */
export async function cleanupStaleDbConnections(lineId: number): Promise<void> {
  const connectionSetKey = cache.KEYS.ACTIVE_CONNECTIONS(lineId);
  const members = await redis.smembers(connectionSetKey);
  
  // Connection timeout: 5 minutes (300 seconds)
  // If a connection is older than this, it's likely stuck/zombie (broken channel, network issue, etc.)
  const CONNECTION_TIMEOUT_MS = 5 * 60 * 1000;
  const timeoutThreshold = new Date(Date.now() - CONNECTION_TIMEOUT_MS);
  
  let cleanedCount = 0;
  let timedOutCount = 0;
  
  for (const member of members) {
    // Skip HLS connections (they have their own cleanup)
    if (member.startsWith('hls:')) {
      continue;
    }
    
    // Check if the connection still exists in database
    const connection = await prisma.lineConnection.findUnique({
      where: { id: member },
      select: { id: true, startedAt: true },
    });
    
    if (!connection) {
      // Connection no longer exists in DB, remove from Redis set
      await redis.srem(connectionSetKey, member);
      cleanedCount++;
    } else if (connection.startedAt < timeoutThreshold) {
      // Connection is too old (stuck/zombie connection)
      // This happens when: channel doesn't work, network issues, player keeps retrying, etc.
      logger.info(
        { 
          lineId, 
          connectionId: member, 
          age: Math.round((Date.now() - connection.startedAt.getTime()) / 1000),
          threshold: 300 
        }, 
        'Removing stuck connection (exceeded timeout)'
      );
      
      // Remove from database and Redis
      await prisma.lineConnection.delete({
        where: { id: member },
      }).catch(() => {
        // Already deleted, ignore
      });
      await redis.srem(connectionSetKey, member);
      timedOutCount++;
    }
  }
  
  if (cleanedCount > 0 || timedOutCount > 0) {
    logger.debug(
      { lineId, cleanedCount, timedOutCount }, 
      'Cleaned up stale/timed-out database connections'
    );
  }
}

/**
 * Detailed connection info returned by getActiveConnectionsDetailed
 */
export interface DetailedConnection {
  id: string;
  lineId: number;
  username: string;
  streamId: number;
  ipAddress: string;
  userAgent: string | null;
  countryCode: string | null;
  startedAt: string;
  contentType: string;
  contentName: string | null;
  episodeId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isHls: boolean;
  serverId: number | null;
  serverName: string | null;
  serverType: string | null;
}

// Cache for server info to avoid repeated DB lookups
const serverCache = new Map<number, { name: string; type: string } | null>();

async function getServerInfo(serverId: number | null): Promise<{ name: string; type: string } | null> {
  if (serverId === null) return null;
  
  if (serverCache.has(serverId)) {
    return serverCache.get(serverId) || null;
  }
  
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { name: true, type: true },
    });
    
    if (server) {
      const serverInfo = { name: server.name, type: server.type };
      serverCache.set(serverId, serverInfo);
      return serverInfo;
    }
  } catch {
    // Ignore errors
  }
  
  serverCache.set(serverId, null);
  return null;
}

// Clear server cache periodically (every 5 minutes)
setInterval(() => serverCache.clear(), 5 * 60 * 1000);

/**
 * Get all active connections with detailed information
 * Combines database connections (for MPEG-TS) and Redis connections (for HLS)
 */
export async function getActiveConnectionsDetailed(): Promise<DetailedConnection[]> {
  const connections: DetailedConnection[] = [];
  let cursor = '0';
  
  // Scan all connection sets
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'connections:*', 'COUNT', 100);
    cursor = nextCursor;
    
    for (const key of keys) {
      const lineId = parseInt(key.split(':')[1], 10);
      if (isNaN(lineId)) continue;
      
      // Get the line info for username
      const line = await prisma.iptvLine.findUnique({
        where: { id: lineId },
        select: { id: true, username: true },
      });
      
      if (!line) continue;
      
      const members = await redis.smembers(key);
      
      for (const member of members) {
        if (member.startsWith('hls:')) {
          // HLS connection - get from Redis
          const viewerId = member.substring(4);
          const hlsConnectionKey = `hls:line:${lineId}:${viewerId}`;
          const connData = await redis.hgetall(hlsConnectionKey);
          
          if (connData && Object.keys(connData).length > 0) {
            const serverId = connData.serverId ? parseInt(connData.serverId, 10) : null;
            const serverInfo = await getServerInfo(serverId);
            
            connections.push({
              id: viewerId,
              lineId,
              username: line.username,
              streamId: parseInt(connData.streamId || '0', 10),
              ipAddress: connData.ipAddress || '',
              userAgent: connData.userAgent || null,
              countryCode: connData.countryCode || null,
              startedAt: connData.startedAt || new Date().toISOString(),
              contentType: connData.contentType || 'LIVE',
              contentName: connData.contentName || null,
              episodeId: connData.episodeId ? parseInt(connData.episodeId, 10) : null,
              seasonNumber: connData.seasonNumber ? parseInt(connData.seasonNumber, 10) : null,
              episodeNumber: connData.episodeNumber ? parseInt(connData.episodeNumber, 10) : null,
              isHls: true,
              serverId,
              serverName: serverInfo?.name || null,
              serverType: serverInfo?.type || null,
            });
          }
        } else {
          // Regular connection ID - get from database with server info
          try {
            const conn = await prisma.lineConnection.findUnique({
              where: { id: member },
              include: {
                server: {
                  select: { id: true, name: true, type: true },
                },
              },
            });
            
            if (conn) {
              connections.push({
                id: conn.id,
                lineId: conn.lineId,
                username: line.username,
                streamId: conn.streamId,
                ipAddress: conn.ipAddress,
                userAgent: conn.userAgent,
                countryCode: conn.countryCode,
                startedAt: conn.startedAt.toISOString(),
                contentType: conn.contentType || 'LIVE',
                contentName: conn.contentName,
                episodeId: conn.episodeId,
                seasonNumber: conn.seasonNumber,
                episodeNumber: conn.episodeNumber,
                isHls: false,
                serverId: conn.serverId,
                serverName: conn.server?.name || null,
                serverType: conn.server?.type || null,
              });
            }
          } catch {
            // Connection might not exist in DB
          }
        }
      }
    }
  } while (cursor !== '0');
  
  // Sort by startedAt descending
  connections.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  
  return connections;
}

// Backwards compatibility alias
export const authenticateUser = authenticateIptvLine;
