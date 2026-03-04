# Proxmox VE 9.1 - Options de Déploiement

## Deux Approches Disponibles

Après analyse du [guide complet Docker Compose vers LXC](../guide-complet-docker-compose-vers-lxc-dans-proxmox-ve-91.md), nous proposons **deux méthodes de déploiement** selon vos besoins:

### Option 1: LXC Natif Proxmox (Recommandé pour GUI)

**Utilise:** Templates Debian + installation services  
**Avantage:** Visible dans l'interface Proxmox GUI  
**Script:** `./scripts/deploy-lxc-native.sh`  
**Documentation:** [LXC_NATIVE_DEPLOYMENT.md](LXC_NATIVE_DEPLOYMENT.md)

```bash
# Déploiement en une commande
./scripts/deploy-lxc-native.sh
```

Crée **4 conteneurs LXC** visibles dans Proxmox:
- CT 100: PostgreSQL (10.10.0.10)
- CT 101: Redis (10.10.0.11)
- CT 102: Backend API (10.10.0.12)
- CT 103: Frontend (10.10.0.13)

### Option 2: Podman + systemd Quadlet

**Utilise:** Images Docker via Podman  
**Avantage:** Pod networking, Docker Compose compatible  
**Script:** `./scripts/deploy.sh`  
**Documentation:** [README.md](README.md)

```bash
# Déploiement en une commande
./scripts/deploy.sh
```

Crée **1 pod Podman** avec 4 conteneurs:
- iptv-postgres
- iptv-redis
- iptv-backend
- iptv-frontend

(Non visible dans GUI par défaut - utiliser `./scripts/install-dashboard.sh`)

## Comparaison Détaillée

| Critère | LXC Natif | Podman |
|---------|-----------|--------|
| **Visible dans Proxmox GUI** | ✅ Oui | ❌ Non (dashboard dispo) |
| **Performances I/O** | 95-98% native | 90-95% native |
| **Backup vzdump** | ✅ Natif | ❌ Manuel |
| **Snapshots Proxmox** | ✅ Natif | ❌ Podman |
| **Réseau entre services** | SDN (IP) | localhost (pod) |
| **Docker Compose compatible** | ⚠️ Partiel | ✅ Complet |
| **Overhead mémoire** | ~20MB/CT | ~50MB/container |
| **Temps démarrage** | 2-5 sec | 5-10 sec |
| **Gestion** | pct / GUI | systemctl / podman |
| **Migration live** | ❌ Non | ❌ Non |

## Quand choisir quelle option?

### Choisir LXC Natif si:

✅ Vous voulez voir les conteneurs dans l'interface Proxmox  
✅ Vous préférez les backups vzdump natifs  
✅ Vous voulez utiliser les snapshots Proxmox  
✅ L'équipe connaît mieux les outils Proxmox que Docker  
✅ Vous avez besoin de performances I/O maximales (base de données)  

### Choisir Podman si:

✅ Vous utilisez des fichiers Docker Compose complexes  
✅ Vous avez besoin du networking localhost (pod)  
✅ L'équipe connaît mieux Docker que Proxmox  
✅ Vous voulez la compatibilité maximale avec Docker  
✅ Vous préférez la gestion via systemd  

## Architecture Réseau

### LXC Natif (SDN)

```
Internet → Proxmox (vmbr0)
               ↓
        Port Forwarding
               ↓
         SDN iptvnet
    ┌─────────┴─────────┐
    ↓         ↓         ↓
CT 100    CT 101    CT 102/103
PostgreSQL Redis   Backend/Frontend
10.10.0.10 10.10.0.11 10.10.0.12/13
```

Communication: Via IP (10.10.0.x)

### Podman Pod

```
Internet → Proxmox (vmbr0)
               ↓
         Published Ports
               ↓
          iptv-pod
    ┌─────────┴─────────┐
    ↓         ↓         ↓
postgres  redis   backend/frontend
  ↓         ↓         ↓
      Shared Network Namespace
         (localhost)
```

Communication: Via localhost:port

## Déploiement Rapide

### Option 1: LXC Natif

