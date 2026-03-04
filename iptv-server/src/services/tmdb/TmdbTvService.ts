import { TmdbClient, tmdbClient } from './TmdbClient.js';
import { tmdbConfig } from '../../config/tmdb.js';
import {
  TmdbTvShow,
  TmdbTvSearchResponse,
  TmdbTvFullDetails,
  TmdbSeason,
  TmdbEpisode,
  TmdbFindResponse,
  TmdbCredits,
  TmdbVideos,
  TmdbGenre,
} from './types.js';

export interface TvSearchOptions {
  year?: number;
  page?: number;
  includeAdult?: boolean;
  language?: string;
}

export class TmdbTvService {
  private client: TmdbClient;

  constructor(client: TmdbClient = tmdbClient) {
    this.client = client;
  }

  /**
   * Search for TV shows by name
   */
  async search(
    query: string,
    options: TvSearchOptions = {}
  ): Promise<TmdbTvSearchResponse> {
    const params: Record<string, any> = {
      query,
      include_adult: options.includeAdult ?? tmdbConfig.includeAdult,
      page: options.page || 1,
    };

    if (options.year) {
      params.first_air_date_year = options.year;
    }

    return this.client.get<TmdbTvSearchResponse>('/search/tv', params, { language: options.language });
  }

  /**
   * Get TV show details by TMDB ID
   */
  async getDetails(tmdbId: number, language?: string): Promise<TmdbTvShow> {
    return this.client.get<TmdbTvShow>(`/tv/${tmdbId}`, {}, { language });
  }

  /**
   * Get TV show with all appended data
   */
  async getFullDetails(tmdbId: number, language?: string): Promise<TmdbTvFullDetails> {
    return this.client.get<TmdbTvFullDetails>(`/tv/${tmdbId}`, {
      append_to_response: 'credits,videos,keywords,content_ratings,external_ids',
    }, { language });
  }

  /**
   * Get TV show credits (cast & crew)
   */
  async getCredits(tmdbId: number): Promise<TmdbCredits> {
    return this.client.get<TmdbCredits>(`/tv/${tmdbId}/credits`);
  }

  /**
   * Get TV show videos
   */
  async getVideos(tmdbId: number): Promise<TmdbVideos> {
    return this.client.get<TmdbVideos>(`/tv/${tmdbId}/videos`);
  }

  /**
   * Get season details with all episodes
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
   * Find TV show by external ID (IMDb)
   */
  async findByImdbId(imdbId: string): Promise<TmdbFindResponse> {
    return this.client.get<TmdbFindResponse>(`/find/${imdbId}`, {
      external_source: 'imdb_id',
    });
  }

  /**
   * Find TV show by TVDB ID
   */
  async findByTvdbId(tvdbId: number): Promise<TmdbFindResponse> {
    return this.client.get<TmdbFindResponse>(`/find/${tvdbId}`, {
      external_source: 'tvdb_id',
    });
  }

  /**
   * Get popular TV shows
   */
  async getPopular(page: number = 1): Promise<TmdbTvSearchResponse> {
    return this.client.get<TmdbTvSearchResponse>('/tv/popular', { page });
  }

  /**
   * Get TV shows airing today
   */
  async getAiringToday(page: number = 1): Promise<TmdbTvSearchResponse> {
    return this.client.get<TmdbTvSearchResponse>('/tv/airing_today', { page });
  }

  /**
   * Get TV shows currently on the air
   */
  async getOnTheAir(page: number = 1): Promise<TmdbTvSearchResponse> {
    return this.client.get<TmdbTvSearchResponse>('/tv/on_the_air', { page });
  }

  /**
   * Get top rated TV shows
   */
  async getTopRated(page: number = 1): Promise<TmdbTvSearchResponse> {
    return this.client.get<TmdbTvSearchResponse>('/tv/top_rated', { page });
  }

  /**
   * Get TV genres list
   */
  async getGenres(): Promise<{ genres: TmdbGenre[] }> {
    return this.client.get<{ genres: TmdbGenre[] }>('/genre/tv/list');
  }

  /**
   * Extract YouTube trailer URL from videos
   */
  extractTrailerUrl(videos: TmdbVideos): string | null {
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
   * Get creators as comma-separated string
   */
  extractCreators(tvShow: TmdbTvShow): string {
    return tvShow.created_by.map((c) => c.name).join(', ');
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
  extractGenres(tvShow: TmdbTvShow): string {
    return tvShow.genres.map((g) => g.name).join(', ');
  }

  /**
   * Get networks as comma-separated string
   */
  extractNetworks(tvShow: TmdbTvShow): string {
    return tvShow.networks.map((n) => n.name).join(', ');
  }

  /**
   * Get content rating for a specific country
   */
  getContentRating(fullDetails: TmdbTvFullDetails, country: string = 'US'): string | null {
    const rating = fullDetails.content_ratings?.results?.find(
      (r) => r.iso_3166_1 === country
    );
    return rating?.rating || null;
  }
}

// Export singleton instance
export const tmdbTvService = new TmdbTvService();

