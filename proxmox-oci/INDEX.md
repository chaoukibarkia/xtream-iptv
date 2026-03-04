# Proxmox OCI Container Deployment - Complete Index

## 📚 Documentation Files

### Getting Started
1. **[SUMMARY.md](SUMMARY.md)** - Overview and quick summary
2. **[QUICKSTART.md](QUICKSTART.md)** - 5-minute deployment guide
3. **[README.md](README.md)** - Complete documentation

### Proxmox Integration
4. **[PROXMOX_OCI_EXPLAINED.md](PROXMOX_OCI_EXPLAINED.md)** - ⭐ What Proxmox 9.1 OCI really is
5. **[PROXMOX_GUI_INTEGRATION.md](PROXMOX_GUI_INTEGRATION.md)** - Viewing containers in Proxmox

### Migration & Comparison
6. **[DOCKER_VS_PROXMOX.md](DOCKER_VS_PROXMOX.md)** - Detailed comparison
7. **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** - Step-by-step migration

### Advanced Topics
8. **[ADVANCED.md](ADVANCED.md)** - GPU, HA, security, monitoring
9. **[CHEATSHEET.md](CHEATSHEET.md)** - Quick reference commands

## 🗂️ Configuration Files

### Quadlet Systemd Units (`quadlet/`)

**Pod:**
- `iptv-pod.pod` - Pod definition with port mappings

**Containers:**
- `iptv-postgres.container` - PostgreSQL 15 database
- `iptv-redis.container` - Redis 7 cache
- `iptv-backend.container` - Node.js Fastify API
- `iptv-frontend.container` - Next.js web app
- `iptv-adminer.container` - Database UI (optional)

**Volumes:**
- `iptv-postgres.volume` - Database data
- `iptv-redis.volume` - Redis persistence
- `iptv-hls.volume` - HLS stream segments
- `iptv-cache.volume` - Image cache
- `iptv-logs.volume` - Application logs

### Configuration Templates
- `.env.example` - Environment variables template

## 🛠️ Management Tools

### Scripts (`scripts/`)
- `deploy.sh` - Automated full deployment
- `update.sh` - Update images and restart
- `backup.sh` - Backup database and volumes
- `restore.sh` - Restore from backup
- `logs.sh` - View service logs
- `status.sh` - Check system status
- `install-dashboard.sh` - ⭐ Install web dashboard for Proxmox GUI viewing

### Makefile
- `Makefile` - Convenience commands (make install, make start, etc.)

## 📖 Reading Order

### For First-Time Users
1. Start with **SUMMARY.md** to understand what this is
2. Read **QUICKSTART.md** for immediate deployment
3. Reference **README.md** for detailed information

### For Docker Users Migrating
1. Read **DOCKER_VS_PROXMOX.md** to understand differences
2. Follow **MIGRATION_GUIDE.md** step-by-step
3. Use **README.md** for ongoing management

### For Advanced Deployments
1. Complete basic deployment first
2. Review **ADVANCED.md** for GPU, HA, security options
3. Customize Quadlet files as needed

## 🚀 Quick Command Reference

### Deployment
```bash
# Automated
./scripts/deploy.sh

# Using Makefile
make install

# Manual
cp quadlet/* /etc/containers/systemd/
systemctl daemon-reload
systemctl start iptv-pod.service
```

### Management
```bash
# Status
./scripts/status.sh
make status
systemctl status iptv-pod.service

# Logs
./scripts/logs.sh backend
make logs
journalctl -u iptv-backend.service -f

# Restart
systemctl restart iptv-backend.service
make restart-backend
```

### Backup/Restore
```bash
# Backup
./scripts/backup.sh
make backup

# Restore
./scripts/restore.sh /path/to/backup.sql.gz
```

## 📋 Component Overview

### Architecture
```
Proxmox Host
└── Podman Pod (iptv-pod)
    ├── Network Namespace (shared)
    │   ├── localhost:3000 → Frontend
    │   ├── localhost:3001 → Backend
    │   ├── localhost:5432 → PostgreSQL
    │   └── localhost:6379 → Redis
    └── Containers
        ├── iptv-frontend (Next.js)
        ├── iptv-backend (Fastify)
        ├── iptv-postgres (PostgreSQL 15)
        └── iptv-redis (Redis 7)

Systemd Units
├── iptv-pod.service (main)
├── iptv-postgres.service
├── iptv-redis.service
├── iptv-backend.service
└── iptv-frontend.service

Persistent Storage
├── /storage-pool/xtream-data/
│   ├── postgres/
│   ├── redis/
│   ├── hls-segments/
│   ├── image-cache/
│   └── logs/
```

