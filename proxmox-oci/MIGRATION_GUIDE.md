# Migration Guide: Docker Compose to Proxmox OCI

This guide walks through migrating an existing Docker Compose deployment to Proxmox 9.1 OCI containers.

## Overview

The migration process preserves all data and configuration while switching the container runtime and orchestration layer.

**Timeline:** 30-60 minutes (including testing)  
**Downtime:** 5-10 minutes (during data transfer)

## Pre-Migration Checklist

- [ ] Proxmox VE 9.1+ installed and running
- [ ] Podman installed on Proxmox host
- [ ] Sufficient storage for images and data
- [ ] Network connectivity between old and new systems
- [ ] Backup of Docker volumes completed
- [ ] Maintenance window scheduled

## Step-by-Step Migration

### Phase 1: Preparation (15 min)

#### 1.1 Backup Docker Deployment

On the Docker host:

```bash
cd /path/to/iptv-system

# Stop services to ensure consistent backup
docker-compose down

# Backup database
docker-compose up -d postgres
docker-compose exec postgres pg_dump -U iptv iptv_db > iptv_backup.sql
docker-compose down

# Backup Docker volumes
docker volume ls | grep iptv
docker run --rm -v iptv_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-data.tar.gz -C /data .
docker run --rm -v iptv_redis-data:/data -v $(pwd):/backup alpine tar czf /backup/redis-data.tar.gz -C /data .
docker run --rm -v iptv_hls-segments:/data -v $(pwd):/backup alpine tar czf /backup/hls-segments.tar.gz -C /data .

# Verify backups
ls -lh *.tar.gz *.sql
```

#### 1.2 Export Docker Images

```bash
# Export custom images
docker save iptv-backend:latest | gzip > iptv-backend.tar.gz
docker save iptv-frontend:latest | gzip > iptv-frontend.tar.gz

# Verify exports
ls -lh iptv-*.tar.gz
```

#### 1.3 Copy Environment Configuration

```bash
# Save current environment
docker-compose config > docker-compose-resolved.yml
cp .env .env.backup
```

### Phase 2: Transfer to Proxmox (10 min)

#### 2.1 Transfer Files

```bash
# On Docker host
scp iptv_backup.sql iptv-*.tar.gz root@proxmox-host:/tmp/
scp -r postgres-data.tar.gz redis-data.tar.gz root@proxmox-host:/tmp/
```

#### 2.2 Prepare Proxmox Host

On Proxmox host:

```bash
# Install dependencies
apt update && apt install -y podman crun fuse-overlayfs slirp4netns

# Create directories
mkdir -p /storage-pool/xtream-data/{postgres,redis,hls-segments,image-cache,logs}
chown -R 100000:100000 /storage-pool/xtream-data

# Load images
podman load < /tmp/iptv-backend.tar.gz
podman load < /tmp/iptv-frontend.tar.gz

# Verify images
podman images
```

### Phase 3: Deploy on Proxmox (10 min)

#### 3.1 Deploy Quadlet Configuration

```bash
cd /storage-pool/xtream

# Copy Quadlet files
cp -r proxmox-oci/quadlet/* /etc/containers/systemd/

# Reload systemd
systemctl daemon-reload

# Verify unit files
systemctl list-unit-files | grep iptv
```

#### 3.2 Start Infrastructure Services

```bash
# Start PostgreSQL and Redis first
systemctl start iptv-postgres.service
systemctl start iptv-redis.service

# Wait for services to be ready
sleep 10

# Verify they're running
systemctl status iptv-postgres.service
systemctl status iptv-redis.service
```

### Phase 4: Restore Data (10 min)

#### 4.1 Restore Database

```bash
# Restore SQL dump
podman exec -i iptv-postgres psql -U iptv -d iptv_db < /tmp/iptv_backup.sql

# Verify restoration
podman exec iptv-postgres psql -U iptv -d iptv_db -c "SELECT COUNT(*) FROM \"User\";"
podman exec iptv-postgres psql -U iptv -d iptv_db -c "SELECT COUNT(*) FROM \"Stream\";"
```

#### 4.2 Restore Volume Data (Optional)

If you need to restore Redis data or HLS segments:

```bash
# Extract volume backups
tar xzf /tmp/redis-data.tar.gz -C /storage-pool/xtream-data/redis/
tar xzf /tmp/hls-segments.tar.gz -C /storage-pool/xtream-data/hls-segments/

# Fix permissions
chown -R 100000:100000 /storage-pool/xtream-data/
```

### Phase 5: Start Application Services (5 min)

#### 5.1 Update Environment Variables

Edit `/etc/containers/systemd/iptv-backend.container`:

```ini
# Update these values from your Docker .env
Environment=SERVER_URL=http://your-actual-domain.com
Environment=TMDB_API_KEY=your-actual-api-key
Environment=ADMIN_API_KEY=your-actual-admin-key
Environment=JWT_SECRET=your-actual-jwt-secret
```

#### 5.2 Start Application

```bash
# Reload configuration
systemctl daemon-reload

# Start backend and frontend
systemctl start iptv-backend.service
systemctl start iptv-frontend.service

# Enable auto-start
systemctl enable iptv-pod.service

# Check status
systemctl status iptv-pod.service
podman ps --pod
```

### Phase 6: Verification (10 min)

#### 6.1 Health Checks

```bash
# Run status script
cd /storage-pool/xtream
./proxmox-oci/scripts/status.sh

# Check endpoints
curl http://localhost:3001/health
curl http://localhost:3000

# Check container health
podman healthcheck run iptv-backend
podman healthcheck run iptv-frontend
podman healthcheck run iptv-postgres
podman healthcheck run iptv-redis
```

