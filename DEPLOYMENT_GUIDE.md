# IPTV Deployment Guide

This guide covers deploying the IPTV system with three main components:
- **Backend** (CT 102): API server
- **Frontend** (CT 103): Admin portal
- **Edge LXC** (CT 104): Streaming edge server

## Prerequisites

- Proxmox VE 9.x with SDN configured
- LXC templates downloaded
- Code pushed to GitHub repository

---

## Container Overview

| CT ID | Name | IP | Purpose |
|-------|------|-----|---------|
| 100 | iptv-postgresql | 10.10.0.10 | Database |
| 101 | iptv-redis | 10.10.0.11 | Cache |
| 102 | iptv-backend | 10.10.0.12 | API Server |
| 103 | iptv-frontend | 10.10.0.13 | Admin Portal |
| 104 | iptv-edge | 10.10.0.14 | Edge Streaming |

---

## Part 1: Deploy Backend (CT 102)

### 1.1 Build the Backend

```bash
# On the build machine (or clone from GitHub)
cd /storage-pool/xtream/iptv-server
npm install
npm run build
```

### 1.2 Deploy to Container

```bash
# Stop container and mount rootfs
pct shutdown 102 --forceStop 1 --timeout 30
sleep 5
pct mount 102

# Copy compiled files
cp -r /storage-pool/xtream/iptv-server/dist/api /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/config /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/services /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/types /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/utils /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/workers /var/lib/lxc/102/rootfs/opt/iptv-server/
cp /storage-pool/xtream/iptv-server/dist/server.* /var/lib/lxc/102/rootfs/opt/iptv-server/

# Set ownership (101000 = nodeapp user in unprivileged container)
chown -R 101000:101000 /var/lib/lxc/102/rootfs/opt/iptv-server

# Unmount and start
pct unmount 102 && pct start 102
```

### 1.3 Backend Configuration

Create `/opt/iptv-server/.env` in the container:

```bash
pct exec 102 -- bash -c 'cat > /opt/iptv-server/.env << "EOF"
NODE_ENV=production
HOST=0.0.0.0
PORT=3001

# Database
DATABASE_URL=postgresql://iptv:iptv_secret@10.10.0.10:5432/iptv_db

# Redis
REDIS_URL=redis://10.10.0.11:6379

# TMDB (optional)
TMDB_API_KEY=your_tmdb_api_key

# Security
JWT_SECRET=your-secret-key-here
ENCRYPTION_KEY=your-encryption-key

# Streaming
HLS_SEGMENT_PATH=/tmp/hls-segments
FFMPEG_PATH=/usr/bin/ffmpeg
LOG_LEVEL=info
EOF
chown nodeapp:nodeapp /opt/iptv-server/.env'
```

### 1.4 Start Backend Service

```bash
pct exec 102 -- systemctl enable --now iptv-backend
pct exec 102 -- systemctl status iptv-backend
```

---

## Part 2: Deploy Frontend (CT 103)

### 2.1 Build the Frontend

```bash
cd /storage-pool/xtream/iptv-frontend
npm install
npm run build
```

### 2.2 Deploy to Container

```bash
# Stop container and mount rootfs
pct stop 103
pct mount 103

# Clean and copy build artifacts
rm -rf /var/lib/lxc/103/rootfs/opt/iptv-frontend
mkdir -p /var/lib/lxc/103/rootfs/opt/iptv-frontend
cd /storage-pool/xtream/iptv-frontend
cp -r .next/standalone/* /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r .next/standalone/.next /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r .next/static /var/lib/lxc/103/rootfs/opt/iptv-frontend/.next/
cp -r public /var/lib/lxc/103/rootfs/opt/iptv-frontend/

# Set ownership
chown -R 101000:101000 /var/lib/lxc/103/rootfs/opt/iptv-frontend

# Unmount and start
pct unmount 103 && pct start 103
```

### 2.3 Frontend Configuration

Create `/opt/iptv-frontend/.env` in the container:

```bash
pct exec 103 -- bash -c 'cat > /opt/iptv-frontend/.env << "EOF"
NEXT_PUBLIC_API_URL=http://10.10.0.12:3001
NEXT_PUBLIC_APP_URL=http://10.10.0.13:3000
EOF
chown nodeapp:nodeapp /opt/iptv-frontend/.env'
```

### 2.4 Start Frontend Service

