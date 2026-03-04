import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';

interface XmltvChannel {
  id: string;
  name: string;
  logo?: string;
}

interface XmltvProgramme {
  start: string;
  stop: string;
  channel: string;
  title: string;
  desc?: string;
}

export class EpgGenerator {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || `${config.server.url}:${config.server.port}`;
  }

  /**
   * Generate full XMLTV EPG
   */
  async generateXmltv(bouquetIds: number[] = []): Promise<string> {
    // Get streams with EPG channel IDs
    const streams = await prisma.stream.findMany({
      where: {
        isActive: true,
        epgChannelId: { not: null },
        ...(bouquetIds.length > 0
          ? { bouquets: { some: { bouquetId: { in: bouquetIds } } } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        epgChannelId: true,
        logoUrl: true,
      },
    });

    // Get EPG entries for these streams
    const streamIds = streams.map((s) => s.id);
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const epgEntries = await prisma.epgEntry.findMany({
      where: {
        streamId: { in: streamIds },
        start: { lte: weekAhead },
        end: { gte: now },
      },
      orderBy: [{ streamId: 'asc' }, { start: 'asc' }],
    });

    // Build XMLTV
    const lines: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
      '<tv generator-info-name="IPTV Server" generator-info-url="' +
        this.baseUrl +
        '">',
    ];

    // Add channels
    for (const stream of streams) {
      lines.push(`  <channel id="${this.escapeXml(stream.epgChannelId!)}">`);
      lines.push(
        `    <display-name>${this.escapeXml(stream.name)}</display-name>`
      );
      if (stream.logoUrl) {
        lines.push(`    <icon src="${this.escapeXml(stream.logoUrl)}" />`);
      }
      lines.push('  </channel>');
    }

    // Create a map for quick lookup
    const streamMap = new Map(streams.map((s) => [s.id, s.epgChannelId]));

    // Add programmes
    for (const entry of epgEntries) {
      const channelId = streamMap.get(entry.streamId);
      if (!channelId) continue;

      const startStr = this.formatXmltvDate(entry.start);
      const stopStr = this.formatXmltvDate(entry.end);

      lines.push(
        `  <programme start="${startStr}" stop="${stopStr}" channel="${this.escapeXml(channelId)}">`
      );
      lines.push(`    <title>${this.escapeXml(entry.title)}</title>`);
      if (entry.description) {
        lines.push(`    <desc>${this.escapeXml(entry.description)}</desc>`);
      }
      lines.push('  </programme>');
    }

    lines.push('</tv>');

    return lines.join('\n');
  }

  /**
   * Format date for XMLTV (YYYYMMDDHHmmss +0000)
   */
  private formatXmltvDate(date: Date): string {
    const pad = (n: number): string => n.toString().padStart(2, '0');

    const year = date.getUTCFullYear();
    const month = pad(date.getUTCMonth() + 1);
    const day = pad(date.getUTCDate());
    const hour = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const sec = pad(date.getUTCSeconds());

    return `${year}${month}${day}${hour}${min}${sec} +0000`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// Export singleton
export const epgGenerator = new EpgGenerator();
