# TMDB Integration for VOD & Series

Here's a comprehensive TMDB integration module for fetching and syncing movie and series metadata:

---

```markdown
# TMDB (The Movie Database) INTEGRATION

## Overview

Integrate with TMDB API to automatically fetch and sync:
- Movie metadata (title, plot, cast, crew, ratings, posters)
- TV Series metadata (seasons, episodes, air dates)
- Backdrop images and posters
- Trailers (YouTube links)
- Genres, production companies, and more

---

## CONFIGURATION

### Environment Variables

```env
# .env
TMDB_API_KEY=your_tmdb_api_key_here
TMDB_API_BASE_URL=https://api.themoviedb.org/3
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p
TMDB_LANGUAGE=en-US
TMDB_INCLUDE_ADULT=false
TMDB_RATE_LIMIT_MS=250  # 4 requests per second (TMDB limit ~40/10s)
```

### Config Module

```typescript
// src/config/tmdb.ts
export const tmdbConfig = {
  apiKey: process.env.TMDB_API_KEY!,
  baseUrl: process.env.TMDB_API_BASE_URL || 'https://api.themoviedb.org/3',
  imageBaseUrl: process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p',
  language: process.env.TMDB_LANGUAGE || 'en-US',
  includeAdult: process.env.TMDB_INCLUDE_ADULT === 'true',
  rateLimitMs: parseInt(process.env.TMDB_RATE_LIMIT_MS || '250'),
  
  // Image size presets
  imageSizes: {
    poster: {
      small: 'w185',
      medium: 'w342',
      large: 'w500',
      original: 'original',
    },
    backdrop: {
      small: 'w300',
      medium: 'w780',
      large: 'w1280',
      original: 'original',
    },
    profile: {
      small: 'w45',
      medium: 'w185',
      large: 'h632',
      original: 'original',
    },
  },
};
```

---

## DATABASE SCHEMA UPDATES

```prisma
// prisma/schema.prisma - Extended for TMDB integration

model Stream {
  id                Int       @id @default(autoincrement())
  name              String
  streamType        StreamType
  categoryId        Int
  category          Category  @relation(fields: [categoryId], references: [id])
  
  // Source configuration
  sourceUrl         String
  backupUrls        String[]
  
  // TMDB Integration
  tmdbId            Int?      // TMDB movie ID
  tmdbType          String?   // 'movie' or 'tv'
  imdbId            String?   // IMDb ID (tt1234567)
  
  // Metadata (populated from TMDB)
  originalTitle     String?
  overview          String?   @db.Text
  tagline           String?
  releaseDate       DateTime?
  runtime           Int?      // minutes
  
  // Ratings
  voteAverage       Float?    // TMDB rating (0-10)
  voteCount         Int?
  popularity        Float?
  
  // Classification
  adult             Boolean   @default(false)
  status            String?   // Released, Upcoming, etc.
  originalLanguage  String?
  
  // Media
  posterPath        String?
  backdropPath      String?
  trailerUrl        String?   // YouTube URL
  
  // Additional metadata stored as JSON
  genres            Json?     // [{id, name}]
  productionCompanies Json?   // [{id, name, logo_path}]
  productionCountries Json?   // [{iso_3166_1, name}]
  spokenLanguages   Json?     // [{iso_639_1, name}]
  credits           Json?     // {cast: [], crew: []}
  keywords          Json?     // [{id, name}]
  
  // Container info (for file-based VOD)
  containerExtension String?  @default("mp4")
  videoCodec        String?
  audioCodec        String?
  bitrate           Int?
  resolution        String?
  
  // Sync tracking
  tmdbLastSync      DateTime?
  tmdbSyncStatus    SyncStatus @default(PENDING)
  
  // Relations
  bouquets          BouquetStream[]
  epgData           EpgEntry[]
  serverAssignments ServerStream[]
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  @@index([tmdbId, tmdbType])
  @@index([imdbId])
  @@index([streamType, categoryId])
}

model Series {
  id                  Int       @id @default(autoincrement())
  name                String
  categoryId          Int
  
  // TMDB Integration
  tmdbId              Int?      @unique
  imdbId              String?
  
  // Metadata
  originalName        String?
  overview            String?   @db.Text
  tagline             String?
  firstAirDate        DateTime?
  lastAirDate         DateTime?
  status              String?   // Returning Series, Ended, Canceled
  type                String?   // Scripted, Documentary, etc.
  originalLanguage    String?
  
  // Ratings
  voteAverage         Float?
  voteCount           Int?
  popularity          Float?
  
  // Episode info
  numberOfSeasons     Int?
  numberOfEpisodes    Int?
  episodeRunTime      Int[]     // Typical episode lengths
  
  // Media
  posterPath          String?
  backdropPath        String?
  trailerUrl          String?
  
  // Additional metadata
  genres              Json?
  networks            Json?     // [{id, name, logo_path}]
  productionCompanies Json?
  createdBy           Json?     // [{id, name, profile_path}]
  credits             Json?
  keywords            Json?
  
  // Content ratings by country
  contentRatings      Json?     // [{iso_3166_1, rating}]
  
  // Sync tracking
  tmdbLastSync        DateTime?
  tmdbSyncStatus      SyncStatus @default(PENDING)
  
  // Relations
  seasons             Season[]
  
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  @@index([tmdbId])
  @@index([categoryId])
}

model Season {
  id              Int       @id @default(autoincrement())
  seriesId        Int
  series          Series    @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  
  // TMDB data
  tmdbId          Int?
  seasonNumber    Int
  name            String?
  overview        String?   @db.Text
  posterPath      String?
  airDate         DateTime?
  episodeCount    Int?
  
  // Sync tracking
  tmdbLastSync    DateTime?
  
  // Relations
  episodes        Episode[]
  
  @@unique([seriesId, seasonNumber])
  @@index([seriesId])
}

model Episode {
  id              Int       @id @default(autoincrement())
  seasonId        Int
  season          Season    @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  
  // TMDB data
  tmdbId          Int?
  episodeNumber   Int
  name            String?
  overview        String?   @db.Text
  stillPath       String?   // Episode screenshot
  airDate         DateTime?
  runtime         Int?
  voteAverage     Float?
  voteCount       Int?
  
  // Crew/Guest stars
  crew            Json?
  guestStars      Json?
  
  // Stream source
  sourceUrl       String?
  backupUrls      String[]
  containerExtension String? @default("mp4")
  
  // Sync tracking
  tmdbLastSync    DateTime?
  
  @@unique([seasonId, episodeNumber])
  @@index([seasonId])
}

