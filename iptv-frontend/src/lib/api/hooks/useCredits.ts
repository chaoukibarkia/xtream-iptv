import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// ==================== Types ====================

export interface CreditPackage {
  id: number;
  name: string;
  credits: number;
  days: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCreditPackageData {
  name: string;
  credits: number;
  days: number;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCreditPackageData {
  name?: string;
  credits?: number;
  days?: number;
  description?: string;
  isActive?: boolean;
}

export interface CreditTransaction {
  id: number;
  userId: number;
  user?: {
    id: number;
    username: string;
  };
  type: "TOP_UP" | "DEDUCTION" | "REFUND" | "TRANSFER_IN" | "TRANSFER_OUT";
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  isPaid: boolean | null;
  paymentNotes: string | null;
  relatedLineId: number | null;
  relatedLine?: {
    id: number;
    username: string;
  } | null;
  relatedCodeId: number | null;
  relatedCode?: {
    id: number;
    code: string;
  } | null;
  transferToId: number | null;
  transferTo?: {
    id: number;
    username: string;
  } | null;
  transferFromId: number | null;
  transferFrom?: {
    id: number;
    username: string;
  } | null;
  description: string | null;
  createdById: number | null;
  createdBy?: {
    id: number;
    username: string;
  } | null;
  createdAt: string;
}

export interface TransactionFilters {
  userId?: number;
  type?: CreditTransaction["type"];
  isPaid?: boolean;
  page?: number;
  limit?: number;
}

export interface TransactionsResponse {
  transactions: CreditTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface TopUpData {
  amount: number;
  isPaid: boolean;
  paymentNotes?: string;
}

export interface TopUpResponse {
  success: boolean;
  transaction: CreditTransaction;
  newBalance: number;
}

export interface TransferData {
  toUserId: number;
  amount: number;
}

export interface TransferResponse {
  success: boolean;
  sentTransaction: CreditTransaction;
  receivedTransaction: CreditTransaction;
  senderNewBalance: number;
  receiverNewBalance: number;
}

export interface UpdatePaymentData {
  isPaid: boolean;
  paymentNotes?: string;
}

export interface CreditStats {
  totalCreditsInSystem: number;
  totalTopUps: number;
  paidTopUps: number;
  unpaidTopUps: number;
  totalDeductions: number;
}

export interface CalculateCostResponse {
  days: number;
  count: number;
  costPerItem: number;
  totalCost: number;
}

// ==================== Credit Package Hooks ====================

export function useCreditPackages(includeInactive = false) {
  return useQuery({
    queryKey: ["creditPackages", { includeInactive }],
    queryFn: () =>
      api.get<CreditPackage[]>("/admin/credit-packages", { includeInactive }),
    staleTime: 60000,
  });
}

export function useCreditPackage(id: number) {
  return useQuery({
    queryKey: ["creditPackage", id],
    queryFn: () => api.get<CreditPackage>(`/admin/credit-packages/${id}`),
    enabled: !!id,
  });
}

export function useCreateCreditPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateCreditPackageData) =>
      api.post<CreditPackage>("/admin/credit-packages", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditPackages"] });
    },
  });
}

export function useUpdateCreditPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCreditPackageData }) =>
      api.put<CreditPackage>(`/admin/credit-packages/${id}`, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["creditPackages"] });
      queryClient.invalidateQueries({ queryKey: ["creditPackage", id] });
    },
  });
}

export function useDeleteCreditPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/credit-packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditPackages"] });
    },
  });
}

// ==================== Credit Operations Hooks ====================

export function useTopUpCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: TopUpData }) =>
      api.post<TopUpResponse>(`/admin/users/${userId}/credits/topup`, data),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user", userId] });
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["creditStats"] });
      queryClient.invalidateQueries({ queryKey: ["userCreditHistory", userId] });
    },
  });
}

export function useTransferCredits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: TransferData) =>
      api.post<TransferResponse>("/admin/credits/transfer", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["creditStats"] });
      queryClient.invalidateQueries({ queryKey: ["creditBalance"] });
    },
  });
}

export function useCreditTransactions(filters?: TransactionFilters) {
  return useQuery({
    queryKey: ["creditTransactions", filters],
    queryFn: () =>
      api.get<TransactionsResponse>("/admin/credits/transactions", filters),
    staleTime: 30000,
  });
}

export function useUserCreditHistory(userId: number, filters?: Omit<TransactionFilters, "userId">) {
  return useQuery({
    queryKey: ["userCreditHistory", userId, filters],
    queryFn: () =>
      api.get<TransactionsResponse>(`/admin/users/${userId}/credits/history`, filters),
    enabled: !!userId,
    staleTime: 30000,
  });
}

export function useUpdatePaymentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ transactionId, data }: { transactionId: number; data: UpdatePaymentData }) =>
      api.patch<CreditTransaction>(`/admin/credits/transactions/${transactionId}/payment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["creditStats"] });
    },
  });
}

export function useCreditStats() {
  return useQuery({
    queryKey: ["creditStats"],
    queryFn: () => api.get<CreditStats>("/admin/credits/stats"),
    staleTime: 30000,
  });
}

export function useCreditBalance(options?: {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
  retry?: boolean | number;
}) {
  return useQuery({
    queryKey: ["creditBalance"],
    queryFn: () => api.get<{ balance: number }>("/admin/credits/balance"),
    staleTime: 10000,
    enabled: options?.enabled,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    retry: options?.retry,
  });
}

export function useCalculateCreditCost(days: number, count = 1) {
  return useQuery({
    queryKey: ["creditCost", days, count],
    queryFn: () =>
      api.get<CalculateCostResponse>("/admin/credits/calculate", { days, count }),
    enabled: days > 0,
    staleTime: 60000,
  });
}

// ==================== Reseller Credit Packages ====================

export interface ResellerCreditPackage {
  id: number;
  resellerId: number;
  name: string;
  credits: number; // Credits sub-reseller receives
  price: number;   // Credits deducted from reseller
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateResellerPackageData {
  name: string;
  credits: number;
  price: number;
  description?: string;
  isActive?: boolean;
}

export interface ResellerTopUpData {
  amount?: number;
  packageId?: number;
}

export function useResellerPackages() {
  return useQuery({
    queryKey: ["resellerPackages"],
    queryFn: () => api.get<{ packages: ResellerCreditPackage[] }>("/admin/reseller/packages"),
    staleTime: 30000,
  });
}

export function useCreateResellerPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateResellerPackageData) =>
      api.post<ResellerCreditPackage>("/admin/reseller/packages", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellerPackages"] });
    },
  });
}

export function useUpdateResellerPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreateResellerPackageData> }) =>
      api.put<ResellerCreditPackage>(`/admin/reseller/packages/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellerPackages"] });
    },
  });
}

export function useDeleteResellerPackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/reseller/packages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resellerPackages"] });
    },
  });
}

export function useResellerTopUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, data }: { userId: number; data: ResellerTopUpData }) =>
      api.post<{
        success: boolean;
        creditsDeducted: number;
        creditsGiven: number;
        resellerNewBalance: number;
        subResellerNewBalance: number;
      }>(`/admin/reseller/topup/${userId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["creditBalance"] });
      queryClient.invalidateQueries({ queryKey: ["reseller-stats"] });
    },
  });
}
