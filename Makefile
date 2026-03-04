# ============================================
# IPTV System - Makefile
# ============================================

# Use docker-compose v1 or docker compose v2
COMPOSE := $(shell command -v docker-compose 2>/dev/null || echo "docker compose")

.PHONY: help build up down logs restart clean dev setup migrate seed

# Default target
help:
	@echo ""
	@echo "╔══════════════════════════════════════════════════════════════╗"
	@echo "║                    IPTV System Commands                       ║"
	@echo "╠══════════════════════════════════════════════════════════════╣"
	@echo "║  Production:                                                  ║"
	@echo "║    make build    - Build all Docker images                    ║"
	@echo "║    make up       - Start all services                         ║"
	@echo "║    make down     - Stop all services                          ║"
	@echo "║    make restart  - Restart all services                       ║"
	@echo "║    make logs     - View logs (all services)                   ║"
	@echo "║    make logs-f   - Follow logs (all services)                 ║"
	@echo "║                                                               ║"
	@echo "║  Development:                                                 ║"
	@echo "║    make dev      - Start dev infrastructure (Postgres, Redis)║"
	@echo "║    make dev-down - Stop dev infrastructure                    ║"
	@echo "║                                                               ║"
	@echo "║  Database:                                                    ║"
	@echo "║    make setup    - Run database migrations and seed           ║"
	@echo "║    make migrate  - Run database migrations only               ║"
	@echo "║    make seed     - Seed database only                         ║"
	@echo "║                                                               ║"
	@echo "║  Tools:                                                       ║"
	@echo "║    make tools    - Start Adminer & Redis Commander            ║"
	@echo "║    make clean    - Remove all containers and volumes          ║"
	@echo "╚══════════════════════════════════════════════════════════════╝"
	@echo ""

# ==========================================
# Production Commands
# ==========================================

# Build all images
build:
	$(COMPOSE) build

# Build without cache
build-fresh:
	$(COMPOSE) build --no-cache

# Start services
up:
	$(COMPOSE) up -d

# Stop services
down:
	$(COMPOSE) down

# Restart services
restart:
	$(COMPOSE) restart

# View logs
logs:
	$(COMPOSE) logs

# Follow logs
logs-f:
	$(COMPOSE) logs -f

# Logs for specific service
logs-backend:
	$(COMPOSE) logs -f backend

logs-frontend:
	$(COMPOSE) logs -f frontend

# ==========================================
# Development Commands
# ==========================================

# Start development infrastructure only
dev:
	$(COMPOSE) -f docker-compose.dev.yml up -d

# Stop development infrastructure
dev-down:
	$(COMPOSE) -f docker-compose.dev.yml down

# ==========================================
# Database Commands
# ==========================================

# Run migrations and seed
setup: migrate seed

# Run migrations
migrate:
	$(COMPOSE) run --rm migrate

# Seed database
seed:
	$(COMPOSE) run --rm seed

# Database shell
db-shell:
	$(COMPOSE) exec postgres psql -U iptv -d iptv_db

# ==========================================
# Tools Commands
# ==========================================

# Start admin tools
tools:
	$(COMPOSE) up -d adminer redis-commander

# Stop admin tools  
tools-down:
	$(COMPOSE) stop adminer redis-commander

# ==========================================
# Cleanup Commands
# ==========================================

# Remove all containers, networks, and volumes
clean:
	$(COMPOSE) down -v --remove-orphans
	$(COMPOSE) -f docker-compose.dev.yml down -v --remove-orphans

# Remove images too
clean-all: clean
	$(COMPOSE) down --rmi all
	$(COMPOSE) -f docker-compose.dev.yml down --rmi all

# ==========================================
# Status Commands
# ==========================================

# Show running containers
ps:
	$(COMPOSE) ps

# Show container stats
stats:
	docker stats $$($(COMPOSE) ps -q)

