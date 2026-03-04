# FFmpeg Build for IPTV Edge Servers

This directory contains everything needed to build FFmpeg and deploy it to edge servers, with or without GPU support.

## Build Options

| Version | Use Case | Requirements |
|---------|----------|--------------|
| **GPU (NVIDIA)** | High-performance transcoding | NVIDIA GPU + drivers |
| **CPU Only** | Servers without GPUs | Any x86_64 server |

## Quick Start

```bash
# Build for servers WITH NVIDIA GPUs
./build.sh gpu

# Build for servers WITHOUT GPUs  
./build.sh cpu

# Build both versions
./build.sh both
```

## Features

### GPU Version (NVIDIA)
- **NVENC**: NVIDIA hardware video encoding (H.264, HEVC)
- **NVDEC**: NVIDIA hardware video decoding
- **CUDA**: GPU-accelerated video processing
- **CUVID**: CUDA Video Decoder
- **libnpp**: NVIDIA Performance Primitives

### CPU Version
- **x264/x265**: Optimized software encoding
- **libvpx**: VP8/VP9 encoding
- **SVT-AV1**: Fast AV1 encoding
- **Multi-threaded**: Uses all CPU cores

## Supported Codecs

| Codec | Encode | Decode | Hardware |
|-------|--------|--------|----------|
| H.264/AVC | ✅ | ✅ | NVENC/NVDEC |
| H.265/HEVC | ✅ | ✅ | NVENC/NVDEC |
| VP8 | ✅ | ✅ | Software |
| VP9 | ✅ | ✅ | NVDEC (decode only) |
| AV1 | ❌ | ✅ | NVDEC (decode only) |
| AAC | ✅ | ✅ | Software |
| MP3 | ✅ | ✅ | Software |
| Opus | ✅ | ✅ | Software |

## Building FFmpeg

### Universal Build Script

```bash
cd /root/xtream/ffmpeg-build

# For servers WITH NVIDIA GPUs
./build.sh gpu

# For servers WITHOUT GPUs
./build.sh cpu

# Build both
./build.sh both
```

### Output Files

| Build | Output File |
|-------|-------------|
| GPU | `dist/ffmpeg-nvidia-6.1.1.tar.gz` |
| CPU | `dist/ffmpeg-cpu-6.1.1.tar.gz` |

### Build Edge Server Docker Images

```bash
cd /root/xtream

# GPU version (requires NVIDIA GPU)
docker build -f ffmpeg-build/Dockerfile.edge-server -t iptv-edge-server:nvidia .

# CPU version (no GPU required)
docker build -f ffmpeg-build/Dockerfile.edge-server-cpu -t iptv-edge-server:cpu .
```

## Deploying to Edge Servers

### Manual Deployment

1. Copy the distribution package to the edge server:
```bash
scp dist/ffmpeg-nvidia-6.1.1.tar.gz user@edge-server:/tmp/
```

2. SSH into the server and install:
```bash
ssh user@edge-server
cd /tmp
tar -xzf ffmpeg-nvidia-6.1.1.tar.gz
./deploy-ffmpeg.sh
```

### Automated Deployment

Use the deployment script to automatically set up edge servers:

```bash
./deploy-edge-server.sh 192.168.1.100 \
    --name eu-edge-01 \
    --external-ip 1.2.3.4 \
    --main-panel http://main-panel:3001 \
    --api-key your-server-api-key \
    --max-conn 5000
```

### Docker Compose Deployment

On servers with Docker and NVIDIA Container Toolkit:

```bash
# Copy files to the server
scp -r ffmpeg-build docker-compose.edge.yml user@edge-server:/opt/iptv/

# Configure environment
ssh user@edge-server
cd /opt/iptv
cat > .env << EOF
SERVER_NAME=eu-edge-01
EXTERNAL_IP=1.2.3.4
MAIN_PANEL_URL=http://main-panel:3001
SERVER_API_KEY=your-api-key
DATABASE_URL=postgresql://user:pass@main-panel:5432/iptv
JWT_SECRET=your-jwt-secret
EOF

# Start the edge server
docker-compose -f ffmpeg-build/docker-compose.edge.yml up -d
```

