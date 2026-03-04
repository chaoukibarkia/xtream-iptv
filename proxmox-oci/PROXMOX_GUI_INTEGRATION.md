# Proxmox GUI Integration for OCI Containers

## Overview

**Important Update:** Proxmox VE 9.1's native OCI support works differently than initially documented. Proxmox 9.1 allows you to **pull OCI images and convert them to LXC containers**, but it does NOT natively display Podman containers in the GUI.

This guide provides accurate methods to view and manage your Podman containers in Proxmox VE 9.1.

## How Proxmox 9.1 OCI Support Actually Works

Proxmox VE 9.1 introduces:
- **"Pull from OCI Registry"** - Downloads OCI images (Docker Hub, etc.) and converts them to LXC containers
- **LXC-based deployment** - Images are run as LXC containers, NOT via Podman/Docker
- **GUI integration** - OCI-derived LXC containers appear in standard Proxmox container list

**What this means for our deployment:**
- Our Podman-based containers run **outside** Proxmox's native OCI support
- Podman containers do NOT automatically appear in Proxmox GUI
- We need custom integration to view them in Proxmox interface

## Prerequisites

- Proxmox VE 9.1 or later
- Containers running via Podman (our setup)
- Root access to Proxmox host

## Understanding the Deployment Options

### Option 1: Podman on Proxmox Host (Our Current Approach)
✅ What we built
- Containers run directly on Proxmox host via Podman
- Managed by systemd
- NOT visible in Proxmox GUI by default
- Best performance, shared host resources

### Option 2: Convert to Proxmox Native OCI/LXC
- Use Proxmox's "Pull from OCI Registry" feature
- Containers become LXC containers
- Visible in Proxmox GUI automatically
- Some Docker Compose features may not work

### Option 3: Hybrid - Dashboard + Shell Access
✅ Recommended for our setup
- Keep Podman deployment as-is
- Add web dashboard for visibility
- Use Proxmox shell for management
- Best of both worlds

## Method 1: Using Proxmox Native OCI (Convert Deployment)

To convert our deployment to use Proxmox's native OCI support:

### Step 1: Export Your Images to OCI Format

```bash
# Save Podman images to OCI archives
podman save iptv-backend:latest -o /tmp/iptv-backend.tar
podman save iptv-frontend:latest -o /tmp/iptv-frontend.tar
podman save postgres:15-alpine -o /tmp/postgres.tar
podman save redis:7-alpine -o /tmp/redis.tar
```

### Step 2: Push to Local Registry (Optional)

```bash
# Run a local registry
podman run -d -p 5000:5000 --name registry registry:2

# Tag and push images
podman tag iptv-backend:latest localhost:5000/iptv-backend:latest
podman push localhost:5000/iptv-backend:latest

# Repeat for other images
```

### Step 3: Create Containers via Proxmox GUI

1. In Proxmox web UI, click **Create CT**
2. Select **"Pull from OCI Registry"**
3. Enter registry URL: `localhost:5000/iptv-backend:latest`
4. Configure resources (CPU, RAM, storage)
5. Set network settings
6. Create container

Repeat for each service.

### Step 4: Configure Networking

Since Proxmox OCI creates separate LXC containers, configure networking:

```bash
# In each container, set up network access
# Backend needs to reach postgres and redis
# Use Proxmox SDN or manual IP configuration
```

**Limitations:**
- ❌ No pod networking (each container separate)
- ❌ No shared localhost communication
- ❌ More complex networking setup
- ❌ Docker Compose features may not work
- ✅ Visible in Proxmox GUI
- ✅ Can use Proxmox backup/snapshot features

## Method 2: Web Dashboard (Recommended for Podman Deployment)

This is the **recommended approach** for keeping your Podman deployment while gaining visibility in a web interface.

### Install Dashboard Script

```bash
cd /storage-pool/xtream/proxmox-oci/scripts
./install-dashboard.sh
```

Or manually:

### Create LXC Container

```bash
# Create a privileged LXC container for Podman
pct create 500 local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst \
  --hostname iptv-containers \
  --memory 8192 \
  --cores 4 \
  --net0 name=eth0,bridge=vmbr0,ip=dhcp \
  --rootfs local-lvm:32 \
  --unprivileged 0 \
  --features nesting=1

# Start container
pct start 500
```

### Install Podman in LXC

```bash
# Enter container
pct enter 500

# Install Podman
apt update
apt install -y podman

# Copy your deployment
scp -r root@host:/storage-pool/xtream /root/

# Deploy
cd /root/xtream
./proxmox-oci/scripts/deploy.sh

# Exit
exit
```

Now the LXC container (ID 500) will be visible in Proxmox UI, and you can manage Podman containers inside it.

## Method 3: Proxmox Container Monitor (Custom Integration)

Create a custom monitoring script that exposes container stats to Proxmox.

### Install Monitoring Bridge

