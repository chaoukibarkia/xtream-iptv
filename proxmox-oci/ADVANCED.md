# Advanced Configuration Guide

## GPU Acceleration (NVIDIA)

### Prerequisites

```bash
# Check GPU
lspci | grep -i nvidia

# Install drivers
apt install nvidia-driver

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

apt update
apt install -y nvidia-container-toolkit

# Configure for Podman
nvidia-ctk runtime configure --runtime=podman
```

### Configure Backend for GPU

Edit `/etc/containers/systemd/iptv-backend.container`:

```ini
[Container]
# ... existing config ...

# GPU support
SecurityLabelDisable=true
Device=/dev/nvidia0
Device=/dev/nvidiactl
Device=/dev/nvidia-uvm
Device=/dev/nvidia-modeset

# NVIDIA environment
Environment=NVIDIA_VISIBLE_DEVICES=all
Environment=NVIDIA_DRIVER_CAPABILITIES=compute,video,utility

# Add to Exec if needed
Annotation=run.oci.hooks.prestart=/usr/bin/nvidia-container-toolkit-hook
```

Reload and restart:
```bash
systemctl daemon-reload
systemctl restart iptv-backend.service
```

Verify:
```bash
podman exec iptv-backend nvidia-smi
```

## Rootless Deployment

Run containers as unprivileged user for better security.

### Setup

```bash
# Create service user
useradd -m -s /bin/bash iptv
loginctl enable-linger iptv

# Configure subuid/subgid
echo "iptv:100000:65536" >> /etc/subuid
echo "iptv:100000:65536" >> /etc/subgid

# Switch to user
su - iptv

# Create user systemd directory
mkdir -p ~/.config/containers/systemd

# Copy Quadlet files
cp /storage-pool/xtream/proxmox-oci/quadlet/* ~/.config/containers/systemd/

# Update volume paths to user-owned locations
mkdir -p ~/iptv-data/{postgres,redis,hls-segments,image-cache,logs}

# Edit .volume files to use ~/iptv-data paths
sed -i 's|/storage-pool/xtream-data|/home/iptv/iptv-data|g' ~/.config/containers/systemd/*.volume

# Reload and start
systemctl --user daemon-reload
systemctl --user enable --now iptv-pod.service
```

### Rootless Advantages

- No root privileges required
- Better isolation
- Per-user resource limits
- Automatic cleanup on logout (unless lingering enabled)

## High Availability Setup

### Multi-Server Deployment

Deploy on multiple Proxmox hosts for failover:

**Server 1 (Primary):**
```bash
# Standard deployment
./proxmox-oci/scripts/deploy.sh

# Configure as main server
podman exec iptv-backend curl -X POST http://localhost:3001/admin/servers \
  -H "X-API-Key: admin-secret-key" \
  -d '{"name":"primary","role":"MAIN","location":"datacenter-1"}'
```

**Server 2 (Edge):**
```bash
# Deploy only backend (streamer)
systemctl start iptv-backend.service

# Register with main server
podman exec iptv-backend curl -X POST http://PRIMARY_IP:3001/api/servers/register \
  -H "X-Server-Key: server-api-key" \
  -d '{"name":"edge-1","role":"STREAMER","location":"datacenter-2"}'
```

### Load Balancing

Use HAProxy or nginx for load balancing:

**HAProxy Example:**
```haproxy
frontend iptv_frontend
    bind *:3000
    mode http
    default_backend iptv_servers

backend iptv_servers
    mode http
    balance roundrobin
    option httpchk GET /health
    server server1 192.168.1.10:3000 check
    server server2 192.168.1.11:3000 check backup
```

### Database Replication

For PostgreSQL high availability:

```bash
# Install pgpool-II
apt install pgpool2

# Configure streaming replication
# See PostgreSQL documentation
```

## Advanced Networking

### Host Network Mode

For better performance (loses pod isolation):

Edit `iptv-pod.pod`:
```ini
[Pod]
# Remove PublishPort lines
# Network=host  # Use host networking
```

Edit container files:
```ini
[Container]
Network=host
```

### Custom Network

Create isolated network:

```bash
podman network create --driver bridge \
  --subnet 10.89.0.0/24 \
  --gateway 10.89.0.1 \
  iptv-network
```

Update `iptv-pod.pod`:
```ini
[Pod]
Network=iptv-network
```

### IPv6 Support

```bash
podman network create --ipv6 --subnet fd00:1234::/64 iptv-network-v6
```

## Resource Management

### CPU Limits

Edit container files:

```ini
[Container]
# Limit to 2 CPU cores
CPUQuota=200%

# Set CPU weight (shares)
CPUWeight=100

# CPU affinity
CPUSet=0-3
```

### Memory Limits

```ini
[Container]
# Hard limit
MemoryLimit=4G

# Soft limit (warning threshold)
MemoryReservation=2G

# Swap limit
MemorySwap=4G

# OOM score adjustment
OOMScoreAdjust=500
```

### I/O Limits

```ini
[Container]
# Block I/O weight
IOWeight=500

# Read/write limits (bytes/sec)
IOReadBandwidthMax=/dev/sda 10M
IOWriteBandwidthMax=/dev/sda 10M
```

### Apply Limits

```bash
systemctl daemon-reload
systemctl restart iptv-backend.service
```

## Storage Optimization

### Using ZFS

```bash
# Create ZFS dataset
zfs create tank/iptv-data
zfs set compression=lz4 tank/iptv-data
zfs set atime=off tank/iptv-data

# Use in volume definitions
Device=/tank/iptv-data/postgres
```

### Using Overlay Storage

Configure Podman to use overlay:

