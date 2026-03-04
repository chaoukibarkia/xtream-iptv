import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";

// ==================== Types ====================

export type NotificationType = "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "CREDIT" | "LINE" | "SYSTEM";

export interface Notification {
  id: number;
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
  unreadCount: number;
}

export interface UnreadCountResponse {
  count: number;
}

// ==================== Hooks ====================

/**
 * Fetch notifications for current user
 */
export function useNotifications(options?: { unreadOnly?: boolean; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: ["notifications", options],
    queryFn: () =>
      api.get<NotificationsResponse>("/admin/notifications", {
        unreadOnly: options?.unreadOnly?.toString(),
        limit: options?.limit?.toString(),
        offset: options?.offset?.toString(),
      }),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  });
}

/**
 * Fetch unread notification count
 */
export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<UnreadCountResponse>("/admin/notifications/unread-count"),
    staleTime: 30000,
    refetchInterval: 30000, // Refetch every 30 seconds for badge update
  });
}

/**
 * Mark specific notifications as read
 */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationIds: number[]) =>
      api.post<{ updated: number }>("/admin/notifications/mark-read", { notificationIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Mark all notifications as read
 */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post<{ updated: number }>("/admin/notifications/mark-all-read", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Delete a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.delete(`/admin/notifications/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * Delete all read notifications
 */
export function useDeleteReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.delete("/admin/notifications"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