```bash
# Create monitoring script
cat > /usr/local/bin/proxmox-container-bridge.sh << 'EOF'
#!/bin/bash
# Proxmox Container Monitor for Podman

# Get container stats
get_container_stats() {
    podman stats --no-stream --format json | jq -r '.[] | "\(.Name)|\(.CPUPerc)|\(.MemUsage)|\(.NetIO)"'
}

# Export to Proxmox metrics
while true; do
    get_container_stats | while IFS='|' read name cpu mem net; do
        # Write to Proxmox RRD
        echo "container.$name.cpu:$cpu" >> /var/lib/pve-cluster/rrd/pve-container-stats
        echo "container.$name.memory:$mem" >> /var/lib/pve-cluster/rrd/pve-container-stats
    done
    sleep 60
done
EOF

chmod +x /usr/local/bin/proxmox-container-bridge.sh

# Create systemd service
cat > /etc/systemd/system/proxmox-container-bridge.service << 'EOF'
[Unit]
Description=Proxmox Container Monitor Bridge
After=network.target pvedaemon.service

[Service]
Type=simple
ExecStart=/usr/local/bin/proxmox-container-bridge.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
systemctl daemon-reload
systemctl enable --now proxmox-container-bridge.service
```

## Method 4: Custom Proxmox Plugin (Advanced)

Create a custom Proxmox VE plugin to display containers in the UI.

### Create Plugin Structure

```bash
# Create plugin directory
mkdir -p /usr/share/pve-manager/js/podman-containers

# Create plugin file
cat > /usr/share/pve-manager/js/podman-containers/PodmanPanel.js << 'EOF'
Ext.define('PVE.podman.ContainerPanel', {
    extend: 'Ext.grid.Panel',
    alias: 'widget.pvePodmanContainerPanel',
    
    title: 'Podman Containers',
    
    store: {
        fields: ['id', 'name', 'image', 'status', 'cpu', 'memory'],
        proxy: {
            type: 'ajax',
            url: '/api2/json/nodes/' + nodename + '/podman/containers',
            reader: {
                type: 'json',
                rootProperty: 'data'
            }
        },
        autoLoad: true,
        autoSync: true
    },
    
    columns: [
        { text: 'Container', dataIndex: 'name', flex: 1 },
        { text: 'Image', dataIndex: 'image', flex: 1 },
        { text: 'Status', dataIndex: 'status', width: 100 },
        { text: 'CPU', dataIndex: 'cpu', width: 100 },
        { text: 'Memory', dataIndex: 'memory', width: 100 }
    ]
});
EOF

# Create API endpoint
cat > /usr/share/perl5/PVE/API2/Podman.pm << 'EOF'
package PVE::API2::Podman;

use strict;
use warnings;

use PVE::JSONSchema qw(get_standard_option);
use PVE::RESTHandler;

use base qw(PVE::RESTHandler);

__PACKAGE__->register_method({
    name => 'list_containers',
    path => 'containers',
    method => 'GET',
    description => "List Podman containers",
    parameters => {
        additionalProperties => 0,
        properties => {
            node => get_standard_option('pve-node'),
        },
    },
    returns => {
        type => 'array',
        items => {
            type => "object",
            properties => {
                id => { type => 'string' },
                name => { type => 'string' },
                image => { type => 'string' },
                status => { type => 'string' },
            },
        },
    },
    code => sub {
        my ($param) = @_;
        
        my $cmd = ['podman', 'ps', '-a', '--format', 'json'];
        my $output = `@$cmd`;
        my $containers = decode_json($output);
        
        return $containers;
    }
});

1;
EOF

# Restart Proxmox services
systemctl restart pvedaemon pveproxy
```

## Method 5: WebUI Dashboard (Simplest for Viewing)

Create a simple web dashboard that's accessible from Proxmox.