```bash
cd /storage-pool/xtream/proxmox-oci

# Déployer l'infrastructure
./scripts/deploy-lxc-native.sh

# Déployer le code (après le script)
# 1. Packager l'application
cd /storage-pool/xtream/iptv-server
tar czf /tmp/backend.tar.gz --exclude=node_modules --exclude=.git .

cd /storage-pool/xtream/iptv-frontend
npm run build
tar czf /tmp/frontend.tar.gz .next public package.json

# 2. Copier vers les conteneurs
pct push 102 /tmp/backend.tar.gz /opt/iptv-server/app.tar.gz
pct push 103 /tmp/frontend.tar.gz /opt/iptv-frontend/app.tar.gz

# 3. Installer
pct exec 102 -- bash -c "cd /opt/iptv-server && tar xzf app.tar.gz && npm ci && npm run build && chown -R nodeapp:nodeapp . && systemctl enable --now iptv-backend"
pct exec 103 -- bash -c "cd /opt/iptv-frontend && tar xzf app.tar.gz && npm ci --only=production && chown -R nodeapp:nodeapp . && systemctl enable --now iptv-frontend"

# Vérifier dans l'interface Proxmox GUI!
```

### Option 2: Podman

```bash
cd /storage-pool/xtream/proxmox-oci

# Déployer tout
./scripts/deploy.sh

# Installer le dashboard pour visualisation
./scripts/install-dashboard.sh

# Accéder au dashboard: http://PROXMOX_IP:18089
```

## Migration entre les deux

### De Podman vers LXC

```bash
# 1. Exporter les données
podman exec iptv-postgres pg_dump -U iptv iptv_db > /tmp/backup.sql

# 2. Arrêter Podman
systemctl stop iptv-pod.service

# 3. Déployer LXC
./scripts/deploy-lxc-native.sh

# 4. Importer les données
pct push 100 /tmp/backup.sql /tmp/backup.sql
pct exec 100 -- su - postgres -c "psql iptv_db < /tmp/backup.sql"
```

### De LXC vers Podman

```bash
# 1. Exporter les données
pct exec 100 -- su - postgres -c "pg_dump iptv_db" > /tmp/backup.sql

# 2. Arrêter LXC
for ct in 100 101 102 103; do pct stop $ct; done

# 3. Déployer Podman
./scripts/deploy.sh

# 4. Importer les données
cat /tmp/backup.sql | podman exec -i iptv-postgres psql -U iptv iptv_db
```

## Résumé des Commandes

### LXC Natif

```bash
# Gestion des conteneurs
pct list                          # Lister
pct start 102                     # Démarrer
pct stop 102                      # Arrêter
pct enter 102                     # Console
pct exec 102 -- <commande>        # Exécuter commande

# Logs
pct exec 102 -- journalctl -u iptv-backend -f

# Backup
vzdump 100 101 102 103 --mode snapshot --compress zstd

# Snapshots
pct snapshot 102 pre-update
pct rollback 102 pre-update
```

### Podman

```bash
# Gestion des services
systemctl start iptv-pod.service   # Démarrer
systemctl stop iptv-pod.service    # Arrêter
systemctl restart iptv-backend.service

# Logs
journalctl -u iptv-backend.service -f
podman logs iptv-backend

# Shell
podman exec -it iptv-backend bash

# Status
podman ps --pod
./scripts/status.sh
```

## Fichiers Disponibles

| Fichier | Description |
|---------|-------------|
| `scripts/deploy-lxc-native.sh` | Déploiement LXC complet |
| `scripts/deploy.sh` | Déploiement Podman complet |
| `scripts/install-dashboard.sh` | Dashboard web pour Podman |
| `LXC_NATIVE_DEPLOYMENT.md` | Guide LXC détaillé |
| `README.md` | Guide Podman détaillé |
| `PROXMOX_OCI_EXPLAINED.md` | Explication du support OCI |

## Conclusion

**Pour une intégration maximale avec Proxmox GUI:** Utilisez l'**Option 1 (LXC Natif)**

**Pour une compatibilité maximale avec Docker:** Utilisez l'**Option 2 (Podman)**

Les deux options sont production-ready et offrent d'excellentes performances. Le choix dépend principalement de vos préférences de gestion et de votre familiarité avec les outils.
