import * as xml2js from 'xml2js';
import axios from 'axios';
import * as zlib from 'zlib';
import AdmZip, { IZipEntry } from 'adm-zip';
import { promisify } from 'util';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';

const gunzip = promisify(zlib.gunzip);

interface EpgProgram {
  start: Date;
  stop: Date;
  channel: string;
  title: string;
  description?: string;
  language?: string;
}

interface XmltvProgramme {
  $: {
    start: string;
    stop: string;
    channel: string;
  };
  title?: Array<{ _: string; $?: { lang?: string } } | string>;
  desc?: Array<{ _: string } | string>;
}

interface XmltvChannel {
  $: { id: string };
  'display-name'?: Array<{ _: string } | string>;
  icon?: Array<{ $: { src: string } }>;
}

interface XmltvData {
  tv: {
    channel?: XmltvChannel[];
    programme?: XmltvProgramme[];
  };
}

interface ImportResult {
  programCount: number;
  channelCount: number;
}

export class EpgImporter {
  /**
   * Import EPG from a URL
   */
  async importFromUrl(url: string): Promise<number> {
    const result = await this.importFromUrlWithStats(url);
    return result.programCount;
  }

  /**
   * Import EPG from a URL and return detailed stats
   */
  async importFromUrlWithStats(url: string): Promise<ImportResult> {
    logger.info({ url }, 'Starting EPG import');

    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000, // 2 minutes for larger zip files
        maxContentLength: 200 * 1024 * 1024, // 200MB max for zip files
      });

      let data: Buffer = response.data;
      let xml: string;

      // Handle ZIP files
      if (
        url.endsWith('.zip') ||
        response.headers['content-type']?.includes('zip') ||
        response.headers['content-type']?.includes('application/x-zip')
      ) {
        xml = await this.extractXmlFromZip(data);
      }
      // Handle gzipped EPG files
      else if (
        url.endsWith('.gz') ||
        response.headers['content-encoding'] === 'gzip' ||
        response.headers['content-type']?.includes('gzip')
      ) {
        data = await gunzip(data);
        xml = data.toString('utf-8');
      }
      // Plain XML
      else {
        xml = data.toString('utf-8');
      }

      const result = await this.parseAndStoreWithStats(xml);

      logger.info({ url, programCount: result.programCount, channelCount: result.channelCount }, 'EPG import completed');
      return result;
    } catch (error) {
      logger.error({ error, url }, 'EPG import failed');
      throw error;
    }
  }

  /**
   * Extract XML content from a ZIP file
   * Looks for .xml files inside the ZIP and returns the first one found
   */
  private async extractXmlFromZip(zipBuffer: Buffer): Promise<string> {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Find XML files in the ZIP
    const xmlEntries = entries.filter((entry: IZipEntry) => {
      const name = entry.entryName.toLowerCase();
      return (name.endsWith('.xml') || name.endsWith('.xmltv')) && !entry.isDirectory;
    });

    if (xmlEntries.length === 0) {
      // Check for gzipped XML inside the ZIP
      const gzEntries = entries.filter((entry: IZipEntry) => {
        const name = entry.entryName.toLowerCase();
        return name.endsWith('.gz') && !entry.isDirectory;
      });

      if (gzEntries.length > 0) {
        logger.info({ file: gzEntries[0].entryName }, 'Found gzipped XML inside ZIP');
        const gzData = gzEntries[0].getData();
        const xmlData = await gunzip(gzData);
        return xmlData.toString('utf-8');
      }

      throw new Error('No XML file found in ZIP archive');
    }

    // Prefer files with 'xmltv' in the name, otherwise use the first XML file
    const preferredEntry = xmlEntries.find((entry: IZipEntry) => 
      entry.entryName.toLowerCase().includes('xmltv')
    ) || xmlEntries[0];

    logger.info({ file: preferredEntry.entryName }, 'Extracting XML from ZIP');
    return preferredEntry.getData().toString('utf-8');
  }

  /**
   * Import EPG from XML string
   */
  async importFromXml(xml: string): Promise<number> {
    return this.parseAndStore(xml);
  }

  /**
   * Import EPG from a Buffer (supports XML, GZ, or ZIP)
   */
  async importFromBuffer(buffer: Buffer, filename?: string): Promise<number> {
    logger.info({ filename }, 'Starting EPG import from buffer');

    let xml: string;
    const lowerFilename = filename?.toLowerCase() || '';

    try {
      // Detect file type by magic bytes or filename
      if (this.isZipBuffer(buffer) || lowerFilename.endsWith('.zip')) {
        xml = await this.extractXmlFromZip(buffer);
      } else if (this.isGzipBuffer(buffer) || lowerFilename.endsWith('.gz')) {
        const decompressed = await gunzip(buffer);
        xml = decompressed.toString('utf-8');
      } else {
        xml = buffer.toString('utf-8');
      }

      const count = await this.parseAndStore(xml);
      logger.info({ filename, count }, 'EPG import from buffer completed');
      return count;
    } catch (error) {
      logger.error({ error, filename }, 'EPG import from buffer failed');
      throw error;
    }
  }

  /**
   * Check if buffer is a ZIP file by magic bytes
   */
  private isZipBuffer(buffer: Buffer): boolean {
    // ZIP magic bytes: PK (0x50 0x4B)
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4B;
  }

  /**
   * Check if buffer is a GZIP file by magic bytes
   */
  private isGzipBuffer(buffer: Buffer): boolean {
    // GZIP magic bytes: 1f 8b
    return buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  }

  /**
   * Parse XMLTV and store in database
   */
  private async parseAndStore(xml: string): Promise<number> {
    const parser = new xml2js.Parser({
      explicitArray: true,
      trim: true,
    });

    const result: XmltvData = await parser.parseStringPromise(xml);

    if (!result.tv) {
      logger.warn('Invalid XMLTV data - no tv element');
      return 0;
    }

    // First, extract and store all channels from the XMLTV
    const channels = result.tv.channel || [];
    const channelInfo = new Map<string, { displayName?: string; iconUrl?: string }>();
    
    for (const channel of channels) {
      const channelId = channel.$.id;
      const displayName = this.extractText(channel['display-name']?.[0]);
      const iconUrl = channel.icon?.[0]?.$?.src;
      channelInfo.set(channelId, { displayName, iconUrl });
    }

    // Parse all programmes
    const programmes = result.tv.programme || [];
    if (programmes.length === 0 && channels.length === 0) {
      logger.warn('No programmes or channels found in EPG data');
      return 0;
    }

    const programs: EpgProgram[] = [];
    const channelProgramCounts = new Map<string, number>();

    for (const programme of programmes) {
      try {
        const title = this.extractText(programme.title?.[0]);
        if (!title) continue;

        const start = this.parseEpgDate(programme.$.start);
        const stop = this.parseEpgDate(programme.$.stop);
        const channelId = programme.$.channel;

        // Skip past programs
        if (stop < new Date()) continue;

        programs.push({
          start,
          stop,
          channel: channelId,
          title,
          description: this.extractText(programme.desc?.[0]),
          language: this.extractLanguage(programme.title?.[0]),
        });

        // Track program counts per channel
        channelProgramCounts.set(channelId, (channelProgramCounts.get(channelId) || 0) + 1);
        
        // Ensure channel is in our map even if not in channel list
        if (!channelInfo.has(channelId)) {
          channelInfo.set(channelId, {});
        }
      } catch (error) {
        logger.debug({ error, programme }, 'Failed to parse programme');
      }
    }

    // Store all EPG channels in database (upsert)
    logger.info({ channelCount: channelInfo.size }, 'Storing EPG channels');
    
    await prisma.$transaction(async (tx) => {
      for (const [channelId, info] of channelInfo) {
        await tx.epgChannel.upsert({
          where: { id: channelId },
          create: {
            id: channelId,
            displayName: info.displayName,
            iconUrl: info.iconUrl,
            programCount: channelProgramCounts.get(channelId) || 0,
          },
          update: {
            displayName: info.displayName,
            iconUrl: info.iconUrl,
            programCount: channelProgramCounts.get(channelId) || 0,
          },
        });
      }
    });

    logger.info({ channelCount: channelInfo.size, programCount: programs.length }, 'EPG channels stored');

    if (programs.length === 0) {
      logger.warn('No valid programmes to import (all in the past)');
      return channelInfo.size; // Return channel count even if no programs
    }

    // Get channel ID to stream ID mapping for streams that have EPG assigned
    const streams = await prisma.stream.findMany({
      where: { epgChannelId: { not: null } },
      select: { id: true, epgChannelId: true },
    });

    const channelMap = new Map<string, number>();
    for (const stream of streams) {
      if (stream.epgChannelId) {
        channelMap.set(stream.epgChannelId.toLowerCase(), stream.id);
      }
    }

    // Filter programs for channels that are assigned to streams
    const validPrograms = programs.filter((p) =>
      channelMap.has(p.channel.toLowerCase())
    );

    if (validPrograms.length === 0) {
      logger.info({ channelCount: channelInfo.size }, 'EPG channels imported, but no streams have matching EPG assignments yet');
      return channelInfo.size;
    }

    // Batch upsert program entries in transaction
    await prisma.$transaction(async (tx) => {
      // Delete old EPG entries for these channels
      const streamIds = Array.from(
        new Set(
          validPrograms.map((p) => channelMap.get(p.channel.toLowerCase())!)
        )
      );

      await tx.epgEntry.deleteMany({
        where: {
          streamId: { in: streamIds },
        },
      });

      // Insert new entries in batches
      const batchSize = 1000;
      for (let i = 0; i < validPrograms.length; i += batchSize) {
        const batch = validPrograms.slice(i, i + batchSize);
        await tx.epgEntry.createMany({
          data: batch.map((p) => ({
            streamId: channelMap.get(p.channel.toLowerCase())!,
            channelId: p.channel,
            start: p.start,
            end: p.stop,
            title: p.title,
            description: p.description,
            language: p.language,
          })),
        });
      }
    });

    logger.info({ programs: validPrograms.length, channels: channelInfo.size }, 'EPG import completed');
    return validPrograms.length;
  }

  /**
   * Parse XMLTV and store in database, returning detailed stats
   */
  private async parseAndStoreWithStats(xml: string): Promise<ImportResult> {
    const parser = new xml2js.Parser({
      explicitArray: true,
      trim: true,
    });

    const result: XmltvData = await parser.parseStringPromise(xml);

    if (!result.tv) {
      logger.warn('Invalid XMLTV data - no tv element');
      return { programCount: 0, channelCount: 0 };
    }

    // First, extract and store all channels from the XMLTV
    const channels = result.tv.channel || [];
    const channelInfo = new Map<string, { displayName?: string; iconUrl?: string }>();
    
    for (const channel of channels) {
      const channelId = channel.$.id;
      const displayName = this.extractText(channel['display-name']?.[0]);
      const iconUrl = channel.icon?.[0]?.$?.src;
      channelInfo.set(channelId, { displayName, iconUrl });
    }

    // Parse all programmes
    const programmes = result.tv.programme || [];
    if (programmes.length === 0 && channels.length === 0) {
      logger.warn('No programmes or channels found in EPG data');
      return { programCount: 0, channelCount: 0 };
    }

    const programs: EpgProgram[] = [];
    const channelProgramCounts = new Map<string, number>();

    for (const programme of programmes) {
      try {
        const title = this.extractText(programme.title?.[0]);
        if (!title) continue;

        const start = this.parseEpgDate(programme.$.start);
        const stop = this.parseEpgDate(programme.$.stop);
        const channelId = programme.$.channel;

        // Skip past programs
        if (stop < new Date()) continue;

        programs.push({
          start,
          stop,
          channel: channelId,
          title,
          description: this.extractText(programme.desc?.[0]),
          language: this.extractLanguage(programme.title?.[0]),
        });

        // Track program counts per channel
        channelProgramCounts.set(channelId, (channelProgramCounts.get(channelId) || 0) + 1);
        
        // Ensure channel is in our map even if not in channel list
        if (!channelInfo.has(channelId)) {
          channelInfo.set(channelId, {});
        }
      } catch (error) {
        logger.debug({ error, programme }, 'Failed to parse programme');
      }
    }

    // Store all EPG channels in database (upsert)
    logger.info({ channelCount: channelInfo.size }, 'Storing EPG channels');
    
    await prisma.$transaction(async (tx) => {
      for (const [channelId, info] of channelInfo) {
        await tx.epgChannel.upsert({
          where: { id: channelId },
          create: {
            id: channelId,
            displayName: info.displayName,
            iconUrl: info.iconUrl,
            programCount: channelProgramCounts.get(channelId) || 0,
          },
          update: {
            displayName: info.displayName,
            iconUrl: info.iconUrl,
            programCount: channelProgramCounts.get(channelId) || 0,
          },
        });
      }
    });

    logger.info({ channelCount: channelInfo.size, programCount: programs.length }, 'EPG channels stored');

    if (programs.length === 0) {
      logger.warn('No valid programmes to import (all in the past)');
      return { programCount: 0, channelCount: channelInfo.size };
    }

    // Get channel ID to stream ID mapping for streams that have EPG assigned
    const streams = await prisma.stream.findMany({
      where: { epgChannelId: { not: null } },
      select: { id: true, epgChannelId: true },
    });

    const channelMap = new Map<string, number>();
    for (const stream of streams) {
      if (stream.epgChannelId) {
        channelMap.set(stream.epgChannelId.toLowerCase(), stream.id);
      }
    }

    // Filter programs for channels that are assigned to streams
    const validPrograms = programs.filter((p) =>
      channelMap.has(p.channel.toLowerCase())
    );

    if (validPrograms.length === 0) {
      logger.info({ channelCount: channelInfo.size }, 'EPG channels imported, but no streams have matching EPG assignments yet');
      return { programCount: 0, channelCount: channelInfo.size };
    }

    // Batch upsert program entries in transaction
    await prisma.$transaction(async (tx) => {
      // Delete old EPG entries for these channels
      const streamIds = Array.from(
        new Set(
          validPrograms.map((p) => channelMap.get(p.channel.toLowerCase())!)
        )
      );

      await tx.epgEntry.deleteMany({
        where: {
          streamId: { in: streamIds },
        },
      });

      // Insert new entries in batches
      const batchSize = 1000;
      for (let i = 0; i < validPrograms.length; i += batchSize) {
        const batch = validPrograms.slice(i, i + batchSize);
        await tx.epgEntry.createMany({
          data: batch.map((p) => ({
            streamId: channelMap.get(p.channel.toLowerCase())!,
            channelId: p.channel,
            start: p.start,
            end: p.stop,
            title: p.title,
            description: p.description,
            language: p.language,
          })),
        });
      }
    });

    logger.info({ programs: validPrograms.length, channels: channelInfo.size }, 'EPG import completed');
    return { programCount: validPrograms.length, channelCount: channelInfo.size };
  }

  /**
   * Parse EPG date string (YYYYMMDDHHmmss +0000)
   */
  private parseEpgDate(dateStr: string): Date {
    const match = dateStr.match(
      /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/
    );

    if (!match) {
      throw new Error(`Invalid EPG date: ${dateStr}`);
    }

    const [, year, month, day, hour, min, sec, tz] = match;
    const tzStr = tz ? tz.slice(0, 3) + ':' + tz.slice(3) : '+00:00';

    return new Date(
      `${year}-${month}-${day}T${hour}:${min}:${sec}${tzStr}`
    );
  }

  /**
   * Extract text from XMLTV element
   */
  private extractText(
    element: { _: string } | string | undefined
  ): string | undefined {
    if (!element) return undefined;
    if (typeof element === 'string') return element;
    return element._;
  }

  /**
   * Extract language from XMLTV element
   */
  private extractLanguage(
    element: { _: string; $?: { lang?: string } } | string | undefined
  ): string | undefined {
    if (!element) return undefined;
    if (typeof element === 'string') return undefined;
    return element.$?.lang;
  }

  /**
   * Delete old EPG entries
   */
  async cleanupOldEntries(): Promise<number> {
    const result = await prisma.epgEntry.deleteMany({
      where: {
        end: { lt: new Date() },
      },
    });

    logger.info({ deleted: result.count }, 'Cleaned up old EPG entries');
    return result.count;
  }

  /**
   * Import EPG data for a specific channel and stream
   * This is called after assigning an EPG channel to a stream
   */
  async importForChannel(streamId: number, epgChannelId: string): Promise<number> {
    logger.info({ streamId, epgChannelId }, 'Starting EPG import for specific channel');

    // Get all active EPG sources
    const sources = await prisma.epgSource.findMany({
      where: { isActive: true },
    });

    if (sources.length === 0) {
      logger.warn('No active EPG sources found');
      return 0;
    }

    let totalImported = 0;

    for (const source of sources) {
      try {
        const response = await axios.get(source.url, {
          responseType: 'arraybuffer',
          timeout: 120000,
          maxContentLength: 200 * 1024 * 1024,
        });

        let data: Buffer = response.data;
        let xml: string;

        // Handle ZIP files
        if (
          source.url.endsWith('.zip') ||
          response.headers['content-type']?.includes('zip') ||
          response.headers['content-type']?.includes('application/x-zip')
        ) {
          xml = await this.extractXmlFromZip(data);
        }
        // Handle gzipped EPG files
        else if (
          source.url.endsWith('.gz') ||
          response.headers['content-encoding'] === 'gzip' ||
          response.headers['content-type']?.includes('gzip')
        ) {
          data = await gunzip(data);
          xml = data.toString('utf-8');
        }
        // Plain XML
        else {
          xml = data.toString('utf-8');
        }

        // Parse XMLTV
        const parser = new xml2js.Parser({
          explicitArray: true,
          trim: true,
        });

        const result: XmltvData = await parser.parseStringPromise(xml);

        if (!result.tv || !result.tv.programme) {
          continue;
        }

        // Filter programs for this specific channel
        const programmes = result.tv.programme.filter(
          (p) => p.$.channel === epgChannelId
        );

        if (programmes.length === 0) {
          logger.debug({ sourceId: source.id, epgChannelId }, 'No programs found for channel in this source');
          continue;
        }

        const programs: EpgProgram[] = [];

        for (const programme of programmes) {
          try {
            const title = this.extractText(programme.title?.[0]);
            if (!title) continue;

            const start = this.parseEpgDate(programme.$.start);
            const stop = this.parseEpgDate(programme.$.stop);

            // Skip past programs
            if (stop < new Date()) continue;

            programs.push({
              start,
              stop,
              channel: epgChannelId,
              title,
              description: this.extractText(programme.desc?.[0]),
              language: this.extractLanguage(programme.title?.[0]),
            });
          } catch (error) {
            logger.debug({ error, programme }, 'Failed to parse programme');
          }
        }

        if (programs.length > 0) {
          // Delete old entries for this stream
          await prisma.epgEntry.deleteMany({
            where: { streamId },
          });

          // Insert new entries in batches
          const batchSize = 1000;
          for (let i = 0; i < programs.length; i += batchSize) {
            const batch = programs.slice(i, i + batchSize);
            await prisma.epgEntry.createMany({
              data: batch.map((p) => ({
                streamId,
                channelId: epgChannelId,
                start: p.start,
                end: p.stop,
                title: p.title,
                description: p.description,
                language: p.language,
              })),
            });
          }

          totalImported += programs.length;
          logger.info({ sourceId: source.id, streamId, programs: programs.length }, 'Imported EPG data for channel');
        }
      } catch (error) {
        logger.error({ error, sourceId: source.id }, 'Failed to import EPG for channel from source');
      }
    }

    logger.info({ streamId, epgChannelId, totalImported }, 'Completed EPG import for channel');
    return totalImported;
  }
}

// Export singleton
export const epgImporter = new EpgImporter();
