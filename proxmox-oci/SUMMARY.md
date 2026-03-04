# Proxmox 9.1 OCI Container Conversion - Summary

## What Was Created

This conversion provides a complete Proxmox 9.1 OCI container deployment as an alternative to Docker Compose, using Podman and systemd for native integration with Proxmox VE.

## Directory Structure

```
proxmox-oci/
├── README.md                  # Main documentation
├── QUICKSTART.md             # 5-minute deployment guide
├── MIGRATION_GUIDE.md        # Docker to Proxmox migration steps
├── DOCKER_VS_PROXMOX.md      # Detailed comparison
├── ADVANCED.md               # Advanced configurations
├── SUMMARY.md                # This file
├── Makefile                  # Convenience commands
├── .env.example              # Environment template
├── quadlet/                  # Systemd Quadlet configurations
│   ├── iptv-pod.pod          # Pod definition
│   ├── iptv-postgres.container
│   ├── iptv-redis.container
│   ├── iptv-backend.container
│   ├── iptv-frontend.container
│   ├── iptv-adminer.container
│   ├── iptv-postgres.volume
│   ├── iptv-redis.volume
│   ├── iptv-hls.volume
│   ├── iptv-cache.volume
│   └── iptv-logs.volume
└── scripts/                  # Management scripts
    ├── deploy.sh             # Automated deployment
    ├── update.sh             # Update images and restart
    ├── backup.sh             # Backup database and volumes
    ├── restore.sh            # Restore from backup
    ├── logs.sh               # View logs
    └── status.sh             # Check system status
```

## Key Features

### 1. Native Proxmox Integration
- Uses Podman (OCI-compliant runtime)
- Managed by systemd (native init system)
- Integrates with Proxmox monitoring and management
- No separate daemon required

### 2. Pod Architecture
All containers run in a single Podman pod:
- Shared network namespace (containers communicate via localhost)
- Lower network overhead
- Simpler networking model
- Similar to Kubernetes pods

### 3. Systemd Quadlet
Declarative container definitions:
- `.pod` files define pods
- `.container` files define containers
- `.volume` files define persistent storage
- Automatic systemd unit generation
- Native service management

### 4. Management Scripts
Convenient shell scripts for common operations:
- **deploy.sh** - Full automated deployment
- **update.sh** - Rolling updates
- **backup.sh** - Automated backups
- **restore.sh** - Point-in-time recovery
- **logs.sh** - Centralized log viewing
- **status.sh** - Health monitoring

### 5. Makefile Commands
Quick access to common tasks:
```bash
make install      # Full installation
make start        # Start services
make stop         # Stop services
make restart      # Restart services
make status       # Show status
make logs         # View logs
make backup       # Backup data
make update       # Update images
```

## Component Mapping

| Docker Compose | Proxmox OCI | Description |
|----------------|-------------|-------------|
| `docker-compose.yml` | `quadlet/*.{pod,container,volume}` | Service definitions |
| `docker-compose up -d` | `systemctl start iptv-pod.service` | Start services |
| `docker-compose down` | `systemctl stop iptv-pod.service` | Stop services |
| `docker-compose logs` | `journalctl -u service.name` | View logs |
| `docker-compose ps` | `podman ps --pod` | List containers |
| `docker exec` | `podman exec` | Execute commands |
| Docker networks | Podman pod | Container networking |
| Docker volumes | systemd-managed volumes | Persistent storage |

## Configuration Files

### Pod Definition (`iptv-pod.pod`)
Defines the pod and published ports:
- Port 3000: Frontend
- Port 3001: Backend API
- Port 5432: PostgreSQL
- Port 6379: Redis
- Port 8080: Adminer (optional)

### Container Definitions
Each service has a `.container` file:
- **iptv-postgres.container** - PostgreSQL 15 database
- **iptv-redis.container** - Redis 7 cache
- **iptv-backend.container** - Node.js API server
- **iptv-frontend.container** - Next.js web app
- **iptv-adminer.container** - Database UI (optional)

### Volume Definitions
Persistent storage mappings:
- **iptv-postgres.volume** - Database data
- **iptv-redis.volume** - Redis persistence
- **iptv-hls.volume** - HLS segments
- **iptv-cache.volume** - Image cache
- **iptv-logs.volume** - Application logs

## Deployment Options

### Option 1: Automated Deployment
```bash
cd /storage-pool/xtream
./proxmox-oci/scripts/deploy.sh
```
Handles everything automatically.

### Option 2: Manual Deployment
```bash
# Build images
podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server
podman build -t iptv-frontend:latest -f iptv-frontend/Dockerfile ./iptv-frontend

# Deploy configs
cp proxmox-oci/quadlet/* /etc/containers/systemd/
systemctl daemon-reload

# Start services
systemctl start iptv-pod.service

# Initialize database
podman exec iptv-backend npx prisma migrate deploy
podman exec iptv-backend node dist/scripts/seed.js
```

### Option 3: Using Makefile
```bash
cd /storage-pool/xtream/proxmox-oci
make install
```

