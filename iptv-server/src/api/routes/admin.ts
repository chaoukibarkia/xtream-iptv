import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';
import { StreamType, UserStatus, UserRole, IptvLineStatus, LogLevel, DistributionRole, NotificationType } from '@prisma/client';
import { notificationService } from './notifications.js';
import { epgImporter } from '../../services/epg/EpgImporter.js';
import { streamProxy } from '../../services/streaming/StreamProxy.js';
import { alwaysOnStreamManager } from '../../services/streaming/AlwaysOnStreamManager.js';
import { onDemandStreamManager } from '../../services/streaming/OnDemandStreamManager.js';
import { abrStreamManager } from '../../services/streaming/AbrStreamManager.js';
import { vodViewerManager } from '../../services/streaming/VodViewerManager.js';
import { dbLogger, LogSource } from '../../services/logging/DatabaseLogger.js';
import { cleanupExpiredHlsConnections } from '../middlewares/auth.js';
import { streamDistributionService } from '../../services/streaming/StreamDistributionService.js';
import { passwordService } from '../../services/auth/PasswordService.js';
import { fetchPossibleLogos, downloadAndSaveImage } from '../../services/logos/LogoFetcher.js';
import { creditService } from '../../services/credits/index.js';
import { verifyToken } from './auth.js';
import crypto from 'crypto';

// Type for authenticated user context
interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

/**
 * Get the real client IP from request headers
 */
function getClientIp(request: FastifyRequest): string {
  const xRealIp = request.headers['x-real-ip'];
  if (xRealIp && typeof xRealIp === 'string') {
    return xRealIp;
  }
  
  const xForwardedFor = request.headers['x-forwarded-for'];
  if (xForwardedFor) {
    const forwardedIps = typeof xForwardedFor === 'string' 
      ? xForwardedFor.split(',').map(ip => ip.trim())
      : xForwardedFor;
    if (forwardedIps.length > 0 && forwardedIps[0]) {
      return forwardedIps[0];
    }
  }
  
  return request.ip;
}

// ==================== VALIDATION SCHEMAS ====================

// Schema for registered users (admins, resellers)
const createUserSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  email: z.string().email().optional(),
  role: z.nativeEnum(UserRole).default(UserRole.RESELLER),
  status: z.nativeEnum(UserStatus).default(UserStatus.ACTIVE),
  parentId: z.number().int().optional(),
  credits: z.number().int().default(0),
  notes: z.string().optional(),
});

const updateUserSchema = createUserSchema.partial();

// Schema for IPTV Lines (subscribers)
const createLineSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(4),
  maxConnections: z.number().int().positive().default(1),
  expiresAt: z.string().datetime().optional(),
  subscriptionDays: z.number().int().min(1).max(3650).optional(), // Alternative to expiresAt
  isTrial: z.boolean().default(false),
  status: z.nativeEnum(IptvLineStatus).default(IptvLineStatus.active),
  ownerId: z.number().int().optional(), // Reseller who owns this line
  bouquetIds: z.array(z.number()).optional(),

  // Credit deduction
  deductCredits: z.boolean().default(false), // If true, deduct credits from owner

  // Access output formats
  allowHls: z.boolean().default(true),
  allowMpegts: z.boolean().default(true),
  allowRtmp: z.boolean().default(true),

  // Notes
  adminNotes: z.string().optional(),
  resellerNotes: z.string().optional(),

  // Advanced settings
  forcedServerId: z.number().int().optional(),
  isMinistraPortal: z.boolean().default(false),
  isRestreamer: z.boolean().default(false),
  isEnigmaDevice: z.boolean().default(false),
  isMagDevice: z.boolean().default(false),
  magStbLock: z.string().optional(),
  lockedDeviceId: z.string().optional(),
  ispLock: z.boolean().default(false),
  ispDescription: z.string().optional(),
  forcedCountry: z.string().optional(),

  // Restrictions
  allowedIps: z.array(z.string()).optional(),
  allowedUserAgents: z.array(z.string()).optional(),

  customData: z.record(z.any()).optional(),
});

const updateLineSchema = createLineSchema.partial();

const createStreamSchemaBase = z.object({
  name: z.string().min(1),
  streamType: z.nativeEnum(StreamType),
  categoryId: z.number().int().optional(), // Kept for backward compatibility
  categoryIds: z.array(z.number().int()).min(1).optional(), // New multi-category support
  sourceUrl: z.string().url(),
  backupUrls: z.array(z.string().url()).default([]),
  customUserAgent: z.string().optional(),  // Custom User-Agent for fetching the source stream
  epgChannelId: z.string().optional(),
  logoUrl: z.string().optional(), // Allow any string for logo URL (can be external URL or local path)
  transcodeProfile: z.string().optional(),
  transcodeProfileId: z.number().int().nullable().optional(),
  transcodeServerId: z.number().int().nullable().optional(),
  abrProfileId: z.number().int().nullable().optional(),  // Adaptive Bitrate profile
  isActive: z.boolean().default(true),
  alwaysOn: z.boolean().default(false),
  containerExtension: z.string().optional(),
  duration: z.number().int().optional(),
  tvArchive: z.boolean().default(false),
  tvArchiveDuration: z.number().int().default(0),
  // VOD metadata
  tmdbId: z.number().int().optional(),
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  rating: z.number().optional(),
  releaseDate: z.string().datetime().optional(),
  // Server distribution (new architecture)
  originServerId: z.number().int().optional(), // Server that pulls from source
  childServerIds: z.array(z.number().int()).optional(), // Servers that pull from origin
  // Legacy: Server assignments (deprecated, use originServerId + childServerIds)
  serverIds: z.array(z.number().int()).optional(),
  // Bouquet assignments
  bouquetIds: z.array(z.number().int()).optional(),
});

const createStreamSchema = createStreamSchemaBase.refine((data) => data.categoryId || (data.categoryIds && data.categoryIds.length > 0), {
  message: "Either categoryId or categoryIds must be provided",
  path: ["categoryIds"],
});

const updateStreamSchema = createStreamSchemaBase.partial().extend({
  bouquetIds: z.array(z.number()).optional(),
});

// Schema for bulk stream updates
const bulkUpdateStreamsSchema = z.object({
  streamIds: z.array(z.number().int()).min(1).max(10000),
  updates: z.object({
    categoryId: z.number().int().optional(),
    isActive: z.boolean().optional(),
    alwaysOn: z.boolean().optional(),
    serverIds: z.array(z.number().int()).optional(),
    cascadeDistribution: z.boolean().optional(),
  }),
});

const createCategorySchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(StreamType),
  parentId: z.number().int().nullable().optional(),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
  countryCode: z.string().length(2).optional(),
  flagSvgUrl: z.string().url().optional(),
});

const createBouquetSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().int().nullable().optional(),
  streamIds: z.array(z.number()).optional(),
});

const createSeriesSchemaBase = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().optional(), // Kept for backward compatibility
  categoryIds: z.array(z.number().int()).min(1).optional(), // New multi-category support
  cover: z.string().url().optional().or(z.literal('')),
  coverUrl: z.string().optional(), // Alias for cover
  backdropUrl: z.string().optional(),
  plot: z.string().optional(),
  cast: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  genres: z.string().optional(), // Alias for genre  
  releaseDate: z.string().datetime().optional(),
  year: z.number().int().optional(),
  rating: z.number().optional(),
  tmdbId: z.number().int().optional(),
  youtubeTrailer: z.string().optional(),
  status: z.string().optional(),
});

const createSeriesSchema = createSeriesSchemaBase.refine((data) => data.categoryId || (data.categoryIds && data.categoryIds.length > 0), {
  message: "Either categoryId or categoryIds must be provided",
  path: ["categoryIds"],
});

// Schema for creating series with full seasons and episodes data
const episodeDataSchema = z.object({
  episodeNumber: z.number().int().positive(),
  name: z.string(),
  overview: z.string().optional(),
  airDate: z.string().nullable().optional(),
  runtime: z.number().nullable().optional(),
  stillPath: z.string().nullable().optional(),
  sourceUrl: z.string(), // Can be empty if no file assigned
  serverId: z.number().int().optional(), // Server where the file is located
});

const seasonDataSchema = z.object({
  seasonNumber: z.number().int().positive(),
  name: z.string(),
  overview: z.string().optional(),
  posterPath: z.string().nullable().optional(),
  episodes: z.array(episodeDataSchema),
});

const createSeriesFullSchemaBase = z.object({
  name: z.string().min(1),
  categoryId: z.number().int().optional(), // Kept for backward compatibility
  categoryIds: z.array(z.number().int()).min(1).optional(), // New multi-category support
  tmdbId: z.number().int().optional(),
  coverUrl: z.string().optional(),
  backdropUrl: z.string().optional(),
  plot: z.string().optional(),
  year: z.number().int().optional(),
  rating: z.number().optional(),
  genres: z.string().optional(), // Preferred field name
  genre: z.string().optional(),  // Alternative field name for compatibility
  cast: z.string().optional(),
  status: z.string().optional(),
  seasons: z.array(seasonDataSchema),
});

const createSeriesFullSchema = createSeriesFullSchemaBase.refine((data) => data.categoryId || (data.categoryIds && data.categoryIds.length > 0), {
  message: "Either categoryId or categoryIds must be provided",
  path: ["categoryIds"],
});

const createEpisodeSchema = z.object({
  seriesId: z.number().int(),
  seasonNumber: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
  title: z.string().optional(),
  plot: z.string().optional(),
  sourceUrl: z.string().url(),
  backupUrls: z.array(z.string().url()).default([]),
  containerExtension: z.string().optional(),
  duration: z.number().int().optional(),
  cover: z.string().url().optional(),
});

