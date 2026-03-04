import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

export interface ActivationCode {
  id: number;
  code: string;
  status: "UNUSED" | "USED" | "EXPIRED" | "REVOKED";
  bouquetIds: number[];
  maxConnections: number;
  subscriptionDays: number;
  isTrial: boolean;
  codeExpiresAt: string | null;
  createdById: number;
  createdBy?: {
    id: number;
    username: string;
  };
  usedAt: string | null;
  usedByLineId: number | null;
  usedByLine?: {
    id: number;
    username: string;
  } | null;
  usedFromIp: string | null;
  usedDeviceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivationCodeFilters {
  page?: number;
  limit?: number;
  status?: "UNUSED" | "USED" | "EXPIRED" | "REVOKED";
  createdById?: number;
}

export interface CreateActivationCodesData {
  count: number;
  bouquetIds: number[];
  maxConnections: number;
  subscriptionDays: number;
  isTrial: boolean;
  codeValidityDays?: number;
  createdById?: number;
  deductCredits?: boolean;
}

export interface EligibleUser {
  id: number;
  username: string;
  role: "ADMIN" | "RESELLER" | "SUB_RESELLER";
  parentId: number | null;
}

export function useActivationEligibleUsers(search?: string) {
  return useQuery({
    queryKey: ["activationEligibleUsers", search],
    queryFn: () => api.get<{ users: EligibleUser[] }>("/admin/activation-codes/eligible-users", { search }),
    staleTime: 30000,
  });
}

export interface ActivationCodeStats {
  total: number;
  unused: number;
  used: number;
  expired: number;
  revoked: number;
}

export interface ActivationCodesResponse {
  codes: ActivationCode[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface GenerateCodesResponse {
  success: boolean;
  count: number;
  codes: string[];
}

export function useActivationCodes(filters?: ActivationCodeFilters) {
  return useQuery({
    queryKey: ["activationCodes", filters],
    queryFn: async () => {
      const response = await api.get<ActivationCodesResponse>("/admin/activation-codes", filters);
      return response;
    },
    staleTime: 30000,
  });
}

export function useActivationCode(id: number) {
  return useQuery({
    queryKey: ["activationCode", id],
    queryFn: () => api.get<ActivationCode>(`/admin/activation-codes/${id}`),
    enabled: !!id,
  });
}

export function useActivationCodeStats() {
  return useQuery({
    queryKey: ["activationCodeStats"],
    queryFn: () => api.get<ActivationCodeStats>("/admin/activation-codes/stats"),
    staleTime: 30000,
  });
}

export function useGenerateActivationCodes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateActivationCodesData) =>
      api.post<GenerateCodesResponse>("/admin/activation-codes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activationCodes"] });
      queryClient.invalidateQueries({ queryKey: ["activationCodeStats"] });
    },
  });
}

export function useRevokeActivationCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/activation-codes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activationCodes"] });
      queryClient.invalidateQueries({ queryKey: ["activationCodeStats"] });
    },
  });
}