## Advantages Over Docker Compose

1. **Native Integration** - Managed by systemd, not a separate daemon
2. **Better Security** - Rootless by default, no privileged daemon
3. **Resource Management** - Native cgroups v2 integration
4. **Monitoring** - Centralized logging with journald
5. **Performance** - Pod networking eliminates bridge overhead
6. **Backup** - Explicit volume paths, easier to backup
7. **Proxmox Integration** - Better integration with Proxmox tools

## Migration Path

The migration from Docker Compose is straightforward:

1. **Backup Docker deployment**
2. **Install Podman on Proxmox**
3. **Build/transfer images**
4. **Deploy Quadlet configs**
5. **Restore data**
6. **Start services**

Estimated time: 30-60 minutes  
Downtime: 5-10 minutes

See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) for detailed steps.

## Resource Requirements

| Component | CPU | RAM | Disk |
|-----------|-----|-----|------|
| PostgreSQL | 0.5 cores | 512MB | 5GB+ |
| Redis | 0.25 cores | 256MB | 1GB |
| Backend | 1-2 cores | 2GB | 2GB |
| Frontend | 0.5 cores | 512MB | 500MB |
| **Minimum** | **2 cores** | **4GB** | **10GB** |
| **Recommended** | **4 cores** | **8GB** | **50GB** |

## Compatibility

- **Proxmox VE:** 9.1 or later
- **Podman:** 4.9 or later
- **Linux Kernel:** 5.15 or later (for cgroups v2)
- **Storage:** Any (ext4, xfs, zfs, btrfs)
- **Architecture:** amd64 (x86_64)

## Documentation

- **[README.md](README.md)** - Complete documentation
- **[QUICKSTART.md](QUICKSTART.md)** - Quick deployment guide
- **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Migration from Docker
- **[DOCKER_VS_PROXMOX.md](DOCKER_VS_PROXMOX.md)** - Detailed comparison
- **[ADVANCED.md](ADVANCED.md)** - Advanced configurations

## Management Commands

### Quick Reference

```bash
# Service control
systemctl start iptv-pod.service
systemctl stop iptv-pod.service
systemctl restart iptv-pod.service
systemctl status iptv-pod.service
systemctl enable iptv-pod.service

# Container management
podman ps --pod
podman pod ps
podman logs iptv-backend
podman exec -it iptv-backend bash

# Health checks
./proxmox-oci/scripts/status.sh
podman healthcheck run iptv-backend

# Logs
journalctl -u iptv-backend.service -f
./proxmox-oci/scripts/logs.sh backend

# Backup/Restore
./proxmox-oci/scripts/backup.sh
./proxmox-oci/scripts/restore.sh

# Updates
./proxmox-oci/scripts/update.sh

# Using Makefile
make start
make stop
make restart
make status
make logs
make backup
```

## Support and Troubleshooting

### Common Issues

1. **Containers won't start**
   - Check logs: `journalctl -u iptv-backend.service`
   - Verify images: `podman images`
   - Check permissions: `ls -la /storage-pool/xtream-data/`

2. **Database connection errors**
   - Verify PostgreSQL: `podman exec iptv-postgres pg_isready`
   - Check network: `podman pod inspect iptv-pod`

3. **Permission denied**
   - Fix ownership: `chown -R 100000:100000 /storage-pool/xtream-data`

### Getting Help

- View logs: `./proxmox-oci/scripts/logs.sh all`
- Check status: `./proxmox-oci/scripts/status.sh`
- Proxmox forums: https://forum.proxmox.com/
- Podman documentation: https://docs.podman.io/

## Next Steps

After deployment:

1. **Configure Environment** - Edit `/etc/containers/systemd/iptv-backend.container`
2. **Enable Auto-Start** - `systemctl enable iptv-pod.service`
3. **Set Up Backups** - Schedule `backup.sh` with cron
4. **Configure Firewall** - Allow ports 3000, 3001
5. **Set Up Monitoring** - Integrate with Proxmox monitoring
6. **Test Failover** - Verify restart behavior
7. **Document Changes** - Update team documentation

## Production Checklist

- [ ] Change default passwords
- [ ] Configure TMDB API key
- [ ] Set up SSL/TLS (reverse proxy)
- [ ] Configure firewall rules
- [ ] Enable auto-start (`systemctl enable`)
- [ ] Schedule backups (cron)
- [ ] Set up monitoring/alerts
- [ ] Test disaster recovery
- [ ] Document deployment
- [ ] Train team on new commands

## Conclusion

This Proxmox OCI conversion provides a production-ready, native container deployment for Proxmox VE 9.1. It offers better integration, security, and performance compared to Docker Compose while maintaining compatibility with the same container images.

The conversion preserves all functionality of the Docker Compose deployment while providing:
- Native systemd integration
- Better resource management
- Improved security (rootless)
- Centralized logging
- Easier backup/restore
- Better Proxmox integration

All original Dockerfiles remain unchanged, ensuring compatibility with both deployment methods.
