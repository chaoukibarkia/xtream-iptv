import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';
import { StreamType } from '@prisma/client';

interface M3UOptions {
  type: 'm3u' | 'm3u_plus';
  output: 'ts' | 'm3u8';
}

interface UserData {
  id: number;
  username: string;
  password: string;
  bouquets: { bouquet: { id: number } }[];
}

export class M3UGenerator {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    // Use SERVER_URL directly without port - it should contain the public-facing URL
    this.baseUrl = baseUrl || config.server.url;
  }

  /**
   * Generate full M3U playlist for a user
   */
  async generateFull(
    user: UserData,
    options: Partial<M3UOptions> = {}
  ): Promise<string> {
    const { type = 'm3u_plus', output = 'ts' } = options;
    const bouquetIds = user.bouquets.map((b) => b.bouquet.id);

    // Get all categories
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Get all streams user has access to
    const streams = await prisma.stream.findMany({
      where: {
        isActive: true,
        bouquets: bouquetIds.length > 0
          ? { some: { bouquetId: { in: bouquetIds } } }
          : undefined,
      },
      orderBy: [{ streamType: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Get all series
    const series = await prisma.series.findMany({
      include: {
        episodes: {
          orderBy: [{ seasonNumber: 'asc' }, { episodeNumber: 'asc' }],
        },
      },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const lines: string[] = ['#EXTM3U'];

    // Live streams
    const liveStreams = streams.filter((s) => s.streamType === StreamType.LIVE);
    for (const stream of liveStreams) {
      const categoryName = categoryMap.get(stream.categoryId ?? 0) || 'Uncategorized';
      const streamUrl = this.buildStreamUrl('live', stream.id, user, output);

      if (type === 'm3u_plus') {
        lines.push(
          `#EXTINF:-1 tvg-id="${stream.epgChannelId || ''}" ` +
          `tvg-name="${this.escapeAttribute(stream.name)}" ` +
          `tvg-logo="${stream.logoUrl || ''}" ` +
          `group-title="${this.escapeAttribute(categoryName)}",${stream.name}`
        );
      } else {
        lines.push(`#EXTINF:-1,${stream.name}`);
      }
      lines.push(streamUrl);
    }

    // VOD streams
    const vodStreams = streams.filter((s) => s.streamType === StreamType.VOD);
    for (const stream of vodStreams) {
      const categoryName = categoryMap.get(stream.categoryId ?? 0) || 'Movies';
      const streamUrl = this.buildStreamUrl('movie', stream.id, user, stream.containerExtension || 'mp4');

      if (type === 'm3u_plus') {
        lines.push(
          `#EXTINF:-1 tvg-id="" ` +
          `tvg-name="${this.escapeAttribute(stream.name)}" ` +
          `tvg-logo="${stream.logoUrl || ''}" ` +
          `group-title="${this.escapeAttribute(categoryName)}",${stream.name}`
        );
      } else {
        lines.push(`#EXTINF:-1,${stream.name}`);
      }
      lines.push(streamUrl);
    }

    // Series episodes
    for (const s of series) {
      const categoryName = categoryMap.get(s.categoryId ?? 0) || 'Series';
      
      for (const episode of s.episodes) {
        const episodeName = `${s.name} S${episode.seasonNumber.toString().padStart(2, '0')}E${episode.episodeNumber.toString().padStart(2, '0')}`;
        const streamUrl = this.buildStreamUrl('series', episode.id, user, episode.containerExtension || 'mp4');

        if (type === 'm3u_plus') {
          lines.push(
            `#EXTINF:-1 tvg-id="" ` +
            `tvg-name="${this.escapeAttribute(episodeName)}" ` +
            `tvg-logo="${s.cover || ''}" ` +
            `group-title="${this.escapeAttribute(categoryName)} - ${this.escapeAttribute(s.name)}",${episodeName}`
          );
        } else {
          lines.push(`#EXTINF:-1,${episodeName}`);
        }
        lines.push(streamUrl);
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate live TV only playlist
   */
  async generateLive(
    user: UserData,
    options: Partial<M3UOptions> = {}
  ): Promise<string> {
    const { type = 'm3u_plus', output = 'ts' } = options;
    const bouquetIds = user.bouquets.map((b) => b.bouquet.id);

    const categories = await prisma.category.findMany({
      where: { type: StreamType.LIVE, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const streams = await prisma.stream.findMany({
      where: {
        streamType: StreamType.LIVE,
        isActive: true,
        bouquets: bouquetIds.length > 0
          ? { some: { bouquetId: { in: bouquetIds } } }
          : undefined,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const lines: string[] = ['#EXTM3U'];

    for (const stream of streams) {
      const categoryName = categoryMap.get(stream.categoryId ?? 0) || 'Uncategorized';
      const streamUrl = this.buildStreamUrl('live', stream.id, user, output);

      if (type === 'm3u_plus') {
        lines.push(
          `#EXTINF:-1 tvg-id="${stream.epgChannelId || ''}" ` +
          `tvg-name="${this.escapeAttribute(stream.name)}" ` +
          `tvg-logo="${stream.logoUrl || ''}" ` +
          `group-title="${this.escapeAttribute(categoryName)}"` +
          `${stream.tvArchive ? ' catchup="default" catchup-days="' + stream.tvArchiveDuration + '"' : ''},${stream.name}`
        );
      } else {
        lines.push(`#EXTINF:-1,${stream.name}`);
      }
      lines.push(streamUrl);
    }

    return lines.join('\n');
  }

  /**
   * Generate VOD only playlist
   */
  async generateVod(
    user: UserData,
    options: Partial<M3UOptions> = {}
  ): Promise<string> {
    const { type = 'm3u_plus' } = options;
    const bouquetIds = user.bouquets.map((b) => b.bouquet.id);

    const categories = await prisma.category.findMany({
      where: { type: StreamType.VOD, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const streams = await prisma.stream.findMany({
      where: {
        streamType: StreamType.VOD,
        isActive: true,
        bouquets: bouquetIds.length > 0
          ? { some: { bouquetId: { in: bouquetIds } } }
          : undefined,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));
    const lines: string[] = ['#EXTM3U'];

    for (const stream of streams) {
      const categoryName = categoryMap.get(stream.categoryId ?? 0) || 'Movies';
      const streamUrl = this.buildStreamUrl('movie', stream.id, user, stream.containerExtension || 'mp4');

      if (type === 'm3u_plus') {
        lines.push(
          `#EXTINF:-1 tvg-id="" ` +
          `tvg-name="${this.escapeAttribute(stream.name)}" ` +
          `tvg-logo="${stream.logoUrl || ''}" ` +
          `group-title="${this.escapeAttribute(categoryName)}",${stream.name}`
        );
      } else {
        lines.push(`#EXTINF:-1,${stream.name}`);
      }
      lines.push(streamUrl);
    }

    return lines.join('\n');
  }

  /**
   * Build stream URL
   */
  private buildStreamUrl(
    type: 'live' | 'movie' | 'series',
    streamId: number,
    user: UserData,
    extension: string
  ): string {
    switch (type) {
      case 'live':
        return `${this.baseUrl}/live/${user.username}/${user.password}/${streamId}.${extension}`;
      case 'movie':
        return `${this.baseUrl}/movie/${user.username}/${user.password}/${streamId}.${extension}`;
      case 'series':
        return `${this.baseUrl}/series/${user.username}/${user.password}/${streamId}.${extension}`;
    }
  }

  /**
   * Escape special characters for M3U attributes
   */
  private escapeAttribute(value: string): string {
    return value.replace(/"/g, "'").replace(/\n/g, ' ');
  }
}

// Export singleton
export const m3uGenerator = new M3UGenerator();
