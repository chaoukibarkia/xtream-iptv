# Guide complet : Docker Compose vers LXC dans Proxmox VE 9.1

La migration d'un projet Docker Compose vers des conteneurs LXC natifs dans Proxmox VE 9.1 est réalisable, mais **nécessite une approche fondamentalement différente** de la simple conversion d'images. Proxmox VE 9.1 introduit le support natif des images OCI (en tech preview), permettant de tirer des images directement depuis Docker Hub. Cependant, les conteneurs LXC sont des **conteneurs système** (avec init complet) et non des conteneurs applicatifs Docker, ce qui impose des adaptations significatives pour PostgreSQL, Redis et votre application TypeScript.

---

## La différence fondamentale entre Docker et LXC

Avant d'entamer la migration, il est crucial de comprendre que Docker et LXC représentent deux philosophies différentes. Docker exécute une **application isolée** avec un processus unique (PID 1), tandis que LXC fournit un **système Linux complet** avec systemd ou un autre init. Cette distinction signifie que les images Docker minimalistes (comme `node:alpine` ou `redis:alpine`) ne fonctionneront pas directement comme conteneurs LXC sans modifications.

Pour votre stack de 3 services, **l'approche recommandée** consiste à créer 3 conteneurs LXC basés sur des templates Debian/Ubuntu standards, puis installer les services à l'intérieur. Cette méthode offre une meilleure stabilité, des mises à jour système cohérentes, et une intégration native avec les outils Proxmox (vzdump, snapshots, firewall).

L'alternative — convertir directement vos images Docker — est possible mais présente des limitations : perte des métadonnées (ENV, CMD, ENTRYPOINT), nécessité d'ajouter un système init, et configurations manuelles pour le réseau et les services.

---

## Conversion d'images Docker vers le format OCI

### Méthodes et outils disponibles

La conversion s'effectue selon deux approches distinctes : créer une **archive OCI** (pour registres et outils compatibles) ou extraire un **tarball rootfs** (pour LXC). Voici les commandes essentielles :

**Avec docker export (recommandé pour LXC)** :
```bash
# Créer un conteneur temporaire depuis l'image
docker create --name temp-export myapp:latest

# Exporter le système de fichiers (sans layers ni métadonnées)
docker export temp-export | gzip > myapp-rootfs.tar.gz

# Nettoyer
docker rm temp-export

# Transférer vers Proxmox
scp myapp-rootfs.tar.gz root@proxmox:/var/lib/vz/template/cache/
```

**Avec skopeo (conversion OCI native)** :
```bash
# Depuis Docker Hub vers format OCI local
skopeo copy docker://nginx:latest oci:nginx-oci:latest

# Depuis le daemon Docker local vers archive OCI
skopeo copy docker-daemon:myapp:tag oci-archive:myapp-oci.tar

# Conversion Docker archive → OCI
skopeo copy docker-archive:image.tar oci:output-dir:latest
```

**Avec buildah (construction OCI depuis Dockerfile)** :
```bash
# Build natif OCI
buildah bud -t myapp:latest -f Dockerfile .

# Export vers répertoire OCI
buildah push myapp:latest oci:myapp-oci:latest
```

La différence clé entre `docker save` et `docker export` est fondamentale : **save** préserve les layers et métadonnées (format Docker/OCI), tandis que **export** crée un tarball plat du système de fichiers — exactement ce dont LXC a besoin.

### Packager une application TypeScript en image OCI

Pour votre application TypeScript personnalisée, utilisez un **Dockerfile multi-stage** :

```dockerfile
# Étape 1 : Build TypeScript
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json src/ ./
RUN npm run build

# Étape 2 : Production
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN chown node:node ./
USER node
COPY --from=builder /app/package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/server.js"]
```

Ensuite, exportez pour LXC :
```bash
docker build -t myapp:latest .
docker create --name export myapp:latest
docker export export | gzip > myapp-template.tar.gz
docker rm export
```

---

## Import dans Proxmox VE 9.1 et création des conteneurs LXC

### Support natif OCI (nouveauté PVE 9.1)

Proxmox VE 9.1 introduit le **pull direct depuis les registres OCI** (tech preview). Cette fonctionnalité permet de télécharger des images Docker Hub directement dans le stockage Proxmox :

