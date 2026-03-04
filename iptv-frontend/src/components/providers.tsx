"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";

interface ProvidersProps {
  children: ReactNode;
}

// Component that handles session timeout checking
function SessionManager({ children }: { children: ReactNode }) {
  useSessionTimeout();
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
        <SessionManager>
          {children}
        </SessionManager>
      </TooltipProvider>
      <Toaster />
      <ReactQueryDevtoolsWrapper />
    </QueryClientProvider>
  );
}
