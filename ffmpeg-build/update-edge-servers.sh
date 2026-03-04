#!/bin/bash
# ============================================
# Update Edge LXC Containers - FFmpeg 7.1 + MaxMind GeoIP
# ============================================
# Connects to Proxmox VE nodes and updates edge LXC containers with:
# - Latest FFmpeg 7.1
# - MaxMind GeoLite2 databases for IP geolocation
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# MaxMind License Key (get from https://www.maxmind.com/en/geolite2/signup)
MAXMIND_LICENSE_KEY="${MAXMIND_LICENSE_KEY:-}"

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

# Edge container VMIDs for each node
declare -A EDGE_CONTAINERS=(
    ["s01"]="200"
    ["s02"]="201"
    ["s03"]="202"
    ["s04"]="203"
)

# Mode: list, update, or all
MODE="${1:-all}"

# FFmpeg version
FFMPEG_VERSION="7.1"

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

print_usage() {
    echo "Usage: $0 [list|update|all] [node_name]"
    echo ""
    echo "Commands:"
    echo "  list              - List all LXC containers on all Proxmox nodes"
    echo "  update            - Update FFmpeg and install MaxMind on edge containers"
    echo "  all               - List and update (default)"
    echo ""
    echo "Options:"
    echo "  node_name         - Only process specific node (s01, s02, s03, s04)"
    echo ""
    echo "Environment:"
    echo "  MAXMIND_LICENSE_KEY  - MaxMind license key for GeoLite2 databases"
    echo ""
    echo "Examples:"
    echo "  $0 list                    # List all containers"
    echo "  $0 update s01              # Update only s01 node"
    echo "  MAXMIND_LICENSE_KEY=xxx $0 # Update with MaxMind"
}

# Function to list LXC containers on a Proxmox node
list_containers() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    
    echo -e "${CYAN}── ${node_name} (${node_ip}) ──${NC}"
    
    sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@${node_ip}" \
        "pct list 2>/dev/null || echo 'No LXC containers or pct not available'" 2>/dev/null
    
    echo ""
}

