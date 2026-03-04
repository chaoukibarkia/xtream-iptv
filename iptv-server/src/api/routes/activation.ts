import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { activationCodeService } from '../../services/activation/ActivationCodeService.js';
import { creditPackageService, creditService } from '../../services/credits/index.js';
import { logger } from '../../config/logger.js';
import { ActivationCodeStatus, UserRole } from '@prisma/client';
import { verifyToken } from './auth.js';

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

// Timing-safe string comparison to prevent timing attacks
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Compare against itself to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// ==================== VALIDATION SCHEMAS ====================

const generateCodesSchema = z.object({
  count: z.number().int().min(1).max(100).default(1),
  bouquetIds: z.array(z.number().int()).default([]),
  maxConnections: z.number().int().min(1).max(10).default(1),
  subscriptionDays: z.number().int().min(1).max(3650).default(30),
  isTrial: z.boolean().default(false),
  codeValidityDays: z.number().int().min(1).max(365).optional(),
  createdById: z.number().int().positive().optional(),
  deductCredits: z.boolean().default(false), // If true, deduct credits from owner
});

const activateCodeSchema = z.object({
  code: z.string().length(14).regex(/^\d{14}$/, 'Code must be 14 digits'),
  deviceId: z.string().min(1).max(100),
  preferredUsername: z.string().min(3).max(50).optional(),
});

const listCodesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.nativeEnum(ActivationCodeStatus).optional(),
  createdById: z.coerce.number().int().optional(),
});

const eligibleUsersQuerySchema = z.object({
  search: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().trim().min(1).max(50).optional(),
  ),
});

// ==================== ADMIN ROUTES ====================

