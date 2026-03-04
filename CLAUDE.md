# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an **Xtream Codes-compatible IPTV streaming server** built with Node.js, TypeScript, and Fastify. It provides live streaming, VOD, TV series, EPG, multi-server load balancing, and TMDB metadata integration.

**Tech Stack:**
- Runtime: Node.js 20+ with TypeScript (ES Modules)
- Framework: Fastify 4.x
- Database: PostgreSQL with Prisma ORM
- Cache: Redis (ioredis)
- Streaming: FFmpeg (fluent-ffmpeg)
- Frontend: Next.js 16 with React 19 (separate admin panel)

**Key Domain Concepts:**
- `User` = Admin/Reseller (manages system via JWT auth)
- `IptvLine` = Subscriber account (streams via Xtream API username/password)
- `Stream` = Live/VOD/Series content with transcoding profiles
- `Bouquet` = Channel package assigned to IptvLines

**Infrastructure (Proxmox VE Cluster):**
| Node | IP | Domain | Role |
|------|-----|--------|------|
| s01 (local) | 147.135.138.57 | s01.zz00.org | Main panel (LXC 102=backend, LXC 103=frontend) |
| s02 | 141.94.29.14 | s02.zz00.org | Edge streamer |
| s03 | 141.94.29.16 | s03.zz00.org | Edge streamer |
| s04 | 141.94.161.231 | s04.zz00.org | Edge streamer |

Use `pct list` on each Proxmox node to list LXC containers.

## Common Development Commands

### Backend (iptv-server/)

```bash
# Development
npm run dev                    # Start dev server with tsx watch

# Database
npm run db:generate            # Generate Prisma client after schema changes
npm run db:migrate             # Run migrations (dev)
npm run db:push                # Push schema without migration
npm run db:seed                # Seed database with sample data

# Production
npm run build                  # Compile TypeScript to dist/
npm start                      # Run compiled code

# Testing
npm test                       # Run vitest tests
npm run lint                   # Run ESLint
```

### Frontend (iptv-frontend/)

```bash
npm run dev                    # Next.js dev server (port 3000)
npm run build                  # Production build
npm start                      # Start production server
npm run lint                   # Run ESLint
```

### Docker / Makefile (from project root)

```bash
make dev                       # Start Postgres + Redis for local dev
make dev-down                  # Stop dev infrastructure
make up                        # Start full production stack
make down                      # Stop all services
make logs-backend              # Tail backend logs
make logs-frontend             # Tail frontend logs
make setup                     # Run migrations + seed
make db-shell                  # PostgreSQL interactive shell
make clean                     # Remove containers and volumes
```

## Architecture Overview

### Multi-Server Architecture

The system supports distributed deployment:
- **Main Server (Panel)**: Database, API orchestration, user management, admin panel
- **Load Balancer**: Traffic routing, health checks, geographic routing
- **Edge Streamers**: Stream proxying, transcoding, direct client connections

Servers self-register via heartbeat system. Load balancing uses geographic proximity, server load, and bandwidth availability.

### Streaming Modes

1. **Always-On Streams**: Continuously running FFmpeg processes for popular channels
   - Health monitoring (audio/video/process checks)
   - Automatic restart on failures
   - Managed by `AlwaysOnStreamManager` (src/services/streaming/)

2. **On-Demand Streams**: Started when first viewer connects
   - Auto-cleanup after idle timeout
   - Managed by `OnDemandStreamManager`

3. **ABR (Adaptive Bitrate)**: Multi-quality HLS streams
   - Multiple renditions (360p, 720p, 1080p, etc.)
   - Client-side quality switching
   - Managed by `AbrStreamManager`

4. **Passthrough HLS**: Direct proxy of source HLS streams without transcoding

### Transcoding System

**Hardware Acceleration Support:**
- NVENC (NVIDIA GPUs) - preferred for high-throughput
- QSV (Intel Quick Sync)
- VAAPI (AMD/Intel VA-API)
- Software fallback (libx264/libx265)

