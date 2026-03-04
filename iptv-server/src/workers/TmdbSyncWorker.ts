import { logger } from '../config/logger.js';
import { prisma } from '../config/database.js';
import { isTmdbConfigured } from '../config/tmdb.js';
import { tmdbMetadataSync } from '../services/tmdb/TmdbMetadataSync.js';
import { tmdbMovieService, tmdbTvService } from '../services/tmdb/index.js';

interface WorkerConfig {
  // Sync interval in milliseconds
  pendingSyncInterval: number;
  // Full refresh interval (weekly)
  fullRefreshInterval: number;
  // Enable/disable
  enabled: boolean;
}

const DEFAULT_CONFIG: WorkerConfig = {
  pendingSyncInterval: 60 * 60 * 1000, // 1 hour
  fullRefreshInterval: 7 * 24 * 60 * 60 * 1000, // 1 week
  enabled: true,
};

export class TmdbSyncWorker {
  private config: WorkerConfig;
  private pendingSyncTimer: NodeJS.Timeout | null = null;
  private fullRefreshTimer: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(config?: Partial<WorkerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the worker
   */
  start(): void {
    if (!isTmdbConfigured()) {
      logger.warn('TMDB worker not started: TMDB_API_KEY not configured');
      return;
    }

    if (!this.config.enabled) {
      logger.info('TMDB worker disabled');
      return;
    }

    if (this.isRunning) {
      logger.warn('TMDB worker already running');
      return;
    }

    this.isRunning = true;

    // Run initial sync after 30 seconds (let server start up)
    setTimeout(() => {
      this.syncPending().catch((err) =>
        logger.error({ err }, 'Initial TMDB sync failed')
      );
    }, 30000);

    // Schedule periodic sync for pending content
    this.pendingSyncTimer = setInterval(() => {
      this.syncPending().catch((err) =>
        logger.error({ err }, 'TMDB pending sync failed')
      );
    }, this.config.pendingSyncInterval);

    // Schedule weekly full refresh
    this.fullRefreshTimer = setInterval(() => {
      this.fullRefresh().catch((err) =>
        logger.error({ err }, 'TMDB full refresh failed')
      );
    }, this.config.fullRefreshInterval);

    logger.info(
      {
        pendingSyncInterval: `${this.config.pendingSyncInterval / 60000} minutes`,
        fullRefreshInterval: `${this.config.fullRefreshInterval / 86400000} days`,
      },
      'TMDB sync worker started'
    );
  }

  /**
   * Stop the worker
   */
  stop(): void {
    if (this.pendingSyncTimer) {
      clearInterval(this.pendingSyncTimer);
      this.pendingSyncTimer = null;
    }

    if (this.fullRefreshTimer) {
      clearInterval(this.fullRefreshTimer);
      this.fullRefreshTimer = null;
    }

    this.isRunning = false;
    logger.info('TMDB sync worker stopped');
  }

  /**
   * Sync content that hasn't been matched yet
   */
  async syncPending(): Promise<void> {
    logger.info('Starting TMDB pending sync...');

    const startTime = Date.now();

    try {
      // Sync unmatched movies
      const movieResult = await tmdbMetadataSync.syncAllMovies({
        forceRefresh: false,
        batchSize: 50,
      });

      // Sync unmatched series
      const seriesResult = await tmdbMetadataSync.syncAllSeries({
        forceRefresh: false,
        batchSize: 20,
      });

      const duration = Date.now() - startTime;

      logger.info(
        {
          movies: {
            synced: movieResult.synced,
            notFound: movieResult.notFound,
            failed: movieResult.failed,
          },
          series: {
            synced: seriesResult.synced,
            notFound: seriesResult.notFound,
            failed: seriesResult.failed,
          },
          durationMs: duration,
        },
        'TMDB pending sync completed'
      );
    } catch (error) {
      logger.error({ error }, 'TMDB pending sync failed');
      throw error;
    }
  }

  /**
   * Full refresh of all content
   */
  async fullRefresh(): Promise<void> {
    logger.info('Starting TMDB full refresh...');

    const startTime = Date.now();

    try {
      // Refresh all movies
      const movieResult = await tmdbMetadataSync.syncAllMovies({
        forceRefresh: true,
        batchSize: 100,
      });

      // Refresh all series
      const seriesResult = await tmdbMetadataSync.syncAllSeries({
        forceRefresh: true,
        batchSize: 30,
      });

      const duration = Date.now() - startTime;

      logger.info(
        {
          movies: {
            synced: movieResult.synced,
            failed: movieResult.failed,
          },
          series: {
            synced: seriesResult.synced,
            failed: seriesResult.failed,
          },
          durationMs: duration,
        },
        'TMDB full refresh completed'
      );
    } catch (error) {
      logger.error({ error }, 'TMDB full refresh failed');
      throw error;
    }
  }

  /**
   * Refresh content that hasn't been updated in N days
   */
  async refreshOutdated(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    logger.info({ daysOld }, 'Refreshing outdated TMDB data...');

    try {
      // Find outdated movies with TMDB IDs
      const outdatedMovies = await prisma.stream.findMany({
        where: {
          streamType: 'VOD',
          tmdbId: { not: null },
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true, name: true, tmdbId: true },
        take: 100,
      });

      let refreshedMovies = 0;
      for (const movie of outdatedMovies) {
        try {
          await tmdbMetadataSync.syncMovie(movie.id, movie.name, movie.tmdbId);
          refreshedMovies++;
        } catch (error) {
          logger.warn({ error, movieId: movie.id }, 'Failed to refresh movie');
        }
      }

      // Find outdated series with TMDB IDs
      const outdatedSeries = await prisma.series.findMany({
        where: {
          tmdbId: { not: null },
          updatedAt: { lt: cutoffDate },
        },
        select: { id: true, name: true, tmdbId: true },
        take: 50,
      });

      let refreshedSeries = 0;
      for (const series of outdatedSeries) {
        try {
          await tmdbMetadataSync.syncSeries(series.id, series.name, series.tmdbId);
          refreshedSeries++;
        } catch (error) {
          logger.warn({ error, seriesId: series.id }, 'Failed to refresh series');
        }
      }

      logger.info(
        {
          refreshedMovies,
          refreshedSeries,
          totalMovies: outdatedMovies.length,
          totalSeries: outdatedSeries.length,
        },
        'Outdated refresh completed'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to refresh outdated content');
    }
  }

  /**
   * Get worker status
   */
  getStatus(): {
    running: boolean;
    config: WorkerConfig;
    tmdbConfigured: boolean;
  } {
    return {
      running: this.isRunning,
      config: this.config,
      tmdbConfigured: isTmdbConfigured(),
    };
  }
}

// Export singleton instance
export const tmdbSyncWorker = new TmdbSyncWorker();

