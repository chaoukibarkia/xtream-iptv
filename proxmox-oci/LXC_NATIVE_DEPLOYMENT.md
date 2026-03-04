# Docker Compose vers LXC natif Proxmox VE 9.1

## Vue d'ensemble

Ce guide implémente la conversion de notre stack IPTV Docker Compose vers des **conteneurs LXC natifs** Proxmox VE 9.1, basé sur le [guide complet de migration](../guide-complet-docker-compose-vers-lxc-dans-proxmox-ve-91.md).

### Différence fondamentale Docker vs LXC

| Aspect | Docker | LXC Proxmox |
|--------|--------|-------------|
| **Type** | Conteneur applicatif | Conteneur système |
| **Init** | PID 1 = application | systemd complet |
| **Images** | minimalistes (alpine) | Debian/Ubuntu standards |
| **Réseau** | bridge network | SDN avec DHCP/DNS |
| **Gestion** | docker-compose CLI | pct + interface web |
| **Backup** | manuel | vzdump natif |

### Stack à migrer

| Service | Image Docker | → LXC Proxmox |
|---------|--------------|---------------|
| PostgreSQL | `postgres:15-alpine` | Debian 12 + postgresql |
| Redis | `redis:7-alpine` | Debian 12 + redis-server |
| Backend | `node:20-alpine` | Debian 12 + nodejs 20 |
| Frontend | `node:20-alpine` | Debian 12 + nodejs 20 |

---

## Phase 1 : Préparation de l'infrastructure Proxmox

### 1.1 Installation des prérequis

```bash
# Sur l'hôte Proxmox
apt update && apt install -y dnsmasq
systemctl disable --now dnsmasq  # SDN gère ses propres instances

# Vérifier la source des interfaces
grep -q "source /etc/network/interfaces.d/*" /etc/network/interfaces || \
    echo "source /etc/network/interfaces.d/*" >> /etc/network/interfaces
```

### 1.2 Configuration kernel pour Redis

```bash
# Paramètres obligatoires sur l'hôte
cat >> /etc/sysctl.conf << 'EOF'
# Pour Redis
vm.overcommit_memory = 1
# Performance réseau
net.core.somaxconn = 65535
fs.file-max = 2097152
EOF

sysctl -p

# Désactiver transparent hugepages pour Redis
echo never > /sys/kernel/mm/transparent_hugepage/enabled

# Rendre permanent au boot
cat > /etc/rc.local << 'EOF'
#!/bin/bash
echo never > /sys/kernel/mm/transparent_hugepage/enabled
exit 0
EOF
chmod +x /etc/rc.local
```

### 1.3 Créer le réseau SDN (remplace docker network)

```bash
# Créer une zone Simple avec DHCP
pvesh create /cluster/sdn/zones --zone iptvzone --type simple --dhcp dnsmasq --ipam pve

# Créer le VNet
pvesh create /cluster/sdn/vnets --vnet iptvnet --zone iptvzone

# Créer le subnet avec SNAT (accès internet sortant)
pvesh create /cluster/sdn/vnets/iptvnet/subnets \
    --subnet 10.10.0.0/24 \
    --gateway 10.10.0.1 \
    --snat 1

# Configurer la plage DHCP
pvesh set /cluster/sdn/vnets/iptvnet/subnets/iptvzone-10.10.0.0-24 \
    --dhcp-range start-address=10.10.0.50,end-address=10.10.0.200

# APPLIQUER la configuration (OBLIGATOIRE)
pvesh set /cluster/sdn
```

### 1.4 Télécharger le template Debian

```bash
# Télécharger le template officiel Debian 12
pveam download local debian-12-standard_12.2-1_amd64.tar.zst

# Vérifier
pveam list local
```

---

## Phase 2 : Création des conteneurs LXC

### 2.1 PostgreSQL (CT 100)

```bash
# Créer le conteneur
pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname iptv-postgresql \
    --memory 4096 \
    --cores 2 \
    --net0 name=eth0,bridge=iptvnet,ip=10.10.0.10/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 \
    --searchdomain iptv.local \
    --rootfs local-lvm:20 \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --startup order=1,up=30

# Ajouter mount point pour les données (séparé pour backup)
pct set 100 -mp0 local-lvm:100,mp=/var/lib/postgresql,backup=1

# Démarrer
pct start 100
```

### 2.2 Redis (CT 101)

