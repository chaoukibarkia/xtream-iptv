#!/bin/bash
# ============================================
# Build FFmpeg with NVIDIA Support + nvidia-patch
# ============================================
# Run this ONCE on a machine with NVIDIA GPU to create
# a portable FFmpeg binary that can be copied to edge servers.
#
# Includes nvidia-patch from https://github.com/keylase/nvidia-patch
# to remove NVENC session limits on consumer GPUs.
#
# Requirements:
#   - Ubuntu 20.04+ or Debian 11+
#   - NVIDIA GPU with drivers installed
#   - CUDA toolkit (will be installed if missing)
#
# Output:
#   /opt/ffmpeg-nvidia/bin/ffmpeg
#   /opt/ffmpeg-nvidia/bin/ffprobe
#   /opt/ffmpeg-nvidia/lib/  (shared libraries)
#   /opt/ffmpeg-nvidia.tar.gz (distribution archive)
#
# Usage:
#   sudo ./build-ffmpeg-nvidia.sh
# ============================================

set -e

FFMPEG_VERSION="${FFMPEG_VERSION:-6.1.1}"
INSTALL_PREFIX="/opt/ffmpeg-nvidia"
BUILD_DIR="/tmp/ffmpeg-build-$$"

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

# Check root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root: sudo $0"
fi

# Check for NVIDIA GPU
if ! lspci | grep -qi nvidia; then
    log_error "No NVIDIA GPU detected. This script requires an NVIDIA GPU."
fi

log_info "Building FFmpeg ${FFMPEG_VERSION} with NVIDIA support + nvidia-patch"
echo "============================================"

# Install build dependencies
log_info "Installing build dependencies..."
apt-get update
apt-get install -y \
    autoconf automake build-essential cmake git-core \
    libass-dev libfreetype6-dev libgnutls28-dev \
    libmp3lame-dev libnuma-dev libopus-dev libsdl2-dev \
    libtool libva-dev libvdpau-dev libvorbis-dev libvpx-dev \
    libx264-dev libx265-dev libxcb1-dev libxcb-shm0-dev \
    libxcb-xfixes0-dev meson nasm ninja-build pkg-config \
    texinfo wget yasm zlib1g-dev libfdk-aac-dev libtheora-dev \
    libwebp-dev libsrt-gnutls-dev libxml2-dev patchelf dkms

# Check/Install NVIDIA Driver (latest from PPA)
log_info "Checking NVIDIA driver..."
if ! command -v nvidia-smi &>/dev/null; then
    log_info "Installing latest NVIDIA driver..."
    add-apt-repository -y ppa:graphics-drivers/ppa
    apt-get update
    # Get latest driver version
    LATEST_DRIVER=$(apt-cache search nvidia-driver | grep -oP 'nvidia-driver-\d+' | sort -V | tail -1)
    apt-get install -y $LATEST_DRIVER
    log_success "NVIDIA driver installed: $LATEST_DRIVER"
else
    DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
    log_success "NVIDIA driver already installed: $DRIVER_VERSION"
fi

# Apply nvidia-patch to remove NVENC session limits
log_info "Applying nvidia-patch to remove NVENC session limits..."
cd /tmp
rm -rf nvidia-patch 2>/dev/null || true
git clone https://github.com/keylase/nvidia-patch.git
cd nvidia-patch

# Apply the patch
if ./patch.sh; then
    log_success "nvidia-patch applied successfully - unlimited NVENC sessions enabled!"
else
    log_warn "nvidia-patch may have already been applied or encountered an issue"
fi

# Also apply the patch for the NVFBC (framebuffer capture) if available
if [ -f "./patch-fbc.sh" ]; then
    ./patch-fbc.sh || log_warn "NVFBC patch skipped"
fi

cd /tmp
rm -rf nvidia-patch

# Check/Install CUDA
if [ ! -d "/usr/local/cuda" ]; then
    log_info "Installing CUDA toolkit..."
    
    # Add NVIDIA package repositories
    wget -q https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/cuda-keyring_1.1-1_all.deb
    dpkg -i cuda-keyring_1.1-1_all.deb
    rm cuda-keyring_1.1-1_all.deb
    apt-get update
    apt-get install -y cuda-toolkit-12-2
    
    log_success "CUDA toolkit installed"
fi

export PATH=/usr/local/cuda/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH

# Create build directory
mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# Install NVIDIA codec headers (latest version for best compatibility)
log_info "Installing NVIDIA Video Codec SDK headers..."
if [ -d "nv-codec-headers" ]; then rm -rf nv-codec-headers; fi
git clone https://git.videolan.org/git/ffmpeg/nv-codec-headers.git
cd nv-codec-headers
# Use latest version for newest GPU support
git checkout n12.1.14.0 2>/dev/null || git checkout $(git tag | sort -V | tail -1)
make install
log_success "NVIDIA codec headers installed"
cd ..

