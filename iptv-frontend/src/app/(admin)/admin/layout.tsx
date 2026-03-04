"use client";

import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { AdminSidebar } from "@/components/layouts/admin-sidebar";
import { AdminHeader } from "@/components/layouts/admin-header";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { sidebarCollapsed, sidebarMobileOpen, setSidebarMobileOpen } = useUIStore();

  return (
    <div className="min-h-screen bg-background">
      {sidebarMobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarMobileOpen(false)}
        />
      )}
      <AdminSidebar />
      <div
        className={cn(
          "transition-all duration-300 min-w-0 overflow-x-hidden",
          sidebarCollapsed ? "md:ml-[70px]" : "md:ml-[240px]",
          "ml-0"
        )}
      >
        <AdminHeader />
        <main className="p-3 md:p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