```bash
pct exec 103 -- systemctl enable --now iptv-frontend
pct exec 103 -- systemctl status iptv-frontend
```

---

## Part 3: Deploy Edge LXC Container (CT 104)

The Edge LXC handles streaming with HLS relay and transcoding.

### 3.1 Create Edge Container

```bash
# Download Debian template if not exists
pveam download local debian-12-standard_12.2-1_amd64.tar.zst

# Create container
pct create 104 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname iptv-edge \
    --memory 8192 \
    --cores 6 \
    --net0 name=eth0,bridge=iptvnet,ip=10.10.0.14/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 \
    --searchdomain iptv.local \
    --rootfs local-lvm:50 \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --startup order=5,up=30

# Mount points for streaming data
pct set 104 -mp0 local-lvm:100,mp=/var/cache/iptv,backup=1
pct set 104 -mp1 local-lvm:200,mp=/tmp/hls-segments,backup=0

# Start container
pct start 104
```

### 3.2 Install Edge Runtime

```bash
pct exec 104 -- bash << 'EOFEDGE'
#!/bin/bash
set -e

echo "=== Installing Edge Runtime ==="

# Update and install dependencies
apt update && apt install -y curl git build-essential ffmpeg

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Create nodeapp user
useradd -m -s /bin/bash nodeapp || true

# Create directories
mkdir -p /opt/iptv-edge
mkdir -p /var/cache/iptv/images
mkdir -p /tmp/hls-segments
mkdir -p /var/log/iptv

chown -R nodeapp:nodeapp /opt/iptv-edge /var/cache/iptv /tmp/hls-segments /var/log/iptv

echo "✓ Edge runtime installed"
EOFEDGE
```

### 3.3 Create Edge Service

```bash
pct exec 104 -- bash << 'EOFsvc'
cat > /etc/systemd/system/iptv-edge.service << 'EOF'
[Unit]
Description=IPTV Edge Streaming Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=nodeapp
Group=nodeapp
WorkingDirectory=/opt/iptv-edge
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3002
Environment=IS_EDGE_SERVER=true
Environment=MAIN_SERVER_URL=http://10.10.0.12:3001
Environment=DATABASE_URL=postgresql://iptv:iptv_secret@10.10.0.10:5432/iptv_db
Environment=REDIS_URL=redis://10.10.0.11:6379
Environment=FFMPEG_PATH=/usr/bin/ffmpeg
Environment=HLS_SEGMENT_PATH=/tmp/hls-segments

LimitNOFILE=65535
LimitNPROC=4096

NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/iptv-edge /var/cache/iptv /tmp/hls-segments /var/log/iptv

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "✓ Edge service created"
EOFsvc
```

### 3.4 Deploy Edge Code

```bash
# Build edge code (same as backend but run as edge)
cd /storage-pool/xtream/iptv-server
npm run build

# Mount container
pct mount 104

# Copy files
cp -r /storage-pool/xtream/iptv-server/dist/api /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp -r /storage-pool/xtream/iptv-server/dist/config /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp -r /storage-pool/xtream/iptv-server/dist/services /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp -r /storage-pool/xtream/iptv-server/dist/types /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp -r /storage-pool/xtream/iptv-server/dist/utils /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp -r /storage-pool/xtream/iptv-server/dist/workers /var/lib/lxc/104/rootfs/opt/iptv-edge/
cp /storage-pool/xtream/iptv-server/dist/server.* /var/lib/lxc/104/rootfs/opt/iptv-edge/

# Create .env
pct exec 104 -- bash -c 'cat > /opt/iptv-edge/.env << "EOF"
NODE_ENV=production
HOST=0.0.0.0
PORT=3002
IS_EDGE_SERVER=true
MAIN_SERVER_URL=http://10.10.0.12:3001
DATABASE_URL=postgresql://iptv:iptv_secret@10.10.0.10:5432/iptv_db
REDIS_URL=redis://10.10.0.11:6379
FFMPEG_PATH=/usr/bin/ffmpeg
HLS_SEGMENT_PATH=/tmp/hls-segments
EOF
chown -R nodeapp:nodeapp /opt/iptv-edge'

# Set ownership
chown -R 101000:101000 /var/lib/lxc/104/rootfs/opt/iptv-edge

# Unmount and start
pct unmount 104 && pct start 104

# Enable service
pct exec 104 -- systemctl enable --now iptv-edge
```

---

