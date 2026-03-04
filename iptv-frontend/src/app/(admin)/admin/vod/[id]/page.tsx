"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import Hls from "hls.js";
import {
  ArrowLeft,
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
  Plus,
  Trash2,
  Upload,
  FileText,
  Globe,
  Check,
  AlertCircle,
  RefreshCw,
  Pencil,
  Star,
  Clock,
  Calendar,
  Film,
  Users,
  Link2,
  ExternalLink,
  Subtitles,
  Languages,
  Video,
  Music,
  Captions,
  HardDrive,
  Info,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  useVod,
  useVodProbe,
  useAddSubtitle,
  useUpdateSubtitle,
  useDeleteSubtitle,
  type VodWithDetails,
  type Subtitle,
  type MediaProbeInfo,
  type VideoTrack,
  type AudioTrack,
  type SubtitleTrack,
} from "@/lib/api/hooks/useVod";
import { useDeleteStream } from "@/lib/api/hooks/useStreams";
import { useSettings } from "@/lib/api/hooks/useSettings";

// Language options for subtitles
const LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "hi", label: "Hindi" },
  { code: "tr", label: "Turkish" },
  { code: "pl", label: "Polish" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
];

function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatRuntime(minutes: number): string {
  if (!minutes) return "N/A";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

// ==================== HLS PLAYER WITH SUBTITLES ====================

interface VodPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  subtitles?: Subtitle[];
  apiBaseUrl: string;
  vodId: number;
  streamId?: number;
}

// Embedded subtitle info from HLS conversion
interface EmbeddedSubtitle {
  index: number;
  language: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
  filename: string;
}

// Audio track info from source file (HLS embedded)
interface EmbeddedAudioTrack {
  index: number;
  language: string;
  title?: string;
  codec: string;
  channels: number;
  sampleRate: number;
  bitrate?: number;
  isDefault: boolean;
}

