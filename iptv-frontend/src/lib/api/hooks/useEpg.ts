import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { EpgChannel, EpgProgram, PaginatedResponse } from "@/types";

interface EpgSourceFilters {
  search?: string;
  status?: 'active' | 'error' | 'updating';
  page?: number;
  pageSize?: number;
}

export interface EpgSource {
  id: number;
  name: string;
  url: string;
  status: 'active' | 'error' | 'updating';
  lastImport: string | null;
  channelsMapped: number;
  totalChannels: number;
  updateInterval: number; // in hours
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateEpgSourceData {
  name: string;
  url: string;
  updateInterval?: number;
  isActive?: boolean;
}

interface UpdateEpgSourceData extends Partial<CreateEpgSourceData> {}

export interface EpgMapping {
  id: number;
  streamId: number;
  streamName: string;
  epgChannelId: string;
  epgChannelName: string;
  sourceId: number;
}

export interface EpgChannelInfo {
  id: string;
  isAssigned: boolean;
  assignedStreamId: number | null;
  assignedStreamName: string | null;
}

export interface StreamEpgInfo {
  streamId: number;
  streamName: string;
  epgChannelId: string | null;
  hasEpgData: boolean;
  currentProgram: {
    id: number;
    title: string;
    description: string | null;
    start: string;
    end: string;
    language: string | null;
  } | null;
  upcomingPrograms: Array<{
    id: number;
    title: string;
    description?: string;
    start: string;
    end: string;
    language?: string;
  }>;
}

export function useEpgSourcesList(filters?: EpgSourceFilters) {
  return useQuery({
    queryKey: ["epg-sources", filters],
    queryFn: () => api.get<PaginatedResponse<EpgSource>>("/admin/epg/sources", filters),
    staleTime: 30000,
  });
}

export function useEpgSource(id: number) {
  return useQuery({
    queryKey: ["epg-source", id],
    queryFn: () => api.get<EpgSource>(`/admin/epg/sources/${id}`),
    enabled: !!id,
  });
}

export function useCreateEpgSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEpgSourceData) =>
      api.post<EpgSource>("/admin/epg/sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
    },
  });
}

export function useUpdateEpgSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateEpgSourceData }) =>
      api.put<EpgSource>(`/admin/epg/sources/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
      queryClient.invalidateQueries({ queryKey: ["epg-source", id] });
    },
  });
}

export function useDeleteEpgSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/epg/sources/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
    },
  });
}

export function useRefreshEpgSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/epg/sources/${id}/refresh`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["epg-source", id] });
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
      queryClient.invalidateQueries({ queryKey: ["epg-channels"] });
    },
  });
}

export function useRefreshAllEpgSources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/admin/epg/sources/refresh-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
      queryClient.invalidateQueries({ queryKey: ["epg-channels"] });
    },
  });
}

// Get available EPG channels
export function useEpgChannels(search?: string) {
  return useQuery({
    queryKey: ["epg-channels", search],
    queryFn: () => api.get<EpgChannelInfo[]>("/admin/epg/channels", { search }),
    staleTime: 60000,
  });
}

export function useEpgPrograms(channelId: string, date?: string) {
  return useQuery({
    queryKey: ["epg-programs", channelId, date],
    queryFn: () => api.get<EpgProgram[]>(`/admin/epg/programs/${channelId}`, { date }),
    enabled: !!channelId,
    staleTime: 60000,
  });
}

export function useEpgMappings() {
  return useQuery({
    queryKey: ["epg-mappings"],
    queryFn: () => api.get<EpgMapping[]>("/admin/epg/mappings"),
    staleTime: 60000,
  });
}

export function useCreateEpgMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ streamId, epgChannelId }: { streamId: number; epgChannelId: string }) =>
      api.post("/admin/epg/mappings", { streamId, epgChannelId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-mappings"] });
    },
  });
}

export function useDeleteEpgMapping() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/epg/mappings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-mappings"] });
    },
  });
}

export function useAutoMapEpg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{
      success: boolean;
      message: string;
      mappings: Array<{ streamId: number; streamName: string; epgChannelId: string }>;
    }>("/admin/epg/auto-map"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-mappings"] });
      queryClient.invalidateQueries({ queryKey: ["epg-channels"] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["stream-details"] });
    },
  });
}

export function useImportEpgXmltv() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { url?: string; content?: string }) =>
      api.post<{ imported: number; channels: number }>("/admin/epg/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["epg-sources"] });
      queryClient.invalidateQueries({ queryKey: ["epg-channels"] });
    },
  });
}

export function useEpgStats() {
  return useQuery({
    queryKey: ["epg-stats"],
    queryFn: () => api.get<{
      sources: number;
      mappedChannels: number;
      totalChannels: number;
      coveragePercent: number;
      guideDataDays: number;
    }>("/admin/epg/stats"),
    staleTime: 60000,
  });
}

// Stream-specific EPG hooks
export function useStreamEpg(streamId: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["stream-epg", streamId],
    queryFn: () => api.get<StreamEpgInfo>(`/admin/streams/${streamId}/epg`),
    enabled: options?.enabled ?? !!streamId,
    staleTime: 30000,
  });
}

export function useAssignStreamEpg() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ streamId, epgChannelId }: { streamId: number; epgChannelId: string | null }) =>
      api.post<{
        success: boolean;
        message: string;
        stream: { id: number; name: string; epgChannelId: string | null };
      }>(`/admin/streams/${streamId}/epg`, { epgChannelId }),
    onSuccess: (_, { streamId }) => {
      queryClient.invalidateQueries({ queryKey: ["stream-epg", streamId] });
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["stream-details", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["epg-channels"] });
    },
  });
}