## Transcoding Examples

### CPU Encoding (x264 - No GPU)

```bash
# Fast encoding (for live streaming)
ffmpeg -i input.mp4 \
    -c:v libx264 -preset veryfast -crf 23 \
    -c:a aac -b:a 128k \
    output.mp4

# Better quality (for VOD)
ffmpeg -i input.mp4 \
    -c:v libx264 -preset medium -crf 20 \
    -c:a aac -b:a 192k \
    output.mp4

# HLS live transcoding (CPU)
ffmpeg -i rtmp://source/live/stream \
    -c:v libx264 -preset veryfast -tune zerolatency -b:v 3M \
    -c:a aac -b:a 128k \
    -f hls -hls_time 2 -hls_list_size 5 \
    /tmp/hls/stream.m3u8
```

### GPU Encoding (NVENC - Requires NVIDIA)

### H.264 encoding with NVENC
```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
    -i input.mp4 \
    -c:v h264_nvenc -preset p4 -tune hq -b:v 5M \
    -c:a aac -b:a 128k \
    output.mp4
```

### HEVC encoding with NVENC
```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
    -i input.mp4 \
    -c:v hevc_nvenc -preset p4 -tune hq -b:v 3M \
    -c:a aac -b:a 128k \
    output.mp4
```

### HLS transcoding with hardware acceleration
```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
    -i rtmp://source/live/stream \
    -c:v h264_nvenc -preset p4 -b:v 4M -maxrate 4M -bufsize 8M \
    -c:a aac -b:a 128k \
    -f hls -hls_time 2 -hls_list_size 5 -hls_flags delete_segments \
    /tmp/hls/stream.m3u8
```

### Multi-bitrate HLS with NVIDIA
```bash
ffmpeg -hwaccel cuda -hwaccel_output_format cuda \
    -i input.mp4 \
    -filter_complex "[0:v]split=3[v1][v2][v3]; \
        [v1]scale_cuda=1920:1080[v1out]; \
        [v2]scale_cuda=1280:720[v2out]; \
        [v3]scale_cuda=854:480[v3out]" \
    -map "[v1out]" -c:v:0 h264_nvenc -b:v:0 5M \
    -map "[v2out]" -c:v:1 h264_nvenc -b:v:1 3M \
    -map "[v3out]" -c:v:2 h264_nvenc -b:v:2 1M \
    -map a:0 -c:a aac -b:a 128k \
    -f hls -hls_time 4 \
    -master_pl_name master.m3u8 \
    -var_stream_map "v:0,a:0 v:1,a:0 v:2,a:0" \
    stream_%v.m3u8
```

## Requirements

### Build Server
- Docker with BuildKit support
- At least 16GB RAM (for compilation)
- 50GB free disk space

### Edge Servers (with GPU)
- NVIDIA GPU (GTX 1000 series or newer recommended)
- NVIDIA drivers 470+ installed
- NVIDIA Container Toolkit (for Docker)
- Ubuntu 20.04/22.04 or similar

### Edge Servers (without GPU)
- Works with software encoding (slower)
- Recommended: High-performance CPU

## Troubleshooting

### "CUDA not found" during encoding
```bash
# Check if NVIDIA drivers are installed
nvidia-smi

# Check if CUDA is visible in container
docker run --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
```

### "NVENC not available"
```bash
# Check FFmpeg capabilities
ffmpeg -encoders | grep nvenc

# Verify NVENC support
nvidia-smi -q | grep Encoder
```

### Container can't access GPU
```bash
# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

## Performance Tips

1. **Use CUDA hardware acceleration for decoding**:
   ```bash
   -hwaccel cuda -hwaccel_output_format cuda
   ```

2. **Choose the right NVENC preset**:
   - `p1` (fastest) to `p7` (slowest/best quality)
   - `p4` is a good balance

3. **Enable B-frames for better compression**:
   ```bash
   -bf 3
   ```

4. **Use lookahead for better quality**:
   ```bash
   -rc-lookahead 32
   ```

5. **Keep video in GPU memory**:
   Use `scale_cuda` instead of `scale` for resizing

