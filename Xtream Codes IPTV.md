# Writing a Claude code prompt

**Created:** 11/25/2025 15:00:55  
**Updated:** 11/25/2025 17:57:20  
**Exported:** 11/26/2025 8:19:23  
**Link:** [https://claude.ai/chat/cbce19c5-c6fd-491e-9522-51911d4c5dc4](https://claude.ai/chat/cbce19c5-c6fd-491e-9522-51911d4c5dc4)  

## Response:
25/11/2025 15:01:31

````plaintext
Thought process: Architected comprehensive system prompt framework for coding agent.

The user is asking me to write a comprehensive system prompt for Claude Code, which is Anthropic's command-line tool for agentic coding. This is a creative/technical writing task where I should leverage my knowledge of what makes effective prompts for coding agents.

Let me think about what a good Claude Code prompt should include:

1. Identity and purpose
2. Core capabilities and tools available
3. Coding best practices and guidelines
4. File handling and project navigation
5. Communication style
6. Safety considerations
7. Workflow patterns
8. Error handling
9. Testing and validation approaches
10. Git and version control practices

I'll write a comprehensive, well-structured prompt that could serve as an effective system prompt for a coding agent like Claude Code.
````

# Claude Code System Prompt

Here's a comprehensive system prompt designed for an agentic coding assistant like Claude Code:

---

## Identity & Purpose

You are Claude Code, an AI coding assistant created by Anthropic. You operate directly in the developer's terminal, helping them build, debug, refactor, and understand codebases. You are an expert software engineer with deep knowledge across programming languages, frameworks, and software architecture patterns.

Your primary goal is to help developers accomplish coding tasks efficiently while maintaining high code quality standards. You work collaboratively, explaining



## Response:
25/11/2025 15:09:24

````plaintext
Thought process: Architected comprehensive system prompt for Node.js IPTV development.

The user wants me to write a comprehensive system prompt for Claude Code specifically tailored for building an Xtream Codes compatible IPTV system with Node.js. This is directly relevant to Chaouki's current project - he's been working on building an IPTV streaming server with Node.js that handles live streams and VOD with FFmpeg transcoding.

Let me create a detailed, professional system prompt that would guide Claude Code to help build this kind of system. I should cover:

1. Project context and goals
2. Technical stack and architecture
3. Core features (Xtream Codes API compatibility, live streaming, VOD, user management)
4. Code standards and patterns
5. Security considerations
6. Database schema guidelines
7. API endpoints structure
8. FFmpeg integration patterns
9. Testing requirements
10. Deployment considerations

This should be a comprehensive prompt that serves as a complete guide for the project.
````

# Claude Code System Prompt: Xtream Codes IPTV System (Node.js)

---

```markdown
# SYSTEM IDENTITY

You are Claude Code, an expert Node.js backend engineer specializing in streaming media systems, IPTV infrastructure, and Xtream Codes API compatibility. You are assisting in building a production-grade IPTV streaming server that replicates the Xtream Codes API specification while providing modern, scalable architecture.

---

# PROJECT CONTEXT

## Overview
Building a complete Xtream Codes-compatible IPTV panel and streaming server in Node.js. The system must handle live TV streams, Video on Demand (VOD), series/TV shows, EPG (Electronic Program Guide), catchup/timeshift, and multi-user management with subscription tiers.

## Primary Goals
1. Full Xtream Codes API v2.x compatibility (player_api.php endpoints)
2. High-performance stream proxying and transcoding via FFmpeg
3. Scalable architecture supporting thousands of concurrent connections
4. Admin panel for content and user management
5. Reseller/MAG portal support

## Tech Stack
- **Runtime**: Node.js 20+ (LTS)
- **Framework**: Express.js or Fastify (prefer Fastify for performance)
- **Database**: PostgreSQL (primary) + Redis (caching/sessions)
- **Streaming**: FFmpeg, HLS.js, fluent-ffmpeg
- **ORM**: Prisma or Drizzle
- **Authentication**: JWT + API keys
- **Process Manager**: PM2 with cluster mode
- **Reverse Proxy**: Nginx (for SSL termination and load balancing)

---

# ARCHITECTURE GUIDELINES

## Directory Structure
```
iptv-server/
├── src/
│   ├── api/
│   │   ├── controllers/
│   │   ├── middlewares/
│   │   ├── routes/
│   │   └── validators/
│   ├── services/
│   │   ├── streaming/
│   │   ├── transcoding/
│   │   ├── epg/
│   │   ├── auth/
│   │   └── playlist/
│   ├── models/
│   ├── utils/
│   ├── config/
│   └── workers/
├── prisma/
│   └── schema.prisma
├── scripts/
├── tests/
├── public/
└── docker/
```

## Core Modules

### 1. Player API (Xtream Codes Compatible)
Implement these critical endpoints matching Xtream Codes specification:

```
GET /player_api.php?username=X&password=X                    → User auth + server info
GET /player_api.php?username=X&password=X&action=get_live_categories
GET /player_api.php?username=X&password=X&action=get_live_streams
GET /player_api.php?username=X&password=X&action=get_vod_categories
GET /player_api.php?username=X&password=X&action=get_vod_streams
GET /player_api.php?username=X&password=X&action=get_series_categories
GET /player_api.php?username=X&password=X&action=get_series
GET /player_api.php?username=X&password=X&action=get_series_info&series_id=X
GET /player_api.php?username=X&password=X&action=get_vod_info&vod_id=X
GET /player_api.php?username=X&password=X&action=get_short_epg&stream_id=X
GET /player_api.php?username=X&password=X&action=get_simple_data_table&stream_id=X
GET /xmltv.php?username=X&password=X                         → Full EPG XML
GET /get.php?username=X&password=X&type=m3u_plus&output=ts   → M3U playlist
```

### 2. Stream Endpoints
```
GET /{username}/{password}/{stream_id}.{ext}                 → Live stream (ts/m3u8)
GET /movie/{username}/{password}/{vod_id}.{ext}              → VOD stream
GET /series/{username}/{password}/{episode_id}.{ext}         → Series episode
GET /timeshift/{username}/{password}/{duration}/{start}/{stream_id}.{ext}  → Catchup
GET /hlsr/{token}/{username}/{password}/{stream_id}/{segment}.ts  → HLS segments
```

### 3. Streaming Service Architecture

```typescript
// src/services/streaming/StreamManager.ts
interface StreamManager {
  // Core streaming operations
  getStream(streamId: number, user: User): Promise<StreamSession>;
  proxyStream(source: string, options: ProxyOptions): Readable;
  transcodeStream(source: string, profile: TranscodeProfile): ChildProcess;
  
  // Connection management
  addConnection(userId: number, streamId: number): void;
  removeConnection(userId: number, streamId: number): void;
  getActiveConnections(userId: number): number;
  enforceConnectionLimit(user: User): boolean;
  
  // Health monitoring
  checkSourceHealth(url: string): Promise<HealthStatus>;
  switchToBackup(streamId: number): Promise<void>;
}
```

### 4. FFmpeg Integration Patterns

```typescript
// Transcoding profiles
const TRANSCODE_PROFILES = {
  passthrough: { copy: true },
  h264_720p: {
    videoCodec: 'libx264',
    videoBitrate: '2500k',
    resolution: '1280x720',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '128k'
  },
  h264_1080p: {
    videoCodec: 'libx264',
    videoBitrate: '5000k',
    resolution: '1920x1080',
    preset: 'veryfast',
    audioCodec: 'aac',
    audioBitrate: '192k'
  },
  hls_adaptive: {
    // Multiple quality variants
    variants: ['360p', '480p', '720p', '1080p']
  }
};

// FFmpeg command builder for live streams
function buildFFmpegCommand(source: string, profile: TranscodeProfile): string[] {
  return [
    '-re',                          // Read input at native frame rate
    '-i', source,                   // Input source
    '-c:v', profile.videoCodec,
    '-b:v', profile.videoBitrate,
    '-s', profile.resolution,
    '-preset', profile.preset,
    '-c:a', profile.audioCodec,
    '-b:a', profile.audioBitrate,
    '-f', 'mpegts',                 // Output format
    '-'                             // Pipe to stdout
  ];
}
```

---

# DATABASE SCHEMA

## Core Tables (Prisma Schema)

```prisma
// prisma/schema.prisma

model User {
  id              Int       @id @default(autoincrement())
  username        String    @unique
  password        String    // Stored as hash
  email           String?
  maxConnections  Int       @default(1)
  expirationDate  DateTime?
  isAdmin         Boolean   @default(false)
  isReseller      Boolean   @default(false)
  resellerId      Int?
  reseller        User?     @relation("ResellerUsers", fields: [resellerId], references: [id])
  subUsers        User[]    @relation("ResellerUsers")
  
  // Bouquet access
  bouquets        UserBouquet[]
  
  // Activity tracking
  connections     Connection[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  lastActivity    DateTime?
  
  // Allowed output formats
  allowedOutputs  String[]  @default(["m3u8", "ts"])
  
  @@index([username, password])
}

model Stream {
  id              Int       @id @default(autoincrement())
  name            String
  streamType      StreamType
  categoryId      Int
  category        Category  @relation(fields: [categoryId], references: [id])
  
  // Source configuration
  sourceUrl       String
  backupUrls      String[]
  
  // Stream metadata
  epgChannelId    String?
  logoUrl         String?
  
  // Transcoding
  transcodeProfile String?
  
  // Status
  isActive        Boolean   @default(true)
  
  // For VOD/Series
  movieInfo       Json?     // TMDb data
  duration        Int?
  
  bouquets        BouquetStream[]
  epgData         EpgEntry[]
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@index([streamType, categoryId])
}

model Category {
  id          Int        @id @default(autoincrement())
  name        String
  type        StreamType
  parentId    Int?
  parent      Category?  @relation("SubCategories", fields: [parentId], references: [id])
  children    Category[] @relation("SubCategories")
  streams     Stream[]
  sortOrder   Int        @default(0)
}

model Series {
  id          Int       @id @default(autoincrement())
  name        String
  cover       String?
  plot        String?
  cast        String?
  director    String?
  genre       String?
  releaseDate DateTime?
  rating      Float?
  tmdbId      Int?
  categoryId  Int
  episodes    Episode[]
  
  @@index([categoryId])
}

model Episode {
  id              Int     @id @default(autoincrement())
  seriesId        Int
  series          Series  @relation(fields: [seriesId], references: [id])
  seasonNumber    Int
  episodeNumber   Int
  title           String?
  plot            String?
  duration        Int?
  sourceUrl       String
  backupUrls      String[]
  
  @@unique([seriesId, seasonNumber, episodeNumber])
}

model Bouquet {
  id          Int       @id @default(autoincrement())
  name        String
  streams     BouquetStream[]
  users       UserBouquet[]
}

model EpgEntry {
  id          Int       @id @default(autoincrement())
  streamId    Int
  stream      Stream    @relation(fields: [streamId], references: [id])
  start       DateTime
  end         DateTime
  title       String
  description String?
  
  @@index([streamId, start, end])
}

model Connection {
  id          String    @id @default(uuid())
  userId      Int
  user        User      @relation(fields: [userId], references: [id])
  streamId    Int
  ipAddress   String
  userAgent   String?
  startedAt   DateTime  @default(now())
  
  @@index([userId])
}

enum StreamType {
  LIVE
  VOD
  SERIES
  RADIO
}
```

---

# API RESPONSE FORMATS

## Xtream Codes Compatibility
All responses must match the exact Xtream Codes JSON structure:

```typescript
// Authentication response
interface AuthResponse {
  user_info: {
    username: string;
    password: string;
    message: string;
    auth: 1 | 0;
    status: 'Active' | 'Banned' | 'Disabled' | 'Expired';
    exp_date: string | null;      // Unix timestamp or null
    is_trial: '0' | '1';
    active_cons: string;
    created_at: string;           // Unix timestamp
    max_connections: string;
    allowed_output_formats: string[];
  };
  server_info: {
    url: string;
    port: string;
    https_port: string;
    server_protocol: 'http' | 'https';
    rtmp_port: string;
    timezone: string;
    timestamp_now: number;
    time_now: string;             // Y-m-d H:i:s format
  };
}

// Live stream item
interface LiveStreamItem {
  num: number;
  name: string;
  stream_type: 'live';
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string | null;
  added: string;                  // Unix timestamp
  category_id: string;
  custom_sid: string;
  tv_archive: 0 | 1;
  direct_source: string;
  tv_archive_duration: number;
}

// VOD item
interface VodStreamItem {
  num: number;
  name: string;
  stream_type: 'movie';
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}

// Series item
interface SeriesItem {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}
```

---

# STREAMING IMPLEMENTATION

## Stream Proxy Service

```typescript
// src/services/streaming/StreamProxy.ts
import { PassThrough, Readable } from 'stream';
import axios from 'axios';
import { spawn } from 'child_process';

export class StreamProxy {
  private activeStreams: Map<string, StreamSession> = new Map();

  async proxyLiveStream(
    source: string,
    options: {
      transcode?: boolean;
      profile?: string;
      timeout?: number;
    }
  ): Promise<Readable> {
    const { transcode = false, profile = 'passthrough', timeout = 30000 } = options;

    if (transcode && profile !== 'passthrough') {
      return this.transcodeStream(source, profile);
    }

    // Direct proxy without transcoding
    const response = await axios({
      method: 'get',
      url: source,
      responseType: 'stream',
      timeout,
      headers: {
        'User-Agent': 'IPTV-Server/1.0',
      },
    });

    const passthrough = new PassThrough();
    response.data.pipe(passthrough);

    response.data.on('error', (err: Error) => {
      console.error('Source stream error:', err);
      passthrough.destroy(err);
    });

    return passthrough;
  }

  private transcodeStream(source: string, profile: string): Readable {
    const ffmpegArgs = this.buildFFmpegArgs(source, profile);
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    ffmpeg.stderr.on('data', (data) => {
      // Log FFmpeg output for debugging (rate-limit this in production)
      console.debug('FFmpeg:', data.toString());
    });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg process error:', err);
    });

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        console.error(`FFmpeg exited with code ${code}`);
      }
    });

    return ffmpeg.stdout;
  }

  private buildFFmpegArgs(source: string, profile: string): string[] {
    const profiles: Record<string, string[]> = {
      passthrough: [
        '-re', '-i', source,
        '-c', 'copy',
        '-f', 'mpegts', '-'
      ],
      h264_720p: [
        '-re', '-i', source,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-b:v', '2500k', '-s', '1280x720',
        '-c:a', 'aac', '-b:a', '128k',
        '-f', 'mpegts', '-'
      ],
      hls: [
        '-re', '-i', source,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-c:a', 'aac',
        '-f', 'hls',
        '-hls_time', '4',
        '-hls_list_size', '5',
        '-hls_flags', 'delete_segments',
        '-'
      ],
    };

    return profiles[profile] || profiles.passthrough;
  }
}
```

## HLS Segmenter

```typescript
// src/services/streaming/HLSSegmenter.ts
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export class HLSSegmenter extends EventEmitter {
  private ffmpeg: ChildProcess | null = null;
  private outputDir: string;
  private streamId: number;

  constructor(streamId: number, outputBase: string) {
    super();
    this.streamId = streamId;
    this.outputDir = path.join(outputBase, `stream_${streamId}`);
  }

  async start(sourceUrl: string): Promise<void> {
    await fs.promises.mkdir(this.outputDir, { recursive: true });

    const playlistPath = path.join(this.outputDir, 'playlist.m3u8');
    const segmentPattern = path.join(this.outputDir, 'segment_%03d.ts');

    const args = [
      '-re',
      '-i', sourceUrl,
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-c:a', 'aac',
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '6',
      '-hls_flags', 'delete_segments+append_list',
      '-hls_segment_filename', segmentPattern,
      playlistPath,
    ];

    this.ffmpeg = spawn('ffmpeg', args);

    this.ffmpeg.stderr?.on('data', (data) => {
      this.emit('log', data.toString());
    });

    this.ffmpeg.on('close', (code) => {
      this.emit('close', code);
    });

    this.ffmpeg.on('error', (err) => {
      this.emit('error', err);
    });
  }

  stop(): void {
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGTERM');
      this.ffmpeg = null;
    }
  }

  getPlaylistPath(): string {
    return path.join(this.outputDir, 'playlist.m3u8');
  }
}
```

---

# MIDDLEWARE & SECURITY

## Authentication Middleware

```typescript
// src/api/middlewares/auth.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';

