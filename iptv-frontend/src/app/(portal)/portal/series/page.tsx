"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Grid,
  List,
  Star,
  Calendar,
  Play,
  ChevronDown,
  ChevronUp,
  Heart,
  Clock,
  Tv,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

// Mock data for series
const mockSeries: Series[] = [
  {
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
          { id: "e1", title: "Pilot", episodeNumber: 1, seasonNumber: 1, duration: 58, description: "Walter White, a chemistry teacher, discovers that he has cancer and decides to make money for his family by producing methamphetamine." },
          { id: "e2", title: "Cat's in the Bag...", episodeNumber: 2, seasonNumber: 1, duration: 48, description: "Walt and Jesse attempt to dispose of the two bodies in the RV." },
          { id: "e3", title: "...And the Bag's in the River", episodeNumber: 3, seasonNumber: 1, duration: 48, description: "Walt must decide what to do with Krazy-8." },
        ],
      },
      {
        seasonNumber: 2,
        episodeCount: 13,
        episodes: [
          { id: "e4", title: "Seven Thirty-Seven", episodeNumber: 1, seasonNumber: 2, duration: 47, description: "Walt and Jesse face the deadly consequences of their actions." },
          { id: "e5", title: "Grilled", episodeNumber: 2, seasonNumber: 2, duration: 47, description: "Tuco's erratic behavior leads to a confrontation." },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    name: "Game of Thrones",
    type: "series",
    categoryId: "fantasy",
    tmdbId: "1399",
    posterUrl: "https://image.tmdb.org/t/p/w500/u3bZgnGQ9T01sWNhyveQz0wH0Hl.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
    description: "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia.",
    rating: 9.3,
    releaseYear: 2011,
    genre: "Drama, Fantasy, Adventure",
    cast: "Emilia Clarke, Peter Dinklage, Kit Harington",
    director: "David Benioff, D.B. Weiss",
    isActive: true,
    seasons: [
      {
        seasonNumber: 1,
        episodeCount: 10,
        episodes: [
          { id: "e6", title: "Winter Is Coming", episodeNumber: 1, seasonNumber: 1, duration: 62, description: "Eddard Stark is torn between his family and an old friend when asked to serve at the side of King Robert Baratheon." },
        ],
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    name: "The Office",
    type: "series",
    categoryId: "comedy",
    tmdbId: "2316",
    posterUrl: "https://image.tmdb.org/t/p/w500/qWnJzyZhyy74gjpSjIXWmuk0ifX.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/vNpuAxGTl9HsUbHqam3E9CzqqLT.jpg",
    description: "A mockumentary on a group of typical office workers, where the workday consists of ego clashes, inappropriate behavior, and tedium.",
    rating: 8.9,
    releaseYear: 2005,
    genre: "Comedy",
    cast: "Steve Carell, Rainn Wilson, John Krasinski",
    director: "Greg Daniels",
    isActive: true,
    seasons: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "4",
    name: "Stranger Things",
    type: "series",
    categoryId: "scifi",
    tmdbId: "66732",
    posterUrl: "https://image.tmdb.org/t/p/w500/x2LSRK2Cm7MZhjluni1msVJ3wDF.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
    description: "When a young boy vanishes, a small town uncovers a mystery involving secret experiments, terrifying supernatural forces and one strange little girl.",
    rating: 8.7,
    releaseYear: 2016,
    genre: "Drama, Fantasy, Horror",
    cast: "Millie Bobby Brown, Finn Wolfhard, Winona Ryder",
    director: "The Duffer Brothers",
    isActive: true,
    seasons: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const genres = ["All", "Drama", "Comedy", "Action", "Fantasy", "Sci-Fi", "Horror", "Thriller"];

export default function SeriesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"name" | "rating" | "year">("name");
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const filteredSeries = mockSeries
    .filter((series) => {
      const matchesSearch = series.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGenre = selectedGenre === "All" || series.genre?.toLowerCase().includes(selectedGenre.toLowerCase());
      return matchesSearch && matchesGenre;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "rating":
          return (b.rating || 0) - (a.rating || 0);
        case "year":
          return (b.releaseYear || 0) - (a.releaseYear || 0);
        default:
          return 0;
      }
    });

  const toggleFavorite = (seriesId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(seriesId)) {
        next.delete(seriesId);
      } else {
        next.add(seriesId);
      }
      return next;
    });
  };

  const playEpisode = (seriesId: string, seasonNumber: number, episodeNumber: number) => {
    router.push(`/portal/watch/series/${seriesId}/${seasonNumber}/${episodeNumber}`);
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Tv className="h-6 w-6 text-primary" />
              <h1 className="text-2xl font-bold">TV Series</h1>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              {/* Search */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search series..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              {/* Genre Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-4 w-4" />
                    {selectedGenre}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {genres.map((genre) => (
                    <DropdownMenuItem
                      key={genre}
                      onClick={() => setSelectedGenre(genre)}
                    >
                      {genre}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* Sort */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    Sort: {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => setSortBy("name")}>Name</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("rating")}>Rating</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("year")}>Year</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {/* View Toggle */}
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
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Series Grid/List */}
          <div className={selectedSeries ? "w-full lg:w-1/2" : "w-full"}>
            {viewMode === "grid" ? (
              <div className={`grid gap-4 ${selectedSeries ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"}`}>
                {filteredSeries.map((series) => (
                  <Card
                    key={series.id}
                    className={`group cursor-pointer overflow-hidden transition-all hover:ring-2 hover:ring-primary ${
                      selectedSeries?.id === series.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedSeries(series)}
                  >
                    <div className="relative aspect-[2/3]">
                      <Image
                        src={series.posterUrl || "/placeholder-poster.jpg"}
                        alt={series.name}
                        fill
                        className="object-cover transition-transform md:group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity" />
                      <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-0 md:translate-y-full md:group-hover:translate-y-0 transition-transform">
                        <Button size="sm" className="w-full">
                          <Play className="mr-2 h-4 w-4" />
                          Watch
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity bg-black/50 hover:bg-black/70"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(series.id);
                        }}
                      >
                        <Heart
                          className={`h-4 w-4 ${
                            favorites.has(series.id) ? "fill-red-500 text-red-500" : ""
                          }`}
                        />
                      </Button>
                      {series.rating && (
                        <Badge className="absolute top-2 left-2 bg-yellow-500 text-black">
                          <Star className="mr-1 h-3 w-3" />
                          {series.rating.toFixed(1)}
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <h3 className="font-semibold truncate">{series.name}</h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {series.releaseYear}
                        {series.seasons && (
                          <>
                            <span>•</span>
                            <span>{series.seasons.length} Seasons</span>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSeries.map((series) => (
                  <Card
                    key={series.id}
                    className={`cursor-pointer transition-all hover:ring-2 hover:ring-primary ${
                      selectedSeries?.id === series.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => setSelectedSeries(series)}
                  >
                    <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
                      <div className="relative w-full sm:w-24 aspect-[2/3] flex-shrink-0">
                        <Image
                          src={series.posterUrl || "/placeholder-poster.jpg"}
                          alt={series.name}
                          fill
                          className="object-cover rounded"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-lg">{series.name}</h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              {series.releaseYear}
                              {series.rating && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center">
                                    <Star className="mr-1 h-3 w-3 text-yellow-500" />
                                    {series.rating.toFixed(1)}
                                  </span>
                                </>
                              )}
                              {series.seasons && (
                                <>
                                  <span>•</span>
                                  <span>{series.seasons.length} Seasons</span>
                                </>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(series.id);
                            }}
                          >
                            <Heart
                              className={`h-5 w-5 ${
                                favorites.has(series.id) ? "fill-red-500 text-red-500" : ""
                              }`}
                            />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                          {series.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3">
                          {series.genre?.split(", ").slice(0, 3).map((g) => (
                            <Badge key={g} variant="secondary">
                              {g}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Series Detail Panel */}
          {selectedSeries && (
            <div className="w-full lg:w-1/2 lg:sticky lg:top-24 h-fit space-y-4">
              <Card className="overflow-hidden">
                {/* Header with Backdrop */}
                <div className="relative">
                  {/* Backdrop Background */}
                  <div className="absolute inset-0">
                    <Image
                      src={selectedSeries.backdropUrl || selectedSeries.posterUrl || "/placeholder-backdrop.jpg"}
                      alt={selectedSeries.name}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-black/70" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/50" />
                  </div>

                  {/* Close Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/70 text-white"
                    onClick={() => setSelectedSeries(null)}
                  >
                    ×
                  </Button>

                  {/* Content */}
                  <div className="relative p-6 flex flex-col sm:flex-row gap-5">
                    {/* Poster */}
                    <div className="relative w-28 sm:w-32 aspect-[2/3] flex-shrink-0 rounded-lg overflow-hidden shadow-2xl mx-auto sm:mx-0">
                      <Image
                        src={selectedSeries.posterUrl || "/placeholder-poster.jpg"}
                        alt={selectedSeries.name}
                        fill
                        className="object-cover"
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-center text-center sm:text-left">
                      {/* Title */}
                      <h2 className="text-2xl font-bold text-white">{selectedSeries.name}</h2>
                      
                      {/* Metadata Row: Year, Rating, Seasons */}
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2 text-white/90">
                        <span>{selectedSeries.releaseYear}</span>
                        {selectedSeries.rating && (
                          <span className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            {selectedSeries.rating.toFixed(1)}
                          </span>
                        )}
                        {selectedSeries.seasons && selectedSeries.seasons.length > 0 && (
                          <span>{selectedSeries.seasons.length} Seasons</span>
                        )}
                      </div>

                      {/* Genre Badges */}
                      <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                        {selectedSeries.genre?.split(", ").map((g) => (
                          <Badge key={g} className="bg-white/20 hover:bg-white/30 text-white border-0 px-3 py-1">
                            {g}
                          </Badge>
                        ))}
                      </div>

                      {/* Description */}
                      <p className="text-sm text-white/80 mt-3 line-clamp-3">
                        {selectedSeries.description}
                      </p>
                    </div>
                  </div>
                </div>

                <CardContent className="p-6 pt-4">

                  {selectedSeries.cast && (
                    <div>
                      <h4 className="text-sm font-semibold">Cast</h4>
                      <p className="text-sm text-muted-foreground">{selectedSeries.cast}</p>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-2 mt-4">
                    <Button className="w-full sm:flex-1" onClick={() => playEpisode(selectedSeries.id, 1, 1)}>
                      <Play className="mr-2 h-4 w-4" />
                      Play S1 E1
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => toggleFavorite(selectedSeries.id)}
                    >
                      <Heart
                        className={`h-5 w-5 ${
                          favorites.has(selectedSeries.id) ? "fill-red-500 text-red-500" : ""
                        }`}
                      />
                    </Button>
                  </div>

                  {/* Seasons & Episodes */}
                  {selectedSeries.seasons && selectedSeries.seasons.length > 0 && (
                    <div className="mt-6">
                      <Tabs defaultValue={`season-${selectedSeries.seasons[0]?.seasonNumber}`}>
                        <TabsList className="w-full justify-start overflow-x-auto">
                          {selectedSeries.seasons.map((season) => (
                            <TabsTrigger
                              key={season.seasonNumber}
                              value={`season-${season.seasonNumber}`}
                            >
                              Season {season.seasonNumber}
                            </TabsTrigger>
                          ))}
                        </TabsList>
                        
                        {selectedSeries.seasons.map((season) => (
                          <TabsContent
                            key={season.seasonNumber}
                            value={`season-${season.seasonNumber}`}
                            className="mt-4"
                          >
                            <ScrollArea className="h-64">
                              <div className="space-y-2">
                                {season.episodes?.map((episode) => (
                                  <Card
                                    key={episode.id}
                                    className="cursor-pointer hover:bg-accent transition-colors"
                                    onClick={() =>
                                      playEpisode(selectedSeries.id, season.seasonNumber, episode.episodeNumber)
                                    }
                                  >
                                    <CardContent className="p-3 flex items-start gap-3">
                                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <span className="text-sm font-semibold">
                                          {episode.episodeNumber}
                                        </span>
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <h4 className="font-medium">{episode.title}</h4>
                                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                          {episode.description}
                                        </p>
                                        {episode.duration && (
                                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                                            <Clock className="h-3 w-3" />
                                            {formatDuration(episode.duration)}
                                          </div>
                                        )}
                                      </div>
                                      <Button variant="ghost" size="icon" className="flex-shrink-0">
                                        <Play className="h-4 w-4" />
                                      </Button>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </ScrollArea>
                          </TabsContent>
                        ))}
                      </Tabs>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {filteredSeries.length === 0 && (
          <div className="text-center py-12">
            <Tv className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No series found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search or filter criteria
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
