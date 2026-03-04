import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { TmdbMovieService, tmdbMovieService } from './TmdbMovieService.js';
import { TmdbTvService, tmdbTvService } from './TmdbTvService.js';
import { TmdbClient, tmdbClient } from './TmdbClient.js';
import { tmdbConfig, buildImageUrl } from '../../config/tmdb.js';
import { TmdbMovieFullDetails, TmdbTvFullDetails, TmdbSeason } from './types.js';
import { StreamType } from '@prisma/client';

export interface SyncOptions {
  forceRefresh?: boolean;
  maxResults?: number;
  batchSize?: number;
}

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  notFound: number;
  errors: Array<{ id: number; name: string; error: string }>;
}

export class TmdbMetadataSync {
  private movieService: TmdbMovieService;
  private tvService: TmdbTvService;
  private client: TmdbClient;

  constructor() {
    this.movieService = tmdbMovieService;
    this.tvService = tmdbTvService;
    this.client = tmdbClient;
  }

  /**
   * Sync all VOD movies with TMDB
   */
  async syncAllMovies(options: SyncOptions = {}): Promise<SyncResult> {
    const { forceRefresh = false, batchSize = 50 } = options;

    const movies = await prisma.stream.findMany({
      where: {
        streamType: StreamType.VOD,
        ...(forceRefresh ? {} : { tmdbId: null }),
      },
      select: { id: true, name: true, tmdbId: true },
    });

    const result: SyncResult = {
      total: movies.length,
      synced: 0,
      failed: 0,
      notFound: 0,
      errors: [],
    };

    logger.info({ total: movies.length, forceRefresh }, 'Starting TMDB movie sync');

    // Process in batches
    for (let i = 0; i < movies.length; i += batchSize) {
      const batch = movies.slice(i, i + batchSize);

      for (const movie of batch) {
        try {
          const synced = await this.syncMovie(movie.id, movie.name, movie.tmdbId);
          if (synced) {
            result.synced++;
          } else {
            result.notFound++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({
            id: movie.id,
            name: movie.name,
            error: error.message,
          });
          logger.error({ error, movieId: movie.id }, 'Failed to sync movie');
        }
      }

      logger.info(
        { progress: Math.min(i + batchSize, movies.length), total: movies.length },
        'TMDB sync progress'
      );
    }

    logger.info(result, 'TMDB movie sync completed');
    return result;
  }

  /**
   * Sync a single movie with TMDB
   */
  async syncMovie(
    streamId: number,
    title: string,
    existingTmdbId?: number | null
  ): Promise<boolean> {
    let tmdbId = existingTmdbId;

    // Find TMDB ID if not set
    if (!tmdbId) {
      tmdbId = await this.findMovieTmdbId(title);
      if (!tmdbId) {
        logger.debug({ streamId, title }, 'Movie not found on TMDB');
        return false;
      }
    }

    // Fetch full details
    const details = await this.movieService.getFullDetails(tmdbId);

    // Extract additional data
    const trailerUrl = this.movieService.extractTrailerUrl(details.videos);
    const director = this.movieService.extractDirector(details.credits);
    const cast = this.movieService.extractMainCast(details.credits, 15);
    const genres = this.movieService.extractGenres(details);

    // Update database
    await prisma.stream.update({
      where: { id: streamId },
      data: {
        tmdbId: details.id,
        plot: details.overview,
        cast,
        director,
        genre: genres,
        rating: details.vote_average,
        releaseDate: details.release_date ? new Date(details.release_date) : null,
        duration: details.runtime ? details.runtime * 60 : null, // Convert to seconds
        logoUrl: buildImageUrl(details.poster_path, tmdbConfig.defaultSizes.poster),
        backdropPath: buildImageUrl(details.backdrop_path, tmdbConfig.defaultSizes.backdrop),
        youtubeTrailer: trailerUrl,
      },
    });

    logger.debug({ streamId, tmdbId, title: details.title }, 'Movie synced with TMDB');
    return true;
  }

  /**
   * Sync all series with TMDB
   */
  async syncAllSeries(options: SyncOptions = {}): Promise<SyncResult> {
    const { forceRefresh = false, batchSize = 20 } = options;

    const seriesList = await prisma.series.findMany({
      where: forceRefresh ? {} : { tmdbId: null },
      select: { id: true, name: true, tmdbId: true },
    });

    const result: SyncResult = {
      total: seriesList.length,
      synced: 0,
      failed: 0,
      notFound: 0,
      errors: [],
    };

    logger.info({ total: seriesList.length, forceRefresh }, 'Starting TMDB series sync');

    for (let i = 0; i < seriesList.length; i += batchSize) {
      const batch = seriesList.slice(i, i + batchSize);

      for (const series of batch) {
        try {
          const synced = await this.syncSeries(series.id, series.name, series.tmdbId);
          if (synced) {
            result.synced++;
          } else {
            result.notFound++;
          }
        } catch (error: any) {
          result.failed++;
          result.errors.push({
            id: series.id,
            name: series.name,
            error: error.message,
          });
          logger.error({ error, seriesId: series.id }, 'Failed to sync series');
        }
      }

      logger.info(
        { progress: Math.min(i + batchSize, seriesList.length), total: seriesList.length },
        'TMDB series sync progress'
      );
    }

    logger.info(result, 'TMDB series sync completed');
    return result;
  }

  /**
   * Sync a single series with TMDB (including seasons and episodes metadata)
   */
  async syncSeries(
    seriesId: number,
    title: string,
    existingTmdbId?: number | null
  ): Promise<boolean> {
    let tmdbId = existingTmdbId;

    // Find TMDB ID if not set
    if (!tmdbId) {
      tmdbId = await this.findSeriesTmdbId(title);
      if (!tmdbId) {
        logger.debug({ seriesId, title }, 'Series not found on TMDB');
        return false;
      }
    }

    // Fetch full details
    const details = await this.tvService.getFullDetails(tmdbId);

    // Extract additional data
    const trailerUrl = this.tvService.extractTrailerUrl(details.videos);
    const cast = this.tvService.extractMainCast(details.credits, 15);
    const genres = this.tvService.extractGenres(details);
    const creators = this.tvService.extractCreators(details);

    // Update series in database
    await prisma.series.update({
      where: { id: seriesId },
      data: {
        tmdbId: details.id,
        plot: details.overview,
        cast,
        director: creators, // Use creators as "director" for series
        genre: genres,
        rating: details.vote_average,
        rating5: details.vote_average / 2,
        releaseDate: details.first_air_date ? new Date(details.first_air_date) : null,
        cover: buildImageUrl(details.poster_path, tmdbConfig.defaultSizes.poster),
        backdropPath: details.backdrop_path
          ? [buildImageUrl(details.backdrop_path, tmdbConfig.defaultSizes.backdrop)!]
          : [],
        youtubeTrailer: trailerUrl,
        episodeRunTime: details.episode_run_time?.[0]?.toString() || null,
        lastModified: new Date(),
      },
    });

    // Sync episode metadata for existing episodes
    await this.syncSeriesEpisodes(seriesId, tmdbId, details.seasons);

    logger.debug({ seriesId, tmdbId, title: details.name }, 'Series synced with TMDB');
    return true;
  }

  /**
   * Sync episode metadata from TMDB
   */
  private async syncSeriesEpisodes(
    seriesId: number,
    tmdbId: number,
    seasons: TmdbTvFullDetails['seasons']
  ): Promise<void> {
    // Get existing episodes for this series
    const existingEpisodes = await prisma.episode.findMany({
      where: { seriesId },
      select: { id: true, seasonNumber: true, episodeNumber: true },
    });

    if (existingEpisodes.length === 0) {
      return; // No episodes to sync
    }

    // Group by season
    const episodesBySeason = new Map<number, typeof existingEpisodes>();
    for (const ep of existingEpisodes) {
      const list = episodesBySeason.get(ep.seasonNumber) || [];
      list.push(ep);
      episodesBySeason.set(ep.seasonNumber, list);
    }

    // Sync each season that has episodes
    for (const [seasonNumber, episodes] of episodesBySeason) {
      try {
        const seasonDetails = await this.tvService.getSeason(tmdbId, seasonNumber);

        for (const episode of episodes) {
          const tmdbEpisode = seasonDetails.episodes.find(
            (e) => e.episode_number === episode.episodeNumber
          );

          if (tmdbEpisode) {
            await prisma.episode.update({
              where: { id: episode.id },
              data: {
                title: tmdbEpisode.name,
                plot: tmdbEpisode.overview,
                duration: tmdbEpisode.runtime ? tmdbEpisode.runtime * 60 : null,
                releaseDate: tmdbEpisode.air_date
                  ? new Date(tmdbEpisode.air_date)
                  : null,
                rating: tmdbEpisode.vote_average,
                cover: buildImageUrl(tmdbEpisode.still_path, tmdbConfig.defaultSizes.still),
              },
            });
          }
        }
      } catch (error) {
        logger.warn(
          { error, tmdbId, seasonNumber },
          'Failed to sync season episodes'
        );
      }
    }
  }

  /**
   * Find movie TMDB ID by title
   */
  private async findMovieTmdbId(title: string): Promise<number | null> {
    // Parse year from title if present (e.g., "Movie Name (2023)")
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
    const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, '').trim();

    // Search by title
    const searchResult = await this.movieService.search(cleanTitle, { year });

    if (searchResult.results.length === 0) {
      // Try without year
      if (year) {
        const retryResult = await this.movieService.search(cleanTitle);
        if (retryResult.results.length > 0) {
          return this.findBestTitleMatch(retryResult.results, cleanTitle);
        }
      }
      return null;
    }

    return this.findBestTitleMatch(searchResult.results, cleanTitle);
  }

