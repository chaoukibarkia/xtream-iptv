#!/bin/bash
# ============================================
# IPTV System - Status Check
# ============================================

echo "============================================"
echo "IPTV System - Status"
echo "============================================"
echo ""

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check systemd services
echo "Systemd Services:"
echo "----------------------------------------"
for service in iptv-pod iptv-postgres iptv-redis iptv-backend iptv-frontend; do
    if systemctl is-active --quiet ${service}.service; then
        echo -e "${GREEN}✓${NC} ${service}.service - $(systemctl is-active ${service}.service)"
    else
        echo -e "${RED}✗${NC} ${service}.service - $(systemctl is-active ${service}.service)"
    fi
done
echo ""

# Check Podman pod
echo "Podman Pod:"
echo "----------------------------------------"
podman pod ps
echo ""

# Check containers
echo "Containers:"
echo "----------------------------------------"
podman ps --pod --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# Check container health
echo "Container Health:"
echo "----------------------------------------"
for container in iptv-postgres iptv-redis iptv-backend iptv-frontend; do
    if podman ps --filter "name=${container}" --format "{{.Names}}" | grep -q "${container}"; then
        HEALTH=$(podman inspect ${container} --format='{{.State.Health.Status}}' 2>/dev/null || echo "no healthcheck")
        if [ "$HEALTH" = "healthy" ]; then
            echo -e "${GREEN}✓${NC} ${container}: ${HEALTH}"
        elif [ "$HEALTH" = "no healthcheck" ]; then
            echo -e "${YELLOW}○${NC} ${container}: ${HEALTH}"
        else
            echo -e "${RED}✗${NC} ${container}: ${HEALTH}"
        fi
    else
        echo -e "${RED}✗${NC} ${container}: not running"
    fi
done
echo ""

# Check endpoints
echo "Endpoint Health:"
echo "----------------------------------------"
if curl -sf http://localhost:3001/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend API: http://localhost:3001/health"
else
    echo -e "${RED}✗${NC} Backend API: http://localhost:3001/health (unreachable)"
fi

if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Frontend: http://localhost:3000"
else
    echo -e "${RED}✗${NC} Frontend: http://localhost:3000 (unreachable)"
fi
echo ""

# Check resource usage
echo "Resource Usage:"
echo "----------------------------------------"
podman stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"
echo ""
