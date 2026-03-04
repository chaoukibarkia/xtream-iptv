# IPTV System Documentation

Welcome to the Xtream Codes compatible IPTV system documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [Deployment Guide](DEPLOYMENT.md) | Complete setup and configuration |
| [Edge Servers](EDGE-SERVERS.md) | Edge server architecture and setup |
| [FFmpeg Build](../ffmpeg-build/README.md) | Building FFmpeg with hardware acceleration |

## System Overview

This is a full-featured IPTV management system compatible with the Xtream Codes API. It supports:

- ✅ **Live TV Streaming** - HLS and MPEG-TS output
- ✅ **Video on Demand (VOD)** - Movies with TMDB metadata
- ✅ **TV Series** - Seasons and episodes management
- ✅ **User Management** - Subscriptions, connections, expiration
- ✅ **Multi-Server Architecture** - Main panel + edge servers
- ✅ **Hardware Transcoding** - NVIDIA NVENC/NVDEC support
- ✅ **Load Balancing** - Geographic, round-robin, least connections
- ✅ **EPG Support** - XMLTV import and management
- ✅ **Admin Panel** - Modern React-based web interface

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         IPTV System                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐       │
│   │  Frontend   │     │   Backend   │     │  Database   │       │
│   │  (Next.js)  │────▶│  (Fastify)  │────▶│ (PostgreSQL)│       │
│   │   :3000     │     │    :3001    │     │   :5434     │       │
│   └─────────────┘     └──────┬──────┘     └─────────────┘       │
│                              │                                   │
│                              ▼                                   │
│   ┌─────────────────────────────────────────────────────┐       │
│   │              Edge Servers (Distributed)              │       │
│   │  ┌─────────┐  ┌─────────┐  ┌─────────┐             │       │
│   │  │ Edge-01 │  │ Edge-02 │  │ Edge-03 │   ...       │       │
│   │  │  (GPU)  │  │  (CPU)  │  │  (GPU)  │             │       │
│   │  └─────────┘  └─────────┘  └─────────┘             │       │
│   └─────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Start Main Panel

```bash
cd /root/xtream
docker-compose up -d
docker-compose exec -T backend npx prisma migrate deploy
docker-compose exec -T backend npx prisma db seed
```

### 2. Access Admin Panel

- **URL**: http://localhost:3000
- **Login**: admin / admin123

### 3. Add Edge Server (Optional)

```bash
# On edge server
docker-compose -f ffmpeg-build/docker-compose.edge-cpu.yml up -d
```

## API Endpoints

### Player API (Xtream Codes Compatible)

```
GET /player_api.php?username=X&password=X
GET /player_api.php?username=X&password=X&action=get_live_categories
GET /player_api.php?username=X&password=X&action=get_live_streams
GET /player_api.php?username=X&password=X&action=get_vod_categories
GET /player_api.php?username=X&password=X&action=get_vod_streams
GET /player_api.php?username=X&password=X&action=get_series
```

### Streaming Endpoints

```
GET /{username}/{password}/{stream_id}.m3u8    # HLS Live
GET /{username}/{password}/{stream_id}.ts      # MPEG-TS Live
GET /movie/{username}/{password}/{vod_id}.mp4  # VOD
GET /series/{username}/{password}/{ep_id}.mp4  # Series
```

### Admin API

```
GET    /admin/users           # List users
POST   /admin/users           # Create user
GET    /admin/streams         # List streams
POST   /admin/streams         # Create stream
GET    /admin/servers         # List servers
POST   /admin/servers         # Add server
GET    /admin/stats/dashboard # Dashboard stats
```

## Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| Admin Panel | admin | admin123 |
| Database | iptv | iptv_secret |

⚠️ **Change all passwords in production!**

## Support

For issues and questions:
- Check the [Deployment Guide](DEPLOYMENT.md)
- Review [Edge Server Setup](EDGE-SERVERS.md)
- Check container logs: `docker-compose logs -f`

