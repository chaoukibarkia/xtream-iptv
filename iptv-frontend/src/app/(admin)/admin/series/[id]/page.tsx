"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import Image from "next/image";
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
  Tv,
  ChevronDown,
  ChevronUp,
  FileVideo,
  Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

import {
  useSeries,
  useSeriesSeasons,
  useSeasonEpisodes,
  useSyncSeriesTmdb,
} from "@/lib/api/hooks/useSeries";

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

// Episode Player Component
interface EpisodePlayerProps {
  src: string;
  poster?: string;
  title?: string;
}

function EpisodePlayer({ src, poster, title }: EpisodePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [availableQualities, setAvailableQualities] = useState<string[]>(["auto"]);
  const [currentQuality, setCurrentQuality] = useState("auto");
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    setIsLoading(true);
    setError(null);

    const initPlayer = () => {
      if (Hls.isSupported() && (src.includes(".m3u8") || src.includes("/series/"))) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
        });

        hlsRef.current = hls;
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setIsLoading(false);
          const levels = data.levels.map((level) => `${level.height}p`);
          setAvailableQualities(["auto", ...levels]);
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            setError("Failed to load video stream");
            setIsLoading(false);
          }
        });
      } else {
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
        });
        video.addEventListener("error", () => {
          setError("Failed to load video");
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

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => setCurrentTime(video.currentTime);
    const handleDurationChange = () => setDuration(video.duration);
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.playbackRate = playbackRate;
    }
  }, [playbackRate]);

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

      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <p className="text-sm text-white/90 mb-4">{error}</p>
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

      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 transition-opacity",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute top-0 left-0 right-0 p-4">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
        </div>

        {!isPlaying && !isLoading && (
          <button
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 rounded-full bg-primary/90 hover:bg-primary transition-colors"
            onClick={togglePlayPause}
          >
            <Play className="h-8 w-8 text-white fill-white" />
          </button>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
          <div className="relative group/progress">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
          </div>

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

            <span className="text-sm text-white ml-2">
              {formatDuration(currentTime)} / {formatDuration(duration)}
            </span>

            <div className="flex-1" />

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

// Episode Row Component
interface EpisodeRowProps {
  episode: {
    id: number;
    episodeNumber: number;
    name: string;
    overview?: string;
    runtime?: number;
    airDate?: string;
    sourceUrl?: string;
    isAvailable?: boolean;
  };
  seasonNumber: number;
  seriesId: number;
  isSelected: boolean;
  onSelect: () => void;
}

function EpisodeRow({ episode, seasonNumber, seriesId, isSelected, onSelect }: EpisodeRowProps) {
  const user = useAuthStore((state) => state.user);
  const hasSource = !!episode.sourceUrl;

  return (
    <div
      className={cn(
        "flex items-start gap-4 p-4 rounded-lg border transition-colors cursor-pointer",
        isSelected ? "bg-primary/10 border-primary" : "bg-card hover:bg-accent/50"
      )}
      onClick={onSelect}
    >
      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
        <span className="text-lg font-semibold">{episode.episodeNumber}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h4 className="font-medium">{episode.name}</h4>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span>S{seasonNumber} E{episode.episodeNumber}</span>
              {episode.runtime && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatRuntime(episode.runtime)}
                  </span>
                </>
              )}
              {episode.airDate && (
                <>
                  <span>•</span>
                  <span>{new Date(episode.airDate).toLocaleDateString()}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasSource ? (
              <Badge variant="default" className="text-xs">
                <FileVideo className="h-3 w-3 mr-1" />
                Available
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                No Source
              </Badge>
            )}
          </div>
        </div>
        {episode.overview && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {episode.overview}
          </p>
        )}
      </div>
    </div>
  );
}

