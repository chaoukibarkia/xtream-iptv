#!/bin/bash
# ============================================
# IPTV System - Proxmox OCI Deployment Script
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "============================================"
echo "IPTV System - Proxmox OCI Deployment"
echo "============================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root${NC}"
    exit 1
fi

# Check if Podman is installed
if ! command -v podman &> /dev/null; then
    echo -e "${YELLOW}Podman not found. Installing...${NC}"
    apt update
    apt install -y podman crun fuse-overlayfs slirp4netns
fi

echo -e "${GREEN}✓ Podman version: $(podman --version)${NC}"
echo ""

# Step 1: Create storage directories
echo "Step 1: Creating storage directories..."
mkdir -p /storage-pool/xtream-data/{postgres,redis,hls-segments,image-cache,logs}
chown -R 100000:100000 /storage-pool/xtream-data
echo -e "${GREEN}✓ Storage directories created${NC}"
echo ""

# Step 2: Build images (if Dockerfiles exist)
if [ -d "${PROJECT_ROOT}/iptv-server" ] && [ -f "${PROJECT_ROOT}/iptv-server/Dockerfile" ]; then
    echo "Step 2: Building backend image..."
    cd "${PROJECT_ROOT}"
    podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server
    echo -e "${GREEN}✓ Backend image built${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ Backend Dockerfile not found. Please build image manually or load from archive.${NC}"
    echo ""
fi

if [ -d "${PROJECT_ROOT}/iptv-frontend" ] && [ -f "${PROJECT_ROOT}/iptv-frontend/Dockerfile" ]; then
    echo "Step 3: Building frontend image..."
    cd "${PROJECT_ROOT}"
    podman build -t iptv-frontend:latest \
        --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
        --build-arg NEXT_PUBLIC_TMDB_IMAGE_BASE=https://image.tmdb.org/t/p \
        --build-arg NEXT_PUBLIC_ADMIN_API_KEY=admin-secret-key \
        -f iptv-frontend/Dockerfile ./iptv-frontend
    echo -e "${GREEN}✓ Frontend image built${NC}"
    echo ""
else
    echo -e "${YELLOW}⚠ Frontend Dockerfile not found. Please build image manually or load from archive.${NC}"
    echo ""
fi

# Step 4: Deploy Quadlet configurations
echo "Step 4: Deploying Quadlet configurations..."
cp -r "${PROJECT_ROOT}/proxmox-oci/quadlet/"* /etc/containers/systemd/
echo -e "${GREEN}✓ Quadlet files copied to /etc/containers/systemd/${NC}"
echo ""

# Step 5: Reload systemd
echo "Step 5: Reloading systemd daemon..."
systemctl daemon-reload
echo -e "${GREEN}✓ Systemd reloaded${NC}"
echo ""

# Step 6: Start services
echo "Step 6: Starting services..."
echo "Starting pod and containers..."
systemctl start iptv-pod.service

# Wait for services to start
echo "Waiting for services to initialize (30s)..."
sleep 30

# Step 7: Check status
echo ""
echo "Step 7: Checking service status..."
echo "----------------------------------------"
systemctl status iptv-pod.service --no-pager || true
echo ""
podman pod ps
echo ""
podman ps --pod
echo ""

# Step 8: Initialize database
echo "Step 8: Initializing database..."
echo "Waiting for PostgreSQL to be ready..."
sleep 10

if podman exec iptv-postgres pg_isready -U iptv -d iptv_db &> /dev/null; then
    echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
    
    echo "Running Prisma migrations..."
    if podman exec iptv-backend npx prisma migrate deploy; then
        echo -e "${GREEN}✓ Migrations applied${NC}"
    else
        echo -e "${YELLOW}⚠ Migration failed. You may need to run this manually.${NC}"
    fi
    
    echo "Seeding database..."
    if podman exec iptv-backend node dist/scripts/seed.js 2>/dev/null; then
        echo -e "${GREEN}✓ Database seeded${NC}"
    else
        echo -e "${YELLOW}⚠ Seeding failed. Database may already be seeded.${NC}"
    fi
else
    echo -e "${RED}✗ PostgreSQL is not ready. Please check logs.${NC}"
fi

echo ""
echo "============================================"
echo "Deployment Complete!"
echo "============================================"
echo ""
echo "Service URLs:"
echo "  Frontend:  http://$(hostname -I | awk '{print $1}'):3000"
echo "  Backend:   http://$(hostname -I | awk '{print $1}'):3001"
echo "  Adminer:   http://$(hostname -I | awk '{print $1}'):8080 (start with: systemctl start iptv-adminer.service)"
echo ""
echo "Management Commands:"
echo "  View logs:       journalctl -u iptv-backend.service -f"
echo "  Restart backend: systemctl restart iptv-backend.service"
echo "  Stop all:        systemctl stop iptv-pod.service"
echo "  Status:          systemctl status iptv-pod.service"
echo ""
echo "Enable auto-start on boot:"
echo "  systemctl enable iptv-pod.service"
echo ""
