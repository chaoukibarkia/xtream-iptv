import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { isTmdbConfigured } from '../../config/tmdb.js';
import {
  tmdbMovieService,
  tmdbTvService,
  tmdbMetadataSync,
} from '../../services/tmdb/index.js';

// Validation schemas
const searchQuerySchema = z.object({
  query: z.string().min(1),
  year: z.string().optional(),
  page: z.string().optional(),
  language: z.string().optional(),
});

const detailsQuerySchema = z.object({
  language: z.string().optional(),
});

const linkTmdbSchema = z.object({
  tmdbId: z.number().int().positive(),
});

const syncOptionsSchema = z.object({
  type: z.enum(['movies', 'series', 'all']).optional(),
  forceRefresh: z.boolean().optional(),
});

export const tmdbRoutes: FastifyPluginAsync = async (fastify) => {
  // Check TMDB configuration before all routes
  fastify.addHook('preHandler', async (request, reply) => {
    if (!isTmdbConfigured()) {
      return reply.status(503).send({
        error: 'TMDB not configured',
        message: 'Please set TMDB_API_KEY environment variable',
      });
    }
  });

  // ==================== SEARCH ENDPOINTS ====================

  /**
   * Search TMDB for movies
   * GET /admin/tmdb/search/movie?query=...&year=...&page=...&language=...
   */
  fastify.get('/search/movie', async (request, reply) => {
    const query = searchQuerySchema.parse(request.query);

    const results = await tmdbMovieService.search(query.query, {
      year: query.year ? parseInt(query.year) : undefined,
      page: query.page ? parseInt(query.page) : 1,
      language: query.language,
    });

    return results;
  });

  /**
   * Search TMDB for TV shows
   * GET /admin/tmdb/search/tv?query=...&year=...&page=...&language=...
   */
  fastify.get('/search/tv', async (request, reply) => {
    const query = searchQuerySchema.parse(request.query);

    const results = await tmdbTvService.search(query.query, {
      year: query.year ? parseInt(query.year) : undefined,
      page: query.page ? parseInt(query.page) : 1,
      language: query.language,
    });

    return results;
  });

  // ==================== DETAILS ENDPOINTS ====================

  /**
   * Get movie details from TMDB
   * GET /admin/tmdb/movie/:tmdbId?language=...
   */
  fastify.get('/movie/:tmdbId', async (request, reply) => {
    const { tmdbId } = request.params as { tmdbId: string };
    const query = detailsQuerySchema.parse(request.query);
    const details = await tmdbMovieService.getFullDetails(parseInt(tmdbId), query.language);
    return details;
  });

  /**
   * Get TV show details from TMDB
   * GET /admin/tmdb/tv/:tmdbId?language=...
   */
  fastify.get('/tv/:tmdbId', async (request, reply) => {
    const { tmdbId } = request.params as { tmdbId: string };
    const query = detailsQuerySchema.parse(request.query);
    const details = await tmdbTvService.getFullDetails(parseInt(tmdbId), query.language);
    return details;
  });

  /**
   * Get TV season details from TMDB
   * GET /admin/tmdb/tv/:tmdbId/season/:seasonNumber
   */
  fastify.get('/tv/:tmdbId/season/:seasonNumber', async (request, reply) => {
    const { tmdbId, seasonNumber } = request.params as {
      tmdbId: string;
      seasonNumber: string;
    };
    const details = await tmdbTvService.getSeason(
      parseInt(tmdbId),
      parseInt(seasonNumber)
    );
    return details;
  });

  // ==================== LINKING ENDPOINTS ====================

  /**
   * Manually link a VOD stream to a TMDB movie
   * POST /admin/tmdb/link/movie/:streamId
   */
  fastify.post('/link/movie/:streamId', async (request, reply) => {
    const { streamId } = request.params as { streamId: string };
    const { tmdbId } = linkTmdbSchema.parse(request.body);

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(streamId) },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    if (stream.streamType !== 'VOD') {
      return reply.status(400).send({ error: 'Stream is not a VOD' });
    }

    try {
      const synced = await tmdbMetadataSync.linkMovieToTmdb(
        parseInt(streamId),
        tmdbId
      );

      if (!synced) {
        return reply.status(404).send({ error: 'TMDB movie not found' });
      }

      // Return updated stream
      const updated = await prisma.stream.findUnique({
        where: { id: parseInt(streamId) },
      });

      return {
        success: true,
        stream: updated,
      };
    } catch (error: any) {
      logger.error({ error, streamId, tmdbId }, 'Failed to link movie to TMDB');
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Manually link a series to a TMDB TV show
   * POST /admin/tmdb/link/series/:seriesId
   */
  fastify.post('/link/series/:seriesId', async (request, reply) => {
    const { seriesId } = request.params as { seriesId: string };
    const { tmdbId } = linkTmdbSchema.parse(request.body);

    const series = await prisma.series.findUnique({
      where: { id: parseInt(seriesId) },
    });

    if (!series) {
      return reply.status(404).send({ error: 'Series not found' });
    }

    try {
      const synced = await tmdbMetadataSync.linkSeriesToTmdb(
        parseInt(seriesId),
        tmdbId
      );

      if (!synced) {
        return reply.status(404).send({ error: 'TMDB TV show not found' });
      }

      // Return updated series with episodes
      const updated = await prisma.series.findUnique({
        where: { id: parseInt(seriesId) },
        include: {
          episodes: {
            orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
          },
        },
      });

      return {
        success: true,
        series: updated,
      };
    } catch (error: any) {
      logger.error({ error, seriesId, tmdbId }, 'Failed to link series to TMDB');
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Unlink a VOD from TMDB
   * DELETE /admin/tmdb/link/movie/:streamId
   */
  fastify.delete('/link/movie/:streamId', async (request, reply) => {
    const { streamId } = request.params as { streamId: string };

    await prisma.stream.update({
      where: { id: parseInt(streamId) },
      data: {
        tmdbId: null,
        plot: null,
        cast: null,
        director: null,
        backdropPath: null,
        youtubeTrailer: null,
      },
    });

    return { success: true };
  });

  /**
   * Unlink a series from TMDB
   * DELETE /admin/tmdb/link/series/:seriesId
   */
  fastify.delete('/link/series/:seriesId', async (request, reply) => {
    const { seriesId } = request.params as { seriesId: string };

    await prisma.series.update({
      where: { id: parseInt(seriesId) },
      data: {
        tmdbId: null,
        plot: null,
        cast: null,
        director: null,
        backdropPath: [],
        youtubeTrailer: null,
      },
    });

    return { success: true };
  });

  // ==================== SYNC ENDPOINTS ====================

  /**
   * Trigger sync for unmatched content
   * POST /admin/tmdb/sync
   */
  fastify.post('/sync', async (request, reply) => {
    const options = syncOptionsSchema.parse(request.body || {});
    const { type = 'all', forceRefresh = false } = options;

    const results: any = {};

    if (type === 'movies' || type === 'all') {
      results.movies = await tmdbMetadataSync.syncAllMovies({ forceRefresh });
    }

    if (type === 'series' || type === 'all') {
      results.series = await tmdbMetadataSync.syncAllSeries({ forceRefresh });
    }

    return results;
  });

  /**
   * Sync a single VOD by ID
   * POST /admin/tmdb/sync/movie/:streamId
   */
  fastify.post('/sync/movie/:streamId', async (request, reply) => {
    const { streamId } = request.params as { streamId: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(streamId) },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    try {
      const synced = await tmdbMetadataSync.syncMovie(
        parseInt(streamId),
        stream.name,
        stream.tmdbId
      );

      if (!synced) {
        return { success: false, message: 'No match found on TMDB' };
      }

      const updated = await prisma.stream.findUnique({
        where: { id: parseInt(streamId) },
      });

      return { success: true, stream: updated };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Sync a single series by ID
   * POST /admin/tmdb/sync/series/:seriesId
   */
  fastify.post('/sync/series/:seriesId', async (request, reply) => {
    const { seriesId } = request.params as { seriesId: string };

    const series = await prisma.series.findUnique({
      where: { id: parseInt(seriesId) },
    });

    if (!series) {
      return reply.status(404).send({ error: 'Series not found' });
    }

    try {
      const synced = await tmdbMetadataSync.syncSeries(
        parseInt(seriesId),
        series.name,
        series.tmdbId
      );

      if (!synced) {
        return { success: false, message: 'No match found on TMDB' };
      }

      const updated = await prisma.series.findUnique({
        where: { id: parseInt(seriesId) },
        include: {
          episodes: {
            orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
          },
        },
      });

      return { success: true, series: updated };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ==================== STATS & GENRES ====================

  /**
   * Get TMDB sync statistics
   * GET /admin/tmdb/stats
   */
  fastify.get('/stats', async () => {
    const [
      totalMovies,
      syncedMovies,
      totalSeries,
      syncedSeries,
    ] = await Promise.all([
      prisma.stream.count({ where: { streamType: 'VOD' } }),
      prisma.stream.count({ where: { streamType: 'VOD', tmdbId: { not: null } } }),
      prisma.series.count(),
      prisma.series.count({ where: { tmdbId: { not: null } } }),
    ]);

    return {
      movies: {
        total: totalMovies,
        synced: syncedMovies,
        pending: totalMovies - syncedMovies,
        percentage: totalMovies > 0 ? Math.round((syncedMovies / totalMovies) * 100) : 0,
      },
      series: {
        total: totalSeries,
        synced: syncedSeries,
        pending: totalSeries - syncedSeries,
        percentage: totalSeries > 0 ? Math.round((syncedSeries / totalSeries) * 100) : 0,
      },
    };
  });

  /**
   * Get movie genres from TMDB
   * GET /admin/tmdb/genres/movie
   */
  fastify.get('/genres/movie', async () => {
    return tmdbMovieService.getGenres();
  });

  /**
   * Get TV genres from TMDB
   * GET /admin/tmdb/genres/tv
   */
  fastify.get('/genres/tv', async () => {
    return tmdbTvService.getGenres();
  });

  // ==================== POPULAR/TRENDING ====================

  /**
   * Get popular movies from TMDB
   * GET /admin/tmdb/popular/movies
   */
  fastify.get('/popular/movies', async (request) => {
    const { page = '1' } = request.query as { page?: string };
    return tmdbMovieService.getPopular(parseInt(page));
  });

  /**
   * Get popular TV shows from TMDB
   * GET /admin/tmdb/popular/tv
   */
  fastify.get('/popular/tv', async (request) => {
    const { page = '1' } = request.query as { page?: string };
    return tmdbTvService.getPopular(parseInt(page));
  });
};

export default tmdbRoutes;