// Main Series Detail Page
export default function SeriesDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const seriesId = parseInt(params.id as string);
  const user = useAuthStore((state) => state.user);

  const { data: series, isLoading, error, refetch } = useSeries(seriesId);
  const { data: seasons } = useSeriesSeasons(seriesId);
  const syncSeriesTmdb = useSyncSeriesTmdb();

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    seasonNumber: number;
    episodeNumber: number;
    episode: any;
  } | null>(null);

  // Set default season
  useEffect(() => {
    if (seasons && seasons.length > 0 && selectedSeason === null) {
      setSelectedSeason(seasons[0].seasonNumber);
    }
  }, [seasons, selectedSeason]);

  const handleSyncTmdb = async () => {
    try {
      await syncSeriesTmdb.mutateAsync(seriesId);
      toast({
        title: "Metadata synced",
        description: "Series metadata has been updated from TMDB.",
      });
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to sync metadata.",
        variant: "destructive",
      });
    }
  };

  const getPlayerUrl = () => {
    if (!selectedEpisode?.episode?.sourceUrl) return "";
    // Use the series streaming endpoint
    return `/series/${user?.username || 'admin'}/${user?.password || 'admin123'}/${selectedEpisode.episode.id}.m3u8`;
  };

  // Get series data (support both direct and nested data structure)
  const seriesData = series as any;
  
  // Helper functions to extract data
  const getCoverUrl = () => seriesData?.coverUrl || seriesData?.cover || seriesData?.posterUrl;
  
  const getBackdropUrl = () => {
    if (seriesData?.backdropUrl) return seriesData.backdropUrl;
    if (typeof seriesData?.backdropPath === 'string') return seriesData.backdropPath;
    if (Array.isArray(seriesData?.backdropPath) && seriesData.backdropPath.length > 0) {
      return seriesData.backdropPath[0];
    }
    return undefined;
  };
  
  const getYear = () => {
    if (seriesData?.year) return seriesData.year;
    if (seriesData?.releaseYear) return seriesData.releaseYear;
    if (seriesData?.releaseDate) return new Date(seriesData.releaseDate).getFullYear();
    return undefined;
  };
  
  const coverUrl = getCoverUrl();
  const backdropUrl = getBackdropUrl();
  const name = seriesData?.name;
  const year = getYear();
  const rating = seriesData?.rating;
  const genre = seriesData?.genre || seriesData?.genres;
  const plot = seriesData?.plot || seriesData?.overview || seriesData?.description;
  const cast = seriesData?.cast;
  const status = seriesData?.status || 'unknown';
  const tmdbId = seriesData?.tmdbId;
  const totalSeasons = seasons?.length || seriesData?._count?.seasons || 0;
  const totalEpisodes = seasons?.reduce((acc, s) => acc + (s.episodes?.length || 0), 0) || seriesData?._count?.episodes || 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Skeleton className="aspect-video w-full" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error || !series) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Series Not Found</h2>
        <p className="text-muted-foreground">
          The series you are looking for does not exist.
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
        {backdropUrl ? (
          <img
            src={backdropUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : coverUrl ? (
          <img
            src={coverUrl}
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
          {backdropUrl ? (
            <img
              src={backdropUrl}
              alt=""
              className="w-full h-full object-cover opacity-30"
            />
          ) : coverUrl ? (
            <img
              src={coverUrl}
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
            onClick={handleSyncTmdb}
            disabled={syncSeriesTmdb.isPending}
          >
            {syncSeriesTmdb.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Link2 className="mr-2 h-4 w-4" />
            )}
            Sync TMDB
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/admin/series`)} size="sm">
            Back to Series
          </Button>
        </div>

        {/* Content */}
        <div className="relative pt-20 md:pt-28 p-6 md:p-8 flex flex-col md:flex-row gap-6">
          {/* Poster */}
          <div className="flex-shrink-0 mx-auto md:mx-0">
            <div className="relative w-32 md:w-40 lg:w-48 aspect-[2/3] rounded-lg overflow-hidden shadow-2xl">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center">
                  <Tv className="h-12 w-12 text-muted-foreground opacity-50" />
                </div>
              )}
            </div>
          </div>

          {/* Info */}
          <div className="flex-1 flex flex-col justify-center text-center md:text-left">
            {/* Title */}
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white leading-tight">
              {name}
            </h1>
            
            {/* Metadata Row: Year, Rating, Seasons, Episodes */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3 text-white/90">
              {year && <span className="text-lg">{year}</span>}
              {rating && (
                <span className="flex items-center gap-1 text-lg">
                  <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                  {rating.toFixed(1)}
                </span>
              )}
              {totalSeasons > 0 && (
                <span className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  {totalSeasons} Seasons
                </span>
              )}
              {totalEpisodes > 0 && (
                <span className="flex items-center gap-1">
                  <Film className="h-4 w-4" />
                  {totalEpisodes} Episodes
                </span>
              )}
            </div>

            {/* Status & Genre Badges */}
            <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
              {status && (
                <Badge 
                  className={cn(
                    "border-0 px-3 py-1",
                    status === "ongoing" ? "bg-green-500/20 text-green-400" :
                    status === "completed" ? "bg-blue-500/20 text-blue-400" :
                    "bg-red-500/20 text-red-400"
                  )}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Badge>
              )}
              {genre && genre.split(",").map((g: string) => (
                <Badge key={g.trim()} className="bg-white/20 hover:bg-white/30 text-white border-0 px-4 py-1">
                  {g.trim()}
                </Badge>
              ))}
            </div>

            {/* Description */}
            {plot && (
              <p className="text-base text-white/80 mt-4 max-w-2xl mx-auto md:mx-0 line-clamp-3">
                {plot}
              </p>
            )}

            {/* Cast */}
            {cast && (
              <div className="mt-4 text-sm text-white/70">
                <span className="text-white/50">Cast:</span> {cast}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3 min-w-0 w-full max-w-full">
        {/* Left Column - Player & Episodes */}
        <div className="lg:col-span-2 space-y-6 min-w-0 overflow-hidden w-full max-w-full">
          {/* Video Player */}
          {selectedEpisode && (
            <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Now Playing: S{selectedEpisode.seasonNumber} E{selectedEpisode.episodeNumber} - {selectedEpisode.episode.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <EpisodePlayer
                  src={getPlayerUrl()}
                  title={`${name} - S${selectedEpisode.seasonNumber}E${selectedEpisode.episodeNumber}`}
                />
              </CardContent>
            </Card>
          )}

          {!selectedEpisode && (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Tv className="h-16 w-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Select an episode to play</p>
                <p className="text-sm">Choose from the seasons and episodes below</p>
              </CardContent>
            </Card>
          )}

          {/* Seasons & Episodes */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5" />
                Seasons & Episodes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {seasons && seasons.length > 0 ? (
                <Tabs 
                  value={selectedSeason?.toString()} 
                  onValueChange={(v) => setSelectedSeason(parseInt(v))}
                >
                  <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden whitespace-nowrap">
                    {seasons.map((season) => (
                      <TabsTrigger
                        key={season.seasonNumber}
                        value={season.seasonNumber.toString()}
                      >
                        Season {season.seasonNumber}
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {season.episodes?.length || 0}
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {seasons.map((season) => (
                    <TabsContent
                      key={season.seasonNumber}
                      value={season.seasonNumber.toString()}
                      className="mt-4"
                    >
                      <ScrollArea className="h-[400px]">
                        <div className="space-y-3 pr-4">
                          {season.episodes && season.episodes.length > 0 ? (
                            season.episodes.map((episode) => (
                              <EpisodeRow
                                key={episode.id}
                                episode={episode}
                                seasonNumber={season.seasonNumber}
                                seriesId={seriesId}
                                isSelected={
                                  selectedEpisode?.seasonNumber === season.seasonNumber &&
                                  selectedEpisode?.episodeNumber === episode.episodeNumber
                                }
                                onSelect={() =>
                                  setSelectedEpisode({
                                    seasonNumber: season.seasonNumber,
                                    episodeNumber: episode.episodeNumber,
                                    episode,
                                  })
                                }
                              />
                            ))
                          ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                              <Film className="h-12 w-12 mb-2 opacity-50" />
                              <p>No episodes in this season</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Layers className="h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">No seasons available</p>
                  <p className="text-sm">Add seasons and episodes to this series</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Details */}
        <div className="space-y-6">
          {/* Quick Info */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Series Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Year
                </span>
                <span className="font-medium">{year || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  Rating
                </span>
                <span className="font-medium">{rating?.toFixed(1) || "N/A"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  Seasons
                </span>
                <span className="font-medium">{totalSeasons}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Film className="h-4 w-4" />
                  Episodes
                </span>
                <span className="font-medium">{totalEpisodes}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Tv className="h-4 w-4" />
                  Status
                </span>
                <Badge 
                  variant={status === "ongoing" ? "default" : status === "completed" ? "secondary" : "outline"}
                >
                  {status || "Unknown"}
                </Badge>
              </div>

              <Separator />

              {tmdbId && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(`https://www.themoviedb.org/tv/${tmdbId}`, "_blank")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on TMDB
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Streaming Info */}
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-lg">Streaming URL</CardTitle>
              <CardDescription>
                Use this URL pattern in IPTV players
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-muted/30 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Pattern:</p>
                <code className="text-xs break-all">
                  /series/&#123;username&#125;/&#123;password&#125;/&#123;episode_id&#125;.m3u8
                </code>
              </div>
              {selectedEpisode && (
                <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                  <p className="text-xs text-muted-foreground mb-1">Current Episode:</p>
                  <code className="text-xs break-all">
                    {typeof window !== 'undefined' ? window.location.origin : ''}/series/{user?.username || '{username}'}/{user?.password || '{password}'}/{selectedEpisode.episode.id}.m3u8
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() => {
                      const url = `${window.location.origin}/series/${user?.username || '{username}'}/${user?.password || '{password}'}/${selectedEpisode.episode.id}.m3u8`;
                      navigator.clipboard.writeText(url);
                      toast({ title: "URL copied" });
                    }}
                  >
                    Copy URL
                  </Button>
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