**Profile System:**
- `TranscodingProfile` model defines encoding parameters
- Server capabilities tracked (`hasNvenc`, `nvencMaxSessions`, etc.)
- Automatic server selection based on GPU availability and load

**Key Files:**
- `src/services/streaming/VodTranscoder.ts` - VOD transcoding
- `src/services/streaming/HLSSegmenter.ts` - HLS live segmentation
- `src/services/streaming/AbrStreamManager.ts` - Multi-bitrate encoding

### Database Schema (Prisma)

**Core Models:**
- `User` - Admins, resellers (system operators with JWT auth)
- `IptvLine` - Subscriber accounts (end-users streaming via Xtream API)
- `Stream` - Live/VOD/Series streams with source URLs, transcoding profiles
- `Category` - Hierarchical categories per stream type
- `Series`, `Episode` - TV series hierarchy
- `Bouquet` - Channel packages assigned to IptvLines
- `Server` - Multi-server infrastructure
- `TranscodingProfile`, `AbrProfile` - Encoding configurations
- `EpgEntry`, `EpgSource`, `EpgChannel` - Electronic Program Guide
- `SystemLog` - Database logging for all operations

**Important Relations:**
- IptvLines have many Bouquets (via `LineBouquet`)
- Streams belong to Categories and Bouquets (via `BouquetStream`)
- Streams assigned to Servers (via `ServerStream`, `StreamServerDistribution`)
- Streams can use TranscodingProfile or AbrProfile
- IptvLine connections tracked via `LineConnection`

### Xtream Codes API Compatibility

**Player API Endpoints** (src/api/routes/player.ts):
```
GET /player_api.php?username=X&password=X&action=...
```

**Actions:**
- `get_live_categories`, `get_live_streams`
- `get_vod_categories`, `get_vod_streams`, `get_vod_info`
- `get_series_categories`, `get_series`, `get_series_info`
- `get_short_epg` (EPG data)

**Streaming URLs:**
- Live: `/:username/:password/:streamId.ts` or `.m3u8`
- VOD: `/movie/:username/:password/:vodId.mp4`
- Series: `/series/:username/:password/:episodeId.mp4`
- HLS: `/hls/:streamId/master.m3u8`, `/hls/:streamId/:quality/playlist.m3u8`
- ABR: `/hls-abr/:streamId/master.m3u8`

### TMDB Integration

**Automatic Metadata Sync** (src/services/tmdb/):
- `TmdbMovieService.ts` - Movie search and metadata
- `TmdbTvService.ts` - TV series, seasons, episodes
- `TmdbMetadataSync.ts` - Auto-matching and syncing
- `TmdbSyncWorker.ts` - Background cron jobs

**Sync Strategy:**
- Auto-match by title/year or IMDb ID
- Hourly sync for pending content
- Weekly full refresh
- Daily outdated content refresh (30+ days old)

**Admin Endpoints:**
- `POST /admin/tmdb/search/movie` - Search TMDB
- `POST /admin/streams/:id/tmdb-link` - Manual linking
- `POST /admin/tmdb/sync/pending` - Trigger sync

## Key Patterns and Conventions

### ES Modules (Important!)
All TypeScript uses ES modules syntax:
- Import paths MUST include `.js` extension (even for `.ts` files): `import { foo } from './bar.js'`
- Use `import` not `require`
- `__dirname` requires: `import { fileURLToPath } from 'url'; const __dirname = path.dirname(fileURLToPath(import.meta.url));`

### Authentication Flow
1. **Xtream API (IptvLine)**: Query params `?username=X&password=X` → `authenticateIptvLine` middleware
2. **Admin API**: `X-API-Key` header or JWT Bearer token → `authenticateAdmin` middleware
3. Middleware: `src/api/middlewares/auth.ts`
4. Auth cache: Redis with 5-min TTL via `cache.KEYS.LINE_AUTH()`

### Stream Lifecycle Management

