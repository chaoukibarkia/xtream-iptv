#!/bin/bash
# ============================================
# Fix Media Paths and Rebuild Services
# ============================================
# Updates backend and frontend for shared storage
# ============================================

set -e

# Configuration
CT_BACKEND=102
CT_FRONTEND=103
DOMAIN="s01.zz00.org"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# Step 1: Update Backend Service with correct paths
# ============================================
fix_backend() {
    log_info "=== Fixing Backend Service (CT $CT_BACKEND) ==="
    
    pct exec $CT_BACKEND -- bash << 'EOF'
set -e

# Create directories if not exist
mkdir -p /media/movies /media/series /media/live /media/hls /media/images
chown -R nodeapp:nodeapp /media

# Update systemd service with correct paths
cat > /etc/systemd/system/iptv-backend.service << 'SVC'
[Unit]
Description=IPTV Backend API Server
After=network.target

[Service]
Type=simple
User=nodeapp
Group=nodeapp
WorkingDirectory=/opt/iptv-server
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

# Server Configuration
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3001

# Database & Redis
Environment=DATABASE_URL=postgresql://iptv:iptv_secret@postgresql:5432/iptv_db
Environment=REDIS_URL=redis://redis:6379

# Server Info (for player API responses) - Use external domain
Environment=SERVER_URL=https://s01.zz00.org
Environment=SERVER_PORT=443
Environment=SERVER_HTTPS_PORT=443
Environment=SERVER_RTMP_PORT=1935
Environment=SERVER_TIMEZONE=UTC

# FFmpeg & Streaming
Environment=FFMPEG_PATH=/usr/bin/ffmpeg
Environment=HLS_SEGMENT_PATH=/media/hls

# Media Storage Paths - Using shared /media mount
Environment=MEDIA_PATH=/media
Environment=VOD_PATH=/media/movies
Environment=SERIES_PATH=/media/series
Environment=LIVE_PATH=/media/live
Environment=IMAGES_PATH=/media/images

# Logging
Environment=LOG_LEVEL=info

# TMDB Integration
Environment=TMDB_API_KEY=b49ab0aaf0228313ed15fcd51ee854b5
Environment=TMDB_LANGUAGE=en-US
Environment=TMDB_INCLUDE_ADULT=false
Environment=TMDB_RATE_LIMIT_MS=250

# Admin API Key (for frontend access)
Environment=ADMIN_API_KEY=admin-dev-key

# JWT Secret (for token signing)
Environment=JWT_SECRET=iptv-super-secret-jwt-key-change-in-production-min-32-chars

LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SVC

# Reload and restart
systemctl daemon-reload

# Check if the app is built
if [ -d "/opt/iptv-server/dist" ]; then
    echo "Backend build exists, restarting service..."
    systemctl restart iptv-backend
    sleep 3
    systemctl status iptv-backend --no-pager || true
else
    echo "Backend not built yet. Build first with: cd /opt/iptv-server && npm run build"
fi

echo "Backend service updated"
EOF
    log_success "Backend service updated"
}

# ============================================
# Step 2: Update Frontend for API Proxy
# ============================================
fix_frontend() {
    log_info "=== Fixing Frontend Service (CT $CT_FRONTEND) ==="
    
    pct exec $CT_FRONTEND -- bash << 'EOF'
set -e

# Update systemd service
cat > /etc/systemd/system/iptv-frontend.service << 'SVC'
[Unit]
Description=IPTV Frontend Next.js
After=network.target

[Service]
Type=simple
User=nodeapp
Group=nodeapp
WorkingDirectory=/opt/iptv-frontend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

# Production settings
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0

# Backend API URL (internal network for server-side)
Environment=BACKEND_URL=http://10.10.0.12:3001

# Client-side API URL (empty = use relative paths through nginx proxy)
Environment=NEXT_PUBLIC_API_URL=
Environment=NEXT_PUBLIC_ADMIN_API_KEY=admin-dev-key
Environment=NEXT_PUBLIC_TMDB_IMAGE_BASE=https://image.tmdb.org/t/p

[Install]
WantedBy=multi-user.target
SVC

# Reload
systemctl daemon-reload

# Check if the app is built
if [ -f "/opt/iptv-frontend/server.js" ] || [ -d "/opt/iptv-frontend/.next" ]; then
    echo "Frontend build exists, restarting service..."
    systemctl restart iptv-frontend
    sleep 3
    systemctl status iptv-frontend --no-pager || true
else
    echo "Frontend not built yet. Build first with: cd /opt/iptv-frontend && npm run build"
fi

echo "Frontend service updated"
EOF
    log_success "Frontend service updated"
}

