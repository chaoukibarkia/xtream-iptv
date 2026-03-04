#!/bin/bash

# ============================================
# IPTV Production Server Manager
# ============================================
# Usage: ./prod.sh [start|stop|restart|status|build]
# 
# This script runs production builds of the servers
# Make sure to build first: ./prod.sh build
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/iptv-server"
FRONTEND_DIR="$SCRIPT_DIR/iptv-frontend"
PID_DIR="$SCRIPT_DIR/.pids"
LOG_DIR="$SCRIPT_DIR/.logs"

# Production ports
BACKEND_PORT=3001
FRONTEND_PORT=3000

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Create directories if they don't exist
mkdir -p "$PID_DIR"
mkdir -p "$LOG_DIR"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${CYAN}[STEP]${NC} $1"
}

# Check if infrastructure is running
check_infrastructure() {
    log_info "Checking infrastructure (PostgreSQL, Redis)..."
    
    # Check PostgreSQL
    if ! docker ps | grep -q "postgres"; then
        log_warning "PostgreSQL is not running"
        return 1
    fi
    
    # Check Redis
    if ! docker ps | grep -q "redis"; then
        log_warning "Redis is not running"
        return 1
    fi
    
    log_success "Infrastructure is running"
    return 0
}

start_infrastructure() {
    log_step "Starting infrastructure services..."
    cd "$SCRIPT_DIR"
    docker compose -f docker-compose.dev.yml up -d postgres redis
    
    # Wait for services to be ready
    log_info "Waiting for PostgreSQL to be ready..."
    for i in {1..30}; do
        if docker compose -f docker-compose.dev.yml exec -T postgres pg_isready -U iptv -d iptv_db > /dev/null 2>&1; then
            log_success "PostgreSQL is ready"
            break
        fi
        sleep 1
    done
    
    log_info "Waiting for Redis to be ready..."
    for i in {1..30}; do
        if docker compose -f docker-compose.dev.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
            log_success "Redis is ready"
            break
        fi
        sleep 1
    done
}

build_backend() {
    log_step "Building backend..."
    cd "$BACKEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing backend dependencies..."
        npm install
    fi
    
    log_info "Generating Prisma client..."
    npx prisma generate
    
    log_info "Compiling TypeScript..."
    npm run build
    
    if [ $? -eq 0 ]; then
        log_success "Backend build complete"
        return 0
    else
        log_error "Backend build failed"
        return 1
    fi
}

build_frontend() {
    log_step "Building frontend..."
    cd "$FRONTEND_DIR"
    
    if [ ! -d "node_modules" ]; then
        log_info "Installing frontend dependencies..."
        npm install
    fi
    
    log_info "Building Next.js application..."
    npm run build
    
    if [ $? -eq 0 ]; then
        log_success "Frontend build complete"
        return 0
    else
        log_error "Frontend build failed"
        return 1
    fi
}

run_migrations() {
    log_step "Running database migrations..."
    cd "$BACKEND_DIR"
    npx prisma migrate deploy
    
    if [ $? -eq 0 ]; then
        log_success "Migrations complete"
        return 0
    else
        log_error "Migrations failed"
        return 1
    fi
}

