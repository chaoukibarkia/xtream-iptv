#!/bin/bash

# IPTV Development Server Manager
# Usage: ./dev.sh [start|stop|restart|status]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/iptv-server"
FRONTEND_DIR="$SCRIPT_DIR/iptv-frontend"
PID_DIR="$SCRIPT_DIR/.pids"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Create PID directory if it doesn't exist
mkdir -p "$PID_DIR"

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

start_backend() {
    log_info "Starting backend server..."
    
    if [ -f "$PID_DIR/backend.pid" ]; then
        PID=$(cat "$PID_DIR/backend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            log_warning "Backend already running (PID: $PID)"
            return 0
        fi
    fi
    
    cd "$BACKEND_DIR"
    npm run dev > "$PID_DIR/backend.log" 2>&1 &
    echo $! > "$PID_DIR/backend.pid"
    
    sleep 2
    if kill -0 $(cat "$PID_DIR/backend.pid") 2>/dev/null; then
        log_success "Backend started (PID: $(cat "$PID_DIR/backend.pid")) - http://localhost:3001"
    else
        log_error "Failed to start backend. Check $PID_DIR/backend.log for details"
        return 1
    fi
}

start_frontend() {
    log_info "Starting frontend server..."
    
    if [ -f "$PID_DIR/frontend.pid" ]; then
        PID=$(cat "$PID_DIR/frontend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            log_warning "Frontend already running (PID: $PID)"
            return 0
        fi
    fi
    
    cd "$FRONTEND_DIR"
    npm run dev > "$PID_DIR/frontend.log" 2>&1 &
    echo $! > "$PID_DIR/frontend.pid"
    
    sleep 3
    if kill -0 $(cat "$PID_DIR/frontend.pid") 2>/dev/null; then
        log_success "Frontend started (PID: $(cat "$PID_DIR/frontend.pid")) - http://localhost:3000"
    else
        log_error "Failed to start frontend. Check $PID_DIR/frontend.log for details"
        return 1
    fi
}

stop_backend() {
    log_info "Stopping backend server..."
    
    # Kill by PID file
    if [ -f "$PID_DIR/backend.pid" ]; then
        PID=$(cat "$PID_DIR/backend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            sleep 1
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_DIR/backend.pid"
    fi
    
    # Also kill any tsx watch processes for iptv-server
    pkill -f "tsx watch.*iptv-server" 2>/dev/null
    pkill -f "node.*iptv-server" 2>/dev/null
    
    log_success "Backend stopped"
}

stop_frontend() {
    log_info "Stopping frontend server..."
    
    # Kill by PID file
    if [ -f "$PID_DIR/frontend.pid" ]; then
        PID=$(cat "$PID_DIR/frontend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID" 2>/dev/null
            sleep 1
            kill -9 "$PID" 2>/dev/null
        fi
        rm -f "$PID_DIR/frontend.pid"
    fi
    
    # Also kill any next dev processes
    pkill -f "next dev" 2>/dev/null
    pkill -f "next-router-worker" 2>/dev/null
    pkill -9 -f "next-server" 2>/dev/null
    
    # Clean up Next.js lock file to prevent startup issues
    rm -rf "$FRONTEND_DIR/.next/dev/lock" 2>/dev/null
    
    log_success "Frontend stopped"
}

status() {
    echo -e "\n${BLUE}=== IPTV Dev Server Status ===${NC}\n"
    
    # Backend status
    BACKEND_RUNNING=false
    if [ -f "$PID_DIR/backend.pid" ]; then
        PID=$(cat "$PID_DIR/backend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            BACKEND_RUNNING=true
            echo -e "Backend:  ${GREEN}● Running${NC} (PID: $PID) - http://localhost:3001"
        fi
    fi
    if [ "$BACKEND_RUNNING" = false ]; then
        # Check if running without PID file
        if pgrep -f "tsx watch.*iptv-server" > /dev/null 2>&1; then
            echo -e "Backend:  ${YELLOW}● Running (untracked)${NC} - http://localhost:3001"
        else
            echo -e "Backend:  ${RED}● Stopped${NC}"
        fi
    fi
    
    # Frontend status
    FRONTEND_RUNNING=false
    if [ -f "$PID_DIR/frontend.pid" ]; then
        PID=$(cat "$PID_DIR/frontend.pid")
        if kill -0 "$PID" 2>/dev/null; then
            FRONTEND_RUNNING=true
            echo -e "Frontend: ${GREEN}● Running${NC} (PID: $PID) - http://localhost:3000"
        fi
    fi
    if [ "$FRONTEND_RUNNING" = false ]; then
        # Check if running without PID file
        if pgrep -f "next dev" > /dev/null 2>&1; then
            echo -e "Frontend: ${YELLOW}● Running (untracked)${NC} - http://localhost:3000"
        else
            echo -e "Frontend: ${RED}● Stopped${NC}"
        fi
    fi
    
    echo ""
}

logs() {
    case "$1" in
        backend)
            if [ -f "$PID_DIR/backend.log" ]; then
                tail -f "$PID_DIR/backend.log"
            else
                log_error "No backend log file found"
            fi
            ;;
        frontend)
            if [ -f "$PID_DIR/frontend.log" ]; then
                tail -f "$PID_DIR/frontend.log"
            else
                log_error "No frontend log file found"
            fi
            ;;
        *)
            log_error "Usage: $0 logs [backend|frontend]"
            ;;
    esac
}

case "$1" in
    start)
        echo -e "\n${BLUE}=== Starting IPTV Dev Servers ===${NC}\n"
        start_backend
        start_frontend
        echo ""
        status
        ;;
    stop)
        echo -e "\n${BLUE}=== Stopping IPTV Dev Servers ===${NC}\n"
        stop_frontend
        stop_backend
        echo ""
        ;;
    restart)
        echo -e "\n${BLUE}=== Restarting IPTV Dev Servers ===${NC}\n"
        stop_frontend
        stop_backend
        sleep 2
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
    backend)
        case "$2" in
            start) start_backend ;;
            stop) stop_backend ;;
            restart) stop_backend; sleep 1; start_backend ;;
            *) log_error "Usage: $0 backend [start|stop|restart]" ;;
        esac
        ;;
    frontend)
        case "$2" in
            start) start_frontend ;;
            stop) stop_frontend ;;
            restart) stop_frontend; sleep 1; start_frontend ;;
            *) log_error "Usage: $0 frontend [start|stop|restart]" ;;
        esac
        ;;
    *)
        echo -e "\n${BLUE}IPTV Development Server Manager${NC}"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  start              Start both backend and frontend servers"
        echo "  stop               Stop both servers"
        echo "  restart            Restart both servers"
        echo "  status             Show server status"
        echo "  logs <server>      Tail logs (backend|frontend)"
        echo ""
        echo "  backend start      Start only backend"
        echo "  backend stop       Stop only backend"
        echo "  backend restart    Restart only backend"
        echo ""
        echo "  frontend start     Start only frontend"
        echo "  frontend stop      Stop only frontend"
        echo "  frontend restart   Restart only frontend"
        echo ""
        ;;
esac

