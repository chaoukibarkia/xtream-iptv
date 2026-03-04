"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Users,
  Tv,
  Film,
  FolderTree,
  Package,
  Server,
  Calendar,
  Settings,
  FileText,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Clapperboard,
  Settings2,
  Radio,
  Activity,
  Ticket,
  Coins,
  Receipt,
  Shield,
  Bell,
  Download,
  Globe,
} from "lucide-react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean; // If true, only visible to admin role
  resellerOnly?: boolean; // If true, only visible to reseller/sub-reseller roles
}

// All nav items - adminOnly items are filtered out for resellers, resellerOnly for resellers
const allNavItems: NavItem[] = [
  { title: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { title: "Connections", href: "/admin/connections", icon: Activity, adminOnly: true },
  { title: "IPTV Lines", href: "/admin/lines", icon: Radio },
  { title: "Activation Codes", href: "/admin/activation-codes", icon: Ticket },
  { title: "Users", href: "/admin/users", icon: Users },
  { title: "Roles & Permissions", href: "/admin/roles", icon: Shield, adminOnly: true },
  { title: "Credit Packages", href: "/admin/credit-packages", icon: Coins, adminOnly: true },
  { title: "My Packages", href: "/admin/reseller-packages", icon: Package, resellerOnly: true },
  { title: "Notifications", href: "/admin/notifications", icon: Bell },
  { title: "Applications", href: "/admin/applications", icon: Download, adminOnly: true },
  { title: "Transactions", href: "/admin/credits", icon: Receipt },
  { title: "Live Streams", href: "/admin/streams", icon: Tv, adminOnly: true },
  { title: "VOD", href: "/admin/vod", icon: Film, adminOnly: true },
  { title: "Series", href: "/admin/series", icon: Clapperboard, adminOnly: true },
  { title: "Categories", href: "/admin/categories", icon: FolderTree, adminOnly: true },
  { title: "Bouquets", href: "/admin/bouquets", icon: Package, adminOnly: true },
  { title: "Servers", href: "/admin/servers", icon: Server, adminOnly: true },
  { title: "Transcoding", href: "/admin/transcoding", icon: Settings2, adminOnly: true },
  { title: "EPG", href: "/admin/epg", icon: Calendar, adminOnly: true },
  { title: "External Sources", href: "/admin/external-sources", icon: Globe, adminOnly: true },
  { title: "Settings", href: "/admin/settings", icon: Settings, adminOnly: true },
  { title: "Logs", href: "/admin/logs", icon: FileText, adminOnly: true },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, sidebarMobileOpen, toggleSidebar, setSidebarMobileOpen } = useUIStore();
  const { user, logout } = useAuthStore();

  // Filter nav items based on user role
  const isAdmin = user?.role === "admin";
  const isReseller = user?.role === "reseller";
  const navItems = allNavItems.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (item.resellerOnly && !isReseller) return false;
    return true;
  });

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  const handleNavClick = () => {
    if (sidebarMobileOpen) {
      setSidebarMobileOpen(false);
    }
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-card transition-all duration-300 transform",
        sidebarCollapsed ? "md:w-[70px]" : "md:w-[240px]",
        sidebarMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        "w-[260px] md:w-auto"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div
          className={cn(
            "flex h-16 items-center border-b px-4",
            sidebarCollapsed ? "justify-center" : "justify-between"
          )}
        >
          {!sidebarCollapsed && (
            <Link href="/admin/dashboard" className="flex items-center gap-2">
              <Tv className="h-6 w-6 text-primary" />
              <span className="text-lg font-bold">IPTV Admin</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Tv className="h-6 w-6 text-primary" />
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-2">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;

              if (sidebarCollapsed) {
                return (
                  <Tooltip key={item.href} delayDuration={0}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex h-10 w-full items-center justify-center rounded-md transition-colors",
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <Icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                  <Icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t p-2">
          <Separator className="mb-2" />
          
          {sidebarCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="w-full text-muted-foreground hover:text-destructive"
                  onClick={handleLogout}
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
              <span>Logout</span>
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="mt-2 w-full"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
