#!/bin/bash

# Script to update User model with RBAC relationships
SCHEMA_FILE="prisma/schema.prisma"

# Create temporary file with updated User model
awk '
/^model User \{/,/^}$/ {
    # Inside User model
    if (/activationCodes ActivationCode\[\] @relation\("ActivationCodeCreator"\)/) {
        print $0
        print ""
        print "  // RBAC relations"
        print "  userRoleAssignments UserRoleAssignment[] @relation(\"RoleAssignments\")"
        print "  settingsAuditLogs   SettingsAuditLog[]"
        next
    }
}
{ print }
' "$SCHEMA_FILE" > temp_user_schema.prisma

# Replace original schema
mv temp_user_schema.prisma "$SCHEMA_FILE"

echo "Updated User model with RBAC relationships"