function VodPlayer({ src, poster, title, subtitles = [], apiBaseUrl, vodId, streamId }: VodPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [availableQualities, setAvailableQualities] = useState<string[]>(["auto"]);
  const [currentQuality, setCurrentQuality] = useState("auto");
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeSubtitle, setActiveSubtitle] = useState<number | null>(null);
  const [embeddedSubtitles, setEmbeddedSubtitles] = useState<EmbeddedSubtitle[]>([]);
  const [activeEmbeddedSub, setActiveEmbeddedSub] = useState<number | null>(null);
  const [audioTracks, setAudioTracks] = useState<EmbeddedAudioTrack[]>([]);
  const [activeAudioTrack, setActiveAudioTrack] = useState<number | null>(null);

  // Fetch embedded subtitles and audio tracks from HLS conversion
  useEffect(() => {
    if (!streamId) {
      console.log('[Admin VOD Player] No streamId, skipping subtitle fetch');
      return;
    }

    const fetchMediaInfo = async () => {
      try {
        // Use "_" as placeholder token - server doesn't validate token for subtitle/audio info
        // Add cache-busting parameter to avoid CDN caching issues
        const cacheBuster = Date.now();
        
        // Fetch subtitles
        const subsUrl = `/vod-hls/_/${streamId}/subtitles.json?_=${cacheBuster}`;
        console.log('[Admin VOD Player] Fetching subtitles from:', subsUrl);
        const subsResponse = await fetch(subsUrl);
        console.log('[Admin VOD Player] Subtitles response status:', subsResponse.status);
        if (subsResponse.ok) {
          const subs = await subsResponse.json();
          setEmbeddedSubtitles(subs);
          console.log('[Admin VOD Player] Loaded embedded subtitles:', subs);
        } else {
          console.log('[Admin VOD Player] Subtitles response not ok:', await subsResponse.text());
        }
        
        // Fetch audio tracks
        const audioResponse = await fetch(`/vod-hls/_/${streamId}/audio_tracks.json?_=${cacheBuster}`);
        if (audioResponse.ok) {
          const tracks = await audioResponse.json();
          setAudioTracks(tracks);
          console.log('[Admin VOD Player] Loaded audio tracks:', tracks);
          // Set default audio track
          const defaultTrack = tracks.find((t: EmbeddedAudioTrack) => t.isDefault);
          if (defaultTrack) {
            setActiveAudioTrack(defaultTrack.index);
          } else if (tracks.length > 0) {
            setActiveAudioTrack(tracks[0].index);
          }
        }
      } catch (err) {
        console.error('[Admin VOD Player] Error fetching media info:', err);
      }
    };

    // Delay fetch slightly to allow conversion to probe tracks
    const timer = setTimeout(fetchMediaInfo, 2000);
    return () => clearTimeout(timer);
  }, [streamId]);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);

    const initPlayer = () => {
      if (Hls.isSupported() && (src.includes(".m3u8") || src.includes("/live/") || src.includes("/movie/") || src.includes("/admin-preview/"))) {
        // Get API key from localStorage for admin preview requests
        const apiKey = localStorage.getItem('iptv_api_key');
        
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          // Enable subtitle parsing
          enableWebVTT: true,
          enableIMSC1: true,
          enableCEA708Captions: true,
          renderTextTracksNatively: true,
          // Add API key header for admin preview requests
          ...(apiKey ? {
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.setRequestHeader('X-API-Key', apiKey);
            },
          } : {}),
        });

        // Enable subtitle display
        hls.subtitleDisplay = true;

        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setIsLoading(false);
          const levels = data.levels.map((level) => `${level.height}p`);
          setAvailableQualities(["auto", ...levels]);
          console.log('[HLS] Manifest parsed, audio tracks available:', hls.audioTracks);
          
          // Check native video audio tracks after a short delay
          setTimeout(() => {
            const videoEl = videoRef.current as any;
            if (videoEl && videoEl.audioTracks) {
              console.log('[Native] Video audioTracks:', videoEl.audioTracks.length);
              for (let i = 0; i < videoEl.audioTracks.length; i++) {
                console.log(`[Native] Track ${i}:`, videoEl.audioTracks[i].language, videoEl.audioTracks[i].label);
              }
            }
          }, 1000);
        });

        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
          console.log('[HLS] Audio tracks updated:', data.audioTracks);
        });

        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
          console.log('[HLS] Audio track switched to:', data.id);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setError("Failed to load video stream");
            setIsLoading(false);
          }
        });
      } else {
        // Regular video file (mp4, mkv, etc.)
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
        });
        video.addEventListener("error", (e) => {
          const mediaError = video.error;
          let errorMessage = "Failed to load video";
          
          if (mediaError) {
            switch (mediaError.code) {
              case MediaError.MEDIA_ERR_ABORTED:
                errorMessage = "Video playback was aborted";
                break;
              case MediaError.MEDIA_ERR_NETWORK:
                errorMessage = "Network error while loading video. This may be due to CORS restrictions.";
                break;
              case MediaError.MEDIA_ERR_DECODE:
                errorMessage = "Video format not supported or file is corrupted";
                break;
              case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                errorMessage = "Video source not supported. This may be due to CORS restrictions or an unsupported format.";
                break;
            }
          }
          
          setError(errorMessage);
          setIsLoading(false);
        });
      }
    };

    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, []);

  // Helper to get language label
  const getLanguageLabel = useCallback((langCode: string): string => {
    const lang = LANGUAGE_OPTIONS.find(l => l.code === langCode.toLowerCase());
    return lang?.label || langCode.toUpperCase();
  }, []);

  // Load subtitles when activeSubtitle or activeEmbeddedSub changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Remove existing text tracks
    while (video.textTracks.length > 0) {
      // Can't actually remove tracks, just disable them
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = "disabled";
      }
      break;
    }

    // Remove existing track elements
    const existingTracks = video.querySelectorAll("track");
    existingTracks.forEach((track) => track.remove());

    // Handle managed subtitles
    if (activeSubtitle !== null) {
      const subtitle = subtitles.find((s) => s.id === activeSubtitle);
      if (subtitle) {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = subtitle.languageLabel || subtitle.language;
        track.srclang = subtitle.language;
        
        // Use content endpoint for inline subtitles, or sourceUrl for external
        if (subtitle.content) {
          track.src = `${apiBaseUrl}/admin/vod/${vodId}/subtitles/${subtitle.id}/content`;
        } else if (subtitle.sourceUrl) {
          track.src = subtitle.sourceUrl;
        }
        
        track.default = true;
        video.appendChild(track);

        // Enable the track
        setTimeout(() => {
          if (video.textTracks[0]) {
            video.textTracks[0].mode = "showing";
          }
        }, 100);
      }
    }

    // Handle embedded subtitles from HLS conversion
    if (activeEmbeddedSub !== null && streamId) {
      const embeddedSub = embeddedSubtitles.find((s) => s.index === activeEmbeddedSub);
      if (embeddedSub) {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = embeddedSub.title || getLanguageLabel(embeddedSub.language);
        track.srclang = embeddedSub.language || "und";
        // Embedded subtitle URL from HLS conversion - use filename from metadata
        track.src = `/vod-hls/_/${streamId}/${embeddedSub.filename}`;
        track.default = true;
        video.appendChild(track);

        console.log('[Admin VOD Player] Loading embedded subtitle:', track.src);

        // Enable the track
        setTimeout(() => {
          if (video.textTracks[0]) {
            video.textTracks[0].mode = "showing";
          }
        }, 100);
      }
    }
  }, [activeSubtitle, activeEmbeddedSub, subtitles, embeddedSubtitles, apiBaseUrl, vodId, streamId, getLanguageLabel]);

  // Volume sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
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

  const togglePlayPause = async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.paused) {
        await video.play();
      } else {
        video.pause();
      }
    } catch (err) {
      console.error("Playback error:", err);
      // Check if it's a CORS or source error
      if (err instanceof Error) {
        if (err.name === "NotSupportedError" || err.message.includes("no supported sources")) {
          setError("Cannot play this video. The source may be blocked by CORS policy or the format is not supported. Try using an HLS stream or a CORS-enabled source.");
        } else {
          setError(`Playback error: ${err.message}`);
        }
      }
    }
  };

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

  const handleQualityChange = (newQuality: string) => {
    const hls = hlsRef.current;
    if (!hls) return;

    if (newQuality === "auto") {
      hls.currentLevel = -1;
    } else {
      const height = parseInt(newQuality);
      const levelIndex = hls.levels.findIndex((l) => l.height === height);
      if (levelIndex !== -1) {
        hls.currentLevel = levelIndex;
      }
    }
    setCurrentQuality(newQuality);
  };

  const handleAudioTrackChange = (trackIndex: number) => {
    const video = videoRef.current as any;
    const hls = hlsRef.current;
    
    // First, try native HTML5 video element audio tracks (works with fMP4 in Safari)
    if (video && video.audioTracks && video.audioTracks.length > 1) {
      console.log('[Audio Switch] Using native video audioTracks:', video.audioTracks.length);
      for (let i = 0; i < video.audioTracks.length; i++) {
        const track = video.audioTracks[i];
        // Enable the selected track, disable others
        track.enabled = (i === trackIndex || track.id === String(trackIndex));
        console.log(`[Audio Switch] Track ${i}: ${track.language} - enabled: ${track.enabled}`);
      }
    } else if (hls && hls.audioTracks.length > 0) {
      // Use HLS.js audio tracks (works when HLS has proper audio variants)
      console.log('[Audio Switch] Using HLS.js audioTracks:', hls.audioTracks.length);
      // Find matching HLS track by index or language
      const audioTrack = audioTracks.find(at => at.index === trackIndex);
      if (audioTrack) {
        const hlsTrackIndex = hls.audioTracks.findIndex(t => t.lang === audioTrack.language);
        if (hlsTrackIndex !== -1) {
          hls.audioTrack = hlsTrackIndex;
          console.log('[Audio Switch] Set HLS audio track to:', hlsTrackIndex);
        } else {
          // Try by position if language doesn't match
          const posIndex = audioTracks.findIndex(at => at.index === trackIndex);
          if (posIndex !== -1 && posIndex < hls.audioTracks.length) {
            hls.audioTrack = posIndex;
            console.log('[Audio Switch] Set HLS audio track by position to:', posIndex);
          }
        }
      }
    } else {
      console.warn('[Audio Switch] No audio track switching available. Native tracks:', 
        video?.audioTracks?.length || 0, 'HLS tracks:', hls?.audioTracks?.length || 0);
    }
    setActiveAudioTrack(trackIndex);
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black aspect-video overflow-hidden rounded-lg group"
      )}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full"
        playsInline
        onClick={togglePlayPause}
        crossOrigin="anonymous"
      />

      {/* Loading Spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-sm text-white/90 mb-4">{error}</p>
            <p className="text-xs text-white/60 mb-4">
              Tip: For external video sources, use HLS (.m3u8) streams or ensure the source supports CORS.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setIsLoading(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
        </div>

        {/* Center Play Button */}
        {!isPlaying && !isLoading && (
          <button
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 rounded-full bg-primary/90 hover:bg-primary transition-colors"
            onClick={togglePlayPause}
          >
            <Play className="h-8 w-8 text-white fill-white" />
          </button>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
          {/* Progress Bar */}
          <div className="relative group/progress">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={togglePlayPause}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() =>
                videoRef.current && (videoRef.current.currentTime -= 10)
              }
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() =>
                videoRef.current && (videoRef.current.currentTime += 10)
              }
            >
              <SkipForward className="h-5 w-5" />
            </Button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={1}
                step={0.01}
                onValueChange={(v) => setVolume(v[0])}
                className="w-24"
              />
            </div>

            {/* Time Display */}
            <span className="text-sm text-white ml-2">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Subtitles - show if either managed or embedded subs exist */}
            {(subtitles.length > 0 || embeddedSubtitles.length > 0) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "text-white hover:bg-white/20",
                      (activeSubtitle !== null || activeEmbeddedSub !== null) && "text-primary"
                    )}
                  >
                    <Subtitles className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setActiveSubtitle(null);
                      setActiveEmbeddedSub(null);
                    }}
                    className={activeSubtitle === null && activeEmbeddedSub === null ? "bg-accent" : ""}
                  >
                    Off
                  </DropdownMenuItem>
                  
                  {/* Embedded subtitles from source file */}
                  {embeddedSubtitles.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        Embedded
                      </DropdownMenuLabel>
                      {embeddedSubtitles.map((sub) => (
                        <DropdownMenuItem
                          key={`embedded-${sub.index}`}
                          onClick={() => {
                            setActiveSubtitle(null);
                            setActiveEmbeddedSub(sub.index);
                          }}
                          className={activeEmbeddedSub === sub.index ? "bg-accent" : ""}
                        >
                          {sub.title || getLanguageLabel(sub.language)}
                          {sub.isDefault && " (Default)"}
                          {sub.isForced && " (Forced)"}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  
                  {/* Managed/external subtitles */}
                  {subtitles.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel className="text-xs text-muted-foreground">
                        External
                      </DropdownMenuLabel>
                      {subtitles.map((sub) => (
                        <DropdownMenuItem
                          key={sub.id}
                          onClick={() => {
                            setActiveEmbeddedSub(null);
                            setActiveSubtitle(sub.id);
                          }}
                          className={activeSubtitle === sub.id ? "bg-accent" : ""}
                        >
                          {sub.languageLabel || sub.language}
                          {sub.isDefault && " (Default)"}
                          {sub.isForced && " (Forced)"}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Audio Tracks */}
            {audioTracks.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    title="Audio Track"
                  >
                    <Languages className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                  <DropdownMenuLabel>Audio Track</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {audioTracks.map((track) => (
                    <DropdownMenuItem
                      key={track.index}
                      onClick={() => handleAudioTrackChange(track.index)}
                      className={activeAudioTrack === track.index ? "bg-accent" : ""}
                    >
                      <div className="flex flex-col">
                        <span>
                          {track.title || getLanguageLabel(track.language)}
                          {track.isDefault && " (Default)"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {track.codec.toUpperCase()} • {track.channels === 1 ? "Mono" : track.channels === 2 ? "Stereo" : `${track.channels}.1`}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Settings */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Quality</DropdownMenuLabel>
                {availableQualities.map((q) => (
                  <DropdownMenuItem
                    key={q}
                    onClick={() => handleQualityChange(q)}
                    className={currentQuality === q ? "bg-accent" : ""}
                  >
                    {q === "auto" ? "Auto" : q}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Speed</DropdownMenuLabel>
                {[0.5, 1, 1.25, 1.5, 2].map((rate) => (
                  <DropdownMenuItem
                    key={rate}
                    onClick={() => setPlaybackRate(rate)}
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
              {isFullscreen ? (
                <Minimize className="h-5 w-5" />
              ) : (
                <Maximize className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== SUBTITLE DIALOG ====================

interface SubtitleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vodId: number;
  subtitle?: Subtitle | null;
  onSuccess: () => void;
}

function SubtitleDialog({ open, onOpenChange, vodId, subtitle, onSuccess }: SubtitleDialogProps) {
  const { toast } = useToast();
  const addSubtitle = useAddSubtitle();
  const updateSubtitle = useUpdateSubtitle();

  const [language, setLanguage] = useState(subtitle?.language || "en");
  const [languageLabel, setLanguageLabel] = useState(subtitle?.languageLabel || "");
  const [isDefault, setIsDefault] = useState(subtitle?.isDefault || false);
  const [isForced, setIsForced] = useState(subtitle?.isForced || false);
  const [sourceType, setSourceType] = useState<"url" | "file">(subtitle?.sourceUrl ? "url" : "file");
  const [sourceUrl, setSourceUrl] = useState(subtitle?.sourceUrl || "");
  const [content, setContent] = useState(subtitle?.content || "");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setContent(text);
    };
    reader.readAsText(file);
  };

  const handleSubmit = async () => {
    if (sourceType === "url" && !sourceUrl) {
      toast({
        title: "Error",
        description: "Please enter a subtitle URL",
        variant: "destructive",
      });
      return;
    }

    if (sourceType === "file" && !content) {
      toast({
        title: "Error",
        description: "Please upload a subtitle file",
        variant: "destructive",
      });
      return;
    }

    try {
      const data = {
        language,
        languageLabel: languageLabel || LANGUAGE_OPTIONS.find(l => l.code === language)?.label,
        isDefault,
        isForced,
        sourceUrl: sourceType === "url" ? sourceUrl : undefined,
        content: sourceType === "file" ? content : undefined,
        format: "srt" as const,
      };

      if (subtitle) {
        await updateSubtitle.mutateAsync({ vodId, subtitleId: subtitle.id, data });
        toast({ title: "Subtitle updated" });
      } else {
        await addSubtitle.mutateAsync({ vodId, data });
        toast({ title: "Subtitle added" });
      }

      onSuccess();
      onOpenChange(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save subtitle",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{subtitle ? "Edit Subtitle" : "Add Subtitle"}</DialogTitle>
          <DialogDescription>
            {subtitle ? "Update subtitle information" : "Add a new subtitle track to this movie"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Label (optional)</Label>
              <Input
                value={languageLabel}
                onChange={(e) => setLanguageLabel(e.target.value)}
                placeholder="e.g., English (SDH)"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              <Label>Default</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isForced} onCheckedChange={setIsForced} />
              <Label>Forced</Label>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2">
            <Label>Source Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={sourceType === "url" ? "default" : "outline"}
                onClick={() => setSourceType("url")}
                className="flex-1"
              >
                <Link2 className="mr-2 h-4 w-4" />
                URL
              </Button>
              <Button
                type="button"
                variant={sourceType === "file" ? "default" : "outline"}
                onClick={() => setSourceType("file")}
                className="flex-1"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload SRT
              </Button>
            </div>
          </div>

          {sourceType === "url" ? (
            <div className="grid gap-2">
              <Label>Subtitle URL</Label>
              <Input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://example.com/subtitles.srt"
              />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Upload SRT File</Label>
              <Input
                type="file"
                accept=".srt,.vtt"
                onChange={handleFileUpload}
              />
              {content && (
                <div className="mt-2 p-3 bg-muted rounded-lg max-h-32 overflow-auto">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {content.slice(0, 500)}
                    {content.length > 500 && "..."}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={addSubtitle.isPending || updateSubtitle.isPending}
          >
            {(addSubtitle.isPending || updateSubtitle.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {subtitle ? "Update" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN VOD DETAIL PAGE ====================

export default function VodDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const vodId = parseInt(params.id as string);
  const user = useAuthStore((state) => state.user);

  const { data: vod, isLoading, error, refetch } = useVod(vodId);
  const { data: probeInfo, isLoading: probeLoading, error: probeError } = useVodProbe(vodId);
  const { data: settings } = useSettings();
  const deleteSubtitle = useDeleteSubtitle();
  const deleteStream = useDeleteStream();

  const [isSubtitleDialogOpen, setIsSubtitleDialogOpen] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState<Subtitle | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteVodConfirm, setDeleteVodConfirm] = useState(false);
  
  // Collapsible states
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [tracksOpen, setTracksOpen] = useState(false);
  const [subtitlesOpen, setSubtitlesOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  // Get API base URL
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

  // Get preview line credentials from settings
  const previewUsername = (settings?.streaming as any)?.previewLineUsername || '';
  const previewPassword = (settings?.streaming as any)?.previewLinePassword || '';

  // Generate player URL using configured preview line
  const getPlayerUrl = (audioTrackIndex?: number) => {
    if (!vod?.stream?.id) return "";
    if (!previewUsername || !previewPassword) {
      // Fallback message - no preview line configured
      console.warn('[VOD Player] No preview line configured in settings');
      return "";
    }
    // Use the movie endpoint with configured preview line credentials
    let url = `/api-proxy/movie/${previewUsername}/${previewPassword}/${vod.stream.id}.m3u8`;
    // Add audio track parameter if specified
    if (audioTrackIndex !== undefined && audioTrackIndex !== null) {
      url += `?audio_track=${audioTrackIndex}`;
    }
    return url;
  };

  const handleDeleteSubtitle = async (subtitleId: number) => {
    try {
      await deleteSubtitle.mutateAsync({ vodId, subtitleId });
      toast({ title: "Subtitle deleted" });
      refetch();
      setDeleteConfirmId(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete subtitle",
        variant: "destructive",
      });
    }
  };

  const handleDeleteVod = async () => {
    if (!vod?.stream?.id) return;
    try {
      await deleteStream.mutateAsync(vod.stream.id);
      toast({ title: "VOD deleted successfully" });
      router.push("/admin/vod");
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete VOD",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="aspect-video w-full" />
          </div>
          <Skeleton className="h-96 hidden lg:block" />
        </div>
      </div>
    );
  }

  if (error || !vod) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">VOD Not Found</h2>
        <p className="text-muted-foreground">
          The movie you are looking for does not exist.
        </p>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-80px)] -m-3 md:-m-6">
      {/* Full Page Backdrop Background */}
      <div className="absolute inset-0 overflow-hidden">
        {vod.backdropUrl ? (
          <img
            src={vod.backdropUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : vod.posterUrl ? (
          <img
            src={vod.posterUrl}
            alt=""
            className="w-full h-full object-cover blur-sm scale-110"
          />
        ) : null}
        <div className="absolute inset-0 bg-zinc-950/85" />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/70 via-zinc-950/85 to-zinc-950" />
      </div>

      <div className="relative p-3 md:p-6 space-y-6 min-w-0">
      {/* Hero Header */}
      <div className="relative rounded-xl overflow-hidden bg-white/5 backdrop-blur-md border border-white/10">
        {/* Header Backdrop Overlay */}
        <div className="absolute inset-0">
          {vod.backdropUrl ? (
            <img
              src={vod.backdropUrl}
              alt=""
              className="w-full h-full object-cover opacity-30"
            />
          ) : vod.posterUrl ? (
            <img
              src={vod.posterUrl}
              alt=""
              className="w-full h-full object-cover blur-sm scale-110 opacity-30"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
        </div>

        {/* Back Button */}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => router.back()}
          className="absolute top-4 left-4 z-10 bg-black/50 hover:bg-black/70 text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        {/* Action Buttons */}
        <div className="absolute top-4 right-4 z-10 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => refetch()} size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/admin/vod?edit=${vodId}`)}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => setDeleteVodConfirm(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/admin/vod`)} size="sm">
            Back to VOD
          </Button>
        </div>

        {/* Content */}
        <div className="relative pt-20 md:pt-28 p-6 md:p-8 flex flex-col md:flex-row gap-6">
          {/* Poster */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            <div className="relative w-32 md:w-40 lg:w-48 aspect-[2/3] rounded-lg overflow-hidden shadow-2xl">
              {vod.posterUrl ? (
                <img
                  src={vod.posterUrl}
                  alt={vod.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center">
                  <Film className="h-12 w-12 text-muted-foreground opacity-50" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col justify-center text-center md:text-left">
            {/* Title */}
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight">
              {vod.name}
            </h1>
            
            {/* Metadata Row: Year, Rating, Duration */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3 text-white/90">
              {vod.year && <span className="text-lg">{vod.year}</span>}
              {vod.rating && (
                <span className="flex items-center gap-1 text-lg">
                  <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                  {vod.rating.toFixed(1)}
                </span>
              )}
              {vod.runtime && <span className="text-lg">{formatRuntime(vod.runtime)}</span>}
              {vod.viewerCount !== undefined && vod.viewerCount > 0 && (
                <span className="flex items-center gap-1 text-green-400">
                  <Users className="h-4 w-4" />
                  {vod.viewerCount} watching
                </span>
              )}
            </div>

            {/* Genre Badges */}
            {vod.genres && (
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                {vod.genres.split(",").map((g) => (
                  <Badge key={g.trim()} className="bg-white/20 hover:bg-white/30 text-white border-0 px-4 py-1">
                    {g.trim()}
                  </Badge>
                ))}
              </div>
            )}

            {/* Description */}
            {vod.overview && (
              <p className="text-base text-white/80 mt-4 max-w-2xl mx-auto md:mx-0 line-clamp-3">
                {vod.overview}
              </p>
            )}

            {/* Director & Cast */}
            <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-4 text-sm text-white/70">
              {vod.director && (
                <span>
                  <span className="text-white/50">Director:</span> {vod.director}
                </span>
              )}
              {vod.cast && (
                <span className="line-clamp-1">
                  <span className="text-white/50">Cast:</span> {vod.cast}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3 min-w-0 w-full max-w-full">
        {/* Left Column - Player & Info */}
        <div className="lg:col-span-2 space-y-6 min-w-0 overflow-hidden w-full max-w-full">
          {/* Video Player */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
            {(!previewUsername || !previewPassword) ? (
              <div className="aspect-video flex flex-col items-center justify-center bg-zinc-800/50 p-6 text-center">
                <AlertCircle className="h-12 w-12 text-yellow-500 mb-4" />
                <h3 className="text-lg font-semibold mb-2">Preview Line Not Configured</h3>
                <p className="text-muted-foreground text-sm mb-4">
                  Please configure a preview line in Settings → Streaming to enable video playback.
                </p>
                <Button variant="outline" onClick={() => router.push('/admin/settings')}>
                  Go to Settings
                </Button>
              </div>
            ) : (
              <VodPlayer
                src={getPlayerUrl()}
                poster={vod.posterUrl}
                title={vod.name}
                subtitles={vod.subtitles || []}
                apiBaseUrl={apiBaseUrl}
                vodId={vodId}
                streamId={vod.stream?.id}
              />
            )}
          </Card>

          {/* Info Card - Overview, Genres, Director, Cast */}
          <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden w-full max-w-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Film className="h-5 w-5" />
                Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {vod.overview && (
                <div className="overflow-hidden w-full">
                  <h4 className="font-medium mb-2">Overview</h4>
                  <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">{vod.overview}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                {vod.genres && (
                  <div className="overflow-hidden">
                    <h4 className="font-medium mb-1 text-sm">Genres</h4>
                    <p className="text-muted-foreground text-sm break-words">{vod.genres}</p>
                  </div>
                )}
                {vod.director && (
                  <div className="overflow-hidden">
                    <h4 className="font-medium mb-1 text-sm">Director</h4>
                    <p className="text-muted-foreground text-sm break-words">{vod.director}</p>
                  </div>
                )}
              </div>

              {vod.cast && (
                <div className="overflow-hidden w-full">
                  <h4 className="font-medium mb-1 text-sm">Cast</h4>
                  <p className="text-muted-foreground text-sm break-words">{vod.cast}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Collapsible Sections */}
        <div className="space-y-3">
          {/* Details Collapsible */}
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-white/5 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4 text-primary" />
                      Details
                    </CardTitle>
                    {detailsOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Year
                    </span>
                    <span className="font-medium">{vod.year || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Runtime
                    </span>
                    <span className="font-medium">{formatRuntime(vod.runtime || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      Rating
                    </span>
                    <span className="font-medium">{vod.rating?.toFixed(1) || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Subtitles className="h-4 w-4" />
                      Subtitles
                    </span>
                    <span className="font-medium">{vod.subtitles?.length || 0} tracks</span>
                  </div>

                  <Separator />

                  {vod.tmdbId && (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() => window.open(`https://www.themoviedb.org/movie/${vod.tmdbId}`, "_blank")}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      View on TMDB
                    </Button>
                  )}

                  {vod.youtubeTrailer && (
                    <Button
                      variant="outline"
                      className="w-full"
                      size="sm"
                      onClick={() => window.open(vod.youtubeTrailer, "_blank")}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Watch Trailer
                    </Button>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Source Tracks Collapsible */}
          <Collapsible open={tracksOpen} onOpenChange={setTracksOpen}>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-white/5 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-blue-500" />
                      Source Tracks
                      {probeInfo && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {probeInfo.videoTracks.length + probeInfo.audioTracks.length + probeInfo.subtitleTracks.length}
                        </Badge>
                      )}
                    </CardTitle>
                    {tracksOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  {probeLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">Analyzing...</span>
                    </div>
                  ) : probeError ? (
                    <p className="text-sm text-muted-foreground py-2">Failed to load track info</p>
                  ) : probeInfo ? (
                    <>
                      {/* File Summary */}
                      <div className="grid grid-cols-2 gap-2 p-2 bg-muted/30 rounded-lg text-xs">
                        <div>
                          <span className="text-muted-foreground">Format:</span>
                          <span className="ml-1 font-medium">{probeInfo.format.toUpperCase()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <span className="ml-1 font-medium">{probeInfo.formattedDuration}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Size:</span>
                          <span className="ml-1 font-medium">{probeInfo.formattedSize}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Bitrate:</span>
                          <span className="ml-1 font-medium">{probeInfo.formattedBitrate}</span>
                        </div>
                      </div>

                      {/* Video Tracks */}
                      {probeInfo.videoTracks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium flex items-center gap-1 mb-2">
                            <Video className="h-3 w-3 text-blue-500" />
                            Video ({probeInfo.videoTracks.length})
                          </h4>
                          <div className="space-y-1">
                            {probeInfo.videoTracks.map((track) => (
                              <div key={track.index} className="text-xs p-2 bg-muted/20 rounded flex items-center justify-between">
                                <span className="font-medium">{track.codec.toUpperCase()}</span>
                                <span className="text-muted-foreground">{track.resolution}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Audio Tracks */}
                      {probeInfo.audioTracks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium flex items-center gap-1 mb-2">
                            <Music className="h-3 w-3 text-green-500" />
                            Audio ({probeInfo.audioTracks.length})
                          </h4>
                          <div className="space-y-1">
                            {probeInfo.audioTracks.map((track) => (
                              <div key={track.index} className="text-xs p-2 bg-muted/20 rounded flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{track.codec.toUpperCase()}</span>
                                  {track.language && (
                                    <Badge variant="outline" className="text-[10px] py-0">{track.language.toUpperCase()}</Badge>
                                  )}
                                </div>
                                <span className="text-muted-foreground">{track.channelLabel}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Subtitle Tracks (embedded) */}
                      {probeInfo.subtitleTracks.length > 0 && (
                        <div>
                          <h4 className="text-xs font-medium flex items-center gap-1 mb-2">
                            <Captions className="h-3 w-3 text-yellow-500" />
                            Embedded Subs ({probeInfo.subtitleTracks.length})
                          </h4>
                          <div className="space-y-1">
                            {probeInfo.subtitleTracks.map((track) => (
                              <div key={track.index} className="text-xs p-2 bg-muted/20 rounded flex items-center justify-between">
                                <span className="font-medium">{track.codec.toUpperCase()}</span>
                                {track.language && (
                                  <Badge variant="outline" className="text-[10px] py-0">{track.language.toUpperCase()}</Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Subtitles Collapsible */}
          <Collapsible open={subtitlesOpen} onOpenChange={setSubtitlesOpen}>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-white/5 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Subtitles className="h-4 w-4 text-yellow-500" />
                      Subtitles
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {vod.subtitles?.length || 0}
                      </Badge>
                    </CardTitle>
                    {subtitlesOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setEditingSubtitle(null);
                      setIsSubtitleDialogOpen(true);
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Subtitle
                  </Button>

                  {(!vod.subtitles || vod.subtitles.length === 0) ? (
                    <p className="text-sm text-muted-foreground text-center py-2">No subtitles added</p>
                  ) : (
                    <div className="space-y-2">
                      {vod.subtitles.map((sub) => (
                        <div key={sub.id} className="flex items-center justify-between p-2 bg-muted/20 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            <span>{sub.languageLabel || sub.language}</span>
                            {sub.isDefault && (
                              <Badge variant="default" className="text-[10px] py-0">Default</Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => {
                                setEditingSubtitle(sub);
                                setIsSubtitleDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirmId(sub.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>

          {/* Source Collapsible */}
          <Collapsible open={sourceOpen} onOpenChange={setSourceOpen}>
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-white/5 transition-colors py-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Link2 className="h-4 w-4 text-purple-500" />
                      Source
                    </CardTitle>
                    {sourceOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {/* Streaming URL */}
                  <div>
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3 text-primary" />
                      Streaming URL
                    </Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={vod.stream?.id ? `/movie/{user}/{pass}/${vod.stream.id}.m3u8` : ""}
                        readOnly
                        className="font-mono text-xs h-8 bg-muted"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => {
                          const url = `${window.location.origin}/movie/${user?.username || '{username}'}/${user?.password || '{password}'}/${vod.stream?.id}.m3u8`;
                          navigator.clipboard.writeText(url);
                          toast({ title: "URL copied" });
                        }}
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Source URL */}
                  <div>
                    <Label className="text-xs text-muted-foreground">Source URL</Label>
                    <div className="flex items-center gap-1 mt-1">
                      <Input
                        value={vod.stream?.sourceUrl || ""}
                        readOnly
                        className="font-mono text-xs h-8 bg-muted truncate"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(vod.stream?.sourceUrl || "");
                          toast({ title: "URL copied" });
                        }}
                      >
                        <FileText className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Quick Info */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-muted/20 rounded">
                      <span className="text-muted-foreground">Container:</span>
                      <span className="ml-1 font-medium">{vod.containerExtension?.toUpperCase() || "N/A"}</span>
                    </div>
                    <div className="p-2 bg-muted/20 rounded">
                      <span className="text-muted-foreground">Category:</span>
                      <span className="ml-1 font-medium">{vod.category?.name || "N/A"}</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Badge variant={vod.stream?.isActive ? "default" : "secondary"} className="text-xs">
                      {vod.stream?.isActive ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant={vod.tmdbSynced ? "default" : "outline"} className="text-xs">
                      {vod.tmdbSynced ? "TMDB Synced" : "Not Synced"}
                    </Badge>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        </div>
      </div>

      {/* Subtitle Dialog */}
      <SubtitleDialog
        open={isSubtitleDialogOpen}
        onOpenChange={setIsSubtitleDialogOpen}
        vodId={vodId}
        subtitle={editingSubtitle}
        onSuccess={() => refetch()}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Subtitle</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this subtitle? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDeleteSubtitle(deleteConfirmId)}
              disabled={deleteSubtitle.isPending}
            >
              {deleteSubtitle.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete VOD Confirmation Dialog */}
      <Dialog open={deleteVodConfirm} onOpenChange={setDeleteVodConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete VOD</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{vod?.name}"? This will permanently remove the VOD entry and all associated data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteVodConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteVod}
              disabled={deleteStream.isPending}
            >
              {deleteStream.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete VOD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
