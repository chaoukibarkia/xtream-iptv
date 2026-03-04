import os from 'os';
import * as fs from 'fs';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import { ServerType } from '@prisma/client';

// Store previous network stats for bandwidth calculation
let previousNetworkStats: { timestamp: number; rx: number; tx: number } | null = null;
let currentBandwidth: { in: number; out: number } = { in: 0, out: 0 };

/**
 * Get network interface statistics (Linux only)
 */
function getNetworkStats(): { rx: number; tx: number } {
  try {
    // Read /proc/net/dev for network statistics on Linux
    if (os.platform() !== 'linux') {
      return { rx: 0, tx: 0 };
    }
    
    const data = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = data.split('\n');
    
    let totalRx = 0;
    let totalTx = 0;
    
    for (const line of lines) {
      // Skip header lines and loopback
      if (line.includes(':') && !line.includes('lo:')) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 10) {
          // Format: interface: rx_bytes rx_packets ... tx_bytes tx_packets ...
          const interfacePart = parts[0].replace(':', '');
          const rxBytes = parseInt(parts[1], 10) || 0;
          const txBytes = parseInt(parts[9], 10) || 0;
          
          totalRx += rxBytes;
          totalTx += txBytes;
        }
      }
    }
    
    return { rx: totalRx, tx: totalTx };
  } catch (error) {
    return { rx: 0, tx: 0 };
  }
}

/**
 * Update bandwidth calculation based on network stats delta
 */
function updateBandwidthStats(): void {
  const now = Date.now();
  const stats = getNetworkStats();
  
  if (previousNetworkStats !== null) {
    const timeDelta = (now - previousNetworkStats.timestamp) / 1000; // seconds
    if (timeDelta > 0) {
      const rxDelta = stats.rx - previousNetworkStats.rx;
      const txDelta = stats.tx - previousNetworkStats.tx;
      
      // Calculate bytes per second
      currentBandwidth.in = Math.max(0, Math.round(rxDelta / timeDelta));
      currentBandwidth.out = Math.max(0, Math.round(txDelta / timeDelta));
    }
  }
  
  previousNetworkStats = { timestamp: now, rx: stats.rx, tx: stats.tx };
}

/**
 * Get current bandwidth in bytes per second
 */
export function getCurrentBandwidth(): { in: number; out: number } {
  return { ...currentBandwidth };
}

export interface SystemMetrics {
  cpuUsage: number;       // 0-100 percentage
  memoryUsage: number;    // 0-100 percentage
  memoryTotal: number;    // bytes
  memoryUsed: number;     // bytes
  memoryFree: number;     // bytes
  loadAverage: number[];  // 1, 5, 15 minute load averages
  uptime: number;         // seconds
  platform: string;
  hostname: string;
  cpuCores: number;
  bandwidthIn: number;    // bytes per second (inbound)
  bandwidthOut: number;   // bytes per second (outbound)
}

/**
 * Get current system metrics
 */
export function getSystemMetrics(): SystemMetrics {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  
  // Calculate CPU usage from all cores
  let totalIdle = 0;
  let totalTick = 0;
  
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      totalTick += cpu.times[type as keyof typeof cpu.times];
    }
    totalIdle += cpu.times.idle;
  }
  
  // Get CPU usage as percentage (this is instantaneous, not averaged)
  const cpuUsage = Math.round(((totalTick - totalIdle) / totalTick) * 100);
  
  // Memory usage percentage
  const memoryUsage = Math.round((usedMemory / totalMemory) * 100);
  
  // Load average (Unix only, returns [0,0,0] on Windows)
  const loadAverage = os.loadavg();
  
  // Get current bandwidth
  const bandwidth = getCurrentBandwidth();
  
  return {
    cpuUsage,
    memoryUsage,
    memoryTotal: totalMemory,
    memoryUsed: usedMemory,
    memoryFree: freeMemory,
    loadAverage,
    uptime: os.uptime(),
    platform: os.platform(),
    hostname: os.hostname(),
    cpuCores: cpus.length,
    bandwidthIn: bandwidth.in,
    bandwidthOut: bandwidth.out,
  };
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format bytes to megabits (Mb) for bandwidth display
 */
export function formatBandwidth(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return '0 Mb/s';
  // Convert bytes to bits, then to megabits
  const megabits = (bytesPerSecond * 8) / (1000 * 1000);
  if (megabits < 1) {
    const kilobits = (bytesPerSecond * 8) / 1000;
    return `${kilobits.toFixed(1)} Kb/s`;
  }
  if (megabits >= 1000) {
    const gigabits = megabits / 1000;
    return `${gigabits.toFixed(2)} Gb/s`;
  }
  return `${megabits.toFixed(1)} Mb/s`;
}

/**
 * Format uptime to human readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

// Store previous CPU times for accurate measurement
let previousCpuTimes: { idle: number; total: number } | null = null;

/**
 * Get accurate CPU usage by comparing with previous measurement
 */
export function getAccurateCpuUsage(): number {
  const cpus = os.cpus();
  
  let idle = 0;
  let total = 0;
  
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type as keyof typeof cpu.times];
    }
    idle += cpu.times.idle;
  }
  
  if (previousCpuTimes === null) {
    previousCpuTimes = { idle, total };
    return 0;
  }
  
  const idleDiff = idle - previousCpuTimes.idle;
  const totalDiff = total - previousCpuTimes.total;
  
  previousCpuTimes = { idle, total };
  
  if (totalDiff === 0) return 0;
  
  return Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
}

/**
 * Update server metrics in database (works for both main and edge servers)
 * 
 * For edge servers: Uses SERVER_ID from config to find the correct server record
 * For main server: Falls back to MAIN type if SERVER_ID not configured
 */
