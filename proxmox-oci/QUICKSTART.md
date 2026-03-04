# Proxmox OCI Quick Start Guide

## 5-Minute Deployment

This guide gets the IPTV system running on Proxmox 9.1 in minutes.

### Prerequisites
- Proxmox VE 9.1 or later
- Root access to Proxmox host
- 4GB RAM, 20GB storage minimum

### Step 1: Install Podman

```bash
apt update && apt install -y podman
```

### Step 2: Create Storage

```bash
mkdir -p /storage-pool/xtream-data/{postgres,redis,hls-segments,image-cache,logs}
chown -R 100000:100000 /storage-pool/xtream-data
```

### Step 3: Build Images

```bash
cd /storage-pool/xtream

# Backend
podman build -t iptv-backend:latest -f iptv-server/Dockerfile ./iptv-server

# Frontend
podman build -t iptv-frontend:latest \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
  -f iptv-frontend/Dockerfile ./iptv-frontend
```

### Step 4: Deploy

```bash
# Copy configurations
cp -r proxmox-oci/quadlet/* /etc/containers/systemd/

# Start services
systemctl daemon-reload
systemctl start iptv-pod.service

# Wait for initialization
sleep 30
```

### Step 5: Initialize Database

```bash
podman exec iptv-backend npx prisma migrate deploy
podman exec iptv-backend node dist/scripts/seed.js
```

### Step 6: Access

- **Frontend:** http://YOUR_IP:3000
- **Backend:** http://YOUR_IP:3001
- **Credentials:** admin / admin123 (from seed script)

### Enable Auto-Start

```bash
systemctl enable iptv-pod.service
```

## Automated Deployment

Use the included script for one-command deployment:

```bash
cd /storage-pool/xtream
./proxmox-oci/scripts/deploy.sh
```

This script handles all steps automatically.

## Common Tasks

### View Status
```bash
./proxmox-oci/scripts/status.sh
```

### View Logs
```bash
./proxmox-oci/scripts/logs.sh backend
```

### Backup
```bash
./proxmox-oci/scripts/backup.sh
```

### Update
```bash
./proxmox-oci/scripts/update.sh
```

## Troubleshooting

### Services Won't Start

```bash
# Check systemd status
systemctl status iptv-pod.service

# Check container logs
podman logs iptv-backend

# Check journalctl
journalctl -u iptv-backend.service -n 50
```

### Database Connection Errors

```bash
# Verify PostgreSQL is running
podman exec iptv-postgres pg_isready -U iptv

# Check network within pod
podman exec iptv-backend ping localhost
```

### Permission Denied Errors

```bash
# Fix volume permissions
chown -R 100000:100000 /storage-pool/xtream-data
```

## Next Steps

- Read full documentation: [README.md](README.md)
- Configure environment variables: Edit `/etc/containers/systemd/iptv-backend.container`
- Set up HTTPS: Use reverse proxy (nginx/traefik)
- Configure backups: Schedule `backup.sh` with cron
- Monitor performance: Use `podman stats`

## Support

- Check logs: `./proxmox-oci/scripts/logs.sh all`
- View status: `./proxmox-oci/scripts/status.sh`
- Proxmox forums: https://forum.proxmox.com/
- Podman docs: https://docs.podman.io/
