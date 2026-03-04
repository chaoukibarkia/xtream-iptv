#!/bin/bash
# ============================================
# IPTV System - Proxmox LXC Native Deployment
# ============================================
# Déploie l'IPTV system en conteneurs LXC natifs
# Basé sur le guide Proxmox VE 9.1 OCI/LXC
# ============================================

set -e

# ============================================
# Configuration
# ============================================
TEMPLATE="local:vztmpl/debian-12-standard_12.12-1_amd64.tar.zst"
STORAGE="local-lvm"
NETWORK_ZONE="iptvzone"
NETWORK_VNET="iptvnet"
SUBNET="10.10.0"

# IDs des conteneurs
CT_POSTGRES=100
CT_REDIS=101
CT_BACKEND=102
CT_FRONTEND=103

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================
# Fonctions utilitaires
# ============================================
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Ce script doit être exécuté en tant que root"
        exit 1
    fi
}

wait_for_container() {
    local ctid=$1
    local max_wait=60
    local waited=0
    
    while [ $waited -lt $max_wait ]; do
        if pct status $ctid 2>/dev/null | grep -q "running"; then
            sleep 5  # Attendre que le réseau soit prêt
            return 0
        fi
        sleep 2
        waited=$((waited + 2))
    done
    
    log_error "Timeout en attendant le conteneur $ctid"
    return 1
}

# ============================================
# Phase 1: Préparation
# ============================================
phase1_prepare() {
    log_info "=== Phase 1: Préparation de l'infrastructure ==="
    
    # Vérifier Proxmox
    if ! command -v pct &> /dev/null; then
        log_error "Ce script doit être exécuté sur un hôte Proxmox VE"
        exit 1
    fi
    
    # Installer dnsmasq si nécessaire
    if ! dpkg -l | grep -q dnsmasq; then
        log_info "Installation de dnsmasq..."
        apt update
        apt install -y dnsmasq
        systemctl disable --now dnsmasq
    fi
    log_success "dnsmasq installé"
    
    # Configuration kernel pour Redis
    log_info "Configuration des paramètres kernel..."
    if ! grep -q "vm.overcommit_memory = 1" /etc/sysctl.conf; then
        cat >> /etc/sysctl.conf << 'EOF'
# Pour Redis et conteneurs
vm.overcommit_memory = 1
net.core.somaxconn = 65535
fs.file-max = 2097152
EOF
        sysctl -p
    fi
    
    # Transparent hugepages
    echo never > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
    log_success "Kernel configuré"
    
    # Télécharger template
    log_info "Vérification du template Debian 12..."
    if ! pveam list local | grep -q "debian-12-standard"; then
        log_info "Téléchargement du template..."
        pveam download local debian-12-standard_12.12-1_amd64.tar.zst
    fi
    log_success "Template disponible"
}

# ============================================
# Phase 2: Réseau SDN
# ============================================
phase2_network() {
    log_info "=== Phase 2: Configuration réseau SDN ==="
    
    # Vérifier si la zone existe
    if pvesh get /cluster/sdn/zones 2>/dev/null | grep -q "$NETWORK_ZONE"; then
        log_warn "Zone SDN '$NETWORK_ZONE' existe déjà"
    else
        log_info "Création de la zone SDN..."
        pvesh create /cluster/sdn/zones --zone $NETWORK_ZONE --type simple --dhcp dnsmasq --ipam pve
        
        log_info "Création du VNet..."
        pvesh create /cluster/sdn/vnets --vnet $NETWORK_VNET --zone $NETWORK_ZONE
        
        log_info "Création du subnet..."
        pvesh create /cluster/sdn/vnets/$NETWORK_VNET/subnets \
            --subnet ${SUBNET}.0/24 \
            --gateway ${SUBNET}.1 \
            --snat 1
        
        log_info "Application de la configuration SDN..."
        pvesh set /cluster/sdn
        
        sleep 5  # Attendre que le réseau soit prêt
    fi
    log_success "Réseau SDN configuré"
}

