import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { authenticateIptvLine, AuthQuery } from '../middlewares/auth.js';
import {
  AuthResponse,
  UserInfo,
  ServerInfo,
  mapLineStatus,
  formatUnixTimestamp,
  formatDateTime,
} from '../../types/user.js';
import {
  CategoryItem,
  LiveStreamItem,
  VodStreamItem,
  SeriesItem,
  SeriesInfo,
  VodInfo,
  ShortEpg,
  EpgListing,
} from '../../types/stream.js';
import { StreamType } from '@prisma/client';
import { vodViewerManager } from '../../services/streaming/VodViewerManager.js';

interface PlayerApiQuery extends AuthQuery {
  action?: string;
  category_id?: string;
  stream_id?: string;
  vod_id?: string;
  series_id?: string;
  limit?: string;
  search?: string;
}

interface BouquetItem {
  bouquet: { id: number };
}

export const playerApiRoutes: FastifyPluginAsync = async (fastify) => {
  // Main player_api.php endpoint - Xtream Codes API compatible
  fastify.get<{ Querystring: PlayerApiQuery }>(
    '/player_api.php',
    { preHandler: authenticateIptvLine },
    async (request, reply) => {
      const { action, category_id, stream_id, vod_id, series_id, limit, search } = request.query;
      const line = request.line!; // IPTV Line (subscriber)

      // No action = return auth info
      if (!action) {
        return buildAuthResponse(line);
      }

      // Get line's bouquet IDs for filtering
      const bouquetIds = line.bouquets.map((b: BouquetItem) => b.bouquet.id);

      switch (action) {
        case 'get_live_categories':
          return getLiveCategories(bouquetIds);

        case 'get_vod_categories':
          return getVodCategories(bouquetIds);

        case 'get_series_categories':
          return getSeriesCategories(bouquetIds);

        case 'get_live_streams':
          return getLiveStreams(bouquetIds, category_id);

        case 'get_vod_streams':
          return getVodStreams(bouquetIds, category_id, search);

        case 'get_series':
          return getSeries(bouquetIds, category_id, search);

        case 'get_series_info':
          if (!series_id) {
            return reply.status(400).send({ error: 'series_id required' });
          }
          return getSeriesInfo(parseInt(series_id));

        case 'get_vod_info':
          if (!vod_id) {
            return reply.status(400).send({ error: 'vod_id required' });
          }
          return getVodInfo(parseInt(vod_id));

        case 'get_short_epg':
          if (!stream_id) {
            return reply.status(400).send({ error: 'stream_id required' });
          }
          return getShortEpg(parseInt(stream_id), limit ? parseInt(limit) : 4);

        case 'get_simple_data_table':
          if (!stream_id) {
            return reply.status(400).send({ error: 'stream_id required' });
          }
          return getFullEpg(parseInt(stream_id));

        default:
          return reply.status(400).send({ error: 'Unknown action' });
      }
    }
  );
};

// Build Xtream Codes compatible auth response for IPTV Line
function buildAuthResponse(line: {
  username: string;
  password: string;
  status: string;
  expiresAt: Date | string | null;
  isTrial: boolean;
  maxConnections: number;
  allowHls: boolean;
  allowMpegts: boolean;
  allowRtmp: boolean;
  createdAt: Date | string;
}): AuthResponse {
  const now = new Date();
  const createdAt = line.createdAt instanceof Date ? line.createdAt : new Date(line.createdAt);
  
  // Build allowed outputs based on line flags
  const allowedOutputs: string[] = [];
  if (line.allowHls) allowedOutputs.push('m3u8');
  if (line.allowMpegts) allowedOutputs.push('ts');
  if (line.allowRtmp) allowedOutputs.push('rtmp');

  const userInfo: UserInfo = {
    username: line.username,
    password: line.password,
    message: 'Welcome',
    auth: 1,
    status: mapLineStatus(line.status as any),
    exp_date: formatUnixTimestamp(line.expiresAt),
    is_trial: line.isTrial ? '1' : '0',
    active_cons: '0', // Will be updated by connection tracking
    created_at: Math.floor(createdAt.getTime() / 1000).toString(),
    max_connections: line.maxConnections.toString(),
    allowed_output_formats: allowedOutputs,
  };

  const serverInfo: ServerInfo = {
    url: config.server.url,
    port: config.server.port,
    https_port: config.server.httpsPort,
    server_protocol: config.server.url.startsWith('https') ? 'https' : 'http',
    rtmp_port: config.server.rtmpPort,
    timezone: config.server.timezone,
    timestamp_now: Math.floor(now.getTime() / 1000),
    time_now: formatDateTime(now),
  };

  return { user_info: userInfo, server_info: serverInfo };
}

