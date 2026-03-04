"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Hls from "hls.js";
import {
  ArrowLeft,
  Heart,
  Share,
  ThumbsUp,
  ThumbsDown,
  Plus,
  Star,
  Clock,
  Calendar,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  SkipBack,
  SkipForward,
  Loader2,
  Subtitles,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore } from "@/stores/playerStore";
import { useAuthStore } from "@/stores/authStore";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

// Interface for VOD data from API
interface VodInfo {
  info: {
    movie_image: string;
    tmdb_id: number;
    backdrop_path: string[];
    youtube_trailer: string;
    genre: string;
    plot: string;
    cast: string;
    rating: string;
    director: string;
    releasedate: string;
    duration_secs: number;
    duration: string;
    viewer_count?: number;
  };
  movie_data: {
    stream_id: number;
    name: string;
    added: string;
    category_id: string;
    container_extension: string;
  };
}

// Format time in seconds to MM:SS or HH:MM:SS
function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function WatchMoviePage() {
  const router = useRouter();
  const params = useParams();
  const vodId = params.id as string;
  const { user } = useAuthStore();

  // Video player refs and state
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // VOD data state
  const [vodInfo, setVodInfo] = useState<VodInfo | null>(null);
  const [streamUrl, setStreamUrl] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [availableQualities, setAvailableQualities] = useState<{ height: number; index: number }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<string>("auto");
  const [availableSubtitles, setAvailableSubtitles] = useState<{ id: number; name: string; lang: string; filename?: string }[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<number>(-1);
  const [playbackRate, setPlaybackRateState] = useState(1);

  // UI state
  const [isFavorite, setIsFavorite] = useState(false);
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  const { addToWatchHistory, setCurrentStream, watchHistory } = usePlayerStore();

  // Fetch VOD info from API
  useEffect(() => {
    async function fetchVodInfo() {
      if (!user?.username || !user?.password) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch VOD info from player API
        const data = await api.get<VodInfo>(
          `/player_api.php?username=${user.username}&password=${user.password}&action=get_vod_info&vod_id=${vodId}`
        );

        if ("error" in data) {
          setError((data as { error: string }).error);
          return;
        }

        setVodInfo(data);

        // Build stream URL - use m3u8 for HLS playback (VOD uses /movie/ endpoint)
        const url = `/api-proxy/movie/${user.username}/${user.password}/${vodId}.m3u8`;
        setStreamUrl(url);

        // Set current stream in store
        setCurrentStream(url, data.movie_data.name, "vod", vodId);
      } catch (err) {
        console.error("Failed to fetch VOD info:", err);
        setError("Failed to load movie information");
      } finally {
        setLoading(false);
      }
    }

    fetchVodInfo();
  }, [vodId, user, setCurrentStream]);

  // Fetch subtitles from server after stream URL is ready
  useEffect(() => {
    async function fetchSubtitles() {
      if (!streamUrl || !user) return;
      
      try {
        // The subtitles are available at /api-proxy/vod-hls/{token}/{vodId}/subtitles.json
        // We need to first make a request to the stream to get the token from the playlist
        // Or we can add an endpoint that doesn't require a token
        
        // Try fetching subtitles directly using a dummy token (server should still serve them)
        const response = await fetch(`/api-proxy/vod-hls/_/${vodId}/subtitles.json`);
        
        if (response.ok) {
          const subs = await response.json();
          if (Array.isArray(subs) && subs.length > 0) {
            const subtitleList = subs.map((sub: { index: number; language: string; title?: string; filename: string }) => ({
              id: sub.index,
              name: sub.title || `${sub.language.toUpperCase()} Subtitle`,
              lang: sub.language || 'unknown',
              filename: sub.filename,
            }));
            setAvailableSubtitles(subtitleList);
            console.log("[VOD Player] Loaded subtitles from server:", subtitleList);
          }
        } else {
          console.log("[VOD Player] No subtitles endpoint, status:", response.status);
        }
      } catch (err) {
        console.log("[VOD Player] No subtitles available:", err);
      }
    }

    fetchSubtitles();
  }, [streamUrl, vodId, user]);

  // Initialize HLS.js player
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const initHls = () => {
      destroyHls();
      setVideoError(null);
      setIsVideoLoading(true);

      console.log("[VOD Player] Initializing HLS with URL:", streamUrl);

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          startLevel: -1,
          debug: false,
          // Enable subtitle parsing
          enableWebVTT: true,
          enableIMSC1: true,
          enableCEA708Captions: true,
          renderTextTracksNatively: true,
          // Retry configuration
          manifestLoadingTimeOut: 30000,
          manifestLoadingMaxRetry: 6,
          levelLoadingTimeOut: 30000,
          levelLoadingMaxRetry: 6,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetry: 6,
        });

        // Enable subtitle display
        hls.subtitleDisplay = true;

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          console.log("[VOD Player] Manifest parsed, levels:", data.levels.length);
          setIsVideoLoading(false);

          // Get available quality levels
          const qualities = data.levels.map((level, index) => ({
            height: level.height,
            index,
          }));
          setAvailableQualities(qualities);

          // Get available subtitle tracks from HLS.js
          // Only use HLS.js subtitles if we don't already have them from subtitles.json
          if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
            const subtitles = hls.subtitleTracks.map((track, index) => ({
              id: index,
              name: track.name || `Subtitle ${index + 1}`,
              lang: track.lang || "unknown",
              hlsTrack: true, // Mark as HLS.js track
            }));
            console.log("[VOD Player] Found HLS.js subtitles:", subtitles);
            // Set subtitles from HLS.js - these will be rendered by HLS.js
            setAvailableSubtitles(prev => {
              // If we already have subtitles from subtitles.json, prefer those
              if (prev.length > 0) {
                console.log("[VOD Player] Keeping subtitles from subtitles.json");
                return prev;
              }
              return subtitles;
            });
          }

          // Auto-play
          video.play().catch((e) => {
            console.log("[VOD Player] Autoplay blocked:", e);
          });
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          console.error("[VOD Player] HLS Error:", data.type, data.details, data.fatal);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log("[VOD Player] Network error, trying to recover...");
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log("[VOD Player] Media error, trying to recover...");
                hls.recoverMediaError();
                break;
              default:
                setVideoError("Unable to play video");
                setIsVideoLoading(false);
                break;
            }
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setCurrentQuality(`${level.height}p`);
            console.log("[VOD Player] Quality switched to:", level.height + "p");
          }
        });

        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          setIsVideoLoading(false);
        });

        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
          console.log("[VOD Player] Subtitle tracks updated:", data.subtitleTracks);
          // Don't overwrite subtitles from subtitles.json
          if (data.subtitleTracks && data.subtitleTracks.length > 0) {
            setAvailableSubtitles(prev => {
              if (prev.length > 0 && prev.some(s => s.filename)) {
                // We have subtitles from subtitles.json, keep them
                return prev;
              }
              return data.subtitleTracks.map((track, index) => ({
                id: index,
                name: track.name || `Subtitle ${index + 1}`,
                lang: track.lang || "unknown",
              }));
            });
          }
        });

      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS (Safari)
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", () => {
          setIsVideoLoading(false);
          video.play().catch(() => {});
        });
      } else {
        // Try direct playback
        video.src = streamUrl;
        video.addEventListener("loadedmetadata", () => {
          setIsVideoLoading(false);
          video.play().catch(() => {});
        });
        video.addEventListener("error", () => {
          setVideoError("Unable to play video - HLS not supported");
          setIsVideoLoading(false);
        });
      }
    };

    initHls();

    return () => {
      destroyHls();
    };
  }, [streamUrl]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Save progress periodically
      if (vodInfo && video.duration > 0 && Math.floor(video.currentTime) % 10 === 0) {
        const progress = (video.currentTime / video.duration) * 100;
        addToWatchHistory({
          id: vodId,
          streamId: vodId,
          title: vodInfo.movie_data.name,
          type: "vod",
          timestamp: Date.now(),
          progress,
          posterUrl: vodInfo.info.movie_image,
        });
      }
    };
    const handleDurationChange = () => setDuration(video.duration);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      if (vodInfo) {
        addToWatchHistory({
          id: vodId,
          streamId: vodId,
          title: vodInfo.movie_data.name,
          type: "vod",
          timestamp: Date.now(),
          progress: 100,
          posterUrl: vodInfo.info.movie_image,
        });
      }
    };
    const handleWaiting = () => setIsVideoLoading(true);
    const handlePlaying = () => setIsVideoLoading(false);
    const handleCanPlay = () => setIsVideoLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [vodInfo, vodId, addToWatchHistory]);

  // Volume sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
      video.muted = isMuted;
    }
  }, [volume, isMuted]);

  // Playback rate sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Controls visibility
  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3000);
  }, [isPlaying]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => setIsMuted(!isMuted);

  const toggleFullscreen = async () => {
    const container = containerRef.current;
    if (!container) return;

    try {
      if (!document.fullscreenElement) {
        await container.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.error("Fullscreen error:", err);
    }
  };

  const handleSeek = (value: number[]) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = value[0];
    }
  };

  const handleQualityChange = (levelIndex: number) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = levelIndex;
    setCurrentQuality(levelIndex === -1 ? "auto" : `${hls.levels[levelIndex]?.height}p`);
  };

  const handleSubtitleChange = (subtitleId: number) => {
    const video = videoRef.current;
    const hls = hlsRef.current;
    const subtitleInfo = availableSubtitles.find(s => s.id === subtitleId);
    
    console.log("[VOD Player] Changing subtitle to:", subtitleId, subtitleInfo);
    
    // First try HLS.js subtitle tracks (embedded in HLS stream)
    if (hls && hls.subtitleTracks && hls.subtitleTracks.length > 0) {
      // Find the HLS.js track index for this subtitle
      const hlsTrackIndex = hls.subtitleTracks.findIndex(t => 
        t.lang === subtitleInfo?.lang || t.name === subtitleInfo?.name
      );
      if (hlsTrackIndex >= 0) {
        hls.subtitleTrack = hlsTrackIndex;
        hls.subtitleDisplay = true;
        console.log("[VOD Player] HLS subtitle changed to track index:", hlsTrackIndex);
      }
    }
    
    // Handle external VTT subtitles via text tracks
    if (video) {
      // Remove existing subtitle tracks
      const existingTracks = video.querySelectorAll('track');
      existingTracks.forEach(track => track.remove());
      
      // Disable all existing text tracks first
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'hidden';
      }
      
      if (subtitleId >= 0 && subtitleInfo) {
        // Use the filename from subtitles.json if available, otherwise construct from ID
        const filename = subtitleInfo.filename || `subtitle_${subtitleId}.vtt`;
        
        // Add new subtitle track - use "_" as placeholder token
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = subtitleInfo.name || 'Subtitles';
        track.srclang = subtitleInfo.lang || 'en';
        track.src = `/api-proxy/vod-hls/_/${vodId}/${filename}`;
        track.default = true;
        video.appendChild(track);
        
        // Enable the track after it loads
        track.addEventListener('load', () => {
          if (video.textTracks.length > 0) {
            video.textTracks[video.textTracks.length - 1].mode = 'showing';
          }
        });
        
        // Also try to enable immediately
        setTimeout(() => {
          if (video.textTracks.length > 0) {
            video.textTracks[video.textTracks.length - 1].mode = 'showing';
          }
        }, 100);
        
        console.log("[VOD Player] External subtitle loaded:", track.src);
      }
    }
    
    setCurrentSubtitle(subtitleId);
  };

  const handlePlaybackRateChange = (rate: number) => {
    setPlaybackRateState(rate);
  };

  const skip = (seconds: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Resume progress
  const resumeProgress = watchHistory.find(
    (h) => h.streamId === vodId && h.type === "vod"
  )?.progress;

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !vodInfo) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <p className="text-xl mb-4">{error || "Movie not found"}</p>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    );
  }

  const movieName = vodInfo.movie_data.name;
  const posterUrl = vodInfo.info.movie_image;
  const backdropUrl = vodInfo.info.backdrop_path?.[0] || posterUrl;
  const rating = parseFloat(vodInfo.info.rating) || 0;
  const releaseYear = vodInfo.info.releasedate?.split("-")[0];
  const durationSecs = vodInfo.info.duration_secs || 0;

  return (
    <div className="min-h-screen bg-black">
      {/* Video Player - Full Width */}
      <div
        ref={containerRef}
        className="relative w-full bg-black"
        onMouseMove={showControlsTemporarily}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        <div className="relative aspect-video w-full max-h-[70vh]">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            poster={backdropUrl}
            playsInline
            crossOrigin="anonymous"
            onClick={togglePlayPause}
          />

          {/* Loading Spinner */}
          {isVideoLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          )}

          {/* Error Message */}
          {videoError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
              <p className="text-lg text-red-400 mb-4">{videoError}</p>
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
          )}

          {/* Controls Overlay */}
          <div
            className={cn(
              "absolute inset-0 transition-opacity z-20 pointer-events-none",
              showControls ? "opacity-100" : "opacity-0"
            )}
          >
            {/* Top Bar with Back Button */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-auto">
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => router.back()}
                >
                  <ArrowLeft className="h-6 w-6" />
                </Button>
                <h2 className="text-lg font-semibold text-white truncate flex-1 mx-4">
                  {movieName}
                </h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={() => setIsFavorite(!isFavorite)}
                  >
                    <Heart className={cn("h-5 w-5", isFavorite && "fill-red-500 text-red-500")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
                    <Share className="h-5 w-5" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Center Play Button */}
            {!isPlaying && !isVideoLoading && !videoError && (
              <button
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-5 rounded-full bg-primary/90 hover:bg-primary transition-all hover:scale-110 pointer-events-auto"
                onClick={togglePlayPause}
              >
                <Play className="h-10 w-10 text-white fill-white" />
              </button>
            )}

            {/* Bottom Controls */}
            <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
              {/* Progress Bar */}
              <div className="relative">
                <Slider
                  value={[currentTime]}
                  max={duration || 100}
                  step={0.1}
                  onValueChange={handleSeek}
                  className="cursor-pointer"
                />
                {/* Buffered indicator */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full pointer-events-none -z-10"
                  style={{ width: `${duration > 0 ? (buffered / duration) * 100 : 0}%` }}
                />
              </div>

              {/* Control Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={togglePlayPause}
                >
                  {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => skip(-10)}
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => skip(10)}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>

                {/* Volume */}
                <div className="flex items-center gap-2 order-4 sm:order-none">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={toggleMute}
                  >
                    {isMuted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </Button>
                  <Slider
                    value={[isMuted ? 0 : volume]}
                    max={1}
                    step={0.01}
                    onValueChange={(v) => {
                      setVolume(v[0]);
                      if (v[0] > 0) setIsMuted(false);
                    }}
                    className="w-20 sm:w-24"
                  />
                </div>

                {/* Time Display */}
                <span className="text-sm text-white ml-2 order-5 sm:order-none w-full sm:w-auto">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1 min-w-[120px] order-6 sm:order-none" />

                {/* Subtitles - Always show the button */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                      <Subtitles className={cn("h-5 w-5", currentSubtitle >= 0 && "text-primary")} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => handleSubtitleChange(-1)}
                      className={currentSubtitle === -1 ? "bg-accent" : ""}
                    >
                      Off
                    </DropdownMenuItem>
                    {availableSubtitles.length > 0 ? (
                      <>
                        <DropdownMenuSeparator />
                        {availableSubtitles.map((sub) => (
                          <DropdownMenuItem
                            key={sub.id}
                            onClick={() => handleSubtitleChange(sub.id)}
                            className={currentSubtitle === sub.id ? "bg-accent" : ""}
                          >
                            {sub.name} ({sub.lang})
                          </DropdownMenuItem>
                        ))}
                      </>
                    ) : (
                      <DropdownMenuItem disabled className="text-muted-foreground">
                        No subtitles available
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Settings */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-white/20">
                      <Settings className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Quality</DropdownMenuLabel>
                    <DropdownMenuItem
                      onClick={() => handleQualityChange(-1)}
                      className={currentQuality === "auto" ? "bg-accent" : ""}
                    >
                      Auto
                    </DropdownMenuItem>
                    {availableQualities.map((q) => (
                      <DropdownMenuItem
                        key={q.index}
                        onClick={() => handleQualityChange(q.index)}
                        className={currentQuality === `${q.height}p` ? "bg-accent" : ""}
                      >
                        {q.height}p
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Speed</DropdownMenuLabel>
                    {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                      <DropdownMenuItem
                        key={rate}
                        onClick={() => handlePlaybackRateChange(rate)}
                        className={playbackRate === rate ? "bg-accent" : ""}
                      >
                        {rate}x
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Fullscreen */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Below Video */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Movie Info */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white">{movieName}</h1>

              <div className="flex flex-wrap items-center gap-3 mt-3">
                {rating > 0 && (
                  <div className="flex items-center gap-1 text-yellow-500">
                    <Star className="h-5 w-5 fill-current" />
                    <span className="font-semibold">{rating.toFixed(1)}</span>
                  </div>
                )}
                {releaseYear && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <Calendar className="h-4 w-4" />
                    <span>{releaseYear}</span>
                  </div>
                )}
                {durationSecs > 0 && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <Clock className="h-4 w-4" />
                    <span>{formatDuration(durationSecs)}</span>
                  </div>
                )}
                {vodInfo.info.viewer_count !== undefined && (
                  <div className="flex items-center gap-1 text-gray-400">
                    <Eye className="h-4 w-4" />
                    <span>{vodInfo.info.viewer_count} watching</span>
                  </div>
                )}
              </div>

              {vodInfo.info.genre && (
                <div className="flex gap-2 mt-4 flex-wrap">
                  {vodInfo.info.genre.split(",").map((g) => (
                    <Badge key={g.trim()} variant="secondary">
                      {g.trim()}
                    </Badge>
                  ))}
                </div>
              )}

              {vodInfo.info.plot && (
                <div className="mt-4">
                  <p className={cn("text-gray-400", !showFullDescription && "line-clamp-3")}>
                    {vodInfo.info.plot}
                  </p>
                  {vodInfo.info.plot.length > 200 && (
                    <Button
                      variant="link"
                      className="p-0 h-auto text-primary"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                    >
                      {showFullDescription ? "Show less" : "Read more"}
                    </Button>
                  )}
                </div>
              )}

              {/* Mobile Actions */}
              <div className="mt-4 space-y-3 lg:hidden">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <Button
                    className="w-full"
                    onClick={() => setIsFavorite(!isFavorite)}
                    variant={isFavorite ? "secondary" : "outline"}
                  >
                    <Heart className={cn("mr-2 h-4 w-4", isFavorite && "fill-current")} />
                    {isFavorite ? "Favorited" : "Favorite"}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setIsInWatchlist(!isInWatchlist)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {isInWatchlist ? "Saved" : "Watchlist"}
                  </Button>
                  <Button className="w-full" variant="outline">
                    <Share className="mr-2 h-4 w-4" />
                    Share
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" className="flex-1">
                    <ThumbsUp className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" className="flex-1">
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                </div>

                {resumeProgress !== undefined && resumeProgress > 0 && resumeProgress < 95 && (
                  <div className="rounded-lg border border-gray-800 p-3">
                    <p className="text-sm text-gray-400 mb-2">
                      Continue from {Math.round(resumeProgress)}%
                    </p>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${resumeProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <Separator className="bg-gray-800" />

            {/* Details */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-white mb-4">Details</h3>
              <div className="grid gap-4 text-sm">
                {vodInfo.info.director && (
                  <div>
                    <span className="text-gray-500">Director:</span>
                    <span className="text-white ml-2">{vodInfo.info.director}</span>
                  </div>
                )}
                {vodInfo.info.cast && (
                  <div>
                    <span className="text-gray-500">Cast:</span>
                    <span className="text-white ml-2">{vodInfo.info.cast}</span>
                  </div>
                )}
                {vodInfo.info.genre && (
                  <div>
                    <span className="text-gray-500">Genre:</span>
                    <span className="text-white ml-2">{vodInfo.info.genre}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-80 hidden lg:block">
            <Card className="bg-gray-900 border-gray-800 sticky top-4">
              <CardContent className="p-4">
                {posterUrl && (
                  <div className="relative aspect-[2/3] rounded-lg overflow-hidden mb-4">
                    <Image
                      src={posterUrl}
                      alt={movieName}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}

                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => setIsFavorite(!isFavorite)}
                    variant={isFavorite ? "secondary" : "outline"}
                  >
                    <Heart className={cn("mr-2 h-4 w-4", isFavorite && "fill-current")} />
                    {isFavorite ? "In Favorites" : "Add to Favorites"}
                  </Button>

                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setIsInWatchlist(!isInWatchlist)}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {isInWatchlist ? "In Watchlist" : "Add to Watchlist"}
                  </Button>

                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" className="flex-1">
                      <ThumbsUp className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="flex-1">
                      <ThumbsDown className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="flex-1">
                      <Share className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {resumeProgress !== undefined && resumeProgress > 0 && resumeProgress < 95 && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <p className="text-sm text-gray-400 mb-2">
                      Continue from {Math.round(resumeProgress)}%
                    </p>
                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${resumeProgress}%` }} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