**Stream Status** (enum `StreamStatus`):
- `STOPPED` → `STARTING` → `RUNNING` → `STOPPING` → `STOPPED`
- `ERROR` state for failures
- Stored in `Stream.streamStatus`

**FFmpeg Process Tracking:**
- `Stream.ffmpegPid` - Process ID
- `Stream.runningServerId` - Server where running
- `Stream.lastStartedAt`, `Stream.lastStoppedAt` - Timestamps
- `Stream.lastError` - Error message

**Health Monitoring:**
- `StreamHealthMonitor` checks source URLs every minute
- `AlwaysOnHealthMonitor` checks audio/video/process health for always-on streams
- Automatic failover to backup URLs on source failure

### Logging Strategy

**Dual Logging:**
1. **Pino Logger** (stdout) - Real-time console logs
   - Dev: Pretty printed via pino-pretty
   - Prod: JSON format

2. **Database Logger** (`SystemLog` model) - Persistent structured logs
   - Service: `src/services/logging/DatabaseLogger.ts`
   - Auto-cleanup job (deletes logs older than 30 days)
   - Queryable via admin API

**Log Levels:** DEBUG, INFO, WARNING, ERROR, CRITICAL

### FFmpeg Command Building

Always use the builder pattern from existing services:
- Check `VodTranscoder.ts` for transcoding commands
- Check `HLSSegmenter.ts` for HLS segmentation
- Check `AbrStreamManager.ts` for multi-bitrate encoding

**Hardware Acceleration Detection:**
```typescript
if (server.hasNvenc && profile.nvencEnabled) {
  args.push('-c:v', 'h264_nvenc', '-preset', profile.nvencPreset);
} else if (server.hasQsv && profile.qsvEnabled) {
  args.push('-c:v', 'h264_qsv');
} else {
  args.push('-c:v', 'libx264', '-preset', profile.videoPreset);
}
```

## Service Organization

**Core Services** (src/services/):
- `streaming/` - Stream management, transcoding, HLS, ABR, proxying
- `epg/` - EPG import (XMLTV) and generation
- `playlist/` - M3U/M3U8 playlist generation
- `loadbalancer/` - Server routing and distribution
- `tmdb/` - TMDB API integration and sync
- `monitoring/` - Health checks and metrics
- `settings/` - System settings management
- `logging/` - Database logging service

**Workers** (src/workers/):
- `TmdbSyncWorker.ts` - Background TMDB metadata sync

## Configuration

**Environment Variables** (.env.example):
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `FFMPEG_PATH` - Path to FFmpeg binary
- `HLS_SEGMENT_PATH` - Temp directory for HLS segments
- `SERVER_URL`, `SERVER_PORT` - Base URL for API responses
- `TMDB_API_KEY` - TMDB API key (optional)
- `LOG_LEVEL` - Logging level (debug, info, warn, error)

**System Settings** (`SystemSettings` model):
- Runtime configuration stored in database
- Managed via `SettingsService`
- Admin API: `/admin/settings`

## Testing Strategy

**Unit Tests** (Vitest):
- Service layer tests
- Utility function tests
- Run with `npm test`

**Test Credentials** (after `npm run db:seed`):
- admin/admin123 - Full admin access
- test/test123 - Full package subscriber
- basic/basic123 - Basic package (trial)

**Manual Testing:**
- VLC player for stream testing
- IPTV apps (TiviMate, Perfect Player) for Xtream Codes compatibility
- Admin API testing: Include `X-API-Key: admin-secret-key` header

## Common Development Tasks

### Adding a New Transcoding Profile

1. Use Admin API: `POST /admin/transcoding/profiles`
2. Or insert via Prisma:
   ```typescript
   await prisma.transcodingProfile.create({
     data: {
       name: 'h264_720p_nvenc',
       encodingMode: 'NVENC',
       videoCodec: 'h264',
       resolutionWidth: 1280,
       resolutionHeight: 720,
       videoBitrate: 2500,
       nvencEnabled: true,
       nvencPreset: 'p4',
       // ... other fields
     }
   });
   ```

