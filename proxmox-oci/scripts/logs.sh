#!/bin/bash
# ============================================
# IPTV System - Logs Viewer
# ============================================

SERVICE="${1:-backend}"

echo "============================================"
echo "IPTV System - Logs (${SERVICE})"
echo "============================================"
echo ""

case "$SERVICE" in
    backend)
        echo "Backend logs (Ctrl+C to exit):"
        journalctl -u iptv-backend.service -f
        ;;
    frontend)
        echo "Frontend logs (Ctrl+C to exit):"
        journalctl -u iptv-frontend.service -f
        ;;
    postgres)
        echo "PostgreSQL logs (Ctrl+C to exit):"
        journalctl -u iptv-postgres.service -f
        ;;
    redis)
        echo "Redis logs (Ctrl+C to exit):"
        journalctl -u iptv-redis.service -f
        ;;
    pod)
        echo "Pod logs (Ctrl+C to exit):"
        journalctl -u iptv-pod.service -f
        ;;
    all)
        echo "All logs (Ctrl+C to exit):"
        journalctl -u "iptv-*" -f
        ;;
    *)
        echo "Usage: $0 [backend|frontend|postgres|redis|pod|all]"
        echo ""
        echo "Examples:"
        echo "  $0 backend   # View backend logs"
        echo "  $0 all       # View all service logs"
        exit 1
        ;;
esac
