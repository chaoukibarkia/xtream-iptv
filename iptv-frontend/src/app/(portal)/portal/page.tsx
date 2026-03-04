"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PortalPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/portal/live");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-muted-foreground">
        Redirecting to Live TV...
      </div>
    </div>
  );
}
