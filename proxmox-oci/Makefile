# ============================================
# IPTV System - Proxmox OCI Makefile
# ============================================

.PHONY: help install start stop restart status logs logs-all backup restore update clean build

# Default target
help:
	@echo "IPTV System - Proxmox OCI Management"
	@echo "===================================="
	@echo ""
	@echo "Available targets:"
	@echo "  install      - Full deployment (build + deploy + init)"
	@echo "  build        - Build container images"
	@echo "  start        - Start all services"
	@echo "  stop         - Stop all services"
	@echo "  restart      - Restart all services"
	@echo "  status       - Show service status"
	@echo "  logs         - Show backend logs"
	@echo "  logs-all     - Show all service logs"
	@echo "  backup       - Backup database and volumes"
	@echo "  restore      - Restore from backup"
	@echo "  update       - Update images and restart"
	@echo "  clean        - Remove all containers and volumes"
	@echo ""
	@echo "Individual services:"
	@echo "  restart-backend   - Restart backend only"
	@echo "  restart-frontend  - Restart frontend only"
	@echo "  logs-backend      - Backend logs"
	@echo "  logs-frontend     - Frontend logs"
	@echo "  logs-postgres     - PostgreSQL logs"
	@echo "  logs-redis        - Redis logs"
	@echo ""

# Full installation
install:
	@echo "Starting full installation..."
	./scripts/deploy.sh

# Build images
build:
	@echo "Building images..."
	podman build -t iptv-backend:latest -f ../iptv-server/Dockerfile ../iptv-server
	podman build -t iptv-frontend:latest \
		--build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
		--build-arg NEXT_PUBLIC_TMDB_IMAGE_BASE=https://image.tmdb.org/t/p \
		--build-arg NEXT_PUBLIC_ADMIN_API_KEY=admin-secret-key \
		-f ../iptv-frontend/Dockerfile ../iptv-frontend
	@echo "✓ Images built successfully"

# Service management
start:
	@echo "Starting all services..."
	systemctl start iptv-pod.service
	@echo "✓ Services started"

stop:
	@echo "Stopping all services..."
	systemctl stop iptv-pod.service
	@echo "✓ Services stopped"

restart:
	@echo "Restarting all services..."
	systemctl restart iptv-pod.service
	@echo "✓ Services restarted"

restart-backend:
	systemctl restart iptv-backend.service

restart-frontend:
	systemctl restart iptv-frontend.service

restart-postgres:
	systemctl restart iptv-postgres.service

restart-redis:
	systemctl restart iptv-redis.service

# Status and logs
status:
	@./scripts/status.sh

logs:
	@./scripts/logs.sh backend

logs-all:
	@./scripts/logs.sh all

logs-backend:
	@./scripts/logs.sh backend

logs-frontend:
	@./scripts/logs.sh frontend

logs-postgres:
	@./scripts/logs.sh postgres

logs-redis:
	@./scripts/logs.sh redis

logs-pod:
	@./scripts/logs.sh pod

# Backup and restore
backup:
	@./scripts/backup.sh

restore:
	@./scripts/restore.sh

# Update
update:
	@./scripts/update.sh

# Database operations
db-migrate:
	@echo "Running database migrations..."
	podman exec iptv-backend npx prisma migrate deploy
	@echo "✓ Migrations complete"

db-seed:
	@echo "Seeding database..."
	podman exec iptv-backend node dist/scripts/seed.js
	@echo "✓ Database seeded"

db-backup:
	@echo "Backing up database..."
	podman exec iptv-postgres pg_dump -U iptv iptv_db > backup-$(shell date +%Y%m%d_%H%M%S).sql
	@echo "✓ Database backed up"

db-restore:
	@if [ -z "$(FILE)" ]; then \
		echo "Usage: make db-restore FILE=backup.sql"; \
		exit 1; \
	fi
	@echo "Restoring database from $(FILE)..."
	@cat $(FILE) | podman exec -i iptv-postgres psql -U iptv iptv_db
	@echo "✓ Database restored"

# Maintenance
clean:
	@echo "WARNING: This will remove all containers and volumes!"
	@echo "Press Ctrl+C to cancel or Enter to continue..."
	@read dummy
	systemctl stop iptv-pod.service || true
	podman pod rm -f iptv-pod || true
	podman rm -f iptv-postgres iptv-redis iptv-backend iptv-frontend iptv-adminer || true
	@echo "✓ Containers removed"
	@echo "To also remove volumes, run: rm -rf /storage-pool/xtream-data/*"

clean-all: clean
	@echo "Removing volumes..."
	rm -rf /storage-pool/xtream-data/*
	@echo "✓ All data removed"

# Enable/disable auto-start
enable:
	systemctl enable iptv-pod.service
	@echo "✓ Auto-start enabled"

disable:
	systemctl disable iptv-pod.service
	@echo "✓ Auto-start disabled"

# Health checks
health:
	@echo "Checking health..."
	@podman healthcheck run iptv-backend || echo "Backend: Unhealthy"
	@podman healthcheck run iptv-frontend || echo "Frontend: Unhealthy"
	@podman healthcheck run iptv-postgres || echo "PostgreSQL: Unhealthy"
	@podman healthcheck run iptv-redis || echo "Redis: Unhealthy"

# Resource usage
stats:
	@podman stats --no-stream

# Shell access
shell-backend:
	podman exec -it iptv-backend /bin/sh

shell-postgres:
	podman exec -it iptv-postgres psql -U iptv iptv_db

shell-redis:
	podman exec -it iptv-redis redis-cli

# Deployment helpers
deploy-config:
	@echo "Copying Quadlet configurations..."
	cp -r quadlet/* /etc/containers/systemd/
	systemctl daemon-reload
	@echo "✓ Configuration deployed"

reload:
	systemctl daemon-reload
	@echo "✓ Systemd reloaded"

# Development helpers
dev-build:
	$(MAKE) build
	$(MAKE) restart

dev-logs:
	podman logs -f iptv-backend

# Information
info:
	@echo "IPTV System Information"
	@echo "======================="
	@echo ""
	@echo "Images:"
	@podman images | grep iptv || echo "No images found"
	@echo ""
	@echo "Containers:"
	@podman ps -a | grep iptv || echo "No containers found"
	@echo ""
	@echo "Volumes:"
	@podman volume ls | grep iptv || echo "No volumes found"
	@echo ""
	@echo "Disk usage:"
	@du -sh /storage-pool/xtream-data/* 2>/dev/null || echo "No data found"
