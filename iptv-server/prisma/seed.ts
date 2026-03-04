import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==================== RBAC DATA ====================

// Define all permissions
const permissions = [
  // Users
  { name: 'users.read', displayName: 'View Users', description: 'Can view user list and details', resource: 'users', action: 'read', category: 'admin' },
  { name: 'users.create', displayName: 'Create Users', description: 'Can create new users', resource: 'users', action: 'create', category: 'admin' },
  { name: 'users.update', displayName: 'Update Users', description: 'Can edit user information', resource: 'users', action: 'update', category: 'admin' },
  { name: 'users.delete', displayName: 'Delete Users', description: 'Can delete users', resource: 'users', action: 'delete', category: 'admin' },
  { name: 'users.manage', displayName: 'Manage Users', description: 'Full user management access', resource: 'users', action: 'manage', category: 'admin' },
  
  // Streams
  { name: 'streams.read', displayName: 'View Streams', description: 'Can view stream list and details', resource: 'streams', action: 'read', category: 'technical' },
  { name: 'streams.create', displayName: 'Create Streams', description: 'Can create new streams', resource: 'streams', action: 'create', category: 'technical' },
  { name: 'streams.update', displayName: 'Update Streams', description: 'Can edit stream information', resource: 'streams', action: 'update', category: 'technical' },
  { name: 'streams.delete', displayName: 'Delete Streams', description: 'Can delete streams', resource: 'streams', action: 'delete', category: 'technical' },
  { name: 'streams.test', displayName: 'Test Streams', description: 'Can test stream sources', resource: 'streams', action: 'test', category: 'technical' },
  { name: 'streams.manage', displayName: 'Manage Streams', description: 'Full stream management access', resource: 'streams', action: 'manage', category: 'technical' },
  
  // IPTV Lines
  { name: 'lines.read', displayName: 'View Lines', description: 'Can view IPTV lines', resource: 'lines', action: 'read', category: 'general' },
  { name: 'lines.create', displayName: 'Create Lines', description: 'Can create IPTV lines', resource: 'lines', action: 'create', category: 'general' },
  { name: 'lines.update', displayName: 'Update Lines', description: 'Can edit IPTV lines', resource: 'lines', action: 'update', category: 'general' },
  { name: 'lines.delete', displayName: 'Delete Lines', description: 'Can delete IPTV lines', resource: 'lines', action: 'delete', category: 'general' },
  { name: 'lines.manage', displayName: 'Manage Lines', description: 'Full IPTV line management', resource: 'lines', action: 'manage', category: 'general' },
  
  // Bouquets
  { name: 'bouquets.read', displayName: 'View Bouquets', description: 'Can view bouquets', resource: 'bouquets', action: 'read', category: 'general' },
  { name: 'bouquets.create', displayName: 'Create Bouquets', description: 'Can create bouquets', resource: 'bouquets', action: 'create', category: 'general' },
  { name: 'bouquets.update', displayName: 'Update Bouquets', description: 'Can edit bouquets', resource: 'bouquets', action: 'update', category: 'general' },
  { name: 'bouquets.delete', displayName: 'Delete Bouquets', description: 'Can delete bouquets', resource: 'bouquets', action: 'delete', category: 'general' },
  { name: 'bouquets.manage', displayName: 'Manage Bouquets', description: 'Full bouquet management', resource: 'bouquets', action: 'manage', category: 'general' },
  
  // Categories
  { name: 'categories.read', displayName: 'View Categories', description: 'Can view categories', resource: 'categories', action: 'read', category: 'general' },
  { name: 'categories.create', displayName: 'Create Categories', description: 'Can create categories', resource: 'categories', action: 'create', category: 'general' },
  { name: 'categories.update', displayName: 'Update Categories', description: 'Can edit categories', resource: 'categories', action: 'update', category: 'general' },
  { name: 'categories.delete', displayName: 'Delete Categories', description: 'Can delete categories', resource: 'categories', action: 'delete', category: 'general' },
  
  // Settings
  { name: 'settings.general', displayName: 'General Settings', description: 'Can manage general settings', resource: 'settings', action: 'general', category: 'admin' },
  { name: 'settings.streaming', displayName: 'Streaming Settings', description: 'Can manage streaming settings', resource: 'settings', action: 'streaming', category: 'technical' },
  { name: 'settings.security', displayName: 'Security Settings', description: 'Can manage security settings', resource: 'settings', action: 'security', category: 'security' },
  { name: 'settings.billing', displayName: 'Billing Settings', description: 'Can manage billing settings', resource: 'settings', action: 'billing', category: 'billing' },
  { name: 'settings.manage', displayName: 'Manage All Settings', description: 'Full settings access', resource: 'settings', action: 'manage', category: 'admin' },
  
  // Credits
  { name: 'credits.read', displayName: 'View Credits', description: 'Can view credit balances', resource: 'credits', action: 'read', category: 'billing' },
  { name: 'credits.manage', displayName: 'Manage Credits', description: 'Can add/deduct credits', resource: 'credits', action: 'manage', category: 'billing' },
  { name: 'credits.transfer', displayName: 'Transfer Credits', description: 'Can transfer credits between users', resource: 'credits', action: 'transfer', category: 'billing' },
  
  // Servers
  { name: 'servers.read', displayName: 'View Servers', description: 'Can view server list', resource: 'servers', action: 'read', category: 'technical' },
  { name: 'servers.create', displayName: 'Create Servers', description: 'Can add new servers', resource: 'servers', action: 'create', category: 'technical' },
  { name: 'servers.update', displayName: 'Update Servers', description: 'Can edit servers', resource: 'servers', action: 'update', category: 'technical' },
  { name: 'servers.delete', displayName: 'Delete Servers', description: 'Can delete servers', resource: 'servers', action: 'delete', category: 'technical' },
  { name: 'servers.manage', displayName: 'Manage Servers', description: 'Full server management', resource: 'servers', action: 'manage', category: 'technical' },
  
  // Reports & Logs
  { name: 'reports.view', displayName: 'View Reports', description: 'Can view reports and analytics', resource: 'reports', action: 'read', category: 'admin' },
  { name: 'logs.view', displayName: 'View Logs', description: 'Can view system logs', resource: 'logs', action: 'read', category: 'admin' },
  { name: 'logs.manage', displayName: 'Manage Logs', description: 'Can clear/export logs', resource: 'logs', action: 'manage', category: 'admin' },
  
  // Roles (meta permissions)
  { name: 'roles.read', displayName: 'View Roles', description: 'Can view roles', resource: 'roles', action: 'read', category: 'security' },
  { name: 'roles.create', displayName: 'Create Roles', description: 'Can create roles', resource: 'roles', action: 'create', category: 'security' },
  { name: 'roles.update', displayName: 'Update Roles', description: 'Can edit roles', resource: 'roles', action: 'update', category: 'security' },
  { name: 'roles.delete', displayName: 'Delete Roles', description: 'Can delete roles', resource: 'roles', action: 'delete', category: 'security' },
  { name: 'roles.assign', displayName: 'Assign Roles', description: 'Can assign roles to users', resource: 'roles', action: 'assign', category: 'security' },
];