```bash
# Edit /etc/containers/storage.conf
[storage]
driver = "overlay"

[storage.options.overlay]
mountopt = "nodev,metacopy=on"
```

### Tmpfs for Temporary Data

Edit backend container:
```ini
[Container]
# Use tmpfs for HLS segments (RAM-backed)
Tmpfs=/tmp/hls-segments:rw,size=2G,mode=1777
```

## Security Hardening

### SELinux

Enable SELinux contexts:

```ini
[Container]
# Remove this line to enable SELinux
# SecurityLabelDisable=false

# Add security options
SecurityOpt=label=type:container_runtime_t
```

### Seccomp Profile

```ini
[Container]
SecurityOpt=seccomp=/path/to/custom-profile.json
```

### Read-Only Filesystem

```ini
[Container]
ReadOnly=true
ReadOnlyTmpfs=true

# Allow specific paths to be writable
Tmpfs=/tmp:rw
Volume=iptv-logs.volume:/var/log/iptv:rw
```

### User Namespaces

```ini
[Container]
# Map to specific user range
UIDMap=0:100000:65536
GIDMap=0:100000:65536
```

### Capabilities

Drop unnecessary capabilities:

```ini
[Container]
# Drop all
CapDrop=all

# Add only needed ones
CapAdd=NET_BIND_SERVICE
```

## Monitoring Integration

### Prometheus Metrics

**Install Node Exporter:**
```bash
podman run -d --name node-exporter \
  --pod iptv-pod \
  prom/node-exporter
```

**cAdvisor for Container Metrics:**
```bash
podman run -d --name cadvisor \
  --pod iptv-pod \
  --volume=/:/rootfs:ro \
  --volume=/var/run:/var/run:ro \
  --volume=/sys:/sys:ro \
  --volume=/var/lib/containers/:/var/lib/containers:ro \
  gcr.io/cadvisor/cadvisor:latest
```

### Grafana Dashboard

Deploy Grafana for visualization:

```bash
podman run -d --name grafana \
  -p 3003:3000 \
  -v grafana-data:/var/lib/grafana \
  grafana/grafana
```

### Log Aggregation

**Loki for Logs:**
```bash
# Configure Podman to send logs to Loki
[Container]
LogDriver=k8s-file
LogOptions=tag=iptv-backend
```

## Backup Strategies

### Automated Snapshots (ZFS)

```bash
# Create snapshot script
cat << 'EOF' > /usr/local/bin/iptv-snapshot.sh
#!/bin/bash
zfs snapshot tank/iptv-data@$(date +%Y%m%d-%H%M%S)
# Keep last 7 snapshots
zfs list -t snapshot -o name | grep tank/iptv-data | head -n -7 | xargs -n 1 zfs destroy
EOF

chmod +x /usr/local/bin/iptv-snapshot.sh

# Schedule with cron
echo "0 */6 * * * /usr/local/bin/iptv-snapshot.sh" >> /etc/cron.d/iptv-backup
```

### Remote Backup

```bash
# Sync to remote server
cat << 'EOF' > /usr/local/bin/iptv-remote-backup.sh
#!/bin/bash
rsync -avz --delete /storage-pool/xtream-data/ backup-server:/backups/iptv/
EOF
```

### Container Image Backup

```bash
# Save images
podman save iptv-backend:latest iptv-frontend:latest | \
  gzip > /backups/iptv-images-$(date +%Y%m%d).tar.gz
```

## Performance Tuning

### Kernel Parameters

```bash
# Add to /etc/sysctl.conf
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.ipv4.tcp_rmem = 4096 87380 67108864
net.ipv4.tcp_wmem = 4096 65536 67108864
net.ipv4.tcp_congestion_control = bbr
vm.swappiness = 10
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5

# Apply
sysctl -p
```

### Podman Configuration

Edit `/etc/containers/containers.conf`:

```ini
[containers]
# Increase ulimits
default_ulimits = [
  "nofile=65535:65535",
]

# Network performance
netns = "host"

[engine]
# Parallel pulls
max_parallel_downloads = 10

# Event logging
events_logger = "journald"
```

## Troubleshooting Tools

### Debug Container

Create debug container in pod:

```bash
podman run -it --rm --pod iptv-pod \
  nicolaka/netshoot bash
```

Inside debug container:
```bash
# Test connectivity
curl http://localhost:3001/health
curl http://localhost:5432

# DNS resolution
nslookup localhost

# Network trace
tcpdump -i any port 3001
```

### System Traces

```bash
# Trace container system calls
podman exec iptv-backend strace -p 1

# Trace network
podman exec iptv-backend tcpdump -i eth0 -w /tmp/capture.pcap
```

### Performance Profiling

```bash
# CPU profile
podman exec iptv-backend node --prof dist/server.js

# Memory heap dump
podman exec iptv-backend node -e 'const heapdump = require("heapdump"); heapdump.writeSnapshot()'
```

## Custom Systemd Units

### Automatic Cleanup Service

```ini
# /etc/systemd/system/iptv-cleanup.service
[Unit]
Description=IPTV Cleanup Service
After=iptv-pod.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/iptv-cleanup.sh

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/iptv-cleanup.timer
[Unit]
Description=IPTV Cleanup Timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable:
```bash
systemctl enable --now iptv-cleanup.timer
```

## Documentation

For more information:
- Proxmox VE: https://pve.proxmox.com/pve-docs/
- Podman: https://docs.podman.io/
- Systemd: https://www.freedesktop.org/software/systemd/man/
- PostgreSQL: https://www.postgresql.org/docs/
- Redis: https://redis.io/documentation
