#!/bin/bash

# Script to properly insert RBAC models into Prisma schema
SCHEMA_FILE="prisma/schema.prisma"

# Find the line number where IptvLine model starts
IPTV_LINE=$(grep -n "^model IptvLine" "$SCHEMA_FILE" | cut -d: -f1)

if [ -z "$IPTV_LINE" ]; then
    echo "Error: Could not find 'model IptvLine' in schema file"
    exit 1
fi

echo "Found IptvLine model at line $IPTV_LINE"

# Create temporary file with RBAC models
cat > rbac_models_temp.prisma << 'EOF'

// Role-Based Access Control Models

model Role {
  id          Int     @id @default(autoincrement())
  name        String  @unique
  displayName String
  description String?
  isSystem    Boolean @default(false)  // System roles (Admin, Reseller) can't be deleted
  isActive    Boolean @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  userRoleAssignments UserRoleAssignment[]
  rolePermissions     RolePermission[]
  
  @@index([name])
  @@index([isActive])
}

model Permission {
  id          Int     @id @default(autoincrement())
  name        String  @unique
  displayName String
  description String?
  resource    String  // 'users', 'streams', 'settings', 'lines', etc.
  action      String  // 'read', 'write', 'delete', 'manage', etc.
  category    String  // 'general', 'billing', 'technical', 'security', etc.
  createdAt   DateTime @default(now())
  
  // Relations
  rolePermissions RolePermission[]
  
  @@index([resource, action])
  @@index([category])
}

model RolePermission {
  roleId       Int     @map("role_id")
  permissionId Int     @map("permission_id")
  createdAt    DateTime @default(now()) @map("created_at")
  
  // Relations
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  
  @@id([roleId, permissionId])
  @@index([roleId])
  @@index([permissionId])
}

model UserRoleAssignment {
  userId     Int       @map("user_id")
  roleId     Int       @map("role_id")
  assignedAt DateTime  @default(now()) @map("assigned_at")
  assignedBy Int?      @map("assigned_by")
  
  // Relations
  user           User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role           Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  assignedByUser User? @relation("RoleAssignments", fields: [assignedBy], references: [id])
  
  @@id([userId, roleId])
  @@index([userId])
  @@index([roleId])
  @@index([assignedBy])
}

model SettingsAuditLog {
  id         Int      @id @default(autoincrement())
  userId     Int      @map("user_id")
  settingKey String   @map("setting_key")
  oldValue   String?  @map("old_value")
  newValue   String?  @map("new_value")
  timestamp  DateTime @default(now())
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  
  // Relations
  user       User     @relation(fields: [userId], references: [id])
  
  @@index([userId])
  @@index([settingKey])
  @@index([timestamp])
}

EOF

# Insert RBAC models before IptvLine model
head -n $((IPTV_LINE - 1)) "$SCHEMA_FILE" > temp_schema.prisma
cat rbac_models_temp.prisma >> temp_schema.prisma
tail -n +$IPTV_LINE "$SCHEMA_FILE" >> temp_schema.prisma

# Replace original schema
mv temp_schema.prisma "$SCHEMA_FILE"

# Clean up
rm -f rbac_models_temp.prisma

echo "Successfully inserted RBAC models into $SCHEMA_FILE"