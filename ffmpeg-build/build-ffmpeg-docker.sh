#!/bin/bash
# ============================================
# Build FFmpeg with NVIDIA Support using Docker
# ============================================
# This script builds FFmpeg with CUDA/NVENC support using Docker,
# so you don't need an NVIDIA GPU on the build machine.
#
# The resulting binary can be copied to edge servers with NVIDIA GPUs.
#
# Usage:
#   ./build-ffmpeg-docker.sh
#
# Output:
#   ./output/ffmpeg-nvidia.tar.gz
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/output"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Check Docker
if ! command -v docker &>/dev/null; then
    log_error "Docker is not installed. Please install Docker first."
fi

log_info "Building FFmpeg with NVIDIA support using Docker..."
echo "============================================"
echo "This will take 15-30 minutes depending on your machine."
echo "============================================"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build the Docker image
log_info "Building Docker image (this includes compiling FFmpeg)..."
cd "$SCRIPT_DIR"
docker build -f Dockerfile.ffmpeg-build -t ffmpeg-nvidia-builder .

# Extract the archive
log_info "Extracting FFmpeg archive..."
docker run --rm -v "$OUTPUT_DIR:/output" ffmpeg-nvidia-builder

# Verify
if [ -f "$OUTPUT_DIR/ffmpeg-nvidia.tar.gz" ]; then
    log_success "FFmpeg build complete!"
    echo ""
    echo "============================================"
    echo "Output: $OUTPUT_DIR/ffmpeg-nvidia.tar.gz"
    echo "============================================"
    echo ""
    echo "Archive contents:"
    tar -tzf "$OUTPUT_DIR/ffmpeg-nvidia.tar.gz" | head -20
    echo "..."
    echo ""
    echo "To deploy to an edge server:"
    echo "  scp $OUTPUT_DIR/ffmpeg-nvidia.tar.gz root@edge-server:/opt/"
    echo "  ssh root@edge-server 'cd /opt && tar -xzf ffmpeg-nvidia.tar.gz'"
    echo ""
    echo "Or use the Admin Panel → Servers → Deploy Edge Server wizard"
    echo ""
else
    log_error "Build failed - no output archive found"
fi

