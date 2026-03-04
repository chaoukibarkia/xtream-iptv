#!/bin/bash
# ============================================
# FFmpeg Build Script - Universal
# ============================================
# Build FFmpeg with or without GPU support
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

print_usage() {
    echo ""
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║           FFmpeg Build Script for IPTV Edge Servers          ║"
    echo "╠══════════════════════════════════════════════════════════════╣"
    echo "║                                                              ║"
    echo "║  Usage: ./build.sh [gpu|cpu|both]                            ║"
    echo "║                                                              ║"
    echo "║  Options:                                                    ║"
    echo "║    gpu   - Build with NVIDIA NVENC/NVDEC support             ║"
    echo "║    cpu   - Build CPU-only version (no GPU required)          ║"
    echo "║    both  - Build both versions                               ║"
    echo "║                                                              ║"
    echo "║  Examples:                                                   ║"
    echo "║    ./build.sh gpu      # For servers with NVIDIA GPUs        ║"
    echo "║    ./build.sh cpu      # For servers without GPUs            ║"
    echo "║    ./build.sh both     # Build both versions                 ║"
    echo "║                                                              ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo ""
}

build_gpu() {
    echo ""
    echo "🎮 Building FFmpeg with NVIDIA GPU support..."
    echo ""
    "${SCRIPT_DIR}/build-ffmpeg.sh"
}

build_cpu() {
    echo ""
    echo "💻 Building FFmpeg for CPU-only servers..."
    echo ""
    "${SCRIPT_DIR}/build-ffmpeg-cpu.sh"
}

case "${1}" in
    gpu)
        build_gpu
        ;;
    cpu)
        build_cpu
        ;;
    both)
        build_gpu
        build_cpu
        ;;
    *)
        print_usage
        exit 1
        ;;
esac

echo ""
echo "============================================"
echo "📦 Build packages available in: ${SCRIPT_DIR}/dist/"
echo "============================================"
ls -lh "${SCRIPT_DIR}/dist/"*.tar.gz 2>/dev/null || echo "No packages built yet."
echo ""

