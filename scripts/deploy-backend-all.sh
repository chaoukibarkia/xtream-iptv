#!/bin/bash
# ============================================
# Deploy Backend Code to All LXC Containers
# ============================================
# Deploys backend code changes to:
# - s01: LXC 102 (main panel backend)
# - s02: LXC 201 (edge server)
# - s03: LXC 202 (edge server)
# - s04: LXC 203 (edge server)
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

# Service names for each node (main panel uses iptv-backend, edge servers use iptv-edge)
declare -A SERVICE_NAMES=(
    ["s01"]="iptv-backend"
    ["s02"]="iptv-edge"
    ["s03"]="iptv-edge"
    ["s04"]="iptv-edge"
)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/iptv-server"

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

# Build backend
build_backend() {
    print_header "Building Backend"
    
    cd "$BACKEND_DIR"
    
    print_info "Installing dependencies..."
    npm ci
    
    print_info "Generating Prisma client..."
    npx prisma generate
    
    print_info "Compiling TypeScript..."
    npm run build
    
    if [ $? -eq 0 ]; then
        print_success "Backend build complete"
        return 0
    else
        print_error "Backend build failed"
        return 1
    fi
}

# Package backend for deployment
package_backend() {
    print_header "Packaging Backend"
    
    DEPLOY_PACKAGE="/tmp/iptv-backend-deploy-$$.tar.gz"
    
    cd "$BACKEND_DIR"
    
    print_info "Creating deployment package..."
    if tar czf "$DEPLOY_PACKAGE" \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=.logs \
        --exclude=.pids \
        --exclude='*.log' \
        dist \
        prisma \
        package.json \
        package-lock.json \
        .env.example 2>&1; then
        if [ -f "$DEPLOY_PACKAGE" ]; then
            print_success "Package created: $DEPLOY_PACKAGE"
            return 0
        else
            print_error "Package file was not created"
            return 1
        fi
    else
        print_error "Failed to create package"
        return 1
    fi
}

# Deploy to a single container
deploy_to_container() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    local container_id=$4
    local package_path=$5
    local service_name="${SERVICE_NAMES[$node_name]:-iptv-backend}"
    
    print_header "Deploying to ${node_name} container ${container_id} (service: ${service_name})"
    
    # Test SSH connection
    if ! sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@${node_ip}" "echo 'OK'" &>/dev/null; then
        print_error "Cannot connect to ${node_name} (${node_ip})"
        return 1
    fi
    
    # Copy package to remote node
    print_info "Copying package to ${node_name}..."
    sshpass -p "${password}" scp -o StrictHostKeyChecking=no "$package_path" "root@${node_ip}:/tmp/backend-deploy.tar.gz"
    
    # Create deployment script on remote
    print_info "Deploying inside container ${container_id}..."
    
    # Write the container deployment script to a temp file
    local deploy_script="/tmp/container-deploy-$$.sh"
    cat > "$deploy_script" << 'DEPLOY_SCRIPT'
#!/bin/bash
set -e

BACKEND_DIR="/opt/iptv-server"
SERVICE_NAME="__SERVICE_NAME__"

echo ""
echo "=== Stopping service ${SERVICE_NAME} ==="
if systemctl is-active "${SERVICE_NAME}" >/dev/null 2>&1; then
    systemctl stop "${SERVICE_NAME}" || true
    echo "Service stopped"
else
    echo "Service ${SERVICE_NAME} is not running"
fi

echo ""
echo "=== Backing up current installation ==="
if [ -d "${BACKEND_DIR}" ]; then
    BACKUP_DIR="/tmp/iptv-backend-backup-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "${BACKUP_DIR}"
    cp -r "${BACKEND_DIR}/dist" "${BACKUP_DIR}/" 2>/dev/null || true
    cp "${BACKEND_DIR}/package.json" "${BACKUP_DIR}/" 2>/dev/null || true
    echo "Backup created at: ${BACKUP_DIR}"
fi

echo ""
echo "=== Extracting new code ==="
cd "${BACKEND_DIR}"
tar xzf /tmp/backend-deploy.tar.gz
rm /tmp/backend-deploy.tar.gz

