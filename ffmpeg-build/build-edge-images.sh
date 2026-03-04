#!/bin/bash
# ============================================
# Build Pre-built Edge Server Docker Images
# ============================================
# This script builds optimized Docker images for edge servers
# with FFmpeg pre-compiled (NVIDIA or CPU version).
#
# Usage:
#   ./build-edge-images.sh              # Build both images
#   ./build-edge-images.sh nvidia       # Build NVIDIA image only
#   ./build-edge-images.sh cpu          # Build CPU image only
#   ./build-edge-images.sh push         # Build and push to registry
#
# Environment Variables:
#   DOCKER_REGISTRY - Docker registry URL (e.g., docker.io/myuser)
#   IMAGE_TAG       - Additional tag (default: latest)
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REGISTRY="${DOCKER_REGISTRY:-}"
TAG="${IMAGE_TAG:-latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if backend is built
check_backend() {
    if [ ! -d "$PROJECT_ROOT/iptv-server/dist" ]; then
        log_error "Backend not built. Run 'cd iptv-server && npm run build' first."
        exit 1
    fi
    log_info "Backend build found"
}

# Build NVIDIA image
build_nvidia() {
    log_info "Building NVIDIA-enabled edge server image..."
    log_warn "This may take 20-30 minutes (FFmpeg compilation with NVENC support)"
    
    cd "$PROJECT_ROOT"
    
    docker build \
        -t iptv-edge:nvidia \
        -t iptv-edge:nvidia-${TAG} \
        -f ffmpeg-build/Dockerfile.edge-nvidia \
        .
    
    log_success "NVIDIA image built: iptv-edge:nvidia"
    
    # Show image size
    SIZE=$(docker images iptv-edge:nvidia --format "{{.Size}}")
    log_info "Image size: $SIZE"
}

# Build CPU image
build_cpu() {
    log_info "Building CPU-only edge server image..."
    
    cd "$PROJECT_ROOT"
    
    docker build \
        -t iptv-edge:cpu \
        -t iptv-edge:cpu-${TAG} \
        -f ffmpeg-build/Dockerfile.edge-cpu \
        .
    
    log_success "CPU image built: iptv-edge:cpu"
    
    # Show image size
    SIZE=$(docker images iptv-edge:cpu --format "{{.Size}}")
    log_info "Image size: $SIZE"
}

# Push images to registry
push_images() {
    if [ -z "$REGISTRY" ]; then
        log_error "DOCKER_REGISTRY environment variable not set"
        log_info "Usage: DOCKER_REGISTRY=docker.io/myuser ./build-edge-images.sh push"
        exit 1
    fi
    
    log_info "Pushing images to registry: $REGISTRY"
    
    # Tag and push NVIDIA image
    if docker images iptv-edge:nvidia -q | grep -q .; then
        log_info "Pushing NVIDIA image..."
        docker tag iptv-edge:nvidia ${REGISTRY}/iptv-edge:nvidia
        docker tag iptv-edge:nvidia ${REGISTRY}/iptv-edge:nvidia-${TAG}
        docker push ${REGISTRY}/iptv-edge:nvidia
        docker push ${REGISTRY}/iptv-edge:nvidia-${TAG}
        log_success "NVIDIA image pushed to ${REGISTRY}/iptv-edge:nvidia"
    fi
    
    # Tag and push CPU image
    if docker images iptv-edge:cpu -q | grep -q .; then
        log_info "Pushing CPU image..."
        docker tag iptv-edge:cpu ${REGISTRY}/iptv-edge:cpu
        docker tag iptv-edge:cpu ${REGISTRY}/iptv-edge:cpu-${TAG}
        docker push ${REGISTRY}/iptv-edge:cpu
        docker push ${REGISTRY}/iptv-edge:cpu-${TAG}
        log_success "CPU image pushed to ${REGISTRY}/iptv-edge:cpu"
    fi
}

# Show usage
show_usage() {
    echo "Usage: $0 [nvidia|cpu|push|all]"
    echo ""
    echo "Commands:"
    echo "  nvidia  - Build NVIDIA GPU-enabled image (with hardware transcoding)"
    echo "  cpu     - Build CPU-only image (software transcoding)"
    echo "  push    - Push built images to Docker registry"
    echo "  all     - Build both images (default)"
    echo ""
    echo "Environment Variables:"
    echo "  DOCKER_REGISTRY - Registry URL for push (e.g., docker.io/username)"
    echo "  IMAGE_TAG       - Additional version tag (default: latest)"
    echo ""
    echo "Examples:"
    echo "  $0 nvidia                                    # Build NVIDIA image"
    echo "  $0 cpu                                       # Build CPU image"
    echo "  DOCKER_REGISTRY=docker.io/myuser $0 push    # Push to Docker Hub"
}

# Main
main() {
    log_info "Edge Server Image Builder"
    echo "================================"
    
    check_backend
    
    case "${1:-all}" in
        nvidia)
            build_nvidia
            ;;
        cpu)
            build_cpu
            ;;
        push)
            build_nvidia
            build_cpu
            push_images
            ;;
        all)
            build_nvidia
            build_cpu
            ;;
        help|--help|-h)
            show_usage
            ;;
        *)
            log_error "Unknown command: $1"
            show_usage
            exit 1
            ;;
    esac
    
    echo ""
    log_success "Done!"
    echo ""
    echo "To deploy to an edge server:"
    echo "  1. Push to registry: DOCKER_REGISTRY=your-registry $0 push"
    echo "  2. On edge server:   docker pull your-registry/iptv-edge:nvidia"
    echo "  3. Or use the admin panel's Deploy Edge Server wizard"
}

main "$@"