#### 6.2 Functional Testing

1. **Access Frontend:**
   - Open browser: http://PROXMOX_IP:3000
   - Login with credentials from seed script

2. **Test API:**
   ```bash
   curl http://PROXMOX_IP:3001/player_api.php?username=test&password=test123&action=get_live_streams
   ```

3. **Test Stream Playback:**
   - Try playing a stream through the UI
   - Check FFmpeg processes: `ps aux | grep ffmpeg`

4. **Check Logs:**
   ```bash
   ./proxmox-oci/scripts/logs.sh backend
   # Press Ctrl+C after verifying no errors
   ```

#### 6.3 Performance Testing

```bash
# Monitor resource usage
podman stats --no-stream

# Check disk usage
df -h /storage-pool/xtream-data/

# Check memory
free -h
```

### Phase 7: Cleanup (5 min)

#### 7.1 On Docker Host (After Successful Migration)

```bash
# Stop Docker containers
docker-compose down

# Remove Docker volumes (AFTER VERIFYING PROXMOX WORKS!)
docker volume rm iptv_postgres-data iptv_redis-data iptv_hls-segments

# Remove images
docker rmi iptv-backend:latest iptv-frontend:latest

# Archive backups
mkdir -p ~/iptv-migration-backup
mv iptv_backup.sql *.tar.gz ~/iptv-migration-backup/
```

#### 7.2 On Proxmox Host

```bash
# Remove temporary files
rm -f /tmp/iptv-*.tar.gz /tmp/*.sql

# Configure backups
crontab -e
# Add: 0 2 * * * /storage-pool/xtream/proxmox-oci/scripts/backup.sh
```

## Rollback Procedure

If issues occur during migration:

### 1. Stop Proxmox Services

```bash
systemctl stop iptv-pod.service
```

### 2. Restore Docker Deployment

On Docker host:

```bash
# Restore volumes from backup
docker volume create iptv_postgres-data
docker run --rm -v iptv_postgres-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-data.tar.gz -C /data

# Start services
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs -f backend
```

### 3. Restore Database (if needed)

```bash
docker-compose exec -T postgres psql -U iptv -d iptv_db < iptv_backup.sql
```

## Post-Migration Tasks

### Update DNS/Load Balancer

Update your DNS or load balancer to point to the Proxmox host IP.

### Configure Monitoring

Set up monitoring for the new deployment:

```bash
# Add to cron for regular health checks
crontab -e
*/5 * * * * /storage-pool/xtream/proxmox-oci/scripts/status.sh > /var/log/iptv-status.log
```

### Update Documentation

Document the new deployment:
- New server IP addresses
- New management commands
- New log locations
- Backup procedures

### Configure Firewall

```bash
# Allow required ports
ufw allow 3000/tcp  # Frontend
ufw allow 3001/tcp  # Backend
ufw allow 5432/tcp  # PostgreSQL (if external access needed)
```

### Set Up Backups

```bash
# Schedule daily backups
cat << 'EOF' >> /etc/cron.d/iptv-backup
0 2 * * * root /storage-pool/xtream/proxmox-oci/scripts/backup.sh >> /var/log/iptv-backup.log 2>&1
EOF
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is accessible
podman exec iptv-backend ping localhost
podman exec iptv-postgres pg_isready -U iptv

# Verify DATABASE_URL
podman exec iptv-backend env | grep DATABASE_URL
```

### Container Won't Start

```bash
# Check systemd logs
journalctl -u iptv-backend.service -n 100 --no-pager

# Check Podman events
podman events --since 1h

# Try manual start
podman start iptv-backend
podman logs iptv-backend
```

### Permission Errors

```bash
# Reset permissions
chown -R 100000:100000 /storage-pool/xtream-data
podman unshare chown -R 1001:1001 /storage-pool/xtream-data/hls-segments
```

### Image Load Failures

```bash
# Check image format
file /tmp/iptv-backend.tar.gz

# Try uncompressed load
gunzip /tmp/iptv-backend.tar.gz
podman load < /tmp/iptv-backend.tar
```

## Migration Validation Checklist

- [ ] All containers running (`podman ps`)
- [ ] All services active (`systemctl status iptv-pod.service`)
- [ ] Health checks passing (`./scripts/status.sh`)
- [ ] Frontend accessible (http://IP:3000)
- [ ] Backend API responding (http://IP:3001/health)
- [ ] User authentication working
- [ ] Database queries successful
- [ ] Redis caching functional
- [ ] Stream playback working
- [ ] FFmpeg processes starting
- [ ] Logs clean (no errors)
- [ ] Resource usage normal
- [ ] Backups configured
- [ ] Monitoring configured
- [ ] Documentation updated

## Support

If you encounter issues during migration:

1. Check logs: `./proxmox-oci/scripts/logs.sh all`
2. Review status: `./proxmox-oci/scripts/status.sh`
3. Consult documentation: [README.md](README.md)
4. Proxmox forums: https://forum.proxmox.com/
5. Podman documentation: https://docs.podman.io/

## Estimated Resource Requirements

| Component | CPU | RAM | Disk |
|-----------|-----|-----|------|
| PostgreSQL | 0.5 cores | 512MB | 5GB+ |
| Redis | 0.25 cores | 256MB | 1GB |
| Backend | 1-2 cores | 2GB | 2GB |
| Frontend | 0.5 cores | 512MB | 500MB |
| **Total** | **2-3 cores** | **3-4GB** | **10GB+** |

Additional storage needed for HLS segments based on concurrent streams.
