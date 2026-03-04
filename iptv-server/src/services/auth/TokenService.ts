import crypto from 'crypto';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

// Token configuration
const TOKEN_PREFIX = 'admin_token:';
const DEFAULT_TTL_HOURS = 24;

interface TokenData {
  userId: number;
  createdAt: string;
}

/**
 * Redis-based token service for admin session management.
 * Tokens are stored with TTL and automatically expire.
 */
export const tokenService = {
  /**
   * Generate a cryptographically secure token
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  },

  /**
   * Store a token in Redis with TTL
   */
  async store(token: string, userId: number, ttlHours: number = DEFAULT_TTL_HOURS): Promise<Date> {
    const key = `${TOKEN_PREFIX}${token}`;
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const ttlSeconds = ttlHours * 60 * 60;

    const data: TokenData = {
      userId,
      createdAt: new Date().toISOString(),
    };

    await redis.setex(key, ttlSeconds, JSON.stringify(data));
    logger.debug({ userId, ttlHours }, 'Token stored in Redis');

    return expiresAt;
  },

  /**
   * Verify a token and return user ID if valid
   */
  async verify(token: string): Promise<{ userId: number } | null> {
    const key = `${TOKEN_PREFIX}${token}`;
    const data = await redis.get(key);

    if (!data) {
      return null;
    }

    try {
      const parsed: TokenData = JSON.parse(data);
      return { userId: parsed.userId };
    } catch (error) {
      logger.error({ error }, 'Failed to parse token data');
      await this.revoke(token);
      return null;
    }
  },

  /**
   * Revoke (delete) a token
   */
  async revoke(token: string): Promise<void> {
    const key = `${TOKEN_PREFIX}${token}`;
    await redis.del(key);
    logger.debug('Token revoked');
  },

  /**
   * Revoke all tokens for a user (for logout-all or password change)
   */
  async revokeAllForUser(userId: number): Promise<number> {
    // Scan for all tokens and check which belong to this user
    // Note: This is expensive, but necessary for security on logout-all
    let cursor = '0';
    let revokedCount = 0;

    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', `${TOKEN_PREFIX}*`, 'COUNT', 100);
      cursor = newCursor;

      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          try {
            const parsed: TokenData = JSON.parse(data);
            if (parsed.userId === userId) {
              await redis.del(key);
              revokedCount++;
            }
          } catch {
            // Invalid token, delete it
            await redis.del(key);
          }
        }
      }
    } while (cursor !== '0');

    if (revokedCount > 0) {
      logger.info({ userId, revokedCount }, 'Revoked all tokens for user');
    }

    return revokedCount;
  },

  /**
   * Get remaining TTL for a token in seconds
   */
  async getTTL(token: string): Promise<number> {
    const key = `${TOKEN_PREFIX}${token}`;
    return redis.ttl(key);
  },

  /**
   * Refresh token TTL (extend session)
   */
  async refresh(token: string, ttlHours: number = DEFAULT_TTL_HOURS): Promise<boolean> {
    const key = `${TOKEN_PREFIX}${token}`;
    const exists = await redis.exists(key);

    if (!exists) {
      return false;
    }

    const ttlSeconds = ttlHours * 60 * 60;
    await redis.expire(key, ttlSeconds);
    return true;
  },
};