echo ""
echo "=== Installing dependencies ==="
npm ci --omit=dev

echo ""
echo "=== Generating Prisma client ==="
npx prisma generate || echo "Prisma generate skipped (may not be needed)"

echo ""
echo "=== Setting permissions ==="
if id "nodeapp" >/dev/null 2>&1; then
    chown -R nodeapp:nodeapp "${BACKEND_DIR}" 2>/dev/null || true
elif id "node" >/dev/null 2>&1; then
    chown -R node:node "${BACKEND_DIR}" 2>/dev/null || true
fi

echo ""
echo "=== Starting service ${SERVICE_NAME} ==="
if systemctl start "${SERVICE_NAME}" 2>&1; then
    echo "Service started successfully"
else
    echo "Warning: Service start may have failed, checking status..."
fi

echo ""
echo "=== Checking service status ==="
sleep 2
if systemctl is-active "${SERVICE_NAME}" >/dev/null 2>&1; then
    echo "Service is running"
    systemctl status "${SERVICE_NAME}" --no-pager -l | head -10 || true
else
    echo "Warning: Service is not active"
    systemctl status "${SERVICE_NAME}" --no-pager -l | head -10 || true
fi

echo ""
echo "=== Deployment complete! ==="
DEPLOY_SCRIPT

    # Replace placeholder with actual service name
    sed -i "s/__SERVICE_NAME__/${service_name}/g" "$deploy_script"
    
    # Copy deploy script to remote node
    sshpass -p "${password}" scp -o StrictHostKeyChecking=no "$deploy_script" "root@${node_ip}:/tmp/container-deploy.sh"
    rm -f "$deploy_script"
    
    # Execute on remote node
    sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" "
        # Push files to container
        pct push ${container_id} /tmp/backend-deploy.tar.gz /tmp/backend-deploy.tar.gz
        pct push ${container_id} /tmp/container-deploy.sh /tmp/container-deploy.sh
        
        # Execute deployment script inside container
        pct exec ${container_id} -- bash /tmp/container-deploy.sh
        
        # Cleanup on host
        rm -f /tmp/backend-deploy.tar.gz /tmp/container-deploy.sh
        
        echo ''
        echo '=== Node ${node_name} container ${container_id} deployed ==='
    "
    
    if [ $? -eq 0 ]; then
        print_success "${node_name} container ${container_id} deployed successfully"
        return 0
    else
        print_error "${node_name} container ${container_id} deployment failed"
        return 1
    fi
}

# Main execution
print_header "Backend Deployment to All LXC Containers"

# Check dependencies
check_dependencies

# Build backend
if ! build_backend; then
    print_error "Build failed. Aborting deployment."
    exit 1
fi

# Package backend
DEPLOY_PACKAGE="/tmp/iptv-backend-deploy-$$.tar.gz"
if ! package_backend; then
    print_error "Failed to create deployment package"
    exit 1
fi
PACKAGE_PATH="$DEPLOY_PACKAGE"
if [ ! -f "$PACKAGE_PATH" ]; then
    print_error "Package file not found: $PACKAGE_PATH"
    exit 1
fi

# Deploy to all nodes
SUCCESSFUL=0
FAILED=0

SPECIFIC_NODE="${1:-}"

for node_name in "${!NODES[@]}"; do
    if [ -n "$SPECIFIC_NODE" ] && [ "$SPECIFIC_NODE" != "$node_name" ]; then
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
    if deploy_to_container "$node_name" "$node_ip" "$password" "$container_id" "$PACKAGE_PATH" "$service_name"; then
        ((SUCCESSFUL++))
    else
        ((FAILED++))
    fi
done

# Cleanup
rm -f "$PACKAGE_PATH"

# Summary
echo ""
print_header "Deployment Summary"
echo -e "Successful: ${GREEN}${SUCCESSFUL}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    print_success "All containers deployed successfully!"
    exit 0
else
    print_warning "Some deployments failed. Check the logs above."
    exit 1
fi
