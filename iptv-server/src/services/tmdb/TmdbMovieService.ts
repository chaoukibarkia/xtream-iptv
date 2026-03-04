import { TmdbClient, tmdbClient } from './TmdbClient.js';
import { tmdbConfig } from '../../config/tmdb.js';
import {
  TmdbMovie,
  TmdbMovieSearchResponse,
  TmdbMovieFullDetails,
  TmdbFindResponse,
  TmdbCredits,
  TmdbVideos,
  TmdbGenre,
} from './types.js';

export interface MovieSearchOptions {
  year?: number;
  page?: number;
  includeAdult?: boolean;
  language?: string;
}

export class TmdbMovieService {
  private client: TmdbClient;

  constructor(client: TmdbClient = tmdbClient) {
    this.client = client;
  }

  /**
   * Search for movies by title
   */
  async search(
    query: string,
    options: MovieSearchOptions = {}
  ): Promise<TmdbMovieSearchResponse> {
    const params: Record<string, any> = {
      query,
      include_adult: options.includeAdult ?? tmdbConfig.includeAdult,
      page: options.page || 1,
    };

    if (options.year) {
      params.year = options.year;
    }

    return this.client.get<TmdbMovieSearchResponse>('/search/movie', params, { language: options.language });
  }

  /**
   * Get movie details by TMDB ID
   */
  async getDetails(tmdbId: number, language?: string): Promise<TmdbMovie> {
    return this.client.get<TmdbMovie>(`/movie/${tmdbId}`, {}, { language });
  }

  /**
   * Get movie with all appended data (credits, videos, keywords, external IDs)
   */
  async getFullDetails(tmdbId: number, language?: string): Promise<TmdbMovieFullDetails> {
    return this.client.get<TmdbMovieFullDetails>(`/movie/${tmdbId}`, {
      append_to_response: 'credits,videos,keywords,external_ids',
    }, { language });
  }

  /**
   * Get movie credits (cast & crew)
   */
  async getCredits(tmdbId: number): Promise<TmdbCredits> {
    return this.client.get<TmdbCredits>(`/movie/${tmdbId}/credits`);
  }

  /**
   * Get movie videos (trailers, teasers, etc.)
   */
  async getVideos(tmdbId: number): Promise<TmdbVideos> {
    return this.client.get<TmdbVideos>(`/movie/${tmdbId}/videos`);
  }

  /**
   * Find movie by external ID (IMDb)
   */
  async findByImdbId(imdbId: string): Promise<TmdbFindResponse> {
    return this.client.get<TmdbFindResponse>(`/find/${imdbId}`, {
      external_source: 'imdb_id',
    });
  }

  /**
   * Get popular movies
   */
  async getPopular(page: number = 1): Promise<TmdbMovieSearchResponse> {
    return this.client.get<TmdbMovieSearchResponse>('/movie/popular', { page });
  }

  /**
   * Get now playing movies
   */
  async getNowPlaying(page: number = 1): Promise<TmdbMovieSearchResponse> {
    return this.client.get<TmdbMovieSearchResponse>('/movie/now_playing', { page });
  }

  /**
   * Get upcoming movies
   */
  async getUpcoming(page: number = 1): Promise<TmdbMovieSearchResponse> {
    return this.client.get<TmdbMovieSearchResponse>('/movie/upcoming', { page });
  }

  /**
   * Get top rated movies
   */
  async getTopRated(page: number = 1): Promise<TmdbMovieSearchResponse> {
    return this.client.get<TmdbMovieSearchResponse>('/movie/top_rated', { page });
  }

  /**
   * Get movie genres list
   */
  async getGenres(): Promise<{ genres: TmdbGenre[] }> {
    return this.client.get<{ genres: TmdbGenre[] }>('/genre/movie/list');
  }

  /**
   * Extract YouTube trailer URL from videos
   */
  extractTrailerUrl(videos: TmdbVideos): string | null {
    // Prefer official YouTube trailers
    const trailer =
      videos.results.find(
        (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
      ) ||
      videos.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
      videos.results.find((v) => v.site === 'YouTube' && v.type === 'Teaser') ||
      videos.results.find((v) => v.site === 'YouTube');

    return trailer ? `https://www.youtube.com/watch?v=${trailer.key}` : null;
  }

  /**
   * Get director name from credits
   */
  extractDirector(credits: TmdbCredits): string | null {
    const director = credits.crew.find((c) => c.job === 'Director');
    return director?.name || null;
  }

  /**
   * Get all directors (for movies with multiple directors)
   */
  extractDirectors(credits: TmdbCredits): string[] {
    return credits.crew.filter((c) => c.job === 'Director').map((c) => c.name);
  }

  /**
   * Get main cast as comma-separated string
   */
  extractMainCast(credits: TmdbCredits, limit: number = 10): string {
    return credits.cast
      .slice(0, limit)
      .map((c) => c.name)
      .join(', ');
  }

  /**
   * Get genres as comma-separated string
   */
  extractGenres(movie: TmdbMovie): string {
    return movie.genres.map((g) => g.name).join(', ');
  }
}

// Export singleton instance
export const tmdbMovieService = new TmdbMovieService();

