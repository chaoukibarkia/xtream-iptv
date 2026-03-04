#!/bin/bash
# Port Forwarding Setup for IPTV LXC Containers
# Run this on the Proxmox host

set -e

PROXY_IP="10.10.0.14"
NETWORK="10.10.0.0/24"
INTERFACE="vmbr0"

echo "=== Setting up port forwarding ==="

# Enable IP forwarding
echo 1 > /proc/sys/net/ipv4/ip_forward
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf 2>/dev/null || true

# Clear existing IPTV rules (if any)
iptables -t nat -D PREROUTING -i $INTERFACE -p tcp --dport 80 -j DNAT --to $PROXY_IP:80 2>/dev/null || true
iptables -t nat -D PREROUTING -i $INTERFACE -p tcp --dport 443 -j DNAT --to $PROXY_IP:443 2>/dev/null || true

# Add port forwarding rules
echo "Adding port 80 forwarding..."
iptables -t nat -A PREROUTING -i $INTERFACE -p tcp --dport 80 -j DNAT --to $PROXY_IP:80

echo "Adding port 443 forwarding..."
iptables -t nat -A PREROUTING -i $INTERFACE -p tcp --dport 443 -j DNAT --to $PROXY_IP:443

# Add masquerading for return traffic
iptables -t nat -C POSTROUTING -s $NETWORK -o $INTERFACE -j MASQUERADE 2>/dev/null || \
    iptables -t nat -A POSTROUTING -s $NETWORK -o $INTERFACE -j MASQUERADE

echo "=== Port forwarding configured ==="
echo ""
echo "HTTP  (80)  -> $PROXY_IP:80"
echo "HTTPS (443) -> $PROXY_IP:443"
echo ""

# Make rules persistent
if command -v netfilter-persistent &> /dev/null; then
    netfilter-persistent save
    echo "Rules saved with netfilter-persistent"
elif [ -f /etc/iptables/rules.v4 ]; then
    iptables-save > /etc/iptables/rules.v4
    echo "Rules saved to /etc/iptables/rules.v4"
else
    echo "WARNING: iptables-persistent not installed"
    echo "Install with: apt install iptables-persistent"
    echo "Or manually save rules to restore on reboot"
fi
