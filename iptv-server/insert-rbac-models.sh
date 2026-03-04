#!/bin/bash

# Script to insert RBAC models into Prisma schema
SCHEMA_FILE="prisma/schema.prisma"
RBAC_FILE="rbac-models.prisma"
BACKUP_FILE="prisma/schema.prisma.backup"

# Create backup if not exists
if [ ! -f "$BACKUP_FILE" ]; then
    cp "$SCHEMA_FILE" "$BACKUP_FILE"
    echo "Created backup: $BACKUP_FILE"
fi

# Find the line number where IptvLine model starts
IPTV_LINE=$(grep -n "^model IptvLine" "$SCHEMA_FILE" | cut -d: -f1)

if [ -z "$IPTV_LINE" ]; then
    echo "Error: Could not find 'model IptvLine' in schema file"
    exit 1
fi

echo "Found IptvLine model at line $IPTV_LINE"

# Insert RBAC models before IptvLine model
# We need to insert after the User model ends (before line $IPTV_LINE)
head -n $((IPTV_LINE - 1)) "$SCHEMA_FILE" > temp_schema.prisma
echo "" >> temp_schema.prisma
cat "$RBAC_FILE" >> temp_schema.prisma
echo "" >> temp_schema.prisma
tail -n +$IPTV_LINE "$SCHEMA_FILE" >> temp_schema.prisma

# Replace original schema
mv temp_schema.prisma "$SCHEMA_FILE"

echo "Successfully inserted RBAC models into $SCHEMA_FILE"

# Clean up temporary file
rm -f "$RBAC_FILE"