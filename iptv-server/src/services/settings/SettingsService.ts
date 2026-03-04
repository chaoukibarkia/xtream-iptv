import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

// Default settings values
const DEFAULT_SETTINGS: Record<string, { value: string; type: string }> = {
  // General
  'general.siteName': { value: 'IPTV Streaming', type: 'string' },
  'general.siteUrl': { value: 'https://iptv.example.com', type: 'string' },
  'general.adminEmail': { value: 'admin@example.com', type: 'string' },
  'general.timezone': { value: 'UTC', type: 'string' },
  'general.language': { value: 'en', type: 'string' },

  // Streaming
  'streaming.defaultFormat': { value: 'hls', type: 'string' },
  'streaming.hlsSegmentDuration': { value: '4', type: 'number' },   // 4 seconds per segment (standard HLS)
  'streaming.hlsPlaylistLength': { value: '6', type: 'number' },    // 6 segments in playlist (~24s buffer)
  'streaming.transcodeEnabled': { value: 'true', type: 'boolean' },
  'streaming.maxBitrate': { value: '8000', type: 'number' },        // 8 Mbps max bitrate
  'streaming.bufferSize': { value: '32', type: 'number' },          // 32 MB buffer

  // Users
  'users.allowRegistration': { value: 'false', type: 'boolean' },
  'users.defaultExpiry': { value: '30', type: 'number' },
  'users.maxConnections': { value: '2', type: 'number' },
  'users.trialEnabled': { value: 'false', type: 'boolean' },
  'users.trialDuration': { value: '24', type: 'number' },

  // Security
  'security.jwtExpiry': { value: '24', type: 'number' },
  'security.requireHttps': { value: 'true', type: 'boolean' },
  'security.rateLimitEnabled': { value: 'true', type: 'boolean' },
  'security.rateLimitRequests': { value: '100', type: 'number' },
  'security.ipBlocking': { value: 'true', type: 'boolean' },

  // TMDB
  'tmdb.apiKey': { value: '', type: 'string' },
  'tmdb.autoFetch': { value: 'true', type: 'boolean' },
  'tmdb.language': { value: 'en-US', type: 'string' },

  // EPG
  'epg.updateInterval': { value: '12', type: 'number' },
  'epg.cacheDuration': { value: '24', type: 'number' },

  // Notifications
  'notifications.emailEnabled': { value: 'false', type: 'boolean' },
  'notifications.smtpHost': { value: '', type: 'string' },
  'notifications.smtpPort': { value: '587', type: 'number' },
  'notifications.smtpUser': { value: '', type: 'string' },

  // Source Status Checker
  'sourceChecker.enabled': { value: 'true', type: 'boolean' },
  'sourceChecker.intervalMinutes': { value: '30', type: 'number' },
  'sourceChecker.batchSize': { value: '50', type: 'number' },
  'sourceChecker.httpTimeoutMs': { value: '10000', type: 'number' },
};

class SettingsService {
  private cache: Map<string, { value: string; type: string }> = new Map();
  private cacheLoaded = false;

  /**
   * Initialize settings - creates defaults if they don't exist
   */
  async initialize(): Promise<void> {
    logger.info('Initializing system settings...');

    for (const [key, { value, type }] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await prisma.systemSettings.findUnique({
        where: { key },
      });

      if (!existing) {
        await prisma.systemSettings.create({
          data: { key, value, type },
        });
        logger.debug({ key, value }, 'Created default setting');
      }
    }

    // Load all settings into cache
    await this.loadCache();
    logger.info('System settings initialized');
  }

  /**
   * Load all settings into memory cache
   */
  async loadCache(): Promise<void> {
    const settings = await prisma.systemSettings.findMany();
    this.cache.clear();

    for (const setting of settings) {
      this.cache.set(setting.key, { value: setting.value, type: setting.type });
    }

    this.cacheLoaded = true;
    logger.debug({ count: settings.length }, 'Settings cache loaded');
  }

  /**
   * Get a setting value (with type conversion)
   */
  async get<T = string>(key: string): Promise<T | null> {
    // Ensure cache is loaded
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const cached = this.cache.get(key);
    if (cached) {
      return this.convertValue<T>(cached.value, cached.type);
    }

    // Fallback to DB if not in cache
    const setting = await prisma.systemSettings.findUnique({
      where: { key },
    });

    if (!setting) {
      // Check defaults
      const defaultSetting = DEFAULT_SETTINGS[key];
      if (defaultSetting) {
        return this.convertValue<T>(defaultSetting.value, defaultSetting.type);
      }
      return null;
    }

    // Update cache
    this.cache.set(key, { value: setting.value, type: setting.type });
    return this.convertValue<T>(setting.value, setting.type);
  }

  /**
   * Get a setting with a fallback default
   */
  async getOrDefault<T = string>(key: string, defaultValue: T): Promise<T> {
    const value = await this.get<T>(key);
    return value ?? defaultValue;
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: string | number | boolean, type?: string): Promise<void> {
    const stringValue = String(value);
    const valueType = type || this.inferType(value);

    await prisma.systemSettings.upsert({
      where: { key },
      update: { value: stringValue, type: valueType },
      create: { key, value: stringValue, type: valueType },
    });

    // Update cache
    this.cache.set(key, { value: stringValue, type: valueType });
    logger.debug({ key, value: stringValue }, 'Setting updated');
  }

  /**
   * Set multiple settings at once
   */
  async setMany(settings: Record<string, string | number | boolean>): Promise<void> {
    for (const [key, value] of Object.entries(settings)) {
      await this.set(key, value);
    }
  }

  /**
   * Get all settings (grouped by category)
   */
  async getAll(): Promise<Record<string, Record<string, any>>> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const grouped: Record<string, Record<string, any>> = {};

    for (const [key, { value, type }] of this.cache.entries()) {
      const [category, ...rest] = key.split('.');
      const settingName = rest.join('.');

      if (!grouped[category]) {
        grouped[category] = {};
      }

      grouped[category][settingName] = this.convertValue(value, type);
    }

    return grouped;
  }

  /**
   * Get all settings as flat object
   */
  async getAllFlat(): Promise<Record<string, any>> {
    if (!this.cacheLoaded) {
      await this.loadCache();
    }

    const flat: Record<string, any> = {};

    for (const [key, { value, type }] of this.cache.entries()) {
      flat[key] = this.convertValue(value, type);
    }

    return flat;
  }

  /**
   * Delete a setting
   */
  async delete(key: string): Promise<void> {
    await prisma.systemSettings.delete({
      where: { key },
    });
    this.cache.delete(key);
  }

  /**
   * Clear the cache (force reload on next get)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheLoaded = false;
  }

  /**
   * Convert string value to appropriate type
   */
  private convertValue<T>(value: string, type: string): T {
    switch (type) {
      case 'number':
        return parseFloat(value) as unknown as T;
      case 'boolean':
        return (value === 'true') as unknown as T;
      case 'json':
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      default:
        return value as unknown as T;
    }
  }

  /**
   * Infer type from value
   */
  private inferType(value: string | number | boolean): string {
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'object') return 'json';
    return 'string';
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
