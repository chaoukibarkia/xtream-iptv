"use client";

import React, { useState } from "react";
import { Tv } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreamLogoProps {
  logoUrl?: string | null;
  alt?: string;
  className?: string;
  iconClassName?: string;
  fallbackSrc?: string;
}

/**
 * StreamLogo Component
 * 
 * Displays a stream logo with automatic fallback to:
 * 1. Default TV icon from server (/media/images/default-tv-icon.png)
 * 2. Lucide Tv icon if default icon fails to load
 * 
 * Usage:
 *   <StreamLogo logoUrl={stream.logoUrl} alt={stream.name} />
 */
export function StreamLogo({
  logoUrl,
  alt = "Stream",
  className = "h-10 w-10 object-contain",
  iconClassName = "h-6 w-6 text-muted-foreground",
  fallbackSrc = "/media/images/default-tv-icon.png",
}: StreamLogoProps) {
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  // If no logo URL or errors loading images, show icon
  if (!logoUrl || (imgError && fallbackError)) {
    return <Tv className={iconClassName} />;
  }

  // If primary logo failed but fallback hasn't been tried
  if (imgError && !fallbackError) {
    return (
      <img
        src={fallbackSrc}
        alt={alt}
        className={className}
        onError={() => setFallbackError(true)}
      />
    );
  }

  // Try primary logo
  return (
    <img
      src={logoUrl}
      alt={alt}
      className={className}
      onError={() => setImgError(true)}
    />
  );
}

/**
 * StreamLogoContainer Component
 * 
 * Wrapper with consistent styling for stream logos
 */
interface StreamLogoContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function StreamLogoContainer({
  children,
  className,
}: StreamLogoContainerProps) {
  return (
    <div
      className={cn(
        "h-12 w-12 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0",
        className
      )}
    >
      {children}
    </div>
  );
}
