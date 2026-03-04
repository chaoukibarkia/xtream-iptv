"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Settings,
  Loader2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface StreamPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  autoPlay?: boolean;
  className?: string;
  onError?: (error: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

interface StreamStats {
  bitrate: number;
  resolution: string;
  buffered: number;
  latency: number;
}

interface AudioTrackInfo {
  id: number;
  name: string;
  lang?: string;
  default: boolean;
}

export function StreamPlayer({
  src,
  poster,
  title,
  autoPlay = true,
  className,
  onError,
  onPlay,
  onPause,
}: StreamPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  const currentSrcRef = useRef<string>("");
  const isInitializedRef = useRef(false);
  const isPlayingRef = useRef(false);

  // Store callbacks in refs to avoid triggering re-initialization
  const onErrorRef = useRef(onError);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  
  useEffect(() => {
    onErrorRef.current = onError;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
  }, [onError, onPlay, onPause]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState("auto");
  const [availableQualities, setAvailableQualities] = useState<string[]>(["auto"]);
  const [isLive, setIsLive] = useState(false);
  const [audioTracks, setAudioTracks] = useState<AudioTrackInfo[]>([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0);
  const [stats, setStats] = useState<StreamStats>({
    bitrate: 0,
    resolution: "",
    buffered: 0,
    latency: 0,
  });
  const [playStartTime, setPlayStartTime] = useState<Date | null>(null);
  const [playDuration, setPlayDuration] = useState<string>("00:00:00");

  // Initialize HLS with robust configuration
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // Prevent re-initialization if src hasn't changed
    if (currentSrcRef.current === src && isInitializedRef.current) {
      return;
    }

    currentSrcRef.current = src;
    isInitializedRef.current = true;

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };

    const initHls = () => {
      destroyHls();
      setError(null);
      setIsLoading(true);

      // Check if it's an HLS stream
      const isHlsStream = src.includes(".m3u8") || src.includes("m3u8");

      if (Hls.isSupported() && isHlsStream) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false, // Disable for more stability
          backBufferLength: 90,
          maxBufferLength: 30,
          maxMaxBufferLength: 600,
          maxBufferSize: 60 * 1000 * 1000, // 60 MB
          maxBufferHole: 1, // Increased tolerance
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          liveDurationInfinity: true,
          // Retry configuration - more retries for live streams
          manifestLoadingTimeOut: 30000,
          manifestLoadingMaxRetry: 6,
          manifestLoadingRetryDelay: 500,
          levelLoadingTimeOut: 30000,
          levelLoadingMaxRetry: 6,
          levelLoadingRetryDelay: 500,
          fragLoadingTimeOut: 30000,
          fragLoadingMaxRetry: 6,
          fragLoadingRetryDelay: 500,
          // Start from live edge for live streams
          startPosition: -1,
          // More tolerant parsing
          enableSoftwareAES: true,
        });

        hlsRef.current = hls;
        
        console.log('[StreamPlayer] Loading HLS source:', src);
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_LOADED, (_, data) => {
          console.log('[StreamPlayer] Manifest loaded:', data);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          console.log('[StreamPlayer] Manifest parsed, levels:', data.levels.length);
          setIsLive(hls.liveSyncPosition !== undefined);
          
          // Get available quality levels
          const levels = data.levels.map((level) => {
            const height = level.height;
            const bitrate = Math.round(level.bitrate / 1000);
            return `${height}p${bitrate ? ` (${bitrate}k)` : ""}`;
          });
          setAvailableQualities(["auto", ...levels]);
          
          // Update initial stats
          if (data.levels.length > 0) {
            const level = data.levels[0];
            setStats(prev => ({
              ...prev,
              resolution: `${level.width}x${level.height}`,
              bitrate: level.bitrate,
            }));
          }

          // Get audio tracks
          if (hls.audioTracks && hls.audioTracks.length > 0) {
            console.log('[StreamPlayer] Audio tracks:', hls.audioTracks);
            const tracks: AudioTrackInfo[] = hls.audioTracks.map((track, index) => ({
              id: index,
              name: track.name || track.lang || `Audio ${index + 1}`,
              lang: track.lang,
              default: track.default || index === 0,
            }));
            setAudioTracks(tracks);
            setCurrentAudioTrack(hls.audioTrack);
          }

          // Start loading and playing
          hls.startLoad();
          
          if (autoPlay) {
            console.log('[StreamPlayer] Attempting autoplay...');
            video.play().catch((e) => {
              console.log('[StreamPlayer] Autoplay failed, trying muted:', e);
              // Try muted autoplay as fallback
              video.muted = true;
              setIsMuted(true);
              video.play().catch((e2) => {
                console.log('[StreamPlayer] Muted autoplay also failed:', e2);
              });
            });
          }
          
          retryCountRef.current = 0;
        });

        // Audio tracks updated event
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, data) => {
          console.log('[StreamPlayer] Audio tracks updated:', data.audioTracks);
          if (data.audioTracks && data.audioTracks.length > 0) {
            const tracks: AudioTrackInfo[] = data.audioTracks.map((track, index) => ({
              id: index,
              name: track.name || track.lang || `Audio ${index + 1}`,
              lang: track.lang,
              default: track.default || index === 0,
            }));
            setAudioTracks(tracks);
          }
        });

        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, data) => {
          console.log('[StreamPlayer] Audio track switched to:', data.id);
          setCurrentAudioTrack(data.id);
        });
        
        hls.on(Hls.Events.FRAG_LOADING, (_, data) => {
          console.log('[StreamPlayer] Loading fragment:', data.frag.sn);
        });
        
        hls.on(Hls.Events.BUFFER_APPENDING, () => {
          console.log('[StreamPlayer] Buffer appending');
          setIsLoading(false);
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setQuality(`${level.height}p`);
            setStats(prev => ({
              ...prev,
              resolution: `${level.width}x${level.height}`,
              bitrate: level.bitrate,
            }));
          }
        });

        hls.on(Hls.Events.FRAG_LOADED, (_, data) => {
          // Update bitrate from actual fragment
          if (data.frag.stats) {
            const bps = Math.round((data.frag.stats.loaded * 8) / (data.frag.stats.loading.end - data.frag.stats.loading.start) * 1000);
            setStats(prev => ({
              ...prev,
              bitrate: bps,
            }));
          }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          console.log('[StreamPlayer] HLS Error:', data.type, data.details, data.fatal, data);
          // Only handle fatal errors - non-fatal errors are usually recoverable
          if (data.fatal) {
            // levelParsingError is common with live streams - try to recover
            if (data.details === 'levelParsingError') {
              if (retryCountRef.current < maxRetries) {
                retryCountRef.current++;
                setTimeout(() => {
                  hls.startLoad();
                }, 2000);
              }
              return;
            }
            
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                if (retryCountRef.current < maxRetries) {
                  retryCountRef.current++;
                  setTimeout(() => {
                    hls.startLoad();
                  }, 1000 * retryCountRef.current);
                } else {
                  setError("Network error - unable to load stream");
                  setIsLoading(false);
                  onErrorRef.current?.("Network error");
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                // Don't show error if stream is already playing
                if (!isPlayingRef.current) {
                  setError("Unable to play stream");
                  setIsLoading(false);
                  onErrorRef.current?.("Playback error");
                }
                break;
            }
          }
        });

      } else if (video.canPlayType("application/vnd.apple.mpegurl") && isHlsStream) {
        // Native HLS support (Safari)
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          if (autoPlay) {
            video.play().catch(() => {
              video.muted = true;
              setIsMuted(true);
              video.play().catch(() => {});
            });
          }
        });
        video.addEventListener("error", () => {
          setError("Unable to play stream");
          setIsLoading(false);
          onErrorRef.current?.("Playback error");
        });
      } else {
        // Direct video (MP4, etc.)
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          if (autoPlay) {
            video.play().catch(() => {});
          }
        });
        video.addEventListener("error", () => {
          setError("Unable to play video");
          setIsLoading(false);
          onErrorRef.current?.("Playback error");
        });
      }
    };

    initHls();

    return () => {
      destroyHls();
      isInitializedRef.current = false;
    };
  }, [src, autoPlay]);

  // Update play duration timer
  useEffect(() => {
    if (!playStartTime || !isPlaying) return;
    
    const updateDuration = () => {
      const now = new Date();
      const diff = Math.floor((now.getTime() - playStartTime.getTime()) / 1000);
      const hours = Math.floor(diff / 3600);
      const minutes = Math.floor((diff % 3600) / 60);
      const seconds = diff % 60;
      setPlayDuration(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };
    
    updateDuration();
    const interval = setInterval(updateDuration, 1000);
    return () => clearInterval(interval);
  }, [playStartTime, isPlaying]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
      if (!playStartTime) {
        setPlayStartTime(new Date());
      }
      onPlayRef.current?.();
    };
    
    const handlePause = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
      onPauseRef.current?.();
    };
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };
    
    const handleDurationChange = () => {
      setDuration(video.duration);
    };
    
    const handleProgress = () => {
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
        setStats(prev => ({
          ...prev,
          buffered: video.buffered.end(video.buffered.length - 1),
        }));
      }
    };
    
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);
    const handleCanPlay = () => setIsLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);
    video.addEventListener("canplay", handleCanPlay);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("canplay", handleCanPlay);
    };
  }, [playStartTime]);

  // Volume sync
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = isMuted ? 0 : volume;
      video.muted = isMuted;
    }
  }, [volume, isMuted]);

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
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
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

  const handleRetry = () => {
    retryCountRef.current = 0;
    setError(null);
    setIsLoading(true);
    
    if (hlsRef.current) {
      hlsRef.current.destroy();
    }
    
    // Re-trigger the useEffect by creating a new HLS instance
    const video = videoRef.current;
    if (video && src) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLoading(false);
        video.play().catch(() => {});
      });
      
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError("Stream unavailable");
          setIsLoading(false);
        }
      });
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
    setQuality(newQuality);
  };

  const handleAudioTrackChange = (trackId: number) => {
    const hls = hlsRef.current;
    if (!hls) return;

    console.log('[StreamPlayer] Switching audio track to:', trackId);
    hls.audioTrack = trackId;
    setCurrentAudioTrack(trackId);
  };

  const formatBitrate = (bps: number) => {
    if (bps >= 1000000) {
      return `${(bps / 1000000).toFixed(1)} Mbps`;
    }
    if (bps >= 1000) {
      return `${(bps / 1000).toFixed(0)} Kbps`;
    }
    return `${bps} bps`;
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "LIVE";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black aspect-video overflow-hidden group rounded-lg",
        className
      )}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="w-full h-full object-contain"
        playsInline
        onClick={togglePlayPause}
      />

      {/* Loading Spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-3" />
          <p className="text-sm text-zinc-400">Loading stream...</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80">
          <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
          <p className="text-lg text-red-400 mb-2">{error}</p>
          <p className="text-sm text-zinc-500 mb-4">The stream may be offline or unavailable</p>
          <Button onClick={handleRetry} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/50 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
            {isLive && (
              <Badge className="bg-red-600 text-white animate-pulse">
                <Wifi className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            )}
          </div>
          
          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-zinc-400">
            {playStartTime && (
              <>
                <span className="flex items-center gap-1">
                  <span className="text-green-400">●</span>
                  {playDuration}
                </span>
                <span>•</span>
              </>
            )}
            {stats.resolution && (
              <>
                <span>{stats.resolution}</span>
                <span>•</span>
              </>
            )}
            {stats.bitrate > 0 && <span>{formatBitrate(stats.bitrate)}</span>}
          </div>
        </div>

        {/* Center Play Button */}
        {!isPlaying && !isLoading && !error && (
          <button
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-5 rounded-full bg-blue-600/90 hover:bg-blue-600 transition-all hover:scale-110"
            onClick={togglePlayPause}
          >
            <Play className="h-10 w-10 text-white fill-white" />
          </button>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          {/* Progress Bar (only for VOD) */}
          {!isLive && duration > 0 && (
            <div className="relative">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={(v) => {
                  const video = videoRef.current;
                  if (video) video.currentTime = v[0];
                }}
                className="cursor-pointer"
              />
              {/* Buffered indicator */}
              <div
                className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/20 rounded-full pointer-events-none"
                style={{ width: `${(buffered / duration) * 100}%` }}
              />
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-10 w-10"
              onClick={togglePlayPause}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" />
              ) : (
                <Play className="h-5 w-5 fill-current" />
              )}
            </Button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20 h-10 w-10"
                onClick={toggleMute}
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
                onValueChange={(v) => {
                  setVolume(v[0]);
                  if (v[0] > 0) setIsMuted(false);
                }}
                className="w-24"
              />
            </div>

            {/* Time / Live indicator */}
            <span className="text-sm text-white ml-2">
              {isLive ? (
                <span className="flex items-center gap-1 text-red-400">
                  <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                  LIVE
                </span>
              ) : (
                `${formatTime(currentTime)} / ${formatTime(duration)}`
              )}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Audio Track Selector */}
            {audioTracks.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-10 w-10"
                    title="Audio Track"
                  >
                    <Languages className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
                  <DropdownMenuLabel className="text-zinc-400">Audio Track</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-700" />
                  {audioTracks.map((track) => (
                    <DropdownMenuItem
                      key={track.id}
                      onClick={() => handleAudioTrackChange(track.id)}
                      className={cn(
                        "cursor-pointer",
                        currentAudioTrack === track.id ? "bg-blue-600" : "hover:bg-zinc-800"
                      )}
                    >
                      {track.name}
                      {track.lang && track.lang !== track.name && ` (${track.lang})`}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Quality Settings */}
            {availableQualities.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20 h-10 w-10"
                  >
                    <Settings className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-700">
                  <DropdownMenuLabel className="text-zinc-400">Quality</DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-zinc-700" />
                  {availableQualities.map((q) => (
                    <DropdownMenuItem
                      key={q}
                      onClick={() => handleQualityChange(q.split(" ")[0])}
                      className={cn(
                        "cursor-pointer",
                        quality === q.split(" ")[0] ? "bg-blue-600" : "hover:bg-zinc-800"
                      )}
                    >
                      {q}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Fullscreen */}
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 h-10 w-10"
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

export default StreamPlayer;

