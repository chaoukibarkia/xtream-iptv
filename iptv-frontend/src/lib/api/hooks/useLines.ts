import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { IptvLine, PaginatedResponse, Bouquet } from "@/types";

export interface LineFilters {
  search?: string;
  status?: string;
  ownerId?: number;
  page?: number;
  pageSize?: number;
}

export interface CreateLineData {
  username: string;
  password: string;
  maxConnections?: number;
  expiresAt?: string | null;
  ownerId?: number;
  bouquetIds?: number[];
  isTrial?: boolean;
  
  // Notes
  adminNotes?: string;
  resellerNotes?: string;
  
  // Advanced settings
  forcedServerId?: number;
  isMinistraPortal?: boolean;
  isRestreamer?: boolean;
  isEnigmaDevice?: boolean;
  isMagDevice?: boolean;
  magStbLock?: string;
  ispLock?: boolean;
  ispDescription?: string;
  forcedCountry?: string;
  
  // Access output formats
  allowHls?: boolean;
  allowMpegts?: boolean;
  allowRtmp?: boolean;
  
  // Restrictions
  allowedIps?: string[];
  allowedUserAgents?: string[];
  
  // Status
  status?: 'active' | 'expired' | 'disabled' | 'banned';
}

export interface UpdateLineData extends Partial<CreateLineData> {}

interface BulkCreateLinesData {
  count: number;
  prefix?: string;
  maxConnections?: number;
  expirationDate?: string;
  ownerId?: number;
  bouquetIds?: number[];
}

export interface LineWithDetails extends Omit<IptvLine, 'bouquets' | 'owner'> {
  owner?: {
    id: number;
    username: string;
  };
  bouquets?: {
    bouquetId: number;
    bouquet: {
      id: number;
      name: string;
    };
  }[];
  _count?: {
    connections: number;
    bouquets: number;
  };
}

export function useLines(filters?: LineFilters) {
  return useQuery({
    queryKey: ["lines", filters],
    queryFn: async () => {
      const response = await api.get<{ lines: LineWithDetails[]; pagination: { total: number; page: number; pageSize: number; pages: number } }>("/admin/lines", filters);
      return response.lines || response;
    },
    staleTime: 30000,
  });
}

export function useLine(id: number) {
  return useQuery({
    queryKey: ["line", id],
    queryFn: () => api.get<LineWithDetails>(`/admin/lines/${id}`),
    enabled: !!id,
  });
}

export function useLineBouquets(id: number) {
  return useQuery({
    queryKey: ["line", id, "bouquets"],
    queryFn: () => api.get<Bouquet[]>(`/admin/lines/${id}/bouquets`),
    enabled: !!id,
  });
}

export function useCreateLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLineData) =>
      api.post<IptvLine>("/admin/lines", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

export function useUpdateLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateLineData }) =>
      api.put<IptvLine>(`/admin/lines/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
      queryClient.invalidateQueries({ queryKey: ["line", id] });
    },
  });
}

export function useDeleteLine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/lines/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

export function useBulkCreateLines() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkCreateLinesData) =>
      api.post<{ success: boolean; created: number; lines: { username: string; password: string }[] }>("/admin/lines/bulk", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

export function useKillLineConnections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/lines/${id}/kill-connections`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["line", id] });
    },
  });
}

export function useResetLinePassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.post<{ password: string }>(`/admin/lines/${id}/reset-password`, { password }),
  });
}

export function useBulkDeleteLines() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) =>
      api.post("/admin/lines/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

export function useBulkExtendLines() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, days }: { ids: number[]; days: number }) =>
      api.post("/admin/lines/bulk-extend", { ids, days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

export function useUpdateLineBouquets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, bouquetIds }: { id: number; bouquetIds: number[] }) =>
      api.put(`/admin/lines/${id}/bouquets`, { bouquetIds }),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["line", id] });
      queryClient.invalidateQueries({ queryKey: ["line", id, "bouquets"] });
    },
  });
}
