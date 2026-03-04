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
  SkipBack,
  SkipForward,
  Loader2,
  Subtitles,
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
import { usePlayerStore } from "@/stores/playerStore";
import { formatDuration } from "@/lib/utils";

interface VideoPlayerProps {
  src: string;
  poster?: string;
  title?: string;
  streamId?: number;
  autoPlay?: boolean;
  startTime?: number;
  isAdminPreview?: boolean; // When true, sends X-API-Key header for admin preview endpoints
  onProgress?: (currentTime: number, duration: number) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
  className?: string;
}

export function VideoPlayer({
  src,
  poster,
  title,
  streamId,
  autoPlay = false,
  startTime = 0,
  isAdminPreview = false,
  onProgress,
  onTimeUpdate,
  onEnded,
  className,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const {
    isPlaying,
    setIsPlaying,
    volume,
    setVolume,
    isMuted,
    toggleMute,
    quality,
    setQuality,
    playbackRate,
    setPlaybackRate,
    isFullscreen,
    setIsFullscreen,
    showControls,
    setShowControls,
    updateProgress,
  } = usePlayerStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availableQualities, setAvailableQualities] = useState<string[]>(["auto"]);
  const [availableSubtitles, setAvailableSubtitles] = useState<{ id: number; name: string; lang: string }[]>([]);
  const [currentSubtitle, setCurrentSubtitle] = useState<number>(-1);

  // Initialize HLS
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const initPlayer = () => {
      if (Hls.isSupported() && src.includes(".m3u8")) {
        // Get API key from localStorage for admin preview requests
        const apiKey = isAdminPreview ? localStorage.getItem('iptv_api_key') : null;
        
        const hls = new Hls({
          enableWorker: true,
          // Low-latency settings for instant playback
          lowLatencyMode: true,
          liveSyncDurationCount: 1, // Start 1 segment behind live edge
          liveMaxLatencyDurationCount: 3, // Max 3 segments behind
          liveDurationInfinity: true, // Treat live streams as infinite
          // Minimal buffering for fast startup
          maxBufferLength: 10, // Only buffer 10 seconds
          maxMaxBufferLength: 30, // Max 30 seconds buffer
          maxBufferSize: 10 * 1000 * 1000, // 10MB max buffer
          maxBufferHole: 0.5, // Small buffer hole tolerance
          // Back buffer settings
          backBufferLength: 30, // Keep 30s back buffer
          // Fast startup
          startLevel: -1, // Auto quality selection
          startPosition: -1, // Start at live edge
          // Fragment loading
          maxLoadingDelay: 4, // Max 4s loading delay
          maxFragLookUpTolerance: 0.25,
          // Enable subtitle parsing
          enableWebVTT: true,
          enableIMSC1: true,
          enableCEA708Captions: true,
          renderTextTracksNatively: true, // Use native browser text track rendering
          // Add API key header for admin preview requests
          ...(isAdminPreview && apiKey ? {
            xhrSetup: (xhr: XMLHttpRequest) => {
              xhr.setRequestHeader('X-API-Key', apiKey);
            },
          } : {}),
        });
        
        // Enable subtitle display (runtime property, not config)
        hls.subtitleDisplay = true;

        hlsRef.current = hls;
        
        // Manually fetch and parse the master playlist for subtitles
        // This is a fallback in case HLS.js doesn't detect them
        const fetchOptions: RequestInit = isAdminPreview && apiKey
          ? { headers: { 'X-API-Key': apiKey } }
          : {};
        
        fetch(src, fetchOptions)
          .then(res => res.text())
          .then(playlist => {
            console.log('Raw playlist:', playlist);
            // Parse EXT-X-MEDIA tags for subtitles
            const subtitleRegex = /#EXT-X-MEDIA:TYPE=SUBTITLES[^]*?LANGUAGE="([^"]+)"[^]*?NAME="([^"]+)"/g;
            const matches: { id: number; name: string; lang: string }[] = [];
            let match;
            let index = 0;
            while ((match = subtitleRegex.exec(playlist)) !== null) {
              matches.push({
                id: index++,
                lang: match[1],
                name: match[2],
              });
            }
            if (matches.length > 0) {
              console.log('Manually parsed subtitles:', matches);
              setAvailableSubtitles(matches);
            }
          })
          .catch(err => console.error('Failed to fetch playlist for subtitle parsing:', err));
        
        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
          setIsLoading(false);
          // Get available quality levels
          const levels = data.levels.map((level) => `${level.height}p`);
          setAvailableQualities(["auto", ...levels]);
          
          // Get available subtitle tracks - check immediately and after a short delay
          const loadSubtitleTracks = () => {
            console.log('HLS subtitle tracks:', hls.subtitleTracks);
            console.log('HLS all tracks:', { 
              subtitle: hls.subtitleTracks, 
              audio: hls.audioTracks,
              levels: hls.levels.length 
            });
            
            if (hls.subtitleTracks && hls.subtitleTracks.length > 0) {
              const subtitles = hls.subtitleTracks.map((track, index) => ({
                id: index,
                name: track.name || `Subtitle ${index + 1}`,
                lang: track.lang || 'unknown',
              }));
              setAvailableSubtitles(subtitles);
              console.log('Available subtitles set:', subtitles);
            }
          };
          
          loadSubtitleTracks();
          // Also try after a delay in case tracks load asynchronously
          setTimeout(loadSubtitleTracks, 1000);
          setTimeout(loadSubtitleTracks, 3000);
          
          // Set start time if provided
          if (startTime > 0) {
            video.currentTime = startTime;
          }
          if (autoPlay) {
            video.play().catch(() => {});
          }
        });

        // Listen for subtitle track updates
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_, data) => {
          console.log('SUBTITLE_TRACKS_UPDATED event:', data.subtitleTracks);
          if (data.subtitleTracks && data.subtitleTracks.length > 0) {
            const subtitles = data.subtitleTracks.map((track: { name?: string; lang?: string }, index: number) => ({
              id: index,
              name: track.name || `Subtitle ${index + 1}`,
              lang: track.lang || 'unknown',
            }));
            setAvailableSubtitles(subtitles);
            console.log('Subtitles updated from event:', subtitles);
          }
        });
        
        // Listen for subtitle track loaded
        hls.on(Hls.Events.SUBTITLE_TRACK_LOADED, (_, data) => {
          console.log('SUBTITLE_TRACK_LOADED event:', data);
        });
        
        // Debug: log all HLS events
        hls.on(Hls.Events.ERROR, (_, data) => {
          console.log('HLS Error:', data);
          if (data.fatal) {
            setError("Failed to load video stream");
            setIsLoading(false);
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setQuality(`${level.height}p`);
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Native HLS support (Safari)
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          if (startTime > 0) {
            video.currentTime = startTime;
          }
          if (autoPlay) {
            video.play().catch(() => {});
          }
        });
      } else {
        // Regular video
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          setIsLoading(false);
          if (startTime > 0) {
            video.currentTime = startTime;
          }
          if (autoPlay) {
            video.play().catch(() => {});
          }
        });
      }
    };

    initPlayer();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src, autoPlay, setQuality]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (onProgress) {
        onProgress(video.currentTime, video.duration);
      }
      if (onTimeUpdate) {
        onTimeUpdate(video.currentTime, video.duration);
      }
      if (streamId) {
        updateProgress(streamId, video.currentTime, video.duration);
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
      if (onEnded) onEnded();
    };
    const handleWaiting = () => setIsLoading(true);
    const handlePlaying = () => setIsLoading(false);

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("durationchange", handleDurationChange);
    video.addEventListener("progress", handleProgress);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("playing", handlePlaying);

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("durationchange", handleDurationChange);
      video.removeEventListener("progress", handleProgress);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("playing", handlePlaying);
    };
  }, [setIsPlaying, onProgress, onTimeUpdate, onEnded, streamId, updateProgress]);

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
  }, [isPlaying, setShowControls]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case " ":
        case "k":
          e.preventDefault();
          togglePlayPause();
          break;
        case "m":
          toggleMute();
          break;
        case "f":
          toggleFullscreen();
          break;
        case "ArrowLeft":
          video.currentTime = Math.max(0, video.currentTime - 10);
          break;
        case "ArrowRight":
          video.currentTime = Math.min(duration, video.currentTime + 10);
          break;
        case "ArrowUp":
          setVolume(Math.min(1, volume + 0.1));
          break;
        case "ArrowDown":
          setVolume(Math.max(0, volume - 0.1));
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [volume, duration, toggleMute, setVolume]);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
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
    setQuality(newQuality);
  };

  const handleSubtitleChange = async (subtitleId: number) => {
    const hls = hlsRef.current;
    const video = videoRef.current;
    
    console.log('Changing subtitle to:', subtitleId);
    setCurrentSubtitle(subtitleId);
    
    // First try HLS.js subtitle tracks
    if (hls && hls.subtitleTracks && hls.subtitleTracks.length > 0) {
      hls.subtitleTrack = subtitleId;
      hls.subtitleDisplay = subtitleId >= 0;
      console.log('Set HLS subtitle track to:', subtitleId, 'display:', subtitleId >= 0);
      return;
    }
    
    // Fallback: handle native text tracks
    if (video) {
      // Hide all existing tracks
      for (let i = 0; i < video.textTracks.length; i++) {
        video.textTracks[i].mode = 'hidden';
      }
      
      if (subtitleId === -1) {
        // Turn off subtitles
        return;
      }
      
      // If we have manually parsed subtitles, we need to load the VTT file
      if (availableSubtitles[subtitleId] && src) {
        const sub = availableSubtitles[subtitleId];
        // Extract base URL and token from the HLS source
        // src is like: /api-proxy/movie/user/pass/5.m3u8
        const match = src.match(/\/api-proxy\/movie\/([^/]+)\/([^/]+)\/(\d+)\.m3u8/);
        if (match) {
          const [, username, password, vodId] = match;
          // First fetch the master playlist to get the token
          try {
            const playlistRes = await fetch(src);
            const playlist = await playlistRes.text();
            // Extract token from the subtitle URI in the playlist
            const tokenMatch = playlist.match(/\/vod-hls\/([^/]+)\/\d+\/subs_/);
            if (tokenMatch) {
              const token = tokenMatch[1];
              // Map subtitle id to actual subtitle index (from subtitles.json format)
              const subtitleIndex = sub.id + 2; // Subtitle indices start at 2 in ffprobe
              const vttUrl = `/api-proxy/vod-hls/${token}/${vodId}/subtitle_${subtitleIndex}.vtt`;
              
              console.log('Loading VTT from:', vttUrl);
              
              // Check if we already have this track
              let existingTrack: TextTrack | null = null;
              for (let i = 0; i < video.textTracks.length; i++) {
                if (video.textTracks[i].language === sub.lang) {
                  existingTrack = video.textTracks[i];
                  break;
                }
              }
              
              if (existingTrack) {
                existingTrack.mode = 'showing';
              } else {
                // Add new track element
                const track = document.createElement('track');
                track.kind = 'subtitles';
                track.label = sub.name;
                track.srclang = sub.lang;
                track.src = vttUrl;
                track.default = false;
                video.appendChild(track);
                
                // Wait for track to load then show it
                track.addEventListener('load', () => {
                  if (video.textTracks[video.textTracks.length - 1]) {
                    video.textTracks[video.textTracks.length - 1].mode = 'showing';
                  }
                });
              }
            }
          } catch (err) {
            console.error('Failed to load subtitle:', err);
          }
        }
      }
    }
  };

  // Check for native video text tracks
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const tracks = video.textTracks;
      if (tracks.length > 0 && availableSubtitles.length === 0) {
        const subtitles: { id: number; name: string; lang: string }[] = [];
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (track.kind === 'subtitles' || track.kind === 'captions') {
            subtitles.push({
              id: i,
              name: track.label || `Subtitle ${i + 1}`,
              lang: track.language || 'unknown',
            });
          }
        }
        if (subtitles.length > 0) {
          setAvailableSubtitles(subtitles);
        }
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => video.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [availableSubtitles.length]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative bg-black aspect-video overflow-hidden group",
        className
      )}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      <video
        ref={videoRef}
        poster={poster}
        className="absolute inset-0 w-full h-full object-contain z-0"
        playsInline
        crossOrigin="anonymous"
        onClick={togglePlayPause}
      />

      {/* Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="text-center">
            <p className="text-lg text-destructive">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity z-20 pointer-events-none",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
          {title && <h2 className="text-lg font-semibold text-white">{title}</h2>}
        </div>

        {/* Center Play Button */}
        {!isPlaying && !isLoading && (
          <button
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-4 rounded-full bg-primary/90 hover:bg-primary transition-colors pointer-events-auto"
            onClick={togglePlayPause}
          >
            <Play className="h-8 w-8 text-white fill-white" />
          </button>
        )}

        {/* Bottom Controls */}
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
          {/* Progress Bar */}
          <div className="relative group/progress">
            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="cursor-pointer"
            />
            {/* Buffered indicator */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-full pointer-events-none"
              style={{ width: `${(buffered / duration) * 100}%` }}
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
                videoRef.current &&
                (videoRef.current.currentTime -= 10)
              }
            >
              <SkipBack className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() =>
                videoRef.current &&
                (videoRef.current.currentTime += 10)
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

            {/* Subtitles */}
            {availableSubtitles.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                  >
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
                    className={quality === q ? "bg-accent" : ""}
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

export default VideoPlayer;
