#!/bin/bash
# ============================================
# Proxmox Container Dashboard Installer
# ============================================
# Creates a web dashboard to view Podman containers
# in Proxmox environment
# ============================================

set -e

echo "============================================"
echo "Installing Proxmox Container Dashboard"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

# Install dependencies
echo "Step 1: Installing dependencies..."
apt update
apt install -y nginx jq netcat-openbsd
echo "✓ Dependencies installed"
echo ""

# Create dashboard directory
echo "Step 2: Creating dashboard..."
mkdir -p /var/www/html/iptv-dashboard

# Create dashboard HTML
cat > /var/www/html/iptv-dashboard/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>IPTV Containers - Proxmox Dashboard</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        h1 {
            color: white;
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.2);
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .card {
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 12px rgba(0,0,0,0.15);
        }
        .card h2 {
            color: #333;
            margin-bottom: 15px;
            font-size: 1.3em;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .status {
            display: inline-flex;
            align-items: center;
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.85em;
            font-weight: bold;
            gap: 6px;
        }
        .status::before {
            content: '';
            width: 8px;
            height: 8px;
            border-radius: 50%;
            animation: pulse 2s infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .running {
            background: #d4edda;
            color: #155724;
        }
        .running::before {
            background: #28a745;
        }
        .stopped {
            background: #f8d7da;
            color: #721c24;
        }
        .stopped::before {
            background: #dc3545;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            padding: 10px 0;
            border-bottom: 1px solid #eee;
        }
        .info-row:last-child {
            border-bottom: none;
        }
        .label {
            color: #666;
            font-weight: 500;
        }
        .value {
            color: #333;
            font-weight: 600;
        }
        .stats-table {
            width: 100%;
            background: white;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .stats-table table {
            width: 100%;
            border-collapse: collapse;
        }
        .stats-table th {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        .stats-table td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        .stats-table tr:hover {
            background: #f8f9fa;
        }
        .refresh-info {
            text-align: center;
            color: white;
            margin-top: 20px;
            font-size: 0.9em;
        }
        .error {
            background: #f8d7da;
            color: #721c24;
            padding: 20px;
            border-radius: 12px;
            text-align: center;
            margin: 20px 0;
        }
        .loading {
            text-align: center;
            color: white;
            font-size: 1.2em;
            padding: 40px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 IPTV Container Dashboard</h1>
        <div id="loading" class="loading">Loading container data...</div>
        <div id="error" class="error" style="display:none;"></div>
        <div id="cards" class="grid"></div>
        <div id="stats" class="stats-table" style="display:none;"></div>
        <div class="refresh-info">Auto-refresh every 10 seconds</div>
    </div>

    <script>
        async function fetchContainers() {
            try {
                const response = await fetch('/api/containers');
                const data = await response.json();
                displayContainers(data);
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').style.display = 'none';
            } catch (error) {
                document.getElementById('loading').style.display = 'none';
                document.getElementById('error').style.display = 'block';
                document.getElementById('error').textContent = 'Failed to fetch container data: ' + error.message;
            }
        }

        function displayContainers(containers) {
            const cardsDiv = document.getElementById('cards');
            const statsDiv = document.getElementById('stats');
            
            if (!containers || containers.length === 0) {
                cardsDiv.innerHTML = '<div class="error">No containers found</div>';
                return;
            }

            // Display cards
            cardsDiv.innerHTML = containers.map(c => {
                const status = c.State === 'running' ? 'running' : 'stopped';
                const name = c.Names[0].replace(/^\//, '');
                
                return `
                    <div class="card">
                        <h2>
                            ${name}
                            <span class="status ${status}">${c.State}</span>
                        </h2>
                        <div class="info-row">
                            <span class="label">Image</span>
                            <span class="value">${c.Image || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Status</span>
                            <span class="value">${c.Status}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">ID</span>
                            <span class="value">${c.Id.substring(0, 12)}</span>
                        </div>
                    </div>
                `;
            }).join('');

            // Display stats table
            statsDiv.style.display = 'block';
            statsDiv.innerHTML = `
                <h2 style="margin-bottom: 15px; color: #333;">Container Statistics</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Image</th>
                            <th>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${containers.map(c => `
                            <tr>
                                <td>${c.Names[0].replace(/^\//, '')}</td>
                                <td><span class="status ${c.State === 'running' ? 'running' : 'stopped'}">${c.State}</span></td>
                                <td>${c.Image || 'N/A'}</td>
                                <td>${new Date(c.Created * 1000).toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        // Initial fetch
        fetchContainers();

        // Auto-refresh every 10 seconds
        setInterval(fetchContainers, 10000);
    </script>
</body>
</html>
EOF

echo "✓ Dashboard HTML created"
echo ""

# Create API endpoint script
echo "Step 3: Creating API endpoint..."
cat > /usr/local/bin/iptv-container-api << 'EOF'
#!/bin/bash
# Simple HTTP API for container stats

PORT=18088

while true; do
    # Get container data
    CONTAINERS=$(podman ps -a --format json 2>/dev/null || echo '[]')
    
    # Send HTTP response
    {
        echo "HTTP/1.1 200 OK"
        echo "Content-Type: application/json"
        echo "Access-Control-Allow-Origin: *"
        echo "Cache-Control: no-cache"
        echo ""
        echo "$CONTAINERS"
    } | nc -l -p $PORT -q 1 2>/dev/null
done
EOF

chmod +x /usr/local/bin/iptv-container-api
echo "✓ API script created"
echo ""

# Create systemd service for API
echo "Step 4: Creating API service..."
cat > /etc/systemd/system/iptv-container-api.service << 'EOF'
[Unit]
Description=IPTV Container API Service
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/iptv-container-api
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now iptv-container-api.service
echo "✓ API service started"
echo ""

# Configure nginx
echo "Step 5: Configuring nginx..."
cat > /etc/nginx/sites-available/iptv-dashboard << 'EOF'
server {
    listen 18089;
    server_name _;
    
    root /var/www/html/iptv-dashboard;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api/containers {
        proxy_pass http://localhost:18088/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
    }
}
EOF

ln -sf /etc/nginx/sites-available/iptv-dashboard /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
echo "✓ Nginx configured"
echo ""

# Get IP address
IP=$(hostname -I | awk '{print $1}')

echo "============================================"
echo "Installation Complete!"
echo "============================================"
echo ""
echo "Dashboard URL: http://$IP:18089"
echo ""
echo "The dashboard will auto-refresh every 10 seconds."
echo "You can also access it from the Proxmox host shell:"
echo "  curl http://localhost:18089"
echo ""
echo "To stop the dashboard:"
echo "  systemctl stop iptv-container-api nginx"
echo ""
echo "To uninstall:"
echo "  systemctl stop iptv-container-api"
echo "  systemctl disable iptv-container-api"
echo "  rm -f /etc/systemd/system/iptv-container-api.service"
echo "  rm -f /usr/local/bin/iptv-container-api"
echo "  rm -f /etc/nginx/sites-enabled/iptv-dashboard"
echo "  rm -rf /var/www/html/iptv-dashboard"
echo "  systemctl reload nginx"
echo ""
