import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { PaginatedResponse } from "@/types";

// Types for External Sources
export interface ExternalSource {
  id: number;
  name: string;
  description: string | null;
  m3uUrl: string;
  epgUrl: string | null;
  isActive: boolean;
  autoSync: boolean;
  syncIntervalHours: number;
  lastSync: string | null;
  lastSyncError: string | null;
  syncStatus: 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';
  defaultStreamType: 'LIVE' | 'VOD' | 'SERIES' | 'RADIO';
  createCategories: boolean;
  updateExisting: boolean;
  categoryPrefix: string | null;
  defaultBouquetId: number | null;
  totalChannels: number;
  importedChannels: number;
  failedChannels: number;
  sourceCountry: string | null;
  sourceLanguage: string | null;
  tags: string[];
  streamCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalSourceFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateExternalSourceData {
  name: string;
  description?: string;
  m3uUrl: string;
  epgUrl?: string;
  isActive?: boolean;
  autoSync?: boolean;
  syncIntervalHours?: number;
  defaultStreamType?: 'LIVE' | 'VOD' | 'SERIES' | 'RADIO';
  createCategories?: boolean;
  updateExisting?: boolean;
  categoryPrefix?: string;
  defaultBouquetId?: number;
  sourceCountry?: string;
  sourceLanguage?: string;
  tags?: string[];
}

export interface SyncResult {
  success: boolean;
  message: string;
  totalChannels: number;
  importedChannels: number;
  updatedChannels: number;
  failedChannels: number;
  newCategories: number;
  errors: string[];
  duration: number;
}

export interface PreviewResult {
  success: boolean;
  error?: string;
  stats?: {
    totalEntries: number;
    categories: number;
    withEpgId: number;
    withLogo: number;
    withCatchup: number;
    byType: Record<string, number>;
  };
  epgUrl?: string;
  sampleEntries?: Array<{
    name: string;
    url: string;
    tvgId?: string;
    tvgLogo?: string;
    groupTitle?: string;
  }>;
}

export interface ExternalSourceStream {
  id: number;
  name: string;
  streamType: string;
  isActive: boolean;
  logoUrl: string | null;
  category: { id: number; name: string } | null;
  externalId: string | null;
  externalName: string;
  groupTitle: string | null;
  lastSynced: string;
}

export interface SourcesStatusSummary {
  sources: Array<{
    id: number;
    name: string;
    syncStatus: string;
    lastSync: string | null;
    totalChannels: number;
    importedChannels: number;
    failedChannels: number;
  }>;
  summary: {
    total: number;
    pending: number;
    syncing: number;
    success: number;
    failed: number;
    partial: number;
  };
}

// List all external sources
export function useExternalSourcesList(filters?: ExternalSourceFilters) {
  return useQuery({
    queryKey: ["external-sources", filters],
    queryFn: () => api.get<{
      sources: ExternalSource[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    }>("/admin/external-sources", filters),
    staleTime: 30000,
  });
}

// Get single external source
export function useExternalSource(id: number) {
  return useQuery({
    queryKey: ["external-source", id],
    queryFn: () => api.get<ExternalSource>(`/admin/external-sources/${id}`),
    enabled: !!id,
  });
}

// Create external source
export function useCreateExternalSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateExternalSourceData) =>
      api.post<ExternalSource>("/admin/external-sources", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
    },
  });
}

// Update external source
export function useUpdateExternalSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateExternalSourceData> }) =>
      api.put<ExternalSource>(`/admin/external-sources/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
      queryClient.invalidateQueries({ queryKey: ["external-source", id] });
    },
  });
}

// Delete external source
export function useDeleteExternalSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deleteStreams = false }: { id: number; deleteStreams?: boolean }) =>
      api.delete(`/admin/external-sources/${id}?deleteStreams=${deleteStreams}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

// Preview M3U URL without importing
export function usePreviewExternalSource() {
  return useMutation({
    mutationFn: (url: string) =>
      api.post<PreviewResult>("/admin/external-sources/preview", { url }),
  });
}

// Sync external source (import/update streams)
export function useSyncExternalSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dryRun = false }: { id: number; dryRun?: boolean }) =>
      api.post<SyncResult>(`/admin/external-sources/${id}/sync`, { dryRun }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
      queryClient.invalidateQueries({ queryKey: ["external-source", id] });
      queryClient.invalidateQueries({ queryKey: ["external-source-streams", id] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Get streams from external source
export function useExternalSourceStreams(id: number, page = 1, limit = 50) {
  return useQuery({
    queryKey: ["external-source-streams", id, page, limit],
    queryFn: () => api.get<{
      streams: ExternalSourceStream[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        pages: number;
      };
    }>(`/admin/external-sources/${id}/streams`, { page, limit }),
    enabled: !!id,
  });
}

// Cleanup removed streams from external source
export function useCleanupExternalSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ success: boolean; message: string; removedCount: number }>(
        `/admin/external-sources/${id}/cleanup`
      ),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
      queryClient.invalidateQueries({ queryKey: ["external-source", id] });
      queryClient.invalidateQueries({ queryKey: ["external-source-streams", id] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
    },
  });
}

// Sync all auto-sync enabled sources
export function useSyncAllExternalSources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; message: string; results: Array<{ sourceId: number; result: SyncResult }> }>(
        "/admin/external-sources/sync-all"
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Get all external sources sync status
export function useExternalSourcesStatus() {
  return useQuery({
    queryKey: ["external-sources-status"],
    queryFn: () => api.get<SourcesStatusSummary>("/admin/external-sources/status"),
    staleTime: 10000,
    refetchInterval: 30000, // Refresh every 30 seconds to show sync progress
  });
}

// Create pre-configured French source
export function useCreateFrenchSourcePreset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      api.post<{ success: boolean; message: string; source: ExternalSource }>(
        "/admin/external-sources/presets/french"
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["external-sources"] });
    },
  });
}
