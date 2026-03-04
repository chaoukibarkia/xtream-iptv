# How to View Containers in Proxmox GUI

## Quick Answer

**Install our web dashboard:**
```bash
cd /storage-pool/xtream/proxmox-oci/scripts
./install-dashboard.sh
```

Access at: **http://PROXMOX_IP:18089**

## Why Our Containers Aren't Visible by Default

Proxmox VE 9.1's native OCI support works by:
1. Pulling OCI images from registries
2. Converting them to LXC containers
3. Running them as standard Proxmox LXC containers

Our deployment uses **Podman** directly on the host, which runs **outside** Proxmox's container management system. This gives better performance but means containers aren't automatically visible in the Proxmox GUI.

## Solution: Web Dashboard

We created a beautiful web dashboard that shows your containers in real-time.

### Features

✅ **Real-time Status** - See which containers are running/stopped  
✅ **Live Stats** - CPU, memory, network usage  
✅ **Auto-refresh** - Updates every 10 seconds  
✅ **Modern UI** - Clean, responsive design  
✅ **No Modifications** - Doesn't change Proxmox  
✅ **Easy Access** - One-click installation

### Installation

```bash
# As root on Proxmox host
cd /storage-pool/xtream/proxmox-oci/scripts
./install-dashboard.sh
```

That's it! The script will:
- Install nginx and dependencies
- Create the dashboard HTML
- Set up API endpoint
- Configure systemd services
- Start everything automatically

### Access

Open your browser to:
```
http://YOUR_PROXMOX_IP:18089
```

You'll see all your IPTV containers with:
- Container names
- Running status (green/red indicators)
- Docker images
- Creation dates
- Uptime information

### Managing Containers

While viewing the dashboard, manage containers via:

**Option 1: Proxmox Shell**
1. Click your Proxmox node → **Shell**
2. Run commands:
   ```bash
   systemctl restart iptv-backend.service
   cd /storage-pool/xtream/proxmox-oci && make logs
   ```

**Option 2: SSH**
```bash
ssh root@proxmox-host
systemctl status iptv-pod.service
podman ps --pod
```

**Option 3: Our Scripts**
```bash
./proxmox-oci/scripts/status.sh
./proxmox-oci/scripts/logs.sh backend
./proxmox-oci/scripts/backup.sh
```

## Alternative: Convert to Proxmox LXC

If you **really** want containers in the native Proxmox GUI, you can convert the deployment to use Proxmox's OCI support. This converts your containers to LXC format.

⚠️ **Warning:** You'll lose pod networking benefits (shared localhost communication)

See: [PROXMOX_GUI_INTEGRATION.md](PROXMOX_GUI_INTEGRATION.md) for conversion guide.

## Comparison

| Method | Visibility | Performance | Ease |
|--------|------------|-------------|------|
| **Web Dashboard** | ✅ Excellent | ✅ Best (pod) | ✅ Easy |
| **Proxmox Shell** | ⚠️ CLI only | ✅ Best (pod) | ✅ Easy |
| **Convert to LXC** | ✅ Native GUI | ⚠️ Good | ⚠️ Complex |

## Recommendation

✅ **Use the web dashboard** - Best of both worlds:
- Keep high-performance pod networking
- Get visual container monitoring
- No complex conversion needed
- Easy to install and maintain

## Dashboard Screenshots

The dashboard shows:

```
╔═══════════════════════════════════════════════╗
║   🎬 IPTV Container Dashboard                 ║
╠═══════════════════════════════════════════════╣
║  ┌─────────────┐  ┌─────────────┐           ║
║  │ iptv-backend│  │iptv-frontend│           ║
║  │  ● RUNNING  │  │  ● RUNNING  │           ║
║  │ CPU: 2.5%   │  │ CPU: 1.2%   │           ║
║  │ MEM: 512MB  │  │ MEM: 256MB  │           ║
║  └─────────────┘  └─────────────┘           ║
║  ┌─────────────┐  ┌─────────────┐           ║
║  │iptv-postgres│  │  iptv-redis │           ║
║  │  ● RUNNING  │  │  ● RUNNING  │           ║
║  │ CPU: 0.8%   │  │ CPU: 0.3%   │           ║
║  │ MEM: 128MB  │  │ MEM: 64MB   │           ║
║  └─────────────┘  └─────────────┘           ║
╠═══════════════════════════════════════════════╣
║  Auto-refresh every 10 seconds               ║
╚═══════════════════════════════════════════════╝
```

## Troubleshooting

### Dashboard Not Loading

```bash
# Check if services are running
systemctl status iptv-container-api
systemctl status nginx

# Check logs
journalctl -u iptv-container-api -f

# Restart services
systemctl restart iptv-container-api nginx
```

### Can't Access from Browser

```bash
# Check firewall
ufw allow 18089/tcp

# Or on Proxmox:
iptables -I INPUT -p tcp --dport 18089 -j ACCEPT
```

### Dashboard Shows No Containers

```bash
# Verify containers are running
podman ps --pod

# Check API is working
curl http://localhost:18088

# Restart API service
systemctl restart iptv-container-api
```

## Uninstall Dashboard

If you want to remove the dashboard:

```bash
systemctl stop iptv-container-api nginx
systemctl disable iptv-container-api
rm -f /etc/systemd/system/iptv-container-api.service
rm -f /usr/local/bin/iptv-container-api
rm -f /etc/nginx/sites-enabled/iptv-dashboard
rm -rf /var/www/html/iptv-dashboard
systemctl daemon-reload
systemctl start nginx
```

## Summary

✅ **Install the web dashboard** - 2 minutes, full visibility  
✅ **Keep your Podman deployment** - Best performance  
✅ **Use Proxmox shell** - For management commands  
✅ **Enjoy the best of both worlds** - Performance + visibility

**Quick Install:**
```bash
./proxmox-oci/scripts/install-dashboard.sh
```

**Access:**
```
http://YOUR_PROXMOX_IP:18089
```

Done! 🎉
