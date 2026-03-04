import axios from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { 
  ExternalSource, 
  ExternalSyncStatus, 
  StreamType,
  Prisma 
} from '@prisma/client';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { M3UParser, M3UEntry, M3UPlaylistInfo } from './M3UParser.js';
import { epgImporter } from '../epg/EpgImporter.js';

const gunzip = promisify(zlib.gunzip);

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  totalChannels: number;
  importedChannels: number;
  updatedChannels: number;
  failedChannels: number;
  newCategories: number;
  errors: string[];
  duration: number;
}

/**
 * Preview result without importing
 */
export interface PreviewResult {
  success: boolean;
  error?: string;
  playlist?: M3UPlaylistInfo;
  stats?: {
    totalEntries: number;
    categories: number;
    withEpgId: number;
    withLogo: number;
    withCatchup: number;
    byType: Record<string, number>;
  };
  epgUrl?: string;
  sampleEntries?: M3UEntry[];
}

/**
 * Options for sync operation
 */
export interface SyncOptions {
  createCategories?: boolean;
  updateExisting?: boolean;
  categoryPrefix?: string;
  defaultStreamType?: StreamType;
  defaultBouquetId?: number;
  dryRun?: boolean;
}

/**
 * External M3U Source Sync Service
 * 
 * Handles fetching, parsing, and importing M3U playlists from external sources.
 * Tracks which streams came from which external source for updates and cleanup.
 */
export class ExternalSourceSyncService {
  private parser: M3UParser;

  constructor() {
    this.parser = new M3UParser({
      detectRadio: true,
      normalizeNames: true,
      skipInvalid: true,
    });
  }