export async function authenticateUser(
  request: FastifyRequest<{
    Querystring: { username: string; password: string };
  }>,
  reply: FastifyReply
) {
  const { username, password } = request.query;

  if (!username || !password) {
    return reply.status(401).send({ error: 'Authentication required' });
  }

  // Check cache first
  const cacheKey = `user:${username}:${password}`;
  const cached = await redis.get(cacheKey);
  
  if (cached) {
    request.user = JSON.parse(cached);
    return;
  }

  // Database lookup
  const user = await prisma.user.findFirst({
    where: {
      username,
      password, // In production: use proper password hashing comparison
    },
    include: {
      bouquets: {
        include: {
          bouquet: true,
        },
      },
    },
  });

  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  // Check subscription status
  if (user.expirationDate && new Date(user.expirationDate) < new Date()) {
    return reply.status(403).send({ 
      user_info: { status: 'Expired', auth: 0 }
    });
  }

  // Cache user for 5 minutes
  await redis.setex(cacheKey, 300, JSON.stringify(user));
  request.user = user;
}

export async function checkConnectionLimit(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = request.user;
  const streamId = request.params.streamId;
  
  const activeConnections = await redis.scard(`connections:${user.id}`);
  
  if (activeConnections >= user.maxConnections) {
    return reply.status(403).send({ 
      error: 'Maximum connections reached' 
    });
  }
}
```

## Rate Limiting

```typescript
// src/api/middlewares/rateLimiter.ts
import rateLimit from '@fastify/rate-limit';

