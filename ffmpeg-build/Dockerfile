# ============================================
# FFmpeg Build with NVENC/NVDEC Support
# ============================================
# This Dockerfile builds a static FFmpeg binary with:
# - NVENC (NVIDIA hardware encoding)
# - NVDEC (NVIDIA hardware decoding)
# - CUDA support
# - Common codecs and formats
# ============================================

FROM nvidia/cuda:12.2.0-devel-ubuntu22.04 AS builder

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install build dependencies
RUN apt-get update && apt-get install -y \
    autoconf \
    automake \
    build-essential \
    cmake \
    git \
    libass-dev \
    libfreetype6-dev \
    libgnutls28-dev \
    libmp3lame-dev \
    libnuma-dev \
    libopus-dev \
    libsdl2-dev \
    libtool \
    libva-dev \
    libvdpau-dev \
    libvorbis-dev \
    libvpx-dev \
    libx264-dev \
    libx265-dev \
    libxcb1-dev \
    libxcb-shm0-dev \
    libxcb-xfixes0-dev \
    meson \
    nasm \
    ninja-build \
    pkg-config \
    texinfo \
    wget \
    yasm \
    zlib1g-dev \
    libfdk-aac-dev \
    libtheora-dev \
    libwebp-dev \
    libaom-dev \
    libdav1d-dev \
    libsvtav1-dev \
    libsrt-gnutls-dev \
    libxml2-dev \
    && rm -rf /var/lib/apt/lists/*

# Create build directory
WORKDIR /build

# Install nv-codec-headers (required for NVENC/NVDEC)
RUN git clone https://git.videolan.org/git/ffmpeg/nv-codec-headers.git && \
    cd nv-codec-headers && \
    make install && \
    cd .. && rm -rf nv-codec-headers

# Clone FFmpeg
ARG FFMPEG_VERSION=6.1.1
RUN wget https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz && \
    tar xf ffmpeg-${FFMPEG_VERSION}.tar.xz && \
    mv ffmpeg-${FFMPEG_VERSION} ffmpeg

# Build FFmpeg with NVIDIA support
WORKDIR /build/ffmpeg

RUN ./configure \
    --prefix=/opt/ffmpeg \
    --pkg-config-flags="--static" \
    --extra-cflags="-I/usr/local/cuda/include" \
    --extra-ldflags="-L/usr/local/cuda/lib64" \
    --extra-libs="-lpthread -lm" \
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
    --enable-static \
    --disable-shared \
    --disable-debug \
    --disable-doc \
    && make -j$(nproc) \
    && make install

# ============================================
# Create minimal runtime image
# ============================================
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04 AS runtime

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
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
    libxml2 \
    && rm -rf /var/lib/apt/lists/*

# Copy FFmpeg binaries
COPY --from=builder /opt/ffmpeg/bin/ffmpeg /opt/ffmpeg/bin/ffmpeg
COPY --from=builder /opt/ffmpeg/bin/ffprobe /opt/ffmpeg/bin/ffprobe

# Create symlinks
RUN ln -s /opt/ffmpeg/bin/ffmpeg /usr/local/bin/ffmpeg && \
    ln -s /opt/ffmpeg/bin/ffprobe /usr/local/bin/ffprobe

# Verify installation
RUN ffmpeg -version && ffmpeg -hwaccels

CMD ["ffmpeg", "-version"]

