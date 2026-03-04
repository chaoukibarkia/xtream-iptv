# Proxmox 9.1 OCI Container Deployment Guide

This directory contains configuration files and scripts to deploy the IPTV system using Proxmox 9.1's native OCI container support (via Podman/systemd).

## Overview

Proxmox 9.1 introduces native OCI container support, replacing traditional LXC containers for many use cases. This deployment uses:
- **Podman** for OCI-compliant container runtime
- **systemd** for container lifecycle management
- **Podman Quadlet** for declarative container definitions
- **Pod networking** for service communication

## Architecture

The system is deployed as a Podman pod with 5 containers:
1. **postgres** - PostgreSQL 15 database
2. **redis** - Redis cache
3. **backend** - Fastify API server (Node.js)
4. **frontend** - Next.js web application
5. **adminer** - Database management UI (optional)

All containers run in a single pod sharing network namespace, similar to Kubernetes pods.

## Prerequisites

### On Proxmox Host

```bash
# Update Proxmox to 9.1+
apt update && apt full-upgrade

# Install Podman and dependencies
apt install -y podman crun fuse-overlayfs slirp4netns

# Verify Podman installation
podman --version  # Should be 4.9+

# Enable lingering for root user (allows systemd user services)
loginctl enable-linger root
```

### Storage Preparation

```bash
# Create storage directories on Proxmox host
mkdir -p /storage-pool/xtream-data/{postgres,redis,hls-segments,image-cache,logs}

# Set permissions
chown -R 100000:100000 /storage-pool/xtream-data
```

## Installation Steps

### 1. Build Container Images

You can either build locally or use pre-built images:

#### Option A: Build on Proxmox Host

```bash
cd /storage-pool/xtream

# Build backend image
podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server

# Build frontend image
podman build -t iptv-frontend:latest -f iptv-frontend/Dockerfile ./iptv-frontend

# Verify images
podman images
```

#### Option B: Build and Transfer from Docker

```bash
# On Docker host, build and save images
docker build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server
docker build -t iptv-frontend:latest -f iptv-frontend/Dockerfile ./iptv-frontend

docker save iptv-backend:latest | gzip > iptv-backend.tar.gz
docker save iptv-frontend:latest | gzip > iptv-frontend.tar.gz

# Transfer to Proxmox host
scp iptv-*.tar.gz root@proxmox:/tmp/

# On Proxmox, load images
podman load < /tmp/iptv-backend.tar.gz
podman load < /tmp/iptv-frontend.tar.gz
```

### 2. Deploy Quadlet Configuration

```bash
# Copy Quadlet files to systemd directory
cp -r proxmox-oci/quadlet/* /etc/containers/systemd/

# Reload systemd to discover new units
systemctl daemon-reload

# Start the pod and all containers
systemctl start iptv-pod.service

# Enable auto-start on boot
systemctl enable iptv-pod.service

# Check status
systemctl status iptv-pod.service
podman pod ps
podman ps --pod
```

### 3. Initialize Database

```bash
# Wait for PostgreSQL to be ready
sleep 10

# Run Prisma migrations
podman exec iptv-backend npx prisma migrate deploy

# Seed database
podman exec iptv-backend node dist/scripts/seed.js
```

### 4. Verify Deployment

```bash
# Check container logs
podman logs iptv-backend
podman logs iptv-frontend
podman logs iptv-postgres

# Check pod networking
podman pod inspect iptv-pod

# Test backend health
curl http://localhost:3001/health

# Test frontend
curl http://localhost:3000
```

## Configuration

### Environment Variables

Edit `/etc/containers/systemd/iptv-backend.container` to modify environment variables:

```ini
Environment=DATABASE_URL=postgresql://iptv:iptv_secret@localhost:5432/iptv_db
Environment=REDIS_URL=redis://localhost:6379
Environment=TMDB_API_KEY=your-api-key-here
Environment=SERVER_URL=http://your-domain.com
```

After changes:
```bash
systemctl daemon-reload
systemctl restart iptv-backend.service
```

### Persistent Storage

Volumes are mapped in Quadlet `.volume` files:
- `iptv-postgres-data` → `/storage-pool/xtream-data/postgres`
- `iptv-redis-data` → `/storage-pool/xtream-data/redis`
- `iptv-hls-segments` → `/storage-pool/xtream-data/hls-segments`

### Network Ports

Exposed on Proxmox host:
- **3000** - Frontend (Next.js)
- **3001** - Backend API (Fastify)
- **5432** - PostgreSQL (for external tools)
- **6379** - Redis (for external tools)
- **8080** - Adminer (optional)

Configure Proxmox firewall rules as needed.

## Management Commands

### Start/Stop Services