model TmdbGenre {
  id        Int       @id  // TMDB genre ID
  name      String
  type      String    // 'movie' or 'tv'
  
  @@unique([id, type])
}

model TmdbSyncLog {
  id          Int       @id @default(autoincrement())
  entityType  String    // 'movie', 'series', 'season', 'episode'
  entityId    Int
  tmdbId      Int?
  action      String    // 'search', 'fetch', 'update'
  status      String    // 'success', 'failed', 'not_found'
  message     String?
  duration    Int?      // ms
  createdAt   DateTime  @default(now())
  
  @@index([entityType, entityId])
  @@index([createdAt])
}

enum SyncStatus {
  PENDING
  SYNCED
  FAILED
  NOT_FOUND
  MANUAL
}
```

---

## TMDB API SERVICE

### Core API Client

```typescript
// src/services/tmdb/TmdbClient.ts
import axios, { AxiosInstance, AxiosError } from 'axios';
import { tmdbConfig } from '../../config/tmdb';
import { redis } from '../../config/redis';

// Rate limiter using token bucket
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number = 40;
  private readonly refillRate: number = 10000; // 10 seconds

  constructor() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens <= 0) {
      const waitTime = this.refillRate - (Date.now() - this.lastRefill);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.refill();
    }
    
    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    
    if (elapsed >= this.refillRate) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

