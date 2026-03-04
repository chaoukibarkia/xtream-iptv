import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { VodItem, PaginatedResponse } from "@/types";

interface VodFilters {
  categoryId?: number;
  search?: string;
  synced?: boolean;
  page?: number;
  pageSize?: number;
}

interface CreateVodData {
  name: string;
  categoryId?: number; // Deprecated but kept for backward compatibility
  categoryIds?: number[]; // New multi-category support
  sourceUrl: string;
  year?: number;
  rating?: number;
  runtime?: number;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  tmdbId?: number;
  isActive?: boolean;
  // Additional TMDB fields
  genres?: string;
  cast?: string;
  director?: string;
  youtubeTrailer?: string;
}

interface UpdateVodData extends Partial<CreateVodData> {}

export interface Subtitle {
  id: number;
  streamId: number;
  language: string;
  languageLabel?: string;
  format: 'srt' | 'vtt' | 'ass';
  isDefault: boolean;
  isForced: boolean;
  sourceUrl?: string;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VodWithDetails extends VodItem {
  name: string;
  year?: number;
  rating?: number;
  runtime?: number;
  posterUrl?: string;
  backdropUrl?: string;
  overview?: string;
  genres?: string;
  cast?: string;
  director?: string;
  youtubeTrailer?: string;
  containerExtension?: string;
  tmdbId?: number;
  category?: {
    id: number;
    name: string;
  };
  categories?: Array<{
    isPrimary: boolean;
    category: {
      id: number;
      name: string;
    };
  }>;
  tmdbSynced?: boolean;
  subtitles?: Subtitle[];
  viewerCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CreateSubtitleData {
  language: string;
  languageLabel?: string;
  format?: 'srt' | 'vtt' | 'ass';
  isDefault?: boolean;
  isForced?: boolean;
  sourceUrl?: string;
  content?: string;
}

interface UpdateSubtitleData extends Partial<CreateSubtitleData> {}

export function useAllVod(filters?: VodFilters) {
  return useQuery({
    queryKey: ["vod", filters],
    queryFn: () => api.get<PaginatedResponse<VodWithDetails>>("/admin/vod", filters),
    staleTime: 0, // Always refetch when invalidated (was 30000)
  });
}

export function useVod(id: number) {
  return useQuery({
    queryKey: ["vod", id],
    queryFn: () => api.get<VodWithDetails>(`/admin/vod/${id}`),
    enabled: !!id,
  });
}

export function useCreateVod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateVodData) =>
      api.post<VodWithDetails>("/admin/vod", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["vod"],
        refetchType: 'active'
      });
    },
  });
}

export function useUpdateVod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateVodData }) =>
      api.put<VodWithDetails>(`/admin/vod/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ 
        queryKey: ["vod"],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ["vod", id],
        refetchType: 'active'
      });
    },
  });
}

export function useDeleteVod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/vod/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["vod"],
        refetchType: 'active' // Immediately refetch active queries
      });
    },
  });
}

export function useSyncVodTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/vod/${id}/tmdb-sync`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["vod", id] });
      queryClient.invalidateQueries({ queryKey: ["vod"] });
    },
  });
}

export function useBulkSyncVodTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/admin/vod/bulk-tmdb-sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vod"] });
    },
  });
}

export function useLinkVodTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vodId, tmdbId }: { vodId: number; tmdbId: number }) =>
      api.post(`/admin/vod/${vodId}/tmdb-link`, { tmdbId }),
    onSuccess: (_, { vodId }) => {
      queryClient.invalidateQueries({ queryKey: ["vod", vodId] });
      queryClient.invalidateQueries({ queryKey: ["vod"] });
    },
  });
}

export function useVodStats() {
  return useQuery({
    queryKey: ["vod-stats"],
    queryFn: () => api.get<{
      total: number;
      synced: number;
      pending: number;
      recentlyAdded: number;
    }>("/admin/vod/stats"),
    staleTime: 60000,
  });
}

// ==================== SUBTITLE HOOKS ====================

export function useVodSubtitles(vodId: number) {
  return useQuery({
    queryKey: ["vod", vodId, "subtitles"],
    queryFn: () => api.get<Subtitle[]>(`/admin/vod/${vodId}/subtitles`),
    enabled: !!vodId,
  });
}

export function useAddSubtitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vodId, data }: { vodId: number; data: CreateSubtitleData }) =>
      api.post<Subtitle>(`/admin/vod/${vodId}/subtitles`, data),
    onSuccess: (_, { vodId }) => {
      queryClient.invalidateQueries({ queryKey: ["vod", vodId] });
      queryClient.invalidateQueries({ queryKey: ["vod", vodId, "subtitles"] });
    },
  });
}

export function useUpdateSubtitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vodId, subtitleId, data }: { vodId: number; subtitleId: number; data: UpdateSubtitleData }) =>
      api.put<Subtitle>(`/admin/vod/${vodId}/subtitles/${subtitleId}`, data),
    onSuccess: (_, { vodId }) => {
      queryClient.invalidateQueries({ queryKey: ["vod", vodId] });
      queryClient.invalidateQueries({ queryKey: ["vod", vodId, "subtitles"] });
    },
  });
}

export function useDeleteSubtitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ vodId, subtitleId }: { vodId: number; subtitleId: number }) =>
      api.delete(`/admin/vod/${vodId}/subtitles/${subtitleId}`),
    onSuccess: (_, { vodId }) => {
      queryClient.invalidateQueries({ queryKey: ["vod", vodId] });
      queryClient.invalidateQueries({ queryKey: ["vod", vodId, "subtitles"] });
    },
  });
}

// ==================== MEDIA PROBE HOOKS ====================

export interface VideoTrack {
  index: number;
  codec: string;
  codecLong: string;
  width: number;
  height: number;
  frameRate: string;
  bitrate?: number;
  profile?: string;
  level?: string;
  pixelFormat?: string;
  colorSpace?: string;
  hdr?: boolean;
  resolution: string;
  formattedBitrate?: string;
}

export interface AudioTrack {
  index: number;
  codec: string;
  codecLong: string;
  channels: number;
  channelLayout?: string;
  sampleRate: number;
  bitrate?: number;
  language?: string;
  title?: string;
  isDefault?: boolean;
  channelLabel: string;
  formattedBitrate?: string;
  formattedSampleRate: string;
}

export interface SubtitleTrack {
  index: number;
  codec: string;
  codecLong: string;
  language?: string;
  title?: string;
  isDefault?: boolean;
  isForced?: boolean;
}

export interface MediaProbeInfo {
  format: string;
  formatLong: string;
  duration: number;
  size: number;
  bitrate: number;
  formattedDuration: string;
  formattedSize: string;
  formattedBitrate: string;
  videoTracks: VideoTrack[];
  audioTracks: AudioTrack[];
  subtitleTracks: SubtitleTrack[];
  chapters?: { start: number; end: number; title?: string }[];
}

export function useVodProbe(vodId: number) {
  return useQuery({
    queryKey: ["vod", vodId, "probe"],
    queryFn: () => api.get<MediaProbeInfo>(`/admin/vod/${vodId}/probe`),
    enabled: !!vodId,
    staleTime: 300000, // Cache for 5 minutes since file info doesn't change
    retry: 1, // Only retry once on failure
  });
}

