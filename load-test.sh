#!/bin/bash
# HLS Stream Load Tester
# Simulates multiple concurrent viewers for an HLS stream

STREAM_URL="${1:-https://s01.zz00.org/live/admin/admin123/15.m3u8}"
NUM_VIEWERS="${2:-50}"
DURATION="${3:-60}"
RAMP_UP="${4:-5}"

echo "========================================"
echo "  HLS Stream Load Tester"
echo "========================================"
echo "Stream URL: $STREAM_URL"
echo "Viewers: $NUM_VIEWERS"
echo "Duration: ${DURATION}s"
echo "Ramp-up: ${RAMP_UP}s"
echo "========================================"

# Arrays to track PIDs and stats
declare -a PIDS
declare -a BYTES_RECEIVED

# Cleanup function
cleanup() {
    echo ""
    echo "Stopping all viewers..."
    for pid in "${PIDS[@]}"; do
        kill $pid 2>/dev/null
    done
    
    # Calculate total bandwidth
    TOTAL_BYTES=0
    for bytes in "${BYTES_RECEIVED[@]}"; do
        TOTAL_BYTES=$((TOTAL_BYTES + bytes))
    done
    
    TOTAL_MB=$(echo "scale=2; $TOTAL_BYTES / 1048576" | bc)
    AVG_MBPS=$(echo "scale=2; ($TOTAL_BYTES * 8) / ($DURATION * 1000000)" | bc)
    
    echo ""
    echo "========================================"
    echo "  Load Test Results"
    echo "========================================"
    echo "Total data received: ${TOTAL_MB} MB"
    echo "Average bandwidth: ${AVG_MBPS} Mbps"
    echo "Viewers simulated: $NUM_VIEWERS"
    echo "========================================"
    
    exit 0
}

trap cleanup SIGINT SIGTERM

# Function to simulate a single viewer
simulate_viewer() {
    local viewer_id=$1
    local url=$2
    local duration=$3
    local tmpfile="/tmp/viewer_${viewer_id}_$$"
    
    # Fetch the playlist first
    local playlist=$(curl -s -L --max-time 5 "$url" 2>/dev/null)
    
    if [ -z "$playlist" ]; then
        echo "Viewer $viewer_id: Failed to fetch playlist"
        return 1
    fi
    
    # Extract base URL for segments
    local base_url=$(dirname "$url")
    
    # Track bytes received
    local bytes=0
    local start_time=$(date +%s)
    local segments_fetched=0
    
    while [ $(($(date +%s) - start_time)) -lt $duration ]; do
        # Re-fetch playlist to get new segments
        playlist=$(curl -s -L --max-time 3 "$url" 2>/dev/null)
        
        if [ -z "$playlist" ]; then
            sleep 1
            continue
        fi
        
        # Get the last segment from playlist
        local segment=$(echo "$playlist" | grep -E "\.ts$|\.ts\?" | tail -1)
        
        if [ -n "$segment" ]; then
            # Build full segment URL
            if [[ "$segment" == http* ]]; then
                segment_url="$segment"
            else
                segment_url="${base_url}/${segment}"
            fi
            
            # Fetch segment and count bytes
            local segment_bytes=$(curl -s -L --max-time 10 -o /dev/null -w '%{size_download}' "$segment_url" 2>/dev/null)
            bytes=$((bytes + segment_bytes))
            segments_fetched=$((segments_fetched + 1))
        fi
        
        # Wait for next segment (typical HLS segment is 2-6 seconds)
        sleep 2
    done
    
    echo "$bytes" > "$tmpfile"
    echo "Viewer $viewer_id: Finished (${segments_fetched} segments, $((bytes / 1024)) KB)"
}

# Start viewers with ramp-up
echo ""
echo "Starting viewers..."
DELAY=$(echo "scale=3; $RAMP_UP / $NUM_VIEWERS" | bc)

for i in $(seq 1 $NUM_VIEWERS); do
    simulate_viewer $i "$STREAM_URL" "$DURATION" &
    PIDS+=($!)
    echo "Started viewer $i/${NUM_VIEWERS}"
    sleep $DELAY
done

echo ""
echo "All $NUM_VIEWERS viewers started. Running for ${DURATION}s..."
echo "Press Ctrl+C to stop early."
echo ""

# Wait for duration
sleep $DURATION

# Collect results
echo ""
echo "Collecting results..."
for i in $(seq 1 $NUM_VIEWERS); do
    tmpfile="/tmp/viewer_${i}_$$"
    if [ -f "$tmpfile" ]; then
        bytes=$(cat "$tmpfile")
        BYTES_RECEIVED+=($bytes)
        rm -f "$tmpfile"
    fi
done

cleanup