async function getLiveCategories(bouquetIds: number[]): Promise<CategoryItem[]> {
  return cache.getOrSet(
    `${cache.KEYS.LIVE_CATEGORIES}:${bouquetIds.join(',')}`,
    async () => {
      // Get categories that have streams
      const categoriesWithStreams = await prisma.category.findMany({
        where: {
          type: StreamType.LIVE,
          isActive: true,
          streams: {
            some: {
              isActive: true,
              bouquets: bouquetIds.length > 0
                ? { some: { bouquetId: { in: bouquetIds } } }
                : undefined,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Get unique parent IDs from categories with streams
      const parentIds = [...new Set(
        categoriesWithStreams
          .map(cat => cat.parentId)
          .filter((id): id is number => id !== null)
      )];

      // Get parent categories
      const parentCategories = parentIds.length > 0 
        ? await prisma.category.findMany({
            where: {
              id: { in: parentIds },
              isActive: true,
            },
          })
        : [];

      // Combine and deduplicate categories
      const allCategories = [...parentCategories, ...categoriesWithStreams];
      const uniqueCategories = Array.from(
        new Map(allCategories.map(cat => [cat.id, cat])).values()
      );

      return uniqueCategories
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          category_id: cat.id.toString(),
          category_name: cat.name,
          parent_id: cat.parentId || 0,
          country_code: cat.countryCode || undefined,
          flag_svg_url: cat.flagSvgUrl || undefined,
        }));
    },
    cache.TTL.CATEGORIES
  );
}

async function getVodCategories(bouquetIds: number[]): Promise<CategoryItem[]> {
  return cache.getOrSet(
    `${cache.KEYS.VOD_CATEGORIES}:${bouquetIds.join(',')}`,
    async () => {
      // Get categories that have streams (via direct categoryId OR via StreamCategory junction)
      const categoriesWithStreams = await prisma.category.findMany({
        where: {
          type: StreamType.VOD,
          isActive: true,
          OR: [
            // Direct relation via categoryId
            {
              streams: {
                some: {
                  isActive: true,
                  bouquets: bouquetIds.length > 0
                    ? { some: { bouquetId: { in: bouquetIds } } }
                    : undefined,
                },
              },
            },
            // Many-to-many relation via StreamCategory junction table
            {
              streamCategories: {
                some: {
                  stream: {
                    isActive: true,
                    bouquets: bouquetIds.length > 0
                      ? { some: { bouquetId: { in: bouquetIds } } }
                      : undefined,
                  },
                },
              },
            },
          ],
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Get unique parent IDs from categories with streams
      const parentIds = [...new Set(
        categoriesWithStreams
          .map(cat => cat.parentId)
          .filter((id): id is number => id !== null)
      )];

      // Get parent categories
      const parentCategories = parentIds.length > 0 
        ? await prisma.category.findMany({
            where: {
              id: { in: parentIds },
              isActive: true,
            },
          })
        : [];

      // Combine and deduplicate categories
      const allCategories = [...parentCategories, ...categoriesWithStreams];
      const uniqueCategories = Array.from(
        new Map(allCategories.map(cat => [cat.id, cat])).values()
      );

      return uniqueCategories
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          category_id: cat.id.toString(),
          category_name: cat.name,
          parent_id: cat.parentId || 0,
          country_code: cat.countryCode || undefined,
          flag_svg_url: cat.flagSvgUrl || undefined,
        }));
    },
    cache.TTL.CATEGORIES
  );
}

async function getSeriesCategories(bouquetIds: number[]): Promise<CategoryItem[]> {
  return cache.getOrSet(
    `${cache.KEYS.SERIES_CATEGORIES}:${bouquetIds.join(',')}`,
    async () => {
      // Get categories that have series (via direct categoryId OR via SeriesCategory junction)
      // Note: Series are stored in the Series table, not Stream table
      const categoriesWithSeries = await prisma.category.findMany({
        where: {
          type: StreamType.SERIES,
          isActive: true,
          OR: [
            // Direct relation via Series.categoryId
            {
              series: {
                some: {},
              },
            },
            // Many-to-many relation via SeriesCategory junction table
            {
              seriesCategories: {
                some: {},
              },
            },
          ],
        },
        orderBy: { sortOrder: 'asc' },
      });

      // Get unique parent IDs from categories with series
      const parentIds = [...new Set(
        categoriesWithSeries
          .map(cat => cat.parentId)
          .filter((id): id is number => id !== null)
      )];

      // Get parent categories
      const parentCategories = parentIds.length > 0 
        ? await prisma.category.findMany({
            where: {
              id: { in: parentIds },
              isActive: true,
            },
          })
        : [];

      // Combine and deduplicate categories
      const allCategories = [...parentCategories, ...categoriesWithSeries];
      const uniqueCategories = Array.from(
        new Map(allCategories.map(cat => [cat.id, cat])).values()
      );

      return uniqueCategories
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((cat) => ({
          category_id: cat.id.toString(),
          category_name: cat.name,
          parent_id: cat.parentId || 0,
          country_code: cat.countryCode || undefined,
          flag_svg_url: cat.flagSvgUrl || undefined,
        }));
    },
    cache.TTL.CATEGORIES
  );
}

async function getLiveStreams(
  bouquetIds: number[],
  categoryId?: string
): Promise<LiveStreamItem[]> {
  // Build category filter that checks both direct categoryId and StreamCategory junction
  const categoryFilter = categoryId ? {
    OR: [
      { categoryId: parseInt(categoryId) },
      { categories: { some: { categoryId: parseInt(categoryId) } } },
    ],
  } : {};

  const streams = await prisma.stream.findMany({
    where: {
      streamType: StreamType.LIVE,
      isActive: true,
      ...categoryFilter,
      bouquets: bouquetIds.length > 0
        ? { some: { bouquetId: { in: bouquetIds } } }
        : undefined,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  return streams.map((stream, index) => ({
    num: index + 1,
    name: stream.name,
    stream_type: 'live' as const,
    stream_id: stream.id,
    stream_icon: stream.logoUrl || '',
    epg_channel_id: stream.epgChannelId,
    added: Math.floor(stream.createdAt.getTime() / 1000).toString(),
    category_id: stream.categoryId?.toString() || '',
    custom_sid: '',
    tv_archive: stream.tvArchive ? 1 : 0,
    direct_source: '',
    tv_archive_duration: stream.tvArchiveDuration,
  }));
}

async function getVodStreams(
  bouquetIds: number[],
  categoryId?: string,
  search?: string
): Promise<VodStreamItem[]> {
  // Build category filter that checks both direct categoryId and StreamCategory junction
  const categoryFilter = categoryId ? {
    OR: [
      { categoryId: parseInt(categoryId) },
      { categories: { some: { categoryId: parseInt(categoryId) } } },
    ],
  } : {};

  const streams = await prisma.stream.findMany({
    where: {
      streamType: StreamType.VOD,
      isActive: true,
      ...categoryFilter,
      name: search ? {
        contains: search,
        mode: 'insensitive' as const
      } : undefined,
      bouquets: bouquetIds.length > 0
        ? { some: { bouquetId: { in: bouquetIds } } }
        : undefined,
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });

  // Get viewer counts for all streams
  const streamIds = streams.map(s => s.id);
  const viewerCounts = await vodViewerManager.getViewerCounts(streamIds);

  return streams.map((stream, index) => ({
    num: index + 1,
    name: stream.name,
    stream_type: 'movie' as const,
    stream_id: stream.id,
    stream_icon: stream.logoUrl || '',
    rating: stream.rating?.toString() || '0',
    rating_5based: stream.rating ? stream.rating / 2 : 0,
    added: Math.floor(stream.createdAt.getTime() / 1000).toString(),
    category_id: stream.categoryId?.toString() || '',
    container_extension: stream.containerExtension || 'mp4',
    custom_sid: '',
    direct_source: '',
    viewer_count: viewerCounts.get(stream.id) || 0,
  }));
}

async function getSeries(
  bouquetIds: number[],
  categoryId?: string,
  search?: string
): Promise<SeriesItem[]> {
  const series = await prisma.series.findMany({
    where: {
      ...(categoryId ? {
        categories: {
          some: { categoryId: parseInt(categoryId) }
        }
      } : {}),
      name: search ? {
        contains: search,
        mode: 'insensitive' as const
      } : undefined,
    },
    orderBy: { name: 'asc' },
  });

  return series.map((s, index) => ({
    num: index + 1,
    name: s.name,
    series_id: s.id,
    cover: s.cover || '',
    plot: s.plot || '',
    cast: s.cast || '',
    director: s.director || '',
    genre: s.genre || '',
    releaseDate: s.releaseDate?.toISOString().split('T')[0] || '',
    last_modified: Math.floor(s.lastModified.getTime() / 1000).toString(),
    rating: s.rating?.toString() || '0',
    rating_5based: s.rating5 || 0,
    backdrop_path: s.backdropPath,
    youtube_trailer: s.youtubeTrailer || '',
    episode_run_time: s.episodeRunTime || '',
    category_id: s.categoryId?.toString() || '',
  }));
}

async function getSeriesInfo(seriesId: number): Promise<SeriesInfo | { error: string }> {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    include: {
      episodes: {
        orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
      },
    },
  });

  if (!series) {
    return { error: 'Series not found' };
  }

  // Group episodes by season
  const episodesBySeason: Record<string, any[]> = {};
  const seasons: Set<number> = new Set();

  for (const episode of series.episodes) {
    seasons.add(episode.seasonNumber);
    const seasonKey = episode.seasonNumber.toString();

    if (!episodesBySeason[seasonKey]) {
      episodesBySeason[seasonKey] = [];
    }

    episodesBySeason[seasonKey].push({
      id: episode.id.toString(),
      episode_num: episode.episodeNumber,
      title: episode.title || `Episode ${episode.episodeNumber}`,
      container_extension: episode.containerExtension || 'mp4',
      info: {
        movie_image: episode.cover || '',
        plot: episode.plot || '',
        releasedate: episode.releaseDate?.toISOString().split('T')[0] || '',
        rating: episode.rating || 0,
        duration_secs: episode.duration || 0,
        duration: episode.duration
          ? `${Math.floor(episode.duration / 3600)}:${Math.floor((episode.duration % 3600) / 60).toString().padStart(2, '0')}:${(episode.duration % 60).toString().padStart(2, '0')}`
          : '',
      },
      custom_sid: '',
      added: Math.floor(episode.createdAt.getTime() / 1000).toString(),
      season: episode.seasonNumber,
      direct_source: '',
    });
  }

  // Build seasons info
  const seasonsInfo = Array.from(seasons)
    .sort((a, b) => a - b)
    .map((seasonNum) => ({
      air_date: '',
      episode_count: episodesBySeason[seasonNum.toString()]?.length || 0,
      id: seasonNum,
      name: `Season ${seasonNum}`,
      overview: '',
      season_number: seasonNum,
      cover: series.cover || '',
      cover_big: series.cover || '',
    }));

  return {
    seasons: seasonsInfo,
    info: {
      name: series.name,
      cover: series.cover || '',
      plot: series.plot || '',
      cast: series.cast || '',
      director: series.director || '',
      genre: series.genre || '',
      releaseDate: series.releaseDate?.toISOString().split('T')[0] || '',
      last_modified: Math.floor(series.lastModified.getTime() / 1000).toString(),
      rating: series.rating?.toString() || '0',
      rating_5based: series.rating5 || 0,
      backdrop_path: series.backdropPath,
      youtube_trailer: series.youtubeTrailer || '',
      episode_run_time: series.episodeRunTime || '',
      category_id: series.categoryId?.toString() || '',
    },
    episodes: episodesBySeason,
  };
}

async function getVodInfo(vodId: number): Promise<VodInfo | { error: string }> {
  const stream = await prisma.stream.findUnique({
    where: { id: vodId, streamType: StreamType.VOD },
  });

  if (!stream) {
    return { error: 'VOD not found' };
  }

  // Get viewer count for this VOD
  const viewerCount = await vodViewerManager.getViewerCount(vodId);

  return {
    info: {
      movie_image: stream.logoUrl || '',
      tmdb_id: stream.tmdbId || 0,
      backdrop_path: stream.backdropPath ? [stream.backdropPath] : [],
      youtube_trailer: stream.youtubeTrailer || '',
      genre: stream.genre || '',
      plot: stream.plot || '',
      cast: stream.cast || '',
      rating: stream.rating?.toString() || '0',
      director: stream.director || '',
      releasedate: stream.releaseDate?.toISOString().split('T')[0] || '',
      duration_secs: stream.duration || 0,
      duration: stream.duration
        ? `${Math.floor(stream.duration / 3600)}:${Math.floor((stream.duration % 3600) / 60).toString().padStart(2, '0')}:${(stream.duration % 60).toString().padStart(2, '0')}`
        : '',
      video: {},
      audio: {},
      bitrate: 0,
      viewer_count: viewerCount,
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

async function getShortEpg(streamId: number, limit: number = 4): Promise<ShortEpg> {
  const cacheKey = cache.KEYS.EPG_SHORT(streamId);
  
  return cache.getOrSet(
    cacheKey,
    async () => {
      const now = new Date();
      
      const entries = await prisma.epgEntry.findMany({
        where: {
          streamId,
          end: { gte: now },
        },
        orderBy: { start: 'asc' },
        take: limit,
      });

      const listings: EpgListing[] = entries.map((entry) => ({
        id: entry.id.toString(),
        epg_id: entry.channelId,
        title: Buffer.from(entry.title).toString('base64'),
        lang: entry.language || '',
        start: entry.start.toISOString().replace('T', ' ').slice(0, 19),
        end: entry.end.toISOString().replace('T', ' ').slice(0, 19),
        description: entry.description
          ? Buffer.from(entry.description).toString('base64')
          : '',
        channel_id: entry.channelId,
        start_timestamp: Math.floor(entry.start.getTime() / 1000).toString(),
        stop_timestamp: Math.floor(entry.end.getTime() / 1000).toString(),
        now_playing: entry.start <= now && entry.end >= now ? 1 : 0,
        has_archive: 0,
      }));

      return { epg_listings: listings };
    },
    300 // 5 minutes cache
  );
}

async function getFullEpg(streamId: number): Promise<ShortEpg> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const entries = await prisma.epgEntry.findMany({
    where: {
      streamId,
      start: { gte: dayAgo },
      end: { lte: dayAhead },
    },
    orderBy: { start: 'asc' },
  });

  const listings: EpgListing[] = entries.map((entry) => ({
    id: entry.id.toString(),
    epg_id: entry.channelId,
    title: Buffer.from(entry.title).toString('base64'),
    lang: entry.language || '',
    start: entry.start.toISOString().replace('T', ' ').slice(0, 19),
    end: entry.end.toISOString().replace('T', ' ').slice(0, 19),
    description: entry.description
      ? Buffer.from(entry.description).toString('base64')
      : '',
    channel_id: entry.channelId,
    start_timestamp: Math.floor(entry.start.getTime() / 1000).toString(),
    stop_timestamp: Math.floor(entry.end.getTime() / 1000).toString(),
    now_playing: entry.start <= now && entry.end >= now ? 1 : 0,
    has_archive: 0,
  }));

  return { epg_listings: listings };
}

export default playerApiRoutes;