**Via l'interface web** :
1. Naviguez vers `Datacenter` → `<node>` → `local` → **CT Templates**
2. Cliquez sur **"Pull from OCI Registry"**
3. Entrez la référence image : `docker.io/library/postgres:16` ou `ghcr.io/votre-org/image`
4. Cliquez sur **Query Tags**, sélectionnez la version, puis **Download**

**Limitations actuelles du support OCI** :
- Les layers sont fusionnées en un seul rootfs à la création
- La console peut ne pas fonctionner (utiliser `pct enter <CTID>`)
- Les variables d'environnement ne peuvent être définies qu'après création
- La migration live n'est pas supportée pour LXC

### Création de conteneurs depuis templates

**Format attendu** : Proxmox accepte les archives `.tar.gz`, `.tar.xz`, ou `.tar.zst` (zstandard, par défaut pour les templates récentes).

**Stockage pour templates** : Utilisez un stockage de type **directory**, **NFS**, ou **CephFS** avec le type de contenu `vztmpl` activé. Les stockages block (LVM, ZFS pool, iSCSI) ne supportent pas directement les templates.

```bash
# Vérifier les stockages disponibles pour templates
pvesm status -content vztmpl

# Télécharger un template officiel Debian
pveam download local debian-12-standard_12.2-1_amd64.tar.zst

# Lister les templates disponibles
pveam list local
```

**Créer un conteneur depuis template** :
```bash
pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname postgresql \
    --storage local-lvm \
    --rootfs local-lvm:20 \
    --memory 2048 \
    --cores 2 \
    --net0 name=eth0,bridge=vmbr0,ip=10.10.0.10/24,gw=10.10.0.1 \
    --unprivileged 1 \
    --features nesting=1 \
    --onboot 1
```

---

## Configuration réseau SDN pour remplacer Docker networks

### Créer un réseau privé avec SDN Simple Zone

Le SDN (Software-Defined Networking) de Proxmox offre une excellente alternative aux réseaux Docker personnalisés, avec DHCP, DNS et NAT intégrés.

**Prérequis** :
```bash
# Installer dnsmasq pour DHCP/DNS
apt update && apt install dnsmasq
systemctl disable --now dnsmasq  # SDN gère ses propres instances

# Vérifier que /etc/network/interfaces contient :
echo "source /etc/network/interfaces.d/*" >> /etc/network/interfaces
```

**Créer l'infrastructure SDN via CLI** :
```bash
# Créer une zone Simple avec DHCP
pvesh create /cluster/sdn/zones --zone appzone --type simple --dhcp dnsmasq --ipam pve

# Créer le VNet
pvesh create /cluster/sdn/vnets --vnet appnet --zone appzone

# Créer le subnet avec SNAT (accès internet sortant)
pvesh create /cluster/sdn/vnets/appnet/subnets \
    --subnet 10.10.0.0/24 \
    --gateway 10.10.0.1 \
    --snat 1

# Configurer la plage DHCP
pvesh set /cluster/sdn/vnets/appnet/subnets/appzone-10.10.0.0-24 \
    --dhcp-range start-address=10.10.0.50,end-address=10.10.0.200

# APPLIQUER la configuration (obligatoire)
pvesh set /cluster/sdn
```

### Configuration des 3 conteneurs sur le réseau privé

**PostgreSQL (CT 100)** - IP statique `10.10.0.10` :
```bash
pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname postgresql \
    --memory 4096 --cores 2 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.10/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 --searchdomain app.local \
    --unprivileged 1 --features nesting=1 \
    --rootfs local-lvm:20 --onboot 1
```

**Redis (CT 101)** - IP statique `10.10.0.11` :
```bash
pct create 101 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname redis \
    --memory 2048 --cores 1 --swap 0 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.11/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 --searchdomain app.local \
    --unprivileged 1 --features nesting=1,keyctl=1 \
    --rootfs local-lvm:8 --onboot 1
```

**Application TypeScript (CT 102)** - IP statique `10.10.0.12` :
```bash
pct create 102 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname webapp \
    --memory 2048 --cores 2 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.12/24,gw=10.10.0.1,firewall=1 \
    --nameserver 10.10.0.1 --searchdomain app.local \
    --unprivileged 1 --features nesting=1 \
    --rootfs local-lvm:16 --onboot 1
```