# ============================================
# Phase 3: Création des conteneurs
# ============================================
phase3_containers() {
    log_info "=== Phase 3: Création des conteneurs LXC ==="
    
    # PostgreSQL
    if pct status $CT_POSTGRES &>/dev/null; then
        log_warn "Conteneur $CT_POSTGRES existe déjà"
    else
        log_info "Création conteneur PostgreSQL ($CT_POSTGRES)..."
        pct create $CT_POSTGRES $TEMPLATE \
            --hostname iptv-postgresql \
            --memory 4096 \
            --cores 2 \
            --net0 name=eth0,bridge=$NETWORK_VNET,ip=${SUBNET}.10/24,gw=${SUBNET}.1,firewall=1 \
            --nameserver ${SUBNET}.1 \
            --searchdomain iptv.local \
            --rootfs ${STORAGE}:20 \
            --unprivileged 1 \
            --features nesting=1 \
            --onboot 1 \
            --startup order=1,up=30
        log_success "PostgreSQL créé"
    fi
    
    # Redis
    if pct status $CT_REDIS &>/dev/null; then
        log_warn "Conteneur $CT_REDIS existe déjà"
    else
        log_info "Création conteneur Redis ($CT_REDIS)..."
        pct create $CT_REDIS $TEMPLATE \
            --hostname iptv-redis \
            --memory 2048 \
            --cores 1 \
            --swap 0 \
            --net0 name=eth0,bridge=$NETWORK_VNET,ip=${SUBNET}.11/24,gw=${SUBNET}.1,firewall=1 \
            --nameserver ${SUBNET}.1 \
            --searchdomain iptv.local \
            --rootfs ${STORAGE}:8 \
            --unprivileged 1 \
            --features nesting=1,keyctl=1 \
            --onboot 1 \
            --startup order=2,up=15
        log_success "Redis créé"
    fi
    
    # Backend
    if pct status $CT_BACKEND &>/dev/null; then
        log_warn "Conteneur $CT_BACKEND existe déjà"
    else
        log_info "Création conteneur Backend ($CT_BACKEND)..."
        pct create $CT_BACKEND $TEMPLATE \
            --hostname iptv-backend \
            --memory 4096 \
            --cores 4 \
            --net0 name=eth0,bridge=$NETWORK_VNET,ip=${SUBNET}.12/24,gw=${SUBNET}.1,firewall=1 \
            --nameserver ${SUBNET}.1 \
            --searchdomain iptv.local \
            --rootfs ${STORAGE}:32 \
            --unprivileged 1 \
            --features nesting=1 \
            --onboot 1 \
            --startup order=3,up=30
        log_success "Backend créé"
    fi
    
    # Frontend
    if pct status $CT_FRONTEND &>/dev/null; then
        log_warn "Conteneur $CT_FRONTEND existe déjà"
    else
        log_info "Création conteneur Frontend ($CT_FRONTEND)..."
        pct create $CT_FRONTEND $TEMPLATE \
            --hostname iptv-frontend \
            --memory 2048 \
            --cores 2 \
            --net0 name=eth0,bridge=$NETWORK_VNET,ip=${SUBNET}.13/24,gw=${SUBNET}.1,firewall=1 \
            --nameserver ${SUBNET}.1 \
            --searchdomain iptv.local \
            --rootfs ${STORAGE}:16 \
            --unprivileged 1 \
            --features nesting=1 \
            --onboot 1 \
            --startup order=4,up=15
        log_success "Frontend créé"
    fi
}

# ============================================
# Phase 4: Démarrage des conteneurs
# ============================================
phase4_start() {
    log_info "=== Phase 4: Démarrage des conteneurs ==="
    
    for ct in $CT_POSTGRES $CT_REDIS $CT_BACKEND $CT_FRONTEND; do
        if ! pct status $ct | grep -q "running"; then
            log_info "Démarrage conteneur $ct..."
            pct start $ct
            wait_for_container $ct
            log_success "Conteneur $ct démarré"
        else
            log_warn "Conteneur $ct déjà en cours d'exécution"
        fi
    done
}

# ============================================
# Phase 5: Configuration DNS
# ============================================
phase5_dns() {
    log_info "=== Phase 5: Configuration DNS entre conteneurs ==="
    
    for ct in $CT_POSTGRES $CT_REDIS $CT_BACKEND $CT_FRONTEND; do
        log_info "Configuration hosts sur conteneur $ct..."
        pct exec $ct -- bash -c "
if ! grep -q 'iptv-postgresql' /etc/hosts; then
cat >> /etc/hosts << 'EOF'
# IPTV System
${SUBNET}.10  iptv-postgresql postgresql db postgres
${SUBNET}.11  iptv-redis redis cache
${SUBNET}.12  iptv-backend backend api
${SUBNET}.13  iptv-frontend frontend web
${SUBNET}.1   gateway
EOF
fi
"
    done
    log_success "DNS configuré"
}

