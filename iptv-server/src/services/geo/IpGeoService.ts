/**
 * IP Geolocation Service
 * 
 * Provides country code detection from IP addresses using MaxMind GeoLite2 database.
 * Falls back to external API if database is not available.
 */

import { logger } from '../../config/logger.js';
import { redis } from '../../config/redis.js';
import maxmind, { CityResponse, CountryResponse, Reader } from 'maxmind';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache TTL for IP lookups (24 hours)
const GEO_CACHE_TTL = 86400;

// Path to GeoLite2 database files
const GEOLITE2_COUNTRY_PATH = process.env.GEOLITE2_COUNTRY_PATH || '/opt/iptv-server/data/GeoLite2-Country.mmdb';
const GEOLITE2_CITY_PATH = process.env.GEOLITE2_CITY_PATH || '/opt/iptv-server/data/GeoLite2-City.mmdb';

export interface GeoLookupResult {
  countryCode: string | null;
  countryName?: string;
  city?: string;
  continent?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  cached: boolean;
}

class IpGeoService {
  private countryReader: Reader<CountryResponse> | null = null;
  private cityReader: Reader<CityResponse> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  
  /**
   * Initialize the MaxMind database readers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this._doInitialize();
    return this.initPromise;
  }
  
  private async _doInitialize(): Promise<void> {
    try {
      // Try to load country database
      if (fs.existsSync(GEOLITE2_COUNTRY_PATH)) {
        this.countryReader = await maxmind.open<CountryResponse>(GEOLITE2_COUNTRY_PATH);
        logger.info({ path: GEOLITE2_COUNTRY_PATH }, 'GeoLite2 Country database loaded');
      } else {
        logger.warn({ path: GEOLITE2_COUNTRY_PATH }, 'GeoLite2 Country database not found');
      }
      
      // Try to load city database (optional, provides more details)
      if (fs.existsSync(GEOLITE2_CITY_PATH)) {
        this.cityReader = await maxmind.open<CityResponse>(GEOLITE2_CITY_PATH);
        logger.info({ path: GEOLITE2_CITY_PATH }, 'GeoLite2 City database loaded');
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize GeoLite2 databases');
      this.initialized = true; // Mark as initialized to prevent retries
    }
  }
  
  /**
   * Check if IP is a private/local address
   */
  private isPrivateIp(ip: string): boolean {
    if (!ip) return true;
    return (
      ip === '127.0.0.1' ||
      ip === '::1' ||
      ip.startsWith('192.168.') ||
      ip.startsWith('10.') ||
      ip.startsWith('172.16.') ||
      ip.startsWith('172.17.') ||
      ip.startsWith('172.18.') ||
      ip.startsWith('172.19.') ||
      ip.startsWith('172.20.') ||
      ip.startsWith('172.21.') ||
      ip.startsWith('172.22.') ||
      ip.startsWith('172.23.') ||
      ip.startsWith('172.24.') ||
      ip.startsWith('172.25.') ||
      ip.startsWith('172.26.') ||
      ip.startsWith('172.27.') ||
      ip.startsWith('172.28.') ||
      ip.startsWith('172.29.') ||
      ip.startsWith('172.30.') ||
      ip.startsWith('172.31.') ||
      ip.startsWith('fd') || // IPv6 private
      ip.startsWith('fe80') // IPv6 link-local
    );
  }
  
  /**
   * Get country code from IP address using MaxMind GeoLite2
   */
  async getCountryCode(ip: string): Promise<string | null> {
    if (this.isPrivateIp(ip)) {
      return 'LOCAL';
    }
    
    try {
      // Check Redis cache first
      const cacheKey = `geo:ip:${ip}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return cached;
      }
      
      // Ensure database is initialized
      await this.initialize();
      
      let countryCode: string | null = null;
      
      // Try MaxMind lookup
      if (this.countryReader) {
        const result = this.countryReader.get(ip);
        countryCode = result?.country?.iso_code || null;
      } else if (this.cityReader) {
        const result = this.cityReader.get(ip);
        countryCode = result?.country?.iso_code || null;
      }
      
      if (countryCode) {
        // Cache the result
        await redis.setex(cacheKey, GEO_CACHE_TTL, countryCode);
      }
      
      return countryCode;
    } catch (error) {
      logger.debug({ error, ip }, 'IP geolocation lookup failed');
      return null;
    }
  }
  
  /**
   * Get detailed geo information from IP using MaxMind GeoLite2
   */
  async getGeoInfo(ip: string): Promise<GeoLookupResult> {
    if (this.isPrivateIp(ip)) {
      return { countryCode: 'LOCAL', countryName: 'Local Network', cached: true };
    }
    
    try {
      // Check Redis cache first
      const cacheKey = `geo:full:${ip}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return { ...JSON.parse(cached), cached: true };
      }
      
      // Ensure database is initialized
      await this.initialize();
      
      let result: GeoLookupResult = { countryCode: null, cached: false };
      
      // Try city database first (more detailed)
      if (this.cityReader) {
        const cityResult = this.cityReader.get(ip);
        if (cityResult) {
          result = {
            countryCode: cityResult.country?.iso_code || null,
            countryName: cityResult.country?.names?.en,
            city: cityResult.city?.names?.en,
            continent: cityResult.continent?.names?.en,
            timezone: cityResult.location?.time_zone,
            latitude: cityResult.location?.latitude,
            longitude: cityResult.location?.longitude,
            cached: false,
          };
        }
      } else if (this.countryReader) {
        const countryResult = this.countryReader.get(ip);
        if (countryResult) {
          result = {
            countryCode: countryResult.country?.iso_code || null,
            countryName: countryResult.country?.names?.en,
            continent: countryResult.continent?.names?.en,
            cached: false,
          };
        }
      }
      
      if (result.countryCode) {
        // Cache the result (without the cached flag)
        const { cached: _, ...toCache } = result;
        await redis.setex(cacheKey, GEO_CACHE_TTL, JSON.stringify(toCache));
      }
      
      return result;
    } catch (error) {
      logger.debug({ error, ip }, 'Full IP geolocation lookup failed');
      return { countryCode: null, cached: false };
    }
  }
  
  /**
   * Batch lookup country codes for multiple IPs
   */
  async batchLookup(ips: string[]): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();
    
    // Ensure database is initialized
    await this.initialize();
    
    for (const ip of ips) {
      if (this.isPrivateIp(ip)) {
        results.set(ip, 'LOCAL');
        continue;
      }
      
      // Check cache first
      const cacheKey = `geo:ip:${ip}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        results.set(ip, cached);
        continue;
      }
      
      // Lookup from database
      let countryCode: string | null = null;
      
      if (this.countryReader) {
        const result = this.countryReader.get(ip);
        countryCode = result?.country?.iso_code || null;
      } else if (this.cityReader) {
        const result = this.cityReader.get(ip);
        countryCode = result?.country?.iso_code || null;
      }
      
      results.set(ip, countryCode);
      
      if (countryCode) {
        await redis.setex(cacheKey, GEO_CACHE_TTL, countryCode);
      }
    }
    
    return results;
  }
  
  /**
   * Check if the GeoLite2 database is available
   */
  isAvailable(): boolean {
    return this.countryReader !== null || this.cityReader !== null;
  }
  
  /**
   * Get database info
   */
  getDatabaseInfo(): { country: boolean; city: boolean; paths: { country: string; city: string } } {
    return {
      country: this.countryReader !== null,
      city: this.cityReader !== null,
      paths: {
        country: GEOLITE2_COUNTRY_PATH,
        city: GEOLITE2_CITY_PATH,
      },
    };
  }
}

export const ipGeoService = new IpGeoService();