## Part 4: Network Configuration

### 4.1 Port Forwarding (on Proxmox host)

```bash
# Backend API
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3001 -j DNAT --to-destination 10.10.0.12:3001

# Frontend
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3000 -j DNAT --to-destination 10.10.0.13:3000

# Edge streaming
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3002 -j DNAT --to-destination 10.10.0.14:3002

# Save rules
iptables-save > /etc/iptables/rules.v4
```

### 4.2 Firewall Rules

```bash
# Allow traffic between containers
for ct in 100 101 102 103 104; do
    pct exec $ct -- iptables -A INPUT -i eth0 -j ACCEPT
done
```

---

## Part 5: Verification

### 5.1 Check Services

```bash
# Backend
curl http://10.10.0.12:3001/health

# Frontend
curl http://10.10.0.13:3000

# Edge
curl http://10.10.0.14:3002/health

# From external (if port forwarding configured)
curl http://<PROXMOX_IP>:3001/health
curl http://<PROXMOX_IP>:3000
```

### 5.2 Check Container Status

```bash
pct status 102
pct status 103
pct status 104

pct exec 102 -- systemctl status iptv-backend
pct exec 103 -- systemctl status iptv-frontend
pct exec 104 -- systemctl status iptv-edge
```

### 5.3 View Logs

```bash
# Backend logs
pct exec 102 -- journalctl -u iptv-backend -f

# Frontend logs
pct exec 103 -- journalctl -u iptv-frontend -f

# Edge logs
pct exec 104 -- journalctl -u iptv-edge -f
```

---

## Quick Deploy Scripts

### Deploy All

```bash
#!/bin/bash
# deploy-all.sh

set -e

echo "=== Deploying IPTV Stack ==="

# Build
cd /storage-pool/xtream/iptv-server && npm run build
cd /storage-pool/xtream/iptv-frontend && npm run build

# Deploy Backend
echo "Deploying Backend..."
pct shutdown 102 --forceStop 1 --timeout 30
sleep 5
pct mount 102
cp -r /storage-pool/xtream/iptv-server/dist/* /var/lib/lxc/102/rootfs/opt/iptv-server/
chown -R 101000:101000 /var/lib/lxc/102/rootfs/opt/iptv-server
pct unmount 102 && pct start 102
pct exec 102 -- systemctl restart iptv-backend

# Deploy Frontend
echo "Deploying Frontend..."
pct stop 103
pct mount 103
rm -rf /var/lib/lxc/103/rootfs/opt/iptv-frontend
mkdir -p /var/lib/lxc/103/rootfs/opt/iptv-frontend
cp -r /storage-pool/xtream/iptv-frontend/.next/standalone/* /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r /storage-pool/xtream/iptv-frontend/.next/standalone/.next /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r /storage-pool/xtream/iptv-frontend/.next/static /var/lib/lxc/103/rootfs/opt/iptv-frontend/.next/
cp -r /storage-pool/xtream/iptv-frontend/public /var/lib/lxc/103/rootfs/opt/iptv-frontend/
chown -R 101000:101000 /var/lib/lxc/103/rootfs/opt/iptv-frontend
pct unmount 103 && pct start 103
pct exec 103 -- systemctl restart iptv-frontend

# Deploy Edge
echo "Deploying Edge..."
pct shutdown 104 --forceStop 1 --timeout 30
sleep 5
pct mount 104
cp -r /storage-pool/xtream/iptv-server/dist/* /var/lib/lxc/104/rootfs/opt/iptv-edge/
chown -R 101000:101000 /var/lib/lxc/104/rootfs/opt/iptv-edge
pct unmount 104 && pct start 104
pct exec 104 -- systemctl restart iptv-edge

echo "=== Deployment Complete ==="
echo "Backend: http://10.10.0.12:3001"
echo "Frontend: http://10.10.0.13:3000"
echo "Edge: http://10.10.0.14:3002"
```

---

## Access Information

| Service | Internal URL | External URL |
|---------|--------------|--------------|
| Backend API | http://10.10.0.12:3001 | http://<PROXMOX_IP>:3001 |
| Frontend | http://10.10.0.13:3000 | http://<PROXMOX_IP>:3000 |
| Edge Stream | http://10.10.0.14:3002 | http://<PROXMOX_IP>:3002 |

Default credentials (after seeding):
- **Admin**: admin / admin123
- **Test User**: test / test123
