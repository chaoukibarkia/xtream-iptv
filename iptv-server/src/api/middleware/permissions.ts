import { FastifyRequest, FastifyReply } from 'fastify';
import { rbacService } from '../../services/rbac/RbacService.js';
import { logger } from '../../config/logger.js';

// Extend FastifyRequest to include user permissions
declare module 'fastify' {
  interface FastifyRequest {
    userPermissions?: {
      userId: number;
      roles: Array<{ id: number; name: string; displayName: string }>;
      permissions: string[];
    };
  }
}

/**
 * Load user permissions and attach to request
 */
export async function loadUserPermissions(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  if (!user?.id) {
    return;
  }

  try {
    request.userPermissions = await rbacService.getUserPermissions(user.id);
  } catch (error) {
    logger.error({ error, userId: user.id }, 'Failed to load user permissions');
  }
}

/**
 * Create a permission check middleware
 */
export function requirePermission(permission: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const hasPermission = await rbacService.hasPermission(user.id, permission);
    
    if (!hasPermission) {
      logger.warn({ userId: user.id, permission }, 'Permission denied');
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required permission: ${permission}` 
      });
    }
  };
}

/**
 * Create a middleware that requires any of the specified permissions
 */
export function requireAnyPermission(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const hasPermission = await rbacService.hasAnyPermission(user.id, permissions);
    
    if (!hasPermission) {
      logger.warn({ userId: user.id, permissions }, 'Permission denied');
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required permissions: ${permissions.join(' or ')}` 
      });
    }
  };
}

/**
 * Create a middleware that requires all of the specified permissions
 */
