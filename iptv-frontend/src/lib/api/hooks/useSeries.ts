import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { SeriesItem, SeriesSeason, SeriesEpisode, PaginatedResponse } from "@/types";

interface SeriesFilters {
  categoryId?: number;
  search?: string;
  status?: 'ongoing' | 'completed' | 'cancelled';
  page?: number;
  pageSize?: number;
}

interface CreateSeriesData {
  name: string;
  categoryId?: number; // Deprecated but kept for backward compatibility
  categoryIds?: number[]; // New multi-category support
  tmdbId?: number;
  coverUrl?: string;
  backdropUrl?: string;
  genre?: string;
  year?: number;
  rating?: number;
  isActive?: boolean;
  // Additional TMDB fields
  plot?: string;
  cast?: string;
  director?: string;
}

interface UpdateSeriesData extends Partial<CreateSeriesData> {}

interface CreateSeasonData {
  seriesId: number;
  seasonNumber: number;
  name?: string;
  overview?: string;
}

interface CreateEpisodeData {
  seasonId: number;
  episodeNumber: number;
  name: string;
  overview?: string;
  sourceUrl?: string;
  runtime?: number;
  airDate?: string;
}

interface UpdateEpisodeData extends Partial<CreateEpisodeData> {}

export function useAllSeries(filters?: SeriesFilters) {
  return useQuery({
    queryKey: ["series", filters],
    queryFn: () => api.get<PaginatedResponse<SeriesItem>>("/admin/series", filters),
    staleTime: 0, // Always refetch when invalidated (was 30000)
  });
}

export function useSeries(id: number) {
  return useQuery({
    queryKey: ["series", id],
    queryFn: () => api.get<SeriesItem>(`/admin/series/${id}`),
    enabled: !!id,
  });
}

export function useSeriesSeasons(seriesId: number) {
  return useQuery({
    queryKey: ["series-seasons", seriesId],
    queryFn: () => api.get<SeriesSeason[]>(`/admin/series/${seriesId}/seasons`),
    enabled: !!seriesId,
  });
}

export function useSeasonEpisodes(seasonId: number) {
  return useQuery({
    queryKey: ["season-episodes", seasonId],
    queryFn: () => api.get<SeriesEpisode[]>(`/admin/seasons/${seasonId}/episodes`),
    enabled: !!seasonId,
  });
}

export function useCreateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSeriesData) =>
      api.post<SeriesItem>("/admin/series", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["series"],
        refetchType: 'active'
      });
    },
  });
}

export function useUpdateSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSeriesData }) =>
      api.put<SeriesItem>(`/admin/series/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ 
        queryKey: ["series"],
        refetchType: 'active'
      });
      queryClient.invalidateQueries({ 
        queryKey: ["series", id],
        refetchType: 'active'
      });
    },
  });
}

export function useDeleteSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/series/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["series"],
        refetchType: 'active'
      });
    },
  });
}

export function useCreateSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSeasonData) =>
      api.post<SeriesSeason>(`/admin/series/${data.seriesId}/seasons`, data),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["series-seasons", seriesId] });
      queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
    },
  });
}

export function useDeleteSeason() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, seasonId }: { seriesId: number; seasonId: number }) =>
      api.delete(`/admin/seasons/${seasonId}`),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["series-seasons", seriesId] });
      queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
    },
  });
}

export function useCreateEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateEpisodeData) =>
      api.post<SeriesEpisode>(`/admin/seasons/${data.seasonId}/episodes`, data),
    onSuccess: (_, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: ["season-episodes", seasonId] });
    },
  });
}

export function useUpdateEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, seasonId, data }: { id: number; seasonId: number; data: UpdateEpisodeData }) =>
      api.put<SeriesEpisode>(`/admin/episodes/${id}`, data),
    onSuccess: (_, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: ["season-episodes", seasonId] });
    },
  });
}

export function useDeleteEpisode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, seasonId }: { id: number; seasonId: number }) =>
      api.delete(`/admin/episodes/${id}`),
    onSuccess: (_, { seasonId }) => {
      queryClient.invalidateQueries({ queryKey: ["season-episodes", seasonId] });
    },
  });
}

export function useSyncSeriesTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/series/${id}/tmdb-sync`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["series", id] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
}

export function useBulkSyncSeriesTmdb() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post("/admin/series/bulk-tmdb-sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
}

// Extended interfaces for creating series with all seasons and episodes
export interface EpisodeFormData {
  episodeNumber: number;
  name: string;
  overview?: string;
  airDate?: string | null;
  runtime?: number | null;
  stillPath?: string | null;
  sourceUrl: string; // The video file path
}

export interface SeasonFormData {
  seasonNumber: number;
  name: string;
  overview?: string;
  posterPath?: string | null;
  episodes: EpisodeFormData[];
}

export interface CreateSeriesWithEpisodesData {
  name: string;
  categoryId?: number; // Deprecated but kept for backward compatibility
  categoryIds?: number[]; // New multi-category support
  tmdbId?: number;
  coverUrl?: string;
  backdropUrl?: string;
  genre?: string;
  year?: number;
  rating?: number;
  plot?: string;
  cast?: string;
  status?: string;
  seasons: SeasonFormData[];
}

export function useCreateSeriesWithEpisodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateSeriesWithEpisodesData) =>
      api.post<SeriesItem>("/admin/series/full", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
}

// Bulk update episodes with source URLs
export interface BulkUpdateEpisodesData {
  episodes: {
    id: number;
    sourceUrl: string;
  }[];
}

export function useBulkUpdateEpisodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkUpdateEpisodesData) =>
      api.put("/admin/episodes/bulk", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["series"] });
      queryClient.invalidateQueries({ queryKey: ["season-episodes"] });
    },
  });
}