export class TmdbClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private readonly cachePrefix = 'tmdb:';
  private readonly cacheTTL = 86400; // 24 hours

  constructor() {
    this.client = axios.create({
      baseURL: tmdbConfig.baseUrl,
      params: {
        api_key: tmdbConfig.apiKey,
        language: tmdbConfig.language,
      },
      timeout: 10000,
    });

    this.rateLimiter = new RateLimiter();

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      response => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  /**
   * Make a cached GET request to TMDB
   */
  async get<T>(endpoint: string, params: Record<string, any> = {}): Promise<T> {
    const cacheKey = this.buildCacheKey(endpoint, params);
    
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Rate limit
    await this.rateLimiter.acquire();

    // Make request
    const response = await this.client.get<T>(endpoint, { params });
    
    // Cache response
    await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response.data));
    
    return response.data;
  }

  private buildCacheKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(k => `${k}=${params[k]}`)
      .join('&');
    return `${this.cachePrefix}${endpoint}?${sortedParams}`;
  }

  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;
      
      switch (status) {
        case 401:
          throw new Error('TMDB: Invalid API key');
        case 404:
          throw new Error('TMDB: Resource not found');
        case 429:
          throw new Error('TMDB: Rate limit exceeded');
        default:
          throw new Error(`TMDB: ${data?.status_message || 'Unknown error'}`);
      }
    }
    throw error;
  }

  /**
   * Invalidate cache for a specific resource
   */
  async invalidateCache(pattern: string): Promise<void> {
    const keys = await redis.keys(`${this.cachePrefix}${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Build full image URL
   */
  getImageUrl(path: string | null, size: string = 'original'): string | null {
    if (!path) return null;
    return `${tmdbConfig.imageBaseUrl}/${size}${path}`;
  }
}
```

### Movie Service

```typescript
// src/services/tmdb/TmdbMovieService.ts
import { TmdbClient } from './TmdbClient';
import { tmdbConfig } from '../../config/tmdb';

interface TmdbMovie {
  id: number;
  imdb_id: string | null;
  title: string;
  original_title: string;
  overview: string | null;
  tagline: string | null;
  release_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  popularity: number;
  adult: boolean;
  status: string;
  original_language: string;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: Array<{ id: number; name: string }>;
  production_companies: Array<{ id: number; name: string; logo_path: string | null }>;
  production_countries: Array<{ iso_3166_1: string; name: string }>;
  spoken_languages: Array<{ iso_639_1: string; name: string }>;
  budget: number;
  revenue: number;
  homepage: string | null;
}

interface TmdbCredits {
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
    order: number;
  }>;
  crew: Array<{
    id: number;
    name: string;
    job: string;
    department: string;
    profile_path: string | null;
  }>;
}

interface TmdbVideos {
  results: Array<{
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
  }>;
}

interface TmdbSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: Array<{
    id: number;
    title: string;
    original_title: string;
    release_date: string | null;
    poster_path: string | null;
    overview: string;
    vote_average: number;
    popularity: number;
  }>;
}

export class TmdbMovieService {
  private client: TmdbClient;

  constructor() {
    this.client = new TmdbClient();
  }

  /**
   * Search for movies by title
   */
  async search(
    query: string,
    options: { year?: number; page?: number } = {}
  ): Promise<TmdbSearchResult> {
    const params: Record<string, any> = {
      query,
      include_adult: tmdbConfig.includeAdult,
      page: options.page || 1,
    };

    if (options.year) {
      params.year = options.year;
    }

    return this.client.get<TmdbSearchResult>('/search/movie', params);
  }

  /**
   * Get movie details by TMDB ID
   */
  async getDetails(tmdbId: number): Promise<TmdbMovie> {
    return this.client.get<TmdbMovie>(`/movie/${tmdbId}`);
  }

  /**
   * Get movie with all appended data (credits, videos, keywords)
   */
  async getFullDetails(tmdbId: number): Promise<TmdbMovie & {
    credits: TmdbCredits;
    videos: TmdbVideos;
    keywords: { keywords: Array<{ id: number; name: string }> };
    external_ids: { imdb_id: string | null; facebook_id: string | null };
  }> {
    return this.client.get(`/movie/${tmdbId}`, {
      append_to_response: 'credits,videos,keywords,external_ids',
    });
  }

  /**
   * Get movie by external ID (IMDb)
   */
  async findByImdbId(imdbId: string): Promise<{ movie_results: TmdbMovie[] }> {
    return this.client.get('/find/' + imdbId, {
      external_source: 'imdb_id',
    });
  }

  /**
   * Get popular movies
   */
  async getPopular(page: number = 1): Promise<TmdbSearchResult> {
    return this.client.get<TmdbSearchResult>('/movie/popular', { page });
  }

  /**
   * Get now playing movies
   */
  async getNowPlaying(page: number = 1): Promise<TmdbSearchResult> {
    return this.client.get<TmdbSearchResult>('/movie/now_playing', { page });
  }

  /**
   * Get movie genres
   */
  async getGenres(): Promise<{ genres: Array<{ id: number; name: string }> }> {
    return this.client.get('/genre/movie/list');
  }

  /**
   * Extract trailer URL from videos
   */
  extractTrailerUrl(videos: TmdbVideos): string | null {
    // Prefer official YouTube trailers
    const trailer = videos.results.find(
      v => v.site === 'YouTube' && v.type === 'Trailer' && v.official
    ) || videos.results.find(
      v => v.site === 'YouTube' && v.type === 'Trailer'
    ) || videos.results.find(
      v => v.site === 'YouTube'
    );

    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
  }

  /**
   * Get director from credits
   */
  extractDirector(credits: TmdbCredits): string | null {
    const director = credits.crew.find(c => c.job === 'Director');
    return director?.name || null;
  }

  /**
   * Get main cast (top 10)
   */
  extractMainCast(credits: TmdbCredits, limit: number = 10): string {
    return credits.cast
      .slice(0, limit)
      .map(c => c.name)
      .join(', ');
  }
}
```

### TV Series Service

```typescript
// src/services/tmdb/TmdbTvService.ts
import { TmdbClient } from './TmdbClient';
import { tmdbConfig } from '../../config/tmdb';

interface TmdbTvShow {
  id: number;
  name: string;
  original_name: string;
  overview: string | null;
  tagline: string | null;
  first_air_date: string | null;
  last_air_date: string | null;
  status: string;
  type: string;
  original_language: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  number_of_seasons: number;
  number_of_episodes: number;
  episode_run_time: number[];
  in_production: boolean;
  genres: Array<{ id: number; name: string }>;
  networks: Array<{ id: number; name: string; logo_path: string | null }>;
  production_companies: Array<{ id: number; name: string; logo_path: string | null }>;
  created_by: Array<{ id: number; name: string; profile_path: string | null }>;
  seasons: Array<{
    id: number;
    season_number: number;
    name: string;
    overview: string;
    poster_path: string | null;
    air_date: string | null;
    episode_count: number;
  }>;
}

interface TmdbSeason {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TmdbEpisode[];
}

interface TmdbEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
  vote_count: number;
  crew: Array<{ id: number; name: string; job: string }>;
  guest_stars: Array<{ id: number; name: string; character: string }>;
}

interface TmdbTvSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: Array<{
    id: number;
    name: string;
    original_name: string;
    first_air_date: string | null;
    poster_path: string | null;
    overview: string;
    vote_average: number;
    popularity: number;
  }>;
}

export class TmdbTvService {
  private client: TmdbClient;

  constructor() {
    this.client = new TmdbClient();
  }

  /**
   * Search for TV shows
   */
  async search(
    query: string,
    options: { year?: number; page?: number } = {}
  ): Promise<TmdbTvSearchResult> {
    const params: Record<string, any> = {
      query,
      include_adult: tmdbConfig.includeAdult,
      page: options.page || 1,
    };

    if (options.year) {
      params.first_air_date_year = options.year;
    }

    return this.client.get<TmdbTvSearchResult>('/search/tv', params);
  }

  /**
   * Get TV show details
   */
  async getDetails(tmdbId: number): Promise<TmdbTvShow> {
    return this.client.get<TmdbTvShow>(`/tv/${tmdbId}`);
  }

  /**
   * Get TV show with all appended data
   */
  async getFullDetails(tmdbId: number): Promise<TmdbTvShow & {
    credits: { cast: any[]; crew: any[] };
    videos: { results: any[] };
    keywords: { results: Array<{ id: number; name: string }> };
    content_ratings: { results: Array<{ iso_3166_1: string; rating: string }> };
    external_ids: { imdb_id: string | null; tvdb_id: number | null };
  }> {
    return this.client.get(`/tv/${tmdbId}`, {
      append_to_response: 'credits,videos,keywords,content_ratings,external_ids',
    });
  }

  /**
   * Get season details with episodes
   */
  async getSeason(tmdbId: number, seasonNumber: number): Promise<TmdbSeason> {
    return this.client.get<TmdbSeason>(`/tv/${tmdbId}/season/${seasonNumber}`);
  }

  /**
   * Get specific episode details
   */
  async getEpisode(
    tmdbId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<TmdbEpisode> {
    return this.client.get<TmdbEpisode>(
      `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`
    );
  }

  /**
   * Get TV genres
   */
  async getGenres(): Promise<{ genres: Array<{ id: number; name: string }> }> {
    return this.client.get('/genre/tv/list');
  }

  /**
   * Get popular TV shows
   */
  async getPopular(page: number = 1): Promise<TmdbTvSearchResult> {
    return this.client.get<TmdbTvSearchResult>('/tv/popular', { page });
  }

  /**
   * Get TV shows airing today
   */
  async getAiringToday(page: number = 1): Promise<TmdbTvSearchResult> {
    return this.client.get<TmdbTvSearchResult>('/tv/airing_today', { page });
  }

  /**
   * Find by external ID
   */
  async findByImdbId(imdbId: string): Promise<{ tv_results: TmdbTvShow[] }> {
    return this.client.get('/find/' + imdbId, {
      external_source: 'imdb_id',
    });
  }

  async findByTvdbId(tvdbId: number): Promise<{ tv_results: TmdbTvShow[] }> {
    return this.client.get('/find/' + tvdbId, {
      external_source: 'tvdb_id',
    });
  }
}
```

---

## METADATA SYNC SERVICE

### Auto-Matcher

```typescript
// src/services/tmdb/TmdbMetadataSync.ts
import { prisma } from '../../config/database';
import { TmdbMovieService } from './TmdbMovieService';
import { TmdbTvService } from './TmdbTvService';
import { TmdbClient } from './TmdbClient';

interface SyncOptions {
  forceRefresh?: boolean;
  maxResults?: number;
  batchSize?: number;
}

interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  notFound: number;
  errors: Array<{ id: number; error: string }>;
}

export class TmdbMetadataSync {
  private movieService: TmdbMovieService;
  private tvService: TmdbTvService;
  private client: TmdbClient;

  constructor() {
    this.movieService = new TmdbMovieService();
    this.tvService = new TmdbTvService();
    this.client = new TmdbClient();
  }

  /**
   * Sync all VOD content with TMDB
   */
  async syncAllMovies(options: SyncOptions = {}): Promise<SyncResult> {
    const { forceRefresh = false, batchSize = 50 } = options;

    const whereClause = forceRefresh
      ? { streamType: 'VOD' as const }
      : { streamType: 'VOD' as const, tmdbSyncStatus: { in: ['PENDING', 'FAILED'] } };

    const movies = await prisma.stream.findMany({
      where: whereClause,
      select: { id: true, name: true, tmdbId: true, imdbId: true },
    });

    const result: SyncResult = {
      total: movies.length,
      synced: 0,
      failed: 0,
      notFound: 0,
      errors: [],
    };

    // Process in batches
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async movie => {
          try {
            await this.syncMovie(movie.id, movie.name, movie.tmdbId, movie.imdbId);
            result.synced++;
          } catch (error: any) {
            if (error.message.includes('not found')) {
              result.notFound++;
            } else {
              result.failed++;
              result.errors.push({ id: movie.id, error: error.message });
            }
          }
        })
      );

      // Log progress
      console.log(`Synced ${Math.min(i + batchSize, movies.length)}/${movies.length} movies`);
    }

    return result;
  }

  /**
   * Sync a single movie
   */
  async syncMovie(
    streamId: number,
    title: string,
    existingTmdbId?: number | null,
    imdbId?: string | null
  ): Promise<void> {
    const startTime = Date.now();
    let tmdbId = existingTmdbId;
    let action = 'update';

    try {
      // Find TMDB ID if not set
      if (!tmdbId) {
        action = 'search';
        tmdbId = await this.findMovieTmdbId(title, imdbId);
        
        if (!tmdbId) {
          await this.logSync('movie', streamId, null, action, 'not_found', 'No match found');
          await prisma.stream.update({
            where: { id: streamId },
            data: { tmdbSyncStatus: 'NOT_FOUND' },
          });
          throw new Error('Movie not found on TMDB');
        }
      }

      action = 'fetch';
      
      // Fetch full details
      const details = await this.movieService.getFullDetails(tmdbId);
      
      // Extract trailer
      const trailerUrl = this.movieService.extractTrailerUrl(details.videos);
      
      // Update database
      await prisma.stream.update({
        where: { id: streamId },
        data: {
          tmdbId: details.id,
          tmdbType: 'movie',
          imdbId: details.external_ids?.imdb_id || null,
          originalTitle: details.original_title,
          overview: details.overview,
          tagline: details.tagline,
          releaseDate: details.release_date ? new Date(details.release_date) : null,
          runtime: details.runtime,
          voteAverage: details.vote_average,
          voteCount: details.vote_count,
          popularity: details.popularity,
          adult: details.adult,
          status: details.status,
          originalLanguage: details.original_language,
          posterPath: this.client.getImageUrl(details.poster_path, 'w500'),
          backdropPath: this.client.getImageUrl(details.backdrop_path, 'w1280'),
          trailerUrl,
          genres: details.genres,
          productionCompanies: details.production_companies,
          productionCountries: details.production_countries,
          spokenLanguages: details.spoken_languages,
          credits: {
            cast: details.credits.cast.slice(0, 20).map(c => ({
              id: c.id,
              name: c.name,
              character: c.character,
              profile_path: this.client.getImageUrl(c.profile_path, 'w185'),
              order: c.order,
            })),
            crew: details.credits.crew
              .filter(c => ['Director', 'Writer', 'Screenplay', 'Producer'].includes(c.job))
              .slice(0, 10)
              .map(c => ({
                id: c.id,
                name: c.name,
                job: c.job,
                department: c.department,
              })),
          },
          keywords: details.keywords?.keywords || [],
          tmdbLastSync: new Date(),
          tmdbSyncStatus: 'SYNCED',
        },
      });

      await this.logSync('movie', streamId, tmdbId, action, 'success', null, Date.now() - startTime);

    } catch (error: any) {
      await this.logSync('movie', streamId, tmdbId, action, 'failed', error.message, Date.now() - startTime);
      
      if (!error.message.includes('not found')) {
        await prisma.stream.update({
          where: { id: streamId },
          data: { tmdbSyncStatus: 'FAILED' },
        });
      }
      
      throw error;
    }
  }

  /**
   * Sync all series with TMDB
   */
  async syncAllSeries(options: SyncOptions = {}): Promise<SyncResult> {
    const { forceRefresh = false, batchSize = 20 } = options;

    const whereClause = forceRefresh
      ? {}
      : { tmdbSyncStatus: { in: ['PENDING', 'FAILED'] } };

    const seriesList = await prisma.series.findMany({
      where: whereClause,
      select: { id: true, name: true, tmdbId: true, imdbId: true },
    });

    const result: SyncResult = {
      total: seriesList.length,
      synced: 0,
      failed: 0,
      notFound: 0,
      errors: [],
    };

    for (let i = 0; i < seriesList.length; i += batchSize) {
      const batch = seriesList.slice(i, i + batchSize);
      
      for (const series of batch) {
        try {
          await this.syncSeries(series.id, series.name, series.tmdbId, series.imdbId);
          result.synced++;
        } catch (error: any) {
          if (error.message.includes('not found')) {
            result.notFound++;
          } else {
            result.failed++;
            result.errors.push({ id: series.id, error: error.message });
          }
        }
      }

      console.log(`Synced ${Math.min(i + batchSize, seriesList.length)}/${seriesList.length} series`);
    }

    return result;
  }

  /**
   * Sync a single series with all seasons and episodes
   */
  async syncSeries(
    seriesId: number,
    title: string,
    existingTmdbId?: number | null,
    imdbId?: string | null
  ): Promise<void> {
    const startTime = Date.now();
    let tmdbId = existingTmdbId;
    let action = 'update';

    try {
      // Find TMDB ID if not set
      if (!tmdbId) {
        action = 'search';
        tmdbId = await this.findSeriesTmdbId(title, imdbId);
        
        if (!tmdbId) {
          await this.logSync('series', seriesId, null, action, 'not_found', 'No match found');
          await prisma.series.update({
            where: { id: seriesId },
            data: { tmdbSyncStatus: 'NOT_FOUND' },
          });
          throw new Error('Series not found on TMDB');
        }
      }

      action = 'fetch';
      
      // Fetch full series details
      const details = await this.tvService.getFullDetails(tmdbId);
      
      // Extract trailer
      const trailerUrl = details.videos?.results?.find(
        v => v.site === 'YouTube' && v.type === 'Trailer'
      );

      // Update series
      await prisma.series.update({
        where: { id: seriesId },
        data: {
          tmdbId: details.id,
          imdbId: details.external_ids?.imdb_id || null,
          originalName: details.original_name,
          overview: details.overview,
          tagline: details.tagline,
          firstAirDate: details.first_air_date ? new Date(details.first_air_date) : null,
          lastAirDate: details.last_air_date ? new Date(details.last_air_date) : null,
          status: details.status,
          type: details.type,
          originalLanguage: details.original_language,
          voteAverage: details.vote_average,
          voteCount: details.vote_count,
          popularity: details.popularity,
          numberOfSeasons: details.number_of_seasons,
          numberOfEpisodes: details.number_of_episodes,
          episodeRunTime: details.episode_run_time,
          posterPath: this.client.getImageUrl(details.poster_path, 'w500'),
          backdropPath: this.client.getImageUrl(details.backdrop_path, 'w1280'),
          trailerUrl: trailerUrl ? `https://www.youtube.com/watch?v=${trailerUrl.key}` : null,
          genres: details.genres,
          networks: details.networks?.map(n => ({
            id: n.id,
            name: n.name,
            logo_path: this.client.getImageUrl(n.logo_path, 'w92'),
          })),
          productionCompanies: details.production_companies,
          createdBy: details.created_by,
          credits: {
            cast: details.credits?.cast?.slice(0, 20) || [],
            crew: details.credits?.crew?.filter(c => 
              ['Creator', 'Executive Producer'].includes(c.job)
            ) || [],
          },
          keywords: details.keywords?.results || [],
          contentRatings: details.content_ratings?.results || [],
          tmdbLastSync: new Date(),
          tmdbSyncStatus: 'SYNCED',
        },
      });

      // Sync seasons
      await this.syncSeasons(seriesId, tmdbId, details.seasons);

      await this.logSync('series', seriesId, tmdbId, action, 'success', null, Date.now() - startTime);

    } catch (error: any) {
      await this.logSync('series', seriesId, tmdbId, action, 'failed', error.message, Date.now() - startTime);
      
      if (!error.message.includes('not found')) {
        await prisma.series.update({
          where: { id: seriesId },
          data: { tmdbSyncStatus: 'FAILED' },
        });
      }
      
      throw error;
    }
  }

  /**
   * Sync seasons and episodes for a series
   */
  private async syncSeasons(
    seriesId: number,
    tmdbId: number,
    seasonsInfo: Array<{ season_number: number }>
  ): Promise<void> {
    for (const seasonInfo of seasonsInfo) {
      // Skip specials (season 0) unless explicitly wanted
      if (seasonInfo.season_number === 0) continue;

      const seasonDetails = await this.tvService.getSeason(tmdbId, seasonInfo.season_number);

      // Upsert season
      const season = await prisma.season.upsert({
        where: {
          seriesId_seasonNumber: {
            seriesId,
            seasonNumber: seasonInfo.season_number,
          },
        },
        update: {
          tmdbId: seasonDetails.id,
          name: seasonDetails.name,
          overview: seasonDetails.overview,
          posterPath: this.client.getImageUrl(seasonDetails.poster_path, 'w342'),
          airDate: seasonDetails.air_date ? new Date(seasonDetails.air_date) : null,
          episodeCount: seasonDetails.episodes.length,
          tmdbLastSync: new Date(),
        },
        create: {
          seriesId,
          tmdbId: seasonDetails.id,
          seasonNumber: seasonInfo.season_number,
          name: seasonDetails.name,
          overview: seasonDetails.overview,
          posterPath: this.client.getImageUrl(seasonDetails.poster_path, 'w342'),
          airDate: seasonDetails.air_date ? new Date(seasonDetails.air_date) : null,
          episodeCount: seasonDetails.episodes.length,
          tmdbLastSync: new Date(),
        },
      });

      // Sync episodes
      for (const ep of seasonDetails.episodes) {
        await prisma.episode.upsert({
          where: {
            seasonId_episodeNumber: {
              seasonId: season.id,
              episodeNumber: ep.episode_number,
            },
          },
          update: {
            tmdbId: ep.id,
            name: ep.name,
            overview: ep.overview,
            stillPath: this.client.getImageUrl(ep.still_path, 'w300'),
            airDate: ep.air_date ? new Date(ep.air_date) : null,
            runtime: ep.runtime,
            voteAverage: ep.vote_average,
            voteCount: ep.vote_count,
            crew: ep.crew?.slice(0, 5),
            guestStars: ep.guest_stars?.slice(0, 10),
            tmdbLastSync: new Date(),
          },
          create: {
            seasonId: season.id,
            tmdbId: ep.id,
            episodeNumber: ep.episode_number,
            name: ep.name,
            overview: ep.overview,
            stillPath: this.client.getImageUrl(ep.still_path, 'w300'),
            airDate: ep.air_date ? new Date(ep.air_date) : null,
            runtime: ep.runtime,
            voteAverage: ep.vote_average,
            voteCount: ep.vote_count,
            crew: ep.crew?.slice(0, 5),
            guestStars: ep.guest_stars?.slice(0, 10),
            tmdbLastSync: new Date(),
          },
        });
      }
    }
  }

  /**
   * Find movie TMDB ID by title or IMDb ID
   */
  private async findMovieTmdbId(title: string, imdbId?: string | null): Promise<number | null> {
    // Try IMDb ID first
    if (imdbId) {
      const result = await this.movieService.findByImdbId(imdbId);
      if (result.movie_results.length > 0) {
        return result.movie_results[0].id;
      }
    }

    // Parse year from title if present (e.g., "Movie Name (2023)")
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
    const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, '').trim();

    // Search by title
    const searchResult = await this.movieService.search(cleanTitle, { year });
    
    if (searchResult.results.length === 0) {
      return null;
    }

    // Find best match
    const normalizedTitle = this.normalizeTitle(cleanTitle);
    
    const bestMatch = searchResult.results.find(r => {
      const matchTitle = this.normalizeTitle(r.title);
      const matchOriginal = this.normalizeTitle(r.original_title);
      return matchTitle === normalizedTitle || matchOriginal === normalizedTitle;
    }) || searchResult.results[0]; // Fall back to first result

    return bestMatch.id;
  }

  /**
   * Find series TMDB ID by title or IMDb ID
   */
  private async findSeriesTmdbId(title: string, imdbId?: string | null): Promise<number | null> {
    // Try IMDb ID first
    if (imdbId) {
      const result = await this.tvService.findByImdbId(imdbId);
      if (result.tv_results.length > 0) {
        return result.tv_results[0].id;
      }
    }

    // Parse year from title
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
    const cleanTitle = title.replace(/\s*\(\d{4})\s*$/, '').trim();

    // Search by title
    const searchResult = await this.tvService.search(cleanTitle, { year });
    
    if (searchResult.results.length === 0) {
      return null;
    }

    // Find best match
    const normalizedTitle = this.normalizeTitle(cleanTitle);
    
    const bestMatch = searchResult.results.find(r => {
      const matchTitle = this.normalizeTitle(r.name);
      const matchOriginal = this.normalizeTitle(r.original_name);
      return matchTitle === normalizedTitle || matchOriginal === normalizedTitle;
    }) || searchResult.results[0];

    return bestMatch.id;
  }

  /**
   * Normalize title for comparison
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Log sync action
   */
  private async logSync(
    entityType: string,
    entityId: number,
    tmdbId: number | null | undefined,
    action: string,
    status: string,
    message?: string | null,
    duration?: number
  ): Promise<void> {
    await prisma.tmdbSyncLog.create({
      data: {
        entityType,
        entityId,
        tmdbId: tmdbId ?? null,
        action,
        status,
        message,
        duration,
      },
    });
  }
}
```

---

## BACKGROUND SYNC WORKER

```typescript
// src/workers/tmdbSyncWorker.ts
import cron from 'node-cron';
import { TmdbMetadataSync } from '../services/tmdb/TmdbMetadataSync';
import { TmdbMovieService } from '../services/tmdb/TmdbMovieService';
import { TmdbTvService } from '../services/tmdb/TmdbTvService';
import { prisma } from '../config/database';

