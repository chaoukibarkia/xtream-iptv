import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Server, PaginatedResponse } from "@/types";

interface ServerFilters {
  status?: string;
  region?: string;
  page?: number;
  pageSize?: number;
}

interface CreateServerData {
  name: string;
  type: "MAIN" | "LOAD_BALANCER" | "EDGE_STREAMER" | "TRANSCODER";
  domain?: string;
  internalIp: string;
  externalIp: string;
  httpPort?: number;
  httpsPort?: number;
  rtmpPort?: number;
  apiPort?: number;
  maxBandwidthMbps?: number;
  maxConnections?: number;
  maxTranscodes?: number;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  canTranscode?: boolean;
  transcodeProfiles?: string[];
  supportsHls?: boolean;
  supportsMpegts?: boolean;
  supportsRtmp?: boolean;
  // Hardware acceleration
  hasNvenc?: boolean;
  nvencGpuModel?: string;
  nvencMaxSessions?: number;
  hasQsv?: boolean;
  qsvModel?: string;
  hasVaapi?: boolean;
  vaapiDevice?: string;
}

interface UpdateServerData extends Partial<Omit<CreateServerData, 'type'>> {}

type ServerStatus = "ONLINE" | "OFFLINE" | "MAINTENANCE" | "OVERLOADED" | "DEGRADED";

interface ServerStats {
  servers: {
    total: number;
    online: number;
    offline: number;
    degraded: number;
  };
  bandwidth: {
    total: number;
    used: number;
    percentage: number;
  };
  connections: {
    total: number;
    active: number;
    percentage: number;
  };
  byRegion: Record<string, { count: number; online: number; connections: number }>;
}

interface ServerMetrics {
  cpuHistory: { timestamp: string; value: number }[];
  memoryHistory: { timestamp: string; value: number }[];
  bandwidthHistory: { timestamp: string; value: number }[];
  connectionHistory: { timestamp: string; value: number }[];
}

interface ServerConnection {
  id: number;
  userId: number;
  username: string;
  streamId: number;
  streamName: string;
  clientIp: string;
  startTime: string;
  duration: number;
}

interface ServerStream {
  id: number;
  name: string;
  type: string;
  viewers: number;
  bandwidth: number;
}

export function useServers(filters?: ServerFilters, options?: { refetchInterval?: number; refetchIntervalInBackground?: boolean }) {
  return useQuery({
    queryKey: ["servers", filters],
    queryFn: () => api.get<PaginatedResponse<Server>>("/admin/servers", filters),
    staleTime: 10000, // Refresh more frequently for server status
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchIntervalInBackground,
  });
}

export function useServer(id: number) {
  return useQuery({
    queryKey: ["server", id],
    queryFn: () => api.get<Server>(`/admin/servers/${id}`),
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useServerMetrics(id: number, period: string = "24h") {
  return useQuery({
    queryKey: ["server-metrics", id, period],
    queryFn: () =>
      api.get<ServerMetrics>(`/admin/servers/${id}/metrics`, { period }),
    enabled: !!id,
    staleTime: 30000,
    refetchInterval: 60000, // Auto-refresh every minute
  });
}

export function useServerConnections(id: number) {
  return useQuery({
    queryKey: ["server-connections", id],
    queryFn: () =>
      api.get<ServerConnection[]>(`/admin/servers/${id}/connections`),
    enabled: !!id,
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useServerStreams(id: number) {
  return useQuery({
    queryKey: ["server-streams", id],
    queryFn: () => api.get<ServerStream[]>(`/admin/servers/${id}/streams`),
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useCreateServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateServerData) =>
      api.post<Server>("/admin/servers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function useUpdateServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateServerData }) => {
      console.log('useUpdateServer calling API:', { id, data });
      const result = await api.put<Server>(`/admin/servers/${id}`, data);
      console.log('useUpdateServer API result:', result);
      return result;
    },
    onSuccess: (data, { id }) => {
      console.log('useUpdateServer onSuccess:', { data, id });
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", id] });
    },
    onError: (error) => {
      console.error('useUpdateServer onError:', error);
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/servers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function useServerStats() {
  return useQuery({
    queryKey: ["server-stats"],
    queryFn: () => api.get<ServerStats>("/admin/servers/stats"),
    staleTime: 10000,
    refetchInterval: 30000,
  });
}

export function useUpdateServerStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: number;
      status: ServerStatus;
    }) =>
      api.put(`/admin/servers/${id}/status`, { status }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["server-stats"] });
    },
  });
}

export function useSetServerMaintenance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      maintenance,
    }: {
      id: number;
      maintenance: boolean;
    }) =>
      api.put(`/admin/servers/${id}/status`, { 
        status: maintenance ? "MAINTENANCE" : "ONLINE" 
      }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
      queryClient.invalidateQueries({ queryKey: ["server", id] });
      queryClient.invalidateQueries({ queryKey: ["server-stats"] });
    },
  });
}

