import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useCallback, useRef } from "react";
import { api } from "../client";

// Types matching backend response
export interface DashboardStats {
  users: {
    total: number;
    active: number;
  };
  streams: {
    total: number;
    live: number;
    vod: number;
    radio?: number;
  };
  connections: {
    active: number;
    live?: number;   // Live TV + ABR viewers
    vod?: number;    // VOD/Movie viewers
  };
}

export type ServerType = 'MAIN' | 'LOAD_BALANCER' | 'EDGE_STREAMER' | 'TRANSCODER';

export interface ConnectionData {
  id: string;
  lineId: number;
  username: string;
  streamId: number;
  ipAddress: string;
  userAgent: string | null;
  countryCode: string | null;
  startedAt: string;
  contentType: 'LIVE' | 'VOD' | 'SERIES' | 'RADIO';
  contentName: string | null;
  episodeId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  isHls: boolean;
  serverId: number | null;
  serverName: string | null;
  serverType: ServerType | null;
}

export interface ConnectionSummary {
  total: number;
  uniqueUsers: number;
  byContentType: {
    LIVE: number;
    VOD: number;
    SERIES: number;
    RADIO: number;
  };
  byCountry: Record<string, number>;
  byServer: Record<string, number>;
  recentConnections: ConnectionData[];
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.get<DashboardStats>("/admin/stats/dashboard"),
    staleTime: 10000,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
    refetchIntervalInBackground: true, // Continue refreshing when tab is not focused
  });
}

export function useActiveConnections() {
  return useQuery({
    queryKey: ["active-connections"],
    queryFn: () => api.get<ConnectionData[]>("/admin/stats/connections"),
    staleTime: 10000,
    refetchInterval: 15000, // Refresh every 15 seconds for live view
    refetchIntervalInBackground: true,
  });
}

export function useConnectionSummary() {
  return useQuery({
    queryKey: ["connection-summary"],
    queryFn: () => api.get<ConnectionSummary>("/admin/stats/connections/summary"),
    staleTime: 10000,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });
}

/**
 * Realtime connections using Server-Sent Events (SSE)
 * Updates connections in real-time (every 2 seconds) instead of polling
 */
