# Proxmox 9.1 OCI Support - Clarification

## What Proxmox 9.1 OCI Support Actually Is

Based on official Proxmox documentation and community reports, here's what Proxmox VE 9.1's OCI support **actually provides**:

### ✅ What It Does

1. **Pull OCI Images** - Download Docker/OCI images from registries (Docker Hub, GitHub Registry, etc.)
2. **Convert to LXC** - Automatically converts OCI images into LXC containers
3. **GUI Management** - These converted containers appear in Proxmox GUI like regular LXC containers
4. **Application Containers** - Run containerized applications without Docker daemon

### ❌ What It Does NOT Do

1. **Run Podman Directly** - Does not show Podman containers in GUI
2. **Docker Compose Support** - Complex multi-container setups need adaptation
3. **Replace Docker Engine** - Not a drop-in Docker replacement
4. **Pod Networking** - No native pod/shared network namespace support

## Our Deployment Architecture

### What We Built (Podman + Quadlet)

```
Proxmox Host
├── systemd
│   └── Podman Pod (iptv-pod)
│       ├── iptv-postgres (PostgreSQL)
│       ├── iptv-redis (Redis)
│       ├── iptv-backend (Node.js API)
│       └── iptv-frontend (Next.js)
└── Managed via systemctl & podman commands
```

**Advantages:**
- ✅ Pod networking (shared localhost)
- ✅ Low latency between containers
- ✅ systemd integration
- ✅ Full Docker Compose feature parity
- ✅ Best performance

**Disadvantage:**
- ❌ Not visible in Proxmox GUI by default

### Proxmox Native OCI Approach

```
Proxmox Host
├── LXC Container 100 (postgres)
├── LXC Container 101 (redis)
├── LXC Container 102 (backend)
└── LXC Container 103 (frontend)
    └── Each with separate networking
```

**Advantages:**
- ✅ Visible in Proxmox GUI
- ✅ Standard Proxmox backup/snapshot
- ✅ Familiar Proxmox management

**Disadvantages:**
- ❌ No pod networking (separate containers)
- ❌ Must use IP addresses to communicate
- ❌ More complex network setup
- ❌ Some Docker Compose features may not work

## Comparison Table

| Feature | Our Podman Deployment | Proxmox Native OCI |
|---------|----------------------|-------------------|
| **GUI Visibility** | ❌ (needs dashboard) | ✅ Native |
| **Performance** | ✅ Excellent (pod) | ✅ Good (LXC) |
| **Network Latency** | ✅ localhost (0.1ms) | ⚠️ Bridge (~1ms) |
| **Setup Complexity** | ⚠️ Manual deployment | ✅ GUI wizard |
| **Docker Compose** | ✅ Full support | ⚠️ Limited |
| **Systemd Integration** | ✅ Native | ⚠️ Via LXC |
| **Backup** | ⚠️ Manual | ✅ Proxmox integrated |
| **Resource Overhead** | ✅ Minimal | ✅ Minimal |
| **Migration** | ⚠️ Custom | ✅ Proxmox tools |

## Recommendation

### For Production Deployments

**Keep our Podman deployment + Add Dashboard**

Why:
1. Better performance (pod networking)
2. Full Docker Compose compatibility
3. Easier management with our scripts
4. systemd integration benefits
5. Can add web dashboard for visibility

### For Simple Applications

**Use Proxmox Native OCI**

Why:
1. Single containers without complex networking
2. Want GUI management
3. Prefer Proxmox-integrated backups
4. Don't need pod networking

## How to See Containers in Proxmox

### Option 1: Install Web Dashboard (Recommended)

```bash
cd /storage-pool/xtream/proxmox-oci/scripts
./install-dashboard.sh
```

Access at: `http://PROXMOX_IP:18089`

**Features:**
- ✅ Real-time container status
- ✅ Auto-refresh every 10 seconds
- ✅ Shows all Podman containers
- ✅ Clean, modern UI
- ✅ No Proxmox modification needed

### Option 2: Use Proxmox Shell

1. In Proxmox GUI, click on node → **Shell**
2. Run our management commands:
   ```bash
   cd /storage-pool/xtream/proxmox-oci
   make status
   make logs
   systemctl status iptv-pod.service
   ```

### Option 3: Convert to Proxmox Native OCI

See `PROXMOX_GUI_INTEGRATION.md` for full conversion guide.

**Warning:** Requires reconfiguration and loses pod networking benefits.

## Best Practice: Hybrid Approach

1. **Keep Podman deployment** for production workloads
2. **Install web dashboard** for visibility
3. **Use Proxmox shell** for management
4. **Document the setup** for team

This gives you:
- ✅ Best performance
- ✅ Visual monitoring
- ✅ Familiar management
- ✅ No Proxmox modifications
- ✅ Easy backups (via our scripts)

## Quick Links

- **Install Dashboard:** `./scripts/install-dashboard.sh`
- **Full Integration Guide:** [PROXMOX_GUI_INTEGRATION.md](PROXMOX_GUI_INTEGRATION.md)
- **Management Commands:** [CHEATSHEET.md](CHEATSHEET.md)
- **Status Check:** `./scripts/status.sh`

## Summary

Proxmox 9.1's OCI support is excellent for running **single OCI containers as LXC**, but our **Podman pod deployment offers better performance and Docker Compose compatibility** for multi-container applications. The web dashboard provides visibility without sacrificing these benefits.