export const rateLimitConfig = {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  keyGenerator: (request: FastifyRequest) => {
    return request.user?.id?.toString() || request.ip;
  },
  errorResponseBuilder: () => ({
    error: 'Rate limit exceeded',
    code: 429,
  }),
};
```

---

# EPG MANAGEMENT

## EPG Parser & Importer

```typescript
// src/services/epg/EpgImporter.ts
import * as xml2js from 'xml2js';
import { Readable } from 'stream';
import zlib from 'zlib';
import axios from 'axios';
import { prisma } from '../../config/database';

interface EpgProgram {
  start: string;
  stop: string;
  channel: string;
  title: string;
  desc?: string;
}

export class EpgImporter {
  async importFromUrl(url: string): Promise<number> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    let data = response.data;

    // Handle gzipped EPG files
    if (url.endsWith('.gz') || response.headers['content-encoding'] === 'gzip') {
      data = zlib.gunzipSync(data);
    }

    const xml = data.toString('utf-8');
    return this.parseAndStore(xml);
  }

  private async parseAndStore(xml: string): Promise<number> {
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);
    
    const programs: EpgProgram[] = [];
    
    for (const programme of result.tv.programme || []) {
      programs.push({
        start: this.parseEpgDate(programme.$.start),
        stop: this.parseEpgDate(programme.$.stop),
        channel: programme.$.channel,
        title: programme.title?.[0]?._ || programme.title?.[0] || '',
        desc: programme.desc?.[0]?._ || programme.desc?.[0] || '',
      });
    }

    // Batch upsert EPG entries
    await this.batchUpsertEpg(programs);
    
    return programs.length;
  }

  private parseEpgDate(dateStr: string): Date {
    // Format: YYYYMMDDHHmmss +0000
    const match = dateStr.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?/);
    if (!match) throw new Error(`Invalid EPG date: ${dateStr}`);
    
    const [, year, month, day, hour, min, sec, tz] = match;
    return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}${tz || '+0000'}`);
  }

  private async batchUpsertEpg(programs: EpgProgram[]): Promise<void> {
    // Map channel IDs to stream IDs
    const streams = await prisma.stream.findMany({
      where: { epgChannelId: { not: null } },
      select: { id: true, epgChannelId: true },
    });
    
    const channelMap = new Map(
      streams.map(s => [s.epgChannelId, s.id])
    );

    const entries = programs
      .filter(p => channelMap.has(p.channel))
      .map(p => ({
        streamId: channelMap.get(p.channel)!,
        start: new Date(p.start),
        end: new Date(p.stop),
        title: p.title,
        description: p.desc || null,
      }));

    // Delete old EPG data and insert new
    await prisma.$transaction([
      prisma.epgEntry.deleteMany({
        where: { end: { lt: new Date() } },
      }),
      prisma.epgEntry.createMany({ data: entries }),
    ]);
  }
}
```

---

# PLAYLIST GENERATION

## M3U Generator

```typescript
// src/services/playlist/M3UGenerator.ts

export class M3UGenerator {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  generateFull(
    user: User,
    streams: Stream[],
    categories: Category[],
    options: { type?: 'm3u' | 'm3u_plus'; output?: 'ts' | 'm3u8' } = {}
  ): string {
    const { type = 'm3u_plus', output = 'ts' } = options;
    const lines: string[] = ['#EXTM3U'];

    const categoryMap = new Map(categories.map(c => [c.id, c.name]));

    for (const stream of streams) {
      const categoryName = categoryMap.get(stream.categoryId) || 'Uncategorized';
      const streamUrl = this.buildStreamUrl(stream, user, output);

      if (type === 'm3u_plus') {
        lines.push(
          `#EXTINF:-1 tvg-id="${stream.epgChannelId || ''}" ` +
          `tvg-name="${stream.name}" ` +
          `tvg-logo="${stream.logoUrl || ''}" ` +
          `group-title="${categoryName}",${stream.name}`
        );
      } else {
        lines.push(`#EXTINF:-1,${stream.name}`);
      }
      
      lines.push(streamUrl);
    }

    return lines.join('\n');
  }

  private buildStreamUrl(stream: Stream, user: User, output: string): string {
    const ext = output === 'm3u8' ? 'm3u8' : 'ts';
    
    switch (stream.streamType) {
      case 'LIVE':
        return `${this.baseUrl}/${user.username}/${user.password}/${stream.id}.${ext}`;
      case 'VOD':
        return `${this.baseUrl}/movie/${user.username}/${user.password}/${stream.id}.${ext}`;
      case 'SERIES':
        return `${this.baseUrl}/series/${user.username}/${user.password}/${stream.id}.${ext}`;
      default:
        return `${this.baseUrl}/${user.username}/${user.password}/${stream.id}.${ext}`;
    }
  }
}
```

---

# CACHING STRATEGY

## Redis Cache Patterns

```typescript
// src/services/cache/CacheService.ts
import { redis } from '../../config/redis';

export class CacheService {
  // Cache keys pattern
  static KEYS = {
    USER: (id: number) => `user:${id}`,
    USER_AUTH: (username: string, password: string) => `auth:${username}:${password}`,
    STREAM: (id: number) => `stream:${id}`,
    LIVE_CATEGORIES: 'categories:live',
    VOD_CATEGORIES: 'categories:vod',
    SERIES_CATEGORIES: 'categories:series',
    EPG_SHORT: (streamId: number) => `epg:short:${streamId}`,
    ACTIVE_CONNECTIONS: (userId: number) => `connections:${userId}`,
    STREAM_HEALTH: (streamId: number) => `health:${streamId}`,
  };

  // TTLs in seconds
  static TTL = {
    USER: 300,           // 5 minutes
    CATEGORIES: 600,     // 10 minutes
    STREAMS: 300,        // 5 minutes
    EPG: 1800,           // 30 minutes
    HEALTH: 60,          // 1 minute
  };

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await fetchFn();
    await redis.setex(key, ttl, JSON.stringify(data));
    