### Résolution DNS entre conteneurs

La zone Simple avec dnsmasq fournit un DNS de base. Pour une découverte de services similaire à Docker, ajoutez des entrées `/etc/hosts` :

```bash
# Script à exécuter sur chaque conteneur
for ct in 100 101 102; do
    pct exec $ct -- bash -c "cat >> /etc/hosts << 'EOF'
10.10.0.10  postgresql postgresql.app.local db
10.10.0.11  redis redis.app.local cache
10.10.0.12  webapp webapp.app.local app
EOF"
done
```

Votre application TypeScript pourra alors se connecter via `postgresql:5432` et `redis:6379`.

---

## Configurations spécifiques par service

### PostgreSQL en LXC : performances et volumes

Les conteneurs LXC offrent **95-98% des performances bare metal** pour les bases de données, contre 80-90% pour les VMs, grâce à l'absence de couche d'émulation matérielle.

**Configuration recommandée** (`/etc/pve/lxc/100.conf`) :
```ini
arch: amd64
cores: 4
memory: 8192
swap: 1024
hostname: postgresql
unprivileged: 1
features: nesting=1

rootfs: local-zfs:subvol-100-disk-0,size=16G
mp0: local-zfs:subvol-100-disk-1,mp=/var/lib/postgresql,size=100G,backup=1

net0: name=eth0,bridge=appnet,ip=10.10.0.10/24,gw=10.10.0.1,firewall=1
startup: order=1,up=30
```

**Installation et configuration** :
```bash
pct start 100
pct exec 100 -- bash -c "
apt update && apt install -y postgresql postgresql-contrib

# Écouter sur toutes les interfaces
sed -i \"s/#listen_addresses = 'localhost'/listen_addresses = '*'/\" /etc/postgresql/*/main/postgresql.conf

# Autoriser les connexions depuis le réseau privé
echo 'host all all 10.10.0.0/24 md5' >> /etc/postgresql/*/main/pg_hba.conf

# Configuration performance
cat >> /etc/postgresql/*/main/postgresql.conf << 'EOF'
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
EOF

systemctl restart postgresql
"
```

**Stockage ZFS optimisé** :
```bash
# Créer un dataset ZFS avec recordsize optimal pour PostgreSQL
zfs create -o recordsize=8K -o primarycache=metadata rpool/data/postgresql
```

### Redis en LXC : mémoire et persistance

Redis nécessite des configurations spécifiques sur l'**hôte Proxmox** (pas dans le conteneur) :

```bash
# Sur l'hôte Proxmox - OBLIGATOIRE pour Redis
echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
echo never > /sys/kernel/mm/transparent_hugepage/enabled
sysctl -p
```

**Configuration conteneur** (`/etc/pve/lxc/101.conf`) :
```ini
cores: 2
memory: 2048
swap: 0                  # Désactiver swap pour Redis
hostname: redis
unprivileged: 1
features: nesting=1,keyctl=1    # keyctl nécessaire

mp0: local-zfs:subvol-101-disk-1,mp=/var/lib/redis,size=20G,backup=1
```

**Installation** :
```bash
pct exec 101 -- bash -c "
apt update && apt install -y redis-server

# Écouter sur toutes les interfaces
sed -i 's/bind 127.0.0.1/bind 0.0.0.0/' /etc/redis/redis.conf

# Configuration persistance et mémoire
cat >> /etc/redis/redis.conf << 'EOF'
maxmemory 1536mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
EOF

systemctl restart redis-server
"
```

### Application TypeScript/Node.js en LXC

**Installation du runtime** :
```bash
pct exec 102 -- bash -c "
apt update && apt install -y curl git build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Créer utilisateur applicatif
useradd -m -s /bin/bash nodeapp
"
```

**Déployer l'application** :
```bash
pct exec 102 -- bash -c "
cd /opt
git clone https://github.com/votre-org/votre-app.git app
cd app
npm ci
npm run build
chown -R nodeapp:nodeapp /opt/app
"
```

