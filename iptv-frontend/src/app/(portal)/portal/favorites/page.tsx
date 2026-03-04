"use client";

import React, { useState, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Heart,
  Play,
  Trash2,
  Film,
  Tv,
  Radio,
  Clock,
  Star,
  Filter,
  Search,
  Grid,
  List,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePlayerStore, WatchHistoryItem } from "@/stores/playerStore";

// Extended mock data for favorites
interface FavoriteItem {
  id: string;
  title: string;
  type: "live" | "vod" | "series";
  posterUrl?: string;
  rating?: number;
  year?: number;
  genre?: string;
  addedAt: number;
}

const mockFavorites: FavoriteItem[] = [
  {
    id: "1",
    title: "CNN",
    type: "live",
    posterUrl: "https://example.com/cnn.png",
    addedAt: Date.now() - 24 * 60 * 60 * 1000,
  },
  {
    id: "2",
    title: "Interstellar",
    type: "vod",
    posterUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    rating: 8.6,
    year: 2014,
    genre: "Sci-Fi",
    addedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
  },
  {
    id: "3",
    title: "Breaking Bad",
    type: "series",
    posterUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
    rating: 9.5,
    year: 2008,
    genre: "Drama",
    addedAt: Date.now() - 3 * 24 * 60 * 60 * 1000,
  },
  {
    id: "4",
    title: "ESPN",
    type: "live",
    posterUrl: "https://example.com/espn.png",
    addedAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
  },
  {
    id: "5",
    title: "The Dark Knight",
    type: "vod",
    posterUrl: "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    rating: 9.0,
    year: 2008,
    genre: "Action",
    addedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
  },
];

// Mock watch history with more data
const mockWatchHistory: WatchHistoryItem[] = [
  {
    id: "wh1",
    streamId: "1",
    title: "Breaking Bad - S1E3: ...And the Bag's in the River",
    type: "series",
    timestamp: Date.now() - 1 * 60 * 60 * 1000,
    progress: 75,
    posterUrl: "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
  },
  {
    id: "wh2",
    streamId: "2",
    title: "Interstellar",
    type: "vod",
    timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
    progress: 45,
    posterUrl: "https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
  },
  {
    id: "wh3",
    streamId: "3",
    title: "CNN",
    type: "live",
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000,
    progress: 0,
  },
  {
    id: "wh4",
    streamId: "4",
    title: "Game of Thrones - S1E1: Winter Is Coming",
    type: "series",
    timestamp: Date.now() - 5 * 24 * 60 * 60 * 1000,
    progress: 100,
    posterUrl: "https://image.tmdb.org/t/p/w500/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg",
  },
];

