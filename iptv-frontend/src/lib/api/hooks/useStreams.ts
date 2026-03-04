import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Stream, PaginatedResponse, StreamType } from "@/types";

interface StreamFilters {
  type?: StreamType;
  categoryId?: number;
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface CreateStreamData {
  name: string;
  streamType: StreamType;
  categoryId: number;
  sourceUrl: string;
  backupUrls?: string[];
  logoUrl?: string;
  epgChannelId?: string;
  transcodeProfile?: string;
  transcodeProfileId?: number | null;
  transcodeServerId?: number | null;
  abrProfileId?: number | null;
  tvArchiveEnabled?: boolean;
  tvArchiveDuration?: number;
  customUserAgent?: string;
  analyzeDuration?: number;
  probeSize?: number;
  customHeaders?: Record<string, string>;
  serverIds?: number[];
  originServerId?: number;
  childServerIds?: number[];
  bouquetIds?: number[];
}

interface UpdateStreamData extends Partial<CreateStreamData> {
  isActive?: boolean;
  serverIds?: number[];
  originServerId?: number;
  childServerIds?: number[];
  transcodeProfileId?: number | null;
  transcodeServerId?: number | null;
  abrProfileId?: number | null;
  bouquetIds?: number[];
}

interface UseQueryOptions {
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  enabled?: boolean;
}

export function useStreams(filters?: StreamFilters, options?: UseQueryOptions) {
  // Map pageSize to limit for backend compatibility
  const apiFilters = filters ? {
    ...filters,
    limit: filters.pageSize,
    pageSize: undefined,
  } : undefined;
  
  return useQuery({
    queryKey: ["streams", filters],
    queryFn: () => api.get<PaginatedResponse<Stream>>("/admin/streams", apiFilters),
    staleTime: 5000, // Reduced stale time for fresher data
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: options?.refetchIntervalInBackground ?? false,
  });
}

export function useStream(id: number) {
  return useQuery({
    queryKey: ["stream", id],
    queryFn: () => api.get<Stream>(`/admin/streams/${id}`),
    enabled: !!id,
  });
}

export function useCreateStream() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateStreamData) =>
      api.post<Stream>("/admin/streams", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useUpdateStream() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateStreamData }) =>
      api.put<Stream>(`/admin/streams/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["stream", id] });
      queryClient.invalidateQueries({ queryKey: ["stream-details", id] });
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
    },
  });
}

export function useDeleteStream() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/streams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useDuplicateStream() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: number; name?: string }) =>
      api.post<Stream>(`/admin/streams/${id}/duplicate`, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useTestStream() {
  return useMutation({
    mutationFn: (url: string) =>
      api.post<{ success: boolean; message: string }>("/admin/streams/test", {
        url,
      }),
  });
}

// Logo fetching hooks
export interface LogoCandidate {
  url: string;
  source: string;
  name: string;
}

export function useFetchLogos() {
  return useMutation({
    mutationFn: (channelName: string) =>
      api.post<{ logos: LogoCandidate[] }>("/admin/streams/fetch-logos", { channelName }),
  });
}

export function useSaveLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ streamId, logoUrl, removeBackground = true }: { streamId: number; logoUrl: string; removeBackground?: boolean }) =>
      api.post<{ success: boolean; logoUrl: string }>(`/admin/streams/${streamId}/save-logo`, { logoUrl, removeBackground }),
    onSuccess: (_, { streamId }) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useImportStreams() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { type: "m3u" | "url"; content: string }) =>
      api.post<{ imported: number; failed: number }>("/admin/streams/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useLinkTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      streamId,
      tmdbId,
      type,
    }: {
      streamId: number;
      tmdbId: number;
      type: "movie" | "tv";
    }) => api.post(`/admin/streams/${streamId}/tmdb-link`, { tmdbId, type }),
    onSuccess: (_, { streamId }) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useSyncTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post(`/admin/streams/${streamId}/tmdb-sync`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
    },
  });
}

export function useBulkSyncTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/admin/streams/bulk-tmdb-sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

// TMDB Search
export function useTmdbSearch(query: string, type: "movie" | "tv") {
  return useQuery({
    queryKey: ["tmdb-search", type, query],
    queryFn: () =>
      api.get<{ results: unknown[] }>(`/admin/tmdb/search/${type}`, { query }),
    enabled: query.length >= 2,
    staleTime: 60000,
  });
}

// ==================== ALWAYS-ON STREAMS ====================

interface AlwaysOnStream {
  streamId: number;
  name: string;
  status: 'starting' | 'running' | 'error' | 'stopped' | 'pending' | 'disabled';
  startedAt?: string;
  lastError?: string;
  restartCount: number;
  viewers: number;
  alwaysOn?: boolean;
}

interface AlwaysOnStats {
  totalStreams: number;
  runningStreams: number;
  errorStreams: number;
  totalViewers: number;
}

interface AlwaysOnResponse {
  stats: AlwaysOnStats;
  streams: AlwaysOnStream[];
}

export function useAlwaysOnStreams() {
  return useQuery({
    queryKey: ["always-on-streams"],
    queryFn: () => api.get<AlwaysOnResponse>("/admin/streams/always-on"),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useAlwaysOnStreamStatus(streamId: number) {
  return useQuery({
    queryKey: ["always-on-status", streamId],
    queryFn: () => api.get<AlwaysOnStream>(`/admin/streams/${streamId}/always-on/status`),
    enabled: !!streamId,
    refetchInterval: 5000,
  });
}

export function useEnableAlwaysOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post<{ success: boolean; message: string }>(`/admin/streams/${streamId}/always-on/enable`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["always-on-streams"] });
      queryClient.invalidateQueries({ queryKey: ["always-on-status", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useDisableAlwaysOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post<{ success: boolean; message: string }>(`/admin/streams/${streamId}/always-on/disable`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["always-on-streams"] });
      queryClient.invalidateQueries({ queryKey: ["always-on-status", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

export function useRestartAlwaysOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post<{ success: boolean; message: string }>(`/admin/streams/${streamId}/always-on/restart`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["always-on-streams"] });
      queryClient.invalidateQueries({ queryKey: ["always-on-status", streamId] });
    },
  });
}

export function useReloadAlwaysOn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>("/admin/streams/always-on/reload"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["always-on-streams"] });
    },
  });
}

// ==================== STREAM PROBING & HEALTH ====================

export interface StreamProbeResult {
  success: boolean;
  url: string;
  streamId?: number;
  streamName?: string;
  format?: {
    format_name: string;
    format_long_name: string;
    duration: number;
    size: number;
    bit_rate: number;
    probe_score: number;
  };
  streams: Array<{
    index: number;
    codec_name: string;
    codec_long_name: string;
    codec_type: 'video' | 'audio' | 'subtitle' | 'data';
    profile?: string;
    width?: number;
    height?: number;
    display_aspect_ratio?: string;
    r_frame_rate?: string;
    bit_rate?: string;
    sample_rate?: string;
    channels?: number;
    channel_layout?: string;
    language?: string;
  }>;
  video?: {
    codec: string;
    profile?: string;
    resolution: string;
    width: number;
    height: number;
    aspect_ratio?: string;
    frame_rate: string;
    bit_rate?: number;
    pixel_format?: string;
  };
  audio?: {
    codec: string;
    sample_rate?: number;
    channels?: number;
    channel_layout?: string;
    bit_rate?: number;
    language?: string;
  };
  metadata?: Record<string, string>;
  error?: string;
  probeTime: number;
}

export interface StreamHealthResult {
  online: boolean;
  method: 'http' | 'ffprobe';
  latency: number;
  statusCode?: number;
  contentType?: string;
  error?: string;
}

export interface StreamHealthDetails {
  streamId: number;
  streamName: string;
  sourceUrl: string;
  primary: StreamHealthResult;
  backups: Array<{ url: string; health: StreamHealthResult }>;
  cached?: {
    online: boolean;
    latency: number;
    lastCheck: Date;
  } | null;
  anyOnline: boolean;
}

export interface StreamFullDetails {
  stream: Stream & {
    category: { id: number; name: string; type: string };
    serverAssignments: Array<{
      id: number;
      isActive?: boolean;
      server: { id: number; name: string; domain?: string; status: string; region?: string; type?: string };
    }>;
    serverDistribution?: Array<{
      id: number;
      serverId: number;
      role: 'ORIGIN' | 'CHILD';
      tier: number;
      server: { id: number; name: string; domain?: string; status: string; region?: string; type: string };
    }>;
    bouquets: Array<{ bouquet: { id: number; name: string } }>;
  };
  health: {
    online: boolean;
    latency: number;
    lastCheck: Date;
    statusCode?: number;
    contentType?: string;
    error?: string;
  } | null;
  probe: StreamProbeResult | null;
  probeStatus: {
    success: boolean;
    probeTime: number;
    error: string | null;
    checkedAt: string;
  } | null;
  alwaysOn: AlwaysOnStream | null;
  stats: {
    activeViewers: number;
    failoverCount: number;
    lastFailovers: Array<{
      timestamp: string;
      fromSource: string;
      toSource: string;
      reason: string;
    }>;
  };
}

// Probe stream URL (ffprobe)
export function useProbeStreamUrl() {
  return useMutation({
    mutationFn: ({ url, useCache = true }: { url: string; useCache?: boolean }) =>
      api.post<StreamProbeResult>("/admin/streams/probe", { url, useCache }),
  });
}

// Probe stream by ID
export function useProbeStream() {
  return useMutation({
    mutationFn: ({ id, useCache = true }: { id: number; useCache?: boolean }) =>
      api.post<StreamProbeResult>(`/admin/streams/${id}/probe`, { useCache }),
  });
}

// Health check URL
export function useHealthCheckUrl() {
  return useMutation({
    mutationFn: ({ url, useFfprobe = true }: { url: string; useFfprobe?: boolean }) =>
      api.post<StreamHealthResult>("/admin/streams/health", { url, useFfprobe }),
  });
}

// Health check stream by ID
export function useHealthCheckStream() {
  return useMutation({
    mutationFn: ({ id, useFfprobe = true }: { id: number; useFfprobe?: boolean }) =>
      api.post<StreamHealthDetails>(`/admin/streams/${id}/health`, { useFfprobe }),
  });
}

// Get full stream details
export function useStreamDetails(id: number, options?: { includeProbe?: boolean; includeHealth?: boolean }, queryOptions?: UseQueryOptions) {
  return useQuery({
    queryKey: ["stream-details", id, options],
    queryFn: () =>
      api.get<StreamFullDetails>(`/admin/streams/${id}/details`, {
        includeProbe: options?.includeProbe ?? false,
        includeHealth: options?.includeHealth ?? true,
      }),
    enabled: queryOptions?.enabled !== undefined ? queryOptions.enabled : !!id,
    staleTime: 5000, // Reduced stale time for fresher data
    refetchInterval: queryOptions?.refetchInterval,
    refetchIntervalInBackground: queryOptions?.refetchIntervalInBackground ?? false,
  });
}

// Get play URL for admin player
export function useStreamPlayUrl(id: number, format: 'm3u8' | 'ts' = 'm3u8') {
  return useQuery({
    queryKey: ["stream-play-url", id, format],
    queryFn: () =>
      api.get<{
        streamId: number;
        name: string;
        directUrl: string;
        playUrl: string;
        format: string;
        transcodeProfile?: string;
      }>(`/admin/streams/${id}/play-url`, { format }),
    enabled: !!id,
  });
}

// Get failover history
export function useStreamFailoverHistory(id: number) {
  return useQuery({
    queryKey: ["stream-failover-history", id],
    queryFn: () =>
      api.get<{
        streamId: number;
        failovers: Array<{
          timestamp: string;
          fromSource: string;
          toSource: string;
          reason: string;
          type?: string;
        }>;
      }>(`/admin/streams/${id}/failover-history`),
    enabled: !!id,
  });
}

// Batch reorder streams (update sortOrder)
export function useBatchReorderStreams() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: { id: number; sortOrder: number }[]) =>
      api.put<{ success: boolean; updated: number }>("/admin/streams/batch-reorder", { updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}
