#!/bin/bash
#
# Download MaxMind GeoLite2 databases
# 
# Usage: ./download-geolite2.sh <LICENSE_KEY>
#
# Get your free license key from:
# https://www.maxmind.com/en/geolite2/signup
#

set -e

LICENSE_KEY="${1:-$MAXMIND_LICENSE_KEY}"
DATA_DIR="${2:-/opt/iptv-server/data}"

if [ -z "$LICENSE_KEY" ]; then
    echo "Error: MaxMind license key required"
    echo ""
    echo "Usage: $0 <LICENSE_KEY> [DATA_DIR]"
    echo ""
    echo "Get your free license key from:"
    echo "https://www.maxmind.com/en/geolite2/signup"
    exit 1
fi

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

echo "Downloading GeoLite2 Country database..."
curl -s -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${LICENSE_KEY}&suffix=tar.gz" -o GeoLite2-Country.tar.gz

echo "Downloading GeoLite2 City database..."
curl -s -L "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz" -o GeoLite2-City.tar.gz

echo "Extracting databases..."
tar -xzf GeoLite2-Country.tar.gz --strip-components=1 --wildcards "*/GeoLite2-Country.mmdb"
tar -xzf GeoLite2-City.tar.gz --strip-components=1 --wildcards "*/GeoLite2-City.mmdb"

echo "Cleaning up..."
rm -f GeoLite2-Country.tar.gz GeoLite2-City.tar.gz

echo ""
echo "GeoLite2 databases installed successfully!"
echo ""
echo "Country database: $DATA_DIR/GeoLite2-Country.mmdb"
echo "City database: $DATA_DIR/GeoLite2-City.mmdb"
echo ""
echo "Set these environment variables if using non-default paths:"
echo "  GEOLITE2_COUNTRY_PATH=$DATA_DIR/GeoLite2-Country.mmdb"
echo "  GEOLITE2_CITY_PATH=$DATA_DIR/GeoLite2-City.mmdb"
