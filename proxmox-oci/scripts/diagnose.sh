#!/bin/bash
# Diagnostic script for IPTV LXC deployment
# Run this from the Proxmox host

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   IPTV LXC Deployment Diagnostics        ${NC}"
echo -e "${BLUE}===========================================${NC}"

# Container IDs
CT_POSTGRES=${CT_POSTGRES:-100}
CT_REDIS=${CT_REDIS:-101}
CT_BACKEND=${CT_BACKEND:-102}
CT_FRONTEND=${CT_FRONTEND:-103}

echo ""
echo -e "${YELLOW}1. Checking Container Status${NC}"
echo "----------------------------------------"
for ct in $CT_POSTGRES $CT_REDIS $CT_BACKEND $CT_FRONTEND; do
    status=$(pct status $ct 2>/dev/null | awk '{print $2}')
    name=$(pct config $ct 2>/dev/null | grep hostname | awk '{print $2}')
    if [ "$status" == "running" ]; then
        echo -e "  CT $ct ($name): ${GREEN}$status${NC}"
    else
        echo -e "  CT $ct ($name): ${RED}$status${NC}"
    fi
done

echo ""
echo -e "${YELLOW}2. Checking Network Connectivity${NC}"
echo "----------------------------------------"
# Check if backend can reach postgres
echo -n "  Backend -> PostgreSQL: "
if pct exec $CT_BACKEND -- nc -z 10.10.0.10 5432 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
fi

# Check if backend can reach redis
echo -n "  Backend -> Redis: "
if pct exec $CT_BACKEND -- nc -z 10.10.0.11 6379 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
fi

# Check if frontend can reach backend
echo -n "  Frontend -> Backend: "
if pct exec $CT_FRONTEND -- nc -z 10.10.0.12 3001 2>/dev/null; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}FAILED${NC}"
fi

echo ""
echo -e "${YELLOW}3. Checking Services${NC}"
echo "----------------------------------------"
# PostgreSQL
echo -n "  PostgreSQL: "
if pct exec $CT_POSTGRES -- pg_isready -U iptv 2>/dev/null | grep -q "accepting"; then
    echo -e "${GREEN}Ready${NC}"
else
    echo -e "${RED}Not Ready${NC}"
fi

# Redis
echo -n "  Redis: "
if pct exec $CT_REDIS -- redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}Ready${NC}"
else
    echo -e "${RED}Not Ready${NC}"
fi

# Backend
echo -n "  Backend (Node.js): "
if pct exec $CT_BACKEND -- pgrep -f "node" > /dev/null 2>&1; then
    echo -e "${GREEN}Running${NC}"
else
    echo -e "${RED}Not Running${NC}"
fi

# Frontend
echo -n "  Frontend (Next.js): "
if pct exec $CT_FRONTEND -- pgrep -f "node" > /dev/null 2>&1; then
    echo -e "${GREEN}Running${NC}"
else
    echo -e "${RED}Not Running${NC}"
fi

echo ""
echo -e "${YELLOW}4. Checking Media Storage${NC}"
echo "----------------------------------------"
# Check if storage is mounted
echo -n "  Storage mount on Backend: "
if pct exec $CT_BACKEND -- test -d /mnt/iptv-storage 2>/dev/null; then
    echo -e "${GREEN}Exists${NC}"
    
    # Check subdirectories
    for dir in movies series subtitles hls temp; do
        echo -n "    /mnt/iptv-storage/$dir: "
        if pct exec $CT_BACKEND -- test -d /mnt/iptv-storage/$dir 2>/dev/null; then
            count=$(pct exec $CT_BACKEND -- find /mnt/iptv-storage/$dir -maxdepth 1 -type f 2>/dev/null | wc -l)
            echo -e "${GREEN}Exists${NC} ($count files)"
        else
            echo -e "${YELLOW}Missing${NC}"
        fi
    done
else
    echo -e "${RED}Missing${NC}"
fi

echo ""
echo -e "${YELLOW}5. Checking FFmpeg${NC}"
echo "----------------------------------------"
echo -n "  FFmpeg on Backend: "
if pct exec $CT_BACKEND -- which ffmpeg > /dev/null 2>&1; then
    version=$(pct exec $CT_BACKEND -- ffmpeg -version 2>&1 | head -1)
    echo -e "${GREEN}Installed${NC}"
    echo "    $version"
else
    echo -e "${RED}Not Installed${NC}"
fi

echo -n "  FFprobe on Backend: "
if pct exec $CT_BACKEND -- which ffprobe > /dev/null 2>&1; then
    echo -e "${GREEN}Installed${NC}"
else
    echo -e "${RED}Not Installed${NC}"
fi

echo ""
echo -e "${YELLOW}6. Backend API Health Check${NC}"
echo "----------------------------------------"
echo -n "  API Response: "
response=$(pct exec $CT_BACKEND -- curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>/dev/null || echo "000")
if [ "$response" == "200" ]; then
    echo -e "${GREEN}OK (200)${NC}"
else
    echo -e "${RED}Failed ($response)${NC}"
fi

echo ""
echo -e "${YELLOW}7. Recent Backend Logs${NC}"
echo "----------------------------------------"
echo "  Last 10 log lines:"
pct exec $CT_BACKEND -- journalctl -u iptv-backend -n 10 --no-pager 2>/dev/null || \
pct exec $CT_BACKEND -- tail -10 /var/log/iptv-backend.log 2>/dev/null || \
echo "  Unable to fetch logs"

echo ""
echo -e "${YELLOW}8. Database Connection Test${NC}"
echo "----------------------------------------"
echo -n "  VOD Count: "
count=$(pct exec $CT_BACKEND -- node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.stream.count({ where: { streamType: 'VOD' }}).then(c => { console.log(c); process.exit(0); }).catch(e => { console.log('Error: ' + e.message); process.exit(1); });
" 2>/dev/null || echo "Unable to query")
echo "$count"

echo ""
echo -e "${YELLOW}9. VOD Source Path Check${NC}"
echo "----------------------------------------"
# Get first VOD and check if its source exists
pct exec $CT_BACKEND -- node -e "
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function check() {
    const vods = await prisma.stream.findMany({ 
        where: { streamType: 'VOD' },
        take: 5,
        select: { id: true, name: true, sourceUrl: true }
    });
    
    for (const vod of vods) {
        let sourcePath = vod.sourceUrl;
        
        // Resolve relative paths
        if (!sourcePath.startsWith('http') && !sourcePath.startsWith('/')) {
            sourcePath = '/mnt/iptv-storage/movies/' + sourcePath;
        }
        
        const exists = fs.existsSync(sourcePath);
        console.log('  VOD ' + vod.id + ': ' + (exists ? 'OK' : 'MISSING') + ' - ' + sourcePath);
    }
}
check().then(() => process.exit(0)).catch(e => { console.log('Error: ' + e.message); process.exit(1); });
" 2>/dev/null || echo "  Unable to check VOD sources"

echo ""
echo -e "${BLUE}===========================================${NC}"
echo -e "${BLUE}   Diagnostics Complete                   ${NC}"
echo -e "${BLUE}===========================================${NC}"

echo ""
echo "To fix common issues:"
echo "  1. Missing FFmpeg: pct exec $CT_BACKEND -- apt install -y ffmpeg"
echo "  2. Missing storage: Create /mnt/iptv-storage/{movies,series,subtitles,hls,temp}"
echo "  3. Service not running: pct exec $CT_BACKEND -- systemctl restart iptv-backend"
echo "  4. View full logs: pct exec $CT_BACKEND -- journalctl -u iptv-backend -f"
