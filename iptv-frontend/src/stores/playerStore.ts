import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Stream, WatchProgress } from "@/types";

export interface WatchHistoryItem {
  id: string;
  streamId: string;
  title: string;
  type: "live" | "vod" | "series";
  timestamp: number;
  progress: number;
  posterUrl?: string;
}

interface PlayerState {
  // Current playback
  currentStream: Stream | null;
  currentUrl: string | null;
  currentTitle: string | null;
  currentType: "live" | "vod" | "series" | null;
  currentId: string | null;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  quality: string;
  defaultQuality: "auto" | "1080p" | "720p" | "480p" | "360p";
  playbackRate: number;
  isFullscreen: boolean;
  showControls: boolean;
  autoPlay: boolean;
  defaultVolume: number;

  // Watch progress
  watchProgress: Record<number, WatchProgress>;

  // Watch history
  watchHistory: WatchHistoryItem[];

  // Favorites
  favorites: number[];

  // Continue watching
  continueWatching: number[];

  // Actions
  setCurrentStream: (url: string, title: string, type: "live" | "vod" | "series", id: string) => void;
  clearCurrentStream: () => void;
  setIsPlaying: (playing: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setQuality: (quality: string) => void;
  setDefaultQuality: (quality: "auto" | "1080p" | "720p" | "480p" | "360p") => void;
  setPlaybackRate: (rate: number) => void;
  setIsFullscreen: (fullscreen: boolean) => void;
  setShowControls: (show: boolean) => void;
  setAutoPlay: (autoPlay: boolean) => void;
  setDefaultVolume: (volume: number) => void;
  updateProgress: (
    streamId: number,
    progress: number,
    duration: number
  ) => void;
  addToWatchHistory: (item: WatchHistoryItem) => void;
  clearWatchHistory: () => void;
  toggleFavorite: (streamId: number) => void;
  isFavorite: (streamId: number) => boolean;
  getProgress: (streamId: number) => WatchProgress | undefined;
  addToContinueWatching: (streamId: number) => void;
  removeFromContinueWatching: (streamId: number) => void;
  clearContinueWatching: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentStream: null,
      currentUrl: null,
      currentTitle: null,
      currentType: null,
      currentId: null,
      isPlaying: false,
      volume: 1,
      isMuted: false,
      quality: "auto",
      defaultQuality: "auto",
      playbackRate: 1,
      isFullscreen: false,
      showControls: true,
      autoPlay: true,
      defaultVolume: 1,
      watchProgress: {},
      watchHistory: [],
      favorites: [],
      continueWatching: [],

      setCurrentStream: (url, title, type, id) => set({ 
        currentUrl: url, 
        currentTitle: title, 
        currentType: type, 
        currentId: id 
      }),
      clearCurrentStream: () => set({ 
        currentUrl: null, 
        currentTitle: null, 
        currentType: null, 
        currentId: null 
      }),
      setIsPlaying: (isPlaying) => set({ isPlaying }),
      setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
      toggleMute: () =>
        set((state) => ({
          isMuted: !state.isMuted,
        })),
      setQuality: (quality) => set({ quality }),
      setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
      setPlaybackRate: (playbackRate) => set({ playbackRate }),
      setIsFullscreen: (isFullscreen) => set({ isFullscreen }),
      setShowControls: (showControls) => set({ showControls }),
      setAutoPlay: (autoPlay) => set({ autoPlay }),
      setDefaultVolume: (defaultVolume) => set({ defaultVolume }),

      addToWatchHistory: (item) =>
        set((state) => {
          // Remove existing entry for the same stream
          const filtered = state.watchHistory.filter(
            (h) => h.streamId !== item.streamId
          );
          // Add new entry at the beginning
          return {
            watchHistory: [item, ...filtered].slice(0, 50), // Keep last 50 items
          };
        }),

      clearWatchHistory: () => set({ watchHistory: [] }),

      updateProgress: (streamId, progress, duration) =>
        set((state) => {
          const newProgress = {
            ...state.watchProgress,
            [streamId]: {
              streamId,
              progress,
              duration,
              lastWatched: new Date().toISOString(),
            },
          };

          // Add to continue watching if progress is significant
          const progressPercent = (progress / duration) * 100;
          let newContinueWatching = [...state.continueWatching];

          if (progressPercent > 5 && progressPercent < 95) {
            if (!newContinueWatching.includes(streamId)) {
              newContinueWatching = [streamId, ...newContinueWatching].slice(
                0,
                20
              );
            }
          } else if (progressPercent >= 95) {
            // Remove from continue watching when finished
            newContinueWatching = newContinueWatching.filter(
              (id) => id !== streamId
            );
          }

          return {
            watchProgress: newProgress,
            continueWatching: newContinueWatching,
          };
        }),

      toggleFavorite: (streamId) =>
        set((state) => ({
          favorites: state.favorites.includes(streamId)
            ? state.favorites.filter((id) => id !== streamId)
            : [...state.favorites, streamId],
        })),

      isFavorite: (streamId) => get().favorites.includes(streamId),

      getProgress: (streamId) => get().watchProgress[streamId],

      addToContinueWatching: (streamId) =>
        set((state) => {
          if (state.continueWatching.includes(streamId)) {
            return state;
          }
          return {
            continueWatching: [streamId, ...state.continueWatching].slice(0, 20),
          };
        }),

      removeFromContinueWatching: (streamId) =>
        set((state) => ({
          continueWatching: state.continueWatching.filter(
            (id) => id !== streamId
          ),
        })),

      clearContinueWatching: () => set({ continueWatching: [] }),
    }),
    {
      name: "player-storage",
      partialize: (state) => ({
        volume: state.volume,
        isMuted: state.isMuted,
        quality: state.quality,
        defaultQuality: state.defaultQuality,
        playbackRate: state.playbackRate,
        autoPlay: state.autoPlay,
        defaultVolume: state.defaultVolume,
        watchProgress: state.watchProgress,
        watchHistory: state.watchHistory,
        favorites: state.favorites,
        continueWatching: state.continueWatching,
      }),
    }
  )
);
