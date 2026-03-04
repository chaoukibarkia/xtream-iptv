// Role-Based Access Control Types for Frontend

export interface Permission {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  resource: string;
  action: string;
  category: string;
  createdAt: string;
}

export interface Role {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  permissions?: Permission[];
  _count?: {
    userRoleAssignments: number;
    rolePermissions: number;
  };
}

export interface UserRoleAssignment {
  userId: number;
  roleId: number;
  assignedAt: string;
  assignedBy?: number;
  role?: {
    id: number;
    name: string;
    displayName: string;
    isSystem: boolean;
    isActive: boolean;
  };
  assignedByUser?: {
    id: number;
    username: string;
  };
}

export interface UserWithRoles {
  id: number;
  username: string;
  email?: string;
  role: string; // Legacy role for backward compatibility
  status: string;
  createdAt: string;
  lastActivity?: string;
  credits: number;
  roleAssignments: UserRoleAssignment[];
  effectivePermissions: Permission[];
}

// Permission resources
export const RESOURCES = {
  USERS: 'users',
  STREAMS: 'streams',
  SETTINGS: 'settings',
  LINES: 'lines',
  BOUQUETS: 'bouquets',
  CATEGORIES: 'categories',
  REPORTS: 'reports',
  LOGS: 'logs',
  CREDITS: 'credits',
  SERVERS: 'servers',
} as const;

export type ResourceType = typeof RESOURCES[keyof typeof RESOURCES];

// Permission actions
export const ACTIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  MANAGE: 'manage',
  CREATE: 'create',
  UPDATE: 'update',
} as const;

export type ActionType = typeof ACTIONS[keyof typeof ACTIONS];

// Permission categories
export const CATEGORIES = {
  GENERAL: 'general',
  BILLING: 'billing',
  TECHNICAL: 'technical',
  SECURITY: 'security',
  ADMIN: 'admin',
} as const;

export type CategoryType = typeof CATEGORIES[keyof typeof CATEGORIES];

// API Request/Response Types
export interface CreateRoleData {
  name: string;
  displayName: string;
  description?: string;
  permissionIds?: number[];
}

export interface UpdateRoleData {
  displayName?: string;
  description?: string;
  permissionIds?: number[];
}

export interface AssignRoleData {
  userId: number;
  roleId: number;
}

export interface BulkAssignRolesData {
  userIds: number[];
  roleIds: number[];
}

export interface RoleFilters {
  search?: string;
  isSystem?: boolean;
  isActive?: boolean;
  includePermissions?: boolean;
}

export interface PermissionFilters {
  resource?: ResourceType;
  action?: ActionType;
  category?: CategoryType;
  search?: string;
}

// UI Helper Types
export interface PermissionGroup {
  category: string;
  permissions: Permission[];
}

export interface RoleFormData {
  name: string;
  displayName: string;
  description?: string;
  selectedPermissions: number[];
}

export interface UserPermissionSummary {
  canReadUsers: boolean;
  canCreateUsers: boolean;
  canUpdateUsers: boolean;
  canDeleteUsers: boolean;
  canManageCredits: boolean;
  canReadStreams: boolean;
  canCreateStreams: boolean;
  canUpdateStreams: boolean;
  canDeleteStreams: boolean;
  canTestStreams: boolean;
  canReadLines: boolean;
  canCreateLines: boolean;
  canUpdateLines: boolean;
  canDeleteLines: boolean;
  canManageGeneralSettings: boolean;
  canManageStreamingSettings: boolean;
  canManageSecuritySettings: boolean;
  canManageBillingSettings: boolean;
  canViewReports: boolean;
  canViewLogs: boolean;
  canReadBouquets: boolean;
  canCreateBouquets: boolean;
  canUpdateBouquets: boolean;
  canDeleteBouquets: boolean;
  hasAdminAccess: boolean;
}

// Permission check utilities
export interface PermissionCheckResult {
  hasPermission: boolean;
  reason?: string;
  requiredPermission?: string;
}

// Default system roles
export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN', 
  RESELLER: 'RESELLER',
  SUB_RESELLER: 'SUB_RESELLER'
} as const;

export type SystemRole = typeof SYSTEM_ROLES[keyof typeof SYSTEM_ROLES];