export function requireAllPermissions(permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const hasPermission = await rbacService.hasAllPermissions(user.id, permissions);
    
    if (!hasPermission) {
      logger.warn({ userId: user.id, permissions }, 'Permission denied');
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required permissions: ${permissions.join(' and ')}` 
      });
    }
  };
}

/**
 * Create a middleware that requires a specific role
 */
export function requireRole(roleName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (request as any).user;
    
    if (!user?.id) {
      return reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
    }

    const hasRole = await rbacService.hasRole(user.id, roleName);
    
    if (!hasRole) {
      logger.warn({ userId: user.id, roleName }, 'Role check failed');
      return reply.status(403).send({ 
        error: 'Forbidden', 
        message: `Missing required role: ${roleName}` 
      });
    }
  };
}

/**
 * Permission constants for easy reference
 */
export const PERMISSIONS = {
  // Users
  USERS_READ: 'users.read',
  USERS_CREATE: 'users.create',
  USERS_UPDATE: 'users.update',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE: 'users.manage',
  
  // Streams
  STREAMS_READ: 'streams.read',
  STREAMS_CREATE: 'streams.create',
  STREAMS_UPDATE: 'streams.update',
  STREAMS_DELETE: 'streams.delete',
  STREAMS_TEST: 'streams.test',
  STREAMS_MANAGE: 'streams.manage',
  
  // IPTV Lines
  LINES_READ: 'lines.read',
  LINES_CREATE: 'lines.create',
  LINES_UPDATE: 'lines.update',
  LINES_DELETE: 'lines.delete',
  LINES_MANAGE: 'lines.manage',
  
  // Bouquets
  BOUQUETS_READ: 'bouquets.read',
  BOUQUETS_CREATE: 'bouquets.create',
  BOUQUETS_UPDATE: 'bouquets.update',
  BOUQUETS_DELETE: 'bouquets.delete',
  BOUQUETS_MANAGE: 'bouquets.manage',
  
  // Categories
  CATEGORIES_READ: 'categories.read',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_DELETE: 'categories.delete',
  
  // Settings
  SETTINGS_GENERAL: 'settings.general',
  SETTINGS_STREAMING: 'settings.streaming',
  SETTINGS_SECURITY: 'settings.security',
  SETTINGS_BILLING: 'settings.billing',
  SETTINGS_MANAGE: 'settings.manage',
  
  // Credits
  CREDITS_READ: 'credits.read',
  CREDITS_MANAGE: 'credits.manage',
  CREDITS_TRANSFER: 'credits.transfer',
  
  // Servers
  SERVERS_READ: 'servers.read',
  SERVERS_CREATE: 'servers.create',
  SERVERS_UPDATE: 'servers.update',
  SERVERS_DELETE: 'servers.delete',
  SERVERS_MANAGE: 'servers.manage',
  
  // Reports & Logs
  REPORTS_VIEW: 'reports.view',
  LOGS_VIEW: 'logs.view',
  LOGS_MANAGE: 'logs.manage',
  
  // Roles
  ROLES_READ: 'roles.read',
  ROLES_CREATE: 'roles.create',
  ROLES_UPDATE: 'roles.update',
  ROLES_DELETE: 'roles.delete',
  ROLES_ASSIGN: 'roles.assign',
} as const;

/**
 * Helper object with pre-built permission checkers
 */
export const Permissions = {
  // Users
  canReadUsers: requireAnyPermission([PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE]),
  canCreateUsers: requireAnyPermission([PERMISSIONS.USERS_CREATE, PERMISSIONS.USERS_MANAGE]),
  canUpdateUsers: requireAnyPermission([PERMISSIONS.USERS_UPDATE, PERMISSIONS.USERS_MANAGE]),
  canDeleteUsers: requireAnyPermission([PERMISSIONS.USERS_DELETE, PERMISSIONS.USERS_MANAGE]),
  
  // Streams
  canReadStreams: requireAnyPermission([PERMISSIONS.STREAMS_READ, PERMISSIONS.STREAMS_MANAGE]),
  canCreateStreams: requireAnyPermission([PERMISSIONS.STREAMS_CREATE, PERMISSIONS.STREAMS_MANAGE]),
  canUpdateStreams: requireAnyPermission([PERMISSIONS.STREAMS_UPDATE, PERMISSIONS.STREAMS_MANAGE]),
  canDeleteStreams: requireAnyPermission([PERMISSIONS.STREAMS_DELETE, PERMISSIONS.STREAMS_MANAGE]),
  canTestStreams: requireAnyPermission([PERMISSIONS.STREAMS_TEST, PERMISSIONS.STREAMS_MANAGE]),
  
  // IPTV Lines
  canReadLines: requireAnyPermission([PERMISSIONS.LINES_READ, PERMISSIONS.LINES_MANAGE]),
  canCreateLines: requireAnyPermission([PERMISSIONS.LINES_CREATE, PERMISSIONS.LINES_MANAGE]),
  canUpdateLines: requireAnyPermission([PERMISSIONS.LINES_UPDATE, PERMISSIONS.LINES_MANAGE]),
  canDeleteLines: requireAnyPermission([PERMISSIONS.LINES_DELETE, PERMISSIONS.LINES_MANAGE]),
  
  // Bouquets
  canReadBouquets: requireAnyPermission([PERMISSIONS.BOUQUETS_READ, PERMISSIONS.BOUQUETS_MANAGE]),
  canCreateBouquets: requireAnyPermission([PERMISSIONS.BOUQUETS_CREATE, PERMISSIONS.BOUQUETS_MANAGE]),
  canUpdateBouquets: requireAnyPermission([PERMISSIONS.BOUQUETS_UPDATE, PERMISSIONS.BOUQUETS_MANAGE]),
  canDeleteBouquets: requireAnyPermission([PERMISSIONS.BOUQUETS_DELETE, PERMISSIONS.BOUQUETS_MANAGE]),
  
  // Settings
  canManageGeneralSettings: requireAnyPermission([PERMISSIONS.SETTINGS_GENERAL, PERMISSIONS.SETTINGS_MANAGE]),
  canManageStreamingSettings: requireAnyPermission([PERMISSIONS.SETTINGS_STREAMING, PERMISSIONS.SETTINGS_MANAGE]),
  canManageSecuritySettings: requireAnyPermission([PERMISSIONS.SETTINGS_SECURITY, PERMISSIONS.SETTINGS_MANAGE]),
  canManageBillingSettings: requireAnyPermission([PERMISSIONS.SETTINGS_BILLING, PERMISSIONS.SETTINGS_MANAGE]),
  
  // Credits
  canReadCredits: requireAnyPermission([PERMISSIONS.CREDITS_READ, PERMISSIONS.CREDITS_MANAGE]),
  canManageCredits: requirePermission(PERMISSIONS.CREDITS_MANAGE),
  canTransferCredits: requireAnyPermission([PERMISSIONS.CREDITS_TRANSFER, PERMISSIONS.CREDITS_MANAGE]),
  
  // Servers
  canReadServers: requireAnyPermission([PERMISSIONS.SERVERS_READ, PERMISSIONS.SERVERS_MANAGE]),
  canCreateServers: requireAnyPermission([PERMISSIONS.SERVERS_CREATE, PERMISSIONS.SERVERS_MANAGE]),
  canUpdateServers: requireAnyPermission([PERMISSIONS.SERVERS_UPDATE, PERMISSIONS.SERVERS_MANAGE]),
  canDeleteServers: requireAnyPermission([PERMISSIONS.SERVERS_DELETE, PERMISSIONS.SERVERS_MANAGE]),
  
  // Reports & Logs
  canViewReports: requirePermission(PERMISSIONS.REPORTS_VIEW),
  canViewLogs: requireAnyPermission([PERMISSIONS.LOGS_VIEW, PERMISSIONS.LOGS_MANAGE]),
  canManageLogs: requirePermission(PERMISSIONS.LOGS_MANAGE),
  
  // Roles
  canReadRoles: requireAnyPermission([PERMISSIONS.ROLES_READ, PERMISSIONS.ROLES_ASSIGN]),
  canCreateRoles: requirePermission(PERMISSIONS.ROLES_CREATE),
  canUpdateRoles: requirePermission(PERMISSIONS.ROLES_UPDATE),
  canDeleteRoles: requirePermission(PERMISSIONS.ROLES_DELETE),
  canAssignRoles: requirePermission(PERMISSIONS.ROLES_ASSIGN),
  
  // Super admin check
  isSuperAdmin: requireRole('SUPER_ADMIN'),
};