  /**
   * Find series TMDB ID by title
   */
  private async findSeriesTmdbId(title: string): Promise<number | null> {
    // Parse year from title
    const yearMatch = title.match(/\((\d{4})\)/);
    const year = yearMatch ? parseInt(yearMatch[1]) : undefined;
    const cleanTitle = title.replace(/\s*\(\d{4}\)\s*$/, '').trim();

    // Search by title
    const searchResult = await this.tvService.search(cleanTitle, { year });

    if (searchResult.results.length === 0) {
      // Try without year
      if (year) {
        const retryResult = await this.tvService.search(cleanTitle);
        if (retryResult.results.length > 0) {
          return this.findBestTvTitleMatch(retryResult.results, cleanTitle);
        }
      }
      return null;
    }

    return this.findBestTvTitleMatch(searchResult.results, cleanTitle);
  }

  /**
   * Find best matching movie from search results
   */
  private findBestTitleMatch(
    results: Array<{ id: number; title: string; original_title: string; popularity: number }>,
    searchTitle: string
  ): number {
    const normalizedSearch = this.normalizeTitle(searchTitle);

    // Try exact match first
    const exactMatch = results.find((r) => {
      const matchTitle = this.normalizeTitle(r.title);
      const matchOriginal = this.normalizeTitle(r.original_title);
      return matchTitle === normalizedSearch || matchOriginal === normalizedSearch;
    });

    if (exactMatch) {
      return exactMatch.id;
    }

    // Fall back to first result (most popular)
    return results[0].id;
  }

