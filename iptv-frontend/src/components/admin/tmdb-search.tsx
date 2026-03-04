"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Search,
  Star,
  Calendar,
  Film,
  Tv,
  Check,
  X,
  Loader2,
  ExternalLink,
  Globe,
} from "lucide-react";
import {
  useTmdbSearchMovies,
  useTmdbSearchTv,
  useTmdbMovieDetails,
  useTmdbTvDetails,
  getTmdbImageUrl,
  type TmdbSearchResult,
  type TmdbMovieDetails,
  type TmdbTvDetails,
} from "@/lib/api/hooks/useTmdb";
import { useTmdbLanguage } from "@/lib/api/hooks/useSettings";
import { cn } from "@/lib/utils";

// Language options for TMDB
const TMDB_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es-ES", name: "Spanish (Spain)" },
  { code: "es-MX", name: "Spanish (Mexico)" },
  { code: "fr-FR", name: "French" },
  { code: "de-DE", name: "German" },
  { code: "it-IT", name: "Italian" },
  { code: "pt-BR", name: "Portuguese (Brazil)" },
  { code: "pt-PT", name: "Portuguese (Portugal)" },
  { code: "nl-NL", name: "Dutch" },
  { code: "pl-PL", name: "Polish" },
  { code: "ru-RU", name: "Russian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "zh-TW", name: "Chinese (Traditional)" },
  { code: "ar-SA", name: "Arabic" },
  { code: "tr-TR", name: "Turkish" },
  { code: "hi-IN", name: "Hindi" },
];

export interface TmdbMovieData {
  tmdbId: number;
  title: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  releaseDate: string;
  year: number;
  rating: number;
  runtime: number;
  genres: string;
  cast: string;
  director: string;
  youtubeTrailer: string | null;
}

export interface TmdbSeriesData {
  tmdbId: number;
  name: string;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  firstAirDate: string;
  year: number;
  rating: number;
  status: string;
  genres: string;
  cast: string;
  numberOfSeasons: number;
  numberOfEpisodes: number;
}

interface TmdbSearchProps {
  type: "movie" | "tv";
  initialQuery?: string;
  onSelect: (data: TmdbMovieData | TmdbSeriesData) => void;
  selectedTmdbId?: number | null;
  placeholder?: string;
  showLanguageSelector?: boolean;
}

