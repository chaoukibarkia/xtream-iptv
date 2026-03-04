#!/bin/bash
# ============================================
# Edge Server Deployment with NVIDIA Support
# ============================================
# Full automated deployment including:
# - NVIDIA driver installation with nvidia-patch
# - FFmpeg build with NVENC support
# - GPU monitoring service
# - NGINX with HTTPS (Let's Encrypt)
# ============================================

set -e

# Configuration
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${1}"
REMOTE_DIR="${REMOTE_DIR:-/opt/iptv-edge}"
NVIDIA_PATCH_REPO="https://github.com/keylase/nvidia-patch"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# GPU Info Storage
GPU_DETECTED=false
GPU_MODEL=""
GPU_MEMORY=""
GPU_DRIVER_VERSION=""
NVENC_SESSIONS=""

print_usage() {
    echo "Usage: $0 <server-hostname-or-ip> [options]"
    echo ""
    echo "Options:"
    echo "  --name NAME          Server name (default: edge-01)"
    echo "  --external-ip IP     External IP address"
    echo "  --domain DOMAIN      Domain name for HTTPS (e.g., edge1.example.com)"
    echo "  --main-panel URL     Main panel URL (e.g., http://main:3001)"
    echo "  --api-key KEY        Server API key for registration"
    echo "  --max-conn NUM       Max connections (default: 5000)"
    echo "  --email EMAIL        Email for Let's Encrypt"
    echo "  --skip-nvidia        Skip NVIDIA driver installation"
    echo "  --skip-https         Skip NGINX/HTTPS setup"
    echo ""
    echo "Example:"
    echo "  $0 192.168.1.100 --name eu-edge-01 --domain edge1.example.com --email admin@example.com"
}

if [ -z "${REMOTE_HOST}" ]; then
    print_usage
    exit 1
fi

# Parse arguments
SERVER_NAME="edge-01"
EXTERNAL_IP=""
DOMAIN=""
MAIN_PANEL_URL=""
API_KEY=""
MAX_CONNECTIONS="5000"
SSL_EMAIL=""
SKIP_NVIDIA=false
SKIP_HTTPS=false

shift # Remove first argument (hostname)
while [[ $# -gt 0 ]]; do
    case $1 in
        --name) SERVER_NAME="$2"; shift 2 ;;
        --external-ip) EXTERNAL_IP="$2"; shift 2 ;;
        --domain) DOMAIN="$2"; shift 2 ;;
        --main-panel) MAIN_PANEL_URL="$2"; shift 2 ;;
        --api-key) API_KEY="$2"; shift 2 ;;
        --max-conn) MAX_CONNECTIONS="$2"; shift 2 ;;
        --email) SSL_EMAIL="$2"; shift 2 ;;
        --skip-nvidia) SKIP_NVIDIA=true; shift ;;
        --skip-https) SKIP_HTTPS=true; shift ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}   IPTV Edge Server Deployment${NC}"
echo -e "${CYAN}   with NVIDIA GPU Support${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""
echo -e "${BLUE}Target:${NC} ${REMOTE_USER}@${REMOTE_HOST}"
echo -e "${BLUE}Server Name:${NC} ${SERVER_NAME}"
echo -e "${BLUE}Install Dir:${NC} ${REMOTE_DIR}"
[ -n "$DOMAIN" ] && echo -e "${BLUE}Domain:${NC} ${DOMAIN}"
echo ""

# ============================================
# Phase 1: SSH Connection & System Info
# ============================================
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 1: System Discovery${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "${YELLOW}Testing SSH connection...${NC}"
if ! ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${REMOTE_HOST}" "echo 'SSH OK'" &>/dev/null; then
    echo -e "${RED}❌ Cannot connect to ${REMOTE_HOST}${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SSH connection OK${NC}"

# Get system info
echo -e "${YELLOW}Gathering system information...${NC}"
REMOTE_OS=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat /etc/os-release | grep ^ID= | cut -d= -f2")
REMOTE_OS_VERSION=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat /etc/os-release | grep VERSION_ID | cut -d= -f2 | tr -d '\"'")
REMOTE_KERNEL=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "uname -r")
REMOTE_CPU=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "nproc")
REMOTE_MEM=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "free -g | awk '/^Mem:/{print \$2}'")