export function useRebalanceServers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/admin/servers/rebalance"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["servers"] });
    },
  });
}

export function useKillConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      serverId,
      connectionId,
    }: {
      serverId: number;
      connectionId: number;
    }) =>
      api.post(`/admin/servers/${serverId}/connections/${connectionId}/kill`),
    onSuccess: (_, { serverId }) => {
      queryClient.invalidateQueries({ queryKey: ["server-connections", serverId] });
    },
  });
}

// ==================== EDGE SERVER DEPLOYMENT ====================

interface SshConnectionConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
}

interface TestConnectionResult {
  success: boolean;
  error?: string;
}

export interface ServerProbeResult {
  connected: boolean;
  os?: string;
  osVersion?: string;
  kernel?: string;
  cpuCores?: number;
  memoryGb?: number;
  diskGb?: number;
  gpuDetected: boolean;
  gpuModel?: string;
  gpuMemory?: string;
  gpuDriverVersion?: string;
  dockerInstalled: boolean;
  dockerVersion?: string;
  nodeInstalled: boolean;
  nodeVersion?: string;
  nvidiaDockertoolkit: boolean;
  error?: string;
}

export interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeploymentStatus {
  id: string;
  host: string;
  serverName: string;
  status: 'pending' | 'connecting' | 'detecting' | 'installing' | 'configuring' | 'building' | 'starting' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  steps: DeploymentStep[];
  gpuDetected: boolean;
  gpuModel?: string;
  gpuMemory?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  serverId?: number;
  apiKey?: string;
}

interface StartDeploymentConfig {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
  serverName: string;
  externalIp?: string;
  domain?: string;
  sslEmail?: string;
  maxConnections?: number;
  skipNvidia?: boolean;
  skipHttps?: boolean;
  deploymentMode?: "docker" | "native";
}

export function useTestSshConnection() {
  return useMutation({
    mutationFn: (config: SshConnectionConfig) =>
      api.post<TestConnectionResult>("/admin/servers/deploy/test-connection", config),
  });
}

export function useProbeServer() {
  return useMutation({
    mutationFn: (config: SshConnectionConfig) =>
      api.post<ServerProbeResult>("/admin/servers/deploy/probe", config),
  });
}

export function useStartDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: StartDeploymentConfig) =>
      api.post<{ deploymentId: string; message: string }>("/admin/servers/deploy/start", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-deployments"] });
    },
  });
}

export function useDeploymentStatus(deploymentId: string | null, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: ["deployment-status", deploymentId],
    queryFn: () => api.get<DeploymentStatus>(`/admin/servers/deploy/${deploymentId}`),
    enabled: !!deploymentId,
    staleTime: 0,
    refetchInterval: options?.refetchInterval ?? 2000, // Poll every 2 seconds by default
  });
}

export function useCancelDeployment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deploymentId: string) =>
      api.delete(`/admin/servers/deploy/${deploymentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-deployments"] });
    },
  });
}

export function useActiveDeployments() {
  return useQuery({
    queryKey: ["active-deployments"],
    queryFn: () => api.get<DeploymentStatus[]>("/admin/servers/deploy"),
    staleTime: 5000,
    refetchInterval: 10000,
  });
}