export function TmdbSearch({
  type,
  initialQuery = "",
  onSelect,
  selectedTmdbId,
  placeholder,
  showLanguageSelector = true,
}: TmdbSearchProps) {
  const defaultLanguage = useTmdbLanguage();
  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(selectedTmdbId || null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [language, setLanguage] = useState<string>(defaultLanguage);
  // Track which TMDB ID we've already processed to prevent infinite loops
  const processedTmdbIdRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Update language when default language loads
  useEffect(() => {
    if (defaultLanguage && language === "en-US") {
      setLanguage(defaultLanguage);
    }
  }, [defaultLanguage]);

  // Store onSelect in a ref to avoid dependency issues in useEffect
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Debounce the search query
  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.length >= 2) {
        setDebouncedQuery(query);
        setShowResults(true);
      } else {
        setDebouncedQuery("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  // Update query when initialQuery changes (for edit mode)
  useEffect(() => {
    if (initialQuery && initialQuery !== query) {
      setQuery(initialQuery);
    }
  }, [initialQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search queries
  const movieSearch = useTmdbSearchMovies(type === "movie" ? debouncedQuery : "", undefined, language);
  const tvSearch = useTmdbSearchTv(type === "tv" ? debouncedQuery : "", undefined, language);
  const searchResults = type === "movie" ? movieSearch : tvSearch;

  // Details queries - only fetch when selected
  const movieDetails = useTmdbMovieDetails(type === "movie" && selectedId ? selectedId : 0, language);
  const tvDetails = useTmdbTvDetails(type === "tv" && selectedId ? selectedId : 0, language);

  // Process movie details when fetched
  useEffect(() => {
    if (type === "movie" && movieDetails.data && selectedId && processedTmdbIdRef.current !== selectedId) {
      const details = movieDetails.data;
      const director = details.credits?.crew?.find(c => c.job === "Director")?.name || "";
      const cast = details.credits?.cast?.slice(0, 5).map(c => c.name).join(", ") || "";
      const trailer = details.videos?.results?.find(v => v.site === "YouTube" && v.type === "Trailer");
      
      const data: TmdbMovieData = {
        tmdbId: details.id,
        title: details.title,
        overview: details.overview,
        posterUrl: getTmdbImageUrl(details.poster_path, "w500"),
        backdropUrl: getTmdbImageUrl(details.backdrop_path, "w780"),
        releaseDate: details.release_date,
        year: details.release_date ? new Date(details.release_date).getFullYear() : new Date().getFullYear(),
        rating: details.vote_average,
        runtime: details.runtime,
        genres: details.genres?.map(g => g.name).join(", ") || "",
        cast,
        director,
        youtubeTrailer: trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null,
      };
      
      processedTmdbIdRef.current = selectedId;
      onSelectRef.current(data);
      setLoadingDetails(false);
    }
  }, [movieDetails.data, selectedId, type]);

  // Process TV details when fetched
  useEffect(() => {
    if (type === "tv" && tvDetails.data && selectedId && processedTmdbIdRef.current !== selectedId) {
      const details = tvDetails.data;
      const cast = details.credits?.cast?.slice(0, 5).map(c => c.name).join(", ") || "";
      
      const data: TmdbSeriesData = {
        tmdbId: details.id,
        name: details.name,
        overview: details.overview,
        posterUrl: getTmdbImageUrl(details.poster_path, "w500"),
        backdropUrl: getTmdbImageUrl(details.backdrop_path, "w780"),
        firstAirDate: details.first_air_date,
        year: details.first_air_date ? new Date(details.first_air_date).getFullYear() : new Date().getFullYear(),
        rating: details.vote_average,
        status: details.status,
        genres: details.genres?.map(g => g.name).join(", ") || "",
        cast,
        numberOfSeasons: details.number_of_seasons,
        numberOfEpisodes: details.number_of_episodes,
      };
      
      processedTmdbIdRef.current = selectedId;
      onSelectRef.current(data);
      setLoadingDetails(false);
    }
  }, [tvDetails.data, selectedId, type]);

  const handleSelect = (result: TmdbSearchResult) => {
    // Reset the processed ref when a new selection is made
    processedTmdbIdRef.current = null;
    setSelectedId(result.id);
    setQuery(type === "movie" ? result.title || "" : result.name || "");
    setShowResults(false);
    setLoadingDetails(true);
  };

  const handleClear = () => {
    processedTmdbIdRef.current = null;
    setSelectedId(null);
    setQuery("");
    setDebouncedQuery("");
    setShowResults(false);
  };

  const isLoading = searchResults.isLoading || loadingDetails;
  const results = searchResults.data?.results || [];

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center justify-between mb-2">
        <Label className="flex items-center gap-2">
          {type === "movie" ? <Film className="h-4 w-4" /> : <Tv className="h-4 w-4" />}
          {type === "movie" ? "Search TMDB Movie" : "Search TMDB TV Series"}
        </Label>
        
        {showLanguageSelector && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Globe className="h-3.5 w-3.5" />
                {TMDB_LANGUAGES.find(l => l.code === language)?.name || language}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
              {TMDB_LANGUAGES.map((lang) => (
                <DropdownMenuItem 
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code);
                    // Reset selection when language changes to refetch with new language
                    if (selectedId) {
                      processedTmdbIdRef.current = null;
                      setLoadingDetails(true);
                    }
                  }}
                  className={cn(language === lang.code && "bg-accent")}
                >
                  {lang.name}
                  {language === lang.code && <Check className="h-4 w-4 ml-auto" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedId) setSelectedId(null);
          }}
          onFocus={() => debouncedQuery && setShowResults(true)}
          placeholder={placeholder || `Type ${type === "movie" ? "movie" : "series"} name to search TMDB...`}
          className={cn(
            "pl-9 pr-20",
            selectedId && "border-green-500 bg-green-500/5"
          )}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          {selectedId && !isLoading && (
            <>
              <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs">
                <Check className="h-3 w-3 mr-1" />
                TMDB
              </Badge>
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-muted rounded"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* TMDB Link */}
      {selectedId && (
        <a
          href={`https://www.themoviedb.org/${type}/${selectedId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          View on TMDB
        </a>
      )}

      {/* Search Results Dropdown */}
      {showResults && debouncedQuery && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
          <ScrollArea className="max-h-80">
            {searchResults.isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="w-12 h-18 rounded" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : results.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No results found for &quot;{debouncedQuery}&quot;</p>
                <p className="text-xs mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="divide-y">
                {results.slice(0, 10).map((result) => {
                  const title = type === "movie" ? result.title : result.name;
                  const date = type === "movie" ? result.release_date : result.first_air_date;
                  const year = date ? new Date(date).getFullYear() : null;
                  const posterUrl = getTmdbImageUrl(result.poster_path, "w92");

                  return (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleSelect(result)}
                      className={cn(
                        "w-full flex gap-3 p-3 text-left hover:bg-muted/50 transition-colors",
                        selectedId === result.id && "bg-primary/5"
                      )}
                    >
                      {/* Poster */}
                      <div className="w-12 h-18 bg-muted rounded overflow-hidden flex-shrink-0">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={title || "Poster"}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {type === "movie" ? (
                              <Film className="h-5 w-5 text-muted-foreground" />
                            ) : (
                              <Tv className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{title}</div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {year && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {year}
                            </span>
                          )}
                          {result.vote_average > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                              {result.vote_average.toFixed(1)}
                            </span>
                          )}
                        </div>
                        {result.overview && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {result.overview}
                          </p>
                        )}
                      </div>

                      {/* Selected indicator */}
                      {selectedId === result.id && (
                        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}

// Preview component to show selected TMDB data
interface TmdbPreviewProps {
  type: "movie" | "tv";
  posterUrl?: string | null;
  backdropUrl?: string | null;
  title?: string;
  year?: number;
  rating?: number;
  genres?: string;
  overview?: string;
  runtime?: number;
  status?: string;
}

export function TmdbPreview({
  type,
  posterUrl,
  backdropUrl,
  title,
  year,
  rating,
  genres,
  overview,
  runtime,
  status,
}: TmdbPreviewProps) {
  if (!posterUrl && !title) return null;

  return (
    <div className="rounded-lg border bg-muted/30 overflow-hidden">
      {/* Backdrop */}
      {backdropUrl && (
        <div className="relative h-32 w-full">
          <img
            src={backdropUrl}
            alt="Backdrop"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
        </div>
      )}

      <div className="p-4 flex gap-4">
        {/* Poster */}
        {posterUrl && (
          <div className="w-24 h-36 rounded overflow-hidden flex-shrink-0 -mt-16 relative z-10 shadow-lg border-2 border-background">
            <img
              src={posterUrl}
              alt={title || "Poster"}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <h4 className="font-semibold truncate">{title}</h4>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {year && <span>{year}</span>}
              {rating && rating > 0 && (
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  {rating.toFixed(1)}
                </span>
              )}
              {runtime && runtime > 0 && (
                <span>{Math.floor(runtime / 60)}h {runtime % 60}m</span>
              )}
              {status && <Badge variant="outline" className="text-xs">{status}</Badge>}
            </div>
          </div>

          {genres && (
            <div className="flex flex-wrap gap-1">
              {genres.split(", ").map((genre) => (
                <Badge key={genre} variant="secondary" className="text-xs">
                  {genre}
                </Badge>
              ))}
            </div>
          )}

          {overview && (
            <p className="text-xs text-muted-foreground line-clamp-3">
              {overview}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