echo -e "  OS: ${CYAN}${REMOTE_OS} ${REMOTE_OS_VERSION}${NC}"
echo -e "  Kernel: ${CYAN}${REMOTE_KERNEL}${NC}"
echo -e "  CPU Cores: ${CYAN}${REMOTE_CPU}${NC}"
echo -e "  Memory: ${CYAN}${REMOTE_MEM}GB${NC}"

# ============================================
# Phase 2: NVIDIA GPU Detection
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 2: NVIDIA GPU Detection${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check for NVIDIA GPU using lspci
GPU_INFO=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "lspci | grep -i nvidia" 2>/dev/null || echo "")

if [ -n "$GPU_INFO" ]; then
    echo -e "${GREEN}✅ NVIDIA GPU detected:${NC}"
    echo -e "  ${CYAN}${GPU_INFO}${NC}"
    GPU_DETECTED=true
    
    # Check if nvidia-smi is available
    if ssh "${REMOTE_USER}@${REMOTE_HOST}" "command -v nvidia-smi" &>/dev/null; then
        echo -e "${GREEN}✅ NVIDIA driver already installed${NC}"
        
        # Get GPU details
        GPU_MODEL=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "nvidia-smi --query-gpu=name --format=csv,noheader" | head -1)
        GPU_MEMORY=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "nvidia-smi --query-gpu=memory.total --format=csv,noheader" | head -1)
        GPU_DRIVER_VERSION=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "nvidia-smi --query-gpu=driver_version --format=csv,noheader" | head -1)
        
        echo -e "  Model: ${CYAN}${GPU_MODEL}${NC}"
        echo -e "  Memory: ${CYAN}${GPU_MEMORY}${NC}"
        echo -e "  Driver: ${CYAN}${GPU_DRIVER_VERSION}${NC}"
        
        # Check NVENC sessions limit
        NVENC_SESSIONS=$(ssh "${REMOTE_USER}@${REMOTE_HOST}" "nvidia-smi -q | grep -A2 'Encoder' | grep 'Current' | awk '{print \$3}'" 2>/dev/null || echo "unknown")
        echo -e "  NVENC Status: ${CYAN}Active${NC}"
    else
        echo -e "${YELLOW}⚠️  GPU detected but driver not installed${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No NVIDIA GPU detected. Will use CPU encoding.${NC}"
fi