export default function FavoritesPage() {
  const router = useRouter();
  const { watchHistory, clearWatchHistory } = usePlayerStore();
  
  // Use mock data combined with store data
  const combinedHistory = useMemo(() => {
    const storeHistory = watchHistory.length > 0 ? watchHistory : [];
    const combined = [...storeHistory, ...mockWatchHistory];
    // Remove duplicates based on streamId
    const unique = combined.filter(
      (item, index, self) =>
        index === self.findIndex((t) => t.streamId === item.streamId)
    );
    return unique.sort((a, b) => b.timestamp - a.timestamp);
  }, [watchHistory]);

  const [favorites, setFavorites] = useState<FavoriteItem[]>(mockFavorites);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "live" | "vod" | "series">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const filteredFavorites = useMemo(() => {
    return favorites.filter((item) => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "all" || item.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [favorites, searchQuery, filterType]);

  const filteredHistory = useMemo(() => {
    return combinedHistory.filter((item) => {
      const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType = filterType === "all" || item.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [combinedHistory, searchQuery, filterType]);

  const continueWatching = useMemo(() => {
    return combinedHistory.filter((item) => item.progress > 0 && item.progress < 95);
  }, [combinedHistory]);

  const removeFavorite = (id: string) => {
    setFavorites((prev) => prev.filter((item) => item.id !== id));
  };

  const playItem = (item: FavoriteItem | WatchHistoryItem) => {
    const type = item.type;
    const id = "streamId" in item ? item.streamId : item.id;
    
    switch (type) {
      case "live":
        router.push(`/portal/watch/live/${id}`);
        break;
      case "vod":
        router.push(`/portal/watch/vod/${id}`);
        break;
      case "series":
        router.push(`/portal/watch/series/${id}/1/1`);
        break;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "live":
        return <Radio className="h-4 w-4" />;
      case "vod":
        return <Film className="h-4 w-4" />;
      case "series":
        return <Tv className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "live":
        return "bg-red-500";
      case "vod":
        return "bg-blue-500";
      case "series":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My Library</h1>
            <p className="text-muted-foreground mt-1">
              Your favorites and watch history
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  {filterType === "all" ? "All Types" : filterType.toUpperCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => setFilterType("all")}>
                  All Types
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("live")}>
                  <Radio className="mr-2 h-4 w-4" /> Live TV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("vod")}>
                  <Film className="mr-2 h-4 w-4" /> Movies
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setFilterType("series")}>
                  <Tv className="mr-2 h-4 w-4" /> Series
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Continue Watching Section */}
        {continueWatching.length > 0 && filterType === "all" && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Continue Watching
            </h2>
            <ScrollArea className="w-full">
              <div className="flex gap-4 pb-4">
                {continueWatching.map((item) => (
                  <Card
                    key={item.id}
                    className="flex-shrink-0 w-[220px] sm:w-64 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                    onClick={() => playItem(item)}
                  >
                    <div className="relative aspect-video">
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt={item.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          {getTypeIcon(item.type)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                      <Button
                        size="icon"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="h-6 w-6" />
                      </Button>
                      <Badge
                        className={`absolute top-2 left-2 ${getTypeColor(item.type)}`}
                      >
                        {item.type}
                      </Badge>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-medium truncate text-sm">{item.title}</h3>
                      <div className="mt-2">
                        <Progress value={item.progress} className="h-1" />
                        <p className="text-xs text-muted-foreground mt-1">
                          {Math.round(item.progress)}% watched
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Main Tabs */}
        <Tabs defaultValue="favorites" className="space-y-6">
          <TabsList>
            <TabsTrigger value="favorites" className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              Favorites ({filteredFavorites.length})
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              History ({filteredHistory.length})
            </TabsTrigger>
          </TabsList>

          {/* Favorites Tab */}
          <TabsContent value="favorites">
            {filteredFavorites.length === 0 ? (
              <div className="text-center py-12">
                <Heart className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No favorites yet</h3>
                <p className="text-muted-foreground">
                  Start adding your favorite content to see them here
                </p>
                <Button className="mt-4" onClick={() => router.push("/portal/live")}>
                  Browse Content
                </Button>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {filteredFavorites.map((item) => (
                  <Card
                    key={item.id}
                    className="group overflow-hidden cursor-pointer transition-all hover:ring-2 hover:ring-primary"
                  >
                    <div className="relative aspect-[2/3]" onClick={() => playItem(item)}>
                      {item.posterUrl ? (
                        <Image
                          src={item.posterUrl}
                          alt={item.title}
                          fill
                          className="object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center">
                          {getTypeIcon(item.type)}
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Button
                        size="icon"
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="h-6 w-6" />
                      </Button>
                      <Badge
                        className={`absolute top-2 left-2 ${getTypeColor(item.type)}`}
                      >
                        {item.type}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-red-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFavorite(item.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-semibold truncate">{item.title}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                        {item.year && <span>{item.year}</span>}
                        {item.rating && (
                          <>
                            <span>•</span>
                            <span className="flex items-center">
                              <Star className="h-3 w-3 text-yellow-500 mr-1" />
                              {item.rating.toFixed(1)}
                            </span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFavorites.map((item) => (
                  <Card
                    key={item.id}
                    className="cursor-pointer hover:bg-accent transition-colors"
                    onClick={() => playItem(item)}
                  >
                    <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                      <div className="relative w-full sm:w-16 aspect-[2/3] rounded overflow-hidden flex-shrink-0">
                        {item.posterUrl ? (
                          <Image
                            src={item.posterUrl}
                            alt={item.title}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            {getTypeIcon(item.type)}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={getTypeColor(item.type)} variant="secondary">
                            {item.type}
                          </Badge>
                          <h3 className="font-semibold truncate">{item.title}</h3>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                          {item.year && <span>{item.year}</span>}
                          {item.rating && (
                            <span className="flex items-center">
                              <Star className="h-3 w-3 text-yellow-500 mr-1" />
                              {item.rating.toFixed(1)}
                            </span>
                          )}
                          {item.genre && <span>{item.genre}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button size="icon" variant="ghost">
                          <Play className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFavorite(item.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">No watch history</h3>
                <p className="text-muted-foreground">
                  Your viewing history will appear here
                </p>
              </div>
            ) : (
              <>
                <div className="flex justify-end mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive"
                    onClick={clearWatchHistory}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Clear History
                  </Button>
                </div>
                <div className="space-y-2">
                  {filteredHistory.map((item) => (
                    <Card
                      key={item.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => playItem(item)}
                    >
                      <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                        <div className="relative w-full sm:w-20 aspect-video rounded overflow-hidden flex-shrink-0">
                          {item.posterUrl ? (
                            <Image
                              src={item.posterUrl}
                              alt={item.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full bg-muted flex items-center justify-center">
                              {getTypeIcon(item.type)}
                            </div>
                          )}
                          {item.progress > 0 && item.progress < 100 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
                              <div
                                className="h-full bg-primary"
                                style={{ width: `${item.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={getTypeColor(item.type)} variant="secondary">
                              {item.type}
                            </Badge>
                            <h3 className="font-medium truncate">{item.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground mt-1">
                            <span>{formatTimeAgo(item.timestamp)}</span>
                            {item.progress > 0 && item.progress < 100 && (
                              <span>{Math.round(item.progress)}% watched</span>
                            )}
                            {item.progress >= 100 && (
                              <Badge variant="outline" className="text-xs">
                                Completed
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button size="icon" variant="ghost">
                          <Play className="h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