# ============================================
# Phase 6: Installation PostgreSQL
# ============================================
phase6_postgres() {
    log_info "=== Phase 6: Installation PostgreSQL ==="
    
    pct exec $CT_POSTGRES -- bash << 'EOF'
set -e

if dpkg -l | grep -q postgresql; then
    echo "PostgreSQL déjà installé"
    exit 0
fi

apt update
apt install -y postgresql postgresql-contrib

# Configuration
PGCONF=$(ls -d /etc/postgresql/*/main)/postgresql.conf
PGHBA=$(ls -d /etc/postgresql/*/main)/pg_hba.conf

sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" $PGCONF
echo "host all all 10.10.0.0/24 md5" >> $PGHBA

cat >> $PGCONF << 'PGCONF'
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
tcp_keepalives_idle = 60
tcp_keepalives_interval = 10
tcp_keepalives_count = 6
PGCONF

systemctl restart postgresql
systemctl enable postgresql

# Créer base de données
sudo -u postgres psql << 'PGSQL'
CREATE USER iptv WITH PASSWORD 'iptv_secret';
CREATE DATABASE iptv_db OWNER iptv;
GRANT ALL PRIVILEGES ON DATABASE iptv_db TO iptv;
\c iptv_db
GRANT ALL ON SCHEMA public TO iptv;
PGSQL

echo "PostgreSQL configuré"
EOF
    log_success "PostgreSQL installé"
}

# ============================================
# Phase 7: Installation Redis
# ============================================
phase7_redis() {
    log_info "=== Phase 7: Installation Redis ==="
    
    pct exec $CT_REDIS -- bash << 'EOF'
set -e

if dpkg -l | grep -q redis-server; then
    echo "Redis déjà installé"
    exit 0
fi

apt update
apt install -y redis-server

cat > /etc/redis/redis.conf << 'REDISCONF'
bind 0.0.0.0
port 6379
protected-mode no
maxmemory 1536mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
dir /var/lib/redis
tcp-backlog 511
timeout 0
tcp-keepalive 300
REDISCONF

chown redis:redis /var/lib/redis
chmod 750 /var/lib/redis

systemctl restart redis-server
systemctl enable redis-server

redis-cli ping
echo "Redis configuré"
EOF
    log_success "Redis installé"
}

# ============================================
# Phase 8: Installation Node.js
# ============================================
phase8_nodejs() {
    log_info "=== Phase 8: Installation Node.js sur Backend et Frontend ==="
    
    for ct in $CT_BACKEND $CT_FRONTEND; do
        log_info "Installation Node.js sur conteneur $ct..."
        pct exec $ct -- bash << 'EOF'
set -e

if command -v node &>/dev/null; then
    echo "Node.js déjà installé"
    exit 0
fi

apt update
apt install -y curl git build-essential

# Installer Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Créer utilisateur
if ! id nodeapp &>/dev/null; then
    useradd -m -s /bin/bash nodeapp
fi

node --version
npm --version
echo "Node.js installé"
EOF
        log_success "Node.js installé sur $ct"
    done
    
    # Installer FFmpeg sur Backend
    log_info "Installation FFmpeg sur Backend..."
    pct exec $CT_BACKEND -- apt install -y ffmpeg
    log_success "FFmpeg installé"
}