```bash
# Créer le conteneur
pct create 101 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname iptv-redis \
    --memory 2048 \
    --cores 1 \
    --swap 0 \
    --net0 name=eth0,bridge=iptvnet,ip=10.10.0.11/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 \
    --searchdomain iptv.local \
    --rootfs local-lvm:8 \
    --unprivileged 1 \
    --features nesting=1,keyctl=1 \
    --onboot 1 \
    --startup order=2,up=15

# Ajouter mount point pour les données
pct set 101 -mp0 local-lvm:20,mp=/var/lib/redis,backup=1

# Démarrer
pct start 101
```

### 2.3 Backend API (CT 102)

```bash
# Créer le conteneur
pct create 102 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname iptv-backend \
    --memory 4096 \
    --cores 4 \
    --net0 name=eth0,bridge=iptvnet,ip=10.10.0.12/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 \
    --searchdomain iptv.local \
    --rootfs local-lvm:32 \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --startup order=3,up=30

# Mount points pour données
pct set 102 -mp0 local-lvm:50,mp=/var/cache/iptv,backup=1
pct set 102 -mp1 local-lvm:100,mp=/tmp/hls-segments,backup=0

# Démarrer
pct start 102
```

### 2.4 Frontend (CT 103)

```bash
# Créer le conteneur
pct create 103 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname iptv-frontend \
    --memory 2048 \
    --cores 2 \
    --net0 name=eth0,bridge=iptvnet,ip=10.10.0.13/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 \
    --searchdomain iptv.local \
    --rootfs local-lvm:16 \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1 \
    --startup order=4,up=15

# Démarrer
pct start 103
```

### 2.5 Configurer la résolution DNS entre conteneurs

```bash
# Ajouter les entrées hosts sur tous les conteneurs
for ct in 100 101 102 103; do
    pct exec $ct -- bash -c "cat >> /etc/hosts << 'EOF'
10.10.0.10  iptv-postgresql postgresql db postgres
10.10.0.11  iptv-redis redis cache
10.10.0.12  iptv-backend backend api
10.10.0.13  iptv-frontend frontend web
10.10.0.1   gateway
EOF"
done
```

---

## Phase 3 : Installation des services

### 3.1 PostgreSQL (CT 100)

```bash
pct exec 100 -- bash << 'EOFPG'
#!/bin/bash
set -e

echo "=== Installation PostgreSQL ==="
apt update && apt install -y postgresql postgresql-contrib

# Configuration PostgreSQL
PGCONF=$(ls -d /etc/postgresql/*/main)/postgresql.conf
PGHBA=$(ls -d /etc/postgresql/*/main)/pg_hba.conf

# Écouter sur toutes les interfaces
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" $PGCONF

# Autoriser les connexions depuis le réseau privé
echo "host all all 10.10.0.0/24 md5" >> $PGHBA

# Configuration performance
cat >> $PGCONF << 'EOF'
# Performance tuning
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB
max_connections = 100
# Keepalive
tcp_keepalives_idle = 60
tcp_keepalives_interval = 10
tcp_keepalives_count = 6
EOF

# Redémarrer PostgreSQL
systemctl restart postgresql
systemctl enable postgresql

# Créer la base de données IPTV
sudo -u postgres psql << 'EOFDB'
CREATE USER iptv WITH PASSWORD 'iptv_secret';
CREATE DATABASE iptv_db OWNER iptv;
GRANT ALL PRIVILEGES ON DATABASE iptv_db TO iptv;
\c iptv_db
GRANT ALL ON SCHEMA public TO iptv;
EOFDB

echo "✓ PostgreSQL installé et configuré"
EOFPG
```

### 3.2 Redis (CT 101)

```bash
pct exec 101 -- bash << 'EOFREDIS'
#!/bin/bash
set -e

echo "=== Installation Redis ==="
apt update && apt install -y redis-server

# Configuration Redis
cat > /etc/redis/redis.conf << 'EOF'
# Network
bind 0.0.0.0
port 6379
protected-mode no

# Memory
maxmemory 1536mb
maxmemory-policy allkeys-lru

# Persistence
appendonly yes
appendfsync everysec
dir /var/lib/redis

# Security
# requirepass your-redis-password

# Performance
tcp-backlog 511
timeout 0
tcp-keepalive 300
EOF

# Permissions
chown redis:redis /var/lib/redis
chmod 750 /var/lib/redis

# Redémarrer Redis
systemctl restart redis-server
systemctl enable redis-server

# Vérifier
redis-cli ping

echo "✓ Redis installé et configuré"
EOFREDIS
```

### 3.3 Backend Node.js (CT 102)