export class TmdbSyncWorker {
  private metadataSync: TmdbMetadataSync;
  private movieService: TmdbMovieService;
  private tvService: TmdbTvService;

  constructor() {
    this.metadataSync = new TmdbMetadataSync();
    this.movieService = new TmdbMovieService();
    this.tvService = new TmdbTvService();
  }

  start(): void {
    // Sync pending content every hour
    cron.schedule('0 * * * *', () => {
      this.syncPending();
    });

    // Full refresh weekly (Sunday at 3 AM)
    cron.schedule('0 3 * * 0', () => {
      this.fullRefresh();
    });

    // Sync genres daily
    cron.schedule('0 4 * * *', () => {
      this.syncGenres();
    });

    // Check for outdated metadata daily
    cron.schedule('0 5 * * *', () => {
      this.refreshOutdated();
    });

    console.log('TMDB sync worker started');
  }

  /**
   * Sync content with PENDING or FAILED status
   */
  private async syncPending(): Promise<void> {
    console.log('Starting pending content sync...');

    try {
      const movieResult = await this.metadataSync.syncAllMovies({
        forceRefresh: false,
        batchSize: 50,
      });
      console.log(`Movies: ${movieResult.synced} synced, ${movieResult.failed} failed, ${movieResult.notFound} not found`);

      const seriesResult = await this.metadataSync.syncAllSeries({
        forceRefresh: false,
        batchSize: 20,
      });
      console.log(`Series: ${seriesResult.synced} synced, ${seriesResult.failed} failed, ${seriesResult.notFound} not found`);

    } catch (error) {
      console.error('Pending sync failed:', error);
    }
  }