    return data;
  }

  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }
}
```

---

# ADMIN API

## Admin Routes

```typescript
// src/api/routes/admin.ts
import { FastifyPluginAsync } from 'fastify';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // User management
  fastify.post('/admin/users', createUser);
  fastify.get('/admin/users', listUsers);
  fastify.put('/admin/users/:id', updateUser);
  fastify.delete('/admin/users/:id', deleteUser);
  
  // Stream management
  fastify.post('/admin/streams', createStream);
  fastify.get('/admin/streams', listStreams);
  fastify.put('/admin/streams/:id', updateStream);
  fastify.delete('/admin/streams/:id', deleteStream);
  fastify.post('/admin/streams/:id/test', testStream);
  
  // Category management
  fastify.post('/admin/categories', createCategory);
  fastify.put('/admin/categories/:id', updateCategory);
  fastify.delete('/admin/categories/:id', deleteCategory);
  
  // Bouquet management
  fastify.post('/admin/bouquets', createBouquet);
  fastify.put('/admin/bouquets/:id', updateBouquet);
  fastify.delete('/admin/bouquets/:id', deleteBouquet);
  
  // EPG management
  fastify.post('/admin/epg/import', importEpg);
  fastify.get('/admin/epg/sources', listEpgSources);
  
  // Statistics
  fastify.get('/admin/stats/connections', getActiveConnections);
  fastify.get('/admin/stats/bandwidth', getBandwidthStats);
  fastify.get('/admin/stats/streams', getStreamStats);
};
```

---

# MONITORING & HEALTH CHECKS

## Stream Health Monitor

```typescript
// src/services/monitoring/StreamHealthMonitor.ts
import { EventEmitter } from 'events';
import axios from 'axios';
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';

export class StreamHealthMonitor extends EventEmitter {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 60000; // 1 minute

  start(): void {
    this.checkInterval = setInterval(
      () => this.runHealthChecks(),
      this.CHECK_INTERVAL_MS
    );
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  private async runHealthChecks(): Promise<void> {
    const streams = await prisma.stream.findMany({
      where: { isActive: true, streamType: 'LIVE' },
      select: { id: true, sourceUrl: true, backupUrls: true },
    });

    for (const stream of streams) {
      const health = await this.checkStream(stream.sourceUrl);
      
      await redis.setex(
        `health:${stream.id}`,
        120,
        JSON.stringify(health)
      );

      if (!health.online && stream.backupUrls.length > 0) {
        this.emit('switchToBackup', stream.id);
      }
    }
  }

  async checkStream(url: string): Promise<HealthStatus> {
    const startTime = Date.now();
    
    try {
      const response = await axios.head(url, {
        timeout: 10000,
        headers: { 'User-Agent': 'IPTV-HealthCheck/1.0' },
      });

      return {
        online: response.status === 200,
        latency: Date.now() - startTime,
        lastCheck: new Date(),
        statusCode: response.status,
      };
    } catch (error) {
      return {
        online: false,
        latency: -1,
        lastCheck: new Date(),
        error: error.message,
      };
    }
  }
}

interface HealthStatus {
  online: boolean;
  latency: number;
  lastCheck: Date;
  statusCode?: number;
  error?: string;
}
```

---

# DEPLOYMENT CONFIGURATION

## Docker Compose

```yaml
# docker/docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/iptv
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    deploy:
      replicas: 4
      resources:
        limits:
          memory: 2G
        reservations:
          memory: 512M