// Define system roles with their permissions
const roles = [
  {
    name: 'SUPER_ADMIN',
    displayName: 'Super Administrator',
    description: 'Full system access with all permissions',
    isSystem: true,
    permissions: permissions.map(p => p.name), // All permissions
  },
  {
    name: 'ADMIN',
    displayName: 'Administrator',
    description: 'Administrative access without role management',
    isSystem: true,
    permissions: permissions
      .filter(p => !p.name.startsWith('roles.') || p.name === 'roles.read')
      .map(p => p.name),
  },
  {
    name: 'RESELLER',
    displayName: 'Reseller',
    description: 'Can manage IPTV lines and view streams',
    isSystem: true,
    permissions: [
      'lines.read', 'lines.create', 'lines.update', 'lines.delete',
      'bouquets.read',
      'categories.read',
      'streams.read',
      'credits.read',
      'reports.view',
    ],
  },
  {
    name: 'SUB_RESELLER',
    displayName: 'Sub-Reseller',
    description: 'Limited reseller with restricted access',
    isSystem: true,
    permissions: [
      'lines.read', 'lines.create', 'lines.update',
      'bouquets.read',
      'categories.read',
      'streams.read',
      'credits.read',
    ],
  },
];

async function main() {
  console.log('🔐 Seeding RBAC (Roles and Permissions)...\n');

  // Create permissions
  console.log('📝 Creating permissions...');
  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: perm,
      create: perm,
    });
  }
  console.log(`✅ Created ${permissions.length} permissions\n`);

  // Create roles and assign permissions
  console.log('👥 Creating roles...');
  for (const role of roles) {
    const { permissions: permNames, ...roleData } = role;
    
    // Create or update the role
    const createdRole = await prisma.role.upsert({
      where: { name: roleData.name },
      update: roleData,
      create: roleData,
    });

    // Clear existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId: createdRole.id },
    });

    // Assign permissions to role
    for (const permName of permNames) {
      const perm = await prisma.permission.findUnique({
        where: { name: permName },
      });
      if (perm) {
        await prisma.rolePermission.create({
          data: {
            roleId: createdRole.id,
            permissionId: perm.id,
          },
        });
      }
    }

    console.log(`  ✅ ${role.displayName}: ${permNames.length} permissions`);
  }

  // Assign roles to existing users based on their legacy role field
  console.log('\n👤 Assigning roles to existing users...');
  const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
  const resellerRole = await prisma.role.findUnique({ where: { name: 'RESELLER' } });
  const subResellerRole = await prisma.role.findUnique({ where: { name: 'SUB_RESELLER' } });

  if (superAdminRole && resellerRole && subResellerRole) {
    const users = await prisma.user.findMany();
    
    for (const user of users) {
      let targetRoleId: number;
      
      // Map legacy role to new RBAC role
      switch (user.role) {
        case 'ADMIN':
          targetRoleId = superAdminRole.id;
          break;
        case 'RESELLER':
          targetRoleId = resellerRole.id;
          break;
        case 'SUB_RESELLER':
          targetRoleId = subResellerRole.id;
          break;
        default:
          targetRoleId = resellerRole.id;
      }

      // Check if assignment exists
      const existing = await prisma.userRoleAssignment.findUnique({
        where: {
          userId_roleId: {
            userId: user.id,
            roleId: targetRoleId,
          },
        },
      });

      if (!existing) {
        await prisma.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: targetRoleId,
          },
        });
        console.log(`  ✅ ${user.username}: assigned role`);
      } else {
        console.log(`  ⏭️  ${user.username}: already has role`);
      }
    }
  }

  // Print summary
  const permCount = await prisma.permission.count();
  const roleCount = await prisma.role.count();
  const assignmentCount = await prisma.userRoleAssignment.count();
  
  console.log('\n🎉 RBAC seeding completed!');
  console.log('\n📊 Summary:');
  console.log(`   Permissions: ${permCount}`);
  console.log(`   Roles: ${roleCount}`);
  console.log(`   User Assignments: ${assignmentCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