export const activationAdminRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication for activation code management
  // Supports both JWT Bearer token (reseller/admin UI) and X-API-Key (automation)
  // Priority: JWT Bearer token first (to identify the actual user), then X-API-Key only
  fastify.addHook('preHandler', async (request, reply) => {
    const apiKey = request.headers['x-api-key'];
    const authHeader = request.headers['authorization'];

    // Try JWT Bearer token first (to identify the actual logged-in user)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenData = await verifyToken(token);
      
      if (tokenData) {
        const user = await prisma.user.findUnique({
          where: { id: tokenData.userId },
          select: { id: true, username: true, role: true },
        });

        if (user) {
          // Both ADMIN and reseller roles can manage activation codes
          if (!['ADMIN', 'RESELLER', 'SUB_RESELLER'].includes(user.role)) {
            return reply.status(403).send({ error: 'Access denied' });
          }

          // Also validate API key when JWT is present
          if (!apiKey || typeof apiKey !== 'string' || !secureCompare(apiKey, config.admin.apiKey)) {
            logger.warn({ ip: getClientIp(request), userId: user.id }, 'Activation API request with invalid API key');
            return reply.status(401).send({ error: 'Invalid API key' });
          }

          (request as any).user = user;
          return;
        }
      }
    }

    // Fall back to X-API-Key only (for automation/scripts - treated as admin)
    if (apiKey && typeof apiKey === 'string') {
      if (!secureCompare(apiKey, config.admin.apiKey)) {
        logger.warn({ ip: getClientIp(request) }, 'Activation API request with invalid API key');
        return reply.status(401).send({ error: 'Invalid API key' });
      }

      // API key only - treat as admin automation
      const adminUser = await prisma.user.findFirst({
        where: { role: UserRole.ADMIN },
        select: { id: true, username: true, role: true },
      });

      if (!adminUser) {
        logger.error('No admin user found in database for activation code operations');
        return reply.status(500).send({ error: 'Server configuration error' });
      }

      (request as any).user = adminUser;
      return;
    }

    return reply.status(401).send({ error: 'Authorization token or API key required' });
  });

  /**
   * Get eligible users for activation code ownership
   * GET /admin/activation-codes/eligible-users
   */
  fastify.get('/eligible-users', async (request, reply) => {
    const query = eligibleUsersQuerySchema.parse(request.query);
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    if (!userId || !userRole) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const where: any = {
      role: { in: [UserRole.RESELLER, UserRole.SUB_RESELLER] },
    };

    if (query.search) {
      where.username = { contains: query.search, mode: 'insensitive' as const };
    }

    if (userRole !== UserRole.ADMIN) {
      where.OR = [{ id: userId }, { parentId: userId }];
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { username: 'asc' },
      take: 50,
      select: {
        id: true,
        username: true,
        role: true,
        parentId: true,
      },
    });

    return { users };
  });

  /**
   * Generate activation codes
   * POST /admin/activation-codes
   */
  fastify.post('/', async (request, reply) => {
    const data = generateCodesSchema.parse(request.body);
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    if (!userId || !userRole) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    let ownerId = userId;

    if (data.createdById && data.createdById !== userId) {
      if (userRole === UserRole.ADMIN) {
        ownerId = data.createdById;
      } else {
        const eligible = await prisma.user.findFirst({
          where: {
            id: data.createdById,
            parentId: userId,
            role: { in: [UserRole.RESELLER, UserRole.SUB_RESELLER] },
          },
          select: { id: true },
        });

        if (!eligible) {
          return reply.status(403).send({ error: 'Access denied' });
        }

        ownerId = data.createdById;
      }
    }

    // Ensure target owner exists and has appropriate role
    // ADMINs can create codes under their own account, resellers/sub-resellers can too
    const owner = await prisma.user.findFirst({
      where: { id: ownerId, role: { in: [UserRole.ADMIN, UserRole.RESELLER, UserRole.SUB_RESELLER] } },
      select: { id: true },
    });

    if (!owner) {
      return reply.status(400).send({ error: 'Invalid createdById' });
    }

    // Validate bouquet IDs exist
    if (data.bouquetIds.length > 0) {
      const bouquets = await prisma.bouquet.findMany({
        where: { id: { in: data.bouquetIds } },
        select: { id: true },
      });

      if (bouquets.length !== data.bouquetIds.length) {
        return reply.status(400).send({ error: 'One or more bouquet IDs are invalid' });
      }
    }

    // Handle credit deduction if requested
    if (data.deductCredits) {
      const { credits: creditCostPerCode, package: matchedPackage } =
        await creditPackageService.getCostForDays(data.subscriptionDays);
      const totalCreditCost = creditCostPerCode * data.count;
      const hasCredits = await creditService.hasCredits(ownerId, totalCreditCost);

      if (!hasCredits) {
        const balance = await creditService.getBalance(ownerId);
        return reply.status(400).send({
          error: 'Insufficient credits',
          required: totalCreditCost,
          available: balance,
          costPerCode: creditCostPerCode,
          matchedPackage: matchedPackage
            ? { id: matchedPackage.id, name: matchedPackage.name, days: matchedPackage.days, credits: matchedPackage.credits }
            : null,
        });
      }
    }

    const codeExpiresAt = data.codeValidityDays
      ? new Date(Date.now() + data.codeValidityDays * 24 * 60 * 60 * 1000)
      : undefined;

    try {
      const codes = await activationCodeService.createBatch(data.count, {
        bouquetIds: data.bouquetIds,
        maxConnections: data.maxConnections,
        subscriptionDays: data.subscriptionDays,
        isTrial: data.isTrial,
        codeExpiresAt,
        createdById: ownerId,
      });

      // Deduct credits after successful code generation
      if (data.deductCredits) {
        const { credits: creditCostPerCode, package: matchedPackage } =
          await creditPackageService.getCostForDays(data.subscriptionDays);
        const totalCreditCost = creditCostPerCode * data.count;
        const chargeReason = matchedPackage
          ? `Activation codes generated: ${data.count} codes (${data.subscriptionDays} days each) [package: ${matchedPackage.name}]`
          : `Activation codes generated: ${data.count} codes (${data.subscriptionDays} days each)`;

        await creditService.deduct(ownerId, totalCreditCost, chargeReason);
      }

      logger.info(
        { userId, ownerId, count: codes.length, deductCredits: data.deductCredits },
        'Activation codes generated'
      );

      return {
        success: true,
        count: codes.length,
        codes,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to generate activation codes');
      return reply.status(500).send({ error: 'Failed to generate codes' });
    }
  });

  /**
   * Get activation code statistics
   * GET /admin/activation-codes/stats
   */
  fastify.get('/stats', async (request, reply) => {
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    const where = userRole !== UserRole.ADMIN ? { createdById: userId } : {};

    const [total, unused, used, expired, revoked] = await Promise.all([
      prisma.activationCode.count({ where }),
      prisma.activationCode.count({ where: { ...where, status: ActivationCodeStatus.UNUSED } }),
      prisma.activationCode.count({ where: { ...where, status: ActivationCodeStatus.USED } }),
      prisma.activationCode.count({ where: { ...where, status: ActivationCodeStatus.EXPIRED } }),
      prisma.activationCode.count({ where: { ...where, status: ActivationCodeStatus.REVOKED } }),
    ]);

    return {
      total,
      unused,
      used,
      expired,
      revoked,
    };
  });

  /**
   * List activation codes
   * GET /admin/activation-codes
   */
  fastify.get('/', async (request, reply) => {
    const query = listCodesQuerySchema.parse(request.query);
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    const where: any = {};

    if (query.status) {
      where.status = query.status;
    }

    // Non-admins can only see their own codes
    if (userRole !== UserRole.ADMIN) {
      where.createdById = userId;
    } else if (query.createdById) {
      where.createdById = query.createdById;
    }

    const [codes, total] = await Promise.all([
      prisma.activationCode.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, username: true } },
          usedByLine: { select: { id: true, username: true } },
        },
      }),
      prisma.activationCode.count({ where }),
    ]);

    return {
      codes,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        pages: Math.ceil(total / query.limit),
      },
    };
  });

  /**
   * Get activation code by ID
   * GET /admin/activation-codes/:id
   */
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    const code = await prisma.activationCode.findUnique({
      where: { id: parseInt(id) },
      include: {
        createdBy: { select: { id: true, username: true, role: true } },
        usedByLine: {
          select: {
            id: true,
            username: true,
            expiresAt: true,
            status: true,
          },
        },
      },
    });

    if (!code) {
      return reply.status(404).send({ error: 'Activation code not found' });
    }

    // Permission check: admin or creator
    if (userRole !== UserRole.ADMIN && code.createdById !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    return code;
  });

  /**
   * Delete/Revoke an unused activation code
   * DELETE /admin/activation-codes/:id
   */
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = (request as any).user?.id;
    const userRole = (request as any).user?.role;

    const code = await prisma.activationCode.findUnique({
      where: { id: parseInt(id) },
      select: { createdById: true },
    });

    if (!code) {
      return reply.status(404).send({ error: 'Activation code not found' });
    }

    if (userRole !== UserRole.ADMIN && code.createdById !== userId) {
      return reply.status(403).send({ error: 'Access denied' });
    }

    const success = await activationCodeService.revoke(parseInt(id), userId);

    if (!success) {
      return reply.status(400).send({
        error: 'Cannot delete code. It may not exist, already be used, or you lack permission.',
      });
    }

    return { success: true };
  });
};