### Adding a New Server

1. Register via API: `POST /admin/servers`
2. Server must send heartbeat: `POST /api/servers/:id/heartbeat` (with `X-Server-Key`)
3. Server agent template in documentation (see "Xtream Codes IPTV.md")

### Syncing TMDB Metadata

**Auto-sync:**
- New VOD/Series automatically marked as `PENDING`
- Hourly worker syncs pending content

**Manual sync:**
```bash
# Via API
curl -X POST http://localhost:3000/admin/tmdb/sync/pending

# Or trigger for specific stream
curl -X POST http://localhost:3000/admin/streams/:id/tmdb-link -d '{"tmdbId": 550}'
```

### Debugging Stream Issues

1. Check `SystemLog` table for stream-specific errors
2. Check FFmpeg process: `Stream.ffmpegPid`, `Stream.streamStatus`
3. Test source URL directly: `curl -I <sourceUrl>`
4. Check server health: `GET /admin/servers/:id/stats`
5. Monitor HLS segments: Check `HLS_SEGMENT_PATH` directory

## Important Notes

### Rate Limiting
- Streaming routes (`/hls/`, `/live/`, `/movie/`, `/series/`) are **excluded** from rate limiting
- API routes limited to 100 req/min per user/IP

### Connection Management
- Max connections per IptvLine enforced via `IptvLine.maxConnections`
- Active connections tracked in `LineConnection` model
- Redis used for real-time connection counting

### Security Considerations
- Never commit `.env` files
- API keys stored in `Server.apiKey` (UUID)
- Password hashing: Currently plain text (TODO: bcrypt in production)
- CORS enabled for streaming (cross-origin required)
- Helmet CSP disabled for video playback

### Performance Optimization
- Redis caching for user auth (5 min), categories (10 min), EPG (30 min)
- Database connection pooling via Prisma
- Streaming uses `proxy_buffering off` in nginx
- HLS segments auto-deleted after playlist removal

## Frontend Architecture (iptv-frontend/)

**Framework:** Next.js 16 App Router with React 19

**Key Libraries:**
- Radix UI - Accessible component primitives
- TanStack Query - Data fetching and caching
- React Hook Form + Zod - Form validation
- Zustand - Client state management
- HLS.js & Video.js - Video playback
- Recharts - Charts and analytics

**Structure:**
- `src/app/` - Next.js app router pages
- `src/components/` - Reusable React components
- `src/lib/` - Utilities and API clients

## Documentation References

Additional documentation available in root directory:
- `Xtream Codes IPTV.md` - Detailed Xtream Codes API implementation guide with multi-server architecture
- `TMDB integration.md` - Complete TMDB integration specification with code examples

## Common Pitfalls

1. **Missing .js extension** - ES modules require explicit extensions in imports
2. **User vs IptvLine confusion** - Users are admins/resellers, IptvLines are subscribers
3. **Rate limiting** - Streaming routes (`/hls/`, `/live/`) are excluded; API routes are limited
4. **Connection limits** - Tracked per IptvLine via Redis + `LineConnection` table
5. **CORS for streaming** - CSP disabled for video playback in Helmet config

## Troubleshooting

**"Connection reset by peer" errors:**
- Increase `keepAliveTimeout` in Fastify config (currently 72s)
- Check nginx/ALB timeout settings

**FFmpeg process not stopping:**
- Check `Stream.ffmpegPid` and manually kill if needed
- Verify graceful shutdown handlers in `server.ts`

**TMDB sync not working:**
- Verify `TMDB_API_KEY` in environment
- Check `TmdbSyncLog` table for error details
- Rate limit: 40 requests per 10 seconds

**HLS playback stuttering:**
- Check segment duration (default 4s in AbrProfile)
- Verify server CPU/GPU utilization
- Test with `ffprobe` for source stream issues