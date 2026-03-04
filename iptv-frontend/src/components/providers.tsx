"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useUIStore } from "@/stores/uiStore";

interface ProvidersProps {
  children: ReactNode;
}

// Component that handles session timeout checking
function SessionManager({ children }: { children: ReactNode }) {
  useSessionTimeout();
  return <>{children}</>;
}

// Theme initializer - applies theme from storage on mount
function ThemeInitializer({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useUIStore();
  
  useEffect(() => {
    // Apply theme on mount
    const applyTheme = (themeValue: string) => {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      
      if (themeValue === "system") {
        const systemTheme = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches
          ? "dark"
          : "light";
        root.classList.add(systemTheme);
      } else {
        root.classList.add(themeValue);
      }
    };
    
    // Get persisted theme (need to access storage directly since we want initial value)
    const stored = localStorage.getItem("ui-storage");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.state?.theme) {
          applyTheme(parsed.state.theme);
        }
      } catch {
        applyTheme("dark");
      }
    } else {
      applyTheme("dark");
    }
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      const currentTheme = useUIStore.getState().theme;
      if (currentTheme === "system") {
        applyTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  
  return <>{children}</>;
}

// Separate component to handle devtools loading
function ReactQueryDevtoolsWrapper() {
  const [DevTools, setDevTools] = useState<React.ComponentType<{ initialIsOpen?: boolean }> | null>(null);

  useEffect(() => {
    // Only load devtools in development
    if (process.env.NODE_ENV === "development") {
      import("@tanstack/react-query-devtools")
        .then((mod) => {
          setDevTools(() => mod.ReactQueryDevtools);
        })
        .catch(() => {
          // Silently fail if devtools can't be loaded
          console.warn("React Query Devtools failed to load");
        });
    }
  }, []);

  if (!DevTools) return null;
  return <DevTools initialIsOpen={false} />;
}

export function Providers({ children }: ProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  // Track if we're mounted (client-side)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR or before hydration, render a minimal shell
  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse">
          <div className="h-8 w-8 rounded-full bg-primary/20" />
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeInitializer>
          <SessionManager>
            {children}
          </SessionManager>
        </ThemeInitializer>
      </TooltipProvider>
      <Toaster />
      <ReactQueryDevtoolsWrapper />
    </QueryClientProvider>
  );
}