  /**
   * Full refresh of all content
   */
  private async fullRefresh(): Promise<void> {
    console.log('Starting full TMDB refresh...');

    try {
      const movieResult = await this.metadataSync.syncAllMovies({
        forceRefresh: true,
        batchSize: 100,
      });
      console.log(`Full refresh - Movies: ${movieResult.synced} synced`);

      const seriesResult = await this.metadataSync.syncAllSeries({
        forceRefresh: true,
        batchSize: 30,
      });
      console.log(`Full refresh - Series: ${seriesResult.synced} synced`);

    } catch (error) {
      console.error('Full refresh failed:', error);
    }
  }

  /**
   * Sync genre lists from TMDB
   */
  private async syncGenres(): Promise<void> {
    try {
      // Movie genres
      const movieGenres = await this.movieService.getGenres();
      for (const genre of movieGenres.genres) {
        await prisma.tmdbGenre.upsert({
          where: { id_type: { id: genre.id, type: 'movie' } },
          update: { name: genre.name },
          create: { id: genre.id, name: genre.name, type: 'movie' },
        });
      }

      // TV genres
      const tvGenres = await this.tvService.getGenres();
      for (const genre of tvGenres.genres) {
        await prisma.tmdbGenre.upsert({
          where: { id_type: { id: genre.id, type: 'tv' } },
          update: { name: genre.name },
          create: { id: genre.id, name: genre.name, type: 'tv' },
        });
      }

      console.log('Genres synced successfully');
    } catch (error) {
      console.error('Genre sync failed:', error);
    }
  }

