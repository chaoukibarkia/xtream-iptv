import { prisma } from '../config/database.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ServerType, ServerStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import os from 'os';

// Cached server info to avoid repeated database lookups
let cachedServerType: ServerType | null = null;
let cachedServerId: number | null = null;
let cacheInitialized = false;

/**
 * Gets the server's external IP address
 * Tries to determine the best public-facing IP
 */
function getServerIp(): string {
  // First check if SERVER_URL contains an IP or hostname
  const serverUrl = config.server.url;
  try {
    const url = new URL(serverUrl);
    if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return url.hostname;
    }
  } catch {
    // Invalid URL, continue with other methods
  }

  // Try to get a non-internal IPv4 address
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }

  // Fallback to localhost
  return '127.0.0.1';
}

/**
 * Ensures the main server is registered in the database
 * Creates it if it doesn't exist, updates it if it does
 */
export async function ensureMainServerRegistered(): Promise<void> {
  const serverName = config.multiServer.serverName || 'main-server';
  const serverIp = getServerIp();
  
  try {
    // Check if a MAIN server already exists
    let mainServer = await prisma.server.findFirst({
      where: { type: ServerType.MAIN },
    });

    if (!mainServer) {
      // Also check by name in case type was different
      mainServer = await prisma.server.findUnique({
        where: { name: serverName },
      });
    }

    if (mainServer) {
      // Update only status and heartbeat - don't overwrite user-configured fields like IPs and ports
      await prisma.server.update({
        where: { id: mainServer.id },
        data: {
          status: ServerStatus.ONLINE,
          type: ServerType.MAIN,
          lastHeartbeat: new Date(),
          healthScore: 100,
          // Don't reset internalIp, externalIp, httpPort, apiPort, etc. - these are user-configured
          // Don't reset cpuUsage, memoryUsage, currentBandwidth - they are updated by SystemMetrics
        },
      });
      logger.debug({ serverId: mainServer.id, name: mainServer.name }, 'Main server heartbeat updated');
    } else {
      // Create the main server
      const apiKey = config.multiServer.serverApiKey || randomUUID();
      
      mainServer = await prisma.server.create({
        data: {
          name: serverName,
          type: ServerType.MAIN,
          status: ServerStatus.ONLINE,
          internalIp: '127.0.0.1',
          externalIp: serverIp,
          httpPort: config.port,
          httpsPort: parseInt(config.server.httpsPort, 10) || 443,
          rtmpPort: parseInt(config.server.rtmpPort, 10) || 1935,
          apiPort: config.port,
          apiKey,
          maxBandwidthMbps: 10000,
          maxConnections: 5000,
          canTranscode: true,
          transcodeProfiles: ['passthrough', 'h264_720p', 'h264_1080p'],
          supportsHls: true,
          supportsMpegts: true,
          supportsRtmp: true,
          healthScore: 100,
          lastHeartbeat: new Date(),
        },
      });
      logger.info({ serverId: mainServer.id, name: mainServer.name }, 'Main server created and registered');
    }

    // Cache the server info for quick lookups
    cachedServerId = mainServer.id;
    cachedServerType = mainServer.type;
    cacheInitialized = true;
  } catch (error) {
    logger.error({ error }, 'Failed to register main server');
    throw error;
  }
}

// Separate cache for the current server's type (based on SERVER_ID)
let currentServerTypeCache: ServerType | null = null;
let currentServerTypeCacheInitialized = false;

/**
 * Check if the current server is the main panel
 * This checks the CURRENT server's type based on SERVER_ID, not the main server's cached type
 */
export async function isMainPanelServer(): Promise<boolean> {
  const serverId = config.multiServer.serverId;

  if (!serverId) {
    // No SERVER_ID configured - this is the main panel (legacy behavior)
    return true;
  }

  // Use cached value if available
  if (currentServerTypeCacheInitialized) {
    return currentServerTypeCache === ServerType.MAIN;
  }

  // Query database for THIS server's type
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: { type: true },
    });

    if (server) {
      currentServerTypeCache = server.type;
      currentServerTypeCacheInitialized = true;
      logger.debug({ serverId, serverType: server.type }, 'Cached current server type');
      return server.type === ServerType.MAIN;
    } else {
      logger.warn({ serverId }, 'Server not found in database');
    }
  } catch (error) {
    logger.error({ error, serverId }, 'Failed to check server type');
  }

  // Server not found - assume NOT main panel (safer default for edge servers)
  return false;
}

/**
 * Get the cached server type for the current server
 */
export function getCachedServerType(): ServerType | null {
  return cachedServerType;
}

/**
 * Check if the current server is the main panel (sync version)
 * Uses the current server type cache if available
 */
export function isMainPanelServerSync(): boolean {
  const serverId = config.multiServer.serverId;

  if (!serverId) {
    return true; // No SERVER_ID = assume main panel (legacy behavior)
  }

  if (currentServerTypeCacheInitialized) {
    return currentServerTypeCache === ServerType.MAIN;
  }

  // Cache not initialized - can't determine without async lookup, assume not main
  return false;
}