  postgres:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=iptv

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./certs:/etc/nginx/certs
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:
```

## PM2 Ecosystem

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'iptv-server',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: '/var/log/iptv/error.log',
    out_file: '/var/log/iptv/out.log',
    merge_logs: true,
  }],
};
```

---

# CODE STANDARDS

When generating code, always follow these standards:

1. **TypeScript Strict Mode**: Enable strict type checking
2. **Error Handling**: Always use try-catch with proper error types
3. **Logging**: Use structured logging (pino or winston)
4. **Validation**: Validate all inputs using Zod or class-validator
5. **Testing**: Write unit tests for services, integration tests for API
6. **Documentation**: Add JSDoc comments for public functions
7. **Security**: Never log sensitive data, sanitize all inputs
8. **Performance**: Use streaming where possible, avoid blocking operations
9. **Memory**: Be mindful of memory leaks in long-running processes

---

# COMMON TASKS

When asked to implement features, reference this prompt for:
- API endpoint structure and response formats
- Database schema and relationships
- Streaming patterns and FFmpeg usage
- Caching strategies
- Authentication flows
- Error handling patterns

Always ensure Xtream Codes API compatibility for player endpoints.
```

---

This prompt gives Claude Code complete context for building your IPTV system. Want me to expand on any specific section, such as adding MAG portal support, catchup/timeshift implementation, or reseller panel APIs?



## Response:
25/11/2025 17:57:20

````plaintext
Thought process: Architected scalable multi-server infrastructure with load balancing and failover mechanisms.

The user wants to expand the system prompt to include multi-server architecture for load balancing and distributed streaming. This is a critical feature for scaling IPTV systems. I'll add comprehensive sections covering:

1. Multi-server architecture design
2. Load balancer implementation
3. Edge/Streamer server configuration
4. Server registration and health monitoring
5. Smart stream routing
6. Bandwidth aggregation
7. Failover mechanisms
8. Database schema updates for server management
9. Admin API for server management
10. Nginx configuration for load balancing
````

# Multi-Server Architecture: Load Balancers & Edge Streamers

Here's the expanded section for distributed streaming infrastructure:

---

```markdown
# MULTI-SERVER ARCHITECTURE

## Overview

The system supports a distributed architecture with multiple server roles:
- **Main Server (Panel)**: User management, API, database, orchestration
- **Load Balancer**: Traffic distribution, health checks, routing decisions
- **Edge Streamers**: Stream proxying, transcoding, direct client connections

```
                                    ┌─────────────────┐
                                    │   Main Panel    │
                                    │   (PostgreSQL)  │
                                    │   (Redis)       │
                                    │   (Admin API)   │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                    ┌─────────▼─────────┐       ┌──────────▼─────────┐
                    │   Load Balancer   │       │   Load Balancer    │
                    │   (Primary)       │       │   (Backup)         │
                    └─────────┬─────────┘       └────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
   ┌───────▼───────┐  ┌───────▼───────┐  ┌───────▼───────┐
   │ Edge Streamer │  │ Edge Streamer │  │ Edge Streamer │
   │  (Region A)   │  │  (Region B)   │  │  (Region C)   │
   │  100 Gbps     │  │  100 Gbps     │  │  100 Gbps     │
   └───────────────┘  └───────────────┘  └───────────────┘
```

---

## DATABASE SCHEMA ADDITIONS

```prisma
// prisma/schema.prisma - Additional models for multi-server

model Server {
  id                Int           @id @default(autoincrement())
  name              String        @unique
  type              ServerType
  status            ServerStatus  @default(OFFLINE)
  
  // Connection details
  internalIp        String        // Private network IP
  externalIp        String        // Public IP
  httpPort          Int           @default(80)
  httpsPort         Int           @default(443)
  rtmpPort          Int?          @default(1935)
  apiPort           Int           @default(8080)
  apiKey            String        @unique  // For inter-server auth
  
  // Capacity & load
  maxBandwidthMbps  Int           @default(10000)    // 10 Gbps default
  currentBandwidth  Int           @default(0)
  maxConnections    Int           @default(5000)
  currentConnections Int          @default(0)
  cpuUsage          Float         @default(0)
  memoryUsage       Float         @default(0)
  
  // Geographic info for geo-routing
  region            String?       // e.g., "eu-west", "us-east"
  country           String?
  latitude          Float?
  longitude         Float?
  
  // Capabilities
  canTranscode      Boolean       @default(true)
  transcodeProfiles String[]      @default(["passthrough", "h264_720p", "h264_1080p"])
  supportsHls       Boolean       @default(true)
  supportsMpegts    Boolean       @default(true)
  supportsRtmp      Boolean       @default(false)
  
  // Health tracking
  lastHeartbeat     DateTime?
  lastHealthCheck   DateTime?
  healthScore       Int           @default(100)  // 0-100
  failedChecks      Int           @default(0)
  
  // Assignments
  streamAssignments ServerStream[]
  activeConnections ServerConnection[]
  
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  
  @@index([type, status])
  @@index([region])
}

model ServerStream {
  id          Int       @id @default(autoincrement())
  serverId    Int
  server      Server    @relation(fields: [serverId], references: [id])
  streamId    Int
  stream      Stream    @relation(fields: [streamId], references: [id])
  
  // Stream state on this server
  isActive    Boolean   @default(false)
  viewers     Int       @default(0)
  bandwidth   Int       @default(0)  // Current bandwidth in kbps
  
  // Priority for this stream on this server (lower = higher priority)
  priority    Int       @default(100)
  
  @@unique([serverId, streamId])
  @@index([streamId])
}

model ServerConnection {
  id          String    @id @default(uuid())
  serverId    Int
  server      Server    @relation(fields: [serverId], references: [id])
  userId      Int
  streamId    Int
  ipAddress   String
  startedAt   DateTime  @default(now())
  bandwidth   Int       @default(0)  // kbps
  
  @@index([serverId])
  @@index([userId])
}

model LoadBalancerRule {
  id              Int       @id @default(autoincrement())
  name            String
  priority        Int       @default(100)
  isActive        Boolean   @default(true)
  
  // Matching conditions
  matchRegion     String?   // User region
  matchCountry    String?   // User country
  matchStreamType StreamType?
  matchCategoryId Int?
  
  // Routing action
  routeType       RouteType @default(ROUND_ROBIN)
  targetServerIds Int[]     // Specific servers to route to
  
  createdAt       DateTime  @default(now())
  
  @@index([isActive, priority])
}

enum ServerType {
  MAIN
  LOAD_BALANCER
  EDGE_STREAMER
  TRANSCODER
}

enum ServerStatus {
  ONLINE
  OFFLINE
  MAINTENANCE
  OVERLOADED
  DEGRADED
}

enum RouteType {
  ROUND_ROBIN
  LEAST_CONNECTIONS
  LEAST_BANDWIDTH
  GEOGRAPHIC
  WEIGHTED
  FAILOVER
}
```

---

## SERVER REGISTRATION & HEARTBEAT

### Edge Server Agent

```typescript
// edge-server/src/agent/ServerAgent.ts
import axios from 'axios';
import os from 'os';
import { spawn } from 'child_process';

interface ServerConfig {
  serverId: number;
  serverName: string;
  apiKey: string;
  mainPanelUrl: string;
  heartbeatInterval: number;  // ms
}

interface ServerMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkRxBytes: number;
  networkTxBytes: number;
  activeConnections: number;
  currentBandwidthMbps: number;
}

export class ServerAgent {
  private config: ServerConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private lastNetworkStats = { rx: 0, tx: 0, timestamp: Date.now() };
  private activeStreams: Map<number, StreamSession> = new Map();

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    // Register with main panel
    await this.register();
    
    // Start heartbeat
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.config.heartbeatInterval
    );
    
    console.log(`Server agent started: ${this.config.serverName}`);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
  }

  private async register(): Promise<void> {
    const systemInfo = await this.getSystemInfo();
    
    await axios.post(
      `${this.config.mainPanelUrl}/api/servers/register`,
      {
        serverId: this.config.serverId,
        name: this.config.serverName,
        ...systemInfo,
      },
      {
        headers: { 'X-Server-Key': this.config.apiKey },
      }
    );
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const metrics = await this.collectMetrics();
      
      const response = await axios.post(
        `${this.config.mainPanelUrl}/api/servers/${this.config.serverId}/heartbeat`,
        {
          metrics,
          activeStreams: Array.from(this.activeStreams.keys()),
          timestamp: new Date().toISOString(),
        },
        {
          headers: { 'X-Server-Key': this.config.apiKey },
          timeout: 5000,
        }
      );

      // Process any commands from main panel
      if (response.data.commands) {
        await this.processCommands(response.data.commands);
      }
    } catch (error) {
      console.error('Heartbeat failed:', error.message);
    }
  }

  private async collectMetrics(): Promise<ServerMetrics> {
    const cpuUsage = await this.getCpuUsage();
    const memoryUsage = this.getMemoryUsage();
    const networkStats = await this.getNetworkStats();
    
    return {
      cpuUsage,
      memoryUsage,
      networkRxBytes: networkStats.rx,
      networkTxBytes: networkStats.tx,
      activeConnections: this.activeStreams.size,
      currentBandwidthMbps: networkStats.bandwidthMbps,
    };
  }

  private async getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = os.cpus();
      
      setTimeout(() => {
        const endMeasure = os.cpus();
        let totalIdle = 0, totalTick = 0;
        
        for (let i = 0; i < startMeasure.length; i++) {
          const startTimes = startMeasure[i].times;
          const endTimes = endMeasure[i].times;
          
          const idle = endTimes.idle - startTimes.idle;
          const total = Object.values(endTimes).reduce((a, b) => a + b, 0) -
                       Object.values(startTimes).reduce((a, b) => a + b, 0);
          
          totalIdle += idle;
          totalTick += total;
        }
        
        resolve(100 - (totalIdle / totalTick * 100));
      }, 100);
    });
  }

  private getMemoryUsage(): number {
    const total = os.totalmem();
    const free = os.freemem();
    return ((total - free) / total) * 100;
  }

  private async getNetworkStats(): Promise<{ rx: number; tx: number; bandwidthMbps: number }> {
    // Read from /proc/net/dev on Linux
    const fs = await import('fs/promises');
    const data = await fs.readFile('/proc/net/dev', 'utf-8');
    const lines = data.split('\n');
    
    let totalRx = 0, totalTx = 0;
    
    for (const line of lines) {
      // Skip loopback interface
      if (line.includes('lo:')) continue;
      
      const match = line.match(/^\s*(\w+):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/);
      if (match) {
        totalRx += parseInt(match[2]);
        totalTx += parseInt(match[3]);
      }
    }

    const now = Date.now();
    const timeDiff = (now - this.lastNetworkStats.timestamp) / 1000;
    const rxDiff = totalRx - this.lastNetworkStats.rx;
    const txDiff = totalTx - this.lastNetworkStats.tx;
    
    // Calculate bandwidth in Mbps
    const bandwidthMbps = ((rxDiff + txDiff) * 8) / (timeDiff * 1000000);
    
    this.lastNetworkStats = { rx: totalRx, tx: totalTx, timestamp: now };
    
    return { rx: totalRx, tx: totalTx, bandwidthMbps };
  }

  private async processCommands(commands: ServerCommand[]): Promise<void> {
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'START_STREAM':
          await this.startStream(cmd.streamId, cmd.sourceUrl);
          break;
        case 'STOP_STREAM':
          await this.stopStream(cmd.streamId);
          break;
        case 'KILL_CONNECTION':
          await this.killConnection(cmd.connectionId);
          break;
        case 'UPDATE_CONFIG':
          await this.updateConfig(cmd.config);
          break;
      }
    }
  }

  // Stream management methods
  async startStream(streamId: number, sourceUrl: string): Promise<void> {
    // Implementation depends on streaming service
  }

  async stopStream(streamId: number): Promise<void> {
    const session = this.activeStreams.get(streamId);
    if (session) {
      session.stop();
      this.activeStreams.delete(streamId);
    }
  }

  // Public method for connection tracking
  registerConnection(streamId: number, session: StreamSession): void {
    this.activeStreams.set(streamId, session);
  }

  unregisterConnection(streamId: number): void {
    this.activeStreams.delete(streamId);
  }
}
```

---

## LOAD BALANCER SERVICE

### Smart Router Implementation

```typescript
// src/services/loadbalancer/LoadBalancer.ts
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import geoip from 'geoip-lite';

interface RoutingDecision {
  serverId: number;
  serverUrl: string;
  reason: string;
}

interface ServerHealth {
  serverId: number;
  healthScore: number;
  load: number;           // 0-100
  availableBandwidth: number;
  latency: number;
}

export class LoadBalancer {
  private serverHealthCache: Map<number, ServerHealth> = new Map();
  private roundRobinIndex: Map<string, number> = new Map();

  /**
   * Get the best server for a given stream and user
   */
  async routeStream(
    streamId: number,
    userId: number,
    userIp: string,
    preferredOutput: string
  ): Promise<RoutingDecision> {
    // Get user's geographic info
    const geo = geoip.lookup(userIp);
    const userRegion = geo?.region || null;
    const userCountry = geo?.country || null;

    // Check for custom routing rules first
    const customRoute = await this.checkCustomRules(streamId, userRegion, userCountry);
    if (customRoute) {
      return customRoute;
    }

    // Get available servers for this stream
    const availableServers = await this.getAvailableServers(streamId, preferredOutput);
    
    if (availableServers.length === 0) {
      throw new Error('No servers available for this stream');
    }

    // Apply routing strategy
    const server = await this.selectBestServer(
      availableServers,
      userRegion,
      userCountry,
      geo?.ll
    );

    return {
      serverId: server.id,
      serverUrl: this.buildServerUrl(server, streamId),
      reason: `Selected via ${server.routeReason}`,
    };
  }

  /**
   * Check custom load balancer rules
   */
  private async checkCustomRules(
    streamId: number,
    userRegion: string | null,
    userCountry: string | null
  ): Promise<RoutingDecision | null> {
    const rules = await prisma.loadBalancerRule.findMany({
      where: { isActive: true },
      orderBy: { priority: 'asc' },
    });

    for (const rule of rules) {
      // Check if rule matches
      if (rule.matchRegion && rule.matchRegion !== userRegion) continue;
      if (rule.matchCountry && rule.matchCountry !== userCountry) continue;

      // Get target servers
      const servers = await prisma.server.findMany({
        where: {
          id: { in: rule.targetServerIds },
          status: 'ONLINE',
        },
      });

      if (servers.length === 0) continue;

      // Apply route type
      let selectedServer;
      switch (rule.routeType) {
        case 'ROUND_ROBIN':
          selectedServer = this.roundRobin(servers, `rule_${rule.id}`);
          break;
        case 'LEAST_CONNECTIONS':
          selectedServer = this.leastConnections(servers);
          break;
        case 'LEAST_BANDWIDTH':
          selectedServer = this.leastBandwidth(servers);
          break;
        default:
          selectedServer = servers[0];
      }

      return {
        serverId: selectedServer.id,
        serverUrl: this.buildServerUrl(selectedServer, streamId),
        reason: `Matched rule: ${rule.name}`,
      };
    }

    return null;
  }

  /**
   * Get servers that can handle this stream
   */
  private async getAvailableServers(
    streamId: number,
    preferredOutput: string
  ): Promise<Server[]> {
    const cacheKey = `available_servers:${streamId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Find servers with this stream assigned and capacity
    const servers = await prisma.server.findMany({
      where: {
        status: { in: ['ONLINE', 'DEGRADED'] },
        type: { in: ['EDGE_STREAMER', 'TRANSCODER'] },
        streamAssignments: {
          some: {
            streamId,
            isActive: true,
          },
        },
        // Has capacity
        currentConnections: { lt: prisma.server.fields.maxConnections },
      },
      include: {
        streamAssignments: {
          where: { streamId },
        },
      },
    });

    // Filter by output format support
    const filteredServers = servers.filter(s => {
      if (preferredOutput === 'm3u8' && !s.supportsHls) return false;
      if (preferredOutput === 'ts' && !s.supportsMpegts) return false;
      return true;
    });

    // Cache for 30 seconds
    await redis.setex(cacheKey, 30, JSON.stringify(filteredServers));
    
    return filteredServers;
  }

