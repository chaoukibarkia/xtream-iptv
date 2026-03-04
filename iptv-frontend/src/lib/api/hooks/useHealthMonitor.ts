import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// Types matching the backend HealthCheckConfig
export interface HealthCheckConfig {
  /** Health check interval in milliseconds (default: 30000 = 30 seconds) */
  checkIntervalMs: number;
  /** Timeout for probe operations in milliseconds */
  probeTimeoutMs: number;
  /** Max consecutive failures before restart */
  maxConsecutiveFailures: number;
  /** Memory threshold in MB - restart if exceeded */
  memoryThresholdMb: number;
  /** CPU threshold percentage - alert if exceeded */
  cpuThresholdPercent: number;
  /** Duration to analyze for frozen video detection (seconds) */
  frozenDetectionDuration: number;
  /** Duration to analyze for silent audio detection (seconds) */
  silentDetectionDuration: number;
  /** Minimum audio level (dB) - below this is considered silent */
  silentAudioThresholdDb: number;
  /** Maximum frame difference threshold for frozen video detection */
  frozenFrameThreshold: number;
  /** Cooldown between restarts in milliseconds */
  restartCooldownMs: number;
  /** Enable audio checks */
  enableAudioChecks: boolean;
  /** Enable video frozen checks */
  enableFrozenChecks: boolean;
  /** Enable process metrics monitoring */
  enableProcessMetrics: boolean;
  /** Enable HTTP reachability checks */
  enableHttpChecks: boolean;
}

export interface HealthIssue {
  type: 'http_error' | 'connection_lost' | 'timeout' | 'silent_audio' | 'frozen_video' | 
        'missing_audio' | 'missing_video' | 'high_memory' | 'high_cpu' | 'process_unresponsive';
  message: string;
  timestamp: string;
  severity: 'warning' | 'critical';
}

export interface ProcessMetrics {
  pid: number;
  cpuPercent: number;
  memoryMb: number;
  memoryPercent: number;
  uptime: number;
  isResponsive: boolean;
}

export interface AudioStatus {
  hasAudio: boolean;
  isSilent: boolean;
  meanVolume: number | null;
  maxVolume: number | null;
  lastChecked: string;
}

export interface VideoStatus {
  hasVideo: boolean;
  isFrozen: boolean;
  fps: number | null;
  resolution: string | null;
  frameDifference: number | null;
  lastChecked: string;
}

export interface StreamHealthStatus {
  streamId: number;
  name: string;
  pid: number | null;
  isHealthy: boolean;
  lastCheck: string;
  consecutiveFailures: number;
  lastRestartAt: string | null;
  restartCount: number;
  issues: HealthIssue[];
  metrics: ProcessMetrics | null;
  audioStatus: AudioStatus | null;
  videoStatus: VideoStatus | null;
}

export interface HealthStats {
  total: number;
  healthy: number;
  unhealthy: number;
  totalRestarts: number;
  lastCheck: string | null;
}

export interface HealthCheckResult {
  streamId: number;
  success: boolean;
  issues: HealthIssue[];
  shouldRestart: boolean;
  metrics?: ProcessMetrics;
  audioStatus?: AudioStatus;
  videoStatus?: VideoStatus;
}

// Get health status for all always-on streams
export function useAlwaysOnHealth() {
  return useQuery({
    queryKey: ["alwaysOnHealth"],
    queryFn: () => api.get<{
      success: boolean;
      stats: HealthStats;
      streams: StreamHealthStatus[];
    }>("/admin/streams/always-on/health"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Get health status for a specific stream
export function useStreamHealth(streamId: number) {
  return useQuery({
    queryKey: ["alwaysOnHealth", streamId],
    queryFn: () => api.get<{
      success: boolean;
      health: StreamHealthStatus;
    }>(`/admin/streams/always-on/${streamId}/health`),
    enabled: !!streamId,
    refetchInterval: 15000, // Refresh every 15 seconds
  });
}

// Force a health check on a specific stream
export function useForceHealthCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post<{
        success: boolean;
        result: HealthCheckResult;
      }>(`/admin/streams/always-on/${streamId}/health/check`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["alwaysOnHealth"] });
      queryClient.invalidateQueries({ queryKey: ["alwaysOnHealth", streamId] });
    },
  });
}

// Get health monitor configuration
export function useHealthMonitorConfig() {
  return useQuery({
    queryKey: ["healthMonitorConfig"],
    queryFn: () => api.get<{
      success: boolean;
      config: HealthCheckConfig;
    }>("/admin/streams/always-on/health/config"),
    staleTime: 60000, // Cache for 1 minute
  });
}

// Update health monitor configuration
export function useUpdateHealthMonitorConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<HealthCheckConfig>) =>
      api.put<{
        success: boolean;
        message: string;
        config: HealthCheckConfig;
      }>("/admin/streams/always-on/health/config", config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["healthMonitorConfig"] });
    },
  });
}