# ============================================
# Step 3: Rebuild Backend
# ============================================
rebuild_backend() {
    log_info "=== Rebuilding Backend (CT $CT_BACKEND) ==="
    
    pct exec $CT_BACKEND -- bash << 'EOF'
set -e
cd /opt/iptv-server

# Check if source code exists
if [ ! -f "package.json" ]; then
    echo "ERROR: Backend source code not found in /opt/iptv-server"
    exit 1
fi

echo "Installing dependencies..."
npm ci --production=false 2>/dev/null || npm install

echo "Running database migrations..."
npx prisma generate
npx prisma migrate deploy || npx prisma db push --accept-data-loss

echo "Building backend..."
npm run build

echo "Setting permissions..."
chown -R nodeapp:nodeapp /opt/iptv-server

echo "Restarting service..."
systemctl restart iptv-backend
sleep 3
systemctl status iptv-backend --no-pager || true

echo "Backend rebuild complete"
EOF
    log_success "Backend rebuilt"
}

# ============================================
# Step 4: Rebuild Frontend
# ============================================
rebuild_frontend() {
    log_info "=== Rebuilding Frontend (CT $CT_FRONTEND) ==="
    
    pct exec $CT_FRONTEND -- bash << 'EOF'
set -e
cd /opt/iptv-frontend

# Check if source code exists
if [ ! -f "package.json" ]; then
    echo "ERROR: Frontend source code not found in /opt/iptv-frontend"
    exit 1
fi

echo "Installing dependencies..."
npm ci --production=false 2>/dev/null || npm install

# Create production .env for build
cat > .env.production << 'ENVPROD'
# Client-side - empty means use relative URLs (through nginx proxy)
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_ADMIN_API_KEY=admin-dev-key
NEXT_PUBLIC_TMDB_IMAGE_BASE=https://image.tmdb.org/t/p
ENVPROD

echo "Building frontend..."
npm run build

echo "Setting permissions..."
chown -R nodeapp:nodeapp /opt/iptv-frontend

echo "Restarting service..."
systemctl restart iptv-frontend
sleep 3
systemctl status iptv-frontend --no-pager || true

echo "Frontend rebuild complete"
EOF
    log_success "Frontend rebuilt"
}

# ============================================
# Step 5: Check Services Status
# ============================================
check_services() {
    log_info "=== Checking Services Status ==="
    
    echo ""
    echo "Backend Status (CT $CT_BACKEND):"
    pct exec $CT_BACKEND -- systemctl status iptv-backend --no-pager 2>/dev/null || echo "Service not running"
    
    echo ""
    echo "Frontend Status (CT $CT_FRONTEND):"
    pct exec $CT_FRONTEND -- systemctl status iptv-frontend --no-pager 2>/dev/null || echo "Service not running"
    
    echo ""
    echo "Testing connectivity..."
    echo "Backend API:"
    curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n" http://10.10.0.12:3001/api/health 2>/dev/null || echo "  Backend not reachable"
    
    echo "Frontend:"
    curl -s -o /dev/null -w "  HTTP Status: %{http_code}\n" http://10.10.0.13:3000/ 2>/dev/null || echo "  Frontend not reachable"
}

# ============================================
# Step 6: Show Backend Logs
# ============================================
show_backend_logs() {
    log_info "=== Backend Logs (last 50 lines) ==="
    pct exec $CT_BACKEND -- journalctl -u iptv-backend -n 50 --no-pager 2>/dev/null || echo "No logs available"
}

# ============================================
# Main
# ============================================
usage() {
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  fix         - Fix service configurations only"
    echo "  rebuild     - Rebuild both backend and frontend"
    echo "  backend     - Rebuild backend only"
    echo "  frontend    - Rebuild frontend only"
    echo "  status      - Check services status"
    echo "  logs        - Show backend logs"
    echo "  all         - Fix and rebuild everything (default)"
    echo ""
}

main() {
    case "${1:-all}" in
        fix)
            fix_backend
            fix_frontend
            ;;
        rebuild)
            rebuild_backend
            rebuild_frontend
            ;;
        backend)
            fix_backend
            rebuild_backend
            ;;
        frontend)
            fix_frontend
            rebuild_frontend
            ;;
        status)
            check_services
            ;;
        logs)
            show_backend_logs
            ;;
        all)
            fix_backend
            fix_frontend
            rebuild_backend
            rebuild_frontend
            check_services
            ;;
        -h|--help|help)
            usage
            ;;
        *)
            log_error "Unknown command: $1"
            usage
            exit 1
            ;;
    esac
}

main "$@"
