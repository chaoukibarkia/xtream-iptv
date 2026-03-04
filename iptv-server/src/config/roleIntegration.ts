// Integration example for adding role management routes to the IPTV server
// This file shows how to integrate the new RBAC system with the existing server

import { FastifyInstance } from 'fastify';
import { roleRoutes } from '../api/routes/roles.js';
import { Permissions } from '../api/middleware/permissions.js';
import { loadUserPermissions } from '../api/middleware/permissions.js';

/**
 * Register all RBAC-related routes with the Fastify server
 */
export async function registerRoleRoutes(server: FastifyInstance) {
  // Register role management routes under /admin prefix
  await server.register(roleRoutes, { prefix: '/admin' });
  
  console.log('✅ Role management routes registered');
}

/**
 * Apply permission middleware to existing admin routes
 */
export function applyPermissionsToExistingRoutes(server: FastifyInstance) {
  
  // User Management Routes
  server.addHook('preHandler', async (request, reply) => {
    // Only apply to admin routes
    if (request.url.startsWith('/admin/users')) {
      if (request.method === 'GET') {
        await Permissions.canReadUsers(request, reply);
      } else if (request.method === 'POST') {
        await Permissions.canCreateUsers(request, reply);
      } else if (request.method === 'PUT' || request.method === 'PATCH') {
        await Permissions.canUpdateUsers(request, reply);
      } else if (request.method === 'DELETE') {
        await Permissions.canDeleteUsers(request, reply);
      }
    }
    
    // Stream Management Routes
    if (request.url.startsWith('/admin/streams')) {
      if (request.method === 'GET') {
        await Permissions.canReadStreams(request, reply);
      } else if (request.method === 'POST') {
        await Permissions.canCreateStreams(request, reply);
      } else if (request.method === 'PUT' || request.method === 'PATCH') {
        await Permissions.canUpdateStreams(request, reply);
      } else if (request.method === 'DELETE') {
        await Permissions.canDeleteStreams(request, reply);
      }
    }
    
    // IPTV Line Management Routes
    if (request.url.startsWith('/admin/lines')) {
      if (request.method === 'GET') {
        await Permissions.canReadLines(request, reply);
      } else if (request.method === 'POST') {
        await Permissions.canCreateLines(request, reply);
      } else if (request.method === 'PUT' || request.method === 'PATCH') {
        await Permissions.canUpdateLines(request, reply);
      } else if (request.method === 'DELETE') {
        await Permissions.canDeleteLines(request, reply);
      }
    }
    
    // Settings Management Routes
    if (request.url.startsWith('/admin/settings')) {
      // More granular settings permissions can be applied here
      if (request.url.includes('/general')) {
        await Permissions.canManageGeneralSettings(request, reply);
      } else if (request.url.includes('/streaming')) {
        await Permissions.canManageStreamingSettings(request, reply);
      } else if (request.url.includes('/security')) {
        await Permissions.canManageSecuritySettings(request, reply);
      } else if (request.url.includes('/billing')) {
        await Permissions.canManageBillingSettings(request, reply);
      } else {
        // Default settings access
        await Permissions.canManageGeneralSettings(request, reply);
      }
    }
    
    // Reports and Logs
    if (request.url.startsWith('/admin/reports')) {
      await Permissions.canViewReports(request, reply);
    }
    
    if (request.url.startsWith('/admin/logs')) {
      await Permissions.canViewLogs(request, reply);
    }
    
    // Bouquets Management
    if (request.url.startsWith('/admin/bouquets')) {
      if (request.method === 'GET') {
        await Permissions.canReadBouquets(request, reply);
      } else if (request.method === 'POST') {
        await Permissions.canCreateBouquets(request, reply);
      } else if (request.method === 'PUT' || request.method === 'PATCH') {
        await Permissions.canUpdateBouquets(request, reply);
      } else if (request.method === 'DELETE') {
        await Permissions.canDeleteBouquets(request, reply);
      }
    }
  });
  
  // Add permissions to all requests for convenience in route handlers
  server.addHook('preHandler', loadUserPermissions);
  
  console.log('✅ Permission middleware applied to existing routes');
}

/**
 * Example usage in main server file:
 * 
 * import fastify from 'fastify';
 * import { registerRoleRoutes, applyPermissionsToExistingRoutes } from './src/config/roleIntegration.js';
 * 
 * const server = fastify();
 * 
 * // Register authentication middleware first
 * server.register(authPlugin);
 * 
 * // Register RBAC routes
 * await registerRoleRoutes(server);
 * 
 * // Apply permissions to existing routes
 * applyPermissionsToExistingRoutes(server);
 * 
 * // Start server
 * await server.listen({ port: 3000 });
 */