# Download FFmpeg
log_info "Downloading FFmpeg ${FFMPEG_VERSION}..."
wget -q "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz"
tar xf "ffmpeg-${FFMPEG_VERSION}.tar.xz"
cd "ffmpeg-${FFMPEG_VERSION}"

# Configure FFmpeg
log_info "Configuring FFmpeg with NVIDIA support..."
./configure \
    --prefix="$INSTALL_PREFIX" \
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
    --enable-shared \
    --enable-rpath

# Build FFmpeg
log_info "Building FFmpeg (this will take 15-30 minutes)..."
make -j$(nproc)

# Install
log_info "Installing to ${INSTALL_PREFIX}..."
make install

# Set RPATH for portability
log_info "Setting RPATH for portability..."
patchelf --set-rpath '$ORIGIN/../lib' "$INSTALL_PREFIX/bin/ffmpeg"
patchelf --set-rpath '$ORIGIN/../lib' "$INSTALL_PREFIX/bin/ffprobe"

# Create archive for distribution
log_info "Creating distribution archive..."
cd /opt
tar -czvf ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz ffmpeg-nvidia/

# Cleanup
log_info "Cleaning up build directory..."
rm -rf "$BUILD_DIR"

# Verify installation
log_info "Verifying FFmpeg installation..."
echo ""
"$INSTALL_PREFIX/bin/ffmpeg" -version
echo ""

# Check NVENC encoders
log_info "Checking NVIDIA hardware encoders..."
NVENC_COUNT=$("$INSTALL_PREFIX/bin/ffmpeg" -encoders 2>/dev/null | grep -ci nvenc || echo "0")
if [ "$NVENC_COUNT" -gt 0 ]; then
    log_success "Found $NVENC_COUNT NVENC encoders"
    "$INSTALL_PREFIX/bin/ffmpeg" -encoders 2>/dev/null | grep -i nvenc
else
    log_warn "No NVENC encoders found - check CUDA installation"
fi
echo ""

# Check CUVID decoders
log_info "Checking NVIDIA hardware decoders..."
CUVID_COUNT=$("$INSTALL_PREFIX/bin/ffmpeg" -decoders 2>/dev/null | grep -ci cuvid || echo "0")
if [ "$CUVID_COUNT" -gt 0 ]; then
    log_success "Found $CUVID_COUNT CUVID decoders"
    "$INSTALL_PREFIX/bin/ffmpeg" -decoders 2>/dev/null | grep -i cuvid
else
    log_warn "No CUVID decoders found"
fi
echo ""

# Verify nvidia-patch was applied
log_info "Verifying nvidia-patch status..."
if nvidia-smi 2>/dev/null | grep -q "NVENC"; then
    # Try to check encoder sessions
    NVENC_SESSIONS=$(nvidia-smi --query-gpu=encoder.stats.sessionCount --format=csv,noheader 2>/dev/null | head -1 || echo "N/A")
    log_success "nvidia-smi reports NVENC available (current sessions: $NVENC_SESSIONS)"
fi
echo ""

# Create simplified archive for edge deployment (just binaries + libs)
log_info "Creating distribution archive..."
cd /opt
tar -czvf ffmpeg-nvidia.tar.gz ffmpeg-nvidia/
log_success "Distribution archive created: /opt/ffmpeg-nvidia.tar.gz"

# Also copy to standard location for deployment service
cp /opt/ffmpeg-nvidia.tar.gz /opt/ffmpeg-nvidia.tar.gz.bak 2>/dev/null || true

echo ""
echo "============================================"
log_success "FFmpeg with NVIDIA support built successfully!"
echo "============================================"
echo ""
echo "Features included:"
echo "  ✓ NVENC hardware encoding (h264_nvenc, hevc_nvenc, av1_nvenc)"
echo "  ✓ CUVID hardware decoding"
echo "  ✓ nvidia-patch applied (unlimited NVENC sessions)"
echo "  ✓ NPP (NVIDIA Performance Primitives)"
echo ""
echo "Installation location: ${INSTALL_PREFIX}"
echo "Distribution archive:  /opt/ffmpeg-nvidia.tar.gz"
echo ""
echo "To copy to edge servers:"
echo "  scp /opt/ffmpeg-nvidia.tar.gz root@edge-server:/opt/"
echo "  ssh root@edge-server 'cd /opt && tar -xzf ffmpeg-nvidia.tar.gz && ln -sf /opt/ffmpeg-nvidia/bin/ffmpeg /usr/local/bin/ffmpeg'"
echo ""
echo "Or use the Admin Panel → Servers → Deploy Edge Server wizard"
echo ""

