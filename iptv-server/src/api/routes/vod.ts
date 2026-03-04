import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import { z } from 'zod';
import { tmdbMovieService } from '../../services/tmdb/TmdbMovieService.js';
import { vodToHlsService } from '../../services/streaming/VodToHls.js';
import { mediaProbeService } from '../../services/streaming/MediaProbe.js';
import { vodViewerManager } from '../../services/streaming/VodViewerManager.js';
import { verifyToken } from './auth.js';

// Timing-safe string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    return a === a;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Validation schemas
const createVodSchemaBase = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().optional(), // Kept for backward compatibility, but prefer categoryIds
  categoryIds: z.array(z.number().int()).min(1).optional(), // New multi-category support
  sourceUrl: z.string().min(1),
  year: z.number().int().optional(),
  rating: z.number().optional(),
  runtime: z.number().int().optional(),
  posterUrl: z.string().url().optional().or(z.literal('')),
  backdropUrl: z.string().url().optional().or(z.literal('')),
  overview: z.string().optional(),
  tmdbId: z.number().int().optional(),
  isActive: z.boolean().default(true),
  // Additional TMDB fields
  genres: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  youtubeTrailer: z.string().optional(),
});

const createVodSchema = createVodSchemaBase.refine((data) => data.categoryId || (data.categoryIds && data.categoryIds.length > 0), {
  message: "Either categoryId or categoryIds must be provided",
  path: ["categoryIds"],
});

const updateVodSchema = createVodSchemaBase.partial();

const createSubtitleSchema = z.object({
  language: z.string().min(2).max(10),
  languageLabel: z.string().optional(),
  format: z.enum(['srt', 'vtt', 'ass']).default('srt'),
  isDefault: z.boolean().default(false),
  isForced: z.boolean().default(false),
  sourceUrl: z.string().url().optional(),
  content: z.string().optional(),
});

const updateSubtitleSchema = createSubtitleSchema.partial();

