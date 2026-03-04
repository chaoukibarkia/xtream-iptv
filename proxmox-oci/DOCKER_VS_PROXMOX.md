# Docker Compose vs Proxmox OCI Container Comparison

## Side-by-Side Comparison

| Feature | Docker Compose | Proxmox OCI (Podman + Quadlet) |
|---------|---------------|--------------------------------|
| **Container Runtime** | Docker Engine | Podman (OCI-compliant) |
| **Orchestration** | docker-compose CLI | systemd native |
| **Configuration Format** | YAML (docker-compose.yml) | systemd unit files (.container, .pod, .volume) |
| **Networking** | Docker bridge network | Podman pod (shared namespace) |
| **Volume Management** | Named volumes or bind mounts | systemd-managed volumes with bind mounts |
| **Service Management** | `docker-compose up/down` | `systemctl start/stop` |
| **Auto-start** | `restart: unless-stopped` | `systemctl enable` |
| **Logs** | `docker-compose logs` | `journalctl -u service.name` |
| **Health Checks** | Built-in Docker healthcheck | Podman healthcheck via systemd |
| **Rootless Support** | Limited | Native (via systemd user units) |
| **Integration** | Standalone tool | Native Proxmox/systemd integration |
| **Privileged Operations** | Docker daemon (root) | Rootless by default, root optional |

## Architecture Comparison

### Docker Compose Architecture

```
docker-compose.yml
    ↓
Docker Engine (daemon)
    ↓
├── iptv-network (bridge)
│   ├── frontend container
│   ├── backend container
│   ├── postgres container
│   └── redis container
└── Named volumes
    ├── postgres-data
    ├── redis-data
    └── hls-segments
```

### Proxmox OCI Architecture

```
/etc/containers/systemd/
├── iptv-pod.pod
├── iptv-frontend.container
├── iptv-backend.container
├── iptv-postgres.container
└── iptv-redis.container
    ↓
systemd daemon
    ↓
Podman (rootless/rootful)
    ↓
iptv-pod (shared network namespace)
├── frontend container
├── backend container
├── postgres container
└── redis container
    ↓
systemd-managed volumes
├── iptv-postgres-data.volume
├── iptv-redis-data.volume
└── iptv-hls-segments.volume
```

## Key Differences

### 1. Service Declaration

**Docker Compose:**
```yaml
services:
  backend:
    build: ./iptv-server
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgresql://...
    depends_on:
      - postgres
    restart: unless-stopped
```

**Proxmox OCI (Quadlet):**
```ini
[Unit]
Description=IPTV Backend
Requires=iptv-postgres.service
After=iptv-postgres.service

[Container]
ContainerName=iptv-backend
Image=localhost/iptv-backend:latest
Pod=iptv-pod.service
Environment=DATABASE_URL=postgresql://...

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

### 2. Networking

**Docker Compose:**
- Creates a custom bridge network (`iptv-network`)
- Services communicate via service names (DNS resolution)
- Each service has its own network namespace

**Proxmox OCI:**
- Uses a Podman pod (like Kubernetes pods)
- All containers share the same network namespace
- Services communicate via `localhost` (same as multi-process system)
- More efficient, no network overhead between containers

### 3. Volume Management

**Docker Compose:**
```yaml
volumes:
  postgres-data:
    driver: local