# Function to get edge container ID (uses predefined mapping or finds automatically)
get_edge_container_id() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    
    # Use predefined container ID if available
    if [ -n "${EDGE_CONTAINERS[$node_name]}" ]; then
        echo "${EDGE_CONTAINERS[$node_name]}"
        return
    fi
    
    # Fallback: Get container list and find edge container
    local container_id=$(sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" \
        "pct list 2>/dev/null | grep -i 'edge' | awk '{print \$1}' | head -1" 2>/dev/null)
    
    # If no specific edge container found, get the first running container
    if [ -z "$container_id" ]; then
        container_id=$(sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" \
            "pct list 2>/dev/null | grep -i 'running' | awk '{print \$1}' | head -1" 2>/dev/null)
    fi
    
    echo "$container_id"
}

# Function to update a single LXC container via Proxmox node
update_container() {
    local node_name=$1
    local node_ip=$2
    local password=$3
    local container_id=$4
    local maxmind_key=$5
    
    print_header "Updating container ${container_id} on ${node_name} (${node_ip})"
    
    # Create the update script with the key directly embedded
    local update_script="/tmp/update-edge-${container_id}.sh"
    
    cat > "$update_script" << SCRIPT_CONTENT
#!/bin/bash
set -e

FFMPEG_VERSION="7.1"
MAXMIND_LICENSE_KEY="${maxmind_key}"
DATA_DIR="/opt/iptv-server/data"

echo ""
echo "=== Updating system packages ==="
apt-get update -qq

echo ""
echo "=== Installing build dependencies for FFmpeg ==="

# Install core build tools first
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    autoconf automake build-essential cmake git \
    libtool nasm pkg-config wget curl ca-certificates xz-utils \
    2>/dev/null || true

# Install codec libraries (some may not be available on all systems)
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libass-dev libfreetype6-dev libgnutls28-dev \
    libmp3lame-dev libnuma-dev libopus-dev \
    libvorbis-dev libvpx-dev libwebp-dev \
    libx264-dev libx265-dev libxml2-dev \
    zlib1g-dev libtheora-dev \
    2>/dev/null || true

# Try optional packages (may fail on some systems)
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    libfdk-aac-dev libsrt-gnutls-dev libaom-dev libdav1d-dev \
    2>/dev/null || echo "Some optional codec packages not available"

echo ""
echo "=== Checking current FFmpeg version ==="
if command -v ffmpeg &> /dev/null; then
    CURRENT_VERSION=\$(ffmpeg -version 2>/dev/null | head -1 | awk '{print \$3}' | cut -d"-" -f1)
    echo "Current FFmpeg version: \${CURRENT_VERSION}"
else
    echo "FFmpeg not installed"
    CURRENT_VERSION="none"
fi

# Build FFmpeg from source
if [[ "\$CURRENT_VERSION" != "\$FFMPEG_VERSION"* ]]; then
    echo ""
    echo "=== Building FFmpeg \${FFMPEG_VERSION} from source ==="
    
    # Create build directory
    mkdir -p /tmp/ffmpeg-build
    cd /tmp/ffmpeg-build
    
    # Download FFmpeg source
    echo "Downloading FFmpeg \${FFMPEG_VERSION}..."
    wget -q "https://ffmpeg.org/releases/ffmpeg-\${FFMPEG_VERSION}.tar.xz" -O ffmpeg.tar.xz || \
    curl -sL "https://ffmpeg.org/releases/ffmpeg-\${FFMPEG_VERSION}.tar.xz" -o ffmpeg.tar.xz
    
    tar xf ffmpeg.tar.xz
    cd ffmpeg-\${FFMPEG_VERSION}
    
    echo "Configuring FFmpeg..."
    
    # Check which optional libraries are available
    FDK_AAC=""
    if pkg-config --exists fdk-aac 2>/dev/null || [ -f /usr/include/fdk-aac/aacenc_lib.h ]; then
        FDK_AAC="--enable-libfdk-aac"
    fi
    
    SRT=""
    if pkg-config --exists srt 2>/dev/null; then
        SRT="--enable-libsrt"
    fi
    
    AOM=""
    if pkg-config --exists aom 2>/dev/null; then
        AOM="--enable-libaom"
    fi
    
    DAV1D=""
    if pkg-config --exists dav1d 2>/dev/null; then
        DAV1D="--enable-libdav1d"
    fi
    
    ./configure \
        --prefix=/usr/local \
        --enable-gpl \
        --enable-gnutls \
        --enable-libass \
        --enable-libfreetype \
        --enable-libmp3lame \
        --enable-libopus \
        --enable-libvorbis \
        --enable-libvpx \
        --enable-libwebp \
        --enable-libx264 \
        --enable-libx265 \
        --enable-libxml2 \
        --enable-nonfree \
        --enable-version3 \
        --disable-debug \
        --disable-doc \
        --extra-cflags="-O2" \
        \$FDK_AAC \$SRT \$AOM \$DAV1D \
        2>&1 | tail -10
    
    echo ""
    echo "Building FFmpeg (this may take 10-30 minutes)..."
    make -j\$(nproc) 2>&1 | tail -3
    
    echo ""
    echo "Installing FFmpeg..."
    make install
    ldconfig
    
    # Update symlinks
    ln -sf /usr/local/bin/ffmpeg /usr/bin/ffmpeg 2>/dev/null || true
    ln -sf /usr/local/bin/ffprobe /usr/bin/ffprobe 2>/dev/null || true
    
    # Cleanup
    cd /
    rm -rf /tmp/ffmpeg-build
    
    echo ""
    echo "=== FFmpeg installation complete ==="
else
    echo "FFmpeg \${FFMPEG_VERSION} already installed, skipping build"
fi

ffmpeg -version 2>/dev/null | head -3 || echo "FFmpeg verification failed"

# Setup MaxMind GeoLite2 databases
echo ""
echo "=== Setting up MaxMind GeoLite2 databases ==="

mkdir -p "\${DATA_DIR}"

if [ -n "\${MAXMIND_LICENSE_KEY}" ]; then
    echo "Downloading GeoLite2 databases..."
    
    # Download Country database
    echo "  - Downloading GeoLite2-Country.mmdb..."
    curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=\${MAXMIND_LICENSE_KEY}&suffix=tar.gz" -o /tmp/GeoLite2-Country.tar.gz
    
    if [ -s /tmp/GeoLite2-Country.tar.gz ] && tar -tzf /tmp/GeoLite2-Country.tar.gz >/dev/null 2>&1; then
        tar -xzf /tmp/GeoLite2-Country.tar.gz -C /tmp
        find /tmp -name "GeoLite2-Country.mmdb" -exec mv {} "\${DATA_DIR}/" \;
        rm -f /tmp/GeoLite2-Country.tar.gz
        rm -rf /tmp/GeoLite2-Country_*
        echo "    ✓ GeoLite2-Country.mmdb installed"
    else
        echo "    ✗ Failed to download Country database"
    fi
    
    # Download City database
    echo "  - Downloading GeoLite2-City.mmdb..."
    curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=\${MAXMIND_LICENSE_KEY}&suffix=tar.gz" -o /tmp/GeoLite2-City.tar.gz
    
    if [ -s /tmp/GeoLite2-City.tar.gz ] && tar -tzf /tmp/GeoLite2-City.tar.gz >/dev/null 2>&1; then
        tar -xzf /tmp/GeoLite2-City.tar.gz -C /tmp
        find /tmp -name "GeoLite2-City.mmdb" -exec mv {} "\${DATA_DIR}/" \;
        rm -f /tmp/GeoLite2-City.tar.gz
        rm -rf /tmp/GeoLite2-City_*
        echo "    ✓ GeoLite2-City.mmdb installed"
    else
        echo "    ✗ Failed to download City database"
    fi
    
    echo ""
    echo "GeoLite2 databases installed:"
    ls -lh "\${DATA_DIR}"/*.mmdb 2>/dev/null || echo "  No databases found"
    
    # Create update script for weekly updates
    mkdir -p /opt/iptv-server/scripts
    cat > /opt/iptv-server/scripts/update-geolite2.sh << 'GEOEOF'
#!/bin/bash
LICENSE_KEY="${maxmind_key}"
DATA_DIR="/opt/iptv-server/data"
[ -z "\$LICENSE_KEY" ] && exit 1
mkdir -p "\${DATA_DIR}"
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=\${LICENSE_KEY}&suffix=tar.gz" -o /tmp/geo.tar.gz && tar -xzf /tmp/geo.tar.gz -C /tmp && find /tmp -name "GeoLite2-Country.mmdb" -exec mv {} "\${DATA_DIR}/" \;
curl -sL "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=\${LICENSE_KEY}&suffix=tar.gz" -o /tmp/geo.tar.gz && tar -xzf /tmp/geo.tar.gz -C /tmp && find /tmp -name "GeoLite2-City.mmdb" -exec mv {} "\${DATA_DIR}/" \;
rm -rf /tmp/GeoLite2-* /tmp/geo.tar.gz
echo "GeoLite2 updated: \$(date)"
GEOEOF
    chmod +x /opt/iptv-server/scripts/update-geolite2.sh
    
    # Add cron job for weekly updates
    (crontab -l 2>/dev/null | grep -v "update-geolite2"; echo "0 3 * * 0 /opt/iptv-server/scripts/update-geolite2.sh") | crontab -
    echo "Weekly GeoLite2 update scheduled (Sunday 3:00 AM)"
else
    echo "MaxMind license key not provided, skipping GeoLite2 download"
    echo "Set MAXMIND_LICENSE_KEY to enable GeoIP functionality"
fi

echo ""
echo "=== Verifying installation ==="
echo "FFmpeg: \$(ffmpeg -version 2>/dev/null | head -1 || echo 'not found')"
echo "FFprobe: \$(ffprobe -version 2>/dev/null | head -1 || echo 'not found')"
echo ""
echo "GeoLite2 databases:"
ls -lh "\${DATA_DIR}"/*.mmdb 2>/dev/null || echo "  (not installed)"
echo ""
echo "=== Container update complete! ==="
SCRIPT_CONTENT
    
    # Copy script to remote node and execute inside container
    sshpass -p "${password}" scp -o StrictHostKeyChecking=no "$update_script" "root@${node_ip}:/tmp/update-edge.sh"
    rm -f "$update_script"
    
    # Execute inside the LXC container
    sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" << REMOTE_EXEC
chmod +x /tmp/update-edge.sh
pct push ${container_id} /tmp/update-edge.sh /tmp/update-edge.sh
pct exec ${container_id} -- bash /tmp/update-edge.sh
pct exec ${container_id} -- rm -f /tmp/update-edge.sh
rm -f /tmp/update-edge.sh
echo ""
echo "=== Node ${node_name} container ${container_id} updated ==="
REMOTE_EXEC
    
    print_success "${node_name} container ${container_id} updated successfully"
    return 0
}

# Main script
print_header "Edge LXC Container Update - FFmpeg 7.1 + MaxMind GeoIP"

# Check for sshpass
if ! command -v sshpass &> /dev/null; then
    echo "Installing sshpass..."
    apt-get update && apt-get install -y sshpass
fi

# Parse arguments
SPECIFIC_NODE="${2:-}"

case "$MODE" in
    list)
        print_header "Listing LXC Containers on All Proxmox Nodes"
        for node_name in "${!NODES[@]}"; do
            if [ -n "$SPECIFIC_NODE" ] && [ "$SPECIFIC_NODE" != "$node_name" ]; then
                continue
            fi
            node_ip="${NODES[$node_name]}"
            password="${PASSWORDS[$node_name]}"
            list_containers "$node_name" "$node_ip" "$password"
        done
        exit 0
        ;;
    update|all)
        # Check for MaxMind license key
        if [ -z "${MAXMIND_LICENSE_KEY}" ]; then
            print_warning "MAXMIND_LICENSE_KEY not set. GeoIP databases will not be downloaded."
            echo "Get your free license key from: https://www.maxmind.com/en/geolite2/signup"
            echo ""
            read -p "Enter MaxMind license key (or press Enter to skip): " MAXMIND_LICENSE_KEY
        fi
        
        if [ "$MODE" = "all" ]; then
            print_header "Listing LXC Containers on All Proxmox Nodes"
            for node_name in "${!NODES[@]}"; do
                if [ -n "$SPECIFIC_NODE" ] && [ "$SPECIFIC_NODE" != "$node_name" ]; then
                    continue
                fi
                node_ip="${NODES[$node_name]}"
                password="${PASSWORDS[$node_name]}"
                list_containers "$node_name" "$node_ip" "$password"
            done
            echo ""
        fi
        ;;
    -h|--help|help)
        print_usage
        exit 0
        ;;
    *)
        print_error "Unknown command: $MODE"
        print_usage
        exit 1
        ;;
esac

# Process each node
SUCCESSFUL=0
FAILED=0

for node_name in "${!NODES[@]}"; do
    if [ -n "$SPECIFIC_NODE" ] && [ "$SPECIFIC_NODE" != "$node_name" ]; then
        continue
    fi
    
    node_ip="${NODES[$node_name]}"
    password="${PASSWORDS[$node_name]}"
    
    echo ""
    print_info "Processing node ${node_name} (${node_ip})..."
    
    # Test SSH connection
    if ! sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 "root@${node_ip}" "echo 'OK'" &>/dev/null; then
        print_error "Cannot connect to ${node_name} (${node_ip})"
        ((FAILED++))
        continue
    fi
    
    # Get container ID
    container_id=$(get_edge_container_id "$node_name" "$node_ip" "$password")
    
    if [ -z "$container_id" ]; then
        print_warning "No running LXC container found on ${node_name}"
        
        # Show available containers
        echo "Available containers:"
        sshpass -p "${password}" ssh -o StrictHostKeyChecking=no "root@${node_ip}" "pct list" 2>/dev/null
        
        read -p "Enter container ID to update (or press Enter to skip): " manual_id
        if [ -z "$manual_id" ]; then
            ((FAILED++))
            continue
        fi
        container_id="$manual_id"
    fi
    
    print_info "Found container ID: ${container_id}"
    
    if update_container "$node_name" "$node_ip" "$password" "$container_id" "$MAXMIND_LICENSE_KEY"; then
        ((SUCCESSFUL++))
    else
        ((FAILED++))
    fi
done

# Summary
echo ""
print_header "Update Summary"
echo -e "Successful: ${GREEN}${SUCCESSFUL}${NC}"
echo -e "Failed: ${RED}${FAILED}${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    print_success "All edge containers updated successfully!"
else
    print_warning "Some updates failed. Check the logs above."
fi
