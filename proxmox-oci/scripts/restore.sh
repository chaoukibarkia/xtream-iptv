#!/bin/bash
# ============================================
# IPTV System - Restore Script
# ============================================

set -e

BACKUP_DIR="/storage-pool/xtream-backups"

echo "============================================"
echo "IPTV System - Restore"
echo "============================================"
echo ""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Error: This script must be run as root${NC}"
    exit 1
fi

# List available backups
echo "Available database backups:"
ls -lh "${BACKUP_DIR}"/database_*.sql.gz 2>/dev/null || echo "No backups found"
echo ""

# Get backup file
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Example:"
    echo "  $0 ${BACKUP_DIR}/database_20231201_120000.sql.gz"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}WARNING: This will overwrite the current database!${NC}"
echo -e "${YELLOW}Press Ctrl+C to cancel or Enter to continue...${NC}"
read

echo ""
echo "Step 1: Stopping backend service..."
systemctl stop iptv-backend.service

echo ""
echo "Step 2: Restoring database..."

# Decompress and restore
gunzip -c "$BACKUP_FILE" | podman exec -i iptv-postgres psql -U iptv iptv_db

echo -e "${GREEN}✓ Database restored${NC}"

echo ""
echo "Step 3: Starting backend service..."
systemctl start iptv-backend.service

echo ""
echo -e "${GREEN}✓ Restore complete!${NC}"
echo ""
echo "Check status with: systemctl status iptv-backend.service"
