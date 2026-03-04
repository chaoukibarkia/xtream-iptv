"use client";

import { useState, useRef } from "react";
import { Play, Heart, Info, Star, ChevronLeft, ChevronRight, Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface Movie {
  id: number;
  title: string;
  year: number;
  rating: number;
  posterUrl?: string;
  backdropUrl?: string;
  genre: string;
  duration: string;
  description?: string;
  viewerCount?: number;
}

const mockMovies: Movie[] = [
  {
    id: 1,
    title: "Oppenheimer",
    year: 2023,
    rating: 8.5,
    posterUrl: "https://image.tmdb.org/t/p/w342/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/original/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
    genre: "Drama",
    duration: "3h 0m",
    description: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb.",
    viewerCount: 142,
  },
  {
    id: 2,
    title: "Barbie",
    year: 2023,
    rating: 7.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg",
    genre: "Comedy",
    duration: "1h 54m",
    viewerCount: 89,
  },
  {
    id: 3,
    title: "Avatar: The Way of Water",
    year: 2022,
    rating: 7.8,
    posterUrl: "https://image.tmdb.org/t/p/w342/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg",
    genre: "Sci-Fi",
    duration: "3h 12m",
    viewerCount: 256,
  },
  {
    id: 4,
    title: "Top Gun: Maverick",
    year: 2022,
    rating: 8.4,
    posterUrl: "https://image.tmdb.org/t/p/w342/62HCnUTziyWcpDaBO2i1DX17ljH.jpg",
    genre: "Action",
    duration: "2h 10m",
    viewerCount: 73,
  },
  {
    id: 5,
    title: "Dune",
    year: 2021,
    rating: 8.0,
    posterUrl: "https://image.tmdb.org/t/p/w342/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
    genre: "Sci-Fi",
    duration: "2h 35m",
    viewerCount: 31,
  },
  {
    id: 6,
    title: "The Batman",
    year: 2022,
    rating: 7.8,
    posterUrl: "https://image.tmdb.org/t/p/w342/74xTEgt7R36Fpooo50r9T25onhq.jpg",
    genre: "Action",
    duration: "2h 56m",
    viewerCount: 0,
  },
  {
    id: 7,
    title: "Spider-Man: No Way Home",
    year: 2021,
    rating: 8.3,
    posterUrl: "https://image.tmdb.org/t/p/w342/1g0dhYtq4irTY1GPXvft6k4YLjm.jpg",
    genre: "Action",
    duration: "2h 28m",
    viewerCount: 12,
  },
  {
    id: 8,
    title: "The Godfather",
    year: 1972,
    rating: 9.2,
    posterUrl: "https://image.tmdb.org/t/p/w342/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    genre: "Crime",
    duration: "2h 55m",
    viewerCount: 5,
  },
];

function MovieCard({ movie }: { movie: Movie }) {
  return (
    <div className="group flex-shrink-0 w-[160px] md:w-[180px]">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-muted">
        {movie.posterUrl ? (
          <img
            src={movie.posterUrl}
            alt={movie.title}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground">
            No Image
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
          <div className="flex gap-2">
            <Button size="sm" className="flex-1">
              <Play className="h-4 w-4 mr-1 fill-current" />
              Play
            </Button>
            <Button size="sm" variant="secondary">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-2">
        <h3 className="font-medium truncate">{movie.title}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{movie.year}</span>
          <span>•</span>
          <span className="flex items-center">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 mr-1" />
            {movie.rating}
          </span>
          {movie.viewerCount !== undefined && movie.viewerCount > 0 && (
            <>
              <span>•</span>
              <span className="flex items-center">
                <Eye className="h-3 w-3 mr-1" />
                {movie.viewerCount}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MovieRow({ title, movies }: { title: string; movies: Movie[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <Button variant="ghost" size="sm" className="ml-auto">
          See All
        </Button>
      </div>

      <div className="relative group">
        {/* Left Arrow */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex"
          onClick={() => scroll("left")}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Movies */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} />
          ))}
        </div>

        {/* Right Arrow */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:flex"
          onClick={() => scroll("right")}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

export default function MoviesPage() {
  const featuredMovie = mockMovies[0];

  return (
    <div className="pb-24 md:pb-0">
      {/* Hero Banner */}
      <div className="relative min-h-[320px] md:min-h-[400px]">
        {/* Background */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: featuredMovie.backdropUrl
              ? `url(${featuredMovie.backdropUrl})`
              : undefined,
          }}
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-black/50" />

        {/* Content */}
        <div className="relative container h-full py-8 md:py-12">
          <div className="flex flex-col md:flex-row gap-6 md:gap-8">
            {/* Poster */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <div className="relative w-32 md:w-40 lg:w-48 aspect-[2/3] rounded-lg overflow-hidden shadow-2xl">
                {featuredMovie.posterUrl ? (
                  <img
                    src={featuredMovie.posterUrl}
                    alt={featuredMovie.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center">
                    No Image
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 flex flex-col justify-center text-center md:text-left">
              {/* Title Row */}
              <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white leading-tight">
                {featuredMovie.title}
              </h1>
              
              {/* Metadata Row: Year, Rating, Duration */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3 text-white/90">
                <span className="text-lg">{featuredMovie.year}</span>
                <span className="flex items-center gap-1 text-lg">
                  <Star className="h-5 w-5 fill-yellow-500 text-yellow-500" />
                  {featuredMovie.rating}
                </span>
                <span className="text-lg">{featuredMovie.duration}</span>
              </div>

              {/* Genre Badges */}
              <div className="flex flex-wrap justify-center md:justify-start gap-2 mt-4">
                {featuredMovie.genre.split(", ").map((g) => (
                  <Badge key={g} className="bg-white/20 hover:bg-white/30 text-white border-0 px-4 py-1">
                    {g}
                  </Badge>
                ))}
              </div>

              {/* Description */}
              {featuredMovie.description && (
                <p className="text-base md:text-lg text-white/80 mt-4 max-w-2xl mx-auto md:mx-0 line-clamp-3">
                  {featuredMovie.description}
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-6">
                <Button size="lg" className="gap-2 min-w-[140px]">
                  <Play className="h-5 w-5 fill-current" />
                  Play
                </Button>
                <Button size="lg" variant="secondary" className="gap-2 min-w-[140px]">
                  <Plus className="h-5 w-5" />
                  My List
                </Button>
                <Button size="lg" variant="outline" className="gap-2 min-w-[140px] border-white/30 text-white hover:bg-white/10">
                  <Info className="h-5 w-5" />
                  More Info
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Movie Rows */}
      <div className="container py-8 space-y-8 -mt-16 relative z-10">
        <MovieRow title="Continue Watching" movies={mockMovies.slice(0, 5)} />
        <MovieRow title="Trending Now" movies={mockMovies} />
        <MovieRow title="Action Movies" movies={mockMovies.filter((m) => m.genre === "Action")} />
        <MovieRow title="Top Rated" movies={[...mockMovies].sort((a, b) => b.rating - a.rating)} />
        <MovieRow title="New Releases" movies={mockMovies.filter((m) => m.year >= 2022)} />
      </div>
    </div>
  );
}
