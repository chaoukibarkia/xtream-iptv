#!/bin/bash
# ============================================
# Restart All Services on All LXC Containers
# ============================================
# Restarts backend/edge services on:
# - s01: LXC 102 (main panel backend - iptv-backend)
# - s02: LXC 201 (edge server - iptv-edge)
# - s03: LXC 202 (edge server - iptv-edge)
# - s04: LXC 203 (edge server - iptv-edge)
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Proxmox VE nodes configuration
declare -A NODES=(
    ["s01"]="147.135.138.57"
    ["s02"]="141.94.29.14"
    ["s03"]="141.94.29.16"
    ["s04"]="141.94.161.231"
)

declare -A PASSWORDS=(
    ["s01"]="1M227DtI40CBV2ll"
    ["s02"]="VuifDVuCxLCUFR1n"
    ["s03"]="N4QoVU543Jsntb5W"
    ["s04"]="V6QKjDlq6plhL5a7"
)

# Backend container VMIDs for each node
declare -A BACKEND_CONTAINERS=(
    ["s01"]="102"
    ["s02"]="201"
    ["s03"]="202"
    ["s04"]="203"
)

# Service names for each node
declare -A SERVICE_NAMES=(
    ["s01"]="iptv-backend"
    ["s02"]="iptv-edge"
    ["s03"]="iptv-edge"
    ["s04"]="iptv-edge"
)

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

# Check for sshpass
check_dependencies() {
    if ! command -v sshpass &> /dev/null; then
        print_warning "sshpass not found. Installing..."
        sudo apt-get update && sudo apt-get install -y sshpass
    fi
}

# Restart service on a single container
restart_service() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    local container_id=$4
    local service_name=$5
    
    print_header "Restarting ${service_name} on ${node_name} container ${container_id}"
    
    # Test SSH connection
    if ! sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@${node_ip}" "echo 'OK'" &>/dev/null; then
        print_error "Cannot connect to ${node_name} (${node_ip})"
        return 1
    fi
    
    # Use set -e inside the function for error handling
    set -e
    
    # Restart service inside container
    print_info "Restarting service ${service_name}..."
    sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" << REMOTE_EXEC
# Restart service inside container
pct exec ${container_id} -- bash << 'CONTAINER_EXEC'
set -e

SERVICE_NAME="${service_name}"

echo ""
echo "=== Checking service status ==="
if systemctl list-units --type=service --all | grep -q "\${SERVICE_NAME}"; then
    echo "Service \${SERVICE_NAME} exists"
    
    echo ""
    echo "=== Stopping service ==="
    if systemctl is-active "\${SERVICE_NAME}" >/dev/null 2>&1; then
        systemctl stop "\${SERVICE_NAME}" || true
        echo "Service stopped"
        sleep 1
    else
        echo "Service \${SERVICE_NAME} is not running"
    fi
    
    echo ""
    echo "=== Starting service ==="
    if systemctl start "\${SERVICE_NAME}" 2>&1; then
        echo "Service started successfully"
    else
        echo "Warning: Service start may have failed"
    fi
    
    echo ""
    echo "=== Checking service status ==="
    sleep 2
    if systemctl is-active "\${SERVICE_NAME}" >/dev/null 2>&1; then
        echo "✅ Service \${SERVICE_NAME} is running"
        systemctl status "\${SERVICE_NAME}" --no-pager -l | head -10 || true
    else
        echo "❌ Service \${SERVICE_NAME} is not active"
        systemctl status "\${SERVICE_NAME}" --no-pager -l | head -15 || true
    fi
else
    echo "⚠️  Service \${SERVICE_NAME} not found (may not be installed as systemd service)"
    echo "Checking if process is running..."
    if pgrep -f "node.*dist/server.js\|node.*iptv-server" > /dev/null 2>&1; then
        echo "Backend process is running (not managed by systemd)"
        pkill -f "node.*dist/server.js\|node.*iptv-server" || true
        sleep 2
        echo "Process stopped. Please start manually if needed."
    else
        echo "No backend process found"
    fi
fi

echo ""
echo "=== Restart complete ==="
CONTAINER_EXEC

echo ""
echo "=== Node ${node_name} container ${container_id} service restarted ==="
REMOTE_EXEC
    
    local exit_code=$?
    set +e  # Disable exit on error again after function
    
    if [ $exit_code -eq 0 ]; then
        print_success "${node_name} container ${container_id} service restarted"
        return 0
    else
        print_error "${node_name} container ${container_id} service restart failed"
        return 1
    fi
}

# Main execution
print_header "Restart All Services on All LXC Containers"

# Check dependencies
check_dependencies

# Restart services on all nodes
SUCCESSFUL=0
FAILED=0

SPECIFIC_NODE="${1:-}"

# Process nodes in explicit order to ensure all are processed
NODE_ORDER=("s01" "s02" "s03" "s04")

for node_name in "${NODE_ORDER[@]}"; do
    if [ -n "$SPECIFIC_NODE" ] && [ "$SPECIFIC_NODE" != "$node_name" ]; then
        continue
    fi
    
    # Skip if node not in NODES array
    if [ -z "${NODES[$node_name]:-}" ]; then
        continue
    fi
    
    node_ip="${NODES[$node_name]}"
    password="${PASSWORDS[$node_name]}"
    container_id="${BACKEND_CONTAINERS[$node_name]}"
    service_name="${SERVICE_NAMES[$node_name]:-iptv-backend}"
    
    if [ -z "$container_id" ]; then
        print_warning "No container ID configured for ${node_name}, skipping"
        continue
    fi
    
    echo ""
    if restart_service "$node_name" "$node_ip" "$password" "$container_id" "$service_name"; then
        ((SUCCESSFUL++))
    else
        ((FAILED++))
    fi
done

# Summary
echo ""
print_header "Restart Summary"
echo -e "Successful: ${GREEN}${SUCCESSFUL}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    print_success "All services restarted successfully!"
    exit 0
else
    print_warning "Some restarts failed. Check the logs above."
    exit 1
fi
