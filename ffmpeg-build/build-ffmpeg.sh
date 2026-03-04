#!/bin/bash
# ============================================
# FFmpeg Build Script with NVENC/NVDEC
# ============================================
# This script builds FFmpeg with NVIDIA hardware acceleration
# and packages it with all required libraries for deployment
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${SCRIPT_DIR}/dist"
FFMPEG_VERSION="${FFMPEG_VERSION:-6.1.1}"

echo "============================================"
echo "FFmpeg Build with NVENC/NVDEC Support"
echo "============================================"
echo "Version: ${FFMPEG_VERSION}"
echo "Output: ${OUTPUT_DIR}"
echo "============================================"

# Create output directory
mkdir -p "${OUTPUT_DIR}"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed."
    exit 1
fi

# Check if NVIDIA Docker runtime is available
if docker info 2>/dev/null | grep -q "nvidia"; then
    echo "✅ NVIDIA Docker runtime detected"
    NVIDIA_FLAG="--gpus all"
else
    echo "⚠️  NVIDIA Docker runtime not detected. Building without GPU test."
    NVIDIA_FLAG=""
fi

echo ""
echo "📦 Building FFmpeg Docker image..."
echo ""

# Build the Docker image
docker build \
    --build-arg FFMPEG_VERSION=${FFMPEG_VERSION} \
    -t ffmpeg-nvidia:${FFMPEG_VERSION} \
    -f "${SCRIPT_DIR}/Dockerfile" \
    "${SCRIPT_DIR}"

echo ""
echo "📤 Extracting binaries..."
echo ""

# Create a container and extract binaries
CONTAINER_ID=$(docker create ffmpeg-nvidia:${FFMPEG_VERSION})

# Extract FFmpeg binaries
docker cp "${CONTAINER_ID}:/opt/ffmpeg/bin/ffmpeg" "${OUTPUT_DIR}/ffmpeg"
docker cp "${CONTAINER_ID}:/opt/ffmpeg/bin/ffprobe" "${OUTPUT_DIR}/ffprobe"

# Remove the container
docker rm "${CONTAINER_ID}"

# Make binaries executable
chmod +x "${OUTPUT_DIR}/ffmpeg" "${OUTPUT_DIR}/ffprobe"

echo ""
echo "📋 Creating deployment package..."
echo ""

# Create a tarball with everything needed
cd "${OUTPUT_DIR}"

# Create deployment script
cat > deploy-ffmpeg.sh << 'DEPLOY_SCRIPT'
#!/bin/bash
# FFmpeg Deployment Script for Edge Servers
# Run this script on the edge server to install FFmpeg

set -e

INSTALL_DIR="${INSTALL_DIR:-/opt/ffmpeg}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Installing FFmpeg to ${INSTALL_DIR}..."

# Create installation directory
sudo mkdir -p "${INSTALL_DIR}/bin"

# Copy binaries
sudo cp "${SCRIPT_DIR}/ffmpeg" "${INSTALL_DIR}/bin/"
sudo cp "${SCRIPT_DIR}/ffprobe" "${INSTALL_DIR}/bin/"

# Make executable
sudo chmod +x "${INSTALL_DIR}/bin/ffmpeg"
sudo chmod +x "${INSTALL_DIR}/bin/ffprobe"

# Create symlinks
sudo ln -sf "${INSTALL_DIR}/bin/ffmpeg" /usr/local/bin/ffmpeg
sudo ln -sf "${INSTALL_DIR}/bin/ffprobe" /usr/local/bin/ffprobe

# Install runtime dependencies (Ubuntu/Debian)
if command -v apt-get &> /dev/null; then
    echo "Installing runtime dependencies..."
    sudo apt-get update
    sudo apt-get install -y --no-install-recommends \
        libass9 \
        libfreetype6 \
        libgnutls30 \
        libmp3lame0 \
        libnuma1 \
        libopus0 \
        libtheora0 \
        libvdpau1 \
        libvorbis0a \
        libvorbisenc2 \
        libvpx7 \
        libwebp7 \
        libx264-163 \
        libx265-199 \
        libfdk-aac2 \
        libsrt1.4-gnutls \
        libxml2
fi

echo ""
echo "✅ FFmpeg installed successfully!"
echo ""
ffmpeg -version
echo ""
echo "Hardware accelerations available:"
ffmpeg -hwaccels
DEPLOY_SCRIPT

chmod +x deploy-ffmpeg.sh

# Create info file
cat > VERSION << EOF
FFmpeg Version: ${FFMPEG_VERSION}
Build Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Features: NVENC, NVDEC, CUDA, CUVID, libnpp
Codecs: x264, x265, VP8, VP9, AAC, MP3, Opus, Theora, Vorbis, WebP
EOF

# Create the distribution tarball
tar -czvf "ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz" \
    ffmpeg \
    ffprobe \
    deploy-ffmpeg.sh \
    VERSION

echo ""
echo "============================================"
echo "✅ Build Complete!"
echo "============================================"
echo ""
echo "Distribution package: ${OUTPUT_DIR}/ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz"
echo ""
echo "To deploy to an edge server:"
echo "  1. Copy ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz to the server"
echo "  2. Extract: tar -xzf ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz"
echo "  3. Run: ./deploy-ffmpeg.sh"
echo ""
echo "Or use SCP:"
echo "  scp ${OUTPUT_DIR}/ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz user@edge-server:/tmp/"
echo "  ssh user@edge-server 'cd /tmp && tar -xzf ffmpeg-nvidia-${FFMPEG_VERSION}.tar.gz && ./deploy-ffmpeg.sh'"
echo ""