```bash
pct exec 102 -- bash << 'EOFBACKEND'
#!/bin/bash
set -e

echo "=== Installation Backend Node.js ==="

# Installer Node.js 20
apt update && apt install -y curl git build-essential ffmpeg
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Créer utilisateur applicatif
useradd -m -s /bin/bash nodeapp

# Créer répertoires
mkdir -p /opt/iptv-server
mkdir -p /var/cache/iptv/images
mkdir -p /tmp/hls-segments
mkdir -p /var/log/iptv

chown -R nodeapp:nodeapp /opt/iptv-server /var/cache/iptv /tmp/hls-segments /var/log/iptv

echo "✓ Runtime Node.js installé"
echo ""
echo "Pour déployer l'application:"
echo "  1. Copiez le code: pct push 102 ./iptv-server.tar.gz /opt/iptv-server.tar.gz"
echo "  2. Extrayez: pct exec 102 -- tar xzf /opt/iptv-server.tar.gz -C /opt/iptv-server"
echo "  3. Installez: pct exec 102 -- bash -c 'cd /opt/iptv-server && npm ci && npm run build'"
echo "  4. Activez le service systemd"
EOFBACKEND
```

### 3.4 Service systemd pour Backend

```bash
pct exec 102 -- bash << 'EOFSVC'
cat > /etc/systemd/system/iptv-backend.service << 'EOF'
[Unit]
Description=IPTV Backend API Server
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=nodeapp
Group=nodeapp
WorkingDirectory=/opt/iptv-server
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=3001
Environment=DATABASE_URL=postgresql://iptv:iptv_secret@postgresql:5432/iptv_db
Environment=REDIS_URL=redis://redis:6379
Environment=FFMPEG_PATH=/usr/bin/ffmpeg
Environment=HLS_SEGMENT_PATH=/tmp/hls-segments
Environment=LOG_LEVEL=info

# Limits
LimitNOFILE=65535
LimitNPROC=4096

# Security
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/iptv-server /var/cache/iptv /tmp/hls-segments /var/log/iptv

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "✓ Service systemd créé (à activer après déploiement du code)"
EOFSVC
```

### 3.5 Frontend Next.js (CT 103)

```bash
pct exec 103 -- bash << 'EOFFRONTEND'
#!/bin/bash
set -e

echo "=== Installation Frontend Next.js ==="

# Installer Node.js 20
apt update && apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Créer utilisateur applicatif
useradd -m -s /bin/bash nodeapp

# Créer répertoires
mkdir -p /opt/iptv-frontend
chown -R nodeapp:nodeapp /opt/iptv-frontend

# Service systemd
cat > /etc/systemd/system/iptv-frontend.service << 'EOF'
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
Environment=NEXT_TELEMETRY_DISABLED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "✓ Runtime Frontend installé"
EOFFRONTEND
```

---

## Phase 4 : Migration des données

### 4.1 Exporter les données depuis Docker

```bash
# Sur la machine Docker existante

# PostgreSQL
docker exec iptv-postgres pg_dump -U iptv iptv_db > iptv_database.sql

# Redis (si persistance)
docker cp iptv-redis:/data/dump.rdb ./redis-dump.rdb 2>/dev/null || echo "Pas de dump Redis"

# Application (si volumes)
docker cp iptv-backend:/var/cache/iptv ./cache-backup/ 2>/dev/null || echo "Pas de cache"
```

### 4.2 Importer dans les conteneurs LXC

```bash
# Copier les fichiers vers Proxmox
scp iptv_database.sql root@proxmox:/tmp/
scp redis-dump.rdb root@proxmox:/tmp/ 2>/dev/null || true

# Importer PostgreSQL
pct push 100 /tmp/iptv_database.sql /tmp/iptv_database.sql
pct exec 100 -- su - postgres -c "psql iptv_db < /tmp/iptv_database.sql"

# Importer Redis (si existant)
if [ -f /tmp/redis-dump.rdb ]; then
    pct push 101 /tmp/redis-dump.rdb /var/lib/redis/dump.rdb
    pct exec 101 -- chown redis:redis /var/lib/redis/dump.rdb
    pct exec 101 -- systemctl restart redis-server
fi
```

### 4.3 Déployer le code applicatif

```bash
# Backend
cd /path/to/iptv-server
tar czf /tmp/iptv-server.tar.gz --exclude=node_modules --exclude=.git .
pct push 102 /tmp/iptv-server.tar.gz /opt/iptv-server.tar.gz

pct exec 102 -- bash -c "
cd /opt/iptv-server
tar xzf iptv-server.tar.gz
rm iptv-server.tar.gz
npm ci
npm run build
npm run db:migrate
chown -R nodeapp:nodeapp .
systemctl enable --now iptv-backend
"

# Frontend
cd /path/to/iptv-frontend
npm run build
tar czf /tmp/iptv-frontend.tar.gz --exclude=node_modules --exclude=.git .next public package.json server.js
pct push 103 /tmp/iptv-frontend.tar.gz /opt/iptv-frontend.tar.gz

pct exec 103 -- bash -c "
cd /opt/iptv-frontend
tar xzf iptv-frontend.tar.gz
rm iptv-frontend.tar.gz
npm ci --only=production
chown -R nodeapp:nodeapp .
systemctl enable --now iptv-frontend
"
```