start_backend() {
    log_info "Starting backend server (production)..."
    
    if [ -f "$PID_DIR/backend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/backend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            log_warning "Backend already running (PID: $PID)"
            return 0
        fi
    fi
    
    # Check if build exists
    if [ ! -d "$BACKEND_DIR/dist" ]; then
        log_error "Backend not built. Run './prod.sh build' first"
        return 1
    fi
    
    cd "$BACKEND_DIR"
    
    # Set production environment
    export NODE_ENV=production
    export PORT=$BACKEND_PORT
    export HOST=0.0.0.0
    
    # Start the server
    node dist/server.js > "$LOG_DIR/backend-prod.log" 2>&1 &
    echo $! > "$PID_DIR/backend-prod.pid"
    
    sleep 3
    if kill -0 $(cat "$PID_DIR/backend-prod.pid") 2>/dev/null; then
        log_success "Backend started (PID: $(cat "$PID_DIR/backend-prod.pid")) - http://localhost:$BACKEND_PORT"
    else
        log_error "Failed to start backend. Check $LOG_DIR/backend-prod.log for details"
        cat "$LOG_DIR/backend-prod.log" | tail -20
        return 1
    fi
}

start_frontend() {
    log_info "Starting frontend server (production)..."
    
    if [ -f "$PID_DIR/frontend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/frontend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            log_warning "Frontend already running (PID: $PID)"
            return 0
        fi
    fi
    
    # Check if build exists
    if [ ! -d "$FRONTEND_DIR/.next" ]; then
        log_error "Frontend not built. Run './prod.sh build' first"
        return 1
    fi
    
    cd "$FRONTEND_DIR"
    
    # Set production environment
    export NODE_ENV=production
    
    # Start the server
    npm start > "$LOG_DIR/frontend-prod.log" 2>&1 &
    echo $! > "$PID_DIR/frontend-prod.pid"
    
    sleep 5
    if kill -0 $(cat "$PID_DIR/frontend-prod.pid") 2>/dev/null; then
        log_success "Frontend started (PID: $(cat "$PID_DIR/frontend-prod.pid")) - http://localhost:$FRONTEND_PORT"
    else
        log_error "Failed to start frontend. Check $LOG_DIR/frontend-prod.log for details"
        cat "$LOG_DIR/frontend-prod.log" | tail -20
        return 1
    fi
}

stop_backend() {
    log_info "Stopping backend server..."
    
    # Kill by PID file
    if [ -f "$PID_DIR/backend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/backend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            sleep 2
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_DIR/backend-prod.pid"
    fi
    
    # Also kill any node processes running the production server
    pkill -f "node dist/server.js" 2>/dev/null
    pkill -f "node.*iptv-server/dist" 2>/dev/null
    
    log_success "Backend stopped"
}

stop_frontend() {
    log_info "Stopping frontend server..."
    
    # Kill by PID file
    if [ -f "$PID_DIR/frontend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/frontend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            sleep 2
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_DIR/frontend-prod.pid"
    fi
    
    # Also kill any next start processes
    pkill -f "next start" 2>/dev/null
    pkill -f "next-server" 2>/dev/null
    
    log_success "Frontend stopped"
}

stop_infrastructure() {
    log_info "Stopping infrastructure services..."
    cd "$SCRIPT_DIR"
    docker compose -f docker-compose.dev.yml down
    log_success "Infrastructure stopped"
}

status() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     IPTV Production Server Status          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
    
    # Infrastructure status
    echo -e "${CYAN}Infrastructure:${NC}"
    
    # PostgreSQL
    if docker ps | grep -q "postgres"; then
        echo -e "  PostgreSQL:  ${GREEN}● Running${NC} (port 5432)"
    else
        echo -e "  PostgreSQL:  ${RED}● Stopped${NC}"
    fi
    
    # Redis
    if docker ps | grep -q "redis"; then
        echo -e "  Redis:       ${GREEN}● Running${NC} (port 6379)"
    else
        echo -e "  Redis:       ${RED}● Stopped${NC}"
    fi
    
    echo ""
    echo -e "${CYAN}Application:${NC}"
    
    # Backend status
    BACKEND_RUNNING=false
    if [ -f "$PID_DIR/backend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/backend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            BACKEND_RUNNING=true
            echo -e "  Backend:     ${GREEN}● Running${NC} (PID: $PID) - http://localhost:$BACKEND_PORT"
        fi
    fi
    if [ "$BACKEND_RUNNING" = false ]; then
        if pgrep -f "node dist/server.js" > /dev/null 2>&1; then
            echo -e "  Backend:     ${YELLOW}● Running (untracked)${NC} - http://localhost:$BACKEND_PORT"
        else
            echo -e "  Backend:     ${RED}● Stopped${NC}"
        fi
    fi
    
    # Frontend status
    FRONTEND_RUNNING=false
    if [ -f "$PID_DIR/frontend-prod.pid" ]; then
        PID=$(cat "$PID_DIR/frontend-prod.pid")
        if kill -0 "$PID" 2>/dev/null; then
            FRONTEND_RUNNING=true
            echo -e "  Frontend:    ${GREEN}● Running${NC} (PID: $PID) - http://localhost:$FRONTEND_PORT"
        fi
    fi
    if [ "$FRONTEND_RUNNING" = false ]; then
        if pgrep -f "next start" > /dev/null 2>&1; then
            echo -e "  Frontend:    ${YELLOW}● Running (untracked)${NC} - http://localhost:$FRONTEND_PORT"
        else
            echo -e "  Frontend:    ${RED}● Stopped${NC}"
        fi
    fi
    
    echo ""
}

logs() {
    case "$1" in
        backend)
            if [ -f "$LOG_DIR/backend-prod.log" ]; then
                tail -f "$LOG_DIR/backend-prod.log"
            else
                log_error "No backend log file found"
            fi
            ;;
        frontend)
            if [ -f "$LOG_DIR/frontend-prod.log" ]; then
                tail -f "$LOG_DIR/frontend-prod.log"
            else
                log_error "No frontend log file found"
            fi
            ;;
        *)
            log_error "Usage: $0 logs [backend|frontend]"
            ;;
    esac
}

build_all() {
    echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     Building IPTV Production               ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
    
    # Start infrastructure for migrations
    if ! check_infrastructure; then
        start_infrastructure
    fi
    
    build_backend
    if [ $? -ne 0 ]; then
        log_error "Build failed at backend stage"
        return 1
    fi
    
    run_migrations
    if [ $? -ne 0 ]; then
        log_error "Build failed at migration stage"
        return 1
    fi
    
    build_frontend
    if [ $? -ne 0 ]; then
        log_error "Build failed at frontend stage"
        return 1
    fi
    
    echo ""
    log_success "All builds complete! Run './prod.sh start' to start the servers"
    echo ""
}

case "$1" in
    start)
        echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║     Starting IPTV Production Servers       ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
        
        if ! check_infrastructure; then
            start_infrastructure
        fi
        
        start_backend
        start_frontend
        echo ""
        status
        ;;
    stop)
        echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║     Stopping IPTV Production Servers       ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
        
        stop_frontend
        stop_backend
        echo ""
        ;;
    stop-all)
        echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║     Stopping All IPTV Services             ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
        
        stop_frontend
        stop_backend
        stop_infrastructure
        echo ""
        ;;
    restart)
        echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║     Restarting IPTV Production Servers     ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
        
        stop_frontend
        stop_backend
        sleep 2
        
        if ! check_infrastructure; then
            start_infrastructure
        fi
        
        start_backend
        start_frontend
        echo ""
        status
        ;;
    status)
        status
        ;;
    logs)
        logs "$2"
        ;;
    build)
        build_all
        ;;
    backend)
        case "$2" in
            start) start_backend ;;
            stop) stop_backend ;;
            restart) stop_backend; sleep 1; start_backend ;;
            build) build_backend ;;
            *) log_error "Usage: $0 backend [start|stop|restart|build]" ;;
        esac
        ;;
    frontend)
        case "$2" in
            start) start_frontend ;;
            stop) stop_frontend ;;
            restart) stop_frontend; sleep 1; start_frontend ;;
            build) build_frontend ;;
            *) log_error "Usage: $0 frontend [start|stop|restart|build]" ;;
        esac
        ;;
    infra)
        case "$2" in
            start) start_infrastructure ;;
            stop) stop_infrastructure ;;
            restart) stop_infrastructure; sleep 2; start_infrastructure ;;
            *) log_error "Usage: $0 infra [start|stop|restart]" ;;
        esac
        ;;
    migrate)
        run_migrations
        ;;
    *)
        echo -e "\n${BLUE}╔════════════════════════════════════════════╗${NC}"
        echo -e "${BLUE}║     IPTV Production Server Manager         ║${NC}"
        echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}\n"
        
        echo "Usage: $0 <command> [options]"
        echo ""
        echo -e "${CYAN}Main Commands:${NC}"
        echo "  build              Build both backend and frontend for production"
        echo "  start              Start all production servers"
        echo "  stop               Stop application servers (keeps infrastructure)"
        echo "  stop-all           Stop everything including PostgreSQL & Redis"
        echo "  restart            Restart all production servers"
        echo "  status             Show all server status"
        echo "  logs <server>      Tail logs (backend|frontend)"
        echo "  migrate            Run database migrations"
        echo ""
        echo -e "${CYAN}Backend Commands:${NC}"
        echo "  backend start      Start only backend"
        echo "  backend stop       Stop only backend"
        echo "  backend restart    Restart only backend"
        echo "  backend build      Build only backend"
        echo ""
        echo -e "${CYAN}Frontend Commands:${NC}"
        echo "  frontend start     Start only frontend"
        echo "  frontend stop      Stop only frontend"
        echo "  frontend restart   Restart only frontend"
        echo "  frontend build     Build only frontend"
        echo ""
        echo -e "${CYAN}Infrastructure Commands:${NC}"
        echo "  infra start        Start PostgreSQL & Redis"
        echo "  infra stop         Stop PostgreSQL & Redis"
        echo "  infra restart      Restart PostgreSQL & Redis"
        echo ""
        echo -e "${CYAN}Quick Start:${NC}"
        echo "  1. ./prod.sh build    # Build everything"
        echo "  2. ./prod.sh start    # Start all servers"
        echo ""
        ;;
esac

