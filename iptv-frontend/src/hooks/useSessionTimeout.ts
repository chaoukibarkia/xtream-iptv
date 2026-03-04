"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/hooks/use-toast";

// Check session every minute
const SESSION_CHECK_INTERVAL = 60 * 1000;
// Warn user 5 minutes before session expires
const SESSION_WARNING_THRESHOLD = 5 * 60 * 1000;

export function useSessionTimeout() {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const { user, isAuthenticated, logout } = useAuthStore();
  const hasWarnedRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(() => {
    logout();
    router.push("/login");
  }, [logout, router]);

  const checkSession = useCallback(() => {
    // Skip check if not authenticated or no user
    if (!isAuthenticated || !user?.expiresAt) {
      return;
    }

    // Skip check on login page
    if (pathname === "/login") {
      return;
    }

    const expiresAt = new Date(user.expiresAt).getTime();
    const now = Date.now();
    const timeRemaining = expiresAt - now;

    // Session has expired
    if (timeRemaining <= 0) {
      toast({
        title: "Session Expired",
        description: "Your session has expired. Please log in again.",
        variant: "destructive",
      });
      handleLogout();
      return;
    }

    // Warn user if session is about to expire (only once)
    if (timeRemaining <= SESSION_WARNING_THRESHOLD && !hasWarnedRef.current) {
      hasWarnedRef.current = true;
      const minutesRemaining = Math.ceil(timeRemaining / 60000);
      toast({
        title: "Session Expiring Soon",
        description: `Your session will expire in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}. Please save your work.`,
      });
    }

    // Reset warning flag if session was refreshed
    if (timeRemaining > SESSION_WARNING_THRESHOLD) {
      hasWarnedRef.current = false;
    }
  }, [isAuthenticated, user, pathname, toast, handleLogout]);

  useEffect(() => {
    // Initial check
    checkSession();

    // Set up interval for periodic checks
    checkIntervalRef.current = setInterval(checkSession, SESSION_CHECK_INTERVAL);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [checkSession]);

  // Also check on visibility change (when user returns to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSession();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkSession]);

  return { checkSession };
}
