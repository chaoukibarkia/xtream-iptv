import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// Types
export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
export type LogSource = "STREAM" | "AUTH" | "USER" | "SERVER" | "EPG" | "TRANSCODE" | "SYSTEM" | "API";

export interface SystemLog {
  id: number;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  details?: Record<string, unknown>;
  streamId?: number;
  userId?: number;
  serverId?: number;
  ipAddress?: string;
  sessionId?: string;
}

export interface LogsResponse {
  logs: SystemLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface LogsQuery {
  level?: LogLevel;
  source?: LogSource;
  streamId?: number;
  userId?: number;
  serverId?: number;
  search?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}

export interface LogFilters {
  levels: LogLevel[];
  sources: LogSource[];
}

export interface LogStats {
  total: number;
  lastDay: number;
  lastHour: number;
  errors24h: number;
  warnings24h: number;
  byLevel: Record<string, number>;
  bySource: Record<string, number>;
}

// Fetch logs
export function useLogs(query: LogsQuery = {}, options?: { refetchInterval?: number }) {
  return useQuery<LogsResponse>({
    queryKey: ["logs", query],
    queryFn: () => api.get<LogsResponse>("/admin/logs", query),
    refetchInterval: options?.refetchInterval,
  });
}

// Fetch log filters (available levels and sources)
export function useLogFilters() {
  return useQuery<LogFilters>({
    queryKey: ["logs", "filters"],
    queryFn: () => api.get<LogFilters>("/admin/logs/filters"),
    staleTime: 60000, // Cache for 1 minute
  });
}

// Fetch log statistics
export function useLogStats() {
  return useQuery<LogStats>({
    queryKey: ["logs", "stats"],
    queryFn: () => api.get<LogStats>("/admin/logs/stats"),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Cleanup old logs
export function useCleanupLogs() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (daysToKeep: number) =>
      api.delete<{ success: boolean; deletedCount: number; message: string }>(
        `/admin/logs/cleanup?daysToKeep=${daysToKeep}`
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["logs"] });
    },
  });
}