**Service systemd** (`/etc/systemd/system/webapp.service` dans le conteneur) :
```ini
[Unit]
Description=Node.js Application
After=network.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/opt/app
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DATABASE_URL=postgres://user:pass@postgresql:5432/mydb
Environment=REDIS_URL=redis://redis:6379

[Install]
WantedBy=multi-user.target
```

```bash
pct exec 102 -- systemctl enable --now webapp
```

---

## Gestion des volumes et persistance

### Mapper les volumes Docker vers LXC

La correspondance entre Docker Compose et LXC suit ce modèle :

| Docker Compose | LXC Proxmox | Configuration |
|---------------|-------------|---------------|
| `volumes: - pgdata:/var/lib/postgresql/data` | Mount point dédié | `mp0: local-zfs:100,mp=/var/lib/postgresql` |
| `volumes: - ./config:/app/config` | Bind mount | `mp0: /mnt/data/config,mp=/app/config` |
| tmpfs (en mémoire) | Non supporté nativement | Utiliser `/dev/shm` ou RAM disk |

**Ajouter un mount point avec pct** :
```bash
# Storage-backed (espace alloué depuis le stockage Proxmox)
pct set 100 -mp0 local-zfs:100,mp=/var/lib/postgresql,backup=1

# Bind mount (répertoire hôte monté directement)
pct set 102 -mp0 /mnt/data/app-uploads,mp=/opt/app/uploads,backup=1
```

### Permissions pour conteneurs non privilégiés

Les conteneurs unprivileged utilisent un mapping UID : le root (UID 0) du conteneur correspond à l'UID **100000** sur l'hôte. L'utilisateur nodeapp (UID 1000) correspond à l'UID **101000**.

```bash
# Sur l'hôte Proxmox, avant de créer les bind mounts
mkdir -p /mnt/data/app-uploads
chown -R 101000:101000 /mnt/data/app-uploads
```

### Stockage recommandé par type de données

| Usage | Stockage recommandé | Justification |
|-------|---------------------|---------------|
| Base de données PostgreSQL | **ZFS** avec recordsize=8K | Intégrité données, snapshots, compression |
| Redis persistence | **ZFS** standard | Snapshots rapides pour backup |
| Uploads utilisateur | ZFS ou LVM-thin | Flexibilité, snapshots |
| Logs applicatifs | Directory ou tmpfs | Moins critique, volume élevé |

---

## Workflow complet de migration

### Étape 1 : Préparation de l'infrastructure Proxmox

```bash
# 1. Installer dnsmasq pour SDN
apt install dnsmasq && systemctl disable --now dnsmasq

# 2. Configurer les paramètres kernel pour Redis
cat >> /etc/sysctl.conf << 'EOF'
vm.overcommit_memory = 1
net.core.somaxconn = 65535
fs.file-max = 2097152
EOF
sysctl -p

# 3. Créer le réseau SDN
pvesh create /cluster/sdn/zones --zone appzone --type simple --dhcp dnsmasq --ipam pve
pvesh create /cluster/sdn/vnets --vnet appnet --zone appzone
pvesh create /cluster/sdn/vnets/appnet/subnets --subnet 10.10.0.0/24 --gateway 10.10.0.1 --snat 1
pvesh set /cluster/sdn

# 4. Télécharger le template
pveam download local debian-12-standard_12.2-1_amd64.tar.zst
```

### Étape 2 : Créer les 3 conteneurs

```bash
# PostgreSQL
pct create 100 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname postgresql --memory 4096 --cores 2 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.10/24,gw=10.10.0.1 \
    --rootfs local-zfs:20 --unprivileged 1 --features nesting=1

pct set 100 -mp0 local-zfs:100,mp=/var/lib/postgresql,backup=1

# Redis  
pct create 101 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname redis --memory 2048 --cores 1 --swap 0 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.11/24,gw=10.10.0.1 \
    --rootfs local-zfs:8 --unprivileged 1 --features nesting=1,keyctl=1

pct set 101 -mp0 local-zfs:20,mp=/var/lib/redis,backup=1

# Application
pct create 102 local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst \
    --hostname webapp --memory 2048 --cores 2 \
    --net0 name=eth0,bridge=appnet,ip=10.10.0.12/24,gw=10.10.0.1 \
    --rootfs local-zfs:16 --unprivileged 1 --features nesting=1

# Démarrer tous les conteneurs
pct start 100 && pct start 101 && pct start 102
```