export async function updateServerMetrics(): Promise<void> {
  try {
    const metrics = getSystemMetrics();
    const cpuUsage = getAccurateCpuUsage();
    const bandwidth = getCurrentBandwidth();
    
    // Find the server based on configuration
    // Priority: 1. SERVER_ID, 2. SERVER_NAME, 3. MAIN type fallback
    const serverId = config.multiServer?.serverId;
    const serverName = config.multiServer?.serverName;
    
    let server = null;
    
    // Try to find by SERVER_ID first (most reliable for edge servers)
    if (serverId) {
      server = await prisma.server.findUnique({ where: { id: serverId } });
      if (!server) {
        logger.warn({ serverId }, 'Server with configured SERVER_ID not found in database');
      }
    }
    
    // Fallback to SERVER_NAME
    if (!server && serverName) {
      server = await prisma.server.findUnique({ where: { name: serverName } });
    }
    
    // Final fallback to MAIN type (for main panel without explicit config)
    if (!server) {
      server = await prisma.server.findFirst({
        where: { type: ServerType.MAIN },
      });
    }
    
    if (!server) {
      logger.debug('No server found to update metrics');
      return;
    }
    
    // Count active connections
    // For edge servers, count HLS connections that have this server's ID
    // For main server, count all connections
    let activeConnections = 0;
    try {
      if (serverId) {
        // Edge server: Count HLS connections with this server's ID
        // HLS connections are stored in Redis as hls:line:{lineId}:{viewerId} with serverId field
        const hlsKeys = await redis.keys('hls:line:*');
        
        for (const key of hlsKeys) {
          const connServerId = await redis.hget(key, 'serverId');
          if (connServerId === serverId.toString()) {
            activeConnections++;
          }
        }
        
        // Also count from database as fallback/addition
        const dbConnections = await prisma.lineConnection.count({
          where: { serverId: server.id },
        });
        
        // Use the higher count (in case Redis keys expired but DB still has records)
        activeConnections = Math.max(activeConnections, dbConnections);
      } else {
        // Main server: Count all viewer keys (global count)
        const [liveViewerKeys, abrViewerKeys, vodViewerKeys] = await Promise.all([
          redis.keys('stream:*:viewer:*'),
          redis.keys('abr:*:viewer:*'),
          redis.keys('vod:*:viewer:*'),
        ]);
        
        // Filter out cascade keys (server-to-server connections, not real viewers)
        const realLiveViewerKeys = liveViewerKeys.filter(k => !k.includes(':viewer:cascade:'));
        const realAbrViewerKeys = abrViewerKeys.filter(k => !k.includes(':viewer:cascade:'));
        
        activeConnections = realLiveViewerKeys.length + realAbrViewerKeys.length + vodViewerKeys.length;
      }
    } catch (redisError) {
      logger.warn({ error: redisError }, 'Failed to count viewers from Redis, falling back to database');
      // Fallback to database count for this server
      if (serverId) {
        activeConnections = await prisma.lineConnection.count({
          where: { serverId: server.id },
        });
      } else {
        activeConnections = await prisma.lineConnection.count();
      }
    }
    
    // Calculate bandwidth in Mbps (bytes/s -> Mbps)
    const totalBandwidthMbps = Math.round(((bandwidth.in + bandwidth.out) * 8) / (1000 * 1000));
    
    // Update the server record
    // Also set status to ONLINE if it was OFFLINE (server is alive if it can update metrics)
    await prisma.server.update({
      where: { id: server.id },
      data: {
        cpuUsage: cpuUsage,
        memoryUsage: metrics.memoryUsage,
        currentConnections: activeConnections,
        currentBandwidth: totalBandwidthMbps,
        lastHeartbeat: new Date(),
        // Reset failed checks since we're successfully updating
        failedChecks: 0,
        // Mark server as ONLINE if it was OFFLINE
        ...(server.status === 'OFFLINE' ? { status: 'ONLINE' } : {}),
      },
    });
    
    logger.debug({ 
      serverId: server.id,
      serverName: server.name,
      serverType: server.type,
      cpuUsage, 
      memoryUsage: metrics.memoryUsage,
      connections: activeConnections,
      bandwidthMbps: totalBandwidthMbps,
    }, 'Updated server metrics');
  } catch (error) {
    logger.error({ error }, 'Failed to update server metrics');
  }
}

/**
 * @deprecated Use updateServerMetrics() instead - this alias is kept for backward compatibility
 */
export async function updateMainServerMetrics(): Promise<void> {
  return updateServerMetrics();
}

// Singleton for metrics collection interval
let metricsInterval: NodeJS.Timeout | null = null;

/**
 * Start collecting metrics periodically
 */
export function startMetricsCollection(intervalMs: number = 10000): void {
  if (metricsInterval) {
    return;
  }
  
  // Initial CPU measurement
  getAccurateCpuUsage();
  
  // Initial bandwidth measurement
  updateBandwidthStats();
  
  // Update every interval
  metricsInterval = setInterval(async () => {
    updateBandwidthStats();
    await updateServerMetrics();
  }, intervalMs);
  
  logger.info({ intervalMs }, 'Started system metrics collection');
}

/**
 * Stop collecting metrics
 */
export function stopMetricsCollection(): void {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
    logger.info('Stopped system metrics collection');
  }
}

export const systemMetrics = {
  getSystemMetrics,
  getAccurateCpuUsage,
  getCurrentBandwidth,
  updateServerMetrics,
  updateMainServerMetrics, // deprecated alias
  startMetricsCollection,
  stopMetricsCollection,
  formatBytes,
  formatBandwidth,
  formatUptime,
};
