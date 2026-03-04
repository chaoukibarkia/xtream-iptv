#!/bin/bash
# ============================================
# Restart a Specific Stream on All Servers
# ============================================
# Usage: ./restart-stream.sh <streamId>
# ============================================

set -e

STREAM_ID="${1:-49}"

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

declare -A BACKEND_CONTAINERS=(
    ["s01"]="102"
    ["s02"]="201"
    ["s03"]="202"
    ["s04"]="203"
)

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Restart stream on a container
restart_stream_on_container() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    local container_id=$4
    local stream_id=$5
    
    print_info "Restarting stream ${stream_id} on ${node_name} container ${container_id}..."
    
    sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" << REMOTE_EXEC
pct exec ${container_id} -- bash << 'CONTAINER_EXEC'
STREAM_ID=${stream_id}
BACKEND_DIR="/opt/iptv-server"

# Check if stream is running
cd "\${BACKEND_DIR}"

# Try to restart via node script if available
if [ -f "dist/server.js" ]; then
    # Use node to call the restart endpoint internally
    node -e "
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    
    (async () => {
        try {
            const stream = await prisma.stream.findUnique({
                where: { id: ${STREAM_ID} },
                select: { id: true, ffmpegPid: true, streamStatus: true }
            });
            
            if (!stream) {
                console.log('Stream ${STREAM_ID} not found');
                process.exit(1);
            }
            
            console.log('Stream status:', stream.streamStatus);
            console.log('FFmpeg PID:', stream.ffmpegPid);
            
            // Kill FFmpeg process if running
            if (stream.ffmpegPid) {
                try {
                    process.kill(stream.ffmpegPid, 'SIGTERM');
                    console.log('Sent SIGTERM to PID', stream.ffmpegPid);
                    await new Promise(r => setTimeout(r, 1000));
                    
                    // Force kill if still running
                    try {
                        process.kill(stream.ffmpegPid, 0);
                        process.kill(stream.ffmpegPid, 'SIGKILL');
                        console.log('Sent SIGKILL to PID', stream.ffmpegPid);
                    } catch (e) {
                        // Process already dead
                    }
                } catch (e) {
                    console.log('Error killing process:', e.message);
                }
            }
            
            // Update status to STOPPED
            await prisma.stream.update({
                where: { id: ${STREAM_ID} },
                data: { 
                    streamStatus: 'STOPPED',
                    ffmpegPid: null,
                    lastStoppedAt: new Date()
                }
            });
            
            console.log('Stream ${STREAM_ID} stopped. It will restart automatically on next viewer request.');
            
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        } finally {
            await prisma.\$disconnect();
        }
    })();
    " || echo "Failed to stop stream via Node.js"
else
    echo "Backend directory not found"
fi
CONTAINER_EXEC
REMOTE_EXEC
    
    if [ $? -eq 0 ]; then
        print_success "Stream ${stream_id} restarted on ${node_name}"
        return 0
    else
        print_error "Failed to restart stream ${stream_id} on ${node_name}"
        return 1
    fi
}

echo -e "${BLUE}Restarting stream ${STREAM_ID} on all servers...${NC}"
echo ""

SUCCESSFUL=0
FAILED=0

# Process nodes in order
NODE_ORDER=("s01" "s02" "s03" "s04")

for node_name in "${NODE_ORDER[@]}"; do
    node_ip="${NODES[$node_name]}"
    password="${PASSWORDS[$node_name]}"
    container_id="${BACKEND_CONTAINERS[$node_name]}"
    
    if restart_stream_on_container "$node_name" "$node_ip" "$password" "$container_id" "$STREAM_ID"; then
        ((SUCCESSFUL++))
    else
        ((FAILED++))
    fi
done

echo ""
echo -e "Successful: ${GREEN}${SUCCESSFUL}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