```bash
# Create dashboard directory
mkdir -p /var/www/html/podman-dashboard

# Create simple dashboard
cat > /var/www/html/podman-dashboard/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Podman Containers - IPTV System</title>
    <meta http-equiv="refresh" content="10">
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { background: white; padding: 20px; margin-bottom: 10px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .status { display: inline-block; padding: 5px 10px; border-radius: 3px; font-weight: bold; }
        .running { background: #4caf50; color: white; }
        .stopped { background: #f44336; color: white; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #2196F3; color: white; }
    </style>
</head>
<body>
    <h1>IPTV System - Podman Containers</h1>
    <pre id="containers"></pre>
    <script>
        fetch('/podman-api/containers')
            .then(r => r.json())
            .then(data => {
                let html = '<table><tr><th>Name</th><th>Status</th><th>CPU</th><th>Memory</th><th>Uptime</th></tr>';
                data.forEach(c => {
                    let statusClass = c.State === 'running' ? 'running' : 'stopped';
                    html += `<tr>
                        <td>${c.Names[0]}</td>
                        <td><span class="status ${statusClass}">${c.State}</span></td>
                        <td>${c.cpu || 'N/A'}</td>
                        <td>${c.memory || 'N/A'}</td>
                        <td>${c.Status}</td>
                    </tr>`;
                });
                html += '</table>';
                document.getElementById('containers').innerHTML = html;
            });
    </script>
</body>
</html>
EOF

# Create API endpoint
cat > /usr/local/bin/podman-api-server.sh << 'EOF'
#!/bin/bash
# Simple API server for container stats

while true; do
    echo -e "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n$(podman ps -a --format json)" | nc -l -p 8088 -q 1
done
EOF

chmod +x /usr/local/bin/podman-api-server.sh

# Create systemd service
cat > /etc/systemd/system/podman-api.service << 'EOF'
[Unit]
Description=Podman API Server
After=network.target

[Service]
ExecStart=/usr/local/bin/podman-api-server.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now podman-api.service

# Install nginx for serving
apt install -y nginx
ln -s /var/www/html/podman-dashboard /usr/share/nginx/html/

# Configure nginx
cat > /etc/nginx/sites-available/podman-dashboard << 'EOF'
server {
    listen 8089;
    root /var/www/html/podman-dashboard;
    index index.html;
    
    location /podman-api/ {
        proxy_pass http://localhost:8088/;
    }
}
EOF

ln -s /etc/nginx/sites-available/podman-dashboard /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

**Access:** `http://PROXMOX_IP:8089`

Then add custom menu item in Proxmox UI:
1. Go to Datacenter → Options
2. Add custom button to toolbar with URL: `http://localhost:8089`

## Recommended Approach

For **Proxmox VE 9.1+**, use **Method 5 (WebUI Dashboard)** as it's:
- ✅ Easy to implement
- ✅ Works immediately
- ✅ Auto-refreshes
- ✅ No complex integration needed
- ✅ Can be embedded in Proxmox iframe

## Viewing Containers in Proxmox UI

### Option 1: Add as IFrame in Proxmox

```javascript
// Add to /usr/share/pve-manager/js/pvemanagerlib.js
// Or create custom panel

Ext.define('PVE.PodmanDashboard', {
    extend: 'Ext.panel.Panel',
    xtype: 'pvePodmanDashboard',
    title: 'Podman Containers',
    
    html: '<iframe src="http://localhost:8089" width="100%" height="600px" frameborder="0"></iframe>'
});
```

### Option 2: Add to Proxmox Summary Page

Edit `/usr/share/pve-docs/api-viewer/index.html` to add link to dashboard.

### Option 3: Browser Bookmark

Simply bookmark `http://PROXMOX_IP:8089` and open in browser tab.

## Container Management via Proxmox Shell

You can also manage containers through Proxmox shell interface:

```bash
# Open Proxmox node shell
# Then use our management commands

# Status
/storage-pool/xtream/proxmox-oci/scripts/status.sh

# Logs
/storage-pool/xtream/proxmox-oci/scripts/logs.sh backend

# Restart
systemctl restart iptv-backend.service

# Or use Makefile
cd /storage-pool/xtream/proxmox-oci
make status
make logs
make restart
```

## Monitoring Integration

For proper monitoring in Proxmox, export metrics:

```bash
# Install Prometheus node exporter
apt install -y prometheus-node-exporter

# Configure to scrape Podman metrics
cat > /etc/prometheus/podman-exporter.yml << 'EOF'
scrape_configs:
  - job_name: 'podman'
    static_configs:
      - targets: ['localhost:9100']
EOF

# Enable in Proxmox
# Datacenter → Metric Server → Add → Prometheus
# URL: http://localhost:9090
```

## Proxmox Notifications

Configure alerts for container events:

```bash
# Create notification script
cat > /usr/local/bin/container-notify.sh << 'EOF'
#!/bin/bash
# Send Proxmox notifications on container events

podman events --filter 'type=container' --format '{{.Status}}' | while read event; do
    pvesh create /cluster/notifications --severity info --message "Container event: $event"
done
EOF

chmod +x /usr/local/bin/container-notify.sh

# Add to systemd
cat > /etc/systemd/system/container-notify.service << 'EOF'
[Unit]
Description=Container Event Notifier
After=network.target

[Service]
ExecStart=/usr/local/bin/container-notify.sh
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl enable --now container-notify.service
```

## Summary

**Best Solution for Proxmox 9.1:**

1. **Deploy WebUI Dashboard (Method 5)** - Immediate visibility
2. **Use Proxmox Shell** - For management commands
3. **Set up Monitoring** - Prometheus integration
4. **Configure Notifications** - Get alerts

This gives you:
- ✅ Visual dashboard of containers
- ✅ Real-time status updates
- ✅ Management via familiar Proxmox shell
- ✅ Proper monitoring and alerts
- ✅ No complex plugin development needed

**Quick Setup:**

```bash
cd /storage-pool/xtream/proxmox-oci/scripts
./install-proxmox-dashboard.sh
```

Access dashboard at: `http://PROXMOX_IP:8089`