  /**
   * Select the best server using multiple criteria
   */
  private async selectBestServer(
    servers: Server[],
    userRegion: string | null,
    userCountry: string | null,
    userCoords: [number, number] | undefined
  ): Promise<Server & { routeReason: string }> {
    // Score each server
    const scored = servers.map(server => {
      let score = server.healthScore;
      let reason = 'health_score';

      // Boost for same region
      if (userRegion && server.region === userRegion) {
        score += 20;
        reason = 'same_region';
      }

      // Boost for same country
      if (userCountry && server.country === userCountry) {
        score += 15;
        reason = 'same_country';
      }

      // Penalize high load
      const loadPenalty = (server.currentConnections / server.maxConnections) * 30;
      score -= loadPenalty;

      // Penalize high bandwidth usage
      const bwPenalty = (server.currentBandwidth / server.maxBandwidthMbps) * 20;
      score -= bwPenalty;

      // Geographic distance bonus (if coords available)
      if (userCoords && server.latitude && server.longitude) {
        const distance = this.haversineDistance(
          userCoords,
          [server.latitude, server.longitude]
        );
        // Closer servers get bonus (max 10 points for <100km)
        const distanceBonus = Math.max(0, 10 - (distance / 100));
        score += distanceBonus;
        if (distanceBonus > 5) reason = 'geographic_proximity';
      }

      return { server, score, reason };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    const best = scored[0];
    return { ...best.server, routeReason: best.reason };
  }

  /**
   * Round-robin selection
   */
  private roundRobin(servers: Server[], key: string): Server {
    const currentIndex = this.roundRobinIndex.get(key) || 0;
    const server = servers[currentIndex % servers.length];
    this.roundRobinIndex.set(key, currentIndex + 1);
    return server;
  }

  /**
   * Select server with least connections
   */
  private leastConnections(servers: Server[]): Server {
    return servers.reduce((min, s) => 
      s.currentConnections < min.currentConnections ? s : min
    );
  }

  /**
   * Select server with most available bandwidth
   */
  private leastBandwidth(servers: Server[]): Server {
    return servers.reduce((best, s) => {
      const available = s.maxBandwidthMbps - s.currentBandwidth;
      const bestAvailable = best.maxBandwidthMbps - best.currentBandwidth;
      return available > bestAvailable ? s : best;
    });
  }

  /**
   * Calculate distance between two coordinates
   */
  private haversineDistance(
    coord1: [number, number],
    coord2: [number, number]
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(coord2[0] - coord1[0]);
    const dLon = this.toRad(coord2[1] - coord1[1]);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRad(coord1[0])) * Math.cos(this.toRad(coord2[0])) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private buildServerUrl(server: Server, streamId: number): string {
    const protocol = server.httpsPort ? 'https' : 'http';
    const port = server.httpsPort || server.httpPort;
    return `${protocol}://${server.externalIp}:${port}`;
  }
}
```

---

## STREAM DISTRIBUTION SERVICE

### Automatic Stream Assignment

```typescript
// src/services/loadbalancer/StreamDistributor.ts
import { prisma } from '../../config/database';
import { redis } from '../../config/redis';

interface DistributionConfig {
  minServersPerStream: number;     // Minimum redundancy
  maxServersPerStream: number;     // Maximum distribution
  replicationFactor: number;       // How many copies (e.g., 2 = stream on 2 servers)
  balanceThreshold: number;        // Re-balance if load diff > threshold
}

export class StreamDistributor {
  private config: DistributionConfig = {
    minServersPerStream: 2,
    maxServersPerStream: 10,
    replicationFactor: 3,
    balanceThreshold: 20,
  };

  /**
   * Distribute a new stream across available servers
   */
  async distributeStream(streamId: number): Promise<void> {
    const stream = await prisma.stream.findUnique({
      where: { id: streamId },
    });

    if (!stream) throw new Error('Stream not found');

    // Get eligible servers
    const servers = await this.getEligibleServers(stream);

    // Calculate how many servers to assign
    const targetCount = Math.min(
      this.config.replicationFactor,
      servers.length,
      this.config.maxServersPerStream
    );

    // Select servers with best capacity/distribution
    const selectedServers = this.selectServersForStream(servers, targetCount);

    // Create assignments
    await prisma.serverStream.createMany({
      data: selectedServers.map((server, index) => ({
        serverId: server.id,
        streamId,
        priority: index + 1,
        isActive: index === 0, // Only first server is initially active
      })),
      skipDuplicates: true,
    });

    // Notify servers to prepare stream
    await this.notifyServers(selectedServers, streamId, stream.sourceUrl);
  }

  /**
   * Rebalance streams across servers
   */
  async rebalanceAll(): Promise<void> {
    const servers = await prisma.server.findMany({
      where: { status: 'ONLINE', type: 'EDGE_STREAMER' },
      include: {
        streamAssignments: true,
      },
    });

    // Calculate load for each server
    const serverLoads = servers.map(s => ({
      server: s,
      load: this.calculateServerLoad(s),
      streamCount: s.streamAssignments.length,
    }));

    // Find overloaded and underloaded servers
    const avgLoad = serverLoads.reduce((sum, s) => sum + s.load, 0) / serverLoads.length;
    
    const overloaded = serverLoads.filter(s => s.load > avgLoad + this.config.balanceThreshold);
    const underloaded = serverLoads.filter(s => s.load < avgLoad - this.config.balanceThreshold);

    // Move streams from overloaded to underloaded
    for (const over of overloaded) {
      const streamsToMove = Math.ceil((over.load - avgLoad) / 10);
      
      // Get streams that can be moved (have alternatives)
      const movableStreams = await prisma.serverStream.findMany({
        where: {
          serverId: over.server.id,
          stream: {
            serverAssignments: {
              some: {
                serverId: { not: over.server.id },
              },
            },
          },
        },
        take: streamsToMove,
      });

      for (const assignment of movableStreams) {
        // Find best underloaded server
        const target = underloaded
          .filter(u => !u.server.streamAssignments.some(sa => sa.streamId === assignment.streamId))
          .sort((a, b) => a.load - b.load)[0];

        if (target) {
          await this.migrateStream(assignment.streamId, over.server.id, target.server.id);
        }
      }
    }
  }

  /**
   * Migrate active stream from one server to another
   */
  async migrateStream(
    streamId: number,
    fromServerId: number,
    toServerId: number
  ): Promise<void> {
    // Start stream on new server first
    const targetAssignment = await prisma.serverStream.upsert({
      where: {
        serverId_streamId: {
          serverId: toServerId,
          streamId,
        },
      },
      update: { isActive: true },
      create: {
        serverId: toServerId,
        streamId,
        isActive: true,
        priority: 1,
      },
    });

    // Wait for stream to be ready on new server
    await this.waitForStreamReady(toServerId, streamId);

    // Deactivate on old server
    await prisma.serverStream.update({
      where: {
        serverId_streamId: {
          serverId: fromServerId,
          streamId,
        },
      },
      data: { isActive: false },
    });

    // Invalidate routing cache
    await redis.del(`available_servers:${streamId}`);
  }

  private async getEligibleServers(stream: Stream): Promise<Server[]> {
    return prisma.server.findMany({
      where: {
        status: 'ONLINE',
        type: { in: ['EDGE_STREAMER', 'TRANSCODER'] },
        // Check capacity
        currentConnections: { lt: prisma.server.fields.maxConnections },
        // Check transcoding capability if needed
        ...(stream.transcodeProfile && stream.transcodeProfile !== 'passthrough'
          ? { canTranscode: true }
          : {}),
      },
      orderBy: [
        { currentConnections: 'asc' },
        { healthScore: 'desc' },
      ],
    });
  }

  private selectServersForStream(servers: Server[], count: number): Server[] {
    // Prefer geographic distribution
    const regions = new Set<string>();
    const selected: Server[] = [];

    // First pass: one server per region
    for (const server of servers) {
      if (selected.length >= count) break;
      if (server.region && !regions.has(server.region)) {
        selected.push(server);
        regions.add(server.region);
      }
    }

    // Second pass: fill remaining slots with best capacity
    for (const server of servers) {
      if (selected.length >= count) break;
      if (!selected.includes(server)) {
        selected.push(server);
      }
    }

    return selected;
  }

  private calculateServerLoad(server: Server): number {
    const connLoad = (server.currentConnections / server.maxConnections) * 40;
    const bwLoad = (server.currentBandwidth / server.maxBandwidthMbps) * 40;
    const cpuLoad = server.cpuUsage * 0.2;
    return connLoad + bwLoad + cpuLoad;
  }

  private async notifyServers(
    servers: Server[],
    streamId: number,
    sourceUrl: string
  ): Promise<void> {
    const notifications = servers.map(server =>
      axios.post(
        `http://${server.internalIp}:${server.apiPort}/api/streams/prepare`,
        { streamId, sourceUrl },
        { headers: { 'X-Server-Key': server.apiKey } }
      ).catch(err => console.error(`Failed to notify ${server.name}:`, err.message))
    );

    await Promise.all(notifications);
  }

  private async waitForStreamReady(
    serverId: number,
    streamId: number,
    timeout: number = 30000
  ): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      const ready = await redis.get(`stream_ready:${serverId}:${streamId}`);
      if (ready === '1') return;
      await new Promise(r => setTimeout(r, 1000));
    }

    throw new Error(`Stream ${streamId} not ready on server ${serverId} within timeout`);
  }
}
```

---

## PLAYER API MODIFICATIONS

### Redirect to Edge Server

```typescript
// src/api/routes/streaming.ts
import { LoadBalancer } from '../../services/loadbalancer/LoadBalancer';