---

## Phase 5 : Configuration réseau externe

### 5.1 Exposer les services au réseau externe

Option 1: **Port forwarding via iptables sur l'hôte Proxmox**

```bash
# Backend API (port 3001)
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3001 -j DNAT --to-destination 10.10.0.12:3001

# Frontend (port 3000)
iptables -t nat -A PREROUTING -i vmbr0 -p tcp --dport 3000 -j DNAT --to-destination 10.10.0.13:3000

# Sauvegarder
iptables-save > /etc/iptables/rules.v4
```

Option 2: **Ajouter une interface réseau externe au conteneur**

```bash
# Ajouter une seconde interface réseau
pct set 102 -net1 name=eth1,bridge=vmbr0,ip=dhcp
pct set 103 -net1 name=eth1,bridge=vmbr0,ip=dhcp

# Redémarrer
pct reboot 102
pct reboot 103
```

---

## Phase 6 : Vérification et tests

### 6.1 Vérifier la connectivité

```bash
# Ping entre conteneurs
pct exec 102 -- ping -c 3 postgresql
pct exec 102 -- ping -c 3 redis
pct exec 103 -- ping -c 3 backend

# Vérifier les services
pct exec 100 -- systemctl status postgresql
pct exec 101 -- systemctl status redis-server
pct exec 102 -- systemctl status iptv-backend
pct exec 103 -- systemctl status iptv-frontend

# Test Redis
pct exec 101 -- redis-cli ping

# Test PostgreSQL
pct exec 100 -- su - postgres -c "psql -c 'SELECT 1'"

# Test Backend API
pct exec 102 -- curl -s http://localhost:3001/health

# Test Frontend
pct exec 103 -- curl -s http://localhost:3000
```

### 6.2 Vérifier depuis l'extérieur

```bash
# Depuis l'hôte Proxmox
curl http://10.10.0.12:3001/health
curl http://10.10.0.13:3000

# Depuis le réseau externe (si port forwarding configuré)
curl http://PROXMOX_IP:3001/health
curl http://PROXMOX_IP:3000
```

---

## Comparaison des performances

| Métrique | Docker Compose | LXC Proxmox |
|----------|----------------|-------------|
| **Overhead mémoire** | ~50-100MB/conteneur | ~20-50MB/conteneur |
| **Temps démarrage** | 5-10 secondes | 2-5 secondes |
| **Performances I/O** | 90-95% native | 95-98% native |
| **Performances CPU** | ~98% native | ~99% native |
| **Backup intégré** | Manuel | vzdump natif |
| **Snapshots** | Via Docker | Natif Proxmox |
| **GUI management** | ❌ (ou Portainer) | ✅ Proxmox GUI |
| **Migration live** | ❌ | ❌ (VM uniquement) |

---

## Commandes de gestion

### Gestion des conteneurs

```bash
# Démarrer/Arrêter
pct start 100 101 102 103
pct stop 100 101 102 103
pct reboot 102

# Status
pct list
pct status 102

# Console
pct enter 102

# Exécuter commande
pct exec 102 -- systemctl status iptv-backend

# Logs
pct exec 102 -- journalctl -u iptv-backend -f
```

### Backup vzdump

```bash
# Backup tous les conteneurs
vzdump 100 101 102 103 --storage local --mode snapshot --compress zstd

# Backup avec notification email
vzdump 100 --storage backup --mode snapshot --mailto admin@example.com

# Restaurer
pct restore 100 /var/lib/vz/dump/vzdump-lxc-100-*.tar.zst
```

### Snapshots

```bash
# Créer snapshot
pct snapshot 102 pre-update --description "Before update"

# Lister
pct listsnapshot 102

# Restaurer
pct rollback 102 pre-update

# Supprimer
pct delsnapshot 102 pre-update
```

---

## Script d'automatisation complet