  /**
   * Refresh content that hasn't been updated in 30 days
   */
  private async refreshOutdated(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      // Find outdated movies
      const outdatedMovies = await prisma.stream.findMany({
        where: {
          streamType: 'VOD',
          tmdbSyncStatus: 'SYNCED',
          tmdbLastSync: { lt: thirtyDaysAgo },
        },
        select: { id: true, name: true, tmdbId: true, imdbId: true },
        take: 100,
      });

      for (const movie of outdatedMovies) {
        try {
          await this.metadataSync.syncMovie(movie.id, movie.name, movie.tmdbId, movie.imdbId);
        } catch (error) {
          console.error(`Failed to refresh movie ${movie.id}:`, error);
        }
      }

      // Find outdated series
      const outdatedSeries = await prisma.series.findMany({
        where: {
          tmdbSyncStatus: 'SYNCED',
          tmdbLastSync: { lt: thirtyDaysAgo },
        },
        select: { id: true, name: true, tmdbId: true, imdbId: true },
        take: 50,
      });

      for (const series of outdatedSeries) {
        try {
          await this.metadataSync.syncSeries(series.id, series.name, series.tmdbId, series.imdbId);
        } catch (error) {
          console.error(`Failed to refresh series ${series.id}:`, error);
        }
      }

      console.log(`Refreshed ${outdatedMovies.length} movies and ${outdatedSeries.length} series`);
    } catch (error) {
      console.error('Outdated refresh failed:', error);
    }
  }
}

// Start worker
const worker = new TmdbSyncWorker();
worker.start();
```

---

## API ENDPOINTS

### Admin TMDB Routes

```typescript
// src/api/routes/admin/tmdb.ts
import { FastifyPluginAsync } from 'fastify';
import { TmdbMetadataSync } from '../../../services/tmdb/TmdbMetadataSync';
import { TmdbMovieService } from '../../../services/tmdb/TmdbMovieService';
import { TmdbTvService } from '../../../services/tmdb/TmdbTvService';
import { prisma } from '../../../config/database';

