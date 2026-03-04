import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;

  // Theme
  theme: "dark" | "light" | "system";

  // Layout preferences
  tableViewMode: "table" | "grid";
  moviesViewMode: "grid" | "list";

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarMobileOpen: (open: boolean) => void;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setTableViewMode: (mode: "table" | "grid") => void;
  setMoviesViewMode: (mode: "grid" | "list") => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      theme: "dark",
      tableViewMode: "table",
      moviesViewMode: "grid",

      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      setSidebarMobileOpen: (open) =>
        set({ sidebarMobileOpen: open }),

      setTheme: (theme) => {
        // Apply theme to document
        if (typeof window !== "undefined") {
          const root = document.documentElement;
          root.classList.remove("light", "dark");

          if (theme === "system") {
            const systemTheme = window.matchMedia(
              "(prefers-color-scheme: dark)"
            ).matches
              ? "dark"
              : "light";
            root.classList.add(systemTheme);
          } else {
            root.classList.add(theme);
          }
        }
        set({ theme });
      },

      setTableViewMode: (tableViewMode) => set({ tableViewMode }),
      setMoviesViewMode: (moviesViewMode) => set({ moviesViewMode }),
    }),
    {
      name: "ui-storage",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        tableViewMode: state.tableViewMode,
        moviesViewMode: state.moviesViewMode,
      }),
    }
  )
);
