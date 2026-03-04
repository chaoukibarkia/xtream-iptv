# Edge Server Architecture & Setup

Detailed guide for deploying and managing edge servers in the IPTV system.

## Table of Contents

1. [What is an Edge Server?](#what-is-an-edge-server)
2. [Edge Server Types](#edge-server-types)
3. [Deployment Options](#deployment-options)
4. [Step-by-Step Setup](#step-by-step-setup)
5. [Stream Distribution](#stream-distribution)
6. [Scaling Guidelines](#scaling-guidelines)
7. [Performance Tuning](#performance-tuning)

---

## What is an Edge Server?

Edge servers are distributed streaming nodes that:

- **Serve streams to end users** - Reduce load on the main panel
- **Perform transcoding** - Convert streams to different formats/qualities
- **Cache content** - Store HLS segments locally
- **Geographic distribution** - Serve users from nearby locations

### Data Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Stream     │     │    Main      │     │    Edge      │
│   Source     │────▶│    Panel     │────▶│   Server     │────▶ Users
│  (Origin)    │     │ (Controller) │     │ (Streamer)   │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            │ Stream assignment
                            │ Health monitoring
                            │ Load balancing
                            ▼
                     ┌──────────────┐
                     │   Database   │
                     │    Redis     │
                     └──────────────┘
```

---

## Edge Server Types

### GPU Edge Server (NVIDIA)

**Best for:**
- High-volume transcoding (20-50+ concurrent streams)
- 4K/HEVC content
- Low-latency requirements
- Cost-effective at scale

**Requirements:**
- NVIDIA GPU (GTX 1050+, RTX recommended)
- NVIDIA drivers 470+
- 8GB+ RAM
- 4+ CPU cores

**Capacity Estimates (RTX 3060):**
| Operation | Concurrent Streams |
|-----------|-------------------|
| 1080p pass-through | 100+ |
| 1080p transcoding | 30-40 |
| 4K transcoding | 10-15 |
| Multi-bitrate (3 qualities) | 15-20 sources |

### CPU Edge Server

**Best for:**
- Smaller deployments
- Budget constraints
- Cloud VPS (no GPU access)
- Geographic distribution (many small nodes)

**Requirements:**
- 8+ CPU cores (more is better)
- 16GB+ RAM
- Fast SSD storage

**Capacity Estimates (8-core Xeon):**
| Operation | Concurrent Streams |
|-----------|-------------------|
| 1080p pass-through | 50+ |
| 1080p transcoding | 4-8 |
| 720p transcoding | 8-15 |
| Audio only | 100+ |

---

## Deployment Options

### Option 1: Docker (Recommended)

Simplest deployment with all dependencies included.

```bash
# GPU Server
docker-compose -f docker-compose.edge.yml up -d

# CPU Server
docker-compose -f docker-compose.edge-cpu.yml up -d
```

### Option 2: Binary Installation

Deploy FFmpeg binaries directly on the host system.

```bash
# Build and deploy
./build.sh cpu  # or gpu
scp dist/ffmpeg-*.tar.gz edge-server:/opt/
ssh edge-server "cd /opt && tar -xzf ffmpeg-*.tar.gz && ./deploy-ffmpeg.sh"
```

### Option 3: Kubernetes

For large-scale deployments with auto-scaling.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: iptv-edge
spec:
  replicas: 3
  selector:
    matchLabels:
      app: iptv-edge
  template:
    spec:
      containers:
      - name: edge
        image: iptv-edge-server:cpu
        resources:
          limits:
            cpu: "4"
            memory: "8Gi"
```

---

## Step-by-Step Setup

### Step 1: Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# For GPU servers only - Install NVIDIA drivers
sudo apt install -y nvidia-driver-535

# Install NVIDIA Container Toolkit (GPU only)
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
    sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Step 2: Copy Deployment Files

```bash
# On main panel server, create deployment package
cd /opt/iptv
tar -czf edge-deploy.tar.gz \
    ffmpeg-build/ \
    iptv-server/dist/ \
    iptv-server/prisma/ \
    iptv-server/package*.json

# Copy to edge server
scp edge-deploy.tar.gz root@edge-server:/opt/

# On edge server
cd /opt
tar -xzf edge-deploy.tar.gz
```

### Step 3: Configure Environment

```bash
# Create .env file
cat > /opt/iptv/.env << 'EOF'
# Server Identity
SERVER_NAME=eu-edge-01
SERVER_TYPE=EDGE

# Network
EXTERNAL_IP=203.0.113.50        # Public IP
INTERNAL_IP=10.0.0.50           # Private IP (if applicable)
HTTP_PORT=3001
MAX_CONNECTIONS=5000

# Main Panel Connection
MAIN_PANEL_URL=http://main-panel.example.com:3001
DATABASE_URL=postgresql://iptv:password@main-panel.example.com:5434/iptv_db
REDIS_URL=redis://main-panel.example.com:6379
JWT_SECRET=your-jwt-secret-must-match-main-panel

# FFmpeg Settings
FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
FFPROBE_PATH=/opt/ffmpeg/bin/ffprobe

# For CPU servers
DEFAULT_VIDEO_CODEC=libx264
X264_PRESET=veryfast

# For GPU servers
# DEFAULT_VIDEO_CODEC=h264_nvenc
# NVENC_PRESET=p4
EOF
```

### Step 4: Start Edge Server

```bash
# For GPU servers
cd /opt/iptv
docker-compose -f ffmpeg-build/docker-compose.edge.yml up -d

# For CPU servers
docker-compose -f ffmpeg-build/docker-compose.edge-cpu.yml up -d

# Check status
docker-compose -f ffmpeg-build/docker-compose.edge.yml ps
docker-compose -f ffmpeg-build/docker-compose.edge.yml logs -f
```

### Step 5: Register with Main Panel

```bash
# Via API
curl -X POST http://main-panel:3001/admin/servers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "name": "eu-edge-01",
    "type": "EDGE",
    "externalIp": "203.0.113.50",
    "internalIp": "10.0.0.50",
    "httpPort": 3001,
    "maxConnections": 5000,
    "region": "EU",
    "country": "DE"
  }'
```

Or use the Admin Panel UI: **Servers** → **Add Server**

### Step 6: Assign Streams

```bash
# Assign specific streams to the edge server
curl -X POST http://main-panel:3001/admin/servers/1/streams \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "streamIds": [1, 2, 3, 4, 5]
  }'

# Or assign all streams of a category
curl -X POST http://main-panel:3001/admin/servers/1/categories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-admin-api-key" \
  -d '{
    "categoryIds": [1, 2]
  }'
```

---

## Stream Distribution

### How Streams are Distributed

1. **User requests stream** via player URL
2. **Main panel authenticates** user and checks permissions
3. **Load balancer selects** best edge server based on:
   - Geographic proximity
   - Current load
   - Server health
   - Stream availability
4. **User is redirected** to edge server
5. **Edge server serves** the stream (transcoding if needed)

### Stream URL Formats

```
# Standard stream URL (routes through load balancer)
http://main-panel:3001/{username}/{password}/{stream_id}.m3u8

# Direct edge server URL (bypass load balancer)
http://edge-server:3001/{username}/{password}/{stream_id}.m3u8

# VOD URL
http://main-panel:3001/movie/{username}/{password}/{vod_id}.mp4

# Series URL
http://main-panel:3001/series/{username}/{password}/{episode_id}.mp4
```

### Stream Assignment Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Auto** | System assigns based on load | Default |
| **Manual** | Admin assigns specific streams | Premium content |
| **Category** | Assign by content category | Regional content |
| **Geographic** | Assign based on user location | Global CDN |

---

## Scaling Guidelines

### When to Add Edge Servers

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU Usage | > 80% sustained | Add server |
| Active Connections | > 80% of max | Add server |
| Bandwidth | > 80% capacity | Add server |
| Response Time | > 500ms | Add server or optimize |
| Geographic Distance | > 100ms latency | Add regional server |

### Recommended Architecture

| Users | Edge Servers | Configuration |
|-------|--------------|---------------|
| < 500 | 1 | Single server (CPU or GPU) |
| 500-2000 | 2-3 | 1 per region |
| 2000-10000 | 4-8 | Multiple per region |
| 10000+ | 10+ | Full CDN architecture |

### High Availability Setup

```
                    ┌─────────────┐
                    │   HAProxy   │
                    │ Load Balancer│
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
   │  Edge-01    │  │  Edge-02    │  │  Edge-03    │
   │  (Primary)  │  │  (Primary)  │  │  (Standby)  │
   └─────────────┘  └─────────────┘  └─────────────┘
```

---

## Performance Tuning

### System Optimization

```bash
# Increase file descriptor limits
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# Optimize network settings
cat >> /etc/sysctl.conf << EOF
net.core.somaxconn = 65535
net.core.netdev_max_backlog = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 15
EOF
sysctl -p
```

### Docker Resource Limits

```yaml
# docker-compose.edge.yml
services:
  edge-server:
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 16G
        reservations:
          cpus: '4'
          memory: 8G
```

### FFmpeg Optimization

```bash
# CPU: Use appropriate thread count
FFMPEG_THREADS=0  # Auto-detect (recommended)

# CPU: Choose right preset for your hardware
X264_PRESET=veryfast  # Fast encoding, decent quality
X264_PRESET=ultrafast # Fastest, lower quality

# GPU: Use optimal NVENC settings
NVENC_PRESET=p4  # Balanced
NVENC_PRESET=p1  # Fastest
NVENC_PRESET=p7  # Best quality
```

### Monitoring Performance

```bash
# Real-time resource monitoring
docker stats

# FFmpeg process monitoring
htop -p $(pgrep -d, ffmpeg)

# Network monitoring
iftop -i eth0

# GPU monitoring (NVIDIA)
watch -n 1 nvidia-smi
```

---

## Edge Server Management Commands

### Common Operations

```bash
# Start edge server
docker-compose -f docker-compose.edge.yml up -d

# Stop edge server
docker-compose -f docker-compose.edge.yml down

# Restart edge server
docker-compose -f docker-compose.edge.yml restart

# View logs
docker-compose -f docker-compose.edge.yml logs -f

# Update edge server
docker-compose -f docker-compose.edge.yml pull
docker-compose -f docker-compose.edge.yml up -d

# Check health
curl http://localhost:3001/health
```

### Maintenance Mode

```bash
# Enable maintenance mode (drains connections gracefully)
curl -X POST http://main-panel:3001/admin/servers/1/maintenance \
  -H "X-API-Key: your-api-key" \
  -d '{"enabled": true}'

# Disable maintenance mode
curl -X POST http://main-panel:3001/admin/servers/1/maintenance \
  -H "X-API-Key: your-api-key" \
  -d '{"enabled": false}'
```

### Emergency Procedures

```bash
# Kill all active connections on edge server
curl -X POST http://main-panel:3001/admin/servers/1/kill-connections \
  -H "X-API-Key: your-api-key"

# Remove edge server from rotation
curl -X PUT http://main-panel:3001/admin/servers/1 \
  -H "X-API-Key: your-api-key" \
  -d '{"status": "OFFLINE"}'

# Force failover to another server
curl -X POST http://main-panel:3001/admin/servers/rebalance \
  -H "X-API-Key: your-api-key"
```

