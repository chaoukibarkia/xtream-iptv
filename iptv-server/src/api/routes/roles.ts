import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { rbacService } from '../../services/rbac/RbacService.js';
import { requirePermission, requireAnyPermission, PERMISSIONS } from '../middleware/permissions.js';
import { logger } from '../../config/logger.js';
import { config } from '../../config/index.js';
import crypto from 'crypto';

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Admin API key authentication middleware
 */
async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'];
  if (!apiKey || typeof apiKey !== 'string') {
    logger.warn({ ip: request.ip }, 'Admin API request without API key');
    return reply.status(401).send({ error: 'API key required' });
  }

  // Validate API key using timing-safe comparison
  if (!secureCompare(apiKey, config.admin.apiKey)) {
    logger.warn({ ip: request.ip }, 'Admin API request with invalid API key');
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  // For RBAC, we need to identify the user - for now use admin user
  // In production, this should be based on JWT or session
  const { prisma } = await import('../../config/database.js');
  const adminUser = await prisma.user.findFirst({
    where: { role: 'ADMIN' },
  });
  
  if (adminUser) {
    (request as any).user = { id: adminUser.id, username: adminUser.username, role: adminUser.role };
  }
}

// Validation schemas
const createRoleSchema = z.object({
  name: z.string().min(2).max(50).regex(/^[A-Z_]+$/, 'Name must be uppercase with underscores'),
  displayName: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
});

const updateRoleSchema = z.object({
  displayName: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.number().int().positive()).optional(),
});

const assignRoleSchema = z.object({
  userId: z.number().int().positive(),
  roleId: z.number().int().positive(),
});

const bulkAssignSchema = z.object({
  userIds: z.array(z.number().int().positive()).min(1),
  roleIds: z.array(z.number().int().positive()).min(1),
});

