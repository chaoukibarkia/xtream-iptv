# IPTV Server - Xtream Codes Compatible

A high-performance, Xtream Codes-compatible IPTV streaming server built with Node.js, TypeScript, and Fastify.

## Features

- ✅ **Xtream Codes API Compatibility** - Full `player_api.php` implementation
- ✅ **Live Streaming** - Proxy and transcode live streams
- ✅ **VOD Support** - Movies and TV series with metadata
- ✅ **M3U Playlist Generation** - M3U and M3U+ playlist formats
- ✅ **EPG Support** - XMLTV import and generation
- ✅ **User Management** - Users, bouquets, and connection limits
- ✅ **Multi-Server Architecture** - Load balancing and edge servers
- ✅ **HLS Segmentation** - Live HLS stream generation
- ✅ **Admin API** - Full content and user management

## Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Fastify
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis
- **Streaming**: FFmpeg
- **Language**: TypeScript

## Quick Start

### Using Docker (Recommended)

```bash
# Clone the repository
cd iptv-server

# Start all services
docker-compose up -d

# Run database migrations
docker-compose exec app npx prisma migrate deploy

# Seed the database with sample data
docker-compose exec app npm run db:seed
```

### Manual Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed database (optional)
npm run db:seed

# Start development server
npm run dev
```

## API Endpoints

### Player API (Xtream Codes Compatible)

```
GET /player_api.php?username=X&password=X                    # Auth + server info
GET /player_api.php?username=X&password=X&action=get_live_categories
GET /player_api.php?username=X&password=X&action=get_live_streams
GET /player_api.php?username=X&password=X&action=get_vod_categories
GET /player_api.php?username=X&password=X&action=get_vod_streams
GET /player_api.php?username=X&password=X&action=get_series_categories
GET /player_api.php?username=X&password=X&action=get_series
GET /player_api.php?username=X&password=X&action=get_series_info&series_id=X
GET /player_api.php?username=X&password=X&action=get_vod_info&vod_id=X
GET /player_api.php?username=X&password=X&action=get_short_epg&stream_id=X
```

### Streaming Endpoints

```
GET /:username/:password/:streamId.ts       # Live stream (MPEG-TS)
GET /:username/:password/:streamId.m3u8     # Live stream (HLS)
GET /movie/:username/:password/:vodId.mp4   # VOD stream
GET /series/:username/:password/:episodeId.mp4  # Series episode
```

### Playlist & EPG

```
GET /get.php?username=X&password=X&type=m3u_plus&output=ts  # M3U playlist
GET /xmltv.php?username=X&password=X                        # XMLTV EPG
```

### Admin API

All admin endpoints require `X-API-Key` header.

```
# Users
GET    /admin/users
POST   /admin/users
PUT    /admin/users/:id
DELETE /admin/users/:id

# Streams
GET    /admin/streams
POST   /admin/streams
PUT    /admin/streams/:id
DELETE /admin/streams/:id
POST   /admin/streams/:id/test

# Categories
GET    /admin/categories
POST   /admin/categories
PUT    /admin/categories/:id
DELETE /admin/categories/:id

# Bouquets
GET    /admin/bouquets
POST   /admin/bouquets
PUT    /admin/bouquets/:id
DELETE /admin/bouquets/:id

# EPG
GET    /admin/epg/sources
POST   /admin/epg/sources
POST   /admin/epg/import/:id

# Statistics
GET    /admin/stats/dashboard
GET    /admin/stats/connections
```

## Test Credentials

After running the seed script:

| User | Password | Access |
|------|----------|--------|
| admin | admin123 | Full access |
| test | test123 | Full package |
| basic | basic123 | Basic package (trial) |

## Configuration

Environment variables (`.env`):

```env
# Server
NODE_ENV=development
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/iptv_db

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-key-min-32-chars

# Server Info (for API responses)
SERVER_URL=http://localhost
SERVER_PORT=3000
SERVER_HTTPS_PORT=443
TIMEZONE=UTC

# FFmpeg
FFMPEG_PATH=/usr/bin/ffmpeg
HLS_SEGMENT_PATH=/tmp/hls-segments

# Logging
LOG_LEVEL=info
```

## Project Structure

```
iptv-server/
├── src/
│   ├── api/
│   │   ├── middlewares/
│   │   │   └── auth.ts          # Authentication middleware
│   │   └── routes/
│   │       ├── admin.ts         # Admin API routes
│   │       ├── epg.ts           # EPG routes
│   │       ├── player.ts        # Player API routes
│   │       ├── playlist.ts      # Playlist routes
│   │       └── streaming.ts     # Stream routes
│   ├── config/
│   │   ├── database.ts          # Prisma client
│   │   ├── index.ts             # Configuration
│   │   ├── logger.ts            # Pino logger
│   │   └── redis.ts             # Redis client
│   ├── services/
│   │   ├── epg/
│   │   │   ├── EpgGenerator.ts  # XMLTV generation
│   │   │   └── EpgImporter.ts   # EPG import
│   │   ├── loadbalancer/
│   │   │   ├── LoadBalancer.ts  # Load balancing
│   │   │   └── StreamDistributor.ts
│   │   ├── playlist/
│   │   │   └── M3UGenerator.ts  # M3U generation
│   │   └── streaming/
│   │       ├── HLSSegmenter.ts  # HLS segmentation
│   │       └── StreamProxy.ts   # Stream proxying
│   ├── types/
│   │   ├── stream.ts            # Stream types
│   │   └── user.ts              # User types
│   └── server.ts                # Main entry point
├── prisma/
│   ├── schema.prisma            # Database schema
│   └── seed.ts                  # Seed data
├── docker-compose.yml           # Docker Compose
├── Dockerfile                   # Production Dockerfile
└── package.json
```

## License

MIT