```bash
#!/bin/bash
# deploy-iptv-lxc.sh - Déploiement complet IPTV sur LXC Proxmox

set -e

echo "=== Déploiement IPTV LXC Proxmox ==="

# Variables
TEMPLATE="local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst"
NETWORK="iptvnet"
SUBNET="10.10.0"

# Vérifier le template
if ! pveam list local | grep -q debian-12-standard; then
    echo "Téléchargement du template..."
    pveam download local debian-12-standard_12.2-1_amd64.tar.zst
fi

# Créer le réseau SDN si nécessaire
if ! pvesh get /cluster/sdn/zones 2>/dev/null | grep -q iptvzone; then
    echo "Création du réseau SDN..."
    pvesh create /cluster/sdn/zones --zone iptvzone --type simple --dhcp dnsmasq --ipam pve
    pvesh create /cluster/sdn/vnets --vnet iptvnet --zone iptvzone
    pvesh create /cluster/sdn/vnets/iptvnet/subnets --subnet ${SUBNET}.0/24 --gateway ${SUBNET}.1 --snat 1
    pvesh set /cluster/sdn
fi

# Créer les conteneurs
echo "Création des conteneurs..."

# PostgreSQL
pct create 100 $TEMPLATE \
    --hostname iptv-postgresql \
    --memory 4096 --cores 2 \
    --net0 name=eth0,bridge=$NETWORK,ip=${SUBNET}.10/24,gw=${SUBNET}.1 \
    --rootfs local-lvm:20 --unprivileged 1 --features nesting=1 \
    --onboot 1 --startup order=1

# Redis
pct create 101 $TEMPLATE \
    --hostname iptv-redis \
    --memory 2048 --cores 1 --swap 0 \
    --net0 name=eth0,bridge=$NETWORK,ip=${SUBNET}.11/24,gw=${SUBNET}.1 \
    --rootfs local-lvm:8 --unprivileged 1 --features nesting=1,keyctl=1 \
    --onboot 1 --startup order=2

# Backend
pct create 102 $TEMPLATE \
    --hostname iptv-backend \
    --memory 4096 --cores 4 \
    --net0 name=eth0,bridge=$NETWORK,ip=${SUBNET}.12/24,gw=${SUBNET}.1 \
    --rootfs local-lvm:32 --unprivileged 1 --features nesting=1 \
    --onboot 1 --startup order=3

# Frontend
pct create 103 $TEMPLATE \
    --hostname iptv-frontend \
    --memory 2048 --cores 2 \
    --net0 name=eth0,bridge=$NETWORK,ip=${SUBNET}.13/24,gw=${SUBNET}.1 \
    --rootfs local-lvm:16 --unprivileged 1 --features nesting=1 \
    --onboot 1 --startup order=4

# Démarrer
echo "Démarrage des conteneurs..."
for ct in 100 101 102 103; do
    pct start $ct
done

sleep 10

# Configurer hosts
echo "Configuration DNS..."
for ct in 100 101 102 103; do
    pct exec $ct -- bash -c "cat >> /etc/hosts << 'EOF'
${SUBNET}.10  iptv-postgresql postgresql db
${SUBNET}.11  iptv-redis redis cache
${SUBNET}.12  iptv-backend backend api
${SUBNET}.13  iptv-frontend frontend web
EOF"
done

echo ""
echo "=== Conteneurs créés avec succès ==="
echo ""
echo "Prochaines étapes:"
echo "1. Installer PostgreSQL: pct exec 100 -- apt install postgresql"
echo "2. Installer Redis: pct exec 101 -- apt install redis-server"
echo "3. Installer Node.js et déployer l'application"
echo ""
echo "Accès:"
echo "  PostgreSQL: ${SUBNET}.10:5432"
echo "  Redis: ${SUBNET}.11:6379"
echo "  Backend: ${SUBNET}.12:3001"
echo "  Frontend: ${SUBNET}.13:3000"
```

---

## Conclusion

Cette migration vers LXC natif Proxmox VE 9.1 offre:

✅ **Performances supérieures** - 95-98% des performances natives  
✅ **Gestion intégrée** - Interface web Proxmox, vzdump, snapshots  
✅ **Sécurité** - Conteneurs unprivileged, isolation kernel  
✅ **Réseau SDN** - DHCP/DNS intégrés, SNAT automatique  
✅ **Backup natif** - vzdump avec compression zstd  
✅ **Démarrage ordonné** - Startup order pour dépendances  

Points clés:
- Utiliser **templates Debian/Ubuntu standards** (pas les images Docker)
- Configurer **SDN Simple Zone** pour le réseau privé
- Activer **`nesting=1`** et **`keyctl=1`** (Redis) dans les features
- Configurer **`vm.overcommit_memory=1`** sur l'hôte pour Redis
- Séparer les données sur des **mount points dédiés** avec `backup=1`