export const vodRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication for admin access - supports both JWT Bearer token and X-API-Key
  fastify.addHook('preHandler', async (request, reply) => {
    // Try X-API-Key first (for API client compatibility)
    const apiKey = request.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string') {
      // Validate API key using timing-safe comparison
      if (secureCompare(apiKey, config.admin.apiKey)) {
        // API key is valid, allow access
        // For API key auth, we don't need to set user (admin routes work without it)
        return;
      } else {
        logger.warn({ ip: request.ip }, 'VOD API request with invalid API key');
        return reply.status(401).send({ error: 'Invalid API key' });
      }
    }

    // Fall back to JWT Bearer token authentication
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Authorization token or API key required' });
    }

    const token = authHeader.substring(7);
    const tokenData = await verifyToken(token);
    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    // Get user details and verify admin role
    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: { id: true, username: true, role: true }
    });

    if (!user || user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Admin access required' });
    }

    (request as any).user = user;
  });

  // ==================== VOD MANAGEMENT ====================

  // List all VOD items with pagination and search
  fastify.get('/', async (request, reply) => {
    const { page = '1', pageSize = '50', categoryId, search, synced } = request.query as {
      page?: string;
      pageSize?: string;
      categoryId?: string;
      search?: string;
      synced?: string;
    };

    const pageNum = parseInt(page.toString());
    const pageSizeNum = parseInt(pageSize.toString());
    const categoryIdNum = categoryId ? parseInt(categoryId.toString()) : undefined;

    const where: any = {
      streamType: 'VOD',
    };

    if (categoryIdNum) {
      where.categoryId = categoryIdNum;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    if (synced !== undefined) {
      const isSynced = synced === 'true';
      if (isSynced) {
        where.tmdbId = { not: null };
      } else {
        where.tmdbId = null;
      }
    }

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({
        where,
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
        orderBy: [{ name: 'asc' }],
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      }),
      prisma.stream.count({ where }),
    ]);

    // Get viewer counts for all streams
    const streamIds = streams.map(s => s.id);
    const viewerCounts = await vodViewerManager.getViewerCounts(streamIds);

    // Transform to VOD format expected by frontend
    const vodItems = streams.map(stream => {
      // Get primary category for backward compatibility
      const primaryCategory = stream.categories.find(c => c.isPrimary)?.category || stream.categories[0]?.category || null;
      
      return {
        id: stream.id,
        name: stream.name,
        year: stream.releaseDate ? new Date(stream.releaseDate).getFullYear() : null,
        rating: stream.rating,
        runtime: stream.duration,
        posterUrl: stream.logoUrl,
        backdropUrl: stream.backdropPath,
        overview: stream.plot,
        genres: stream.genre,
        cast: stream.cast,
        director: stream.director,
        youtubeTrailer: stream.youtubeTrailer,
        tmdbId: stream.tmdbId,
        tmdbSynced: stream.tmdbId !== null,
        viewerCount: viewerCounts.get(stream.id) || 0,
      stream: {
        id: stream.id,
        sourceUrl: stream.sourceUrl,
        categoryId: stream.categoryId,
        isActive: stream.isActive,
      },
      category: primaryCategory,
      categories: stream.categories.map((sc: any) => ({
        id: sc.category.id,
        name: sc.category.name,
        isPrimary: sc.isPrimary,
      })),
        createdAt: stream.createdAt,
        updatedAt: stream.updatedAt,
      };
    });

    return {
      data: vodItems,
      pagination: {
        page: pageNum,
        pageSize: pageSizeNum,
        total,
        pages: Math.ceil(total / pageSizeNum),
      },
    };
  });

  // Get VOD stats
  fastify.get('/stats', async () => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const [total, synced, recentlyAdded] = await Promise.all([
      prisma.stream.count({ where: { streamType: 'VOD' } }),
      prisma.stream.count({ where: { streamType: 'VOD', tmdbId: { not: null } } }),
      prisma.stream.count({ 
        where: { 
          streamType: 'VOD',
          createdAt: { gte: oneWeekAgo },
        },
      }),
    ]);

    return {
      total,
      synced,
      pending: total - synced,
      recentlyAdded,
    };
  });

  // Get single VOD by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id), streamType: 'VOD' },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        subtitles: {
          orderBy: [{ isDefault: 'desc' }, { language: 'asc' }],
        },
      },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    // Get viewer count for this VOD
    const viewerCount = await vodViewerManager.getViewerCount(parseInt(id));

    // Get primary category for backward compatibility
    const primaryCategory = stream.categories.find(c => c.isPrimary)?.category || stream.categories[0]?.category || null;

    return {
      id: stream.id,
      name: stream.name,
      year: stream.releaseDate ? new Date(stream.releaseDate).getFullYear() : null,
      rating: stream.rating,
      runtime: stream.duration,
      posterUrl: stream.logoUrl,
      backdropUrl: stream.backdropPath,
      overview: stream.plot,
      tmdbId: stream.tmdbId,
      tmdbSynced: stream.tmdbId !== null,
      genres: stream.genre,
      cast: stream.cast,
      director: stream.director,
      youtubeTrailer: stream.youtubeTrailer,
      containerExtension: stream.containerExtension,
      viewerCount,
      stream: {
        id: stream.id,
        sourceUrl: stream.sourceUrl,
        categoryId: stream.categoryId,
        isActive: stream.isActive,
      },
      category: primaryCategory,
      categories: stream.categories.map((sc: any) => ({
        id: sc.category.id,
        name: sc.category.name,
        isPrimary: sc.isPrimary,
      })),
      subtitles: stream.subtitles,
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt,
    };
  });

  // Create new VOD
  fastify.post('/', async (request, reply) => {
    const data = createVodSchema.parse(request.body);

    // Determine categoryIds array (support both old single categoryId and new categoryIds array)
    const categoryIds = data.categoryIds || (data.categoryId ? [data.categoryId] : []);
    const primaryCategoryId = categoryIds[0]; // First category is the primary

    const stream = await prisma.stream.create({
      data: {
        name: data.name,
        streamType: 'VOD',
        categoryId: primaryCategoryId, // Keep for backward compatibility
        sourceUrl: data.sourceUrl,
        logoUrl: data.posterUrl || null,
        plot: data.overview || null,
        cast: data.cast || null,
        director: data.director || null,
        genre: data.genres || null,
        rating: data.rating || null,
        duration: data.runtime || null,
        releaseDate: data.year ? new Date(data.year, 0, 1) : null,
        tmdbId: data.tmdbId || null,
        isActive: data.isActive,
        containerExtension: 'mp4',
        categories: {
          create: categoryIds.map((catId: number, index: number) => ({
            categoryId: catId,
            isPrimary: index === 0, // First category is primary
          })),
        },
      },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    logger.info({ streamId: stream.id, name: stream.name, categories: categoryIds }, 'Created new VOD');

    // Get primary category for backward compatibility
    const primaryCategory = stream.categories.find(c => c.isPrimary)?.category || stream.categories[0]?.category || null;

    return reply.status(201).send({
      id: stream.id,
      name: stream.name,
      year: data.year,
      rating: stream.rating,
      runtime: stream.duration,
      posterUrl: stream.logoUrl,
      tmdbId: stream.tmdbId,
      tmdbSynced: stream.tmdbId !== null,
      stream: {
        id: stream.id,
        sourceUrl: stream.sourceUrl,
        categoryId: stream.categoryId,
        isActive: stream.isActive,
      },
      category: primaryCategory,
      categories: stream.categories.map((sc: any) => ({
        id: sc.category.id,
        name: sc.category.name,
        isPrimary: sc.isPrimary,
      })),
    });
  });

  // Update VOD
  fastify.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateVodSchema.parse(request.body);

    const existingStream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingStream || existingStream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.sourceUrl !== undefined) updateData.sourceUrl = data.sourceUrl;
    if (data.posterUrl !== undefined) updateData.logoUrl = data.posterUrl || null;
    if (data.backdropUrl !== undefined) updateData.backdropPath = data.backdropUrl || null;
    if (data.overview !== undefined) updateData.plot = data.overview;
    if (data.genres !== undefined) updateData.genre = data.genres;
    if (data.cast !== undefined) updateData.cast = data.cast;
    if (data.director !== undefined) updateData.director = data.director;
    if (data.rating !== undefined) updateData.rating = data.rating;
    if (data.runtime !== undefined) updateData.duration = data.runtime;
    if (data.year !== undefined) updateData.releaseDate = data.year ? new Date(data.year, 0, 1) : null;
    if (data.tmdbId !== undefined) updateData.tmdbId = data.tmdbId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.youtubeTrailer !== undefined) updateData.youtubeTrailer = data.youtubeTrailer || null;

    // Handle category updates
    const categoryIds = data.categoryIds || (data.categoryId ? [data.categoryId] : null);
    
    if (categoryIds) {
      const primaryCategoryId = categoryIds[0];
      updateData.categoryId = primaryCategoryId; // Update backward-compatible field

      // Use transaction to update both stream and categories
      const stream = await prisma.$transaction(async (tx) => {
        // Delete existing category associations
        await tx.streamCategory.deleteMany({
          where: { streamId: parseInt(id) },
        });

        // Create new category associations
        await tx.streamCategory.createMany({
          data: categoryIds.map((catId: number, index: number) => ({
            streamId: parseInt(id),
            categoryId: catId,
            isPrimary: index === 0,
          })),
        });

        // Update the stream
        return await tx.stream.update({
          where: { id: parseInt(id) },
          data: updateData,
          include: {
            categories: {
              include: {
                category: { select: { id: true, name: true } },
              },
            },
          },
        });
      });

      await cache.del(cache.KEYS.STREAM(parseInt(id)));

      logger.info({ streamId: stream.id, name: stream.name, categories: categoryIds }, 'Updated VOD');

      // Get primary category for backward compatibility
      const primaryCategory = stream.categories.find(c => c.isPrimary)?.category || stream.categories[0]?.category || null;

      return {
        id: stream.id,
        name: stream.name,
        year: stream.releaseDate ? new Date(stream.releaseDate).getFullYear() : null,
        rating: stream.rating,
        runtime: stream.duration,
        posterUrl: stream.logoUrl,
        tmdbId: stream.tmdbId,
        tmdbSynced: stream.tmdbId !== null,
        stream: {
          id: stream.id,
          sourceUrl: stream.sourceUrl,
          categoryId: stream.categoryId,
          isActive: stream.isActive,
        },
        category: primaryCategory,
        categories: stream.categories.map((sc: any) => ({
          id: sc.category.id,
          name: sc.category.name,
          isPrimary: sc.isPrimary,
        })),
      };
    } else {
      // No category change, just update stream fields
      const stream = await prisma.stream.update({
        where: { id: parseInt(id) },
        data: updateData,
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });

      await cache.del(cache.KEYS.STREAM(parseInt(id)));

      logger.info({ streamId: stream.id, name: stream.name }, 'Updated VOD');

      // Get primary category for backward compatibility
      const primaryCategory = stream.categories.find(c => c.isPrimary)?.category || stream.categories[0]?.category || null;

      return {
        id: stream.id,
        name: stream.name,
        year: stream.releaseDate ? new Date(stream.releaseDate).getFullYear() : null,
        rating: stream.rating,
        runtime: stream.duration,
        posterUrl: stream.logoUrl,
        tmdbId: stream.tmdbId,
        tmdbSynced: stream.tmdbId !== null,
        stream: {
          id: stream.id,
          sourceUrl: stream.sourceUrl,
          categoryId: stream.categoryId,
          isActive: stream.isActive,
        },
        category: primaryCategory,
        categories: stream.categories.map((sc: any) => ({
          id: sc.category.id,
          name: sc.category.name,
          isPrimary: sc.isPrimary,
        })),
      };
    }
  });

  // Delete VOD
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!stream || stream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    await prisma.stream.delete({
      where: { id: parseInt(id) },
    });

    await cache.del(cache.KEYS.STREAM(parseInt(id)));

    logger.info({ streamId: parseInt(id) }, 'Deleted VOD');

    return { success: true };
  });

  // ==================== TMDB SYNC ====================

  // Sync single VOD with TMDB
  fastify.post('/:id/tmdb-sync', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!stream || stream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    try {
      // If already has TMDB ID, use it directly
      if (stream.tmdbId) {
        const movieDetails = await tmdbMovieService.getFullDetails(stream.tmdbId);
        
        if (movieDetails) {
          const director = tmdbMovieService.extractDirector(movieDetails.credits);
          const cast = tmdbMovieService.extractMainCast(movieDetails.credits);
          const genres = tmdbMovieService.extractGenres(movieDetails);
          
          await prisma.stream.update({
            where: { id: parseInt(id) },
            data: {
              plot: movieDetails.overview || stream.plot,
              logoUrl: movieDetails.poster_path 
                ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
                : stream.logoUrl,
              rating: movieDetails.vote_average || stream.rating,
              duration: movieDetails.runtime || stream.duration,
              genre: genres || stream.genre,
              cast: cast || stream.cast,
              director: director || stream.director,
              releaseDate: movieDetails.release_date 
                ? new Date(movieDetails.release_date) 
                : stream.releaseDate,
            },
          });

          return { success: true, message: 'VOD synced with TMDB' };
        }
      }

      // Search TMDB by name
      const searchResponse = await tmdbMovieService.search(stream.name);
      
      if (searchResponse && searchResponse.results && searchResponse.results.length > 0) {
        const bestMatch = searchResponse.results[0];
        const movieDetails = await tmdbMovieService.getFullDetails(bestMatch.id);

        if (movieDetails) {
          const director = tmdbMovieService.extractDirector(movieDetails.credits);
          const cast = tmdbMovieService.extractMainCast(movieDetails.credits);
          const genres = tmdbMovieService.extractGenres(movieDetails);
          
          await prisma.stream.update({
            where: { id: parseInt(id) },
            data: {
              tmdbId: movieDetails.id,
              plot: movieDetails.overview || stream.plot,
              logoUrl: movieDetails.poster_path 
                ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
                : stream.logoUrl,
              rating: movieDetails.vote_average || stream.rating,
              duration: movieDetails.runtime || stream.duration,
              genre: genres || stream.genre,
              cast: cast || stream.cast,
              director: director || stream.director,
              releaseDate: movieDetails.release_date 
                ? new Date(movieDetails.release_date) 
                : stream.releaseDate,
            },
          });

          return { success: true, message: 'VOD synced with TMDB', tmdbId: movieDetails.id };
        }
      }

      return reply.status(404).send({ error: 'No TMDB match found' });
    } catch (error: any) {
      logger.error({ error, streamId: parseInt(id) }, 'TMDB sync failed');
      return reply.status(500).send({ error: error.message || 'TMDB sync failed' });
    }
  });

  // Link VOD to specific TMDB ID
  fastify.post('/:id/tmdb-link', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { tmdbId } = request.body as { tmdbId: number };

    if (!tmdbId) {
      return reply.status(400).send({ error: 'tmdbId required' });
    }

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!stream || stream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    try {
      const movieDetails = await tmdbMovieService.getFullDetails(tmdbId);

      if (!movieDetails) {
        return reply.status(404).send({ error: 'TMDB movie not found' });
      }

      const director = tmdbMovieService.extractDirector(movieDetails.credits);
      const cast = tmdbMovieService.extractMainCast(movieDetails.credits);
      const genres = tmdbMovieService.extractGenres(movieDetails);

      await prisma.stream.update({
        where: { id: parseInt(id) },
        data: {
          tmdbId: movieDetails.id,
          plot: movieDetails.overview || stream.plot,
          logoUrl: movieDetails.poster_path 
            ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
            : stream.logoUrl,
          rating: movieDetails.vote_average || stream.rating,
          duration: movieDetails.runtime || stream.duration,
          genre: genres || stream.genre,
          cast: cast || stream.cast,
          director: director || stream.director,
          releaseDate: movieDetails.release_date 
            ? new Date(movieDetails.release_date) 
            : stream.releaseDate,
        },
      });

      return { success: true, message: 'VOD linked to TMDB', tmdbId };
    } catch (error: any) {
      logger.error({ error, streamId: parseInt(id), tmdbId }, 'TMDB link failed');
      return reply.status(500).send({ error: error.message || 'TMDB link failed' });
    }
  });

  // Bulk sync all unsynced VODs
  fastify.post('/bulk-tmdb-sync', async (request, reply) => {
    const unsyncedStreams = await prisma.stream.findMany({
      where: {
        streamType: 'VOD',
        tmdbId: null,
      },
      take: 100, // Limit to avoid overloading TMDB API
    });

    let synced = 0;
    let failed = 0;

    for (const stream of unsyncedStreams) {
      try {
        const searchResponse = await tmdbMovieService.search(stream.name);
        
        if (searchResponse && searchResponse.results && searchResponse.results.length > 0) {
          const bestMatch = searchResponse.results[0];
          const movieDetails = await tmdbMovieService.getFullDetails(bestMatch.id);

          if (movieDetails) {
            const director = tmdbMovieService.extractDirector(movieDetails.credits);
            const cast = tmdbMovieService.extractMainCast(movieDetails.credits);
            const genres = tmdbMovieService.extractGenres(movieDetails);

            await prisma.stream.update({
              where: { id: stream.id },
              data: {
                tmdbId: movieDetails.id,
                plot: movieDetails.overview || stream.plot,
                logoUrl: movieDetails.poster_path 
                  ? `https://image.tmdb.org/t/p/w500${movieDetails.poster_path}`
                  : stream.logoUrl,
                rating: movieDetails.vote_average || stream.rating,
                duration: movieDetails.runtime || stream.duration,
                genre: genres || stream.genre,
                cast: cast || stream.cast,
                director: director || stream.director,
                releaseDate: movieDetails.release_date 
                  ? new Date(movieDetails.release_date) 
                  : stream.releaseDate,
              },
            });
            synced++;
          } else {
            failed++;
          }
        } else {
          failed++;
        }

        // Rate limit to avoid TMDB API limits
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (error) {
        failed++;
        logger.error({ error, streamId: stream.id }, 'Bulk TMDB sync failed for stream');
      }
    }

    logger.info({ synced, failed, total: unsyncedStreams.length }, 'Bulk TMDB sync completed');

    return {
      success: true,
      message: `Synced ${synced} VODs, ${failed} failed`,
      synced,
      failed,
      total: unsyncedStreams.length,
    };
  });

  // ==================== SUBTITLE MANAGEMENT ====================

  // Get all subtitles for a VOD
  fastify.get('/:id/subtitles', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id), streamType: 'VOD' },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    const subtitles = await prisma.subtitle.findMany({
      where: { streamId: parseInt(id) },
      orderBy: [{ isDefault: 'desc' }, { language: 'asc' }],
    });

    return subtitles;
  });

  // Add subtitle to VOD
  fastify.post('/:id/subtitles', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createSubtitleSchema.parse(request.body);

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id), streamType: 'VOD' },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    // If no source URL or content provided, return error
    if (!data.sourceUrl && !data.content) {
      return reply.status(400).send({ error: 'Either sourceUrl or content is required' });
    }

    // Convert SRT to VTT if content is provided and format is srt
    let processedContent = data.content;
    if (data.content && data.format === 'srt') {
      // Convert SRT to VTT for web compatibility
      processedContent = convertSrtToVtt(data.content);
    }

    // If setting this as default, unset other defaults
    if (data.isDefault) {
      await prisma.subtitle.updateMany({
        where: { streamId: parseInt(id), isDefault: true },
        data: { isDefault: false },
      });
    }

    const subtitle = await prisma.subtitle.create({
      data: {
        streamId: parseInt(id),
        language: data.language,
        languageLabel: data.languageLabel || getLanguageLabel(data.language),
        format: data.content ? 'vtt' : data.format, // Always store as VTT if content provided
        isDefault: data.isDefault,
        isForced: data.isForced,
        sourceUrl: data.sourceUrl,
        content: processedContent,
      },
    });

    logger.info({ subtitleId: subtitle.id, streamId: parseInt(id), language: data.language }, 'Added subtitle to VOD');

    return reply.status(201).send(subtitle);
  });

  // Update subtitle
  fastify.put('/:id/subtitles/:subtitleId', async (request, reply) => {
    const { id, subtitleId } = request.params as { id: string; subtitleId: string };
    const data = updateSubtitleSchema.parse(request.body);

    const subtitle = await prisma.subtitle.findFirst({
      where: { id: parseInt(subtitleId), streamId: parseInt(id) },
    });

    if (!subtitle) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    // If setting this as default, unset other defaults
    if (data.isDefault) {
      await prisma.subtitle.updateMany({
        where: { streamId: parseInt(id), isDefault: true, id: { not: parseInt(subtitleId) } },
        data: { isDefault: false },
      });
    }

    // Process content if provided
    let processedContent = data.content;
    if (data.content && (data.format === 'srt' || subtitle.format === 'srt')) {
      processedContent = convertSrtToVtt(data.content);
    }

    const updated = await prisma.subtitle.update({
      where: { id: parseInt(subtitleId) },
      data: {
        language: data.language,
        languageLabel: data.languageLabel,
        format: data.content ? 'vtt' : data.format,
        isDefault: data.isDefault,
        isForced: data.isForced,
        sourceUrl: data.sourceUrl,
        content: processedContent,
      },
    });

    return updated;
  });

  // Delete subtitle
  fastify.delete('/:id/subtitles/:subtitleId', async (request, reply) => {
    const { id, subtitleId } = request.params as { id: string; subtitleId: string };

    const subtitle = await prisma.subtitle.findFirst({
      where: { id: parseInt(subtitleId), streamId: parseInt(id) },
    });

    if (!subtitle) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    await prisma.subtitle.delete({
      where: { id: parseInt(subtitleId) },
    });

    logger.info({ subtitleId: parseInt(subtitleId), streamId: parseInt(id) }, 'Deleted subtitle');

    return { success: true };
  });

  // Serve subtitle content (for inline subtitles)
  fastify.get('/:id/subtitles/:subtitleId/content', async (request, reply) => {
    const { id, subtitleId } = request.params as { id: string; subtitleId: string };

    const subtitle = await prisma.subtitle.findFirst({
      where: { id: parseInt(subtitleId), streamId: parseInt(id) },
    });

    if (!subtitle) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    if (!subtitle.content && !subtitle.sourceUrl) {
      return reply.status(404).send({ error: 'No subtitle content available' });
    }

    // If has inline content, return it
    if (subtitle.content) {
      reply.header('Content-Type', 'text/vtt');
      reply.header('Access-Control-Allow-Origin', '*');
      return subtitle.content;
    }

    // Otherwise redirect to source URL
    if (subtitle.sourceUrl) {
      return reply.redirect(subtitle.sourceUrl);
    }

    // Fallback - should never reach here due to earlier check
    return reply.status(404).send({ error: 'No subtitle content available' });
  });

  // ==================== HLS CONVERSION ====================

  // Convert VOD to HLS format
  fastify.post('/:id/convert-hls', async (request, reply) => {
    const { id } = request.params as { id: string };
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream || stream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    // Check if already has HLS
    if (vodToHlsService.hasCompleteHlsOutput(streamId)) {
      return {
        status: 'already_exists',
        hlsUrl: `/movie/hls/${streamId}/playlist.m3u8`,
      };
    }

    // Check if conversion is in progress
    const existingJob = vodToHlsService.getJobStatus(streamId);
    if (existingJob && existingJob.status === 'converting') {
      return {
        status: 'processing',
        progress: existingJob.progress || 0,
      };
    }

    // Check if source needs conversion
    if (!vodToHlsService.needsConversion(stream.sourceUrl)) {
      return reply.status(400).send({ 
        error: 'Source is already HLS or does not need conversion' 
      });
    }

    // Start conversion in background
    vodToHlsService.getOrStartConversion(streamId, stream.sourceUrl);

    return {
      status: 'started',
      message: 'HLS conversion started',
    };
  });

  // Get HLS conversion status
  fastify.get('/:id/hls-status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream || stream.streamType !== 'VOD') {
      return reply.status(404).send({ error: 'VOD not found' });
    }

    const hasHls = vodToHlsService.hasCompleteHlsOutput(streamId);
    const job = vodToHlsService.getJobStatus(streamId);

    return {
      hasHls,
      hlsUrl: hasHls ? `/movie/hls/${streamId}/playlist.m3u8` : null,
      isConverting: job?.status === 'converting',
      job: job ? {
        status: job.status,
        progress: job.progress,
        segmentsReady: job.segmentsReady,
        error: job.error,
      } : null,
    };
  });

  // Delete HLS output
  fastify.delete('/:id/hls', async (request, reply) => {
    const { id } = request.params as { id: string };
    const streamId = parseInt(id);

    vodToHlsService.cleanupHlsOutput(streamId);

    return { success: true };
  });

  // Get media probe information (source tracks)
  fastify.get('/:id/probe', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      // VOD data is stored in the Stream table with streamType: VOD
      // The id parameter is the stream.id
      const stream = await prisma.stream.findUnique({
        where: { id: parseInt(id) },
      });

      if (!stream || stream.streamType !== 'VOD') {
        return reply.status(404).send({ error: 'VOD not found' });
      }

      // Check if source URL is set
      if (!stream.sourceUrl) {
        return reply.status(400).send({ 
          error: 'No source URL configured',
          message: 'This VOD has no source media file configured',
        });
      }

      try {
        const mediaInfo = await mediaProbeService.probeMedia(stream.sourceUrl);

        // Add human-readable labels
        const enrichedInfo = {
          ...mediaInfo,
          formattedDuration: mediaProbeService.formatDuration(mediaInfo.duration),
          formattedSize: mediaProbeService.formatFileSize(mediaInfo.size),
          formattedBitrate: mediaProbeService.formatBitrate(mediaInfo.bitrate),
          videoTracks: mediaInfo.videoTracks.map(track => ({
            ...track,
            resolution: mediaProbeService.getResolutionLabel(track.width, track.height),
            formattedBitrate: track.bitrate ? mediaProbeService.formatBitrate(track.bitrate) : undefined,
          })),
          audioTracks: mediaInfo.audioTracks.map(track => ({
            ...track,
            channelLabel: mediaProbeService.getChannelLabel(track.channels, track.channelLayout),
            formattedBitrate: track.bitrate ? mediaProbeService.formatBitrate(track.bitrate) : undefined,
            formattedSampleRate: `${(track.sampleRate / 1000).toFixed(1)} kHz`,
          })),
        };

        return enrichedInfo;
      } catch (probeError) {
        const errorMessage = probeError instanceof Error ? probeError.message : 'Unknown error';
        
        // Return a structured error with helpful info
        if (errorMessage.includes('File not found')) {
          return reply.status(404).send({ 
            error: 'Media file not found',
            message: `The source file could not be found: ${stream.sourceUrl}`,
            sourceUrl: stream.sourceUrl,
          });
        }
        
        if (errorMessage.includes('FFprobe failed')) {
          return reply.status(422).send({ 
            error: 'Unable to probe media',
            message: 'FFprobe could not analyze this media file. It may be corrupted or in an unsupported format.',
            sourceUrl: stream.sourceUrl,
          });
        }

        throw probeError;
      }
    } catch (error) {
      logger.error({ error, vodId: id }, 'Failed to probe media');
      return reply.status(500).send({ 
        error: 'Failed to probe media',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

// Helper function to convert SRT to VTT
function convertSrtToVtt(srtContent: string): string {
  // Add VTT header
  let vtt = 'WEBVTT\n\n';
  
  // Replace SRT time format (00:00:00,000) with VTT format (00:00:00.000)
  const converted = srtContent
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    // Remove sequence numbers that appear alone on a line
    .replace(/^\d+\s*\n(?=\d{2}:\d{2}:\d{2})/gm, '');
  
  vtt += converted;
  
  return vtt;
}

// Helper function to get language label from code
function getLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ru: 'Russian',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ar: 'Arabic',
    hi: 'Hindi',
    tr: 'Turkish',
    pl: 'Polish',
    nl: 'Dutch',
    sv: 'Swedish',
    da: 'Danish',
    no: 'Norwegian',
    fi: 'Finnish',
    cs: 'Czech',
    el: 'Greek',
    he: 'Hebrew',
    th: 'Thai',
    vi: 'Vietnamese',
    id: 'Indonesian',
    ms: 'Malay',
    ro: 'Romanian',
    hu: 'Hungarian',
    uk: 'Ukrainian',
    bg: 'Bulgarian',
    hr: 'Croatian',
    sk: 'Slovak',
    sl: 'Slovenian',
    sr: 'Serbian',
  };
  return labels[code.toLowerCase()] || code.toUpperCase();
}

export default vodRoutes;
