import { prisma } from '../../config/database.js';
import { redis } from '../../config/redis.js';
import { logger } from '../../config/logger.js';

const CACHE_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'rbac:';

export interface UserPermissions {
  userId: number;
  roles: Array<{
    id: number;
    name: string;
    displayName: string;
  }>;
  permissions: string[];
}

class RbacService {
  /**
   * Get all permissions for a user (with caching)
   */
  async getUserPermissions(userId: number): Promise<UserPermissions> {
    const cacheKey = `${CACHE_PREFIX}user:${userId}:permissions`;
    
    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get user's role assignments with permissions
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    // Aggregate roles and permissions
    const roles = assignments.map(a => ({
      id: a.role.id,
      name: a.role.name,
      displayName: a.role.displayName,
    }));

    const permissionSet = new Set<string>();
    for (const assignment of assignments) {
      if (assignment.role.isActive) {
        for (const rp of assignment.role.rolePermissions) {
          permissionSet.add(rp.permission.name);
        }
      }
    }

    const result: UserPermissions = {
      userId,
      roles,
      permissions: Array.from(permissionSet),
    };

    // Cache result
    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

    return result;
  }

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: number, permission: string): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return userPerms.permissions.includes(permission);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async hasAnyPermission(userId: number, permissions: string[]): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return permissions.some(p => userPerms.permissions.includes(p));
  }

  /**
   * Check if user has all of the specified permissions
   */
  async hasAllPermissions(userId: number, permissions: string[]): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return permissions.every(p => userPerms.permissions.includes(p));
  }

  /**
   * Check if user has a specific role
   */
  async hasRole(userId: number, roleName: string): Promise<boolean> {
    const userPerms = await this.getUserPermissions(userId);
    return userPerms.roles.some(r => r.name === roleName);
  }

  /**
   * Clear user permission cache
   */
  async clearUserCache(userId: number): Promise<void> {
    const cacheKey = `${CACHE_PREFIX}user:${userId}:permissions`;
    await redis.del(cacheKey);
  }

  /**
   * Clear all RBAC caches
   */
  async clearAllCache(): Promise<void> {
    const keys = await redis.keys(`${CACHE_PREFIX}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  // =====================
  // Role Management
  // =====================

  /**
   * Get all roles
   */
  async getRoles(options?: {
    includePermissions?: boolean;
    includeUserCount?: boolean;
    isActive?: boolean;
  }) {
    return prisma.role.findMany({
      where: options?.isActive !== undefined ? { isActive: options.isActive } : undefined,
      include: {
        rolePermissions: options?.includePermissions ? {
          include: { permission: true },
        } : false,
        _count: options?.includeUserCount ? {
          select: { userRoleAssignments: true },
        } : false,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: number) {
    return prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        _count: {
          select: { userRoleAssignments: true },
        },
      },
    });
  }

  /**
   * Get role by name
   */
  async getRoleByName(name: string) {
    return prisma.role.findUnique({
      where: { name },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  /**
   * Create a new role
   */
  async createRole(data: {
    name: string;
    displayName: string;
    description?: string;
    permissionIds?: number[];
  }) {
    const role = await prisma.role.create({
      data: {
        name: data.name,
        displayName: data.displayName,
        description: data.description,
        isSystem: false,
      },
    });

    // Assign permissions if provided
    if (data.permissionIds && data.permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: data.permissionIds.map(permissionId => ({
          roleId: role.id,
          permissionId,
        })),
      });
    }

    await this.clearAllCache();
    
    return this.getRoleById(role.id);
  }

  /**
   * Update a role
   */
  async updateRole(id: number, data: {
    displayName?: string;
    description?: string;
    isActive?: boolean;
    permissionIds?: number[];
  }) {
    const role = await prisma.role.findUnique({ where: { id } });
    
    if (!role) {
      throw new Error('Role not found');
    }

    // Update role data
    await prisma.role.update({
      where: { id },
      data: {
        displayName: data.displayName,
        description: data.description,
        isActive: data.isActive,
      },
    });

    // Update permissions if provided
    if (data.permissionIds !== undefined) {
      // Remove existing permissions
      await prisma.rolePermission.deleteMany({
        where: { roleId: id },
      });

      // Add new permissions
      if (data.permissionIds.length > 0) {
        await prisma.rolePermission.createMany({
          data: data.permissionIds.map(permissionId => ({
            roleId: id,
            permissionId,
          })),
        });
      }
    }

    await this.clearAllCache();
    
    return this.getRoleById(id);
  }

  /**
   * Delete a role (only non-system roles)
   */
  async deleteRole(id: number) {
    const role = await prisma.role.findUnique({ where: { id } });
    
    if (!role) {
      throw new Error('Role not found');
    }

    if (role.isSystem) {
      throw new Error('Cannot delete system role');
    }

    await prisma.role.delete({ where: { id } });
    await this.clearAllCache();
    
    return { success: true };
  }

  // =====================
  // Permission Management
  // =====================

  /**
   * Get all permissions
   */
  async getPermissions(options?: {
    resource?: string;
    action?: string;
    category?: string;
  }) {
    return prisma.permission.findMany({
      where: {
        resource: options?.resource,
        action: options?.action,
        category: options?.category,
      },
      orderBy: [{ category: 'asc' }, { resource: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * Get permissions grouped by category
   */
  async getPermissionsGrouped() {
    const permissions = await this.getPermissions();
    
    const grouped: Record<string, typeof permissions> = {};
    for (const perm of permissions) {
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push(perm);
    }
    
    return grouped;
  }

  // =====================
  // User Role Assignment
  // =====================

  /**
   * Assign a role to a user
   */
  async assignRole(userId: number, roleId: number, assignedBy?: number) {
    // Check if assignment already exists
    const existing = await prisma.userRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId, roleId },
      },
    });

    if (existing) {
      throw new Error('User already has this role');
    }

    const assignment = await prisma.userRoleAssignment.create({
      data: {
        userId,
        roleId,
        assignedBy,
      },
      include: {
        role: true,
        user: { select: { id: true, username: true } },
      },
    });

    await this.clearUserCache(userId);
    
    return assignment;
  }

  /**
   * Remove a role from a user
   */
  async removeRole(userId: number, roleId: number) {
    const assignment = await prisma.userRoleAssignment.findUnique({
      where: {
        userId_roleId: { userId, roleId },
      },
      include: { role: true },
    });

    if (!assignment) {
      throw new Error('User does not have this role');
    }

    await prisma.userRoleAssignment.delete({
      where: {
        userId_roleId: { userId, roleId },
      },
    });

    await this.clearUserCache(userId);
    
    return { success: true };
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userId: number) {
    return prisma.userRoleAssignment.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
        assignedByUser: {
          select: { id: true, username: true },
        },
      },
    });
  }

  /**
   * Get all users with a specific role
   */
  async getRoleUsers(roleId: number) {
    return prisma.userRoleAssignment.findMany({
      where: { roleId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            role: true,
          },
        },
      },
    });
  }

  /**
   * Bulk assign roles to users
   */
  async bulkAssignRoles(userIds: number[], roleIds: number[], assignedBy?: number) {
    const assignments: Array<{ userId: number; roleId: number; assignedBy?: number }> = [];
    
    for (const userId of userIds) {
      for (const roleId of roleIds) {
        // Check if already exists
        const existing = await prisma.userRoleAssignment.findUnique({
          where: { userId_roleId: { userId, roleId } },
        });
        
        if (!existing) {
          assignments.push({ userId, roleId, assignedBy });
        }
      }
    }

    if (assignments.length > 0) {
      await prisma.userRoleAssignment.createMany({ data: assignments });
      
      // Clear cache for affected users
      for (const userId of userIds) {
        await this.clearUserCache(userId);
      }
    }

    return { created: assignments.length };
  }

  // =====================
  // Audit Logging
  // =====================

  /**
   * Log a settings change
   */
  async logSettingsChange(data: {
    userId: number;
    settingKey: string;
    oldValue?: string;
    newValue?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    return prisma.settingsAuditLog.create({ data });
  }

  /**
   * Get settings audit log
   */
  async   getSettingsAuditLog(options?: {
    userId?: number;
    settingKey?: string;
    limit?: number;
    offset?: number;
  }) {
    return prisma.settingsAuditLog.findMany({
      where: {
        userId: options?.userId,
        settingKey: options?.settingKey,
      },
      include: {
        user: { select: { id: true, username: true } },
      },
      orderBy: { timestamp: 'desc' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });
  }

  /**
   * Seed default permissions and roles
   */
  async seedPermissionsAndRoles() {
    logger.info('🔐 Seeding RBAC data...');

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
          'credits.read',
        ],
      },
    ];

    // Create permissions
    logger.info('📝 Creating permissions...');
    for (const perm of permissions) {
      await prisma.permission.upsert({
        where: { name: perm.name },
        update: perm,
        create: perm,
      });
    }
    logger.info({ count: permissions.length }, '✅ Created permissions');

    // Create roles and assign permissions
    logger.info('👥 Creating roles...');
    for (const role of roles) {
      const { permissions: permNames, ...roleData } = role;
      
      // Create or update the role
      const createdRole = await prisma.role.upsert({
        where: { name: roleData.name },
        update: roleData,
        create: roleData,
      });

      // Get permission IDs
      const perms = await prisma.permission.findMany({
        where: { name: { in: permNames } },
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
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: createdRole.id,
                permissionId: perm.id,
              },
            },
            update: {},
            create: {
              roleId: createdRole.id,
              permissionId: perm.id,
            },
          });
        }
      }

      logger.info({ role: role.displayName, count: perms.length }, '✅ Role created with permissions');
    }

    // Assign SUPER_ADMIN role to existing admin users
    logger.info('👤 Assigning roles to existing users...');
    const superAdminRole = await prisma.role.findUnique({ where: { name: 'SUPER_ADMIN' } });
    const adminRole = await prisma.role.findUnique({ where: { name: 'ADMIN' } });
    const resellerRole = await prisma.role.findUnique({ where: { name: 'RESELLER' } });
    const subResellerRole = await prisma.role.findUnique({ where: { name: 'SUB_RESELLER' } });

    if (superAdminRole && adminRole && resellerRole && subResellerRole) {
      // Get all users
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
          logger.info({ username: user.username }, '✅ User assigned role');
        }
      }
    }

    // Get summary
    const permCount = await prisma.permission.count();
    const roleCount = await prisma.role.count();
    const assignmentCount = await prisma.userRoleAssignment.count();
    
    logger.info({ permissions: permCount, roles: roleCount, assignments: assignmentCount }, '🎉 RBAC seeding completed');

    return {
      permissions: permCount,
      roles: roleCount,
      assignments: assignmentCount,
    };
  }
}

export const rbacService = new RbacService();