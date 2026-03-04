import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { User } from "@/types";

interface UserFilters {
  search?: string;
  status?: string;
  resellerId?: number;
  page?: number;
  limit?: number;
}

interface UsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface CreateUserData {
  username: string;
  password: string;
  email?: string;
  maxConnections?: number;
  expirationDate?: string;
  resellerId?: number;
  bouquetIds?: number[];
  allowedOutputFormats?: string[];
  notes?: string;
  role?: "ADMIN" | "RESELLER" | "SUB_RESELLER";
  status?: "ACTIVE" | "EXPIRED" | "BANNED" | "DISABLED";
  credits?: number;
  parentId?: number | null;
}

interface UpdateUserData extends Partial<CreateUserData> {
  isActive?: boolean;
  status?: "ACTIVE" | "EXPIRED" | "BANNED" | "DISABLED";
  role?: "ADMIN" | "RESELLER" | "SUB_RESELLER";
  parentId?: number | null;
}

export function useUsers(filters?: UserFilters) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: () => api.get<UsersResponse>("/admin/users", filters),
    staleTime: 30000,
  });
}

export function useUser(id: number) {
  return useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get<User>(`/admin/users/${id}`),
    enabled: !!id,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateUserData) =>
      api.post<User>("/admin/users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateUserData }) =>
      api.put<User>(`/admin/users/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useKillUserConnections() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.post(`/admin/users/${id}/kill-connections`),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ["user", id] });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.post(`/admin/users/${id}/reset-password`, { password }),
  });
}

export function useBulkDeleteUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) =>
      api.post("/admin/users/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useBulkExtendUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ids, days }: { ids: number[]; days: number }) =>
      api.post("/admin/users/bulk-extend", { ids, days }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}
