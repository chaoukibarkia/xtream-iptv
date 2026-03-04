import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { settingsService } from '../../services/settings/SettingsService.js';
import { passwordService } from '../../services/auth/PasswordService.js';
import { tokenService } from '../../services/auth/TokenService.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';
import { UserRole } from '@prisma/client';

/**
 * Get the real client IP from request headers
 * Handles X-Real-IP, X-Forwarded-For, and falls back to request.ip
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

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Rate limiting configuration for login
const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,          // Max attempts per window
  windowSeconds: 300,      // 5 minute window
  blockDurationSeconds: 900, // 15 minute block after max attempts
};

/**
 * Check if IP is rate limited for login attempts.
 * Returns remaining attempts or -1 if blocked.
 */
async function checkLoginRateLimit(ip: string): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
  const blockKey = `login_block:${ip}`;
  const attemptsKey = `login_attempts:${ip}`;

  // Check if blocked
  const blockTTL = await redis.ttl(blockKey);
  if (blockTTL > 0) {
    return { allowed: false, remaining: 0, retryAfter: blockTTL };
  }

  // Get current attempts
  const attempts = parseInt(await redis.get(attemptsKey) || '0', 10);
  const remaining = Math.max(0, LOGIN_RATE_LIMIT.maxAttempts - attempts);

  return { allowed: remaining > 0 || attempts === 0, remaining };
}

/**
 * Record a failed login attempt.
 */
async function recordFailedLogin(ip: string): Promise<void> {
  const attemptsKey = `login_attempts:${ip}`;
  const blockKey = `login_block:${ip}`;

  const attempts = await redis.incr(attemptsKey);

  // Set expiry on first attempt
  if (attempts === 1) {
    await redis.expire(attemptsKey, LOGIN_RATE_LIMIT.windowSeconds);
  }

  // Block if max attempts reached
  if (attempts >= LOGIN_RATE_LIMIT.maxAttempts) {
    await redis.setex(blockKey, LOGIN_RATE_LIMIT.blockDurationSeconds, '1');
    logger.warn({ ip, attempts }, 'IP blocked due to too many failed login attempts');
  }
}

/**
 * Clear login attempts on successful login.
 */
async function clearLoginAttempts(ip: string): Promise<void> {
  await redis.del(`login_attempts:${ip}`);
  await redis.del(`login_block:${ip}`);
}

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Login endpoint for admin panel (registered users only)
   * POST /auth/login
   * Rate limited: 5 attempts per 5 minutes, 15 minute block after max attempts
   */
  fastify.post('/login', async (request, reply) => {
    const ip = getClientIp(request);

    // Check rate limiting
    const rateLimit = await checkLoginRateLimit(ip);
    if (!rateLimit.allowed) {
      logger.warn({ ip }, 'Login blocked due to rate limiting');
      return reply.status(429).send({
        error: 'Too many login attempts',
        retryAfter: rateLimit.retryAfter,
        message: `Please try again in ${Math.ceil((rateLimit.retryAfter || 0) / 60)} minutes`,
      });
    }
    const { username, password } = loginSchema.parse(request.body);

    // Find registered user (admin/reseller)
    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        password: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      await recordFailedLogin(ip);
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // Verify password (supports both bcrypt and legacy plain text for migration)
    const isValidPassword = await passwordService.verifyWithLegacySupport(password, user.password);
    if (!isValidPassword) {
      await recordFailedLogin(ip);
      logger.warn({ username, ip }, 'Failed login attempt - invalid password');
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    // If password was plain text, upgrade to bcrypt hash
    if (!passwordService.isBcryptHash(user.password)) {
      const hashedPassword = await passwordService.hash(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });
      logger.info({ userId: user.id, username }, 'Upgraded password to bcrypt hash');
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return reply.status(403).send({ error: 'Account is not active' });
    }

    // Clear rate limit on successful login
    await clearLoginAttempts(ip);

    // Generate token and store in Redis
    const token = tokenService.generateToken();
    // Get session timeout from settings (default 24 hours)
    const sessionExpiryHours = await settingsService.getOrDefault<number>('security.jwtExpiry', 24);
    const expiresAt = await tokenService.store(token, user.id, sessionExpiryHours);

    // Update last activity
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActivity: new Date() },
    });

    // Map role to frontend-compatible format
    const roleMap: Record<UserRole, 'admin' | 'reseller' | 'sub_reseller'> = {
      ADMIN: 'admin',
      RESELLER: 'reseller',
      SUB_RESELLER: 'sub_reseller',
    };

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: roleMap[user.role],
        token,
        expiresAt: expiresAt.toISOString(),
      },
    };
  });

  /**
   * Logout endpoint
   * POST /auth/logout
   */
  fastify.post('/logout', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      await tokenService.revoke(token);
    }

    return { success: true };
  });

  /**
   * Verify token / Get current user
   * GET /auth/me
   */
  fastify.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const tokenData = await tokenService.verify(token);

    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (!user) {
      await tokenService.revoke(token);
      return reply.status(401).send({ error: 'User not found' });
    }

    // Get remaining TTL
    const ttlSeconds = await tokenService.getTTL(token);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Map role to frontend-compatible format
    const roleMap: Record<UserRole, 'admin' | 'reseller' | 'sub_reseller'> = {
      ADMIN: 'admin',
      RESELLER: 'reseller',
      SUB_RESELLER: 'sub_reseller',
    };

    return {
      id: user.id,
      username: user.username,
      email: user.email || '',
      role: roleMap[user.role],
      token,
      expiresAt: expiresAt.toISOString(),
    };
  });

  /**
   * Change password
   * POST /auth/change-password
   */
  fastify.post('/change-password', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const tokenData = await tokenService.verify(token);

    if (!tokenData) {
      return reply.status(401).send({ error: 'Invalid or expired token' });
    }

    const { currentPassword, newPassword } = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(6),
    }).parse(request.body);

    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
    });

    if (!user) {
      return reply.status(400).send({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await passwordService.verifyWithLegacySupport(currentPassword, user.password);
    if (!isValidPassword) {
      return reply.status(400).send({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await passwordService.hash(newPassword);
    await prisma.user.update({
      where: { id: tokenData.userId },
      data: { password: hashedPassword },
    });

    // Revoke all other tokens for this user (security: force re-login on all devices)
    await tokenService.revokeAllForUser(user.id);

    // Generate new token for current session
    const newToken = tokenService.generateToken();
    const expiresAt = await tokenService.store(newToken, user.id);

    logger.info({ userId: user.id }, 'Password changed successfully');
    return { success: true, token: newToken, expiresAt: expiresAt.toISOString() };
  });
};

// Export token verification for use in other routes
export async function verifyToken(token: string): Promise<{ userId: number } | null> {
  return tokenService.verify(token);
}

export default authRoutes;