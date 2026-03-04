import axios, { AxiosInstance, AxiosError } from 'axios';
import { tmdbConfig, buildImageUrl } from '../../config/tmdb.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';
import { settingsService } from '../settings/index.js';

/**
 * Rate limiter using token bucket algorithm
 * TMDB allows ~40 requests per 10 seconds
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number = 40;
  private readonly refillRate: number = 10000; // 10 seconds

  constructor() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens <= 0) {
      const waitTime = this.refillRate - (Date.now() - this.lastRefill);
      logger.debug({ waitTime }, 'TMDB rate limit, waiting...');
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      this.refill();
    }

    this.tokens--;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.refillRate) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }
  }
}

export class TmdbClient {
  private client: AxiosInstance;
  private rateLimiter: RateLimiter;
  private readonly cachePrefix = 'tmdb:';
  private readonly cacheTTL = 86400; // 24 hours

  constructor() {
    this.client = axios.create({
      baseURL: tmdbConfig.baseUrl,
      params: {
        api_key: tmdbConfig.apiKey,
      },
      timeout: 15000,
    });

    this.rateLimiter = new RateLimiter();

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleError(error)
    );
  }

  /**
   * Get the current TMDB language from settings
   */
  private async getLanguage(): Promise<string> {
    try {
      const language = await settingsService.get<string>('tmdb.language');
      return language || tmdbConfig.language;
    } catch {
      // Fallback to config if settings service fails
      return tmdbConfig.language;
    }
  }

  /**
   * Make a cached GET request to TMDB
   * @param endpoint - API endpoint
   * @param params - Query parameters
   * @param options - Request options (skipCache, language override)
   */
  async get<T>(
    endpoint: string,
    params: Record<string, any> = {},
    options: { skipCache?: boolean; language?: string } | boolean = false
  ): Promise<T> {
    // Handle backwards compatibility: if options is boolean, it's skipCache
    const skipCache = typeof options === 'boolean' ? options : options.skipCache ?? false;
    const languageOverride = typeof options === 'boolean' ? undefined : options.language;
    
    // Get language from override, params, or settings
    const language = languageOverride || params.language || await this.getLanguage();
    const paramsWithLanguage = { ...params, language };
    
    const cacheKey = this.buildCacheKey(endpoint, paramsWithLanguage);

    // Check cache first (unless skipped)
    if (!skipCache) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        logger.debug({ endpoint, cacheKey }, 'TMDB cache hit');
        return JSON.parse(cached);
      }
    }

    // Rate limit
    await this.rateLimiter.acquire();

    // Make request
    logger.debug({ endpoint, params: paramsWithLanguage }, 'TMDB API request');
    const response = await this.client.get<T>(endpoint, { params: paramsWithLanguage });

    // Cache response
    await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(response.data));

    return response.data;
  }

  /**
   * Build cache key from endpoint and params
   */
  private buildCacheKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map((k) => `${k}=${params[k]}`)
      .join('&');
    return `${this.cachePrefix}${endpoint}?${sortedParams}`;
  }

  /**
   * Handle API errors
   */
  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          logger.error('TMDB: Invalid API key');
          throw new Error('TMDB: Invalid API key');
        case 404:
          throw new Error('TMDB: Resource not found');
        case 429:
          logger.warn('TMDB: Rate limit exceeded');
          throw new Error('TMDB: Rate limit exceeded');
        default:
          throw new Error(`TMDB: ${data?.status_message || 'Unknown error'}`);
      }
    }
    throw error;
  }

  /**
   * Invalidate cache for a specific pattern
   */
  async invalidateCache(pattern: string): Promise<number> {
    const keys = await redis.keys(`${this.cachePrefix}${pattern}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return keys.length;
  }

  /**
   * Build full image URL (convenience method)
   */
  getImageUrl(path: string | null, size?: string): string | null {
    return buildImageUrl(path, size);
  }
}

// Export singleton instance
export const tmdbClient = new TmdbClient();

