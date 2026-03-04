#!/bin/bash
# Frontend Deployment Script for LXC 103
# Builds Next.js locally and deploys to standalone container

set -e

FRONTEND_DIR="/storage-pool/xtream/iptv-frontend"
LXC_ID="103"
DEPLOY_PATH="/opt/iptv-frontend/.next/standalone"

echo "🚀 Starting frontend deployment..."

# Step 1: Build locally
echo "📦 Building Next.js frontend..."
cd "$FRONTEND_DIR"
rm -rf .next
npm run build

if [ ! -d ".next/standalone" ]; then
    echo "❌ Error: Standalone build not found. Check next.config.ts output setting."
    exit 1
fi

# Step 2: Stop the service
echo "⏸️  Stopping frontend service..."
pct exec "$LXC_ID" -- systemctl stop iptv-frontend

# Step 3: Package the build
echo "📦 Packaging build artifacts..."
tar -czf /tmp/frontend-deploy.tar.gz .next/standalone

# Step 4: Deploy to container
echo "📤 Copying to LXC $LXC_ID..."
pct push "$LXC_ID" /tmp/frontend-deploy.tar.gz /tmp/frontend-deploy.tar.gz

echo "📂 Extracting in container..."
pct exec "$LXC_ID" -- bash -c "
    cd /opt/iptv-frontend
    rm -rf .next/standalone
    tar -xzf /tmp/frontend-deploy.tar.gz
    chown -R nodeapp:nodeapp .next/standalone
    rm /tmp/frontend-deploy.tar.gz
"

# Step 5: Copy static assets and public folder
echo "📁 Copying static assets..."
pct exec "$LXC_ID" -- bash -c "
    cd /opt/iptv-frontend
    cp -r public .next/standalone/
    cp -r .next/static .next/standalone/.next/
    chown -R nodeapp:nodeapp .next/standalone
"

# Cleanup
rm /tmp/frontend-deploy.tar.gz

# Step 6: Start the service
echo "▶️  Starting frontend service..."
pct exec "$LXC_ID" -- systemctl start iptv-frontend

# Wait for service to be ready
sleep 3

# Step 7: Verify
echo "✅ Verifying deployment..."
if pct exec "$LXC_ID" -- systemctl is-active --quiet iptv-frontend; then
    echo "✅ Frontend service is running"
    pct exec "$LXC_ID" -- systemctl status iptv-frontend --no-pager | head -15
else
    echo "❌ Frontend service failed to start"
    pct exec "$LXC_ID" -- journalctl -u iptv-frontend -n 50 --no-pager
    exit 1
fi

echo ""
echo "🎉 Frontend deployment complete!"
echo "🌐 Access at: https://s01.zz00.org"
echo ""
echo "💡 Don't forget to clear browser cache (Ctrl+Shift+R / Cmd+Shift+R)"