# ============================================
# Phase 3: Install Prerequisites
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 3: Installing Prerequisites${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" << 'PREREQ_SCRIPT'
set -e

# Update system
echo "Updating system packages..."
apt-get update -qq

# Install prerequisites
apt-get install -y -qq \
    curl wget git jq ca-certificates \
    gnupg lsb-release software-properties-common \
    pciutils lm-sensors htop iotop \
    net-tools

echo "Prerequisites installed"
PREREQ_SCRIPT

echo -e "${GREEN}✅ Prerequisites installed${NC}"

# ============================================
# Phase 4: Install Docker
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 4: Docker Installation${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker --version" &>/dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "curl -fsSL https://get.docker.com | sh"
fi
echo -e "${GREEN}✅ Docker available${NC}"

# ============================================
# Phase 5: NVIDIA Driver & nvidia-patch
# ============================================
if [ "$GPU_DETECTED" = true ] && [ "$SKIP_NVIDIA" = false ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Phase 5: NVIDIA Driver & Patch${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    ssh "${REMOTE_USER}@${REMOTE_HOST}" << 'NVIDIA_SCRIPT'
set -e

# Check if driver needs installation
if ! command -v nvidia-smi &>/dev/null; then
    echo "Installing NVIDIA driver..."
    
    # Add NVIDIA repository
    apt-get install -y -qq linux-headers-$(uname -r)
    
    # Install the latest driver
    add-apt-repository -y ppa:graphics-drivers/ppa
    apt-get update -qq
    
    # Find and install latest driver
    LATEST_DRIVER=$(apt-cache search nvidia-driver | grep -oP 'nvidia-driver-\d+' | sort -V | tail -1)
    apt-get install -y -qq $LATEST_DRIVER
    
    echo "NVIDIA driver installed. Reboot may be required."
fi

# Install nvidia-patch to unlock NVENC sessions
echo "Applying nvidia-patch for unlimited NVENC sessions..."
cd /tmp
if [ -d nvidia-patch ]; then rm -rf nvidia-patch; fi
git clone https://github.com/keylase/nvidia-patch.git
cd nvidia-patch

# Run the patch
./patch.sh

echo "nvidia-patch applied successfully!"

# Verify patch
nvidia-smi
NVIDIA_SCRIPT

    echo -e "${GREEN}✅ NVIDIA driver patched for unlimited NVENC${NC}"
    
    # Install NVIDIA Container Toolkit
    echo -e "${YELLOW}Installing NVIDIA Container Toolkit...${NC}"
    ssh "${REMOTE_USER}@${REMOTE_HOST}" << 'NVIDIA_DOCKER_SCRIPT'
set -e

# Add NVIDIA Container Toolkit repository
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
    gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg 2>/dev/null || true

curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    tee /etc/apt/sources.list.d/nvidia-container-toolkit.list > /dev/null

apt-get update -qq
apt-get install -y -qq nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

echo "NVIDIA Container Toolkit installed"
NVIDIA_DOCKER_SCRIPT

    echo -e "${GREEN}✅ NVIDIA Container Toolkit ready${NC}"
fi

# ============================================
# Phase 6: Create Deployment Directory
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 6: Deployment Configuration${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}/{config,logs,cache,certs}"

# Create docker-compose file
COMPOSE_CONTENT=$(cat << 'COMPOSE_EOF'
version: '3.7'

services:
  edge-server:
    build:
      context: .
      dockerfile: Dockerfile.edge
    image: iptv-edge:${BUILD_TYPE:-nvidia}
    container_name: iptv-edge
COMPOSE_EOF
)

# Add NVIDIA runtime if GPU available
if [ "$GPU_DETECTED" = true ]; then
    COMPOSE_CONTENT+=$(cat << 'COMPOSE_GPU'
    runtime: nvidia
COMPOSE_GPU
)
fi

COMPOSE_CONTENT+=$(cat << 'COMPOSE_COMMON'
    environment:
      - NODE_ENV=production
      - HOST=0.0.0.0
      - PORT=3001
      - SERVER_NAME=${SERVER_NAME}
      - SERVER_TYPE=EDGE
      - EXTERNAL_IP=${EXTERNAL_IP}
      - INTERNAL_IP=0.0.0.0
      - MAX_CONNECTIONS=${MAX_CONNECTIONS}
      - MAIN_PANEL_URL=${MAIN_PANEL_URL}
      - SERVER_API_KEY=${SERVER_API_KEY}
      - FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=${REDIS_URL}
COMPOSE_COMMON
)

# Add GPU-specific env vars
if [ "$GPU_DETECTED" = true ]; then
    COMPOSE_CONTENT+=$(cat << 'COMPOSE_GPU_ENV'
      - NVIDIA_VISIBLE_DEVICES=all
      - NVIDIA_DRIVER_CAPABILITIES=compute,video,utility
      - DEFAULT_VIDEO_CODEC=h264_nvenc
      - ENABLE_HARDWARE_DECODE=true
      - ENABLE_HARDWARE_ENCODE=true
      - GPU_MONITORING_ENABLED=true
COMPOSE_GPU_ENV
)
else
    COMPOSE_CONTENT+=$(cat << 'COMPOSE_CPU_ENV'
      - DEFAULT_VIDEO_CODEC=libx264
      - X264_PRESET=veryfast
COMPOSE_CPU_ENV
)
fi

COMPOSE_CONTENT+=$(cat << 'COMPOSE_VOLUMES'
    ports:
      - "3001:3001"
      - "1935:1935"
    volumes:
      - ./logs:/var/log/iptv
      - ./cache:/var/cache/iptv
      - hls-segments:/tmp/hls-segments
COMPOSE_VOLUMES
)

# Add GPU resources if available
if [ "$GPU_DETECTED" = true ]; then
    COMPOSE_CONTENT+=$(cat << 'COMPOSE_GPU_RES'
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu, video, compute]
COMPOSE_GPU_RES
)
fi

COMPOSE_CONTENT+=$(cat << 'COMPOSE_END'
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # GPU Monitoring Service
  gpu-monitor:
    image: nvidia/dcgm-exporter:latest
    container_name: gpu-monitor
COMPOSE_END
)

if [ "$GPU_DETECTED" = true ]; then
    COMPOSE_CONTENT+=$(cat << 'GPU_MONITOR_FULL'
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
    ports:
      - "9400:9400"
    restart: unless-stopped
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
GPU_MONITOR_FULL
)
fi

# Add NGINX if HTTPS requested
if [ "$SKIP_HTTPS" = false ] && [ -n "$DOMAIN" ]; then
    COMPOSE_CONTENT+=$(cat << 'NGINX_SERVICE'

  nginx:
    image: nginx:alpine
    container_name: nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./config/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/letsencrypt:ro
    depends_on:
      - edge-server
    restart: unless-stopped

  certbot:
    image: certbot/certbot
    container_name: certbot
    volumes:
      - ./certs:/etc/letsencrypt
      - ./config/webroot:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
NGINX_SERVICE
)
fi

COMPOSE_CONTENT+=$(cat << 'VOLUMES_END'

volumes:
  hls-segments:

networks:
  default:
    driver: bridge
VOLUMES_END
)

echo "$COMPOSE_CONTENT" | ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/docker-compose.yml"

# Create .env file
ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/.env" << ENV_FILE
# Edge Server Configuration
SERVER_NAME=${SERVER_NAME}
EXTERNAL_IP=${EXTERNAL_IP:-\$(curl -s ifconfig.me)}
MAX_CONNECTIONS=${MAX_CONNECTIONS}
MAIN_PANEL_URL=${MAIN_PANEL_URL}
SERVER_API_KEY=${API_KEY}
BUILD_TYPE=${GPU_DETECTED:+nvidia}${GPU_DETECTED:-cpu}

# GPU Configuration
GPU_DETECTED=${GPU_DETECTED}
GPU_MODEL=${GPU_MODEL}
GPU_MEMORY=${GPU_MEMORY}

# HTTPS Configuration
DOMAIN=${DOMAIN}
SSL_EMAIL=${SSL_EMAIL}

# Database (from main panel)
DATABASE_URL=${DATABASE_URL:-}
JWT_SECRET=${JWT_SECRET:-}
REDIS_URL=${REDIS_URL:-}
ENV_FILE

echo -e "${GREEN}✅ Configuration files created${NC}"

# ============================================
# Phase 7: Create Dockerfile with nvidia-patch
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 7: Creating Docker Images${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create Dockerfile
if [ "$GPU_DETECTED" = true ]; then
    DOCKERFILE_CONTENT=$(cat << 'DOCKERFILE_GPU'
# ============================================
# IPTV Edge Server with NVIDIA FFmpeg
# Built with nvidia-patch for unlimited NVENC
# ============================================

# Stage 1: Build FFmpeg with NVIDIA support
FROM nvidia/cuda:12.2.0-devel-ubuntu22.04 AS ffmpeg-builder

ENV DEBIAN_FRONTEND=noninteractive

# Install FFmpeg build dependencies
RUN apt-get update && apt-get install -y \
    autoconf automake build-essential cmake git \
    libass-dev libfreetype6-dev libgnutls28-dev \
    libmp3lame-dev libnuma-dev libopus-dev libsdl2-dev \
    libtool libva-dev libvdpau-dev libvorbis-dev libvpx-dev \
    libx264-dev libx265-dev libxcb1-dev libxcb-shm0-dev \
    libxcb-xfixes0-dev meson nasm ninja-build pkg-config \
    texinfo wget yasm zlib1g-dev libfdk-aac-dev libtheora-dev \
    libwebp-dev libsrt-gnutls-dev libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Install nv-codec-headers (latest version)
RUN git clone --depth 1 https://git.videolan.org/git/ffmpeg/nv-codec-headers.git && \
    cd nv-codec-headers && make install

# Build FFmpeg with maximum NVIDIA support
ARG FFMPEG_VERSION=6.1.1
RUN wget https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz && \
    tar xf ffmpeg-${FFMPEG_VERSION}.tar.xz && \
    cd ffmpeg-${FFMPEG_VERSION} && \
    ./configure \
        --prefix=/opt/ffmpeg \
        --extra-cflags="-I/usr/local/cuda/include" \
        --extra-ldflags="-L/usr/local/cuda/lib64" \
        --enable-gpl \
        --enable-gnutls \
        --enable-libass \
        --enable-libfdk-aac \
        --enable-libfreetype \
        --enable-libmp3lame \
        --enable-libopus \
        --enable-libtheora \
        --enable-libvorbis \
        --enable-libvpx \
        --enable-libwebp \
        --enable-libx264 \
        --enable-libx265 \
        --enable-libxml2 \
        --enable-libsrt \
        --enable-nonfree \
        --enable-cuda-nvcc \
        --enable-cuvid \
        --enable-nvenc \
        --enable-nvdec \
        --enable-libnpp \
        --enable-version3 \
        --disable-debug \
        --disable-doc \
    && make -j$(nproc) && make install

# Stage 2: Build Node.js application
FROM node:20-bullseye-slim AS node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate

# Stage 3: Final runtime image
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libass9 libfreetype6 libgnutls30 libmp3lame0 libnuma1 \
    libopus0 libtheora0 libvdpau1 libvorbis0a libvorbisenc2 \
    libvpx7 libwebp7 libx264-163 libx265-199 libfdk-aac2 \
    libsrt1.4-gnutls libxml2 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy FFmpeg from builder
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffmpeg
COPY --from=ffmpeg-builder /opt/ffmpeg/bin/ffprobe /opt/ffmpeg/bin/ffprobe
RUN ln -s /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg && \
    ln -s /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe

# Copy Node.js application
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/prisma ./prisma

# Create directories
RUN mkdir -p /tmp/hls-segments /var/log/iptv /var/cache/iptv

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV FFMPEG_PATH=/opt/ffmpeg/bin/ffmpeg
ENV FFPROBE_PATH=/opt/ffmpeg/bin/ffprobe
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

EXPOSE 3001 1935

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
DOCKERFILE_GPU
)
else
    DOCKERFILE_CONTENT=$(cat << 'DOCKERFILE_CPU'
# ============================================
# IPTV Edge Server - CPU Only
# ============================================

FROM node:20-bullseye-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install FFmpeg and Node.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /tmp/hls-segments /var/log/iptv /var/cache/iptv

ENV NODE_ENV=production
ENV PORT=3001
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV FFPROBE_PATH=/usr/bin/ffprobe

EXPOSE 3001 1935

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/server.js"]
DOCKERFILE_CPU
)
fi

echo "$DOCKERFILE_CONTENT" | ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/Dockerfile.edge"

# ============================================
# Phase 8: Create NGINX Configuration (if HTTPS)
# ============================================
if [ "$SKIP_HTTPS" = false ] && [ -n "$DOMAIN" ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Phase 8: NGINX HTTPS Configuration${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}/config/webroot"
    
    # Create initial NGINX config (HTTP only for certbot)
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/config/nginx.conf" << NGINX_INITIAL
events {
    worker_connections 4096;
}

http {
    upstream edge_backend {
        server edge-server:3001;
    }

    server {
        listen 80;
        server_name ${DOMAIN};

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            proxy_pass http://edge_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
        }
    }
}
NGINX_INITIAL

    # Create HTTPS nginx config (for after certificate)
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/config/nginx-ssl.conf" << NGINX_SSL
events {
    worker_connections 4096;
}

http {
    upstream edge_backend {
        server edge-server:3001;
    }

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=one:10m rate=10r/s;

    # HTTP to HTTPS redirect
    server {
        listen 80;
        server_name ${DOMAIN};
        
        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }
        
        location / {
            return 301 https://\$host\$request_uri;
        }
    }

    # HTTPS Server
    server {
        listen 443 ssl http2;
        server_name ${DOMAIN};

        ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
        ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
        ssl_session_timeout 1d;
        ssl_session_cache shared:SSL:50m;
        ssl_session_tickets off;

        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers off;

        # HSTS
        add_header Strict-Transport-Security "max-age=63072000" always;

        # Streaming optimizations
        proxy_buffering off;
        proxy_cache off;
        
        location / {
            proxy_pass http://edge_backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            proxy_cache_bypass \$http_upgrade;
            
            # Streaming timeouts
            proxy_read_timeout 3600s;
            proxy_send_timeout 3600s;
        }

        # HLS streaming
        location ~* \\.m3u8\$ {
            proxy_pass http://edge_backend;
            proxy_http_version 1.1;
            add_header Cache-Control "no-cache";
            add_header Access-Control-Allow-Origin *;
        }

        location ~* \\.ts\$ {
            proxy_pass http://edge_backend;
            proxy_http_version 1.1;
            add_header Cache-Control "max-age=86400";
            add_header Access-Control-Allow-Origin *;
        }
    }
}
NGINX_SSL

    echo -e "${GREEN}✅ NGINX configuration created${NC}"
fi

# ============================================
# Phase 9: Copy Application Files
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 9: Copying Application Files${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create deployment archive
DEPLOY_PACKAGE="/tmp/edge-deploy-$$.tar.gz"
tar -czf "${DEPLOY_PACKAGE}" \
    -C "${PROJECT_DIR}/iptv-server" \
    dist prisma package.json package-lock.json 2>/dev/null || {
    echo -e "${YELLOW}Building server dist...${NC}"
    cd "${PROJECT_DIR}/iptv-server"
    npm run build
    tar -czf "${DEPLOY_PACKAGE}" \
        -C "${PROJECT_DIR}/iptv-server" \
        dist prisma package.json package-lock.json
}

scp "${DEPLOY_PACKAGE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/deploy.tar.gz"
rm "${DEPLOY_PACKAGE}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" << EXTRACT_SCRIPT
cd ${REMOTE_DIR}
tar -xzf deploy.tar.gz
rm deploy.tar.gz
EXTRACT_SCRIPT

echo -e "${GREEN}✅ Application files copied${NC}"

# ============================================
# Phase 10: Build and Start Containers
# ============================================
echo ""
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}Phase 10: Building and Starting Services${NC}"
echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" << START_SCRIPT
cd ${REMOTE_DIR}
source .env

echo "Building Docker images..."
docker-compose build

echo "Starting services..."
docker-compose up -d

echo "Waiting for services to start..."
sleep 10

echo "Service status:"
docker-compose ps
START_SCRIPT

echo -e "${GREEN}✅ Services started${NC}"

# ============================================
# Phase 11: Setup SSL Certificate (if HTTPS)
# ============================================
if [ "$SKIP_HTTPS" = false ] && [ -n "$DOMAIN" ] && [ -n "$SSL_EMAIL" ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Phase 11: SSL Certificate Setup${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    ssh "${REMOTE_USER}@${REMOTE_HOST}" << SSL_SCRIPT
cd ${REMOTE_DIR}

echo "Obtaining SSL certificate..."
docker-compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email ${SSL_EMAIL} \
    --agree-tos \
    --no-eff-email \
    -d ${DOMAIN}

# Switch to SSL config
cp config/nginx-ssl.conf config/nginx.conf
docker-compose restart nginx

echo "SSL certificate obtained!"
SSL_SCRIPT

    echo -e "${GREEN}✅ SSL certificate configured${NC}"
fi

# ============================================
# Phase 12: Create GPU Monitoring Script
# ============================================
if [ "$GPU_DETECTED" = true ]; then
    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Phase 12: GPU Monitoring Setup${NC}"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > ${REMOTE_DIR}/scripts/gpu-monitor.sh" << 'GPU_SCRIPT'
#!/bin/bash
# GPU Monitoring Script
# Reports GPU metrics to the main panel

MAIN_PANEL_URL="${MAIN_PANEL_URL}"
SERVER_API_KEY="${SERVER_API_KEY}"
SERVER_NAME="${SERVER_NAME}"

while true; do
    # Get GPU metrics
    GPU_UTIL=$(nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits | head -1)
    GPU_MEM_UTIL=$(nvidia-smi --query-gpu=utilization.memory --format=csv,noheader,nounits | head -1)
    GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
    GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
    GPU_TEMP=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits | head -1)
    GPU_POWER=$(nvidia-smi --query-gpu=power.draw --format=csv,noheader,nounits | head -1)
    ENCODER_UTIL=$(nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
    
    # Send to main panel
    curl -s -X POST "${MAIN_PANEL_URL}/api/servers/metrics" \
        -H "Content-Type: application/json" \
        -H "X-Server-Key: ${SERVER_API_KEY}" \
        -d "{
            \"serverName\": \"${SERVER_NAME}\",
            \"gpu\": {
                \"utilization\": ${GPU_UTIL:-0},
                \"memoryUtilization\": ${GPU_MEM_UTIL:-0},
                \"memoryUsed\": ${GPU_MEM_USED:-0},
                \"memoryTotal\": ${GPU_MEM_TOTAL:-0},
                \"temperature\": ${GPU_TEMP:-0},
                \"powerDraw\": ${GPU_POWER:-0},
                \"encoderSessions\": ${ENCODER_UTIL:-0}
            },
            \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
        }" > /dev/null 2>&1
    
    # Log locally
    echo "$(date): GPU=${GPU_UTIL}% MEM=${GPU_MEM_UTIL}% TEMP=${GPU_TEMP}°C POWER=${GPU_POWER}W ENCODERS=${ENCODER_UTIL}" \
        >> /var/log/iptv/gpu-metrics.log
    
    sleep 10
done
GPU_SCRIPT

    ssh "${REMOTE_USER}@${REMOTE_HOST}" "chmod +x ${REMOTE_DIR}/scripts/gpu-monitor.sh"
    
    # Create systemd service for GPU monitoring
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "cat > /etc/systemd/system/iptv-gpu-monitor.service" << 'SYSTEMD_GPU'
[Unit]
Description=IPTV GPU Monitoring Service
After=docker.service

[Service]
Type=simple
ExecStart=/opt/iptv-edge/scripts/gpu-monitor.sh
Restart=always
RestartSec=5
EnvironmentFile=/opt/iptv-edge/.env

[Install]
WantedBy=multi-user.target
SYSTEMD_GPU

    ssh "${REMOTE_USER}@${REMOTE_HOST}" "systemctl daemon-reload && systemctl enable iptv-gpu-monitor && systemctl start iptv-gpu-monitor"
    
    echo -e "${GREEN}✅ GPU monitoring active${NC}"
fi

# ============================================
# Final Summary
# ============================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}   Deployment Complete!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${GREEN}Edge Server Details:${NC}"
echo -e "  ${BLUE}Host:${NC} ${REMOTE_HOST}"
echo -e "  ${BLUE}Name:${NC} ${SERVER_NAME}"
echo -e "  ${BLUE}GPU:${NC} ${GPU_DETECTED:-false}"
[ -n "$GPU_MODEL" ] && echo -e "  ${BLUE}GPU Model:${NC} ${GPU_MODEL}"
[ -n "$DOMAIN" ] && echo -e "  ${BLUE}Domain:${NC} https://${DOMAIN}"
echo ""
echo -e "${GREEN}Access URLs:${NC}"
if [ -n "$DOMAIN" ]; then
    echo -e "  ${BLUE}API:${NC} https://${DOMAIN}"
    echo -e "  ${BLUE}Health:${NC} https://${DOMAIN}/health"
else
    echo -e "  ${BLUE}API:${NC} http://${REMOTE_HOST}:3001"
    echo -e "  ${BLUE}Health:${NC} http://${REMOTE_HOST}:3001/health"
fi
[ "$GPU_DETECTED" = true ] && echo -e "  ${BLUE}GPU Metrics:${NC} http://${REMOTE_HOST}:9400/metrics"
echo ""
echo -e "${GREEN}Management Commands:${NC}"
echo -e "  ${CYAN}Status:${NC}  ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker-compose ps'"
echo -e "  ${CYAN}Logs:${NC}    ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker-compose logs -f'"
echo -e "  ${CYAN}Restart:${NC} ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker-compose restart'"
[ "$GPU_DETECTED" = true ] && echo -e "  ${CYAN}GPU:${NC}     ssh ${REMOTE_USER}@${REMOTE_HOST} 'nvidia-smi'"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Register this server in the main panel admin UI"
echo "  2. Assign streams/categories to this edge server"
echo "  3. Configure DNS to point ${DOMAIN:-your domain} to ${EXTERNAL_IP:-${REMOTE_HOST}}"
echo ""

