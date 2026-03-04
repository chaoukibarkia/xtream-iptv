"use client";

import React, { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  Heart,
  Share,
  ChevronLeft,
  ChevronRight,
  Star,
  Clock,
  Calendar,
  List,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import VideoPlayer from "@/components/player/video-player";
import { usePlayerStore } from "@/stores/playerStore";

// Local types for mock data
interface Episode {
  id: string;
  title: string;
  episodeNumber: number;
  seasonNumber: number;
  duration?: number;
  description?: string;
  streamUrl?: string;
  thumbnailUrl?: string;
}

interface Season {
  seasonNumber: number;
  episodeCount: number;
  episodes?: Episode[];
}

interface Series {
  id: string;
  name: string;
  type: string;
  categoryId: string;
  tmdbId?: string;
  posterUrl?: string;
  backdropUrl?: string;
  description?: string;
  rating?: number;
  releaseYear?: number;
  genre?: string;
  cast?: string;
  director?: string;
  isActive: boolean;
  seasons?: Season[];
  createdAt?: string;
  updatedAt?: string;
  streamUrl?: string;
}

// Mock series data
const mockSeries: Series = {
  id: "1",
  name: "Breaking Bad",
  type: "series",
  categoryId: "drama",
  tmdbId: "1396",
  posterUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  backdropUrl: "https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
  description: "A high school chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine in order to secure his family's future.",
  rating: 9.5,
  releaseYear: 2008,
  genre: "Drama, Crime, Thriller",
  cast: "Bryan Cranston, Aaron Paul, Anna Gunn",
  director: "Vince Gilligan",
  isActive: true,
  seasons: [
    {
      seasonNumber: 1,
      episodeCount: 7,
      episodes: [
        {
          id: "e1",
          title: "Pilot",
          episodeNumber: 1,
          seasonNumber: 1,
          duration: 58,
          description: "Walter White, a chemistry teacher, discovers that he has cancer and decides to get into the meth-making business to repay his medical debts.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
        {
          id: "e2",
          title: "Cat's in the Bag...",
          episodeNumber: 2,
          seasonNumber: 1,
          duration: 48,
          description: "Walt and Jesse attempt to dispose of the two bodies in the RV, but both of them tried to resolve their problems by their own.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
        {
          id: "e3",
          title: "...And the Bag's in the River",
          episodeNumber: 3,
          seasonNumber: 1,
          duration: 48,
          description: "Walter must decide what to do with Krazy-8, while Jesse tries to sell the remaining meth to a local dealer.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
        {
          id: "e4",
          title: "Cancer Man",
          episodeNumber: 4,
          seasonNumber: 1,
          duration: 48,
          description: "Walter finally tells his family that he has cancer.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
      ],
    },
    {
      seasonNumber: 2,
      episodeCount: 13,
      episodes: [
        {
          id: "e5",
          title: "Seven Thirty-Seven",
          episodeNumber: 1,
          seasonNumber: 2,
          duration: 47,
          description: "Walt and Jesse face the deadly consequences of their actions.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
        {
          id: "e6",
          title: "Grilled",
          episodeNumber: 2,
          seasonNumber: 2,
          duration: 47,
          description: "Tuco's erratic behavior leads to a tense confrontation.",
          streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
          thumbnailUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
        },
      ],
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export default function WatchSeriesPage() {
  const router = useRouter();
  const params = useParams();
  const seriesId = params.id as string;
  const seasonNumber = parseInt(params.season as string);
  const episodeNumber = parseInt(params.episode as string);

  const [series, setSeries] = useState<Series>(mockSeries);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showEpisodeList, setShowEpisodeList] = useState(false);

  const { addToWatchHistory, setCurrentStream, watchHistory } = usePlayerStore();

  // Find current season and episode
  useEffect(() => {
    const season = series.seasons?.find((s) => s.seasonNumber === seasonNumber);
    const episode = season?.episodes?.find((e) => e.episodeNumber === episodeNumber);
    setCurrentSeason(season || null);
    setCurrentEpisode(episode || null);

    if (episode) {
      setCurrentStream(
        episode.streamUrl || series.streamUrl || "",
        `${series.name} - S${seasonNumber}E${episodeNumber}`,
        "series",
        episode.id
      );
    }
  }, [series, seasonNumber, episodeNumber, setCurrentStream]);

  // Get resume progress for current episode
  const resumeProgress = watchHistory.find(
    (h) => h.streamId === currentEpisode?.id && h.type === "series"
  )?.progress;

  const handleVideoProgress = (currentTime: number, duration: number) => {
    if (!currentEpisode) return;
    const progress = (currentTime / duration) * 100;
    addToWatchHistory({
      id: currentEpisode.id,
      streamId: currentEpisode.id,
      title: `${series.name} - S${seasonNumber}E${episodeNumber}: ${currentEpisode.title}`,
      type: "series",
      timestamp: Date.now(),
      progress,
      posterUrl: series.posterUrl,
    });
  };

  const handleEpisodeEnded = () => {
    if (!currentEpisode) return;

    // Mark current episode as completed
    addToWatchHistory({
      id: currentEpisode.id,
      streamId: currentEpisode.id,
      title: `${series.name} - S${seasonNumber}E${episodeNumber}: ${currentEpisode.title}`,
      type: "series",
      timestamp: Date.now(),
      progress: 100,
      posterUrl: series.posterUrl,
    });

    // Auto-play next episode
    playNextEpisode();
  };

  const playEpisode = (season: number, episode: number) => {
    router.push(`/portal/watch/series/${seriesId}/${season}/${episode}`);
  };

  const playPreviousEpisode = () => {
    if (!currentSeason) return;

    if (episodeNumber > 1) {
      // Previous episode in same season
      playEpisode(seasonNumber, episodeNumber - 1);
    } else if (seasonNumber > 1) {
      // Last episode of previous season
      const prevSeason = series.seasons?.find((s) => s.seasonNumber === seasonNumber - 1);
      if (prevSeason && prevSeason.episodes) {
        playEpisode(seasonNumber - 1, prevSeason.episodes.length);
      }
    }
  };

  const playNextEpisode = () => {
    if (!currentSeason) return;

    const totalEpisodes = currentSeason.episodes?.length || 0;

    if (episodeNumber < totalEpisodes) {
      // Next episode in same season
      playEpisode(seasonNumber, episodeNumber + 1);
    } else {
      // First episode of next season
      const nextSeason = series.seasons?.find((s) => s.seasonNumber === seasonNumber + 1);
      if (nextSeason) {
        playEpisode(seasonNumber + 1, 1);
      }
    }
  };

  const canPlayPrevious = () => {
    if (episodeNumber > 1) return true;
    if (seasonNumber > 1) return true;
    return false;
  };

  const canPlayNext = () => {
    if (!currentSeason) return false;
    const totalEpisodes = currentSeason.episodes?.length || 0;
    if (episodeNumber < totalEpisodes) return true;
    const nextSeason = series.seasons?.find((s) => s.seasonNumber === seasonNumber + 1);
    return !!nextSeason;
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (!currentEpisode) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <p className="text-white">Episode not found</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Video Player - Full Width */}
      <div className="relative aspect-video w-full max-h-[70vh] bg-black">
        <VideoPlayer
          src={currentEpisode.streamUrl || ""}
          title={`${series.name} - S${seasonNumber}E${episodeNumber}: ${currentEpisode.title}`}
          poster={series.backdropUrl}
          autoPlay
          startTime={resumeProgress ? (resumeProgress / 100) * (currentEpisode.duration || 0) * 60 : 0}
          onTimeUpdate={(currentTime, duration) => {
            handleVideoProgress(currentTime, duration);
          }}
          onEnded={handleEpisodeEnded}
        />

        {/* Top Overlay - Back Button */}
        <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
          <div className="flex items-center justify-between pointer-events-auto">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => router.back()}
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>

            <div className="text-center">
              <p className="text-white font-medium">{series.name}</p>
              <p className="text-sm text-gray-300">
                Season {seasonNumber}, Episode {episodeNumber}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setIsFavorite(!isFavorite)}
              >
                <Heart
                  className={`h-5 w-5 ${
                    isFavorite ? "fill-red-500 text-red-500" : ""
                  }`}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/20"
                onClick={() => setShowEpisodeList(!showEpisodeList)}
              >
                <List className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Episode Navigation */}
        <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-4 pointer-events-none">
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            onClick={playPreviousEpisode}
            disabled={!canPlayPrevious()}
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="pointer-events-auto"
            onClick={playNextEpisode}
            disabled={!canPlayNext()}
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Content Below Video */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-8">
          {/* Main Content */}
          <div className="flex-1">
            {/* Episode Info */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white">
                {currentEpisode.title}
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <Badge variant="outline">
                  S{seasonNumber} E{episodeNumber}
                </Badge>
                {currentEpisode.duration && (
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {formatDuration(currentEpisode.duration)}
                  </span>
                )}
              </div>

              {currentEpisode.description && (
                <p className="text-gray-400 mt-4">{currentEpisode.description}</p>
              )}
            </div>

            <Separator className="bg-gray-800" />

            {/* Series Info */}
            <div className="mt-6">
              <div className="flex gap-4">
                <div className="relative w-24 aspect-[2/3] rounded-lg overflow-hidden flex-shrink-0">
                  <Image
                    src={series.posterUrl || "/placeholder-poster.jpg"}
                    alt={series.name}
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-white">{series.name}</h2>
                  <div className="flex items-center gap-3 mt-1">
                    {series.rating && (
                      <span className="flex items-center text-yellow-500">
                        <Star className="h-4 w-4 fill-current mr-1" />
                        {series.rating.toFixed(1)}
                      </span>
                    )}
                    <span className="text-gray-400">{series.releaseYear}</span>
                    {series.seasons && (
                      <span className="text-gray-400">
                        {series.seasons.length} Seasons
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {series.genre?.split(", ").slice(0, 3).map((g) => (
                      <Badge key={g} variant="secondary" className="text-xs">
                        {g}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Episodes in Current Season */}
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-white mb-4">
                Season {seasonNumber} Episodes
              </h3>
              <div className="space-y-2">
                {currentSeason?.episodes?.map((episode) => (
                  <Card
                    key={episode.id}
                    className={`bg-gray-900 border-gray-800 cursor-pointer transition-all ${
                      episode.episodeNumber === episodeNumber
                        ? "ring-2 ring-primary"
                        : "hover:border-gray-700"
                    }`}
                    onClick={() => playEpisode(seasonNumber, episode.episodeNumber)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                          episode.episodeNumber === episodeNumber
                            ? "bg-primary text-primary-foreground"
                            : "bg-gray-800"
                        }`}
                      >
                        <span className="font-semibold">{episode.episodeNumber}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-white">{episode.title}</h4>
                        {episode.description && (
                          <p className="text-sm text-gray-400 line-clamp-1 mt-1">
                            {episode.description}
                          </p>
                        )}
                      </div>
                      {episode.duration && (
                        <span className="text-sm text-gray-500 flex-shrink-0">
                          {formatDuration(episode.duration)}
                        </span>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Episode List Sidebar */}
          {showEpisodeList && (
            <div className="w-80">
              <Card className="bg-gray-900 border-gray-800 sticky top-4">
                <CardContent className="p-4">
                  <h2 className="text-lg font-semibold text-white mb-4">
                    All Episodes
                  </h2>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {series.seasons?.map((season) => (
                        <div key={season.seasonNumber}>
                          <h4 className="text-sm font-medium text-gray-400 mb-2">
                            Season {season.seasonNumber}
                          </h4>
                          <div className="space-y-1">
                            {season.episodes?.map((episode) => (
                              <div
                                key={episode.id}
                                className={`p-2 rounded cursor-pointer transition-colors ${
                                  season.seasonNumber === seasonNumber &&
                                  episode.episodeNumber === episodeNumber
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-gray-800 text-white"
                                }`}
                                onClick={() =>
                                  playEpisode(season.seasonNumber, episode.episodeNumber)
                                }
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    E{episode.episodeNumber}
                                  </span>
                                  <span className="text-sm truncate">
                                    {episode.title}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