```bash
# Start all services
systemctl start iptv-pod.service

# Stop all services
systemctl stop iptv-pod.service

# Restart specific container
systemctl restart iptv-backend.service

# View logs
journalctl -u iptv-backend.service -f
podman logs -f iptv-backend
```

### Updates

```bash
# Pull/build new images
podman pull iptv-backend:latest

# Restart containers to use new images
systemctl restart iptv-backend.service
```

### Backups

```bash
# Backup PostgreSQL
podman exec iptv-postgres pg_dump -U iptv iptv_db > backup-$(date +%Y%m%d).sql

# Backup volumes
tar czf iptv-data-backup-$(date +%Y%m%d).tar.gz /storage-pool/xtream-data/

# Restore
podman exec -i iptv-postgres psql -U iptv iptv_db < backup.sql
```

### Monitoring

```bash
# Resource usage
podman stats

# Container health
podman healthcheck run iptv-backend
podman healthcheck run iptv-frontend

# Pod status
podman pod ps
podman pod inspect iptv-pod
```

## Troubleshooting

### Container Won't Start

```bash
# Check systemd status
systemctl status iptv-backend.service

# View full logs
journalctl -u iptv-backend.service --no-pager

# Check Podman events
podman events --since 1h
```

### Database Connection Issues

```bash
# Verify PostgreSQL is running
podman exec iptv-postgres pg_isready -U iptv

# Check network connectivity within pod
podman exec iptv-backend ping localhost
podman exec iptv-backend curl http://localhost:5432
```

### Permission Errors

```bash
# Fix volume permissions
chown -R 100000:100000 /storage-pool/xtream-data
podman unshare chown -R 1001:1001 /storage-pool/xtream-data/hls-segments
```

### Reset Everything

```bash
# Stop and remove all containers and pod
systemctl stop iptv-pod.service
podman pod rm -f iptv-pod
podman rm -f iptv-postgres iptv-redis iptv-backend iptv-frontend iptv-adminer

# Clean volumes (DESTRUCTIVE!)
rm -rf /storage-pool/xtream-data/*

# Restart from Step 2
```

## Migration from Docker Compose

### Data Migration

1. **Backup Docker volumes:**
   ```bash
   docker compose -f docker-compose.yml exec postgres pg_dump -U iptv iptv_db > backup.sql
   docker cp $(docker compose ps -q postgres):/var/lib/postgresql/data /tmp/postgres-backup
   ```

2. **Transfer to Proxmox:**
   ```bash
   scp backup.sql root@proxmox:/tmp/
   ```

3. **Restore to Podman:**
   ```bash
   podman exec -i iptv-postgres psql -U iptv iptv_db < /tmp/backup.sql
   ```

### Configuration Migration

Docker Compose environment variables map directly to Quadlet `Environment=` directives. Copy values from `docker-compose.yml` to corresponding `.container` files.

## Advanced Configuration

### Using GPU for FFmpeg (NVENC)

If Proxmox host has NVIDIA GPU:

```bash
# Install NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://nvidia.github.io/libnvidia-container/stable/deb/$(. /etc/os-release; echo $ID$VERSION_ID)/$(dpkg --print-architecture) /" | tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt update && apt install -y nvidia-container-toolkit

# Configure Podman to use nvidia runtime
nvidia-ctk runtime configure --runtime=podman
```

Add to `iptv-backend.container`:
```ini
[Container]
SecurityOpt=label=disable
Device=/dev/nvidia0
Device=/dev/nvidiactl
Device=/dev/nvidia-uvm
```

### Rootless Deployment

For better security, run as non-root user:

```bash
# Create service user
useradd -m -s /bin/bash iptv-user
loginctl enable-linger iptv-user

# Copy Quadlet files to user directory
mkdir -p /home/iptv-user/.config/containers/systemd
cp proxmox-oci/quadlet/* /home/iptv-user/.config/containers/systemd/
chown -R iptv-user:iptv-user /home/iptv-user/.config

# Switch to user and enable services
su - iptv-user
systemctl --user daemon-reload
systemctl --user enable --now iptv-pod.service
```

### Multi-Server Deployment

For load-balanced edge servers, deploy on multiple Proxmox hosts and configure via backend API.

## Performance Tuning

### CPU/Memory Limits

Edit Quadlet files to add resource limits:

```ini
[Container]
CPUQuota=200%
MemoryLimit=4G
MemorySwap=4G
```

### Network Performance

Enable host networking for better throughput (loses pod isolation):

```ini
[Container]
Network=host
```

### Storage Performance

Use ZFS or LVM thin pools for better I/O:

```bash
podman volume create --driver local --opt type=none --opt device=/tank/iptv-data --opt o=bind iptv-postgres-data
```

## Support

- Proxmox VE Documentation: https://pve.proxmox.com/pve-docs/
- Podman Quadlet: https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html
- Project Issues: Check main repository documentation

## License

Same as main IPTV project.
