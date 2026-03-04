# IPTV System Deployment Guide

Complete guide for deploying the Xtream Codes compatible IPTV system with multi-server architecture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Main Panel Setup](#main-panel-setup)
4. [Adding Edge Servers](#adding-edge-servers)
5. [FFmpeg Configuration](#ffmpeg-configuration)
6. [Load Balancing](#load-balancing)
7. [Transcoding Profiles](#transcoding-profiles)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
                                    ┌─────────────────┐
                                    │   CDN/Nginx     │
                                    │  (Optional)     │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
           ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
           │  Edge Server  │        │  Edge Server  │        │  Edge Server  │
           │   (GPU/CPU)   │        │   (GPU/CPU)   │        │   (GPU/CPU)   │
           │  EU-EDGE-01   │        │  US-EDGE-01   │        │  AS-EDGE-01   │
           └───────┬───────┘        └───────┬───────┘        └───────┬───────┘
                   │                        │                        │
                   └────────────────────────┼────────────────────────┘
                                            │
                                   ┌────────┴────────┐
                                   │   Main Panel    │
                                   │  (Admin + API)  │
                                   ├─────────────────┤
                                   │   PostgreSQL    │
                                   │     Redis       │
                                   └─────────────────┘
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    │                       │                       │
                    ▼                       ▼                       ▼
           ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
           │ Stream Source │       │ Stream Source │       │  VOD Storage  │
           │   (Live TV)   │       │    (Radio)    │       │   (Movies)    │
           └───────────────┘       └───────────────┘       └───────────────┘
```

### Components

| Component | Description | Port |
|-----------|-------------|------|
| **Main Panel** | Admin interface, API, user management, load balancing | 3000 (web), 3001 (API) |
| **Edge Server** | Stream distribution, transcoding, HLS segmentation | 3001, 1935 (RTMP) |
| **PostgreSQL** | User data, streams, configurations | 5432/5434 |
| **Redis** | Caching, session management, real-time data | 6379 |

---

## Prerequisites

### Main Panel Server
- **OS**: Ubuntu 22.04 LTS (recommended)
- **CPU**: 4+ cores
- **RAM**: 8GB minimum
- **Storage**: 50GB+ SSD
- **Network**: 1Gbps+

### Edge Server (GPU)
- **OS**: Ubuntu 22.04 LTS
- **CPU**: 4+ cores
- **RAM**: 8GB minimum
- **GPU**: NVIDIA GTX 1050+ / RTX series
- **NVIDIA Driver**: 470+
- **Storage**: 100GB+ SSD
- **Network**: 1-10Gbps

### Edge Server (CPU Only)
- **OS**: Ubuntu 22.04 LTS
- **CPU**: 8+ cores (more is better for transcoding)
- **RAM**: 16GB minimum
- **Storage**: 100GB+ SSD
- **Network**: 1-10Gbps

---

## Main Panel Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/your-repo/xtream-iptv.git /opt/iptv
cd /opt/iptv
```

### Step 2: Configure Environment

```bash
# Create environment file
cp .env.example .env

# Edit configuration
nano .env
```

**Required Settings:**

```env
# Database
DATABASE_URL=postgresql://iptv:your_secure_password@localhost:5434/iptv_db

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters
ADMIN_API_KEY=your-admin-api-key-for-frontend

# TMDB (for VOD metadata)
TMDB_API_KEY=your-tmdb-api-key

# Server URLs (update for production)
SERVER_URL=https://your-domain.com
SERVER_PORT=3001
```

### Step 3: Start with Docker

```bash
# Build and start all services
docker-compose up -d

# Run database migrations
docker-compose exec -T backend npx prisma migrate deploy

# Seed initial data
docker-compose exec -T backend npx prisma db seed

# Check status
docker-compose ps
```

### Step 4: Access Admin Panel

- **URL**: `http://your-server-ip:3000`
- **Default Login**: `admin` / `admin123`

> ⚠️ **Important**: Change the default password immediately!

---

## Adding Edge Servers

### Option A: Deploy with Docker (Recommended)

#### For Servers WITH NVIDIA GPU:

1. **Prepare the edge server:**
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

2. **Copy deployment files:**
```bash
# On main panel server
scp -r /opt/iptv/ffmpeg-build root@edge-server:/opt/iptv/
scp -r /opt/iptv/iptv-server root@edge-server:/opt/iptv/
```

3. **Configure and start:**
```bash
# On edge server
cd /opt/iptv

# Create environment file
cat > .env << EOF
SERVER_NAME=eu-edge-01
SERVER_TYPE=EDGE
EXTERNAL_IP=$(curl -s ifconfig.me)
INTERNAL_IP=0.0.0.0
MAX_CONNECTIONS=5000

# Connection to Main Panel
MAIN_PANEL_URL=http://main-panel-ip:3001
DATABASE_URL=postgresql://iptv:password@main-panel-ip:5434/iptv_db
JWT_SECRET=same-as-main-panel
REDIS_URL=redis://main-panel-ip:6379
EOF

# Start edge server
docker-compose -f ffmpeg-build/docker-compose.edge.yml up -d
```

#### For Servers WITHOUT GPU (CPU Only):

```bash
# Same preparation steps, but use CPU compose file
docker-compose -f ffmpeg-build/docker-compose.edge-cpu.yml up -d
```

### Option B: Automated Deployment Script

```bash
# From main panel server
cd /opt/iptv/ffmpeg-build

./deploy-edge-server.sh 192.168.1.100 \
    --name eu-edge-01 \
    --external-ip 203.0.113.50 \
    --main-panel http://main-panel:3001 \
    --api-key your-server-api-key \
    --max-conn 5000
```

### Option C: Manual Binary Installation

1. **Build FFmpeg package:**
```bash
# On build server
cd /opt/iptv/ffmpeg-build

# For GPU servers
./build.sh gpu

# For CPU-only servers
./build.sh cpu
```

2. **Deploy to edge server:**
```bash
# Copy package
scp dist/ffmpeg-cpu-6.1.1.tar.gz root@edge-server:/tmp/

# On edge server
cd /tmp
tar -xzf ffmpeg-cpu-6.1.1.tar.gz
./deploy-ffmpeg.sh
```

---

### Register Edge Server in Admin Panel

After deploying an edge server, register it in the main panel:

#### Via Admin UI:

1. Login to Admin Panel
2. Go to **Servers** → **Add Server**
3. Fill in details:
   - **Name**: `eu-edge-01`
   - **Type**: `EDGE`
   - **External IP**: `203.0.113.50`
   - **Internal IP**: `10.0.0.50` (if different)
   - **HTTP Port**: `3001`
   - **Max Connections**: `5000`
4. Click **Save**

#### Via API:

```bash
curl -X POST http://main-panel:3001/admin/servers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "name": "eu-edge-01",
    "type": "EDGE",
    "externalIp": "203.0.113.50",
    "internalIp": "10.0.0.50",
    "httpPort": 3001,
    "maxConnections": 5000
  }'
```

---

## FFmpeg Configuration

### Transcoding Presets

The system supports multiple transcoding presets for different scenarios:

#### GPU Presets (NVIDIA NVENC)

| Preset | Use Case | Settings |
|--------|----------|----------|
| `nvenc_fast` | Live streaming | `-c:v h264_nvenc -preset p4 -tune ll` |
| `nvenc_hq` | VOD/Archive | `-c:v h264_nvenc -preset p6 -tune hq` |
| `nvenc_4k` | 4K content | `-c:v hevc_nvenc -preset p4` |

#### CPU Presets (x264)

| Preset | Use Case | Settings |
|--------|----------|----------|
| `x264_ultrafast` | Real-time 4K | `-c:v libx264 -preset ultrafast` |
| `x264_fast` | Live streaming | `-c:v libx264 -preset veryfast -tune zerolatency` |
| `x264_quality` | VOD encoding | `-c:v libx264 -preset medium -crf 20` |

### Environment Variables

```env
# FFmpeg paths
FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
FFPROBE_PATH=/opt/ffmpeg/bin/ffprobe

# Default codecs
DEFAULT_VIDEO_CODEC=libx264          # or h264_nvenc for GPU
DEFAULT_AUDIO_CODEC=aac

# x264 settings (CPU)
X264_PRESET=veryfast
X264_CRF=23
X264_TUNE=zerolatency

# NVENC settings (GPU)
NVENC_PRESET=p4
NVENC_TUNE=ll

# Threading
FFMPEG_THREADS=0                      # 0 = auto-detect
```

---

## Load Balancing

### Load Balancing Strategies

The system supports multiple load balancing strategies:

| Strategy | Description | Best For |
|----------|-------------|----------|
| `round_robin` | Distribute evenly across servers | General use |
| `least_connections` | Send to server with fewest connections | Uneven load |
| `least_bandwidth` | Send to server with lowest bandwidth usage | Bandwidth-sensitive |
| `geographic` | Route to nearest server by region | Global deployment |
| `weighted` | Custom weights per server | Mixed hardware |

### Configure Load Balancing

#### Via Admin UI:

1. Go to **Settings** → **Load Balancer**
2. Select strategy
3. Configure weights (if using weighted)
4. Save

#### Via API:

```bash
# Set load balancing strategy
curl -X POST http://main-panel:3001/admin/servers/load-balancer/config \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "strategy": "least_connections",
    "healthCheckInterval": 30,
    "failoverThreshold": 3
  }'
```

### Geographic Load Balancing

For geographic routing, assign regions to servers:

```bash
curl -X PUT http://main-panel:3001/admin/servers/1 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "region": "EU",
    "country": "DE",
    "latitude": 50.1109,
    "longitude": 8.6821
  }'
```

---

## Transcoding Profiles

### Creating Custom Profiles

Create transcoding profiles for different quality levels:

```bash
curl -X POST http://main-panel:3001/admin/transcoding-profiles \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "name": "1080p_high",
    "description": "1080p High Quality",
    "videoCodec": "libx264",
    "videoBitrate": "5000k",
    "videoWidth": 1920,
    "videoHeight": 1080,
    "audioCodec": "aac",
    "audioBitrate": "192k",
    "preset": "veryfast",
    "extraParams": "-tune zerolatency"
  }'
```

### Preset Profiles

| Profile | Resolution | Video Bitrate | Audio | Use Case |
|---------|------------|---------------|-------|----------|
| `4k_ultra` | 3840x2160 | 15-25 Mbps | 256k AAC | Premium 4K |
| `1080p_high` | 1920x1080 | 5-8 Mbps | 192k AAC | HD Quality |
| `1080p_std` | 1920x1080 | 3-5 Mbps | 128k AAC | Standard HD |
| `720p` | 1280x720 | 2-3 Mbps | 128k AAC | Mobile/Tablet |
| `480p` | 854x480 | 1-1.5 Mbps | 96k AAC | Low bandwidth |
| `audio_only` | - | - | 128k AAC | Radio streams |

### Assigning Profiles to Streams

```bash
# Assign transcoding profile to a stream
curl -X PUT http://main-panel:3001/admin/streams/123 \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "transcodeProfile": "1080p_high"
  }'
```

---

## Monitoring & Maintenance

### Health Checks

The system performs automatic health checks on all servers:

```bash
# Check server health
curl http://edge-server:3001/health

# Response:
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "uptime": 86400,
  "connections": 1234,
  "cpu": 45.2,
  "memory": 62.1,
  "bandwidth": "2.5 Gbps"
}
```

### Viewing Server Metrics

```bash
# Get detailed server metrics
curl http://main-panel:3001/admin/servers/1/metrics \
  -H "X-API-Key: your-admin-api-key"
```

### Log Management

```bash
# View edge server logs
docker-compose -f docker-compose.edge.yml logs -f

# View specific service logs
docker-compose logs -f edge-server

# Tail last 100 lines
docker-compose logs --tail=100 edge-server
```

### Maintenance Mode

Put a server in maintenance mode to gracefully drain connections:

```bash
curl -X POST http://main-panel:3001/admin/servers/1/maintenance \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{"enabled": true}'
```

### Backup & Recovery

```bash
# Backup database
docker-compose exec -T postgres pg_dump -U iptv iptv_db > backup.sql

# Restore database
docker-compose exec -T postgres psql -U iptv iptv_db < backup.sql
```

---

## Troubleshooting

### Common Issues

#### Edge Server Not Connecting

```bash
# Check if server can reach main panel
curl http://main-panel:3001/health

# Check firewall
sudo ufw status
sudo ufw allow 3001/tcp

# Check Docker networking
docker network ls
docker network inspect iptv-network
```

#### Transcoding Failures

```bash
# Test FFmpeg directly
ffmpeg -i test_input.mp4 -c:v libx264 -preset veryfast test_output.mp4

# Check GPU availability (for NVIDIA)
nvidia-smi
docker run --gpus all nvidia/cuda:12.2.0-base nvidia-smi

# Check FFmpeg encoders
ffmpeg -encoders | grep -E "nvenc|264|265"
```

#### High CPU/Memory Usage

```bash
# Check container resources
docker stats

# Adjust resource limits in docker-compose
deploy:
  resources:
    limits:
      cpus: '4'
      memory: 8G
```

#### Stream Buffering

1. Check source stream quality
2. Reduce transcoding quality
3. Increase buffer size
4. Check network bandwidth between servers

```bash
# Test bandwidth between servers
iperf3 -c edge-server -p 5201
```

### Getting Help

- **Logs**: Always check logs first: `docker-compose logs -f`
- **Health**: Check `/health` endpoint on all servers
- **Metrics**: Monitor via Admin Panel → Dashboard
- **GitHub Issues**: Report bugs with full logs and configuration

---

## Quick Reference

### Essential Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# Restart specific service
docker-compose restart backend

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Run database migrations
docker-compose exec -T backend npx prisma migrate deploy

# Seed database
docker-compose exec -T backend npx prisma db seed

# Access database shell
docker-compose exec postgres psql -U iptv -d iptv_db
```

### Default Ports

| Service | Port | Protocol |
|---------|------|----------|
| Frontend | 3000 | HTTP |
| Backend API | 3001 | HTTP |
| PostgreSQL | 5434 | TCP |
| Redis | 6379 | TCP |
| RTMP | 1935 | TCP |
| Adminer | 8080 | HTTP |
| Redis Commander | 8081 | HTTP |

### Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| Admin Panel | admin | admin123 |
| PostgreSQL | iptv | iptv_secret |
| Adminer | iptv | iptv_secret |

> ⚠️ **Change all default credentials in production!**