### Étape 3 : Configurer les services

Exécutez les scripts d'installation détaillés dans les sections PostgreSQL, Redis et Node.js ci-dessus.

### Étape 4 : Migrer les données depuis Docker

```bash
# Exporter les données PostgreSQL depuis Docker
docker exec postgres pg_dumpall -U postgres > all_databases.sql

# Copier vers le conteneur LXC
pct push 100 all_databases.sql /tmp/all_databases.sql
pct exec 100 -- su - postgres -c "psql < /tmp/all_databases.sql"

# Pour Redis (si persistance RDB)
docker cp redis:/data/dump.rdb ./dump.rdb
pct push 101 dump.rdb /var/lib/redis/dump.rdb
pct exec 101 -- chown redis:redis /var/lib/redis/dump.rdb
pct exec 101 -- systemctl restart redis-server
```

### Étape 5 : Vérifier la connectivité

```bash
# Depuis webapp, tester la connexion aux services
pct exec 102 -- ping -c 3 postgresql
pct exec 102 -- ping -c 3 redis
pct exec 102 -- curl -I http://webapp:3000/health
```

---

## Pièges à éviter et alternatives

### Limitations de l'approche Docker → OCI → LXC

**Ce qui ne fonctionne pas automatiquement** :
- Les images Docker minimalistes (distroless, scratch) ne contiennent pas d'init system
- Les ENTRYPOINT et CMD Docker ne sont pas exécutés — vous devez créer des services systemd
- Docker Compose `depends_on` n'a pas d'équivalent — utilisez `startup: order=N` dans la config LXC
- Les health checks Docker nécessitent une implémentation séparée

**Quand choisir Docker-dans-une-VM à la place** :
- Stack complexe avec **10+ services** interdépendants
- Besoin de **migration live** des workloads
- Utilisation de **Portainer/Traefik/Watchtower** pour la gestion
- Équipe familière avec Docker Compose qui ne veut pas modifier son workflow
- Conteneurs tiers **non audités** (sécurité)

Pour une VM Docker dans Proxmox :
```bash
# Créer une VM légère avec Docker
qm create 200 --name docker-host --memory 8192 --cores 4 \
    --cdrom local:iso/debian-12.iso --scsi0 local-lvm:50 \
    --net0 virtio,bridge=vmbr0
```

### Comparaison finale des approches

| Critère | LXC natif | Docker dans VM |
|---------|-----------|----------------|
| Overhead mémoire | ~50 MB/conteneur | ~512+ MB pour VM |
| Temps démarrage | 2-5 secondes | 30-60 secondes |
| Performances I/O | 95-98% native | 80-90% native |
| Isolation | Kernel partagé | Isolation complète |
| Backups Proxmox | Natif (vzdump) | Via snapshots VM |
| Migration live | Non supporté | Supporté |
| Complexité gestion | Plus élevée | Écosystème Docker |

---

## Conclusion

La migration Docker Compose → LXC dans Proxmox VE 9.1 est parfaitement viable pour votre stack PostgreSQL/Redis/TypeScript, avec des **gains de performance significatifs** (jusqu'à 15% d'I/O en plus) et une **intégration native** aux outils Proxmox. Le nouveau support OCI de PVE 9.1 simplifie l'import d'images, mais l'approche recommandée reste de créer des conteneurs depuis templates standards puis d'installer vos services.

Les points clés à retenir :
- Utilisez **SDN Simple Zone** pour répliquer la connectivité Docker networks
- Activez **`nesting=1`** et **`keyctl=1`** (pour Redis) dans les features des conteneurs
- Configurez **`vm.overcommit_memory=1`** sur l'hôte Proxmox pour Redis
- Préférez **ZFS** comme stockage pour les bases de données (intégrité + snapshots)
- Séparez les données sur des **mount points dédiés** avec `backup=1`

Cette architecture fournit une solution production-ready avec les avantages de Proxmox (haute disponibilité, sauvegardes vzdump, interface web unifiée) tout en conservant les performances quasi-natives des conteneurs LXC.