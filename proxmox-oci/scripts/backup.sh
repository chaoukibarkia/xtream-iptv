#!/bin/bash
# ============================================
# IPTV System - Backup Script
# ============================================

set -e

BACKUP_DIR="/storage-pool/xtream-backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "============================================"
echo "IPTV System - Backup"
echo "============================================"
echo ""

GREEN='\033[0;32m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

# Create backup directory
mkdir -p "${BACKUP_DIR}"

echo "Backup destination: ${BACKUP_DIR}"
echo ""

# Backup PostgreSQL
echo "Step 1: Backing up PostgreSQL database..."
podman exec iptv-postgres pg_dump -U iptv iptv_db > "${BACKUP_DIR}/database_${TIMESTAMP}.sql"
gzip "${BACKUP_DIR}/database_${TIMESTAMP}.sql"
echo -e "${GREEN}✓ Database backed up to: database_${TIMESTAMP}.sql.gz${NC}"
echo ""

# Backup data volumes
echo "Step 2: Backing up data volumes..."
tar czf "${BACKUP_DIR}/volumes_${TIMESTAMP}.tar.gz" /storage-pool/xtream-data/
echo -e "${GREEN}✓ Volumes backed up to: volumes_${TIMESTAMP}.tar.gz${NC}"
echo ""

# Backup configuration
echo "Step 3: Backing up Quadlet configuration..."
tar czf "${BACKUP_DIR}/config_${TIMESTAMP}.tar.gz" /etc/containers/systemd/iptv-*
echo -e "${GREEN}✓ Configuration backed up to: config_${TIMESTAMP}.tar.gz${NC}"
echo ""

# List backups
echo "============================================"
echo "Backup Complete!"
echo "============================================"
echo ""
echo "Backup files:"
ls -lh "${BACKUP_DIR}/" | grep "${TIMESTAMP}"
echo ""

# Cleanup old backups (keep last 7 days)
echo "Cleaning up backups older than 7 days..."
find "${BACKUP_DIR}" -name "*.gz" -mtime +7 -delete
echo -e "${GREEN}✓ Old backups removed${NC}"
echo ""
