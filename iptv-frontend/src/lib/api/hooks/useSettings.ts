import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// Types
export interface SystemSettings {
  general?: {
    siteName?: string;
    siteUrl?: string;
    adminEmail?: string;
    timezone?: string;
    language?: string;
  };
  streaming?: {
    defaultFormat?: string;
    hlsSegmentDuration?: number;
    hlsPlaylistLength?: number;
    transcodeEnabled?: boolean;
    maxBitrate?: number;
    bufferSize?: number;
  };
  users?: {
    allowRegistration?: boolean;
    defaultExpiry?: number;
    maxConnections?: number;
    trialEnabled?: boolean;
    trialDuration?: number;
  };
  security?: {
    jwtExpiry?: number;
    requireHttps?: boolean;
    rateLimitEnabled?: boolean;
    rateLimitRequests?: number;
    ipBlocking?: boolean;
  };
  tmdb?: {
    apiKey?: string;
    autoFetch?: boolean;
    language?: string;
  };
  epg?: {
    updateInterval?: number;
    cacheDuration?: number;
  };
  notifications?: {
    emailEnabled?: boolean;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
  };
  sourceChecker?: {
    enabled?: boolean;
    intervalMinutes?: number;
    batchSize?: number;
    httpTimeoutMs?: number;
  };
}

export interface FlatSettings {
  [key: string]: string | number | boolean;
}

// Get all settings (grouped by category)
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => api.get<SystemSettings>("/admin/settings"),
    staleTime: 60000, // Cache for 1 minute
  });
}

// Get all settings (flat key-value)
export function useSettingsFlat() {
  return useQuery({
    queryKey: ["settings", "flat"],
    queryFn: () => api.get<FlatSettings>("/admin/settings/flat"),
    staleTime: 60000,
  });
}

// Get a specific setting
export function useSetting(key: string) {
  return useQuery({
    queryKey: ["settings", key],
    queryFn: () => api.get<{ key: string; value: any }>(`/admin/settings/${encodeURIComponent(key)}`),
    enabled: !!key,
    staleTime: 60000,
  });
}

// Update a single setting
export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value, type }: { key: string; value: string | number | boolean; type?: string }) =>
      api.put<{ success: boolean; key: string; value: any }>(
        `/admin/settings/${encodeURIComponent(key)}`,
        { value, type }
      ),
    onSuccess: (_, variables) => {
      // Invalidate the specific setting and the full settings list
      queryClient.invalidateQueries({ queryKey: ["settings", variables.key] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Update multiple settings at once
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: Record<string, string | number | boolean | string[]>) =>
      api.put<{ success: boolean; updated: number }>("/admin/settings", settings),
    onSuccess: () => {
      // Invalidate all settings queries
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Delete a setting (reset to default)
export function useDeleteSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) =>
      api.delete<{ success: boolean; key: string }>(`/admin/settings/${encodeURIComponent(key)}`),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ["settings", key] });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Reload settings cache on server
export function useReloadSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>("/admin/settings/reload"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });
}

// Helper hook to get TMDB language specifically
export function useTmdbLanguage() {
  const { data } = useSettings();
  return data?.tmdb?.language || "en-US";
}

// ==================== Preview Line Settings ====================

export interface PreviewLine {
  id: number;
  username: string;
  maxConnections: number;
  expiresAt: string | null;
  bouquetCount: number;
  bouquets: string[];
}

export interface PreviewLineTestResult {
  success: boolean;
  message?: string;
  error?: string;
  line?: {
    id?: number;
    username: string;
    status: string;
    maxConnections?: number;
    bouquetCount?: number;
    bouquets?: { id: number; name: string }[];
    expiresAt?: string | null;
    allowHls?: boolean;
    allowMpegts?: boolean;
  };
  stream?: {
    id: number;
    name: string;
    type?: string;
    url: string;
  };
  response?: {
    status: number;
    contentType?: string;
  };
}

// Get available lines for preview
export function usePreviewLines() {
  return useQuery({
    queryKey: ["settings", "preview-lines"],
    queryFn: () => api.get<{ lines: PreviewLine[] }>("/admin/settings/preview-lines"),
    staleTime: 30000,
  });
}

// Test preview line configuration
export function useTestPreviewLine() {
  return useMutation({
    mutationFn: (data?: { streamId?: number; streamType?: 'live' | 'vod'; username?: string; password?: string }) =>
      api.post<PreviewLineTestResult>("/admin/settings/test-preview-line", data || {}),
  });
}