```

**Proxmox OCI:**
```ini
[Volume]
VolumeName=iptv-postgres-data
Device=/storage-pool/xtream-data/postgres
Type=none
Options=bind
```

Proxmox explicitly maps to host paths, making backup/migration easier.

### 4. Service Management

**Docker Compose:**
```bash
docker-compose up -d
docker-compose down
docker-compose restart backend
docker-compose logs -f backend
```

**Proxmox OCI:**
```bash
systemctl start iptv-pod.service
systemctl stop iptv-pod.service
systemctl restart iptv-backend.service
journalctl -u iptv-backend.service -f
```

### 5. Auto-start on Boot

**Docker Compose:**
- Relies on `restart: unless-stopped` policy
- Docker daemon must auto-start
- Less granular control

**Proxmox OCI:**
```bash
systemctl enable iptv-pod.service
```
- Native systemd integration
- Fine-grained control per service
- Can use systemd timers for scheduling

## Migration Mapping

### Configuration Mapping

| Docker Compose | Proxmox OCI Quadlet | Notes |
|----------------|---------------------|-------|
| `services:` | `.container` files | Each service becomes a separate `.container` file |
| `networks:` | `.pod` file | Single pod replaces network definition |
| `volumes:` | `.volume` files | Each named volume becomes a `.volume` file |
| `build:` | Pre-build required | Build images before deployment or load from registry |
| `depends_on:` | `Requires=` + `After=` | systemd unit dependencies |
| `restart:` | `[Service] Restart=` | systemd restart policies |
| `environment:` | `Environment=` | Same format, one per line |
| `ports:` | `PublishPort=` | Defined in `.pod` file |
| `volumes:` (bind) | `Volume=` | Bind mounts in `.container` file |
| `healthcheck:` | `HealthCmd=` | Podman healthcheck support |

### Environment Variables

No changes needed - copy directly from `docker-compose.yml` to Quadlet `Environment=` lines.

### Commands

| Task | Docker Compose | Proxmox OCI |
|------|----------------|-------------|
| Start all | `docker-compose up -d` | `systemctl start iptv-pod.service` |
| Stop all | `docker-compose down` | `systemctl stop iptv-pod.service` |
| Restart one | `docker-compose restart backend` | `systemctl restart iptv-backend.service` |
| View logs | `docker-compose logs -f backend` | `journalctl -u iptv-backend.service -f` |
| Status | `docker-compose ps` | `systemctl status iptv-pod.service` |
| Exec command | `docker-compose exec backend bash` | `podman exec -it iptv-backend bash` |
| Build | `docker-compose build` | `podman build -t name:tag .` |
| Pull | `docker-compose pull` | `podman pull image:tag` |

## Advantages of Proxmox OCI

### 1. **Native Integration**
- Managed by systemd (standard Linux init system)
- No separate daemon required
- Better integration with Proxmox management tools

### 2. **Security**
- Rootless containers by default
- No privileged daemon
- Better isolation with user namespaces

### 3. **Resource Management**
- Native systemd resource controls (CPUQuota, MemoryLimit)
- cgroups v2 support
- Better integration with Proxmox resource allocation

### 4. **Logging**
- Centralized systemd journal
- Better integration with log aggregation tools
- Persistent logs across restarts

### 5. **Dependency Management**
- Fine-grained service dependencies
- Better startup/shutdown ordering
- Integration with systemd targets

### 6. **Monitoring**
- Native systemd monitoring
- Integration with Proxmox metrics
- Standard Linux tools (top, htop, etc.)

### 7. **Backup/Restore**
- Clear volume paths on host filesystem
- Easy to include in Proxmox backup strategies
- No hidden Docker volumes

## Disadvantages/Considerations

### 1. **Learning Curve**
- Different syntax (systemd units vs YAML)
- New commands to learn
- Less familiar to Docker-only users

### 2. **Ecosystem**
- Docker Compose has larger ecosystem
- More tutorials and examples available
- Some Docker-specific tools won't work

### 3. **Development Workflow**
- Docker Compose better for rapid iteration
- Quadlet requires systemd reload after changes
- Better suited for production deployments

### 4. **Portability**
- Docker Compose runs anywhere Docker runs
- Quadlet requires systemd (Linux-only)
- Less portable across different platforms

## Recommendations

### Use Docker Compose When:
- ✅ Rapid development and iteration
- ✅ Cross-platform compatibility needed
- ✅ Team familiar with Docker ecosystem
- ✅ Deploying to non-systemd systems

### Use Proxmox OCI When:
- ✅ Production deployment on Proxmox
- ✅ Need rootless containers
- ✅ Want native systemd integration
- ✅ Better resource management required
- ✅ Long-term stable deployments
- ✅ Integration with Proxmox backup/monitoring

## Hybrid Approach

You can maintain both:

1. **Development:** Use Docker Compose on developer machines
2. **Production:** Use Proxmox OCI on Proxmox hosts

The Dockerfiles remain identical, only the orchestration layer changes.

## Performance Comparison

| Metric | Docker Compose | Proxmox OCI |
|--------|----------------|-------------|
| **Container Startup** | ~5-10s | ~3-7s (systemd parallel) |
| **Memory Overhead** | ~100MB (daemon) | ~20MB (podman) |
| **Network Latency** | Bridge network (~1ms) | Pod localhost (~0.1ms) |
| **Resource Isolation** | Good | Excellent (cgroups v2) |
| **Log Performance** | Fast | Faster (journald binary format) |

## Migration Checklist

- [ ] Backup existing Docker volumes
- [ ] Install Podman on Proxmox host
- [ ] Build or transfer container images
- [ ] Create storage directories
- [ ] Deploy Quadlet configuration files
- [ ] Test services individually
- [ ] Migrate data from Docker volumes
- [ ] Update firewall rules
- [ ] Update monitoring/alerts
- [ ] Update backup procedures
- [ ] Document changes for team

## Conclusion

Proxmox OCI with Podman and Quadlet provides a more integrated, secure, and performant solution for production deployments on Proxmox hosts. While Docker Compose remains excellent for development, Proxmox OCI offers better resource management, security, and integration with the Proxmox ecosystem.

The migration path is straightforward, and the two approaches can coexist during transition periods.