// Timing-safe string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication: supports both X-API-Key and JWT Bearer token
  // X-API-Key grants admin access, JWT Bearer identifies the specific user
  // Also supports ?apiKey= query param for SSE (EventSource can't send headers)
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'] || (request.query as { apiKey?: string }).apiKey;
    const authHeader = request.headers['authorization'];

    // Try JWT Bearer token first (for user-specific access control)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenData = await verifyToken(token);
      
      if (tokenData) {
        const user = await prisma.user.findUnique({
          where: { id: tokenData.userId },
          select: { id: true, username: true, role: true },
        });
        
        if (user) {
          (request as any).user = user as AuthUser;
          // Valid JWT is sufficient for authentication
          return; // Auth successful
        }
      }
    }

    // Fall back to API key only (for automation/scripts - treated as admin)
    if (!apiKey || typeof apiKey !== 'string') {
      logger.warn({ ip: getClientIp(request) }, 'Admin API request without credentials');
      return reply.status(401).send({ error: 'Authorization required' });
    }

    if (!secureCompare(apiKey, config.admin.apiKey)) {
      logger.warn({ ip: getClientIp(request) }, 'Admin API request with invalid API key');
      return reply.status(401).send({ error: 'Invalid API key' });
    }

    // API key only - find admin user to attach
    const adminUser = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true, username: true, role: true },
    });
    
    if (adminUser) {
      (request as any).user = adminUser as AuthUser;
    }
  });

  // Helper to check if user is admin
  const isAdmin = (request: FastifyRequest): boolean => {
    return (request as any).user?.role === UserRole.ADMIN;
  };

  // Helper to get current user
  const getUser = (request: FastifyRequest): AuthUser | undefined => {
    return (request as any).user;
  };

  // ==================== REGISTERED USER MANAGEMENT (Admins/Resellers) ====================

  // List registered users (admins, resellers)
  // Resellers only see their own sub-resellers (children)
  fastify.get('/users', async (request, reply) => {
    const { page = '1', limit = '50', search, role } = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      role?: UserRole;
    };

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const currentUser = getUser(request);

    const where: any = {};
    
    // Non-admin users can only see their direct children (sub-resellers)
    if (!isAdmin(request) && currentUser) {
      where.parentId = currentUser.id;
    }
    
    if (search) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    if (role) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          status: true,
          credits: true,
          notes: true,
          parentId: true,
          createdAt: true,
          lastActivity: true,
          _count: {
            select: { iptvLines: true, children: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  });

  // Get registered user by ID
  // Resellers can only view their own sub-resellers
  fastify.get('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const currentUser = getUser(request);
    const targetUserId = parseInt(id);

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: {
        parent: { select: { id: true, username: true } },
        children: { select: { id: true, username: true, role: true } },
        _count: { select: { iptvLines: true } },
      },
    });

    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }

    // Non-admins can only view their own children
    if (!isAdmin(request) && currentUser) {
      if (user.parentId !== currentUser.id) {
        return reply.status(403).send({ error: 'Access denied' });
      }
    }

    return user;
  });

  // Create registered user (admin/reseller/sub-reseller)
  // Resellers can only create SUB_RESELLER users as their children
  fastify.post('/users', async (request, reply) => {
    const data = createUserSchema.parse(request.body);
    const currentUser = getUser(request);
    const initialCredits = data.credits || 0;

    // Role-based restrictions for user creation
    if (!isAdmin(request) && currentUser) {
      // Non-admins (resellers/sub-resellers) can only create SUB_RESELLER
      if (data.role !== UserRole.SUB_RESELLER) {
        return reply.status(403).send({ 
          error: 'You can only create sub-reseller accounts' 
        });
      }
      // Force the parent to be the current user
      data.parentId = currentUser.id;

      // If initial credits are specified, check reseller has enough and deduct
      if (initialCredits > 0) {
        const reseller = await prisma.user.findUnique({
          where: { id: currentUser.id },
          select: { credits: true },
        });

        if (!reseller || reseller.credits < initialCredits) {
          return reply.status(400).send({ 
            error: `Insufficient credits. You have ${reseller?.credits || 0} credits, but need ${initialCredits}` 
          });
        }
      }
    }

    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      return reply.status(400).send({ error: 'Username already exists' });
    }

    // Hash password before storing
    const hashedPassword = await passwordService.hash(data.password);

    // Use transaction if reseller is giving initial credits
    if (!isAdmin(request) && currentUser && initialCredits > 0) {
      // Get reseller's current balance for transaction record
      const reseller = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: { credits: true },
      });

      const result = await prisma.$transaction(async (tx) => {
        // Create the sub-reseller with initial credits
        const newUser = await tx.user.create({
          data: {
            ...data,
            password: hashedPassword,
            credits: initialCredits,
          },
        });

        // Deduct credits from reseller
        await tx.user.update({
          where: { id: currentUser.id },
          data: { credits: { decrement: initialCredits } },
        });

        // Record transaction for reseller (TRANSFER_OUT)
        await tx.creditTransaction.create({
          data: {
            userId: currentUser.id,
            type: 'TRANSFER_OUT',
            amount: initialCredits,
            balanceBefore: reseller!.credits,
            balanceAfter: reseller!.credits - initialCredits,
            description: `Initial credits for new sub-reseller: ${data.username}`,
            transferToId: newUser.id,
            createdById: currentUser.id,
          },
        });

        // Record transaction for sub-reseller (TRANSFER_IN)
        await tx.creditTransaction.create({
          data: {
            userId: newUser.id,
            type: 'TRANSFER_IN',
            amount: initialCredits,
            balanceBefore: 0,
            balanceAfter: initialCredits,
            description: `Initial credits from reseller`,
            transferFromId: currentUser.id,
            createdById: currentUser.id,
          },
        });

        return newUser;
      });

      // Send notification to the new sub-reseller about initial credits
      await notificationService.create({
        userId: result.id,
        type: NotificationType.CREDIT,
        title: 'Welcome! Credits Received',
        message: `Your account has been created with ${initialCredits} initial credits. Welcome to the platform!`,
        link: '/admin/credits',
      });

      // Don't return the password hash
      const { password: _, ...userWithoutPassword } = result;
      return reply.status(201).send(userWithoutPassword);
    }

    // Admin creating user or no initial credits - simple create
    const user = await prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });

    // Don't return the password hash
    const { password: _, ...userWithoutPassword } = user;
    return reply.status(201).send(userWithoutPassword);
  });

  // Update registered user
  // Resellers can only update their own sub-resellers
  fastify.put('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateUserSchema.parse(request.body);
    const currentUser = getUser(request);
    const targetUserId = parseInt(id);

    // Non-admins can only update their own children
    if (!isAdmin(request) && currentUser) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { parentId: true, role: true },
      });

      if (!targetUser || targetUser.parentId !== currentUser.id) {
        return reply.status(403).send({ error: 'You can only edit your own sub-resellers' });
      }

      // Prevent resellers from changing role to anything other than SUB_RESELLER
      if (data.role && data.role !== UserRole.SUB_RESELLER) {
        return reply.status(403).send({ error: 'You can only manage sub-reseller accounts' });
      }
    }

    // Hash password if provided
    const updateData = { ...data };
    if (data.password) {
      updateData.password = await passwordService.hash(data.password);
    }

    const user = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
    });

    // Invalidate cache
    await cache.invalidatePattern(`admin_auth:${user.username}:*`);

    // Don't return the password hash
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });

  // Delete registered user
  // Resellers can only delete their own sub-resellers
  fastify.delete('/users/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const currentUser = getUser(request);
    const targetUserId = parseInt(id);

    // Non-admins can only delete their own children
    if (!isAdmin(request) && currentUser) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { parentId: true },
      });

      if (!targetUser || targetUser.parentId !== currentUser.id) {
        return reply.status(403).send({ error: 'You can only delete your own sub-resellers' });
      }
    }

    try {
      // Use transaction to handle cascading deletes
      const user = await prisma.$transaction(async (tx) => {
        // Delete related records first
        await tx.creditTransaction.deleteMany({
          where: { 
            OR: [
              { userId: targetUserId },
              { transferFromId: targetUserId },
              { transferToId: targetUserId },
              { createdById: targetUserId }
            ]
          },
        });

        await tx.notification.deleteMany({
          where: { userId: targetUserId },
        });

        await tx.userRoleAssignment.deleteMany({
          where: { userId: targetUserId },
        });

        // Delete the user
        return await tx.user.delete({
          where: { id: targetUserId },
        });
      });

      await cache.invalidatePattern(`admin_auth:${user.username}:*`);

      return { success: true };
    } catch (error: any) {
      request.log.error(error);
      return reply.status(500).send({ 
        error: 'Failed to delete user. The user may have related data that needs to be removed first.' 
      });
    }
  });

  // ==================== IPTV LINES MANAGEMENT (Subscribers) ====================

  // List IPTV lines
  // Resellers only see lines they own
  fastify.get('/lines', async (request, reply) => {
    const { page = '1', limit = '50', search, ownerId, status } = request.query as {
      page?: string;
      limit?: string;
      search?: string;
      ownerId?: string;
      status?: IptvLineStatus;
    };

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const currentUser = getUser(request);

    const where: any = {};
    
    // Non-admin users can only see their own lines
    if (!isAdmin(request) && currentUser) {
      where.ownerId = currentUser.id;
    } else if (ownerId) {
      // Admin can filter by ownerId
      where.ownerId = parseInt(ownerId);
    }
    
    if (search) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { username: { contains: search, mode: 'insensitive' as const } },
          { notes: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    if (status) {
      where.status = status;
    }

    const [lines, total] = await Promise.all([
      prisma.iptvLine.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          username: true,
          password: true,
          status: true,
          maxConnections: true,
          expiresAt: true,
          isTrial: true,
          createdAt: true,
          lastActivity: true,
          allowHls: true,
          allowMpegts: true,
          allowRtmp: true,
          adminNotes: true,
          resellerNotes: true,
          forcedServerId: true,
          isMinistraPortal: true,
          isRestreamer: true,
          isEnigmaDevice: true,
          isMagDevice: true,
          magStbLock: true,
          ispLock: true,
          ispDescription: true,
          forcedCountry: true,
          allowedIps: true,
          allowedUserAgents: true,
          owner: { select: { id: true, username: true } },
          bouquets: {
            select: {
              bouquetId: true,
              bouquet: { select: { id: true, name: true } },
            },
          },
          _count: { select: { bouquets: true, connections: true } },
        },
      }),
      prisma.iptvLine.count({ where }),
    ]);

    // Get actual active connection counts from Redis for each line
    const { redis } = await import('../../config/redis.js');
    const linesWithConnections = await Promise.all(
      lines.map(async (line) => {
        await cleanupExpiredHlsConnections(line.id);
        const connectionKey = `connections:${line.id}`;
        const activeConnections = await redis.scard(connectionKey);
        return {
          ...line,
          activeConnections,
        };
      })
    );

    return {
      lines: linesWithConnections,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  });

  // Get IPTV line by ID
  fastify.get('/lines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const line = await prisma.iptvLine.findUnique({
      where: { id: parseInt(id) },
      include: {
        owner: { select: { id: true, username: true } },
        bouquets: {
          include: { bouquet: true },
        },
      },
    });

    if (!line) {
      return reply.status(404).send({ error: 'IPTV Line not found' });
    }

    // Get active connections from Redis
    const { redis } = await import('../../config/redis.js');
    const connectionKey = `connections:${line.id}`;
    const activeConnectionIds = await redis.smembers(connectionKey);
    
    const activeConnections = activeConnectionIds.length > 0
      ? await prisma.lineConnection.findMany({
          where: { id: { in: activeConnectionIds } },
          orderBy: { startedAt: 'desc' },
          take: 10,
        })
      : [];

    return {
      ...line,
      connections: activeConnections,
      activeConnectionCount: activeConnectionIds.length,
    };
  });

  // Create IPTV line
  fastify.post('/lines', async (request, reply) => {
    const data = createLineSchema.parse(request.body);

    // Check if username exists in IptvLine table
    const existingLine = await prisma.iptvLine.findUnique({
      where: { username: data.username },
    });

    if (existingLine) {
      return reply.status(400).send({ error: 'Username already exists' });
    }

    // Verify owner exists and is a reseller or admin (if provided)
    if (data.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: data.ownerId },
      });

      if (!owner) {
        return reply.status(400).send({ error: 'Owner not found' });
      }
    }

    // Calculate expiration date
    let finalExpiresAt: Date | null = null;
    let subscriptionDays = 0;

    if (data.expiresAt) {
      finalExpiresAt = new Date(data.expiresAt);
      // Calculate days from now
      subscriptionDays = Math.ceil((finalExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    } else if (data.subscriptionDays) {
      subscriptionDays = data.subscriptionDays;
      finalExpiresAt = new Date(Date.now() + subscriptionDays * 24 * 60 * 60 * 1000);
    }

    // Handle credit deduction if requested
    if (data.deductCredits && data.ownerId && subscriptionDays > 0) {
      const creditCost = creditService.calculateCost(subscriptionDays);
      const hasCredits = await creditService.hasCredits(data.ownerId, creditCost);

      if (!hasCredits) {
        const balance = await creditService.getBalance(data.ownerId);
        return reply.status(400).send({
          error: 'Insufficient credits',
          required: creditCost,
          available: balance,
        });
      }
    }

    const { bouquetIds, expiresAt, subscriptionDays: _subDays, deductCredits, ...lineData } = data;

    const line = await prisma.iptvLine.create({
      data: {
        ...lineData,
        expiresAt: finalExpiresAt,
        bouquets: bouquetIds
          ? {
            create: bouquetIds.map((id) => ({ bouquetId: id })),
          }
          : undefined,
      },
      include: {
        owner: { select: { id: true, username: true } },
        bouquets: {
          include: { bouquet: { select: { id: true, name: true } } },
        },
      },
    });

    // Deduct credits after successful line creation
    if (deductCredits && data.ownerId && subscriptionDays > 0) {
      const creditCost = creditService.calculateCost(subscriptionDays);
      await creditService.deduct(
        data.ownerId,
        creditCost,
        `Line created: ${line.username} (${subscriptionDays} days)`,
        line.id
      );
    }

    // Send notification about new line creation
    try {
      if (line.ownerId) {
        const expirationText = line.expiresAt 
          ? ` and expires on ${new Date(line.expiresAt).toLocaleDateString()}`
          : '';
        
        await notificationService.create({
          userId: line.ownerId,
          type: NotificationType.LINE,
          title: 'New IPTV Line Created',
          message: `Your new IPTV line "${line.username}" has been created successfully${expirationText}.`,
        });

        // Also notify parent reseller if applicable
        if (line.owner) {
          const owner = await prisma.user.findUnique({
            where: { id: line.ownerId },
            select: { parentId: true, username: true },
          });
          
          if (owner?.parentId) {
            await notificationService.create({
              userId: owner.parentId,
              type: NotificationType.LINE,
              title: 'Sub-Reseller Line Created',
              message: `Sub-reseller ${owner.username} created a new line "${line.username}"${expirationText}.`,
            });
          }
        }
      }
    } catch (error) {
      // Don't fail the line creation if notification fails
      logger.warn({ error, lineId: line.id }, 'Failed to send line creation notification');
    }

    return reply.status(201).send(line);
  });

  // Update IPTV line
  fastify.put('/lines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateLineSchema.parse(request.body);

    const { bouquetIds, expiresAt, ...lineData } = data;

    const line = await prisma.iptvLine.update({
      where: { id: parseInt(id) },
      data: {
        ...lineData,
        expiresAt: expiresAt !== undefined
          ? expiresAt ? new Date(expiresAt) : null
          : undefined,
      },
    });

    // Update bouquets if provided
    if (bouquetIds !== undefined) {
      await prisma.lineBouquet.deleteMany({
        where: { lineId: parseInt(id) },
      });

      if (bouquetIds.length > 0) {
        await prisma.lineBouquet.createMany({
          data: bouquetIds.map((bouquetId) => ({
            lineId: parseInt(id),
            bouquetId,
          })),
        });
      }
    }

    // Invalidate cache
    await cache.invalidatePattern(`line_auth:${line.username}:*`);

    return line;
  });

  // Delete IPTV line
  fastify.delete('/lines/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const line = await prisma.iptvLine.delete({
      where: { id: parseInt(id) },
    });

    await cache.invalidatePattern(`line_auth:${line.username}:*`);

    return { success: true };
  });

  // Bulk create IPTV lines
  fastify.post('/lines/bulk', async (request, reply) => {
    const {
      count,
      prefix,
      ownerId,
      bouquetIds,
      maxConnections = 1,
      expirationDate,
      subscriptionDays,
      deductCredits = false,
    } = request.body as {
      count: number;
      prefix: string;
      ownerId: number;
      bouquetIds?: number[];
      maxConnections?: number;
      expirationDate?: string;
      subscriptionDays?: number;
      deductCredits?: boolean;
    };

    if (!count || count < 1 || count > 1000) {
      return reply.status(400).send({ error: 'Count must be between 1 and 1000' });
    }

    // Calculate expiration and subscription days
    let finalExpirationDate: Date | null = null;
    let effectiveSubDays = 0;

    if (expirationDate) {
      finalExpirationDate = new Date(expirationDate);
      effectiveSubDays = Math.ceil((finalExpirationDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    } else if (subscriptionDays) {
      effectiveSubDays = subscriptionDays;
      finalExpirationDate = new Date(Date.now() + subscriptionDays * 24 * 60 * 60 * 1000);
    }

    // Handle credit deduction if requested
    if (deductCredits && ownerId && effectiveSubDays > 0) {
      const creditCostPerLine = creditService.calculateCost(effectiveSubDays);
      const totalCreditCost = creditCostPerLine * count;
      const hasCredits = await creditService.hasCredits(ownerId, totalCreditCost);

      if (!hasCredits) {
        const balance = await creditService.getBalance(ownerId);
        return reply.status(400).send({
          error: 'Insufficient credits',
          required: totalCreditCost,
          available: balance,
          costPerLine: creditCostPerLine,
        });
      }
    }

    // Generate random passwords
    const generatePassword = () => Math.random().toString(36).slice(2, 10);

    const lines = [];
    for (let i = 0; i < count; i++) {
      const username = `${prefix}${Date.now()}${i}`;
      const password = generatePassword();

      lines.push({
        username,
        password,
        ownerId,
        maxConnections,
        expiresAt: finalExpirationDate,
      });
    }

    const created = await prisma.iptvLine.createMany({
      data: lines,
    });

    // If bouquets specified, assign them
    if (bouquetIds && bouquetIds.length > 0) {
      const createdLines = await prisma.iptvLine.findMany({
        where: { username: { in: lines.map(l => l.username) } },
        select: { id: true },
      });

      const bouquetAssignments = createdLines.flatMap(line =>
        bouquetIds.map(bouquetId => ({
          lineId: line.id,
          bouquetId,
        }))
      );

      await prisma.lineBouquet.createMany({
        data: bouquetAssignments,
      });
    }

    // Deduct credits after successful bulk creation
    if (deductCredits && ownerId && effectiveSubDays > 0) {
      const creditCostPerLine = creditService.calculateCost(effectiveSubDays);
      const totalCreditCost = creditCostPerLine * count;
      await creditService.deduct(
        ownerId,
        totalCreditCost,
        `Bulk lines created: ${count} lines (${effectiveSubDays} days each)`
      );
    }

    return {
      success: true,
      created: created.count,
      lines: lines.map(l => ({ username: l.username, password: l.password })),
    };
  });

  // Reset IPTV line password
  fastify.post('/lines/:id/reset-password', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };

    if (!password) {
      return reply.status(400).send({ error: 'Password is required' });
    }

    const line = await prisma.iptvLine.update({
      where: { id: parseInt(id) },
      data: { password },
    });

    // Invalidate cache for this line
    await cache.invalidatePattern(`line_auth:${line.username}:*`);

    return { success: true, password };
  });

  // Kill all connections for an IPTV line
  fastify.post('/lines/:id/kill-connections', async (request, reply) => {
    const { id } = request.params as { id: string };

    const line = await prisma.iptvLine.findUnique({
      where: { id: parseInt(id) },
    });

    if (!line) {
      return reply.status(404).send({ error: 'Line not found' });
    }

    // Delete all active connections for this line
    await prisma.lineConnection.deleteMany({
      where: { lineId: parseInt(id) },
    });

    return { success: true };
  });

  // Bulk delete IPTV lines
  fastify.post('/lines/bulk-delete', async (request, reply) => {
    const { ids } = request.body as { ids: number[] };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'IDs array is required' });
    }

    // Get usernames before deletion for cache invalidation
    const lines = await prisma.iptvLine.findMany({
      where: { id: { in: ids } },
      select: { username: true },
    });

    // Delete connections first
    await prisma.lineConnection.deleteMany({
      where: { lineId: { in: ids } },
    });

    // Delete bouquet assignments
    await prisma.lineBouquet.deleteMany({
      where: { lineId: { in: ids } },
    });

    // Delete the lines
    const result = await prisma.iptvLine.deleteMany({
      where: { id: { in: ids } },
    });

    // Invalidate cache for all deleted lines
    for (const line of lines) {
      await cache.invalidatePattern(`line_auth:${line.username}:*`);
    }

    return { success: true, deleted: result.count };
  });

  // Bulk extend IPTV lines expiration
  fastify.post('/lines/bulk-extend', async (request, reply) => {
    const { ids, days } = request.body as { ids: number[]; days: number };

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return reply.status(400).send({ error: 'IDs array is required' });
    }

    if (!days || days < 1) {
      return reply.status(400).send({ error: 'Days must be at least 1' });
    }

    // Update each line's expiration date
    const results = await Promise.all(ids.map(async id => {
      const line = await prisma.iptvLine.findUnique({
        where: { id },
        select: { expiresAt: true },
      });

      if (!line) return null;

      const currentExpiry = line.expiresAt || new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      const newExpiry = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

      return prisma.iptvLine.update({
        where: { id },
        data: { expiresAt: newExpiry, status: 'active' },
      });
    }));

    const updated = results.filter(r => r !== null).length;

    return { success: true, updated };
  });

  // Get bouquets assigned to a line
  fastify.get('/lines/:id/bouquets', async (request, reply) => {
    const { id } = request.params as { id: string };

    const lineBouquets = await prisma.lineBouquet.findMany({
      where: { lineId: parseInt(id) },
      include: { bouquet: true },
    });

    return lineBouquets.map(lb => lb.bouquet);
  });

  // Update bouquets for a line
  fastify.put('/lines/:id/bouquets', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { bouquetIds } = request.body as { bouquetIds: number[] };

    const lineId = parseInt(id);

    // Remove existing assignments
    await prisma.lineBouquet.deleteMany({
      where: { lineId },
    });

    // Add new assignments
    if (bouquetIds && bouquetIds.length > 0) {
      await prisma.lineBouquet.createMany({
        data: bouquetIds.map(bouquetId => ({
          lineId,
          bouquetId,
        })),
      });
    }

    return { success: true };
  });

  // ==================== STREAM MANAGEMENT ====================

  // List streams
  fastify.get('/streams', async (request, reply) => {
    const { page = '1', limit = '50', type, categoryId, search, sortBy, sortOrder = 'asc', allIds } = request.query as {
      page?: string;
      limit?: string;
      type?: StreamType;
      categoryId?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      allIds?: string;
    };

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());
    const categoryIdNum = categoryId ? parseInt(categoryId.toString()) : undefined;

    const where: any = {};
    if (type) where.streamType = type;
    if (categoryIdNum) where.categoryId = categoryIdNum;
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    // If allIds=true, return only IDs for bulk operations
    if (allIds === 'true') {
      const streams = await prisma.stream.findMany({
        where,
        select: { id: true },
      });
      return { ids: streams.map(s => s.id) };
    }

    // Build orderBy based on sortBy param
    const validSortFields = ['name', 'streamType', 'isActive', 'alwaysOn', 'createdAt', 'updatedAt', 'sortOrder'];
    let orderBy: any[] = [{ sortOrder: 'asc' }, { name: 'asc' }];
    if (sortBy && validSortFields.includes(sortBy)) {
      const order = sortOrder === 'desc' ? 'desc' : 'asc';
      if (sortBy === 'category') {
        orderBy = [{ category: { name: order } }, { name: 'asc' }];
      } else {
        orderBy = [{ [sortBy]: order }, { name: 'asc' }];
      }
    }

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy,
        include: {
          category: { select: { id: true, name: true } },
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
          serverDistribution: {
            include: {
              server: { select: { id: true, name: true, status: true, region: true } },
            },
            orderBy: { tier: 'asc' },
          },
        },
      }),
      prisma.stream.count({ where }),
    ]);

    // Enhance streams with status info
    const enhancedStreams = await Promise.all(streams.map(async stream => {
      if (stream.alwaysOn) {
        // Always-on streams are always "active" when enabled
        // Get status with live viewer count from Redis (includes both standard and ABR viewers)
        const alwaysOnStatus = await alwaysOnStreamManager.getStreamStatusAsync(stream.id);
        // Get viewer count directly from Redis (works for streams on edge servers)
        const viewerCount = await alwaysOnStreamManager.getViewerCount(stream.id);
        
        // If no local status but stream is running on another server, construct status from DB
        // This handles streams running on edge servers when queried from main panel
        let effectiveAlwaysOnStatus = alwaysOnStatus ? {
          status: alwaysOnStatus.status,
          viewers: viewerCount,
          startedAt: alwaysOnStatus.startedAt?.toISOString(),
          restartCount: alwaysOnStatus.restartCount,
        } : null;
        
        if (!effectiveAlwaysOnStatus && stream.runningServerId && stream.streamStatus === 'RUNNING') {
          // Stream is running on edge server - use DB fields
          effectiveAlwaysOnStatus = {
            status: 'running' as const,
            viewers: viewerCount,
            startedAt: stream.lastStartedAt?.toISOString() || undefined,
            restartCount: 0,
          };
        }
        
        return {
          ...stream,
          displayStatus: 'active', // Always-on = always active
          viewerCount, // Use direct Redis count (handles edge servers)
          alwaysOnStatus: effectiveAlwaysOnStatus,
        };
      } else if (stream.streamType === 'VOD') {
        // VOD streams - get VOD viewer count
        const viewerCount = await vodViewerManager.getViewerCount(stream.id);
        return {
          ...stream,
          displayStatus: viewerCount > 0 ? 'active' : 'on_demand',
          viewerCount,
        };
      } else {
        // On-demand LIVE streams: active when viewers, on_demand when idle
        // Check both on-demand and ABR viewer counts
        const onDemandViewerCount = await onDemandStreamManager.getViewerCount(stream.id);
        const abrViewerCount = await abrStreamManager.getViewerCount(stream.id);
        const viewerCount = onDemandViewerCount + abrViewerCount;
        
        // Check status from both managers (local status)
        const onDemandStatus = onDemandStreamManager.getStreamStatus(stream.id);
        const isAbrRunning = abrStreamManager.isAbrStreamRunning(stream.id);
        
        // Determine display status: 
        // - If ABR is running locally, it's active
        // - If on-demand manager says active/stopping, use that
        // - Otherwise, use viewer count from Redis (handles edge server streams)
        let displayStatus: 'active' | 'on_demand' | 'stopping';
        if (isAbrRunning) {
          displayStatus = 'active';
        } else if (onDemandStatus === 'active' || onDemandStatus === 'stopping') {
          displayStatus = onDemandStatus;
        } else {
          // Check Redis viewer count for streams running on edge servers
          displayStatus = viewerCount > 0 ? 'active' : 'on_demand';
        }
        
        return {
          ...stream,
          displayStatus,
          viewerCount,
        };
      }
    }));

    return {
      streams: enhancedStreams,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  });

  // Get stream by ID
  fastify.get('/streams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: true,
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        bouquets: {
          include: { bouquet: true },
        },
        serverAssignments: {
          include: {
            server: { select: { id: true, name: true, status: true, region: true, type: true } },
          },
        },
      },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Add viewer count for VOD streams
    if (stream.streamType === 'VOD') {
      const viewerCount = await vodViewerManager.getViewerCount(stream.id);
      return {
        ...stream,
        viewerCount,
      };
    }

    return stream;
  });

  // Create stream
  fastify.post('/streams', async (request, reply) => {
    const data = createStreamSchema.parse(request.body);
    const { serverIds, bouquetIds, originServerId, childServerIds, categoryIds, ...streamData } = data;

    // Determine categoryIds array (support both old single categoryId and new categoryIds array)
    const finalCategoryIds = categoryIds || (streamData.categoryId ? [streamData.categoryId] : []);
    const primaryCategoryId = finalCategoryIds[0];

    // Validate distribution config if provided
    if (originServerId) {
      if (childServerIds?.includes(originServerId)) {
        return reply.status(400).send({ error: 'Origin server cannot be in child servers list' });
      }
    }

    const stream = await prisma.stream.create({
      data: {
        ...streamData,
        categoryId: primaryCategoryId, // Keep for backward compatibility
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : null,
        originServerId: originServerId || null,
        categories: {
          create: finalCategoryIds.map((catId: number, index: number) => ({
            categoryId: catId,
            isPrimary: index === 0,
          })),
        },
        // Legacy server assignments (deprecated)
        serverAssignments: serverIds && serverIds.length > 0
          ? {
              create: serverIds.map((serverId) => ({
                serverId,
                isActive: true,
                priority: 100,
              })),
            }
          : undefined,
        bouquets: bouquetIds && bouquetIds.length > 0
          ? {
              create: bouquetIds.map((bouquetId) => ({
                bouquetId,
              })),
            }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
        originServer: { select: { id: true, name: true, status: true } },
        serverAssignments: {
          include: {
            server: { select: { id: true, name: true, status: true, region: true } },
          },
        },
        bouquets: {
          include: {
            bouquet: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Configure server distribution if origin server is specified
    if (originServerId) {
      try {
        await streamDistributionService.configureDistribution({
          streamId: stream.id,
          originServerId,
          childServerIds: childServerIds || [],
        });
      } catch (err: any) {
        logger.error({ err, streamId: stream.id }, 'Failed to configure stream distribution');
        // Don't fail the entire creation, just log the error
      }
    }

    // Handle always-on for new LIVE streams - use enableAlwaysOn which respects distribution
    if (stream.streamType === 'LIVE' && stream.alwaysOn) {
      alwaysOnStreamManager.enableAlwaysOn(stream.id)
        .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to start always-on stream'));
    }

    return reply.status(201).send(stream);
  });

  // Update stream
  fastify.put('/streams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = updateStreamSchema.parse(request.body);
    const { serverIds, bouquetIds, originServerId, childServerIds, categoryIds, ...streamData } = data;

    // Validate distribution config if provided
    if (originServerId !== undefined && childServerIds?.includes(originServerId)) {
      return reply.status(400).send({ error: 'Origin server cannot be in child servers list' });
    }

    // Get old stream state to compare
    const oldStream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      select: { alwaysOn: true, streamType: true, abrProfileId: true, sourceUrl: true, originServerId: true },
    });

    // Handle category updates
    const finalCategoryIds = categoryIds || (streamData.categoryId !== undefined ? [streamData.categoryId] : null);
    
    if (finalCategoryIds) {
      const primaryCategoryId = finalCategoryIds[0];

      // Use transaction to update stream and categories
      await prisma.$transaction(async (tx) => {
        // Delete existing category associations
        await tx.streamCategory.deleteMany({
          where: { streamId: parseInt(id) },
        });

        // Create new category associations
        await tx.streamCategory.createMany({
          data: finalCategoryIds.map((catId: number, index: number) => ({
            streamId: parseInt(id),
            categoryId: catId,
            isPrimary: index === 0,
          })),
        });

        // Update the stream
        await tx.stream.update({
          where: { id: parseInt(id) },
          data: {
            ...streamData,
            categoryId: primaryCategoryId,
            originServerId: originServerId !== undefined ? originServerId : undefined,
            releaseDate: streamData.releaseDate ? new Date(streamData.releaseDate) : undefined,
          },
        });
      });
    } else {
      // No category change, just update stream fields
      await prisma.stream.update({
        where: { id: parseInt(id) },
        data: {
          ...streamData,
          originServerId: originServerId !== undefined ? originServerId : undefined,
          releaseDate: streamData.releaseDate ? new Date(streamData.releaseDate) : undefined,
        },
      });
    }

    // Get updated stream
    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: { select: { id: true, name: true } },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Handle server distribution if origin server is specified
    if (originServerId !== undefined) {
      try {
        await streamDistributionService.configureDistribution({
          streamId: parseInt(id),
          originServerId,
          childServerIds: childServerIds || [],
        });
      } catch (err: any) {
        logger.error({ err, streamId: parseInt(id) }, 'Failed to configure stream distribution');
      }
    }

    // Handle legacy server assignments if provided
    if (serverIds !== undefined) {
      // Delete existing assignments
      await prisma.serverStream.deleteMany({
        where: { streamId: parseInt(id) },
      });

      // Create new assignments
      if (serverIds.length > 0) {
        await prisma.serverStream.createMany({
          data: serverIds.map((serverId: number) => ({
            streamId: parseInt(id),
            serverId,
            isActive: true,
            priority: 100,
          })),
        });
      }
    }

    // Handle bouquet assignments if provided
    if (bouquetIds !== undefined) {
      // Delete existing bouquet assignments
      await prisma.bouquetStream.deleteMany({
        where: { streamId: parseInt(id) },
      });

      // Create new bouquet assignments
      if (bouquetIds.length > 0) {
        await prisma.bouquetStream.createMany({
          data: bouquetIds.map((bouquetId: number) => ({
            streamId: parseInt(id),
            bouquetId,
          })),
        });
      }
    }

    // Return updated stream with categories
    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Handle always-on state changes
    if (stream.streamType === 'LIVE') {
      const wasAlwaysOn = oldStream?.alwaysOn || false;
      const isAlwaysOn = stream.alwaysOn;

      if (!wasAlwaysOn && isAlwaysOn) {
        // Enable always-on
        alwaysOnStreamManager.enableAlwaysOn(stream.id)
          .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to enable always-on'));
      } else if (wasAlwaysOn && !isAlwaysOn) {
        // Disable always-on
        alwaysOnStreamManager.disableAlwaysOn(stream.id)
          .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to disable always-on'));
      } else if (isAlwaysOn && (streamData.sourceUrl || streamData.backupUrls)) {
        // Source URLs changed, reload the stream
        alwaysOnStreamManager.reload()
          .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to reload always-on streams'));
      }

      // Handle ABR profile changes - restart FFmpeg if profile changed while stream is running
      const oldAbrProfileId = oldStream?.abrProfileId;
      const newAbrProfileId = stream.abrProfileId;
      
      if (oldAbrProfileId !== newAbrProfileId && abrStreamManager.isAbrStreamRunning(stream.id)) {
        logger.info({ 
          streamId: stream.id, 
          oldAbrProfileId, 
          newAbrProfileId 
        }, 'ABR profile changed, restarting stream with new profile');
        
        if (newAbrProfileId) {
          // Restart with new profile
          abrStreamManager.restartWithNewProfile(stream.id, newAbrProfileId, stream.sourceUrl)
            .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to restart ABR stream with new profile'));
        } else {
          // ABR profile removed, stop the ABR stream
          abrStreamManager.stopAbrStream(stream.id, true)
            .catch(err => logger.error({ err, streamId: stream.id }, 'Failed to stop ABR stream after profile removal'));
        }
      }
    }

    // Invalidate cache
    await cache.del(cache.KEYS.STREAM(parseInt(id)));

    // Re-fetch stream with all relations
    const updatedStream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: { select: { id: true, name: true } },
        serverAssignments: {
          include: {
            server: { select: { id: true, name: true, status: true, region: true } },
          },
        },
      },
    });

    return updatedStream;
  });

  // Bulk update streams - efficient batch operation
  fastify.put('/streams/bulk', async (request, reply) => {
    const { streamIds, updates } = bulkUpdateStreamsSchema.parse(request.body);
    
    const results = {
      updated: 0,
      failed: 0,
      errors: [] as { streamId: number; error: string }[],
    };

    // Build the update data for Prisma
    const updateData: any = {};
    if (updates.categoryId !== undefined) updateData.categoryId = updates.categoryId;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.alwaysOn !== undefined) updateData.alwaysOn = updates.alwaysOn;

    // Perform bulk update for simple fields using updateMany (very efficient)
    if (Object.keys(updateData).length > 0) {
      const updateResult = await prisma.stream.updateMany({
        where: { id: { in: streamIds } },
        data: updateData,
      });
      results.updated = updateResult.count;
    }

    // Handle server assignments if provided
    if (updates.serverIds !== undefined && updates.serverIds.length > 0) {
      if (updates.cascadeDistribution) {
        // Use cascade distribution - first server is origin, rest are children
        const [originServerId, ...childServerIds] = updates.serverIds;
        
        // Configure distribution for each stream
        for (const streamId of streamIds) {
          try {
            await streamDistributionService.configureDistribution({
              streamId,
              originServerId,
              childServerIds,
            });
          } catch (err: any) {
            logger.error({ err, streamId }, 'Failed to configure cascade distribution');
            results.errors.push({ streamId, error: err.message });
            results.failed++;
          }
        }
        results.updated = streamIds.length - results.failed;
      } else {
        // Legacy server assignments (non-cascade)
        // Delete existing server assignments for all streams in batch
        await prisma.serverStream.deleteMany({
          where: { streamId: { in: streamIds } },
        });

        // Create new assignments in batch
        const newAssignments = streamIds.flatMap(streamId =>
          updates.serverIds!.map(serverId => ({
            streamId,
            serverId,
            isActive: true,
            priority: 100,
          }))
        );
        
        await prisma.serverStream.createMany({
          data: newAssignments,
          skipDuplicates: true,
        });
        
        results.updated = streamIds.length;
      }
    }

    // Handle always-on state changes for LIVE streams
    if (updates.alwaysOn !== undefined) {
      const liveStreams = await prisma.stream.findMany({
        where: { 
          id: { in: streamIds },
          streamType: 'LIVE',
        },
        select: { id: true, alwaysOn: true },
      });

      for (const stream of liveStreams) {
        try {
          if (updates.alwaysOn) {
            await alwaysOnStreamManager.enableAlwaysOn(stream.id);
          } else {
            await alwaysOnStreamManager.disableAlwaysOn(stream.id);
          }
        } catch (err: any) {
          logger.error({ err, streamId: stream.id }, 'Failed to update always-on state');
          results.errors.push({ streamId: stream.id, error: err.message });
        }
      }
    }

    // Invalidate cache for all updated streams
    await Promise.all(
      streamIds.map(id => cache.del(cache.KEYS.STREAM(id)))
    );

    return {
      success: true,
      updated: results.updated,
      failed: results.errors.length,
      errors: results.errors.length > 0 ? results.errors : undefined,
    };
  });

  // Reorder streams within a category
  fastify.put('/streams/categories/reorder', async (request, reply) => {
    const { categoryId, streamOrders } = z.object({
      categoryId: z.number(),
      streamOrders: z.array(
        z.object({
          streamId: z.number(),
          sortOrder: z.number(),
        })
      ),
    }).parse(request.body);

    await Promise.all(
      streamOrders.map((order) =>
        prisma.streamCategory.updateMany({
          where: {
            streamId: order.streamId,
            categoryId: categoryId,
          },
          data: { sortOrder: order.sortOrder },
        })
      )
    );

    await cache.invalidatePattern('categories:*');
    await Promise.all(
      streamOrders.map((order) => cache.del(cache.KEYS.STREAM(order.streamId)))
    );

    return { success: true, updated: streamOrders.length };
  });

  // Batch reorder streams (update sortOrder field directly)
  fastify.put('/streams/batch-reorder', async (request, reply) => {
    const body = z.object({
      updates: z.array(
        z.object({
          id: z.number(),
          sortOrder: z.number(),
        })
      ),
    }).parse(request.body);
    const updates = body.updates;

    await Promise.all(
      updates.map((update) =>
        prisma.stream.update({
          where: { id: update.id },
          data: { sortOrder: update.sortOrder },
        })
      )
    );

    // Invalidate cache for all updated streams
    await Promise.all(
      updates.map((update) => cache.del(cache.KEYS.STREAM(update.id)))
    );

    return { success: true, updated: updates.length };
  });

  // Delete stream
  fastify.delete('/streams/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.stream.delete({
      where: { id: parseInt(id) },
    });

    await cache.del(cache.KEYS.STREAM(parseInt(id)));

    return { success: true };
  });

  // Duplicate stream
  fastify.post('/streams/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name?: string };

    // Find the original stream with all its relations
    const original = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        serverAssignments: true,
        bouquets: true,
      },
    });

    if (!original) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Create a copy with a new name
    const { id: _, createdAt, updatedAt, ffmpegPid, streamStatus, lastStartedAt, lastError, ...streamData } = original;

    const duplicatedStream = await prisma.stream.create({
      data: {
        ...streamData,
        name: name || `${original.name} (Copy)`,
        alwaysOn: false, // Don't auto-start duplicated streams
        serverAssignments: original.serverAssignments.length > 0
          ? {
              create: original.serverAssignments.map((sa) => ({
                serverId: sa.serverId,
                isActive: sa.isActive,
                priority: sa.priority,
              })),
            }
          : undefined,
        bouquets: original.bouquets.length > 0
          ? {
              create: original.bouquets.map((b) => ({
                bouquetId: b.bouquetId,
              })),
            }
          : undefined,
      },
      include: {
        category: { select: { id: true, name: true } },
        serverAssignments: {
          include: {
            server: { select: { id: true, name: true, status: true, region: true } },
          },
        },
        bouquets: {
          include: {
            bouquet: { select: { id: true, name: true } },
          },
        },
      },
    });

    logger.info({ originalId: original.id, newId: duplicatedStream.id, name: duplicatedStream.name }, 'Duplicated stream');

    return reply.status(201).send(duplicatedStream);
  });

  // Test stream URL (without requiring stream ID)
  fastify.post('/streams/test', async (request, reply) => {
    const { url } = request.body as { url: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL is required' });
    }

    try {
      const health = await streamProxy.checkSourceHealth(url);
      return {
        success: health.online,
        message: health.online
          ? `Stream is accessible (${health.latency}ms)`
          : health.error || 'Stream is not accessible',
        ...health,
      };
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to test stream',
        isHealthy: false,
      };
    }
  });

  // Test stream by ID
  fastify.post('/streams/:id/test', async (request, reply) => {
    const { id } = request.params as { id: string };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    const health = await streamProxy.checkSourceHealth(stream.sourceUrl);

    return {
      streamId: stream.id,
      sourceUrl: stream.sourceUrl,
      ...health,
    };
  });

  // ==================== STREAM SERVER DISTRIBUTION ====================

  /**
   * Get distribution config for a stream
   * GET /admin/streams/:id/distribution
   */
  fastify.get('/streams/:id/distribution', async (request, reply) => {
    const { id } = request.params as { id: string };

    const distribution = await streamDistributionService.getDistribution(parseInt(id));

    if (!distribution) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    return distribution;
  });

  /**
   * Configure stream distribution (origin + child servers)
   * PUT /admin/streams/:id/distribution
   */
  fastify.put('/streams/:id/distribution', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { originServerId, childServerIds } = request.body as {
      originServerId: number;
      childServerIds?: number[];
    };

    if (!originServerId) {
      return reply.status(400).send({ error: 'Origin server ID is required' });
    }

    if (childServerIds?.includes(originServerId)) {
      return reply.status(400).send({ error: 'Origin server cannot be in child servers list' });
    }

    try {
      await streamDistributionService.configureDistribution({
        streamId: parseInt(id),
        originServerId,
        childServerIds: childServerIds || [],
      });

      const distribution = await streamDistributionService.getDistribution(parseInt(id));
      return distribution;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Get pull URLs for all servers serving a stream
   * GET /admin/streams/:id/distribution/pull-urls
   */
  fastify.get('/streams/:id/distribution/pull-urls', async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const pullUrls = await streamDistributionService.getAllPullUrls(parseInt(id));
      return { streamId: parseInt(id), pullUrls };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Change origin server for a stream
   * POST /admin/streams/:id/distribution/change-origin
   */
  fastify.post('/streams/:id/distribution/change-origin', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { newOriginServerId } = request.body as { newOriginServerId: number };

    if (!newOriginServerId) {
      return reply.status(400).send({ error: 'New origin server ID is required' });
    }

    try {
      await streamDistributionService.changeOriginServer(parseInt(id), newOriginServerId);
      const distribution = await streamDistributionService.getDistribution(parseInt(id));
      return { success: true, distribution };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Remove a server from stream distribution
   * DELETE /admin/streams/:id/distribution/servers/:serverId
   */
  fastify.delete('/streams/:id/distribution/servers/:serverId', async (request, reply) => {
    const { id, serverId } = request.params as { id: string; serverId: string };

    try {
      await streamDistributionService.removeServerFromDistribution(
        parseInt(id),
        parseInt(serverId)
      );
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Get available servers for distribution
   * GET /admin/streams/distribution/available-servers
   */
  fastify.get('/streams/distribution/available-servers', async (request, reply) => {
    const { exclude } = request.query as { exclude?: string };
    
    const excludeIds = exclude 
      ? exclude.split(',').map(id => parseInt(id)).filter(id => !isNaN(id))
      : [];

    const servers = await streamDistributionService.getAvailableServers(excludeIds);
    return { servers };
  });

  /**
   * Configure cascade distribution (escalier mode)
   * PUT /admin/streams/:id/distribution/cascade
   * 
   * Body: {
   *   originServerId: number,
   *   cascade: [
   *     { serverId: 2, pullFromServerId: 1 },  // Server 2 pulls from origin (1)
   *     { serverId: 3, pullFromServerId: 2 },  // Server 3 pulls from server 2
   *     { serverId: 4, pullFromServerId: 3 },  // Server 4 pulls from server 3
   *   ]
   * }
   */
  fastify.put('/streams/:id/distribution/cascade', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { originServerId, cascade } = request.body as {
      originServerId: number;
      cascade: Array<{ serverId: number; pullFromServerId: number | null }>;
    };

    if (!originServerId) {
      return reply.status(400).send({ error: 'Origin server ID is required' });
    }

    try {
      await streamDistributionService.configureCascade({
        streamId: parseInt(id),
        originServerId,
        cascade: cascade || [],
      });

      const distribution = await streamDistributionService.getDistribution(parseInt(id));
      return distribution;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Add a server to cascade at specific position
   * POST /admin/streams/:id/distribution/cascade/add
   * 
   * Body: { serverId: number, pullFromServerId: number }
   */
  fastify.post('/streams/:id/distribution/cascade/add', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { serverId, pullFromServerId } = request.body as {
      serverId: number;
      pullFromServerId: number;
    };

    if (!serverId || !pullFromServerId) {
      return reply.status(400).send({ 
        error: 'serverId and pullFromServerId are required' 
      });
    }

    try {
      await streamDistributionService.addServerToCascade(
        parseInt(id),
        serverId,
        pullFromServerId
      );

      const distribution = await streamDistributionService.getDistribution(parseInt(id));
      return { success: true, distribution };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * Change parent of a server in the cascade
   * PUT /admin/streams/:id/distribution/cascade/:serverId/parent
   * 
   * Body: { newPullFromServerId: number }
   */
  fastify.put('/streams/:id/distribution/cascade/:serverId/parent', async (request, reply) => {
    const { id, serverId } = request.params as { id: string; serverId: string };
    const { newPullFromServerId } = request.body as { newPullFromServerId: number };

    if (!newPullFromServerId) {
      return reply.status(400).send({ error: 'newPullFromServerId is required' });
    }

    try {
      await streamDistributionService.changeServerParent(
        parseInt(id),
        parseInt(serverId),
        newPullFromServerId
      );

      const distribution = await streamDistributionService.getDistribution(parseInt(id));
      return { success: true, distribution };
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ==================== STREAM SOURCE & FAILOVER ====================

  // Get all sources status for a stream
  fastify.get('/streams/:id/sources', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamSourceManager } = await import('../../services/streaming/StreamSourceManager.js');

    const status = await streamSourceManager.getStreamStatus(parseInt(id));

    if (!status) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    return status;
  });

  // Check health of all sources for a stream
  fastify.post('/streams/:id/sources/check', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamSourceManager } = await import('../../services/streaming/StreamSourceManager.js');

    try {
      const sources = await streamSourceManager.precheckAllSources(parseInt(id));

      return {
        streamId: parseInt(id),
        checkedAt: new Date().toISOString(),
        sources,
        onlineCount: sources.filter(s => s.isOnline).length,
        totalCount: sources.length,
      };
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Manually trigger failover to next source
  fastify.post('/streams/:id/failover', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamSourceManager } = await import('../../services/streaming/StreamSourceManager.js');

    try {
      const newUrl = await streamSourceManager.manualFailover(parseInt(id));

      if (newUrl) {
        return {
          success: true,
          message: 'Failover successful',
          newSourceUrl: newUrl,
        };
      } else {
        return reply.status(400).send({
          success: false,
          error: 'No backup sources available or stream not active',
        });
      }
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Manually trigger failback to primary source
  fastify.post('/streams/:id/failback', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamSourceManager } = await import('../../services/streaming/StreamSourceManager.js');

    try {
      const primaryUrl = await streamSourceManager.performFailback(parseInt(id));

      if (primaryUrl) {
        return {
          success: true,
          message: 'Failback to primary source successful',
          primarySourceUrl: primaryUrl,
        };
      } else {
        return reply.status(400).send({
          success: false,
          error: 'Primary source not available or already on primary',
        });
      }
    } catch (error: any) {
      return reply.status(500).send({ error: error.message });
    }
  });

  // Update backup URLs for a stream
  fastify.put('/streams/:id/sources', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sourceUrl, backupUrls } = request.body as {
      sourceUrl?: string;
      backupUrls?: string[]
    };
    const { streamSourceManager } = await import('../../services/streaming/StreamSourceManager.js');

    const updateData: any = {};
    if (sourceUrl) updateData.sourceUrl = sourceUrl;
    if (backupUrls) updateData.backupUrls = backupUrls;

    const stream = await prisma.stream.update({
      where: { id: parseInt(id) },
      data: updateData,
    });

    // Refresh source manager cache
    await streamSourceManager.updateStreamSources(parseInt(id));
    await cache.del(cache.KEYS.STREAM(parseInt(id)));

    return {
      streamId: stream.id,
      sourceUrl: stream.sourceUrl,
      backupUrls: stream.backupUrls,
      message: 'Sources updated successfully',
    };
  });

  // Get failover history for a stream
  fastify.get('/streams/:id/failover-history', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { redis } = await import('../../config/redis.js');

    const history = await redis.lrange(`stream:${id}:failovers`, 0, 49);

    return {
      streamId: parseInt(id),
      failovers: history.map((h: string) => JSON.parse(h)),
    };
  });

  // ==================== STREAM PROBING & HEALTH ====================

  // Probe stream with FFprobe - get full stream information (codecs, bitrate, resolution, etc.)
  fastify.post('/streams/probe', async (request, reply) => {
    const { url, useCache = true, userAgent } = request.body as { url: string; useCache?: boolean; userAgent?: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL is required' });
    }

    const { streamProber } = await import('../../services/streaming/StreamProber.js');

    try {
      const result = await streamProber.probe(url, useCache, userAgent);
      return result;
    } catch (error: any) {
      return reply.status(500).send({ 
        success: false,
        error: error.message || 'Probe failed',
        url,
      });
    }
  });

  // Probe a stream by ID
  fastify.post('/streams/:id/probe', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { useCache = true } = request.body as { useCache?: boolean } || {};
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { sourceUrl: true, name: true, customUserAgent: true },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    const { streamProber } = await import('../../services/streaming/StreamProber.js');
    const { redis } = await import('../../config/redis.js');

    try {
      const result = await streamProber.probe(stream.sourceUrl, useCache, stream.customUserAgent || undefined);
      
      // Store probe status per stream for quick lookup (10 min TTL)
      await redis.setex(
        `stream:${streamId}:probeStatus`,
        600,
        JSON.stringify({
          success: result.success,
          probeTime: result.probeTime,
          error: result.error || null,
          checkedAt: new Date().toISOString(),
        })
      );
      
      return {
        ...result,
        streamId,
        streamName: stream.name,
      };
    } catch (error: any) {
      // Store failed probe status
      await redis.setex(
        `stream:${streamId}:probeStatus`,
        600,
        JSON.stringify({
          success: false,
          probeTime: 0,
          error: error.message || 'Probe failed',
          checkedAt: new Date().toISOString(),
        })
      );
      
      return reply.status(500).send({
        success: false,
        error: error.message || 'Probe failed',
        streamId,
        streamName: stream.name,
        url: stream.sourceUrl,
      });
    }
  });

  // Health check stream - quick check with/without FFprobe
  fastify.post('/streams/health', async (request, reply) => {
    const { url, useFfprobe = true, userAgent } = request.body as { url: string; useFfprobe?: boolean; userAgent?: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL is required' });
    }

    const { streamProber } = await import('../../services/streaming/StreamProber.js');

    try {
      const result = await streamProber.checkHealth(url, useFfprobe, userAgent);
      return result;
    } catch (error: any) {
      return reply.status(500).send({
        online: false,
        method: 'error',
        latency: 0,
        error: error.message || 'Health check failed',
      });
    }
  });

  // Health check stream by ID
  fastify.post('/streams/:id/health', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { useFfprobe = true } = request.body as { useFfprobe?: boolean } || {};
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { sourceUrl: true, name: true, backupUrls: true, customUserAgent: true },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    const { streamProber } = await import('../../services/streaming/StreamProber.js');
    const { streamHealthMonitor } = await import('../../services/monitoring/StreamHealthMonitor.js');
    const { redis } = await import('../../config/redis.js');

    try {
      // Get cached health status if available
      const cachedHealth = await streamHealthMonitor.getStreamHealth(streamId);
      
      // Also do a live check with customUserAgent
      const liveHealth = await streamProber.checkHealth(stream.sourceUrl, useFfprobe, stream.customUserAgent || undefined);

      // Check backup URLs too (use same user agent)
      const backupHealth = await Promise.all(
        stream.backupUrls.map(async (url) => ({
          url,
          health: await streamProber.checkHealth(url, useFfprobe, stream.customUserAgent || undefined),
        }))
      );

      const anyOnline = liveHealth.online || backupHealth.some(b => b.health.online);

      // Store probe status per stream (10 min TTL) - updated by health check too
      await redis.setex(
        `stream:${streamId}:probeStatus`,
        600,
        JSON.stringify({
          success: anyOnline,
          probeTime: liveHealth.latency,
          error: liveHealth.error || null,
          checkedAt: new Date().toISOString(),
        })
      );

      return {
        streamId,
        streamName: stream.name,
        sourceUrl: stream.sourceUrl,
        primary: liveHealth,
        backups: backupHealth,
        cached: cachedHealth,
        anyOnline,
      };
    } catch (error: any) {
      return reply.status(500).send({
        streamId: parseInt(id),
        error: error.message || 'Health check failed',
      });
    }
  });

  // Get comprehensive stream details with all info
  fastify.get('/streams/:id/details', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { includeProbe = false, includeHealth = true } = request.query as { 
      includeProbe?: boolean; 
      includeHealth?: boolean;
    };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      include: {
        category: true,
        abrProfile: true,
        bouquets: {
          include: { bouquet: { select: { id: true, name: true } } },
        },
        serverAssignments: {
          include: {
            server: { select: { id: true, name: true, domain: true, status: true, region: true, type: true } },
          },
        },
        serverDistribution: {
          include: {
            server: { select: { id: true, name: true, domain: true, status: true, region: true, type: true } },
          },
          orderBy: { tier: 'asc' },
        },
        epgData: {
          take: 10,
          orderBy: { start: 'asc' },
          where: { start: { gte: new Date() } },
        },
      },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Get health info
    let healthInfo = null;
    let probeInfo = null;
    let alwaysOnInfo = null;

    if (includeHealth) {
      const { streamHealthMonitor } = await import('../../services/monitoring/StreamHealthMonitor.js');
      const { streamProber } = await import('../../services/streaming/StreamProber.js');
      
      healthInfo = await streamHealthMonitor.getStreamHealth(parseInt(id));
      
      if (!healthInfo) {
        // Do a live health check with customUserAgent
        const liveCheck = await streamProber.checkHealth(stream.sourceUrl, true, stream.customUserAgent || undefined);
        healthInfo = {
          online: liveCheck.online,
          latency: liveCheck.latency,
          lastCheck: new Date(),
          statusCode: liveCheck.statusCode,
          contentType: liveCheck.contentType,
          error: liveCheck.error,
        };
      }
    }

    if (includeProbe) {
      const { streamProber } = await import('../../services/streaming/StreamProber.js');
      probeInfo = await streamProber.probe(stream.sourceUrl, true, stream.customUserAgent || undefined);
    }

    // Get active viewer count from Redis - count viewer keys with TTL
    // Check both on-demand viewers (stream:*) and ABR viewers (abr:*)
    // Exclude cascade connections (internal server-to-server) which have format: stream:*:viewer:cascade:*
    const { redis } = await import('../../config/redis.js');
    const [viewerKeys, abrViewerKeys] = await Promise.all([
      redis.keys(`stream:${id}:viewer:*`),
      redis.keys(`abr:${id}:viewer:*`),
    ]);
    // Filter out cascade keys (server-to-server connections, not real viewers)
    const realViewerKeys = viewerKeys.filter(k => !k.includes(':viewer:cascade:'));
    const realAbrViewerKeys = abrViewerKeys.filter(k => !k.includes(':viewer:cascade:'));
    const activeViewers = realViewerKeys.length + realAbrViewerKeys.length;

    // Get always-on status from Redis (shared across all servers)
    if (stream.streamType === 'LIVE' && stream.alwaysOn) {
      const statusJson = await redis.hget('alwayson:streams', id);
      if (statusJson) {
        const status = JSON.parse(statusJson);
        alwaysOnInfo = {
          ...status,
          viewers: activeViewers,
        };
      } else {
        // Fallback to local memory (if this server is running the stream)
        const localStatus = alwaysOnStreamManager.getStreamStatus(parseInt(id));
        if (localStatus) {
          alwaysOnInfo = {
            ...localStatus,
            viewers: activeViewers,
          };
        }
      }
    }

    // Get failover history
    const failoverHistory = await redis.lrange(`stream:${id}:failovers`, 0, 4);

    // Get cached probe status (updated when probe/health is run)
    const probeStatusJson = await redis.get(`stream:${id}:probeStatus`);
    const probeStatus = probeStatusJson ? JSON.parse(probeStatusJson) : null;

    return {
      stream,
      health: healthInfo,
      probe: probeInfo,
      probeStatus, // Cached probe success/failure status
      alwaysOn: alwaysOnInfo,
      stats: {
        activeViewers,
        failoverCount: failoverHistory.length,
        lastFailovers: failoverHistory.map((h: string) => JSON.parse(h)),
      },
    };
  });

  // Get stream URL for playback in admin player
  fastify.get('/streams/:id/play-url', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { format = 'm3u8' } = request.query as { format?: 'm3u8' | 'ts' };

    const stream = await prisma.stream.findUnique({
      where: { id: parseInt(id) },
      select: { 
        id: true, 
        name: true, 
        sourceUrl: true, 
        streamType: true,
        transcodeProfile: true,
      },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // For admin playback, return direct source URL or generate an internal player URL
    const baseUrl = `${request.protocol}://${request.hostname}`;
    const port = process.env.PORT || '3000';
    
    // Use admin credentials for testing
    const testUrl = stream.streamType === 'VOD'
      ? `${baseUrl}:${port}/movie/admin/admin123/${stream.id}.${format === 'ts' ? 'ts' : 'mp4'}`
      : `${baseUrl}:${port}/live/admin/admin123/${stream.id}.${format}`;

    return {
      streamId: stream.id,
      name: stream.name,
      directUrl: stream.sourceUrl,
      playUrl: testUrl,
      format,
      transcodeProfile: stream.transcodeProfile,
    };
  });

  // ==================== LOGO MANAGEMENT ====================

  // Fetch possible logos for a channel name
  fastify.post('/streams/fetch-logos', async (request, reply) => {
    const { channelName } = request.body as { channelName: string };

    if (!channelName || channelName.trim().length < 2) {
      return reply.status(400).send({ error: 'Channel name is required (min 2 characters)' });
    }

    try {
      const logos = await fetchPossibleLogos(channelName.trim());
      return { logos };
    } catch (error: any) {
      logger.error({ error, channelName }, 'Failed to fetch logos');
      return reply.status(500).send({ error: 'Failed to fetch logos' });
    }
  });

  // Save a logo locally and update stream
  fastify.post('/streams/:id/save-logo', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { logoUrl, removeBackground = true } = request.body as { logoUrl: string; removeBackground?: boolean };
    const streamId = parseInt(id);

    if (!logoUrl) {
      return reply.status(400).send({ error: 'Logo URL is required' });
    }

    // Verify stream exists
    const stream = await prisma.stream.findUnique({ where: { id: streamId } });
    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    try {
      const localPath = await downloadAndSaveImage(logoUrl, stream.name, removeBackground);

      // Update stream with local logo path
      await prisma.stream.update({
        where: { id: streamId },
        data: { logoUrl: localPath },
      });

      return { success: true, logoUrl: localPath };
    } catch (error: any) {
      logger.error({ error, streamId, logoUrl }, 'Failed to save logo');
      return reply.status(500).send({ error: error.message || 'Failed to save logo' });
    }
  });

  // ==================== CATEGORY MANAGEMENT ====================

  // List categories
  fastify.get('/categories', async (request, reply) => {
    const { type } = request.query as { type?: StreamType };

    const categories = await prisma.category.findMany({
      where: type ? { type } : undefined,
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        type: true,
        parentId: true,
        sortOrder: true,
        isActive: true,
        countryCode: true,
        flagSvgUrl: true,
        _count: { select: { streams: true } },
      },
    });

    return categories;
  });

  // Create category
  fastify.post('/categories', async (request, reply) => {
    const data = createCategorySchema.parse(request.body);

    const category = await prisma.category.create({
      data,
    });

    return reply.status(201).send(category);
  });

  // Update category
  fastify.put('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createCategorySchema.partial().parse(request.body);

    const category = await prisma.category.update({
      where: { id: parseInt(id) },
      data,
    });

    // Invalidate cache
    await cache.invalidatePattern('categories:*');

    return category;
  });

  // Batch update categories (for reordering)
  fastify.put('/categories/batch', async (request, reply) => {
    const body = z.object({
      updates: z.array(
        z.object({
          id: z.number(),
          sortOrder: z.number(),
          parentId: z.number().nullable().optional(),
        })
      ),
    }).parse(request.body);
    const updates = body.updates;

    await Promise.all(
      updates.map((update) =>
        prisma.category.update({
          where: { id: update.id },
          data: { sortOrder: update.sortOrder },
        })
      )
    );

    await cache.invalidatePattern('categories:*');

    return { success: true, updated: updates.length };
  });

  // Delete category
  fastify.delete('/categories/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.category.delete({
      where: { id: parseInt(id) },
    });

    await cache.invalidatePattern('categories:*');

    return { success: true };
  });

  // ==================== BOUQUET MANAGEMENT ====================

  // List bouquets with hierarchy
  fastify.get('/bouquets', async () => {
    const bouquets = await prisma.bouquet.findMany({
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          select: { id: true, name: true },
        },
        _count: { select: { streams: true, lines: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });

    return bouquets;
  });

  // Get single bouquet with streams
  fastify.get('/bouquets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const bouquet = await prisma.bouquet.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: { select: { id: true, name: true } },
        children: {
          include: {
            _count: { select: { streams: true, lines: true } },
          },
        },
        streams: {
          include: {
            stream: {
              select: {
                id: true,
                name: true,
                streamType: true,
                logoUrl: true,
                category: { select: { id: true, name: true } },
              },
            },
          },
        },
        lines: {
          include: {
            line: {
              select: {
                id: true,
                username: true,
                status: true,
                expiresAt: true,
              },
            },
          },
        },
        _count: { select: { streams: true, lines: true, children: true } },
      },
    });

    if (!bouquet) {
      return reply.status(404).send({ error: 'Bouquet not found' });
    }

    return bouquet;
  });

  // Create bouquet
  fastify.post('/bouquets', async (request, reply) => {
    const data = createBouquetSchema.parse(request.body);
    const { streamIds, ...bouquetData } = data;

    const bouquet = await prisma.bouquet.create({
      data: {
        ...bouquetData,
        streams: streamIds
          ? {
            create: streamIds.map((id) => ({ streamId: id })),
          }
          : undefined,
      },
    });

    return reply.status(201).send(bouquet);
  });

  // Update bouquet
  fastify.put('/bouquets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createBouquetSchema.partial().parse(request.body);
    const { streamIds, ...bouquetData } = data;

    const bouquet = await prisma.bouquet.update({
      where: { id: parseInt(id) },
      data: bouquetData,
    });

    if (streamIds !== undefined) {
      await prisma.bouquetStream.deleteMany({
        where: { bouquetId: parseInt(id) },
      });

      if (streamIds.length > 0) {
        await prisma.bouquetStream.createMany({
          data: streamIds.map((streamId) => ({
            bouquetId: parseInt(id),
            streamId,
          })),
        });
      }
    }

    return bouquet;
  });

  // Delete bouquet
  fastify.delete('/bouquets/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    await prisma.bouquet.delete({
      where: { id: parseInt(id) },
    });

    return { success: true };
  });

  // Add streams to bouquet
  fastify.post('/bouquets/:id/streams', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamIds } = request.body as { streamIds: number[] };

    if (!streamIds || streamIds.length === 0) {
      return reply.status(400).send({ error: 'streamIds required' });
    }

    // Get existing stream IDs to avoid duplicates
    const existing = await prisma.bouquetStream.findMany({
      where: { bouquetId: parseInt(id) },
      select: { streamId: true },
    });
    const existingIds = new Set(existing.map(e => e.streamId));

    // Filter out already existing streams
    const newStreamIds = streamIds.filter(sid => !existingIds.has(sid));

    if (newStreamIds.length > 0) {
      await prisma.bouquetStream.createMany({
        data: newStreamIds.map(streamId => ({
          bouquetId: parseInt(id),
          streamId,
        })),
      });
    }

    return { 
      success: true, 
      added: newStreamIds.length,
      skipped: streamIds.length - newStreamIds.length,
    };
  });

  // Remove streams from bouquet
  fastify.delete('/bouquets/:id/streams', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { streamIds } = request.body as { streamIds: number[] };

    if (!streamIds || streamIds.length === 0) {
      return reply.status(400).send({ error: 'streamIds required' });
    }

    const result = await prisma.bouquetStream.deleteMany({
      where: {
        bouquetId: parseInt(id),
        streamId: { in: streamIds },
      },
    });

    return { success: true, removed: result.count };
  });

  // Add IPTV lines to bouquet
  fastify.post('/bouquets/:id/lines', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lineIds } = request.body as { lineIds: number[] };

    if (!lineIds || lineIds.length === 0) {
      return reply.status(400).send({ error: 'lineIds required' });
    }

    // Get existing line IDs to avoid duplicates
    const existing = await prisma.lineBouquet.findMany({
      where: { bouquetId: parseInt(id) },
      select: { lineId: true },
    });
    const existingIds = new Set(existing.map(e => e.lineId));

    // Filter out already existing lines
    const newLineIds = lineIds.filter(lid => !existingIds.has(lid));

    if (newLineIds.length > 0) {
      await prisma.lineBouquet.createMany({
        data: newLineIds.map(lineId => ({
          bouquetId: parseInt(id),
          lineId,
        })),
      });
    }

    return { 
      success: true, 
      added: newLineIds.length,
      skipped: lineIds.length - newLineIds.length,
    };
  });

  // Remove IPTV lines from bouquet
  fastify.delete('/bouquets/:id/lines', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lineIds } = request.body as { lineIds: number[] };

    if (!lineIds || lineIds.length === 0) {
      return reply.status(400).send({ error: 'lineIds required' });
    }

    const result = await prisma.lineBouquet.deleteMany({
      where: {
        bouquetId: parseInt(id),
        lineId: { in: lineIds },
      },
    });

    return { success: true, removed: result.count };
  });

  // ==================== SERIES MANAGEMENT ====================

  // List series
  fastify.get('/series', async (request, reply) => {
    const { page = '1', pageSize = '50', categoryId, search, status } = request.query as {
      page?: string;
      pageSize?: string;
      categoryId?: string;
      search?: string;
      status?: 'ongoing' | 'completed' | 'cancelled';
    };

    const pageNum = parseInt(page.toString());
    const pageSizeNum = parseInt(pageSize.toString());

    const where: any = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    if (status) {
      where.status = status;
    }

    const [series, total] = await Promise.all([
      prisma.series.findMany({
        where,
        include: {
          _count: { select: { episodes: true } },
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (pageNum - 1) * pageSizeNum,
        take: pageSizeNum,
      }),
      prisma.series.count({ where }),
    ]);

    // Map primary category to 'category' field for backward compatibility
    const seriesWithCategory = series.map(s => ({
      ...s,
      category: s.categories.find(c => c.isPrimary)?.category || s.categories[0]?.category || null,
    }));

    return {
      data: seriesWithCategory,
      total,
      page: pageNum,
      pageSize: pageSizeNum,
      totalPages: Math.ceil(total / pageSizeNum),
    };
  });

  // Create series
  fastify.post('/series', async (request, reply) => {
    const data = createSeriesSchema.parse(request.body);

    // Determine categoryIds array
    const categoryIds = data.categoryIds || (data.categoryId ? [data.categoryId] : []);
    const primaryCategoryId = categoryIds[0];

    const series = await prisma.series.create({
      data: {
        name: data.name,
        categoryId: primaryCategoryId, // Backward compatibility
        cover: data.cover || data.coverUrl || null,
        backdropPath: data.backdropUrl ? [data.backdropUrl] : [],
        plot: data.plot || null,
        cast: data.cast || null,
        director: data.director || null,
        genre: data.genres || data.genre || null,
        releaseDate: data.releaseDate ? new Date(data.releaseDate) : (data.year ? new Date(`${data.year}-01-01`) : null),
        rating: data.rating || null,
        tmdbId: data.tmdbId || null,
        youtubeTrailer: data.youtubeTrailer || null,
        categories: {
          create: categoryIds.map((catId: number, index: number) => ({
            categoryId: catId,
            isPrimary: index === 0,
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

    // Map primary category to 'category' field for backward compatibility
    const seriesWithCategory = {
      ...series,
      category: series.categories.find(c => c.isPrimary)?.category || series.categories[0]?.category || null,
    };

    return reply.status(201).send(seriesWithCategory);
  });

  // Create series with full episode data (from TMDB + file browser)
  fastify.post('/series/full', async (request, reply) => {
    const data = createSeriesFullSchema.parse(request.body);

    // Determine categoryIds array
    const categoryIds = data.categoryIds || (data.categoryId ? [data.categoryId] : []);
    const primaryCategoryId = categoryIds[0];

    // Create series first with category associations
    const series = await prisma.series.create({
      data: {
        name: data.name,
        categoryId: primaryCategoryId,
        tmdbId: data.tmdbId,
        cover: data.coverUrl || null,
        backdropPath: data.backdropUrl ? [data.backdropUrl] : [],
        plot: data.plot || null,
        releaseDate: data.year ? new Date(`${data.year}-01-01`) : null,
        rating: data.rating || null,
        genre: data.genres || data.genre || null,
        cast: data.cast || null,
        categories: {
          create: categoryIds.map((catId: number, index: number) => ({
            categoryId: catId,
            isPrimary: index === 0,
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

    // Create episodes for each season
    const episodesToCreate: Array<{
      seriesId: number;
      seasonNumber: number;
      episodeNumber: number;
      title: string;
      plot: string | null;
      sourceUrl: string;
      duration: number | null;
      releaseDate: Date | null;
      cover: string | null;
    }> = [];

    for (const season of data.seasons) {
      for (const episode of season.episodes) {
        // Only create episode if it has a source URL
        if (episode.sourceUrl) {
          episodesToCreate.push({
            seriesId: series.id,
            seasonNumber: season.seasonNumber,
            episodeNumber: episode.episodeNumber,
            title: episode.name,
            plot: episode.overview || null,
            sourceUrl: episode.sourceUrl,
            duration: episode.runtime ? episode.runtime * 60 : null, // Convert minutes to seconds
            releaseDate: episode.airDate ? new Date(episode.airDate) : null,
            cover: episode.stillPath ? `https://image.tmdb.org/t/p/w500${episode.stillPath}` : null,
          });
        }
      }
    }

    // Bulk create episodes
    if (episodesToCreate.length > 0) {
      await prisma.episode.createMany({
        data: episodesToCreate,
      });
    }

    // Return the created series with episode count
    const result = await prisma.series.findUnique({
      where: { id: series.id },
      include: {
        _count: { select: { episodes: true } },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    logger.info({ 
      seriesId: series.id, 
      seriesName: data.name, 
      seasonsCount: data.seasons.length,
      episodesCreated: episodesToCreate.length 
    }, 'Series created with episodes');

    // Map primary category to 'category' field for backward compatibility
    const resultWithCategory = result ? {
      ...result,
      category: result.categories.find(c => c.isPrimary)?.category || result.categories[0]?.category || null,
    } : null;

    return reply.status(201).send(resultWithCategory);
  });

  // Create episode
  fastify.post('/episodes', async (request, reply) => {
    const data = createEpisodeSchema.parse(request.body);

    const episode = await prisma.episode.create({
      data,
    });

    // Update series lastModified
    await prisma.series.update({
      where: { id: data.seriesId },
      data: { lastModified: new Date() },
    });

    return reply.status(201).send(episode);
  });

  // Get series by ID
  fastify.get('/series/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const series = await prisma.series.findUnique({
      where: { id: parseInt(id) },
      include: {
        episodes: {
          orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
        },
        _count: { select: { episodes: true } },
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!series) {
      return reply.status(404).send({ error: 'Series not found' });
    }

    // Map primary category to 'category' field for backward compatibility
    const seriesWithCategory = {
      ...series,
      category: series.categories.find(c => c.isPrimary)?.category || series.categories[0]?.category || null,
    };

    return seriesWithCategory;
  });

  // Update series
  fastify.put('/series/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = createSeriesSchemaBase.partial().parse(request.body);

    // Handle category updates
    const categoryIds = data.categoryIds || (data.categoryId ? [data.categoryId] : null);
    
    if (categoryIds) {
      const primaryCategoryId = categoryIds[0];

      // Use transaction to update both series and categories
      const series = await prisma.$transaction(async (tx) => {
        // Delete existing category associations
        await tx.seriesCategory.deleteMany({
          where: { seriesId: parseInt(id) },
        });

        // Create new category associations
        await tx.seriesCategory.createMany({
          data: categoryIds.map((catId: number, index: number) => ({
            seriesId: parseInt(id),
            categoryId: catId,
            isPrimary: index === 0,
          })),
        });

        // Update the series
        return await tx.series.update({
          where: { id: parseInt(id) },
          data: {
            name: data.name,
            categoryId: primaryCategoryId,
            cover: data.cover || data.coverUrl,
            backdropPath: data.backdropUrl ? [data.backdropUrl] : undefined,
            plot: data.plot,
            cast: data.cast,
            director: data.director,
            genre: data.genres || data.genre,
            releaseDate: data.releaseDate ? new Date(data.releaseDate) : (data.year ? new Date(`${data.year}-01-01`) : undefined),
            rating: data.rating,
            tmdbId: data.tmdbId,
            youtubeTrailer: data.youtubeTrailer,
            lastModified: new Date(),
          },
      include: {
        categories: {
          include: {
            category: { select: { id: true, name: true } },
          },
        },
      },
      });
      });

      // Map primary category to 'category' field for backward compatibility
      const seriesWithCategory = {
        ...series,
        category: series.categories.find(c => c.isPrimary)?.category || series.categories[0]?.category || null,
      };

      return seriesWithCategory;
    } else {
      // No category change, just update series fields
      const series = await prisma.series.update({
        where: { id: parseInt(id) },
        data: {
          name: data.name,
          cover: data.cover || data.coverUrl,
          backdropPath: data.backdropUrl ? [data.backdropUrl] : undefined,
          plot: data.plot,
          cast: data.cast,
          director: data.director,
          genre: data.genres || data.genre,
          releaseDate: data.releaseDate ? new Date(data.releaseDate) : (data.year ? new Date(`${data.year}-01-01`) : undefined),
          rating: data.rating,
          tmdbId: data.tmdbId,
          youtubeTrailer: data.youtubeTrailer,
          lastModified: new Date(),
        },
        include: {
          categories: {
            include: {
              category: { select: { id: true, name: true } },
            },
          },
        },
      });

      // Map primary category to 'category' field for backward compatibility
      const seriesWithCategory = {
        ...series,
        category: series.categories.find(c => c.isPrimary)?.category || series.categories[0]?.category || null,
      };

      return seriesWithCategory;
    }
  });

  // Delete series
  fastify.delete('/series/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // Episodes will be automatically deleted due to onDelete: Cascade in schema
    await prisma.series.delete({
      where: { id: parseInt(id) },
    });

    logger.info({ seriesId: parseInt(id) }, 'Series deleted');

    return { success: true };
  });

  // ==================== EPG MANAGEMENT ====================

  // List EPG sources with computed stats
  fastify.get('/epg/sources', async () => {
    const sources = await prisma.epgSource.findMany({
      orderBy: { name: 'asc' },
    });

    // Get total channels from EpgChannel table
    const totalChannels = await prisma.epgChannel.count();
    
    // Get mapped channels count (streams with epgChannelId assigned)
    const mappedChannels = await prisma.stream.count({
      where: { epgChannelId: { not: null } },
    });

    // Enhance each source with computed fields
    const enhancedSources = sources.map(source => ({
      ...source,
      // Use stored status, channelCount, updateInterval
      totalChannels: source.channelCount || totalChannels,
      channelsMapped: mappedChannels,
      // Ensure backwards compatibility with frontend
      updateInterval: source.updateInterval || 6,
      status: source.status || 'active',
    }));

    return enhancedSources;
  });

  // Add EPG source
  fastify.post('/epg/sources', async (request, reply) => {
    const { name, url, updateInterval, isActive } = request.body as { 
      name: string; 
      url: string;
      updateInterval?: number;
      isActive?: boolean;
    };

    const source = await prisma.epgSource.create({
      data: { 
        name, 
        url,
        updateInterval: updateInterval || 6,
        isActive: isActive !== false,
      },
    });

    return reply.status(201).send({
      ...source,
      totalChannels: 0,
      channelsMapped: 0,
    });
  });

  // Refresh all EPG sources (must be before :id routes)
  fastify.post('/epg/sources/refresh-all', async (_request, reply) => {
    const sources = await prisma.epgSource.findMany({
      where: { isActive: true },
    });

    // Mark all sources as updating
    await prisma.epgSource.updateMany({
      where: { id: { in: sources.map(s => s.id) } },
      data: { status: 'updating' },
    });

    // Start all imports in the background (fire-and-forget)
    // This prevents the request from timing out for large XMLTV files
    (async () => {
      for (const source of sources) {
        try {
          logger.info({ sourceId: source.id, url: source.url }, 'Starting EPG import');
          const result = await epgImporter.importFromUrlWithStats(source.url);

          await prisma.epgSource.update({
            where: { id: source.id },
            data: { 
              lastImport: new Date(),
              status: 'active',
              lastError: null,
              channelCount: result.channelCount,
            },
          });

          logger.info({ sourceId: source.id, count: result.programCount, channels: result.channelCount }, 'EPG import completed successfully');
        } catch (error: any) {
          logger.error({ error, sourceId: source.id, message: error?.message, stack: error?.stack }, 'EPG refresh failed for source');
          
          await prisma.epgSource.update({
            where: { id: source.id },
            data: { 
              status: 'error',
              lastError: error?.message || 'Import failed',
            },
          });
        }
      }
    })().catch((error: any) => {
      logger.error({ error, message: 'Unhandled error in EPG import all' }, 'Critical EPG error');
    });

    // Return immediately to prevent timeout
    return reply.send({
      success: true,
      message: 'EPG import started in background for all sources',
      sourceCount: sources.length,
    });
  });

  // Get single EPG source with computed fields
  fastify.get('/epg/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.epgSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'EPG source not found' });
    }

    // Get mapped channels count
    const mappedChannels = await prisma.stream.count({
      where: { epgChannelId: { not: null } },
    });

    return {
      ...source,
      totalChannels: source.channelCount || 0,
      channelsMapped: mappedChannels,
    };
  });

  // Update EPG source
  fastify.put('/epg/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name, url, isActive, updateInterval } = request.body as { 
      name?: string; 
      url?: string; 
      isActive?: boolean;
      updateInterval?: number;
    };

    const source = await prisma.epgSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'EPG source not found' });
    }

    const updated = await prisma.epgSource.update({
      where: { id: parseInt(id) },
      data: {
        ...(name !== undefined && { name }),
        ...(url !== undefined && { url }),
        ...(isActive !== undefined && { isActive }),
        ...(updateInterval !== undefined && { updateInterval }),
      },
    });

    return updated;
  });

  // Delete EPG source
  fastify.delete('/epg/sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.epgSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'EPG source not found' });
    }

    await prisma.epgSource.delete({
      where: { id: parseInt(id) },
    });

    return { success: true };
  });

  // Refresh (import) EPG from a specific source
  fastify.post('/epg/sources/:id/refresh', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.epgSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'EPG source not found' });
    }

    // Mark as updating
    await prisma.epgSource.update({
      where: { id: parseInt(id) },
      data: { status: 'updating' },
    });

    // Start the import in the background (fire-and-forget)
    // This prevents the request from timing out for large XMLTV files
    (async () => {
      try {
        logger.info({ sourceId: id, url: source.url }, 'Starting EPG import');
        const result = await epgImporter.importFromUrlWithStats(source.url);

        await prisma.epgSource.update({
          where: { id: parseInt(id) },
          data: { 
            lastImport: new Date(),
            status: 'active',
            lastError: null,
            channelCount: result.channelCount,
          },
        });

        logger.info({ sourceId: id, count: result.programCount, channels: result.channelCount }, 'EPG import completed successfully');
      } catch (error: any) {
        logger.error({ error, sourceId: id, message: error?.message, stack: error?.stack }, 'EPG refresh failed');
        
        await prisma.epgSource.update({
          where: { id: parseInt(id) },
          data: { 
            status: 'error',
            lastError: error?.message || 'Import failed',
          },
        });
      }
    })().catch((error: any) => {
      logger.error({ error, sourceId: id, message: 'Unhandled error in EPG import' }, 'Critical EPG error');
    });

    // Return immediately to prevent timeout
    return reply.send({
      success: true,
      message: 'EPG import started in background',
      sourceId: parseInt(id),
    });
  });

  // Import EPG from source (legacy endpoint)
  fastify.post('/epg/import/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.epgSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'EPG source not found' });
    }

    try {
      const count = await epgImporter.importFromUrl(source.url);

      await prisma.epgSource.update({
        where: { id: parseInt(id) },
        data: { lastImport: new Date() },
      });

      return { success: true, imported: count };
    } catch (error: any) {
      logger.error({ error, sourceId: id }, 'EPG import failed');
      return reply.status(500).send({ error: error.message });
    }
  });

  // Cleanup old EPG
  fastify.post('/epg/cleanup', async () => {
    const deleted = await epgImporter.cleanupOldEntries();
    return { success: true, deleted };
  });

  // Get available EPG channels (from EpgChannel table)
  fastify.get('/epg/channels', async (request) => {
    const { search } = request.query as { search?: string };

    // Get EPG channels from the dedicated table
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { id: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const channels = await prisma.epgChannel.findMany({
      where: whereClause,
      orderBy: [
        { displayName: 'asc' },
        { id: 'asc' },
      ],
      take: 100, // Limit results
    });

    // Get current stream assignments to show which channels are mapped
    const streams = await prisma.stream.findMany({
      where: { epgChannelId: { not: null } },
      select: { id: true, name: true, epgChannelId: true },
    });

    const assignedChannels = new Map<string, { streamId: number; streamName: string }>();
    for (const stream of streams) {
      if (stream.epgChannelId) {
        assignedChannels.set(stream.epgChannelId.toLowerCase(), {
          streamId: stream.id,
          streamName: stream.name,
        });
      }
    }

    return channels.map((c) => {
      const lowerChannelId = c.id.toLowerCase();
      const assignment = assignedChannels.get(lowerChannelId);
      return {
        id: c.id,
        displayName: c.displayName,
        iconUrl: c.iconUrl,
        programCount: c.programCount,
        isAssigned: !!assignment,
        assignedStreamId: assignment?.streamId || null,
        assignedStreamName: assignment?.streamName || null,
      };
    });
  });

  // Get EPG stats (for dashboard)
  fastify.get('/epg/stats', async () => {
    const [sourcesCount, channelCount, mappedCount] = await Promise.all([
      prisma.epgSource.count(),
      prisma.epgEntry.groupBy({ by: ['channelId'] }).then(r => r.length),
      prisma.stream.count({ where: { epgChannelId: { not: null } } }),
    ]);

    // Get EPG data time range
    const [earliest, latest] = await Promise.all([
      prisma.epgEntry.findFirst({ orderBy: { start: 'asc' }, select: { start: true } }),
      prisma.epgEntry.findFirst({ orderBy: { end: 'desc' }, select: { end: true } }),
    ]);

    const guideDataDays = earliest && latest
      ? Math.ceil((latest.end.getTime() - earliest.start.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      sources: sourcesCount,
      totalChannels: channelCount,
      mappedChannels: mappedCount,
      coveragePercent: channelCount > 0 ? Math.round((mappedCount / channelCount) * 100) : 0,
      guideDataDays,
    };
  });

  // Assign EPG channel to a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/epg', async (request, reply) => {
    const { id } = request.params;
    const { epgChannelId } = request.body as { epgChannelId: string | null };
    const streamId = parseInt(id);

    // Verify stream exists
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, name: true, streamType: true },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Validate EPG channel exists if not null
    if (epgChannelId) {
      const channelExists = await prisma.epgChannel.findUnique({
        where: { id: epgChannelId },
      });

      if (!channelExists) {
        return reply.status(400).send({
          error: 'Invalid EPG channel ID',
          message: `EPG channel "${epgChannelId}" not found in the system. Import EPG data first or check the channel ID.`
        });
      }
    }

    // Update stream with EPG channel assignment
    const updatedStream = await prisma.stream.update({
      where: { id: streamId },
      data: { epgChannelId },
      select: {
        id: true,
        name: true,
        epgChannelId: true,
      },
    });

    logger.info({
      streamId,
      streamName: stream.name,
      epgChannelId
    }, epgChannelId ? 'EPG channel assigned to stream' : 'EPG channel removed from stream');

    // If assigning a channel (not removing), automatically import EPG data for this channel
    if (epgChannelId) {
      // Import in background to avoid blocking the response
      (async () => {
        try {
          logger.info({ streamId, epgChannelId }, 'Starting automatic EPG import for assigned channel');
          const count = await epgImporter.importForChannel(streamId, epgChannelId);
          logger.info({ streamId, epgChannelId, count }, 'Automatic EPG import completed');
        } catch (error: any) {
          logger.error({ error, streamId, epgChannelId, message: error?.message }, 'Automatic EPG import failed');
        }
      })().catch((error: any) => {
        logger.error({ error, streamId, epgChannelId, message: 'Unhandled error in automatic EPG import' }, 'Critical EPG error');
      });
    }

    return {
      success: true,
      message: epgChannelId
        ? `EPG channel "${epgChannelId}" assigned to ${stream.name}. EPG data import started in background.`
        : `EPG assignment removed from ${stream.name}`,
      stream: updatedStream,
      epgImportStarted: !!epgChannelId,
    };
  });

  // Get stream's current EPG assignment and programs
  fastify.get<{ Params: { id: string } }>('/streams/:id/epg', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { 
        id: true, 
        name: true, 
        epgChannelId: true,
      },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    // Get current and upcoming programs
    const now = new Date();
    let currentProgram: {
      id: number;
      title: string;
      description: string | null;
      start: Date;
      end: Date;
      language: string | null;
    } | null = null;

    let upcomingPrograms: Array<{
      id: number;
      title: string;
      description: string | null;
      start: Date;
      end: Date;
      language: string | null;
    }> = [];

    if (stream.epgChannelId) {
      // Get current program (started in past, ends in future)
      const current = await prisma.epgEntry.findFirst({
        where: {
          OR: [
            { streamId },
            { channelId: stream.epgChannelId },
          ],
          start: { lte: now },
          end: { gt: now },
        },
        orderBy: { start: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          start: true,
          end: true,
          language: true,
        },
      });

      if (current) {
        currentProgram = current;
      }

      // Get upcoming programs (start in future)
      upcomingPrograms = await prisma.epgEntry.findMany({
        where: {
          OR: [
            { streamId },
            { channelId: stream.epgChannelId },
          ],
          start: { gt: now },
        },
        orderBy: { start: 'asc' },
        take: 10,
        select: {
          id: true,
          title: true,
          description: true,
          start: true,
          end: true,
          language: true,
        },
      });
    }

    return {
      streamId: stream.id,
      streamName: stream.name,
      epgChannelId: stream.epgChannelId,
      hasEpgData: !!currentProgram || upcomingPrograms.length > 0,
      currentProgram: currentProgram ? {
        id: currentProgram.id,
        title: currentProgram.title,
        description: currentProgram.description,
        start: currentProgram.start,
        end: currentProgram.end,
        language: currentProgram.language,
      } : null,
      upcomingPrograms: upcomingPrograms.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        start: e.start,
        end: e.end,
        language: e.language,
      })),
    };
  });

  // Bulk assign EPG channels (auto-matching by name)
  fastify.post('/epg/auto-map', async () => {
    // Get all streams without EPG assignment
    const streams = await prisma.stream.findMany({
      where: { 
        epgChannelId: null,
        streamType: { in: ['LIVE', 'RADIO'] },
      },
      select: { id: true, name: true },
    });

    // Get all available EPG channels
    const channels = await prisma.epgEntry.groupBy({
      by: ['channelId'],
    });

    const channelSet = new Set(channels.map(c => c.channelId.toLowerCase()));
    const results: { streamId: number; streamName: string; epgChannelId: string }[] = [];

    for (const stream of streams) {
      // Try to find a matching channel by name similarity
      const streamNameLower = stream.name.toLowerCase()
        .replace(/[^a-z0-9]/g, ''); // Remove special characters
      
      for (const channelId of channelSet) {
        const channelLower = channelId.replace(/[^a-z0-9]/g, '');
        
        // Check if channel ID contains stream name or vice versa
        if (channelLower.includes(streamNameLower) || streamNameLower.includes(channelLower)) {
          // Find the original channel ID (with proper casing)
          const originalChannelId = channels.find(
            c => c.channelId.toLowerCase() === channelId
          )?.channelId;
          
          if (originalChannelId) {
            await prisma.stream.update({
              where: { id: stream.id },
              data: { epgChannelId: originalChannelId },
            });
            
            results.push({
              streamId: stream.id,
              streamName: stream.name,
              epgChannelId: originalChannelId,
            });
            break;
          }
        }
      }
    }

    logger.info({ mapped: results.length, total: streams.length }, 'Auto-mapped EPG channels');

    return {
      success: true,
      message: `Automatically mapped ${results.length} streams to EPG channels`,
      mappings: results,
    };
  });

  // ==================== ALWAYS-ON STREAMS ====================

  // Get always-on streams status
  fastify.get('/streams/always-on', async () => {
    const streams = alwaysOnStreamManager.getStatus();
    const stats = await alwaysOnStreamManager.getStats();

    // Fetch live viewer counts from Redis for each stream
    const streamList = await Promise.all(
      Array.from(streams.values()).map(async s => {
        const viewers = await alwaysOnStreamManager.getViewerCount(s.streamId);
        return {
          streamId: s.streamId,
          name: s.name,
          status: s.status,
          startedAt: s.startedAt,
          lastError: s.lastError,
          restartCount: s.restartCount,
          viewers,
        };
      })
    );

    return {
      stats,
      streams: streamList,
    };
  });

  // Enable always-on for a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/always-on/enable', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    // Verify stream exists and is LIVE
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, streamType: true, name: true, sourceUrl: true },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    if (stream.streamType !== 'LIVE') {
      return reply.status(400).send({
        success: false,
        error: 'Only LIVE streams can be always-on',
        message: 'Only LIVE streams can be always-on'
      });
    }

    try {
      const success = await alwaysOnStreamManager.enableAlwaysOn(streamId);

      if (!success) {
        return reply.status(500).send({
          success: false,
          message: `Failed to start stream. Check that the source URL is accessible: ${stream.sourceUrl}`,
          streamId,
        });
      }

      return {
        success: true,
        message: `${stream.name} is now running 24/7`,
        streamId,
      };
    } catch (error: any) {
      logger.error({ error, streamId, name: stream.name }, 'Error enabling always-on');
      return reply.status(500).send({
        success: false,
        message: error.message || 'Failed to enable always-on',
        streamId,
      });
    }
  });

  // Disable always-on for a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/always-on/disable', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    await alwaysOnStreamManager.disableAlwaysOn(streamId);

    return {
      success: true,
      message: 'Stream always-on disabled',
      streamId,
    };
  });

  // Get status of a specific always-on stream
  fastify.get<{ Params: { id: string } }>('/streams/:id/always-on/status', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    // Use async version to get live viewer count from Redis
    const status = await alwaysOnStreamManager.getStreamStatusAsync(streamId);

    if (!status) {
      // Check if the stream exists and is set to always-on
      const stream = await prisma.stream.findUnique({
        where: { id: streamId },
        select: { id: true, alwaysOn: true, name: true },
      });

      if (!stream) {
        return reply.status(404).send({ error: 'Stream not found' });
      }

      return {
        streamId,
        name: stream.name,
        alwaysOn: stream.alwaysOn,
        status: stream.alwaysOn ? 'pending' : 'disabled',
        viewers: 0,
      };
    }

    return {
      streamId: status.streamId,
      name: status.name,
      alwaysOn: true,
      status: status.status,
      startedAt: status.startedAt,
      lastError: status.lastError,
      restartCount: status.restartCount,
      viewers: status.viewers,
    };
  });

  // Manually restart an always-on stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/always-on/restart', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
      select: { id: true, name: true, alwaysOn: true },
    });

    if (!stream) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    if (!stream.alwaysOn) {
      return reply.status(400).send({ error: 'Stream is not set to always-on' });
    }

    // Use restartAlwaysOn which respects distribution
    const success = await alwaysOnStreamManager.restartAlwaysOn(streamId);

    return {
      success,
      message: success ? 'Stream restarted' : 'Failed to restart stream',
    };
  });

  // Reload all always-on streams (e.g., after config changes)
  fastify.post('/streams/always-on/reload', async () => {
    await alwaysOnStreamManager.reload();
    return { success: true, message: 'Always-on streams reloaded' };
  });

  // ==================== ALWAYS-ON HEALTH MONITORING ====================

  // Get health status for all always-on streams
  fastify.get('/streams/always-on/health', async () => {
    const [healthStatus, healthStats] = await Promise.all([
      alwaysOnStreamManager.getAllHealthStatus(),
      alwaysOnStreamManager.getHealthStats(),
    ]);

    return {
      success: true,
      stats: healthStats,
      streams: healthStatus,
    };
  });

  // Get health status for a specific stream
  fastify.get<{ Params: { id: string } }>('/streams/always-on/:id/health', async (request, reply) => {
    const streamId = parseInt(request.params.id);
    
    const healthStatus = await alwaysOnStreamManager.getStreamHealthStatus(streamId);
    
    if (!healthStatus) {
      return reply.status(404).send({
        success: false,
        error: 'Stream not found or not monitored',
      });
    }

    return {
      success: true,
      health: healthStatus,
    };
  });

  // Force a health check on a specific stream
  fastify.post<{ Params: { id: string } }>('/streams/always-on/:id/health/check', async (request, reply) => {
    const streamId = parseInt(request.params.id);
    
    const result = await alwaysOnStreamManager.forceHealthCheck(streamId);
    
    if (!result) {
      return reply.status(404).send({
        success: false,
        error: 'Stream not found',
      });
    }

    return {
      success: true,
      result,
    };
  });

  // Get health monitor configuration
  fastify.get('/streams/always-on/health/config', async () => {
    const config = alwaysOnStreamManager.getHealthMonitorConfig();
    return {
      success: true,
      config,
    };
  });

  // Update health monitor configuration
  fastify.put('/streams/always-on/health/config', async (request, reply) => {
    const configUpdate = request.body as {
      checkIntervalMs?: number;
      probeTimeoutMs?: number;
      maxConsecutiveFailures?: number;
      memoryThresholdMb?: number;
      cpuThresholdPercent?: number;
      frozenDetectionDuration?: number;
      silentDetectionDuration?: number;
      silentAudioThresholdDb?: number;
      frozenFrameThreshold?: number;
      restartCooldownMs?: number;
      enableAudioChecks?: boolean;
      enableFrozenChecks?: boolean;
      enableProcessMetrics?: boolean;
      enableHttpChecks?: boolean;
    };

    await alwaysOnStreamManager.updateHealthMonitorConfig(configUpdate);
    
    return {
      success: true,
      message: 'Health monitor configuration updated and saved to database',
      config: alwaysOnStreamManager.getHealthMonitorConfig(),
    };
  });

  // ==================== VOD VIEWER TRACKING ====================
  
  // Get VOD viewer statistics
  fastify.get('/streams/vod/viewers', async () => {
    const activeStreams = await vodViewerManager.getActiveVodStreams();
    const totalViewers = await vodViewerManager.getTotalViewerCount();
    
    // Enrich with stream names
    const streamIds = activeStreams.map(s => s.streamId);
    const streams = await prisma.stream.findMany({
      where: { id: { in: streamIds } },
      select: { id: true, name: true, logoUrl: true },
    });
    
    const streamMap = new Map(streams.map(s => [s.id, s]));
    
    const enrichedStreams = activeStreams.map(s => ({
      ...s,
      name: streamMap.get(s.streamId)?.name || 'Unknown',
      logoUrl: streamMap.get(s.streamId)?.logoUrl,
    }));
    
    return {
      success: true,
      totalViewers,
      activeVodCount: activeStreams.length,
      streams: enrichedStreams,
    };
  });
  
  // Get viewer count for a specific VOD
  fastify.get<{ Params: { id: string } }>('/streams/:id/vod-viewers', async (request) => {
    const { id } = request.params;
    const streamId = parseInt(id);
    
    const viewerCount = await vodViewerManager.getViewerCount(streamId);
    
    return {
      success: true,
      streamId,
      viewerCount,
    };
  });

  // Force cleanup idle on-demand streams
  fastify.post('/streams/on-demand/cleanup', async () => {
    const { onDemandStreamManager } = await import('../../services/streaming/OnDemandStreamManager.js');
    const stoppedCount = await onDemandStreamManager.forceStopAllIdleStreams();
    return { 
      success: true, 
      message: `Stopped ${stoppedCount} idle on-demand streams`,
      stoppedCount,
    };
  });

  // Get on-demand stream debug info
  fastify.get('/streams/on-demand/debug', async () => {
    const { onDemandStreamManager } = await import('../../services/streaming/OnDemandStreamManager.js');
    return onDemandStreamManager.getDebugInfo();
  });

  // ==================== STREAM LIFECYCLE MANAGEMENT ====================
  // Start, Stop, Restart streams with proper transcoding profile support

  // Start a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/start', async (request, reply) => {
    const { id } = request.params;
    const { profileId, sourceUrl, serverId } = request.body as {
      profileId?: number;
      sourceUrl?: string;
      serverId?: number;
    };
    const streamId = parseInt(id);

    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    try {
      const instance = await streamLifecycleManager.startStream(streamId, {
        profileId,
        sourceUrl,
        serverId,
      });

      return {
        success: true,
        message: 'Stream started successfully',
        streamId,
        pid: instance.ffmpegPid,
        profile: instance.profile?.name || 'passthrough',
        sourceUrl: instance.sourceUrl,
        startedAt: instance.startedAt,
      };
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to start stream');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to start stream',
        streamId,
      });
    }
  });

  // Stop a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/stop', async (request, reply) => {
    const { id } = request.params;
    const { cleanup = true } = request.body as { cleanup?: boolean };
    const streamId = parseInt(id);

    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    try {
      await streamLifecycleManager.stopStream(streamId, cleanup);

      return {
        success: true,
        message: 'Stream stopped successfully',
        streamId,
        cleaned: cleanup,
      };
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to stop stream');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to stop stream',
        streamId,
      });
    }
  });

  // Restart a stream
  fastify.post<{ Params: { id: string } }>('/streams/:id/restart', async (request, reply) => {
    const { id } = request.params;
    const { profileId, sourceUrl } = request.body as {
      profileId?: number;
      sourceUrl?: string;
    };
    const streamId = parseInt(id);

    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    try {
      const instance = await streamLifecycleManager.restartStream(streamId, {
        profileId,
        sourceUrl,
      });

      return {
        success: true,
        message: 'Stream restarted successfully',
        streamId,
        pid: instance.ffmpegPid,
        profile: instance.profile?.name || 'passthrough',
        restartCount: instance.restartCount,
      };
    } catch (error: any) {
      logger.error({ streamId, error: error.message }, 'Failed to restart stream');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to restart stream',
        streamId,
      });
    }
  });

  // Get stream status (running/stopped, PID, etc.)
  fastify.get<{ Params: { id: string } }>('/streams/:id/status', async (request, reply) => {
    const { id } = request.params;
    const streamId = parseInt(id);

    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    try {
      const status = await streamLifecycleManager.getStreamStatus(streamId);

      return {
        streamId,
        ...status,
        isRunning: streamLifecycleManager.isStreamRunning(streamId),
      };
    } catch (error: any) {
      return reply.status(404).send({
        error: error.message || 'Stream not found',
        streamId,
      });
    }
  });

  // Get all running streams
  fastify.get('/streams/running', async () => {
    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    const runningIds = streamLifecycleManager.getRunningStreamIds();

    const streams = await prisma.stream.findMany({
      where: { id: { in: runningIds } },
      select: {
        id: true,
        name: true,
        streamStatus: true,
        ffmpegPid: true,
        lastStartedAt: true,
        transcodingProfile: {
          select: { id: true, name: true, encodingMode: true },
        },
      },
    });

    return {
      count: streams.length,
      streams,
    };
  });

  // Stop all streams
  fastify.post('/streams/stop-all', async () => {
    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    const runningIds = streamLifecycleManager.getRunningStreamIds();
    await streamLifecycleManager.stopAllStreams();

    return {
      success: true,
      message: `Stopped ${runningIds.length} streams`,
      stoppedIds: runningIds,
    };
  });

  // Recover orphaned streams (for maintenance)
  fastify.post('/streams/recover-orphaned', async () => {
    const { streamLifecycleManager } = await import('../../services/streaming/StreamLifecycleManager.js');

    await streamLifecycleManager.recoverOrphanedStreams();

    return {
      success: true,
      message: 'Orphaned stream recovery completed',
    };
  });

  // ==================== STATISTICS ====================

  // Get dashboard stats
  // Resellers see only their own data
  fastify.get('/stats/dashboard', async (request) => {
    const currentUser = getUser(request);
    const userIsAdmin = isAdmin(request);

    // For resellers, count their sub-users and lines
    const userWhere = !userIsAdmin && currentUser ? { parentId: currentUser.id } : {};
    const lineWhere = !userIsAdmin && currentUser ? { ownerId: currentUser.id } : {};

    const [
      totalUsers,
      activeUsers,
      totalLines,
      activeLines,
      totalStreams,
      liveStreams,
      vodStreams,
      radioStreams,
    ] = await Promise.all([
      // Users: admin sees all, resellers see their children
      prisma.user.count({ where: userWhere }),
      prisma.user.count({ where: { ...userWhere, status: 'ACTIVE' } }),
      // Lines: admin sees all, resellers see their owned lines
      prisma.iptvLine.count({ where: lineWhere }),
      prisma.iptvLine.count({ where: { ...lineWhere, status: 'active' } }),
      // Streams: only relevant for admin
      userIsAdmin ? prisma.stream.count() : Promise.resolve(0),
      userIsAdmin ? prisma.stream.count({ where: { streamType: 'LIVE' } }) : Promise.resolve(0),
      userIsAdmin ? prisma.stream.count({ where: { streamType: 'VOD' } }) : Promise.resolve(0),
      userIsAdmin ? prisma.stream.count({ where: { streamType: 'RADIO' } }) : Promise.resolve(0),
    ]);

    // Count active connections from the same source as getActiveConnectionsDetailed
    // This ensures dashboard stats match the Active Connections panel exactly
    const { getActiveConnectionsDetailed } = await import('../middlewares/auth.js');
    
    let activeConnections = 0;
    let totalLiveViewers = 0;
    let totalVodViewers = 0;
    
    try {
      const connections = await getActiveConnectionsDetailed();
      activeConnections = connections.length;
      
      // Count by content type to match the panel breakdown
      for (const conn of connections) {
        if (conn.contentType === 'VOD' || conn.contentType === 'SERIES') {
          totalVodViewers++;
        } else {
          // LIVE, RADIO, or any other type counts as live
          totalLiveViewers++;
        }
      }
    } catch (err) {
      logger.error({ err }, 'Failed to get active connections for stats');
    }

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
      },
      lines: {
        total: totalLines,
        active: activeLines,
      },
      streams: {
        total: totalStreams,
        live: liveStreams,
        vod: vodStreams,
        radio: radioStreams,
      },
      connections: {
        active: activeConnections,
        live: totalLiveViewers,
        vod: totalVodViewers,
      },
    };
  });

  // Get reseller-specific dashboard stats
  // Returns comprehensive stats for resellers including activation codes
  fastify.get('/stats/reseller', async (request) => {
    const currentUser = getUser(request);
    
    if (!currentUser) {
      return { error: 'Unauthorized' };
    }

    const userId = currentUser.id;

    // Get reseller's own data
    const [
      // Sub-resellers (children)
      totalSubResellers,
      // IPTV Lines owned by this reseller
      totalLines,
      activeLines,
      expiredLines,
      // Activation codes created by this reseller
      totalCodes,
      unusedCodes,
      usedCodes,
      // Credit balance
      userWithCredits,
      // Recent transactions
      recentTransactions,
    ] = await Promise.all([
      prisma.user.count({ where: { parentId: userId } }),
      prisma.iptvLine.count({ where: { ownerId: userId } }),
      prisma.iptvLine.count({ where: { ownerId: userId, status: 'active' } }),
      prisma.iptvLine.count({ where: { ownerId: userId, status: 'expired' } }),
      prisma.activationCode.count({ where: { createdById: userId } }),
      prisma.activationCode.count({ where: { createdById: userId, status: 'UNUSED' } }),
      prisma.activationCode.count({ where: { createdById: userId, status: 'USED' } }),
      prisma.user.findUnique({ where: { id: userId }, select: { credits: true } }),
      prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      subResellers: {
        total: totalSubResellers,
      },
      lines: {
        total: totalLines,
        active: activeLines,
        expired: expiredLines,
      },
      activationCodes: {
        total: totalCodes,
        unused: unusedCodes,
        used: usedCodes,
      },
      credits: {
        balance: userWithCredits?.credits || 0,
      },
      recentTransactions,
    };
  });

  // Get active connections - return all connections including HLS from Redis
  fastify.get('/stats/connections', async () => {
    const { getActiveConnectionsDetailed } = await import('../middlewares/auth.js');
    
    try {
      const connections = await getActiveConnectionsDetailed();
      return connections;
    } catch (error) {
      logger.error({ error }, 'Failed to get active connections');
      return [];
    }
  });

  // Get connection statistics for dashboard
  fastify.get('/stats/connections/summary', async () => {
    const { getActiveConnectionsDetailed } = await import('../middlewares/auth.js');
    
    try {
      const connections = await getActiveConnectionsDetailed();
      
      // Group by content type
      const byContentType: Record<string, number> = {
        LIVE: 0,
        VOD: 0,
        SERIES: 0,
        RADIO: 0,
      };
      
      // Group by country
      const byCountry: Record<string, number> = {};
      
      // Group by server
      const byServer: Record<string, number> = {};
      
      // Unique users
      const uniqueUsers = new Set<string>();
      
      for (const conn of connections) {
        byContentType[conn.contentType] = (byContentType[conn.contentType] || 0) + 1;
        
        const country = conn.countryCode || 'UNKNOWN';
        byCountry[country] = (byCountry[country] || 0) + 1;
        
        const serverName = conn.serverName || 'Unknown';
        byServer[serverName] = (byServer[serverName] || 0) + 1;
        
        uniqueUsers.add(conn.username);
      }
      
      return {
        total: connections.length,
        uniqueUsers: uniqueUsers.size,
        byContentType,
        byCountry,
        byServer,
        recentConnections: connections.slice(0, 10),
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get connection summary');
      return {
        total: 0,
        uniqueUsers: 0,
        byContentType: { LIVE: 0, VOD: 0, SERIES: 0, RADIO: 0 },
        byCountry: {},
        byServer: {},
        recentConnections: [],
      };
    }
  });

  // Cleanup stale connections from database
  fastify.post('/stats/connections/cleanup', async () => {
    const { redis } = await import('../../config/redis.js');
    const { cleanupExpiredHlsConnections } = await import('../middlewares/auth.js');

    let redisCleanedCount = 0;
    let cursor = '0';

    // Clean up Redis connection sets
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'connections:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        // Extract userId from key pattern "connections:{userId}"
        const userId = parseInt(key.split(':')[1], 10);
        if (!isNaN(userId)) {
          const beforeCount = await redis.scard(key);
          await cleanupExpiredHlsConnections(userId);
          const afterCount = await redis.scard(key);
          redisCleanedCount += (beforeCount - afterCount);
        }
      }
    } while (cursor !== '0');

    // Get all active connection IDs from Redis (after cleanup)
    const activeConnectionIds: string[] = [];
    cursor = '0';

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'connections:*', 'COUNT', 100);
      cursor = nextCursor;

      for (const key of keys) {
        const connectionIds = await redis.smembers(key);
        activeConnectionIds.push(...connectionIds);
      }
    } while (cursor !== '0');

    // Delete all connections NOT in the active set from PostgreSQL
    const dbResult = await prisma.lineConnection.deleteMany({
      where: activeConnectionIds.length > 0
        ? { id: { notIn: activeConnectionIds } }
        : {} // Delete all if no active connections
    });

    logger.info({
      redisCleanup: redisCleanedCount,
      dbCleanup: dbResult.count
    }, 'Cleaned up stale connections');

    return {
      success: true,
      redisCleanup: redisCleanedCount,
      dbCleanup: dbResult.count,
      message: `Cleaned up ${redisCleanedCount} Redis connections and ${dbResult.count} database connections`,
    };
  });

  // SSE endpoint for realtime connection updates
  fastify.get('/stats/connections/stream', async (request, reply) => {
    const { getActiveConnectionsDetailed } = await import('../middlewares/auth.js');
    
    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    let isActive = true;
    let lastHash = '';
    
    // Send initial connections immediately
    const sendConnections = async () => {
      if (!isActive) return;
      
      try {
        const connections = await getActiveConnectionsDetailed();
        
        // Create simple hash to detect changes
        const currentHash = JSON.stringify(connections.map(c => `${c.id}:${c.streamId}`));
        
        // Only send if data changed
        if (currentHash !== lastHash) {
          lastHash = currentHash;
          
          // Send connections data
          reply.raw.write(`event: connections\n`);
          reply.raw.write(`data: ${JSON.stringify(connections)}\n\n`);
        } else {
          // Send heartbeat to keep connection alive
          reply.raw.write(`: heartbeat\n\n`);
        }
      } catch (error) {
        logger.error({ error }, 'Error sending SSE connection update');
        reply.raw.write(`event: error\n`);
        reply.raw.write(`data: ${JSON.stringify({ error: 'Failed to fetch connections' })}\n\n`);
      }
    };

    // Send immediately
    await sendConnections();
    
    // Then send updates every 2 seconds
    const intervalId = setInterval(sendConnections, 2000);
    
    // Handle client disconnect
    request.raw.on('close', () => {
      isActive = false;
      clearInterval(intervalId);
      logger.debug('SSE connection closed for /stats/connections/stream');
    });
    
    // Don't return - keep connection open
    return reply;
  });

  // ==================== LOGS ====================

  // Get system logs
  fastify.get('/logs', async (request) => {
    const query = request.query as {
      level?: string;
      source?: string;
      streamId?: string;
      userId?: string;
      serverId?: string;
      search?: string;
      limit?: string;
      offset?: string;
      startDate?: string;
      endDate?: string;
    };

    const limit = Math.min(parseInt(query.limit || '50'), 500);
    const offset = parseInt(query.offset || '0');

    const logs = await dbLogger.queryLogs({
      level: query.level as LogLevel | undefined,
      source: query.source as LogSource | undefined,
      streamId: query.streamId ? parseInt(query.streamId) : undefined,
      userId: query.userId ? parseInt(query.userId) : undefined,
      serverId: query.serverId ? parseInt(query.serverId) : undefined,
      search: query.search,
      limit,
      offset,
      startDate: query.startDate ? new Date(query.startDate) : undefined,
      endDate: query.endDate ? new Date(query.endDate) : undefined,
    });

    return logs;
  });

  // Get log levels and sources for filtering
  fastify.get('/logs/filters', async () => {
    return {
      levels: ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'],
      sources: ['STREAM', 'AUTH', 'USER', 'SERVER', 'EPG', 'TRANSCODE', 'SYSTEM', 'API'],
    };
  });

  // Get log statistics
  fastify.get('/logs/stats', async () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const [
      totalLogs,
      logsLastDay,
      logsLastHour,
      errorCount,
      warningCount,
      logsByLevel,
      logsBySource,
    ] = await Promise.all([
      prisma.systemLog.count(),
      prisma.systemLog.count({ where: { timestamp: { gte: oneDayAgo } } }),
      prisma.systemLog.count({ where: { timestamp: { gte: oneHourAgo } } }),
      prisma.systemLog.count({ where: { level: 'ERROR', timestamp: { gte: oneDayAgo } } }),
      prisma.systemLog.count({ where: { level: 'WARNING', timestamp: { gte: oneDayAgo } } }),
      prisma.systemLog.groupBy({
        by: ['level'],
        _count: { level: true },
        where: { timestamp: { gte: oneDayAgo } },
      }),
      prisma.systemLog.groupBy({
        by: ['source'],
        _count: { source: true },
        where: { timestamp: { gte: oneDayAgo } },
      }),
    ]);

    return {
      total: totalLogs,
      lastDay: logsLastDay,
      lastHour: logsLastHour,
      errors24h: errorCount,
      warnings24h: warningCount,
      byLevel: logsByLevel.reduce((acc, item) => {
        acc[item.level] = item._count.level;
        return acc;
      }, {} as Record<string, number>),
      bySource: logsBySource.reduce((acc, item) => {
        acc[item.source] = item._count.source;
        return acc;
      }, {} as Record<string, number>),
    };
  });

  // Clear old logs manually
  fastify.delete('/logs/cleanup', async (request) => {
    const query = request.query as { daysToKeep?: string };
    const daysToKeep = parseInt(query.daysToKeep || '7');
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.systemLog.deleteMany({
      where: { timestamp: { lt: cutoffDate } },
    });

    logger.info({ deletedCount: result.count, daysToKeep }, 'Old logs cleaned up');

    return {
      success: true,
      deletedCount: result.count,
      message: `Deleted ${result.count} logs older than ${daysToKeep} days`,
    };
  });


  // ==================== SOURCE STATUS CHECKING ====================

  // Get source status statistics
  fastify.get('/source-status/stats', async () => {
    const { sourceStatusChecker } = await import('../../services/monitoring/SourceStatusChecker.js');
    return sourceStatusChecker.getStats();
  });

  // Get source status checker status
  fastify.get('/source-status/status', async () => {
    const { sourceStatusChecker } = await import('../../services/monitoring/SourceStatusChecker.js');
    return sourceStatusChecker.getStatus();
  });

  // Get all offline streams
  fastify.get('/streams/offline', async (request) => {
    const query = request.query as { page?: string; limit?: string; categoryId?: string };
    const { sourceStatusChecker } = await import('../../services/monitoring/SourceStatusChecker.js');

    return sourceStatusChecker.getOfflineStreams({
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 50,
      categoryId: query.categoryId ? parseInt(query.categoryId) : undefined,
    });
  });

  // Get source check details for a specific stream
  fastify.get('/streams/:id/source-checks', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { sourceStatusChecker } = await import('../../services/monitoring/SourceStatusChecker.js');

    const result = await sourceStatusChecker.getStreamSourceChecks(parseInt(id));
    if (!result) {
      return reply.status(404).send({ error: 'Stream not found' });
    }

    return result;
  });

  // Get streams filtered by source status
  fastify.get('/streams/source-status', async (request) => {
    const query = request.query as {
      status?: string;
      page?: string;
      limit?: string;
      categoryId?: string;
    };

    const page = query.page ? parseInt(query.page) : 1;
    const limit = query.limit ? parseInt(query.limit) : 50;
    const skip = (page - 1) * limit;

    const where: any = {
      streamType: 'LIVE',
      isActive: true,
    };

    if (query.status) {
      where.sourceStatus = query.status;
    }

    if (query.categoryId) {
      where.categoryId = parseInt(query.categoryId);
    }

    const [streams, total] = await Promise.all([
      prisma.stream.findMany({
        where,
        select: {
          id: true,
          name: true,
          sourceStatus: true,
          lastSourceCheck: true,
          onlineSourceCount: true,
          totalSourceCount: true,
          category: {
            select: { name: true },
          },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.stream.count({ where }),
    ]);

    return {
      streams: streams.map((s) => ({
        id: s.id,
        name: s.name,
        sourceStatus: s.sourceStatus,
        lastSourceCheck: s.lastSourceCheck,
        onlineSourceCount: s.onlineSourceCount,
        totalSourceCount: s.totalSourceCount,
        categoryName: s.category?.name || '',
      })),
      total,
      page,
      limit,
    };
  });


  // ==================== BANDWIDTH MONITORING ====================

  // Get bandwidth status for all servers
  fastify.get('/bandwidth/status', async () => {
    const { bandwidthRouter } = await import('../../services/loadbalancer/BandwidthAwareRouter.js');
    
    const [servers, systemStatus] = await Promise.all([
      bandwidthRouter.getAllServerBandwidth(),
      bandwidthRouter.getSystemBandwidthStatus(),
    ]);

    return {
      system: systemStatus,
      servers: servers.sort((a: any, b: any) => b.availableBandwidthMbps - a.availableBandwidthMbps),
    };
  });

  // Get bandwidth for specific server
  fastify.get('/bandwidth/server/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { bandwidthRouter } = await import('../../services/loadbalancer/BandwidthAwareRouter.js');
    
    const info = await bandwidthRouter.getServerBandwidth(parseInt(id));
    if (!info) {
      return reply.status(404).send({ error: 'Server not found' });
    }

    return info;
  });

  // Get routing recommendation for a stream
  fastify.get('/bandwidth/route/:streamId', async (request, reply) => {
    const { streamId } = request.params as { streamId: string };
    const { bitrate } = request.query as { bitrate?: string };
    const { bandwidthRouter } = await import('../../services/loadbalancer/BandwidthAwareRouter.js');
    
    try {
      const decision = await bandwidthRouter.routeByBandwidth(
        parseInt(streamId),
        bitrate ? parseFloat(bitrate) : 5
      );
      return decision;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // Get servers sorted by available bandwidth
  fastify.get('/bandwidth/available', async () => {
    const { bandwidthRouter } = await import('../../services/loadbalancer/BandwidthAwareRouter.js');
    return bandwidthRouter.getServersByAvailableBandwidth();
  });

  // Test route a stream to best server
  fastify.post('/bandwidth/test-route', async (request, reply) => {
    const { streamId, estimatedBitrate, preferredServerId } = request.body as {
      streamId: number;
      estimatedBitrate?: number;
      preferredServerId?: number;
    };
    
    const { bandwidthRouter } = await import('../../services/loadbalancer/BandwidthAwareRouter.js');
    
    try {
      const decision = await bandwidthRouter.routeByBandwidth(
        streamId,
        estimatedBitrate || 5,
        preferredServerId
      );
      return decision;
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  // ==================== EXTERNAL M3U SOURCES ====================

  // List all external sources
  fastify.get('/external-sources', async (request) => {
    const { page = '1', limit = '50', search } = request.query as {
      page?: string;
      limit?: string;
      search?: string;
    };

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [sources, total] = await Promise.all([
      prisma.externalSource.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { streams: true },
          },
        },
      }),
      prisma.externalSource.count({ where }),
    ]);

    return {
      sources: sources.map(source => ({
        ...source,
        streamCount: source._count.streams,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  });

  // Get single external source
  fastify.get('/external-sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
      include: {
        _count: {
          select: { streams: true },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    return {
      ...source,
      streamCount: source._count.streams,
    };
  });

  // Create external source
  fastify.post('/external-sources', async (request, reply) => {
    const {
      name,
      description,
      m3uUrl,
      epgUrl,
      isActive = true,
      autoSync = false,
      syncIntervalHours = 24,
      defaultStreamType = 'LIVE',
      createCategories = true,
      updateExisting = true,
      categoryPrefix,
      defaultBouquetId,
      sourceCountry,
      sourceLanguage,
      tags = [],
    } = request.body as {
      name: string;
      description?: string;
      m3uUrl: string;
      epgUrl?: string;
      isActive?: boolean;
      autoSync?: boolean;
      syncIntervalHours?: number;
      defaultStreamType?: StreamType;
      createCategories?: boolean;
      updateExisting?: boolean;
      categoryPrefix?: string;
      defaultBouquetId?: number;
      sourceCountry?: string;
      sourceLanguage?: string;
      tags?: string[];
    };

    if (!name || !m3uUrl) {
      return reply.status(400).send({ error: 'Name and M3U URL are required' });
    }

    const source = await prisma.externalSource.create({
      data: {
        name,
        description,
        m3uUrl,
        epgUrl,
        isActive,
        autoSync,
        syncIntervalHours,
        defaultStreamType,
        createCategories,
        updateExisting,
        categoryPrefix,
        defaultBouquetId,
        sourceCountry,
        sourceLanguage,
        tags,
      },
    });

    logger.info({ sourceId: source.id, name: source.name }, 'Created external source');

    return reply.status(201).send(source);
  });

  // Update external source
  fastify.put('/external-sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = request.body as Partial<{
      name: string;
      description: string;
      m3uUrl: string;
      epgUrl: string;
      isActive: boolean;
      autoSync: boolean;
      syncIntervalHours: number;
      defaultStreamType: StreamType;
      createCategories: boolean;
      updateExisting: boolean;
      categoryPrefix: string;
      defaultBouquetId: number;
      sourceCountry: string;
      sourceLanguage: string;
      tags: string[];
    }>;

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    const updated = await prisma.externalSource.update({
      where: { id: parseInt(id) },
      data,
    });

    logger.info({ sourceId: updated.id, name: updated.name }, 'Updated external source');

    return updated;
  });

  // Delete external source
  fastify.delete('/external-sources/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { deleteStreams = false } = request.query as { deleteStreams?: string };

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
      include: {
        streams: {
          select: { streamId: true },
        },
      },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    // If deleteStreams is true, also delete the associated streams
    if (deleteStreams === 'true' && source.streams.length > 0) {
      const streamIds = source.streams.map(s => s.streamId);
      
      // Delete streams (this will cascade delete ExternalSourceStream)
      await prisma.stream.deleteMany({
        where: { id: { in: streamIds } },
      });

      logger.info({ sourceId: source.id, streamCount: streamIds.length }, 'Deleted streams from external source');
    }

    await prisma.externalSource.delete({
      where: { id: parseInt(id) },
    });

    logger.info({ sourceId: source.id, name: source.name }, 'Deleted external source');

    return { success: true };
  });

  // Preview external source (without importing)
  fastify.post('/external-sources/preview', async (request, reply) => {
    const { url } = request.body as { url: string };

    if (!url) {
      return reply.status(400).send({ error: 'URL is required' });
    }

    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');

    try {
      const preview = await externalSourceSync.preview(url);
      return preview;
    } catch (error: any) {
      logger.error({ error, url }, 'Failed to preview external source');
      return reply.status(500).send({ 
        success: false, 
        error: error.message || 'Failed to preview M3U' 
      });
    }
  });

  // Sync external source (import/update streams)
  fastify.post('/external-sources/:id/sync', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dryRun = false } = request.body as { dryRun?: boolean };

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');

    // Start sync in background for large imports
    logger.info({ sourceId: source.id, name: source.name, dryRun }, 'Starting external source sync');

    // Run sync (can take a while for large playlists)
    try {
      const result = await externalSourceSync.sync(parseInt(id), { dryRun });
      
      logger.info({ 
        sourceId: source.id, 
        ...result 
      }, 'External source sync completed');

      return {
        ...result,
        message: result.success 
          ? `Sync completed: ${result.importedChannels} imported, ${result.updatedChannels} updated, ${result.failedChannels} failed`
          : 'Sync failed',
      };
    } catch (error: any) {
      logger.error({ error, sourceId: source.id }, 'External source sync failed');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Sync failed',
      });
    }
  });

  // Get streams from external source
  fastify.get('/external-sources/:id/streams', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = '1', limit = '50' } = request.query as {
      page?: string;
      limit?: string;
    };

    const pageNum = parseInt(page.toString());
    const limitNum = parseInt(limit.toString());

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    const [mappings, total] = await Promise.all([
      prisma.externalSourceStream.findMany({
        where: { externalSourceId: parseInt(id) },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        include: {
          stream: {
            select: {
              id: true,
              name: true,
              streamType: true,
              isActive: true,
              logoUrl: true,
              category: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { stream: { name: 'asc' } },
      }),
      prisma.externalSourceStream.count({
        where: { externalSourceId: parseInt(id) },
      }),
    ]);

    return {
      streams: mappings.map(m => ({
        id: m.stream.id,
        name: m.stream.name,
        streamType: m.stream.streamType,
        isActive: m.stream.isActive,
        logoUrl: m.stream.logoUrl,
        category: m.stream.category,
        externalId: m.externalId,
        externalName: m.externalName,
        groupTitle: m.groupTitle,
        lastSynced: m.lastSynced,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    };
  });

  // Cleanup removed streams from external source
  fastify.post('/external-sources/:id/cleanup', async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await prisma.externalSource.findUnique({
      where: { id: parseInt(id) },
    });

    if (!source) {
      return reply.status(404).send({ error: 'External source not found' });
    }

    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');

    try {
      const removedCount = await externalSourceSync.cleanupRemovedStreams(parseInt(id));
      
      return {
        success: true,
        message: `Cleaned up ${removedCount} streams that are no longer in the source`,
        removedCount,
      };
    } catch (error: any) {
      logger.error({ error, sourceId: source.id }, 'Cleanup failed');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Cleanup failed',
      });
    }
  });

  // Sync all auto-sync enabled sources
  fastify.post('/external-sources/sync-all', async (_request, reply) => {
    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');

    try {
      const results = await externalSourceSync.syncAllAutoSources();
      
      const successful = results.filter(r => r.result.success).length;
      const failed = results.filter(r => !r.result.success).length;

      return {
        success: true,
        message: `Synced ${successful} sources successfully, ${failed} failed`,
        results,
      };
    } catch (error: any) {
      logger.error({ error }, 'Sync all external sources failed');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Sync failed',
      });
    }
  });

  // Get all external sources sync status
  fastify.get('/external-sources/status', async () => {
    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');
    
    const status = await externalSourceSync.getAllSourcesStatus();
    
    return {
      sources: status,
      summary: {
        total: status.length,
        pending: status.filter(s => s.syncStatus === 'PENDING').length,
        syncing: status.filter(s => s.syncStatus === 'SYNCING').length,
        success: status.filter(s => s.syncStatus === 'SUCCESS').length,
        failed: status.filter(s => s.syncStatus === 'FAILED').length,
        partial: status.filter(s => s.syncStatus === 'PARTIAL').length,
      },
    };
  });

  // Create pre-configured French source
  fastify.post('/external-sources/presets/french', async (_request, reply) => {
    const { externalSourceSync } = await import('../../services/import/ExternalSourceSync.js');

    try {
      const source = await externalSourceSync.createFrenchSource();
      
      return {
        success: true,
        message: 'French IPTV source created successfully',
        source,
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to create French source preset');
      return reply.status(500).send({
        success: false,
        error: error.message || 'Failed to create preset',
      });
    }
  });


};

export default adminRoutes;
