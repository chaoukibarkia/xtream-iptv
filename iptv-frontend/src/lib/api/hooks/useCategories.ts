import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { Category, PaginatedResponse, StreamType } from "@/types";

interface CategoryFilters {
  type?: StreamType;
  search?: string;
  page?: number;
  pageSize?: number;
}

interface CreateCategoryData {
  name: string;
  type: StreamType;
  parentId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  countryCode?: string;
  flagSvgUrl?: string;
}

interface UpdateCategoryData {
  name?: string;
  parentId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
  countryCode?: string;
  flagSvgUrl?: string;
}

export function useAllCategories(filters?: CategoryFilters) {
  return useQuery({
    queryKey: ["categories", filters],
    queryFn: () => api.get<PaginatedResponse<Category>>("/admin/categories", filters),
    staleTime: 30000,
  });
}

export function useCategory(id: number) {
  return useQuery({
    queryKey: ["category", id],
    queryFn: () => api.get<Category>(`/admin/categories/${id}`),
    enabled: !!id,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCategoryData) =>
      api.post<Category>("/admin/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCategoryData }) =>
      api.put<Category>(`/admin/categories/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["category", id] });
    },
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

export function useReorderCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (orderedIds: number[]) =>
      api.post("/admin/categories/reorder", { orderedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

// Batch update category sort orders
export function useBatchUpdateCategories() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (updates: { id: number; sortOrder: number }[]) =>
      api.put("/admin/categories/batch", { updates }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}

