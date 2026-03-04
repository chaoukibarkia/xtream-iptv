# Proxmox OCI - Quick Reference Cheatsheet

## 🚀 Quick Commands

### Deployment
```bash
# Full automated deployment
./scripts/deploy.sh

# Or using Makefile
make install
```

### Service Control
```bash
# Start all services
systemctl start iptv-pod.service
# or: make start

# Stop all services
systemctl stop iptv-pod.service
# or: make stop

# Restart all
systemctl restart iptv-pod.service
# or: make restart

# Restart individual service
systemctl restart iptv-backend.service
# or: make restart-backend
```

### Status & Monitoring
```bash
# Complete status check
./scripts/status.sh
# or: make status

# Check specific service
systemctl status iptv-backend.service

# Pod status
podman pod ps

# Container list
podman ps --pod

# Resource usage
podman stats
# or: make stats
```

### Logs
```bash
# Backend logs (follow)
./scripts/logs.sh backend
# or: make logs

# All logs
./scripts/logs.sh all
# or: make logs-all

# Using journalctl directly
journalctl -u iptv-backend.service -f
journalctl -u iptv-backend.service -n 100
```

### Backup & Restore
```bash
# Backup
./scripts/backup.sh
# or: make backup

# Restore
./scripts/restore.sh /path/to/backup.sql.gz
# or: make restore FILE=backup.sql
```

### Updates
```bash
# Update images and restart
./scripts/update.sh
# or: make update
```

### Database Operations
```bash
# Run migrations
podman exec iptv-backend npx prisma migrate deploy
# or: make db-migrate

# Seed database
podman exec iptv-backend node dist/scripts/seed.js
# or: make db-seed

# Connect to database
podman exec -it iptv-postgres psql -U iptv iptv_db
# or: make shell-postgres

# Backup database only
make db-backup
```

### Container Shell Access
```bash
# Backend shell
podman exec -it iptv-backend /bin/sh
# or: make shell-backend

# PostgreSQL shell
podman exec -it iptv-postgres psql -U iptv iptv_db
# or: make shell-postgres

# Redis CLI
podman exec -it iptv-redis redis-cli
# or: make shell-redis
```

## 📁 Important Paths

### Configuration
```
/etc/containers/systemd/          # Quadlet unit files
/etc/containers/systemd/iptv-*    # All IPTV services
```

### Data
```
/storage-pool/xtream-data/postgres/      # Database data
/storage-pool/xtream-data/redis/         # Redis data
/storage-pool/xtream-data/hls-segments/  # Stream segments
/storage-pool/xtream-data/image-cache/   # Cached images
/storage-pool/xtream-data/logs/          # Application logs
```

### Backups
```
/storage-pool/xtream-backups/    # Default backup location
```

## 🔍 Troubleshooting

### Container Won't Start
```bash
# Check systemd status
systemctl status iptv-backend.service

# View recent logs
journalctl -u iptv-backend.service -n 50

# Check Podman events
podman events --since 1h

# Check image exists
podman images | grep iptv
```

### Database Connection Issues
```bash
# Check PostgreSQL is ready
podman exec iptv-postgres pg_isready -U iptv

# Test network within pod
podman exec iptv-backend ping localhost

# Verify DATABASE_URL
podman exec iptv-backend env | grep DATABASE_URL
```

### Permission Errors
```bash
# Fix volume permissions
chown -R 100000:100000 /storage-pool/xtream-data

# For HLS segments (specific user)
podman unshare chown -R 1001:1001 /storage-pool/xtream-data/hls-segments
```

### High CPU/Memory
```bash
# Check resource usage
podman stats

# View top processes in container
podman top iptv-backend

# Check FFmpeg processes
ps aux | grep ffmpeg
```

### Logs Not Showing
```bash
# Check systemd journal
journalctl -u iptv-backend.service --no-pager -n 100

# Container logs directly
podman logs iptv-backend

# Check log driver
podman inspect iptv-backend | grep LogDriver
```

## 🔧 Configuration Changes

### Update Environment Variables
```bash
# Edit backend container
nano /etc/containers/systemd/iptv-backend.container

# Reload systemd
systemctl daemon-reload

# Restart service
systemctl restart iptv-backend.service
```

### Change Resource Limits
```bash
# Edit container file
nano /etc/containers/systemd/iptv-backend.container

# Add under [Container] section:
# CPUQuota=200%
# MemoryLimit=4G

# Reload and restart
systemctl daemon-reload
systemctl restart iptv-backend.service
```

### Update Images
```bash
# Rebuild image
podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server

# Or load from archive
podman load < iptv-backend.tar.gz

# Restart to use new image
systemctl restart iptv-backend.service
```

## 🎯 Health Checks

### Quick Health Check
```bash
curl http://localhost:3001/health
curl http://localhost:3000

# Or comprehensive
./scripts/status.sh
```

### Individual Container Health
```bash
podman healthcheck run iptv-backend
podman healthcheck run iptv-frontend
podman healthcheck run iptv-postgres
podman healthcheck run iptv-redis
```

### Port Verification
```bash
ss -tlnp | grep -E '3000|3001|5432|6379'
netstat -tlnp | grep -E '3000|3001|5432|6379'
```

## 🔄 Common Workflows

### Deploy New Version
```bash
# Build new images
make build

# Restart services
make restart

# Check status
make status

# View logs
make logs
```

### Scheduled Maintenance
```bash
# Backup data
make backup

# Update system
make update

# Verify health
make status
```

### Emergency Restart
```bash
# Stop all
systemctl stop iptv-pod.service

# Wait 10 seconds
sleep 10

# Start all
systemctl start iptv-pod.service

# Check logs
make logs-all
```

### Complete Reset
```bash
# Stop services
systemctl stop iptv-pod.service

# Remove containers
podman pod rm -f iptv-pod

# Clean data (DESTRUCTIVE!)
rm -rf /storage-pool/xtream-data/*

# Redeploy
./scripts/deploy.sh
```

## 📊 Monitoring Commands

### Real-time Stats
```bash
podman stats
watch -n 2 'podman ps --format "table {{.Names}}\t{{.Status}}"'
```

### Disk Usage
```bash
du -sh /storage-pool/xtream-data/*
df -h /storage-pool/xtream-data
```

### Network Connections
```bash
podman exec iptv-backend ss -tunap
podman exec iptv-backend netstat -an
```

## 🚨 Emergency Procedures

### Service Not Responding
```bash
systemctl restart iptv-backend.service
./scripts/logs.sh backend
```

### Database Corruption
```bash
systemctl stop iptv-backend.service
./scripts/restore.sh /path/to/last-good-backup.sql.gz
systemctl start iptv-backend.service
```

### Disk Full
```bash
# Check usage
df -h

# Clean old HLS segments
find /storage-pool/xtream-data/hls-segments/ -mtime +1 -delete

# Clean logs
journalctl --vacuum-time=7d

# Restart services
systemctl restart iptv-pod.service
```

## 📞 Quick Links

- **Full Docs:** [README.md](README.md)
- **Quick Start:** [QUICKSTART.md](QUICKSTART.md)
- **Migration:** [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- **Advanced:** [ADVANCED.md](ADVANCED.md)
- **Index:** [INDEX.md](INDEX.md)

## 💡 Pro Tips

1. Use `make` commands for quick access
2. Check logs first when troubleshooting
3. Always backup before updates
4. Monitor disk space regularly
5. Enable auto-start: `systemctl enable iptv-pod.service`
6. Set up cron for automated backups
7. Keep documentation updated

---

**Print this cheatsheet and keep it handy!**
