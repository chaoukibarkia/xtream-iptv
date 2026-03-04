#!/bin/bash
# ============================================
# Edge Server Deployment Script
# ============================================
# Deploy IPTV edge server with NVIDIA FFmpeg
# to a remote server via SSH
# ============================================

set -e

# Configuration
REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${1}"
REMOTE_DIR="${REMOTE_DIR:-/opt/iptv-edge}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "${SCRIPT_DIR}")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_usage() {
    echo "Usage: $0 <server-hostname-or-ip> [options]"
    echo ""
    echo "Options:"
    echo "  --name NAME          Server name (default: edge-01)"
    echo "  --external-ip IP     External IP address"
    echo "  --main-panel URL     Main panel URL"
    echo "  --api-key KEY        Server API key for registration"
    echo "  --max-conn NUM       Max connections (default: 5000)"
    echo ""
    echo "Example:"
    echo "  $0 192.168.1.100 --name eu-edge-01 --external-ip 1.2.3.4 --main-panel http://main:3001"
}

if [ -z "${REMOTE_HOST}" ]; then
    print_usage
    exit 1
fi

# Parse arguments
SERVER_NAME="edge-01"
EXTERNAL_IP=""
MAIN_PANEL_URL=""
API_KEY=""
MAX_CONNECTIONS="5000"

shift # Remove first argument (hostname)
while [[ $# -gt 0 ]]; do
    case $1 in
        --name)
            SERVER_NAME="$2"
            shift 2
            ;;
        --external-ip)
            EXTERNAL_IP="$2"
            shift 2
            ;;
        --main-panel)
            MAIN_PANEL_URL="$2"
            shift 2
            ;;
        --api-key)
            API_KEY="$2"
            shift 2
            ;;
        --max-conn)
            MAX_CONNECTIONS="$2"
            shift 2
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            print_usage
            exit 1
            ;;
    esac
done

echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}IPTV Edge Server Deployment${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Target: ${REMOTE_USER}@${REMOTE_HOST}"
echo "Server Name: ${SERVER_NAME}"
echo "Install Dir: ${REMOTE_DIR}"
echo ""

# Check SSH connection
echo -e "${YELLOW}Testing SSH connection...${NC}"
if ! ssh -o ConnectTimeout=10 "${REMOTE_USER}@${REMOTE_HOST}" "echo 'SSH OK'" &>/dev/null; then
    echo -e "${RED}❌ Cannot connect to ${REMOTE_HOST}${NC}"
    exit 1
fi
echo -e "${GREEN}✅ SSH connection OK${NC}"

# Check for NVIDIA GPU on remote
echo -e "${YELLOW}Checking for NVIDIA GPU...${NC}"
if ssh "${REMOTE_USER}@${REMOTE_HOST}" "nvidia-smi" &>/dev/null; then
    echo -e "${GREEN}✅ NVIDIA GPU detected${NC}"
    HAS_GPU=true
else
    echo -e "${YELLOW}⚠️  No NVIDIA GPU detected. Hardware acceleration will not be available.${NC}"
    HAS_GPU=false
fi

# Check for Docker on remote
echo -e "${YELLOW}Checking Docker installation...${NC}"
if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker --version" &>/dev/null; then
    echo -e "${YELLOW}Installing Docker...${NC}"
    ssh "${REMOTE_USER}@${REMOTE_HOST}" "curl -fsSL https://get.docker.com | sh"
fi
echo -e "${GREEN}✅ Docker available${NC}"

# Check for NVIDIA Container Toolkit
if [ "$HAS_GPU" = true ]; then
    echo -e "${YELLOW}Checking NVIDIA Container Toolkit...${NC}"
    if ! ssh "${REMOTE_USER}@${REMOTE_HOST}" "docker info 2>/dev/null | grep -q nvidia"; then
        echo -e "${YELLOW}Installing NVIDIA Container Toolkit...${NC}"
        ssh "${REMOTE_USER}@${REMOTE_HOST}" << 'REMOTE_SCRIPT'
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
REMOTE_SCRIPT
    fi
    echo -e "${GREEN}✅ NVIDIA Container Toolkit ready${NC}"
fi

# Create remote directory
echo -e "${YELLOW}Creating deployment directory...${NC}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" "mkdir -p ${REMOTE_DIR}"

# Copy files
echo -e "${YELLOW}Copying deployment files...${NC}"

# Create a deployment package
DEPLOY_PACKAGE="/tmp/edge-deploy-$$.tar.gz"
tar -czf "${DEPLOY_PACKAGE}" \
    -C "${PROJECT_DIR}" \
    iptv-server/dist \
    iptv-server/prisma \
    iptv-server/package.json \
    iptv-server/package-lock.json \
    ffmpeg-build/Dockerfile.edge-server \
    ffmpeg-build/docker-compose.edge.yml

scp "${DEPLOY_PACKAGE}" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/deploy.tar.gz"
rm "${DEPLOY_PACKAGE}"

# Deploy on remote
echo -e "${YELLOW}Deploying on remote server...${NC}"
ssh "${REMOTE_USER}@${REMOTE_HOST}" << REMOTE_DEPLOY
cd ${REMOTE_DIR}
tar -xzf deploy.tar.gz
rm deploy.tar.gz

# Create .env file
cat > .env << ENV_FILE
SERVER_NAME=${SERVER_NAME}
EXTERNAL_IP=${EXTERNAL_IP}
INTERNAL_IP=0.0.0.0
MAX_CONNECTIONS=${MAX_CONNECTIONS}
MAIN_PANEL_URL=${MAIN_PANEL_URL}
SERVER_API_KEY=${API_KEY}
DATABASE_URL=${DATABASE_URL:-}
JWT_SECRET=${JWT_SECRET:-}
REDIS_URL=${REDIS_URL:-}
ENV_FILE

# Build and start the container
cd ${REMOTE_DIR}
docker-compose -f ffmpeg-build/docker-compose.edge.yml build
docker-compose -f ffmpeg-build/docker-compose.edge.yml up -d

echo ""
echo "Checking container status..."
sleep 5
docker-compose -f ffmpeg-build/docker-compose.edge.yml ps
REMOTE_DEPLOY

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo "Edge server deployed to: ${REMOTE_HOST}"
echo "Server name: ${SERVER_NAME}"
echo ""
echo "To check status:"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker-compose -f ffmpeg-build/docker-compose.edge.yml ps'"
echo ""
echo "To view logs:"
echo "  ssh ${REMOTE_USER}@${REMOTE_HOST} 'cd ${REMOTE_DIR} && docker-compose -f ffmpeg-build/docker-compose.edge.yml logs -f'"
echo ""