  /**
   * Find best matching TV show from search results
   */
  private findBestTvTitleMatch(
    results: Array<{ id: number; name: string; original_name: string; popularity: number }>,
    searchTitle: string
  ): number {
    const normalizedSearch = this.normalizeTitle(searchTitle);

    // Try exact match first
    const exactMatch = results.find((r) => {
      const matchTitle = this.normalizeTitle(r.name);
      const matchOriginal = this.normalizeTitle(r.original_name);
      return matchTitle === normalizedSearch || matchOriginal === normalizedSearch;
    });

    if (exactMatch) {
      return exactMatch.id;
    }

    // Fall back to first result (most popular)
    return results[0].id;
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
   * Manually link a VOD to a specific TMDB ID
   */
  async linkMovieToTmdb(streamId: number, tmdbId: number): Promise<boolean> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) {
      throw new Error('Stream not found');
    }

    return this.syncMovie(streamId, stream.name, tmdbId);
  }

  /**
   * Manually link a series to a specific TMDB ID
   */
  async linkSeriesToTmdb(seriesId: number, tmdbId: number): Promise<boolean> {
    const series = await prisma.series.findUnique({
      where: { id: seriesId },
    });

    if (!series) {
      throw new Error('Series not found');
    }

    return this.syncSeries(seriesId, series.name, tmdbId);
  }
}

// Export singleton instance
export const tmdbMetadataSync = new TmdbMetadataSync();