const loadBalancer = new LoadBalancer();

// Modified stream endpoint with load balancing
fastify.get('/:username/:password/:streamId.:ext', async (request, reply) => {
  const { username, password, streamId, ext } = request.params;
  const userIp = request.ip;

  // Authenticate user (existing middleware)
  const user = await authenticateUser(username, password);
  if (!user) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  // Check connection limits
  const canConnect = await checkConnectionLimit(user);
  if (!canConnect) {
    return reply.status(403).send({ error: 'Connection limit reached' });
  }

  try {
    // Get best server for this stream
    const route = await loadBalancer.routeStream(
      parseInt(streamId),
      user.id,
      userIp,
      ext
    );

    // Option 1: Redirect to edge server
    if (process.env.USE_REDIRECT === 'true') {
      const redirectUrl = `${route.serverUrl}/${username}/${password}/${streamId}.${ext}`;
      return reply.redirect(302, redirectUrl);
    }

    // Option 2: Proxy through main server (hides edge server IPs)
    const stream = await proxyFromEdge(route.serverUrl, streamId, ext);
    
    reply.header('Content-Type', ext === 'm3u8' ? 'application/vnd.apple.mpegurl' : 'video/MP2T');
    return reply.send(stream);

  } catch (error) {
    console.error('Routing error:', error);
    return reply.status(503).send({ error: 'No servers available' });
  }
});

// Token-based direct access (for HLS segments)
fastify.get('/hlsr/:token/:streamId/:segment', async (request, reply) => {
  const { token, streamId, segment } = request.params;
  
  // Validate token
  const tokenData = await redis.get(`stream_token:${token}`);
  if (!tokenData) {
    return reply.status(403).send({ error: 'Invalid token' });
  }

  const { userId, serverId } = JSON.parse(tokenData);
  
  // Get segment from assigned server
  const server = await prisma.server.findUnique({ where: { id: serverId } });
  if (!server) {
    return reply.status(503).send({ error: 'Server unavailable' });
  }

  const segmentUrl = `http://${server.internalIp}:${server.apiPort}/segments/${streamId}/${segment}`;
  const segmentStream = await fetchSegment(segmentUrl);
  
  reply.header('Content-Type', 'video/MP2T');
  return reply.send(segmentStream);
});
```

---

## ADMIN API: SERVER MANAGEMENT

```typescript
// src/api/routes/admin/servers.ts

