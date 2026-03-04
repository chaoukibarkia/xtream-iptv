#!/bin/bash
# ============================================
# IPTV System - Update Script
# ============================================

set -e

echo "============================================"
echo "IPTV System - Update"
echo "============================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Pull or rebuild images
echo "Step 1: Rebuilding images..."

cd "${PROJECT_ROOT}"

if [ -f "iptv-server/Dockerfile" ]; then
    echo "Building backend image..."
    podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server
    echo -e "${GREEN}✓ Backend image rebuilt${NC}"
fi

if [ -f "iptv-frontend/Dockerfile" ]; then
    echo "Building frontend image..."
    podman build -t iptv-frontend:latest \
        --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
        -f iptv-frontend/Dockerfile ./iptv-frontend
    echo -e "${GREEN}✓ Frontend image rebuilt${NC}"
fi

echo ""
echo "Step 2: Restarting services..."
systemctl restart iptv-backend.service
systemctl restart iptv-frontend.service

echo ""
echo -e "${GREEN}✓ Update complete!${NC}"
echo ""
echo "Check status with: systemctl status iptv-pod.service"
