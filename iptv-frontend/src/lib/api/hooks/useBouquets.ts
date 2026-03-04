import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

export interface Bouquet {
  id: number;
  name: string;
  parentId?: number | null;
  parent?: {
    id: number;
    name: string;
  } | null;
  children?: {
    id: number;
    name: string;
  }[];
  createdAt: string;
  updatedAt: string;
  _count: {
    streams: number;
    users: number;
    children?: number;
  };
}

export interface BouquetStream {
  id: number;
  streamId: number;
  stream: {
    id: number;
    name: string;
    streamType: string;
    logoUrl: string | null;
    category?: {
      id: number;
      name: string;
    };
  };
}

export interface BouquetLine {
  id: number;
  lineId: number;
  line: {
    id: number;
    username: string;
    status: string;
    expirationDate: string | null;
  };
}

export interface BouquetDetails extends Bouquet {
  streams: BouquetStream[];
  lines: BouquetLine[];
}

export interface CreateBouquetData {
  name: string;
  parentId?: number | null;
  streamIds?: number[];
}

export interface UpdateBouquetData {
  name?: string;
  parentId?: number | null;
  streamIds?: number[];
}

// List all bouquets
export function useBouquets() {
  return useQuery({
    queryKey: ["bouquets"],
    queryFn: () => api.get<Bouquet[]>("/admin/bouquets"),
  });
}

// Get single bouquet with details
export function useBouquet(id: number | null) {
  return useQuery({
    queryKey: ["bouquet", id],
    queryFn: () => api.get<BouquetDetails>(`/admin/bouquets/${id}`),
    enabled: !!id,
  });
}

// Create bouquet
export function useCreateBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBouquetData) =>
      api.post<Bouquet>("/admin/bouquets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
    },
  });
}

// Update bouquet
export function useUpdateBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBouquetData }) =>
      api.put<Bouquet>(`/admin/bouquets/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
      queryClient.invalidateQueries({ queryKey: ["bouquet", id] });
    },
  });
}

// Delete bouquet
export function useDeleteBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      api.delete(`/admin/bouquets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
    },
  });
}

// Add streams to bouquet
export function useAddStreamsToBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bouquetId, streamIds }: { bouquetId: number; streamIds: number[] }) =>
      api.post(`/admin/bouquets/${bouquetId}/streams`, { streamIds }),
    onSuccess: (_, { bouquetId }) => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
      queryClient.invalidateQueries({ queryKey: ["bouquet", bouquetId] });
    },
  });
}

// Remove streams from bouquet
export function useRemoveStreamsFromBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bouquetId, streamIds }: { bouquetId: number; streamIds: number[] }) =>
      api.delete(`/admin/bouquets/${bouquetId}/streams`, { streamIds }),
    onSuccess: (_, { bouquetId }) => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
      queryClient.invalidateQueries({ queryKey: ["bouquet", bouquetId] });
    },
  });
}

// Add users to bouquet
export function useAddLinesToBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bouquetId, lineIds }: { bouquetId: number; lineIds: number[] }) =>
      api.post(`/admin/bouquets/${bouquetId}/lines`, { lineIds }),
    onSuccess: (_, { bouquetId }) => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
      queryClient.invalidateQueries({ queryKey: ["bouquet", bouquetId] });
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}

// Remove lines from bouquet
export function useRemoveLinesFromBouquet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bouquetId, lineIds }: { bouquetId: number; lineIds: number[] }) =>
      api.delete(`/admin/bouquets/${bouquetId}/lines`, { lineIds }),
    onSuccess: (_, { bouquetId }) => {
      queryClient.invalidateQueries({ queryKey: ["bouquets"] });
      queryClient.invalidateQueries({ queryKey: ["bouquet", bouquetId] });
      queryClient.invalidateQueries({ queryKey: ["lines"] });
    },
  });
}