  /**
   * Fetch M3U content from URL
   */
  async fetchM3U(url: string): Promise<string> {
    logger.info({ url }, 'Fetching M3U playlist');

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000, // 1 minute timeout
      maxContentLength: 50 * 1024 * 1024, // 50MB max
      headers: {
        'User-Agent': 'IPTV-Server/1.0',
        'Accept': '*/*',
      },
    });

    let data: Buffer = response.data;

    // Handle gzipped content
    if (
      url.endsWith('.gz') ||
      response.headers['content-encoding'] === 'gzip' ||
      response.headers['content-type']?.includes('gzip')
    ) {
      data = await gunzip(data);
    }

    return data.toString('utf-8');
  }

  /**
   * Preview an M3U URL without importing
   */
  async preview(url: string): Promise<PreviewResult> {
    try {
      const content = await this.fetchM3U(url);
      const playlist = this.parser.parse(content);
      const stats = this.parser.getStats(playlist);

      // Get sample entries (first 10)
      const sampleEntries = playlist.entries.slice(0, 10);

      return {
        success: true,
        playlist,
        stats,
        epgUrl: playlist.urlTvg || playlist.tvgUrl,
        sampleEntries,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, url }, 'Failed to preview M3U');
      return {
        success: false,
        error: message,
      };
    }
  }

  /**
   * Sync an external source
   */
  async sync(sourceId: number, options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let importedChannels = 0;
    let updatedChannels = 0;
    let failedChannels = 0;
    let newCategories = 0;

    // Get the external source
    const source = await prisma.externalSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error(`External source not found: ${sourceId}`);
    }

    // Update sync status to SYNCING
    await prisma.externalSource.update({
      where: { id: sourceId },
      data: {
        syncStatus: ExternalSyncStatus.SYNCING,
        lastSyncError: null,
      },
    });

    try {
      logger.info({ sourceId, name: source.name, url: source.m3uUrl }, 'Starting external source sync');

      // Fetch and parse M3U
      const content = await this.fetchM3U(source.m3uUrl);
      const playlist = this.parser.parse(content);

      const totalChannels = playlist.entries.length;
      logger.info({ sourceId, totalChannels }, 'Parsed M3U playlist');

      // Merge options with source settings
      const syncOptions: SyncOptions = {
        createCategories: options?.createCategories ?? source.createCategories,
        updateExisting: options?.updateExisting ?? source.updateExisting,
        categoryPrefix: options?.categoryPrefix ?? source.categoryPrefix ?? undefined,
        defaultStreamType: options?.defaultStreamType ?? source.defaultStreamType,
        defaultBouquetId: options?.defaultBouquetId ?? source.defaultBouquetId ?? undefined,
        dryRun: options?.dryRun ?? false,
      };

      if (syncOptions.dryRun) {
        logger.info({ sourceId }, 'Dry run mode - no changes will be made');
        return {
          success: true,
          totalChannels,
          importedChannels: 0,
          updatedChannels: 0,
          failedChannels: 0,
          newCategories: 0,
          errors: [],
          duration: Date.now() - startTime,
        };
      }

      // Get existing stream mappings for this source
      const existingMappings = await prisma.externalSourceStream.findMany({
        where: { externalSourceId: sourceId },
        include: { stream: true },
      });

      const existingByExternalId = new Map(
        existingMappings
          .filter(m => m.externalId)
          .map(m => [m.externalId!, m])
      );
      const existingByName = new Map(
        existingMappings.map(m => [m.externalName.toLowerCase(), m])
      );

      // Group entries by category
      const groupedEntries = this.parser.groupByCategory(playlist.entries);

      // Create/get categories
      const categoryMap = new Map<string, number>();

      if (syncOptions.createCategories) {
        for (const groupName of groupedEntries.keys()) {
          try {
            const categoryName = syncOptions.categoryPrefix 
              ? `${syncOptions.categoryPrefix}${groupName}`
              : groupName;

            // Find or create category
            let category = await prisma.category.findFirst({
              where: { 
                name: categoryName,
                type: syncOptions.defaultStreamType || StreamType.LIVE,
              },
            });

            if (!category) {
              category = await prisma.category.create({
                data: {
                  name: categoryName,
                  type: syncOptions.defaultStreamType || StreamType.LIVE,
                  isActive: true,
                },
              });
              newCategories++;
              logger.debug({ categoryName, categoryId: category.id }, 'Created new category');
            }

            categoryMap.set(groupName, category.id);
          } catch (error) {
            const msg = `Failed to create category: ${groupName}`;
            errors.push(msg);
            logger.error({ error, groupName }, msg);
          }
        }
      }

      // Process each entry
      for (const entry of playlist.entries) {
        try {
          // Determine stream type
          const streamType = this.parser.suggestStreamType(entry);

          // Check if we already have this stream
          let existingMapping = entry.tvgId 
            ? existingByExternalId.get(entry.tvgId)
            : existingByName.get(entry.name.toLowerCase());

          const categoryId = entry.groupTitle 
            ? categoryMap.get(entry.groupTitle) 
            : undefined;

          if (existingMapping && syncOptions.updateExisting) {
            // Update existing stream
            await prisma.stream.update({
              where: { id: existingMapping.streamId },
              data: {
                name: entry.name,
                sourceUrl: entry.url,
                logoUrl: entry.tvgLogo || undefined,
                epgChannelId: entry.tvgId || undefined,
                categoryId: categoryId,
                tvArchive: !!entry.catchup,
                tvArchiveDuration: entry.catchupDays || 0,
                isActive: true,
              },
            });

            // Update the mapping
            await prisma.externalSourceStream.update({
              where: { id: existingMapping.id },
              data: {
                externalId: entry.tvgId,
                externalName: entry.name,
                groupTitle: entry.groupTitle,
                lastSynced: new Date(),
              },
            });

            updatedChannels++;
          } else if (!existingMapping) {
            // Create new stream
            const stream = await prisma.stream.create({
              data: {
                name: entry.name,
                streamType,
                sourceUrl: entry.url,
                logoUrl: entry.tvgLogo || undefined,
                epgChannelId: entry.tvgId || undefined,
                categoryId: categoryId,
                tvArchive: !!entry.catchup,
                tvArchiveDuration: entry.catchupDays || 0,
                isActive: true,
              },
            });

            // Create mapping
            await prisma.externalSourceStream.create({
              data: {
                externalSourceId: sourceId,
                streamId: stream.id,
                externalId: entry.tvgId,
                externalName: entry.name,
                groupTitle: entry.groupTitle,
              },
            });

            // Add to bouquet if specified
            if (syncOptions.defaultBouquetId) {
              await prisma.bouquetStream.create({
                data: {
                  bouquetId: syncOptions.defaultBouquetId,
                  streamId: stream.id,
                },
              }).catch(() => {
                // Ignore if already exists
              });
            }

            importedChannels++;
          }
        } catch (error) {
          failedChannels++;
          const msg = `Failed to import: ${entry.name}`;
          if (errors.length < 100) { // Limit error messages
            errors.push(msg);
          }
          logger.debug({ error, entry: entry.name }, msg);
        }
      }

      // Update source statistics
      await prisma.externalSource.update({
        where: { id: sourceId },
        data: {
          syncStatus: failedChannels === totalChannels 
            ? ExternalSyncStatus.FAILED 
            : failedChannels > 0 
              ? ExternalSyncStatus.PARTIAL 
              : ExternalSyncStatus.SUCCESS,
          lastSync: new Date(),
          lastSyncError: errors.length > 0 ? errors.slice(0, 10).join('; ') : null,
          totalChannels,
          importedChannels: importedChannels + updatedChannels,
          failedChannels,
        },
      });

      // Trigger EPG import if source has EPG URL
      const epgUrl = source.epgUrl || playlist.urlTvg || playlist.tvgUrl;
      if (epgUrl) {
        logger.info({ sourceId, epgUrl }, 'Triggering EPG import for external source');
        // Do this async to not block the response
        this.importEpgAsync(epgUrl, source.name);
      }

      const duration = Date.now() - startTime;
      logger.info({
        sourceId,
        totalChannels,
        importedChannels,
        updatedChannels,
        failedChannels,
        newCategories,
        duration,
      }, 'External source sync completed');

      return {
        success: true,
        totalChannels,
        importedChannels,
        updatedChannels,
        failedChannels,
        newCategories,
        errors,
        duration,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, sourceId }, 'External source sync failed');

      await prisma.externalSource.update({
        where: { id: sourceId },
        data: {
          syncStatus: ExternalSyncStatus.FAILED,
          lastSync: new Date(),
          lastSyncError: message,
        },
      });

      return {
        success: false,
        totalChannels: 0,
        importedChannels,
        updatedChannels,
        failedChannels,
        newCategories,
        errors: [message, ...errors],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Import EPG asynchronously
   */
  private async importEpgAsync(epgUrl: string, sourceName: string): Promise<void> {
    try {
      // Check if we already have this EPG source
      let epgSource = await prisma.epgSource.findFirst({
        where: { url: epgUrl },
      });

      if (!epgSource) {
        // Create new EPG source
        epgSource = await prisma.epgSource.create({
          data: {
            name: `EPG - ${sourceName}`,
            url: epgUrl,
            isActive: true,
            updateInterval: 12, // 12 hours
          },
        });
      }

      // Import EPG data
      await epgImporter.importFromUrl(epgUrl);

      // Update EPG source
      await prisma.epgSource.update({
        where: { id: epgSource.id },
        data: {
          lastImport: new Date(),
          lastError: null,
          status: 'active',
        },
      });

    } catch (error) {
      logger.error({ error, epgUrl }, 'Failed to import EPG for external source');
    }
  }

  /**
   * Remove streams that are no longer in the external source
   */
  async cleanupRemovedStreams(sourceId: number): Promise<number> {
    // Get current M3U
    const source = await prisma.externalSource.findUnique({
      where: { id: sourceId },
    });

    if (!source) {
      throw new Error(`External source not found: ${sourceId}`);
    }

    const content = await this.fetchM3U(source.m3uUrl);
    const playlist = this.parser.parse(content);

    // Get all external IDs and names from current playlist
    const currentIds = new Set(
      playlist.entries
        .filter(e => e.tvgId)
        .map(e => e.tvgId!)
    );
    const currentNames = new Set(
      playlist.entries.map(e => e.name.toLowerCase())
    );

    // Find streams that are no longer in the playlist
    const mappings = await prisma.externalSourceStream.findMany({
      where: { externalSourceId: sourceId },
    });

    const toRemove: number[] = [];

    for (const mapping of mappings) {
      const inPlaylist = mapping.externalId 
        ? currentIds.has(mapping.externalId)
        : currentNames.has(mapping.externalName.toLowerCase());

      if (!inPlaylist) {
        toRemove.push(mapping.id);
      }
    }

    if (toRemove.length > 0) {
      // Get stream IDs to remove
      const mappingsToRemove = await prisma.externalSourceStream.findMany({
        where: { id: { in: toRemove } },
        select: { streamId: true },
      });

      const streamIds = mappingsToRemove.map(m => m.streamId);

      // Remove mappings
      await prisma.externalSourceStream.deleteMany({
        where: { id: { in: toRemove } },
      });

      // Optionally disable streams (don't delete to preserve history)
      await prisma.stream.updateMany({
        where: { id: { in: streamIds } },
        data: { isActive: false },
      });

      logger.info({ sourceId, removedCount: toRemove.length }, 'Cleaned up removed streams');
    }

    return toRemove.length;
  }

  /**
   * Get sync status for all sources
   */
  async getAllSourcesStatus(): Promise<{
    id: number;
    name: string;
    syncStatus: ExternalSyncStatus;
    lastSync: Date | null;
    totalChannels: number;
    importedChannels: number;
    failedChannels: number;
  }[]> {
    const sources = await prisma.externalSource.findMany({
      select: {
        id: true,
        name: true,
        syncStatus: true,
        lastSync: true,
        totalChannels: true,
        importedChannels: true,
        failedChannels: true,
      },
      orderBy: { name: 'asc' },
    });

    return sources;
  }

  /**
   * Sync all active sources with auto-sync enabled
   */
  async syncAllAutoSources(): Promise<{ sourceId: number; result: SyncResult }[]> {
    const sources = await prisma.externalSource.findMany({
      where: {
        isActive: true,
        autoSync: true,
      },
    });

    const results: { sourceId: number; result: SyncResult }[] = [];

    for (const source of sources) {
      // Check if sync is due
      if (source.lastSync) {
        const hoursSinceLastSync = (Date.now() - source.lastSync.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSync < source.syncIntervalHours) {
          continue; // Skip, not due yet
        }
      }

      try {
        const result = await this.sync(source.id);
        results.push({ sourceId: source.id, result });
      } catch (error) {
        logger.error({ error, sourceId: source.id }, 'Failed to auto-sync source');
        results.push({
          sourceId: source.id,
          result: {
            success: false,
            totalChannels: 0,
            importedChannels: 0,
            updatedChannels: 0,
            failedChannels: 0,
            newCategories: 0,
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            duration: 0,
          },
        });
      }
    }

    return results;
  }

  /**
   * Create pre-configured French IPTV source
   */
  async createFrenchSource(): Promise<ExternalSource> {
    const existing = await prisma.externalSource.findFirst({
      where: { 
        m3uUrl: 'https://iptv-org.github.io/iptv/languages/fra.m3u',
      },
    });

    if (existing) {
      return existing;
    }

    return prisma.externalSource.create({
      data: {
        name: 'French TV (iptv-org)',
        description: 'Free French-language TV channels from iptv-org project',
        m3uUrl: 'https://iptv-org.github.io/iptv/languages/fra.m3u',
        epgUrl: 'http://epgshare01.online/epgshare01/epg_ripper_FR1.xml.gz',
        isActive: true,
        autoSync: false,
        syncIntervalHours: 24,
        defaultStreamType: StreamType.LIVE,
        createCategories: true,
        updateExisting: true,
        categoryPrefix: 'FR: ',
        sourceCountry: 'FR',
        sourceLanguage: 'fra',
        tags: ['french', 'free', 'iptv-org'],
      },
    });
  }
}

// Export singleton
export const externalSourceSync = new ExternalSourceSyncService();
