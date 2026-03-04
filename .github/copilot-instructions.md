# Xtream Codes IPTV System - AI Coding Instructions

## Project Overview

Xtream Codes-compatible IPTV streaming server with multi-server architecture supporting live streaming, VOD, TV series, EPG, and TMDB metadata integration.

**Deployment (Main Panel - s01.zz00.org / 147.135.138.57):**
- Frontend (Next.js): Proxmox LXC container 103, port 3000
- Backend (Fastify): Proxmox LXC container 102, port 3001
- PostgreSQL: port 5434, Redis: port 6379

**Edge Servers (Proxmox VE nodes):**
| Node | IP | Domain | Role |
|------|-----|--------|------|
| s01 (local) | 147.135.138.57 | s01.zz00.org | Main panel + edge |
| s02 | 141.94.29.14 | s02.zz00.org | Edge streamer |
| s03 | 141.94.29.16 | s03.zz00.org | Edge streamer |
| s04 | 141.94.161.231 | s04.zz00.org | Edge streamer |

## Architecture

```
                      s01.zz00.org (Main Panel)
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   Backend   │────▶│ PostgreSQL  │
│  Next.js    │     │   Fastify   │     │   Prisma    │
│  LXC 103    │     │   LXC 102   │     │   + Redis   │
└─────────────┘     └──────┬──────┘     └─────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
   s02.zz00.org      s03.zz00.org      s04.zz00.org
   Edge Streamer     Edge Streamer     Edge Streamer
   (141.94.29.14)    (141.94.29.16)    (141.94.161.231)
```

**Key Domain Concepts:**
- `User` = Admin/Reseller (manages system via JWT auth)
- `IptvLine` = Subscriber account (streams via Xtream API username/password)
- `Stream` = Live/VOD/Series content with transcoding profiles
- `Bouquet` = Channel package assigned to lines

## Critical Conventions

### ES Modules (REQUIRED)
All TypeScript imports **MUST** include `.js` extension:
```typescript
// ✅ Correct
import { prisma } from './config/database.js';
import { cache } from './config/redis.js';

// ❌ Wrong - will fail at runtime
import { prisma } from './config/database';
```

For `__dirname` in ES modules:
```typescript
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
```

### Authentication Patterns
- **Xtream API (IptvLine)**: Query params `?username=X&password=X` → `authenticateIptvLine` middleware
- **Admin API**: `X-API-Key` header or JWT Bearer token → `authenticateAdmin` middleware
- Auth cache: Redis with 5-min TTL via `cache.KEYS.LINE_AUTH()`

### Database Access
Always use Prisma with proper relations:
```typescript
const stream = await prisma.stream.findUnique({
  where: { id: streamId },
  include: {
    category: true,
    transcodingProfile: true,
    abrProfile: true,
  },
});
```

## Development Commands

```bash
# Backend (iptv-server/)
npm run dev              # Dev server with tsx watch
npm run db:generate      # Generate Prisma client after schema changes
npm run db:migrate       # Run migrations
npm run db:seed          # Seed with test data (admin/admin123, test/test123)

# Frontend (iptv-frontend/)
npm run dev              # Next.js dev on port 3000

# Docker (root)
make dev                 # Start Postgres + Redis for local dev
make up                  # Full production stack
make logs-backend        # Tail backend logs
```

## Streaming Architecture

### Stream Modes
| Mode | Manager | Use Case |
|------|---------|----------|
| Always-On | `AlwaysOnStreamManager` | Popular channels, 24/7 FFmpeg |
| On-Demand | `OnDemandStreamManager` | Started on first viewer, auto-cleanup |
| ABR | `AbrStreamManager` | Multi-bitrate HLS (360p/720p/1080p) |
| Passthrough | Direct proxy | No transcoding, copy HLS |

### Hardware Acceleration Priority
1. NVENC (NVIDIA) - check `server.hasNvenc`
2. QSV (Intel) - check `server.hasQsv`  
3. VAAPI (AMD/Intel) - check `server.hasVaapi`
4. Software (libx264) - fallback

### Stream Status Lifecycle
`STOPPED` → `STARTING` → `RUNNING` → `STOPPING` → `STOPPED` (or `ERROR`)

## Key Files & Patterns

| Area | Key Files |
|------|-----------|
| Server entry | `iptv-server/src/server.ts` |
| Routes | `iptv-server/src/api/routes/*.ts` |
| Stream managers | `iptv-server/src/services/streaming/*.ts` |
| Prisma schema | `iptv-server/prisma/schema.prisma` |
| Config validation | `iptv-server/src/config/index.ts` (Zod) |
| Frontend API | `iptv-frontend/src/lib/api/` |

## API Endpoints Reference

**Player API (Xtream compatible):**
- `GET /player_api.php?username=X&password=X&action=get_live_streams`
- `GET /:username/:password/:streamId.m3u8` (HLS)
- `GET /movie/:username/:password/:vodId.mp4` (VOD)

**Admin API (requires X-API-Key):**
- `GET/POST /admin/streams`, `/admin/users`, `/admin/servers`
- `POST /admin/tmdb/sync/pending` - Trigger TMDB metadata sync

## Common Pitfalls

1. **Missing .js extension** - ES modules require explicit extensions
2. **User vs IptvLine confusion** - Users are admins, IptvLines are subscribers
3. **Rate limiting** - Streaming routes (`/hls/`, `/live/`) are excluded
4. **Connection limits** - Tracked per IptvLine via Redis + `LineConnection` table
5. **CORS for streaming** - CSP disabled for video playback in Helmet config

## Testing

- **Test credentials**: admin/admin123, test/test123 (after `npm run db:seed`)
- **Stream testing**: Use VLC or TiviMate with player_api.php endpoint
- **API testing**: Include `X-API-Key: admin-secret-key` header for admin endpoints