// ==================== PUBLIC ACTIVATION ROUTES ====================

export const activationPublicRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Activate a code (no authentication required)
   * POST /activate
   */
  fastify.post('/', async (request, reply) => {
    const { code, deviceId, preferredUsername } = activateCodeSchema.parse(request.body);

    // Get client IP
    const ipAddress =
      (request.headers['x-real-ip'] as string) ||
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip;

    const result = await activationCodeService.activate(code, deviceId, preferredUsername, ipAddress);

    if (!result.success) {
      logger.warn(
        { code: code.slice(0, 4) + '**********', error: result.error, ip: ipAddress, deviceId },
        'Activation failed'
      );
      return reply.status(400).send({
        error: result.error,
        errorCode: result.errorCode,
        currentDeviceId: result.currentDeviceId,
      });
    }

    return {
      success: true,
      isNew: result.isNew,
      credentials: {
        username: result.iptvLine?.username,
        password: result.iptvLine?.password,
        expiresAt: result.iptvLine?.expiresAt?.toISOString(),
      },
    };
  });

  /**
   * Check if a code is valid (without activating)
   * GET /activate/check/:code
   */
  fastify.get('/check/:code', async (request, reply) => {
    const { code } = request.params as { code: string };

    if (!activationCodeService.isValidFormat(code)) {
      return reply.status(400).send({ valid: false, error: 'Invalid format' });
    }

    const activationCode = await prisma.activationCode.findUnique({
      where: { code },
      select: {
        status: true,
        codeExpiresAt: true,
        subscriptionDays: true,
        maxConnections: true,
        isTrial: true,
      },
    });

    if (!activationCode) {
      return { valid: false, error: 'Code not found' };
    }

    if (activationCode.status !== ActivationCodeStatus.UNUSED) {
      return { valid: false, error: 'Code already used or expired' };
    }

    if (activationCode.codeExpiresAt && activationCode.codeExpiresAt < new Date()) {
      return { valid: false, error: 'Code has expired' };
    }

    return {
      valid: true,
      subscriptionDays: activationCode.subscriptionDays,
      maxConnections: activationCode.maxConnections,
      isTrial: activationCode.isTrial,
    };
  });

  /**
   * Update device ID for an activated code
   * POST /activate/update-device
   */
  fastify.post('/update-device', async (request, reply) => {
    const updateDeviceSchema = z.object({
      code: z.string().length(14).regex(/^\d{14}$/, 'Code must be 14 digits'),
      oldDeviceId: z.string().min(1).max(100),
      newDeviceId: z.string().min(1).max(100),
    });

    const { code, oldDeviceId, newDeviceId } = updateDeviceSchema.parse(request.body);

    // Get client IP
    const ipAddress = getClientIp(request);

    // Find the activation code
    const activationCode = await prisma.activationCode.findUnique({
      where: { code },
      include: {
        usedByLine: {
          select: {
            id: true,
            username: true,
            lockedDeviceId: true,
          },
        },
      },
    });

    if (!activationCode) {
      logger.warn({ code: code.slice(0, 4) + '**********', ip: ipAddress }, 'Device update: Invalid code');
      return reply.status(404).send({ error: 'Code d\'activation invalide' });
    }

    if (activationCode.status !== ActivationCodeStatus.USED) {
      return reply.status(400).send({ error: 'Code non activé' });
    }

    if (!activationCode.usedByLine) {
      return reply.status(400).send({ error: 'Aucune ligne associée à ce code' });
    }

    // Verify old device ID matches
    if (activationCode.usedDeviceId !== oldDeviceId) {
      logger.warn(
        {
          code: code.slice(0, 4) + '**********',
          providedOldDeviceId: oldDeviceId,
          actualDeviceId: activationCode.usedDeviceId,
          ip: ipAddress,
        },
        'Device update: Old device ID mismatch'
      );
      return reply.status(403).send({ error: 'Ancien STB ID incorrect' });
    }

    // Update device ID in both activation code and IPTV line
    await prisma.$transaction([
      prisma.activationCode.update({
        where: { id: activationCode.id },
        data: { usedDeviceId: newDeviceId },
      }),
      prisma.iptvLine.update({
        where: { id: activationCode.usedByLine.id },
        data: { lockedDeviceId: newDeviceId },
      }),
    ]);

    // Invalidate auth cache for this line
    await cache.invalidatePattern(`line_auth:${activationCode.usedByLine.username}:*`);

    logger.info(
      {
        username: activationCode.usedByLine.username,
        codeId: activationCode.id,
        oldDeviceId,
        newDeviceId,
        ip: ipAddress,
      },
      'Device ID updated successfully'
    );

    return {
      success: true,
      message: 'STB ID mis à jour avec succès',
    };
  });
};
