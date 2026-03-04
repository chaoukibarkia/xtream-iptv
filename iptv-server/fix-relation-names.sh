#!/bin/bash

# Script to fix relation names in UserRoleAssignment model
SCHEMA_FILE="prisma/schema.prisma"

# Update the UserRoleAssignment model to use the correct relation name
sed -i 's/user           User @relation(fields: \[userId\], references: \[id\], onDelete: Cascade)/user           User @relation(fields: [userId], references: [id], onDelete: Cascade)/' "$SCHEMA_FILE"

# Also update the User model to use the correct relation name
sed -i 's/userRoleAssignments UserRoleAssignment\[\] @relation("RoleAssignments")/userRoleAssignments UserRoleAssignment[]/' "$SCHEMA_FILE"

echo "Fixed relation names in UserRoleAssignment model"