export const tmdbAdminRoutes: FastifyPluginAsync = async (fastify) => {
  const metadataSync = new TmdbMetadataSync();
  const movieService = new TmdbMovieService();
  const tvService = new TmdbTvService();

  // Search TMDB for movies
  fastify.get('/admin/tmdb/search/movie', async (request, reply) => {
    const { query, year } = request.query as { query: string; year?: string };
    
    if (!query) {
      return reply.status(400).send({ error: 'Query required' });
    }

    const results = await movieService.search(query, {
      year: year ? parseInt(year) : undefined,
    });

    return results;
  });

  // Search TMDB for TV shows
  fastify.get('/admin/tmdb/search/tv', async (request, reply) => {
    const { query, year } = request.query as { query: string; year?: string };
    
    if (!query) {
      return reply.status(400).send({ error: 'Query required' });
    }

    const results = await tvService.search(query, {
      year: year ? parseInt(year) : undefined,
    });

    return results;
  });

  // Get movie details from TMDB
  fastify.get('/admin/tmdb/movie/:tmdbId', async (request, reply) => {
    const { tmdbId } = request.params as { tmdbId: string };
    const details = await movieService.getFullDetails(parseInt(tmdbId));
    return details;
  });

  // Get TV show details from TMDB
  fastify.get('/admin/tmdb/tv/:tmdbId', async (request, reply) => {
    const { tmdbId } = request.params as { tmdbId: string };
    const details = await tvService.getFullDetails(parseInt(tmdbId));
    return details;
  });

  // Manually link a VOD to TMDB
  fastify.post('/admin/streams/:id/tmdb-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tmdbId } = request.body as { tmdbId: number };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    try {
      await metadataSync.syncMovie(parseInt(id), stream.name, tmdbId, stream.imdbId);
      
      const updated = await prisma.stream.findUnique({
        where: { id: parseInt(id) },
      });

      return updated;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Manually link a series to TMDB
  fastify.post('/admin/series/:id/tmdb-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tmdbId } = request.body as { tmdbId: number };

    const series = await prisma.series.findUnique({
      where: { id: parseInt(id) },
    });

    if (!series) {
      return reply.status(404).send({ error: 'Series not found' });
    }

    try {
      await metadataSync.syncSeries(parseInt(id), series.name, tmdbId, series.imdbId);
      
      const updated = await prisma.series.findUnique({
        where: { id: parseInt(id) },
        include: {
          seasons: {
            include: { episodes: true },
            orderBy: { seasonNumber: 'asc' },
          },
        },
      });

      return updated;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Trigger sync for pending content
  fastify.post('/admin/tmdb/sync/pending', async (request, reply) => {
    const { type } = request.body as { type?: 'movies' | 'series' | 'all' };

    const results: any = {};

    if (type === 'movies' || type === 'all' || !type) {
      results.movies = await metadataSync.syncAllMovies({ forceRefresh: false });
    }

    if (type === 'series' || type === 'all' || !type) {
      results.series = await metadataSync.syncAllSeries({ forceRefresh: false });
    }

    return results;
  });

  // Force full refresh
  fastify.post('/admin/tmdb/sync/refresh', async (request, reply) => {
    const { type } = request.body as { type?: 'movies' | 'series' | 'all' };

    const results: any = {};

    if (type === 'movies' || type === 'all' || !type) {
      results.movies = await metadataSync.syncAllMovies({ forceRefresh: true });
    }

    if (type === 'series' || type === 'all' || !type) {
      results.series = await metadataSync.syncAllSeries({ forceRefresh: true });
    }

    return results;
  });

  // Get sync statistics
  fastify.get('/admin/tmdb/stats', async (request, reply) => {
    const [movieStats, seriesStats, recentLogs] = await Promise.all([
      prisma.stream.groupBy({
        by: ['tmdbSyncStatus'],
        where: { streamType: 'VOD' },
        _count: true,
      }),
      prisma.series.groupBy({
        by: ['tmdbSyncStatus'],
        _count: true,
      }),
      prisma.tmdbSyncLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    return {
      movies: movieStats.reduce((acc, s) => {
        acc[s.tmdbSyncStatus] = s._count;
        return acc;
      }, {} as Record<string, number>),
      series: seriesStats.reduce((acc, s) => {
        acc[s.tmdbSyncStatus] = s._count;
        return acc;
      }, {} as Record<string, number>),
      recentLogs,
    };
  });

  // Get genres
  fastify.get('/admin/tmdb/genres', async () => {
    const genres = await prisma.tmdbGenre.findMany({
      orderBy: { name: 'asc' },
    });

    return {
      movie: genres.filter(g => g.type === 'movie'),
      tv: genres.filter(g => g.type === 'tv'),
    };
  });
};
```

### Player API Extensions (Xtream Codes Compatible)

```typescript
// src/api/routes/playerApi.ts - Extended VOD/Series responses

// GET /player_api.php?action=get_vod_info&vod_id=X
fastify.get('/player_api.php', async (request, reply) => {
  const { action, vod_id, series_id } = request.query as any;

  // ... authentication ...

  if (action === 'get_vod_info' && vod_id) {
    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(vod_id) },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    // Xtream Codes compatible response format
    return {
      info: {
        tmdb_id: stream.tmdbId?.toString() || '',
        name: stream.name,
        o_name: stream.originalTitle || stream.name,
        cover_big: stream.posterPath || '',
        movie_image: stream.posterPath || '',
        releasedate: stream.releaseDate?.toISOString().split('T')[0] || '',
        episode_run_time: stream.runtime?.toString() || '',
        youtube_trailer: stream.trailerUrl || '',
        director: (stream.credits as any)?.crew?.find((c: any) => c.job === 'Director')?.name || '',
        actors: (stream.credits as any)?.cast?.map((c: any) => c.name).join(', ') || '',
        cast: (stream.credits as any)?.cast?.map((c: any) => c.name).join(', ') || '',
        description: stream.overview || '',
        plot: stream.overview || '',
        age: stream.adult ? '18+' : '',
        mpaa_rating: '',
        rating_count_kinopoisk: 0,
        country: (stream.productionCountries as any)?.[0]?.name || '',
        genre: (stream.genres as any)?.map((g: any) => g.name).join(', ') || '',
        backdrop_path: [stream.backdropPath].filter(Boolean),
        duration_secs: (stream.runtime || 0) * 60,
        duration: `${Math.floor((stream.runtime || 0) / 60)}:${((stream.runtime || 0) % 60).toString().padStart(2, '0')}:00`,
        bitrate: stream.bitrate || 0,
        rating: stream.voteAverage || 0,
        status: stream.status || 'Released',
      },
      movie_data: {
        stream_id: stream.id,
        name: stream.name,
        added: Math.floor(stream.createdAt.getTime() / 1000).toString(),
        category_id: stream.categoryId?.toString() || '',
        container_extension: stream.containerExtension || 'mp4',
        custom_sid: '',
        direct_source: '',
      },
    };
  }

  if (action === 'get_series_info' && series_id) {
    const series = await prisma.series.findUnique({
      where: { id: parseInt(series_id) },
      include: {
        seasons: {
          orderBy: { seasonNumber: 'asc' },
          include: {
            episodes: {
              orderBy: { episodeNumber: 'asc' },
            },
          },
        },
      },
    });

    if (!series) {
      return reply.status(404).send({ error: 'Series not found' });
    }

    // Build seasons object
    const seasons: Record<string, any[]> = {};
    for (const season of series.seasons) {
      seasons[season.seasonNumber.toString()] = season.episodes.map(ep => ({
        id: ep.id.toString(),
        episode_num: ep.episodeNumber,
        title: ep.name || `Episode ${ep.episodeNumber}`,
        container_extension: ep.containerExtension || 'mp4',
        info: {
          tmdb_id: ep.tmdbId,
          releasedate: ep.airDate?.toISOString().split('T')[0] || '',
          plot: ep.overview || '',
          duration_secs: (ep.runtime || 0) * 60,
          duration: ep.runtime ? `${ep.runtime}:00` : '',
          movie_image: ep.stillPath || '',
          rating: ep.voteAverage || 0,
        },
        custom_sid: '',
        added: Math.floor(new Date().getTime() / 1000).toString(),
        season: season.seasonNumber,
        direct_source: '',
      }));
    }

    // Xtream Codes compatible response
    return {
      seasons,
      info: {
        name: series.name,
        cover: series.posterPath || '',
        plot: series.overview || '',
        cast: (series.credits as any)?.cast?.map((c: any) => c.name).join(', ') || '',
        director: (series.createdBy as any)?.[0]?.name || '',
        genre: (series.genres as any)?.map((g: any) => g.name).join(', ') || '',
        releaseDate: series.firstAirDate?.toISOString().split('T')[0] || '',
        last_modified: Math.floor(series.updatedAt.getTime() / 1000).toString(),
        rating: series.voteAverage?.toString() || '',
        rating_5based: series.voteAverage ? (series.voteAverage / 2).toFixed(1) : '',
        backdrop_path: [series.backdropPath].filter(Boolean),
        youtube_trailer: series.trailerUrl || '',
        episode_run_time: series.episodeRunTime?.[0]?.toString() || '',
        category_id: series.categoryId?.toString() || '',
        tmdb_id: series.tmdbId,
      },
      episodes: seasons, // Duplicate for compatibility
    };
  }

  // ... other actions ...
});
```

---

## IMAGE PROXY & CACHING

```typescript
// src/services/tmdb/ImageProxy.ts
import axios from 'axios';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { tmdbConfig } from '../../config/tmdb';

export class TmdbImageProxy {
  private cacheDir: string;
  private maxCacheAge: number = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(cacheDir: string = '/var/cache/iptv/images') {
    this.cacheDir = cacheDir;
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
  }

  /**
   * Get image URL (cached locally or from TMDB)
   */
  async getImageUrl(
    tmdbPath: string,
    size: string = 'original'
  ): Promise<string> {
    const localPath = await this.getCachedImage(tmdbPath, size);
    
    if (localPath) {
      return `/images/cache/${path.basename(localPath)}`;
    }

    // Return direct TMDB URL (or trigger background cache)
    this.cacheImage(tmdbPath, size).catch(console.error);
    
    return `${tmdbConfig.imageBaseUrl}/${size}${tmdbPath}`;
  }

  /**
   * Download and cache image locally
   */
  async cacheImage(tmdbPath: string, size: string): Promise<string> {
    const hash = createHash('md5').update(`${size}${tmdbPath}`).digest('hex');
    const ext = path.extname(tmdbPath) || '.jpg';
    const localPath = path.join(this.cacheDir, `${hash}${ext}`);

    // Check if already cached
    try {
      await fs.access(localPath);
      return localPath;
    } catch {
      // Not cached, download
    }

    const url = `${tmdbConfig.imageBaseUrl}/${size}${tmdbPath}`;
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    await fs.writeFile(localPath, response.data);
    
    return localPath;
  }

  /**
   * Check for cached image
   */
  private async getCachedImage(
    tmdbPath: string,
    size: string
  ): Promise<string | null> {
    const hash = createHash('md5').update(`${size}${tmdbPath}`).digest('hex');
    const ext = path.extname(tmdbPath) || '.jpg';
    const localPath = path.join(this.cacheDir, `${hash}${ext}`);

    try {
      const stats = await fs.stat(localPath);
      
      // Check if cache is still valid
      if (Date.now() - stats.mtimeMs < this.maxCacheAge) {
        return localPath;
      }
      
      // Cache expired, delete it
      await fs.unlink(localPath);
    } catch {
      // File doesn't exist
    }

    return null;
  }

  /**
   * Clean up old cached images
   */
  async cleanupCache(): Promise<number> {
    const files = await fs.readdir(this.cacheDir);
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file);
      const stats = await fs.stat(filePath);
      
      if (Date.now() - stats.mtimeMs > this.maxCacheAge) {
        await fs.unlink(filePath);
        deleted++;
      }
    }

    return deleted;
  }
}
```

---

## SUMMARY

This TMDB integration provides:

| Feature | Description |
|---------|-------------|
| **Auto-matching** | Automatically find TMDB IDs by title/year/IMDb |
| **Full metadata** | Titles, plots, cast, crew, ratings, trailers |
| **Season/Episode sync** | Complete TV series hierarchy |
| **Image handling** | Posters, backdrops, profile images |
| **Background sync** | Scheduled workers for continuous updates |
| **Rate limiting** | Respects TMDB API limits |
| **Caching** | Redis caching for API responses |
| **Admin API** | Manual linking and sync triggers |
| **Xtream Codes compatible** | Response format matches XC API |

Would you like me to expand on any area, such as:
- **Multi-language support** (fetching metadata in multiple languages)
- **Image optimization** (resizing, WebP conversion)
- **Watchlist/Favorites** integration
- **Similar content recommendations**
- **Admin UI components** for TMDB management?