## 🔍 File Descriptions

| File | Purpose | When to Use |
|------|---------|-------------|
| SUMMARY.md | Overview of conversion | First read |
| QUICKSTART.md | Fast deployment | Quick setup |
| README.md | Complete docs | Reference |
| DOCKER_VS_PROXMOX.md | Comparison | Understanding differences |
| MIGRATION_GUIDE.md | Migration steps | Moving from Docker |
| ADVANCED.md | Advanced topics | Production tuning |
| .env.example | Config template | Environment setup |
| Makefile | Command shortcuts | Daily operations |
| deploy.sh | Full deployment | Initial setup |
| update.sh | Update system | After code changes |
| backup.sh | Data backup | Regular backups |
| restore.sh | Data restore | Disaster recovery |
| logs.sh | View logs | Troubleshooting |
| status.sh | Health check | Monitoring |

## 🎯 Use Cases

### New Deployment
**Path:** SUMMARY → QUICKSTART → deploy.sh  
**Time:** 15 minutes  
**Result:** Running system

### Migrate from Docker
**Path:** DOCKER_VS_PROXMOX → MIGRATION_GUIDE  
**Time:** 30-60 minutes  
**Result:** Migrated system with data

### Production Hardening
**Path:** README → ADVANCED  
**Time:** 2-4 hours  
**Result:** Hardened, monitored, backed-up system

### Daily Operations
**Tool:** Makefile or scripts/  
**Time:** Seconds  
**Result:** Managed services

## 🔧 Troubleshooting Guide

| Issue | Check | Fix |
|-------|-------|-----|
| Won't start | `systemctl status iptv-pod.service` | Check logs with `logs.sh` |
| DB connection | `podman exec iptv-postgres pg_isready` | Restart PostgreSQL |
| Permissions | `ls -la /storage-pool/xtream-data/` | `chown -R 100000:100000` |
| High memory | `podman stats` | Add resource limits (ADVANCED.md) |
| No logs | `journalctl -u iptv-backend.service` | Check systemd status |

## 📦 What's Included

### Documentation (8 files)
- ✅ Complete deployment guide
- ✅ Migration instructions
- ✅ Docker comparison
- ✅ Quick start guide
- ✅ Advanced configurations
- ✅ Troubleshooting tips

### Configuration (10 files)
- ✅ Quadlet pod definition
- ✅ 5 container definitions
- ✅ 5 volume definitions
- ✅ Environment template

### Automation (7 files)
- ✅ Deployment script
- ✅ Update script
- ✅ Backup script
- ✅ Restore script
- ✅ Log viewer
- ✅ Status checker
- ✅ Makefile

### Total: 25 files providing complete Proxmox OCI deployment

## 🎓 Learning Path

**Beginner:**
1. Read SUMMARY.md (5 min)
2. Run deploy.sh (15 min)
3. Test basic functionality (10 min)

**Intermediate:**
1. Read DOCKER_VS_PROXMOX.md (20 min)
2. Customize environment variables (10 min)
3. Set up backups (15 min)

**Advanced:**
1. Read ADVANCED.md (30 min)
2. Configure GPU acceleration (1 hour)
3. Set up monitoring (1 hour)
4. Configure HA (2 hours)

## 📞 Support Resources

- **Documentation:** This directory
- **Proxmox:** https://pve.proxmox.com/pve-docs/
- **Podman:** https://docs.podman.io/
- **Systemd:** https://www.freedesktop.org/software/systemd/man/
- **Project:** See main repository CLAUDE.md

## ✅ Checklist for Success

**Pre-Deployment:**
- [ ] Proxmox 9.1+ installed
- [ ] 4GB+ RAM available
- [ ] 20GB+ disk space
- [ ] Root access

**Deployment:**
- [ ] Podman installed
- [ ] Storage created
- [ ] Images built/loaded
- [ ] Quadlet files deployed
- [ ] Services started

**Post-Deployment:**
- [ ] Health checks passing
- [ ] Frontend accessible
- [ ] API responding
- [ ] Streams playing
- [ ] Backups scheduled
- [ ] Monitoring configured

**Production:**
- [ ] Passwords changed
- [ ] SSL configured
- [ ] Firewall rules set
- [ ] Auto-start enabled
- [ ] Team trained
- [ ] Documentation updated

---

**Need help?** Start with SUMMARY.md and follow the recommended reading path for your use case.