# ============================================
# Phase 9: Création des services systemd
# ============================================
phase9_services() {
    log_info "=== Phase 9: Création des services systemd ==="
    
    # Backend service
    pct exec $CT_BACKEND -- bash << 'EOF'
mkdir -p /opt/iptv-server /var/cache/iptv/images /tmp/hls-segments /var/log/iptv /mnt/iptv-storage
chown -R nodeapp:nodeapp /opt/iptv-server /var/cache/iptv /tmp/hls-segments /var/log/iptv /mnt/iptv-storage

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

Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3001
Environment=DATABASE_URL=postgresql://iptv:iptv_secret@postgresql:5432/iptv_db
Environment=REDIS_URL=redis://redis:6379
Environment=FFMPEG_PATH=/usr/bin/ffmpeg
Environment=HLS_SEGMENT_PATH=/mnt/iptv-storage/hls
Environment=MEDIA_PATH=/mnt/iptv-storage
Environment=LOG_LEVEL=info
Environment=SERVER_URL=https://s01.zz00.org
Environment=SERVER_PORT=3001
Environment=ADMIN_API_KEY=admin-dev-key
Environment=JWT_SECRET=iptv-super-secret-jwt-key-change-in-production-min-32-chars

LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
EOF
    log_success "Service Backend créé"
    
    # Frontend service
    pct exec $CT_FRONTEND -- bash << 'EOF'
mkdir -p /opt/iptv-frontend
chown -R nodeapp:nodeapp /opt/iptv-frontend

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

Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=BACKEND_URL=http://10.10.0.12:3001
Environment=NEXT_PUBLIC_API_URL=
Environment=NEXT_PUBLIC_ADMIN_API_KEY=admin-dev-key

[Install]
WantedBy=multi-user.target
SVC

systemctl daemon-reload
EOF
    log_success "Service Frontend créé"
}

# ============================================
# Affichage final
# ============================================
show_summary() {
    echo ""
    echo "============================================"
    echo -e "${GREEN}Déploiement LXC terminé avec succès!${NC}"
    echo "============================================"
    echo ""
    echo "Conteneurs créés:"
    echo "  CT $CT_POSTGRES: PostgreSQL - ${SUBNET}.10:5432"
    echo "  CT $CT_REDIS: Redis - ${SUBNET}.11:6379"
    echo "  CT $CT_BACKEND: Backend - ${SUBNET}.12:3001"
    echo "  CT $CT_FRONTEND: Frontend - ${SUBNET}.13:3000"
    echo ""
    echo "Base de données:"
    echo "  Host: postgresql (${SUBNET}.10)"
    echo "  Database: iptv_db"
    echo "  User: iptv"
    echo "  Password: iptv_secret"
    echo ""
    echo "Prochaines étapes:"
    echo "  1. Déployer le code Backend:"
    echo "     pct push $CT_BACKEND /path/to/iptv-server.tar.gz /opt/iptv-server.tar.gz"
    echo "     pct exec $CT_BACKEND -- bash -c 'cd /opt/iptv-server && tar xzf *.tar.gz && npm ci && npm run build'"
    echo "     pct exec $CT_BACKEND -- systemctl enable --now iptv-backend"
    echo ""
    echo "  2. Déployer le code Frontend:"
    echo "     pct push $CT_FRONTEND /path/to/iptv-frontend.tar.gz /opt/iptv-frontend.tar.gz"
    echo "     pct exec $CT_FRONTEND -- bash -c 'cd /opt/iptv-frontend && tar xzf *.tar.gz && npm ci'"
    echo "     pct exec $CT_FRONTEND -- systemctl enable --now iptv-frontend"
    echo ""
    echo "  3. Configurer l'accès externe (optionnel):"
    echo "     iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3001 -j DNAT --to ${SUBNET}.12:3001"
    echo "     iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3000 -j DNAT --to ${SUBNET}.13:3000"
    echo ""
    echo "Gestion:"
    echo "  pct list                    # Liste des conteneurs"
    echo "  pct enter $CT_BACKEND       # Console Backend"
    echo "  pct exec $CT_BACKEND -- journalctl -u iptv-backend -f  # Logs"
    echo "  vzdump $CT_POSTGRES $CT_REDIS $CT_BACKEND $CT_FRONTEND  # Backup"
    echo ""
    echo "Les conteneurs sont visibles dans l'interface Proxmox!"
    echo "============================================"
}

# ============================================
# Main
# ============================================
main() {
    echo ""
    echo "============================================"
    echo "IPTV System - Déploiement LXC Proxmox VE 9.1"
    echo "============================================"
    echo ""
    
    check_root
    
    phase1_prepare
    phase2_network
    phase3_containers
    phase4_start
    phase5_dns
    phase6_postgres
    phase7_redis
    phase8_nodejs
    phase9_services
    
    show_summary
}

# Exécuter
main "$@"
