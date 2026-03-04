import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// Types
export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  popularity: number;
}

export interface TmdbSearchResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchResult[];
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  tagline: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  runtime: number;
  vote_average: number;
  genres: { id: number; name: string }[];
  credits: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string; department: string }[];
  };
  videos: {
    results: { id: string; key: string; name: string; site: string; type: string }[];
  };
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string;
  number_of_seasons: number;
  number_of_episodes: number;
  vote_average: number;
  status: string;
  genres: { id: number; name: string }[];
  seasons: {
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster_path: string | null;
    air_date: string | null;
    overview: string;
  }[];
  credits: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
  };
}

export interface TmdbEpisode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
}

export interface TmdbSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TmdbEpisode[];
}

export interface TmdbSyncStats {
  movies: {
    total: number;
    synced: number;
    pending: number;
    percentage: number;
  };
  series: {
    total: number;
    synced: number;
    pending: number;
    percentage: number;
  };
}

export interface TmdbSyncResult {
  total: number;
  synced: number;
  failed: number;
  notFound: number;
  errors: { id: number; name: string; error: string }[];
}

// Search Hooks
export function useTmdbSearchMovies(query: string, year?: number, language?: string) {
  return useQuery({
    queryKey: ["tmdb-search-movie", query, year, language],
    queryFn: () =>
      api.get<TmdbSearchResponse>("/admin/tmdb/search/movie", { query, year, language }),
    enabled: query.length >= 2,
    staleTime: 60000, // Cache for 1 minute
  });
}

export function useTmdbSearchTv(query: string, year?: number, language?: string) {
  return useQuery({
    queryKey: ["tmdb-search-tv", query, year, language],
    queryFn: () =>
      api.get<TmdbSearchResponse>("/admin/tmdb/search/tv", { query, year, language }),
    enabled: query.length >= 2,
    staleTime: 60000,
  });
}

// Details Hooks
export function useTmdbMovieDetails(tmdbId: number, language?: string) {
  return useQuery({
    queryKey: ["tmdb-movie", tmdbId, language],
    queryFn: () => api.get<TmdbMovieDetails>(`/admin/tmdb/movie/${tmdbId}`, { language }),
    enabled: !!tmdbId,
    staleTime: 300000, // Cache for 5 minutes
  });
}

export function useTmdbTvDetails(tmdbId: number, language?: string) {
  return useQuery({
    queryKey: ["tmdb-tv", tmdbId, language],
    queryFn: () => api.get<TmdbTvDetails>(`/admin/tmdb/tv/${tmdbId}`, { language }),
    enabled: !!tmdbId,
    staleTime: 300000,
  });
}

export function useTmdbSeasonDetails(tmdbId: number, seasonNumber: number) {
  return useQuery({
    queryKey: ["tmdb-season", tmdbId, seasonNumber],
    queryFn: () => api.get<TmdbSeasonDetails>(`/admin/tmdb/tv/${tmdbId}/season/${seasonNumber}`),
    enabled: !!tmdbId && seasonNumber >= 0,
    staleTime: 300000,
  });
}

// Fetch all seasons with episodes for a TV show
export function useTmdbAllSeasons(tmdbId: number, seasonNumbers: number[]) {
  return useQuery({
    queryKey: ["tmdb-all-seasons", tmdbId, seasonNumbers],
    queryFn: async () => {
      const seasons = await Promise.all(
        seasonNumbers.map(num => 
          api.get<TmdbSeasonDetails>(`/admin/tmdb/tv/${tmdbId}/season/${num}`)
        )
      );
      return seasons;
    },
    enabled: !!tmdbId && seasonNumbers.length > 0,
    staleTime: 300000,
  });
}

// Stats Hook
export function useTmdbStats() {
  return useQuery({
    queryKey: ["tmdb-stats"],
    queryFn: () => api.get<TmdbSyncStats>("/admin/tmdb/stats"),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}

// Sync Mutations
export function useTmdbSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (options?: { type?: "movies" | "series" | "all"; forceRefresh?: boolean }) =>
      api.post<{
        movies?: TmdbSyncResult;
        series?: TmdbSyncResult;
      }>("/admin/tmdb/sync", options || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["series"] });
    },
  });
}

export function useTmdbSyncMovie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) =>
      api.post<{ success: boolean; stream?: any }>(`/admin/tmdb/sync/movie/${streamId}`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

export function useTmdbSyncSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: number) =>
      api.post<{ success: boolean; series?: any }>(`/admin/tmdb/sync/series/${seriesId}`),
    onSuccess: (_, seriesId) => {
      queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

// Linking Mutations
export function useTmdbLinkMovie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ streamId, tmdbId }: { streamId: number; tmdbId: number }) =>
      api.post<{ success: boolean; stream?: any }>(`/admin/tmdb/link/movie/${streamId}`, { tmdbId }),
    onSuccess: (_, { streamId }) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["streams"] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

export function useTmdbLinkSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, tmdbId }: { seriesId: number; tmdbId: number }) =>
      api.post<{ success: boolean; series?: any }>(`/admin/tmdb/link/series/${seriesId}`, { tmdbId }),
    onSuccess: (_, { seriesId }) => {
      queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

export function useTmdbUnlinkMovie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (streamId: number) => api.delete(`/admin/tmdb/link/movie/${streamId}`),
    onSuccess: (_, streamId) => {
      queryClient.invalidateQueries({ queryKey: ["stream", streamId] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

export function useTmdbUnlinkSeries() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: number) => api.delete(`/admin/tmdb/link/series/${seriesId}`),
    onSuccess: (_, seriesId) => {
      queryClient.invalidateQueries({ queryKey: ["series", seriesId] });
      queryClient.invalidateQueries({ queryKey: ["tmdb-stats"] });
    },
  });
}

// Genres
export function useTmdbMovieGenres() {
  return useQuery({
    queryKey: ["tmdb-genres-movie"],
    queryFn: () => api.get<{ genres: { id: number; name: string }[] }>("/admin/tmdb/genres/movie"),
    staleTime: 86400000, // Cache for 24 hours
  });
}

export function useTmdbTvGenres() {
  return useQuery({
    queryKey: ["tmdb-genres-tv"],
    queryFn: () => api.get<{ genres: { id: number; name: string }[] }>("/admin/tmdb/genres/tv"),
    staleTime: 86400000,
  });
}

// Popular Content
export function useTmdbPopularMovies(page: number = 1) {
  return useQuery({
    queryKey: ["tmdb-popular-movies", page],
    queryFn: () => api.get<TmdbSearchResponse>("/admin/tmdb/popular/movies", { page }),
    staleTime: 300000,
  });
}

export function useTmdbPopularTv(page: number = 1) {
  return useQuery({
    queryKey: ["tmdb-popular-tv", page],
    queryFn: () => api.get<TmdbSearchResponse>("/admin/tmdb/popular/tv", { page }),
    staleTime: 300000,
  });
}

// Helper to build TMDB image URL
export function getTmdbImageUrl(
  path: string | null,
  size: "w92" | "w185" | "w342" | "w500" | "w780" | "original" = "w500"
): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