export async function roleRoutes(fastify: FastifyInstance) {
  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticateAdmin);

  // =====================
  // Role Management
  // =====================

  // GET /roles - List all roles
  fastify.get('/roles', {
    preHandler: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      includePermissions?: string;
      includeUserCount?: string;
      isActive?: string;
    };

    const roles = await rbacService.getRoles({
      includePermissions: query.includePermissions === 'true',
      includeUserCount: query.includeUserCount === 'true',
      isActive: query.isActive !== undefined ? query.isActive === 'true' : undefined,
    });

    // Transform role permissions for response
    const transformedRoles = roles.map(role => ({
      ...role,
      permissions: (role as any).rolePermissions?.map((rp: any) => rp.permission) || undefined,
      rolePermissions: undefined,
      userCount: (role as any)._count?.userRoleAssignments,
      _count: undefined,
    }));

    return { roles: transformedRoles };
  });

  // GET /roles/:id - Get role by ID
  fastify.get('/roles/:id', {
    preHandler: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    
    const role = await rbacService.getRoleById(parseInt(id));
    
    if (!role) {
      return reply.status(404).send({ error: 'Role not found' });
    }

    // Transform for response
    const transformedRole = {
      ...role,
      permissions: role.rolePermissions.map(rp => rp.permission),
      rolePermissions: undefined,
      userCount: role._count.userRoleAssignments,
      _count: undefined,
    };

    return { role: transformedRole };
  });

  // POST /roles - Create a new role
  fastify.post('/roles', {
    preHandler: requirePermission(PERMISSIONS.ROLES_CREATE),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = createRoleSchema.safeParse(request.body);
    
    if (!result.success) {
      return reply.status(400).send({ 
        error: 'Validation failed', 
        details: result.error.issues 
      });
    }

    try {
      const role = await rbacService.createRole(result.data);
      
      logger.info({ roleId: role?.id, roleName: result.data.name }, 'Role created');
      
      return reply.status(201).send({ role });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.status(409).send({ error: 'Role with this name already exists' });
      }
      throw error;
    }
  });

  // PUT /roles/:id - Update a role
  fastify.put('/roles/:id', {
    preHandler: requirePermission(PERMISSIONS.ROLES_UPDATE),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const result = updateRoleSchema.safeParse(request.body);
    
    if (!result.success) {
      return reply.status(400).send({ 
        error: 'Validation failed', 
        details: result.error.issues 
      });
    }

    try {
      const role = await rbacService.updateRole(parseInt(id), result.data);
      
      logger.info({ roleId: id }, 'Role updated');
      
      return { role };
    } catch (error: any) {
      if (error.message === 'Role not found') {
        return reply.status(404).send({ error: 'Role not found' });
      }
      throw error;
    }
  });

  // DELETE /roles/:id - Delete a role
  fastify.delete('/roles/:id', {
    preHandler: requirePermission(PERMISSIONS.ROLES_DELETE),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      await rbacService.deleteRole(parseInt(id));
      
      logger.info({ roleId: id }, 'Role deleted');
      
      return { success: true, message: 'Role deleted' };
    } catch (error: any) {
      if (error.message === 'Role not found') {
        return reply.status(404).send({ error: 'Role not found' });
      }
      if (error.message === 'Cannot delete system role') {
        return reply.status(403).send({ error: 'Cannot delete system role' });
      }
      throw error;
    }
  });

  // =====================
  // Permission Management
  // =====================

  // GET /permissions - List all permissions
  fastify.get('/permissions', {
    preHandler: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      resource?: string;
      action?: string;
      category?: string;
      grouped?: string;
    };

    if (query.grouped === 'true') {
      const grouped = await rbacService.getPermissionsGrouped();
      return { permissions: grouped };
    }

    const permissions = await rbacService.getPermissions({
      resource: query.resource,
      action: query.action,
      category: query.category,
    });

    return { permissions };
  });

  // =====================
  // User Role Assignments
  // =====================

  // GET /users/:userId/roles - Get roles for a user
  fastify.get('/users/:userId/roles', {
    preHandler: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_READ]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };

    const assignments = await rbacService.getUserRoles(parseInt(userId));
    
    // Transform for response
    const roles = assignments.map(a => ({
      ...a.role,
      permissions: a.role.rolePermissions.map(rp => rp.permission),
      rolePermissions: undefined,
      assignedAt: a.assignedAt,
      assignedBy: a.assignedByUser,
    }));

    return { roles };
  });

  // POST /users/:userId/roles - Assign a role to a user
  fastify.post('/users/:userId/roles', {
    preHandler: requirePermission(PERMISSIONS.ROLES_ASSIGN),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId } = request.params as { userId: string };
    const body = request.body as { roleId: number };
    const user = (request as any).user;

    if (!body.roleId) {
      return reply.status(400).send({ error: 'roleId is required' });
    }

    try {
      const assignment = await rbacService.assignRole(
        parseInt(userId),
        body.roleId,
        user?.id
      );
      
      logger.info({ userId, roleId: body.roleId, assignedBy: user?.id }, 'Role assigned to user');
      
      return reply.status(201).send({ assignment });
    } catch (error: any) {
      if (error.message === 'User already has this role') {
        return reply.status(409).send({ error: 'User already has this role' });
      }
      throw error;
    }
  });

  // DELETE /users/:userId/roles/:roleId - Remove a role from a user
  fastify.delete('/users/:userId/roles/:roleId', {
    preHandler: requirePermission(PERMISSIONS.ROLES_ASSIGN),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, roleId } = request.params as { userId: string; roleId: string };

    try {
      await rbacService.removeRole(parseInt(userId), parseInt(roleId));
      
      logger.info({ userId, roleId }, 'Role removed from user');
      
      return { success: true, message: 'Role removed from user' };
    } catch (error: any) {
      if (error.message === 'User does not have this role') {
        return reply.status(404).send({ error: 'User does not have this role' });
      }
      throw error;
    }
  });

  // POST /roles/bulk-assign - Bulk assign roles to users
  fastify.post('/roles/bulk-assign', {
    preHandler: requirePermission(PERMISSIONS.ROLES_ASSIGN),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = bulkAssignSchema.safeParse(request.body);
    
    if (!result.success) {
      return reply.status(400).send({ 
        error: 'Validation failed', 
        details: result.error.issues 
      });
    }

    const user = (request as any).user;
    const { created } = await rbacService.bulkAssignRoles(
      result.data.userIds,
      result.data.roleIds,
      user?.id
    );
    
    logger.info({ 
      userIds: result.data.userIds, 
      roleIds: result.data.roleIds, 
      created,
      assignedBy: user?.id 
    }, 'Bulk role assignment');

    return { success: true, created };
  });

  // GET /roles/:roleId/users - Get users with a specific role
  fastify.get('/roles/:roleId/users', {
    preHandler: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.USERS_READ]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { roleId } = request.params as { roleId: string };

    const assignments = await rbacService.getRoleUsers(parseInt(roleId));
    
    const users = assignments.map(a => a.user);

    return { users };
  });

  // =====================
  // Current User Permissions
  // =====================

  // GET /me/permissions - Get current user's permissions
  fastify.get('/me/permissions', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const permissions = await rbacService.getUserPermissions(user.id);
    
    return permissions;
  });

  // GET /me/can/:permission - Check if current user has a permission
  fastify.get('/me/can/:permission', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const { permission } = request.params as { permission: string };
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const hasPermission = await rbacService.hasPermission(user.id, permission);
    
    return { permission, hasPermission };
  });

  // =====================
  // Audit Log
  // =====================

  // GET /audit-log - Get settings audit log
  fastify.get('/audit-log', {
    preHandler: requireAnyPermission([PERMISSIONS.LOGS_VIEW, PERMISSIONS.SETTINGS_MANAGE]),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      userId?: string;
      settingKey?: string;
      limit?: string;
      offset?: string;
    };

    const logs = await rbacService.getSettingsAuditLog({
      userId: query.userId ? parseInt(query.userId) : undefined,
      settingKey: query.settingKey,
      limit: query.limit ? parseInt(query.limit) : 50,
      offset: query.offset ? parseInt(query.offset) : 0,
    });

    return { logs };
  });

  // POST /seed-permissions - Seed default permissions and roles
  fastify.post('/seed-permissions', {
    // Allow seeding without permission check (for initial setup)
    // preHandler: requirePermission(PERMISSIONS.ROLES_CREATE),
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await rbacService.seedPermissionsAndRoles();
      return {
        success: true,
        message: 'Default permissions and roles seeded successfully',
        ...result,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to seed permissions');
      return reply.status(500).send({
        error: 'Failed to seed permissions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}