export function useRealtimeConnections() {
  const [connections, setConnections] = useState<ConnectionData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryClient = useQueryClient();

  const connect = useCallback(() => {
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Use the proxy path for SSE with API key in query param
    // (EventSource doesn't support custom headers, so we pass API key in URL)
    const apiKey = typeof window !== 'undefined' 
      ? (localStorage.getItem('adminApiKey') || process.env.NEXT_PUBLIC_ADMIN_API_KEY || 'admin-dev-key')
      : 'admin-dev-key';
    const sseUrl = `/api-proxy/admin/stats/connections/stream?apiKey=${encodeURIComponent(apiKey)}`;
    
    try {
      const eventSource = new EventSource(sseUrl);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      eventSource.addEventListener('connections', (event) => {
        try {
          const data = JSON.parse(event.data) as ConnectionData[];
          setConnections(data);
          // Also update the React Query cache for consistency
          queryClient.setQueryData(['active-connections'], data);
        } catch (e) {
          console.error('Failed to parse SSE connections data:', e);
        }
      });

      eventSource.addEventListener('error', (event) => {
        console.error('SSE error event:', event);
      });

      eventSource.onerror = (e) => {
        console.error('SSE connection error:', e);
        setIsConnected(false);
        setError('Connection lost. Reconnecting...');
        
        // Close and try to reconnect after 3 seconds
        eventSource.close();
        setTimeout(() => {
          if (eventSourceRef.current === eventSource) {
            connect();
          }
        }, 3000);
      };
    } catch (e) {
      console.error('Failed to create EventSource:', e);
      setError('Failed to connect to realtime updates');
    }
  }, [queryClient]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Compute summary from connections
  const summary: ConnectionSummary | null = connections.length > 0 ? {
    total: connections.length,
    uniqueUsers: new Set(connections.map(c => c.username)).size,
    byContentType: {
      LIVE: connections.filter(c => c.contentType === 'LIVE').length,
      VOD: connections.filter(c => c.contentType === 'VOD').length,
      SERIES: connections.filter(c => c.contentType === 'SERIES').length,
      RADIO: connections.filter(c => c.contentType === 'RADIO').length,
    },
    byCountry: connections.reduce((acc, c) => {
      const country = c.countryCode || 'UNKNOWN';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byServer: connections.reduce((acc, c) => {
      const server = c.serverName || 'Unknown';
      acc[server] = (acc[server] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    recentConnections: connections.slice(0, 10),
  } : null;

  return {
    connections,
    summary,
    isConnected,
    error,
    reconnect: connect,
    disconnect,
  };
}

export function useServersList() {
  return useQuery({
    queryKey: ["servers"],
    queryFn: () =>
      api.get<{
        servers: Array<{
          id: number;
          name: string;
          type: string;
          status: string;
          internalIp: string;
          externalIp: string;
          httpPort: number;
          currentConnections: number;
          maxConnections: number;
          currentBandwidth: number;
          maxBandwidthMbps: number;
          cpuUsage: number;
          memoryUsage: number;
          healthScore: number;
          lastHeartbeat: string;
          createdAt: string;
          _count?: {
            connections: number;
            streams: number;
          };
        }>;
        pagination: {
          page: number;
          limit: number;
          total: number;
          pages: number;
        };
      }>("/admin/servers"),
    staleTime: 10000,
    refetchInterval: 10000, // More frequent refresh for real-time metrics
    refetchIntervalInBackground: true,
  });
}

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    usage: number;
    total: number;
    used: number;
    free: number;
    totalFormatted: string;
    usedFormatted: string;
    freeFormatted: string;
  };
  load: {
    load1m: number;
    load5m: number;
    load15m: number;
  };
  system: {
    uptime: number;
    uptimeFormatted: string;
    platform: string;
    hostname: string;
  };
  connections: {
    active: number;
    max: number;
  };
  bandwidth: {
    in: number;
    out: number;
    inFormatted: string;
    outFormatted: string;
    total: number;
    totalFormatted: string;
    current: number;
    max: number;
    currentFormatted: string;
    maxFormatted: string;
  };
  server: {
    id: number;
    name: string;
    status: string;
    lastHeartbeat: string;
  } | null;
}

export function useSystemMetrics() {
  return useQuery({
    queryKey: ["system-metrics"],
    queryFn: () => api.get<SystemMetrics>("/admin/servers/system-metrics"),
    staleTime: 5000,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchIntervalInBackground: true,
  });
}

// Bandwidth monitoring types
export interface ServerBandwidthInfo {
  serverId: number;
  serverName: string;
  serverUrl: string;
  maxBandwidthMbps: number;
  currentBandwidthMbps: number;
  availableBandwidthMbps: number;
  usagePercent: number;
  activeConnections: number;
  maxConnections: number;
  healthScore: number;
  lastUpdated: string;
}

export interface BandwidthStatus {
  system: {
    totalMaxBandwidth: number;
    totalCurrentBandwidth: number;
    totalAvailableBandwidth: number;
    overallUsagePercent: number;
    serverCount: number;
    healthyServerCount: number;
  };
  servers: ServerBandwidthInfo[];
}

export function useBandwidthStatus() {
  return useQuery({
    queryKey: ["bandwidth-status"],
    queryFn: () => api.get<BandwidthStatus>("/admin/bandwidth/status"),
    staleTime: 5000,
    refetchInterval: 10000, // Refresh every 10 seconds
    refetchIntervalInBackground: true,
  });
}

export function useCategories(type?: 'LIVE' | 'VOD' | 'SERIES' | 'RADIO') {
  return useQuery({
    queryKey: ["categories", type],
    queryFn: () => api.get<Array<{
      id: number;
      name: string;
      type: string;
      parentId: number | null;
      sortOrder: number;
      isActive: boolean;
      countryCode: string | null;
      flagSvgUrl: string | null;
      _count: { streams: number };
    }>>("/admin/categories", type ? { type } : undefined),
    staleTime: 60000,
  });
}

export function useBouquetsList() {
  return useQuery({
    queryKey: ["bouquets"],
    queryFn: () => api.get<Array<{
      id: number;
      name: string;
      _count: { streams: number; users: number };
    }>>("/admin/bouquets"),
    staleTime: 60000,
  });
}

export function useEpgSources() {
  return useQuery({
    queryKey: ["epg-sources"],
    queryFn: () => api.get<Array<{
      id: number;
      name: string;
      url: string;
      isActive: boolean;
      lastImport: string | null;
    }>>("/admin/epg/sources"),
    staleTime: 60000,
  });
}

// Reseller-specific dashboard stats
export interface ResellerStats {
  subResellers: {
    total: number;
  };
  lines: {
    total: number;
    active: number;
    expired: number;
  };
  activationCodes: {
    total: number;
    unused: number;
    used: number;
  };
  credits: {
    balance: number;
  };
  recentTransactions: Array<{
    id: number;
    type: string;
    amount: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
}

export function useResellerStats() {
  return useQuery({
    queryKey: ["reseller-stats"],
    queryFn: () => api.get<ResellerStats>("/admin/stats/reseller"),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}