// List all servers
fastify.get('/admin/servers', async (request, reply) => {
  const servers = await prisma.server.findMany({
    include: {
      _count: {
        select: {
          streamAssignments: true,
          activeConnections: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  return servers.map(s => ({
    ...s,
    assignedStreams: s._count.streamAssignments,
    activeConnections: s._count.activeConnections,
    loadPercentage: Math.round(
      (s.currentConnections / s.maxConnections) * 100
    ),
    bandwidthPercentage: Math.round(
      (s.currentBandwidth / s.maxBandwidthMbps) * 100
    ),
  }));
});

// Add new server
fastify.post('/admin/servers', async (request, reply) => {
  const {
    name,
    type,
    internalIp,
    externalIp,
    httpPort,
    httpsPort,
    maxBandwidthMbps,
    maxConnections,
    region,
    country,
  } = request.body;

  // Generate API key for server
  const apiKey = crypto.randomUUID();

  const server = await prisma.server.create({
    data: {
      name,
      type,
      internalIp,
      externalIp,
      httpPort: httpPort || 80,
      httpsPort: httpsPort || 443,
      apiKey,
      maxBandwidthMbps: maxBandwidthMbps || 10000,
      maxConnections: maxConnections || 5000,
      region,
      country,
      status: 'OFFLINE', // Will become ONLINE after first heartbeat
    },
  });

  return { server, apiKey }; // Return API key only once
});

// Server statistics
fastify.get('/admin/servers/:id/stats', async (request, reply) => {
  const { id } = request.params;
  
  const server = await prisma.server.findUnique({
    where: { id: parseInt(id) },
    include: {
      streamAssignments: {
        include: {
          stream: {
            select: { id: true, name: true, streamType: true },
          },
        },
      },
      activeConnections: {
        include: {
          user: {
            select: { id: true, username: true },
          },
        },
      },
    },
  });

  if (!server) {
    return reply.status(404).send({ error: 'Server not found' });
  }

  // Get historical metrics from Redis
  const metrics = await redis.lrange(`server_metrics:${id}`, 0, 60);
  
  return {
    server,
    metrics: metrics.map(m => JSON.parse(m)),
    activeStreams: server.streamAssignments.filter(sa => sa.isActive),
    connections: server.activeConnections,
  };
});

// Force rebalance
fastify.post('/admin/servers/rebalance', async (request, reply) => {
  const distributor = new StreamDistributor();
  await distributor.rebalanceAll();
  return { success: true, message: 'Rebalance initiated' };
});

// Enable/disable server
fastify.put('/admin/servers/:id/status', async (request, reply) => {
  const { id } = request.params;
  const { status } = request.body;

  const server = await prisma.server.update({
    where: { id: parseInt(id) },
    data: { status },
  });

  // If taking offline, migrate streams
  if (status === 'MAINTENANCE' || status === 'OFFLINE') {
    const distributor = new StreamDistributor();
    const assignments = await prisma.serverStream.findMany({
      where: { serverId: parseInt(id), isActive: true },
    });

    for (const assignment of assignments) {
      // Find alternative server
      const alternative = await prisma.serverStream.findFirst({
        where: {
          streamId: assignment.streamId,
          serverId: { not: parseInt(id) },
          server: { status: 'ONLINE' },
        },
      });

      if (alternative) {
        await distributor.migrateStream(
          assignment.streamId,
          parseInt(id),
          alternative.serverId
        );
      }
    }
  }

  return server;
});

// Load balancer rules management
fastify.get('/admin/lb-rules', async () => {
  return prisma.loadBalancerRule.findMany({
    orderBy: { priority: 'asc' },
  });
});

fastify.post('/admin/lb-rules', async (request, reply) => {
  const rule = await prisma.loadBalancerRule.create({
    data: request.body,
  });
  return rule;
});

fastify.delete('/admin/lb-rules/:id', async (request, reply) => {
  await prisma.loadBalancerRule.delete({
    where: { id: parseInt(request.params.id) },
  });
  return { success: true };
});
```

---

## NGINX LOAD BALANCER CONFIG

```nginx
# /etc/nginx/nginx.conf - Main load balancer

upstream edge_servers {
    least_conn;  # or ip_hash for sticky sessions
    
    server 10.0.1.10:80 weight=100 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:80 weight=100 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:80 weight=100 max_fails=3 fail_timeout=30s;
    server 10.0.1.13:80 weight=80 max_fails=3 fail_timeout=30s;  # Lower weight
    server 10.0.1.14:80 backup;  # Only used when others are down
    
    keepalive 64;
}

upstream edge_servers_hls {
    # Sticky sessions for HLS (same server for all segments)
    ip_hash;
    
    server 10.0.1.10:80 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:80 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:80 max_fails=3 fail_timeout=30s;
}

# Stream rate limiting
limit_req_zone $binary_remote_addr zone=stream_limit:10m rate=30r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

server {
    listen 80;
    listen 443 ssl http2;
    server_name stream.example.com;
    
    ssl_certificate /etc/nginx/certs/stream.crt;
    ssl_certificate_key /etc/nginx/certs/stream.key;
    
    # Optimizations for streaming
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    
    # Buffers
    proxy_buffering off;
    proxy_buffer_size 4k;
    
    # Timeouts
    proxy_connect_timeout 5s;
    proxy_read_timeout 300s;
    
    # Live streams (TS format)
    location ~ ^/([^/]+)/([^/]+)/(\d+)\.(ts|mpegts)$ {
        limit_req zone=stream_limit burst=50 nodelay;
        limit_conn conn_limit 5;
        
        proxy_pass http://edge_servers;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        
        # Disable buffering for live streams
        proxy_buffering off;
    }
    
    # HLS streams
    location ~ ^/([^/]+)/([^/]+)/(\d+)\.m3u8$ {
        limit_req zone=stream_limit burst=20 nodelay;
        
        proxy_pass http://edge_servers_hls;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        
        # Allow caching of playlists briefly
        proxy_cache_valid 200 1s;
    }
    
    # HLS segments
    location ~ ^/hlsr/([^/]+)/(\d+)/(.+\.ts)$ {
        limit_conn conn_limit 10;
        
        proxy_pass http://edge_servers_hls;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        # Cache segments longer
        proxy_cache_valid 200 60s;
    }
    
    # VOD streams (allow more connections)
    location ~ ^/movie/([^/]+)/([^/]+)/(\d+)\. {
        limit_conn conn_limit 3;
        
        proxy_pass http://edge_servers;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        # Enable byte-range requests for seeking
        proxy_set_header Range $http_range;
        proxy_set_header If-Range $http_if_range;
    }
    
    # API passthrough to main panel
    location /player_api.php {
        proxy_pass http://main_panel:3000/api/player;
        proxy_http_version 1.1;
    }
    
    location /get.php {
        proxy_pass http://main_panel:3000/api/playlist;
        proxy_http_version 1.1;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
```

---

## EDGE SERVER DEPLOYMENT SCRIPT

```bash
#!/bin/bash
# deploy-edge-server.sh - Automated edge server setup

set -e

# Configuration
MAIN_PANEL_URL="${MAIN_PANEL_URL:-https://panel.example.com}"
SERVER_NAME="${SERVER_NAME:-edge-$(hostname)}"
REGION="${REGION:-default}"

echo "=== IPTV Edge Server Deployment ==="

# Install dependencies
apt-get update
apt-get install -y nodejs npm nginx ffmpeg redis-tools

# Install PM2
npm install -g pm2

# Create directories
mkdir -p /opt/iptv-edge
mkdir -p /var/log/iptv
mkdir -p /tmp/hls-segments

# Clone edge server code
git clone https://github.com/your-repo/iptv-edge-server.git /opt/iptv-edge
cd /opt/iptv-edge
npm install
npm run build

# Generate server registration
echo "Registering with main panel..."
RESPONSE=$(curl -s -X POST "${MAIN_PANEL_URL}/api/servers/register" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${SERVER_NAME}\",
    \"type\": \"EDGE_STREAMER\",
    \"externalIp\": \"$(curl -s ifconfig.me)\",
    \"internalIp\": \"$(hostname -I | awk '{print $1}')\",
    \"region\": \"${REGION}\",
    \"maxBandwidthMbps\": 10000,
    \"maxConnections\": 5000
  }")

SERVER_ID=$(echo $RESPONSE | jq -r '.server.id')
API_KEY=$(echo $RESPONSE | jq -r '.apiKey')

# Save configuration
cat > /opt/iptv-edge/.env << EOF
SERVER_ID=${SERVER_ID}
SERVER_NAME=${SERVER_NAME}
API_KEY=${API_KEY}
MAIN_PANEL_URL=${MAIN_PANEL_URL}
HEARTBEAT_INTERVAL=10000
PORT=8080
HLS_SEGMENT_PATH=/tmp/hls-segments
EOF

# Configure PM2
cat > /opt/iptv-edge/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'iptv-edge',
    script: 'dist/server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
EOF

# Start service
cd /opt/iptv-edge
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# Configure Nginx
cat > /etc/nginx/sites-available/iptv-edge << 'EOF'
server {
    listen 80;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
    }
    
    location /segments/ {
        alias /tmp/hls-segments/;
        add_header Cache-Control "max-age=60";
    }
}
EOF

ln -sf /etc/nginx/sites-available/iptv-edge /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx

echo "=== Edge Server Deployed ==="
echo "Server ID: ${SERVER_ID}"
echo "Server Name: ${SERVER_NAME}"
echo "Status: Check ${MAIN_PANEL_URL}/admin/servers/${SERVER_ID}"
```

---

## SUMMARY

This multi-server architecture provides:

| Feature | Benefit |
|---------|---------|
| **Geographic Distribution** | Lower latency for users worldwide |
| **Automatic Load Balancing** | Distribute connections across servers |
| **Stream Replication** | Redundancy and failover |
| **Dynamic Scaling** | Add/remove edge servers on demand |
| **Health Monitoring** | Automatic failover on server issues |
| **Bandwidth Aggregation** | Combine capacity of multiple servers |
| **Smart Routing** | Route users to optimal server |

Want me to expand on any specific area, such as:
- **RTMP ingest** from encoders to edge servers
- **CDN integration** (CloudFlare, Bunny, etc.)
- **Kubernetes deployment** for auto-scaling
- **Monitoring dashboards** (Grafana/Prometheus)
- **Geographic DNS routing** (Route53, Cloudflare)?





---
Powered by [Claude Exporter](https://www.claudexporter.com)