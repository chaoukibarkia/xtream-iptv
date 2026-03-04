import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../client";
import type { 
  Role, 
  Permission, 
  UserRoleAssignment, 
  UserWithRoles,
  CreateRoleData, 
  UpdateRoleData,
  AssignRoleData,
  BulkAssignRolesData,
  RoleFilters,
  PermissionFilters,
  UserPermissionSummary
} from "@/types/rbac";

// Permission Hooks
export function usePermissions(filters?: PermissionFilters) {
  const queryParams = new URLSearchParams();
  if (filters?.resource) queryParams.append('resource', filters.resource);
  if (filters?.action) queryParams.append('action', filters.action);
  if (filters?.category) queryParams.append('category', filters.category);
  if (filters?.search) queryParams.append('search', filters.search);

  return useQuery({
    queryKey: ["permissions", filters],
    queryFn: () => api.get<{ permissions: Permission[] }>(`/admin/permissions?${queryParams.toString()}`),
    staleTime: 300000, // 5 minutes
  });
}

// Role Hooks
export function useRoles(filters?: RoleFilters) {
  const queryParams = new URLSearchParams();
  if (filters?.search) queryParams.append('search', filters.search);
  if (filters?.isSystem !== undefined) queryParams.append('isSystem', filters.isSystem.toString());
  if (filters?.isActive !== undefined) queryParams.append('isActive', filters.isActive.toString());
  if (filters?.includePermissions) queryParams.append('includePermissions', 'true');

  return useQuery({
    queryKey: ["roles", filters],
    queryFn: () => api.get<{ roles: Role[] }>(`/admin/roles?${queryParams.toString()}`),
    staleTime: 300000, // 5 minutes
  });
}

export function useRole(id: number, includePermissions = false) {
  return useQuery({
    queryKey: ["role", id, includePermissions],
    queryFn: () => api.get<{ role: Role }>(`/admin/roles/${id}?includePermissions=${includePermissions}`),
    enabled: !!id,
  });
}

export function useCreateRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateRoleData) =>
      api.post<{ role: Role }>("/admin/roles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

export function useUpdateRolePermissions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) =>
      api.put<{ role: Role }>(`/admin/roles/${roleId}/permissions`, { permissionIds }),
    onSuccess: (_, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ["roles"] });
      queryClient.invalidateQueries({ queryKey: ["role", roleId] });
    },
  });
}

// User Role Assignment Hooks
export function useUserRoleAssignments(userId: number) {
  return useQuery({
    queryKey: ["user", userId, "roles"],
    queryFn: () => api.get<{ roles: Role[] }>(`/admin/users/${userId}/roles`),
    enabled: !!userId,
  });
}

export function useAssignRoleToUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleId }: AssignRoleData) =>
      api.post(`/admin/users/${userId}/roles`, { roleId }),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["user", userId, "roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useRemoveRoleFromUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, roleId }: { userId: number; roleId: number }) =>
      api.delete(`/admin/users/${userId}/roles/${roleId}`),
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ["user", userId, "roles"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useBulkAssignRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: BulkAssignRolesData) =>
      api.post("/admin/users/bulk-assign-roles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// Current User Permissions
export function useCurrentUserPermissions() {
  return useQuery({
    queryKey: ["me", "permissions"],
    queryFn: () => api.get<{
      userId: number;
      permissions: Permission[];
      roles: Role[];
      roleAssignments: UserRoleAssignment[];
    }>("/admin/me/permissions"),
    staleTime: 300000, // 5 minutes
  });
}

// Permission Check Hook
export function useUserPermissionSummary(userId?: number) {
  return useQuery({
    queryKey: ["user", userId, "permissionSummary"],
    queryFn: async () => {
      const response = await api.get<{ 
        roles: Array<{
          permissions: Permission[];
        }>;
      }>(`/admin/users/${userId}/roles`);

      // Flatten permissions from all roles
      const permissions = response.roles?.flatMap(r => r.permissions || []) || [];
      
      // Create permission summary
      const summary: UserPermissionSummary = {
        canReadUsers: permissions.some(p => p.resource === 'users' && p.action === 'read'),
        canCreateUsers: permissions.some(p => p.resource === 'users' && p.action === 'create'),
        canUpdateUsers: permissions.some(p => p.resource === 'users' && p.action === 'update'),
        canDeleteUsers: permissions.some(p => p.resource === 'users' && p.action === 'delete'),
        canManageCredits: permissions.some(p => p.resource === 'users' && p.action === 'manage'),
        canReadStreams: permissions.some(p => p.resource === 'streams' && p.action === 'read'),
        canCreateStreams: permissions.some(p => p.resource === 'streams' && p.action === 'create'),
        canUpdateStreams: permissions.some(p => p.resource === 'streams' && p.action === 'update'),
        canDeleteStreams: permissions.some(p => p.resource === 'streams' && p.action === 'delete'),
        canTestStreams: permissions.some(p => p.resource === 'streams' && p.action === 'manage'),
        canReadLines: permissions.some(p => p.resource === 'lines' && p.action === 'read'),
        canCreateLines: permissions.some(p => p.resource === 'lines' && p.action === 'create'),
        canUpdateLines: permissions.some(p => p.resource === 'lines' && p.action === 'update'),
        canDeleteLines: permissions.some(p => p.resource === 'lines' && p.action === 'delete'),
        canManageGeneralSettings: permissions.some(p => p.name === 'settings.general'),
        canManageStreamingSettings: permissions.some(p => p.name === 'settings.streaming'),
        canManageSecuritySettings: permissions.some(p => p.name === 'settings.security'),
        canManageBillingSettings: permissions.some(p => p.name === 'settings.billing'),
        canViewReports: permissions.some(p => p.resource === 'reports' && p.action === 'read'),
        canViewLogs: permissions.some(p => p.resource === 'logs' && p.action === 'read'),
        canReadBouquets: permissions.some(p => p.resource === 'bouquets' && p.action === 'read'),
        canCreateBouquets: permissions.some(p => p.resource === 'bouquets' && p.action === 'create'),
        canUpdateBouquets: permissions.some(p => p.resource === 'bouquets' && p.action === 'update'),
        canDeleteBouquets: permissions.some(p => p.resource === 'bouquets' && p.action === 'delete'),
        hasAdminAccess: permissions.some(p => p.category === 'admin'),
      };

      return summary;
    },
    enabled: !!userId,
  });
}

// Permission Check Utility Hook
export function useHasPermission(resource: string, action: string) {
  const { data: currentUser } = useCurrentUserPermissions();
  
  return {
    hasPermission: currentUser?.permissions?.some(p => 
      p.resource === resource && p.action === action
    ) || false,
    isLoading: !currentUser,
  };
}

// Seed default permissions (for initial setup)
export function useSeedPermissions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/admin/seed-permissions"),
    onSuccess: () => {
      // Invalidate all permission-related queries
      queryClient.invalidateQueries({ queryKey: ["permissions"] });
      queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
  });
}

// Utility functions
export const hasPermission = (permissions: Permission[], resource: string, action: string): boolean => {
  return permissions.some(p => p.resource === resource && p.action === action);
};

export const hasResourceAccess = (permissions: Permission[], resource: string): boolean => {
  return permissions.some(p => p.resource === resource);
};

export const hasAdminAccess = (permissions: Permission[]): boolean => {
  return permissions.some(p => p.category === 'admin');
};

export const groupPermissionsByCategory = (permissions: Permission[]): Record<string, Permission[]> => {
  return permissions.reduce((groups, permission) => {
    const category = permission.category || 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(permission);
    return groups;
  }, {} as Record<string, Permission[]>);
};

export const filterPermissionsByResource = (permissions: Permission[], resource: string): Permission[] => {
  return permissions.filter(p => p.resource === resource);
};

export const getRoleDisplayName = (role: Role): string => {
  if (role.isSystem) {
    return `${role.displayName} (System)`;
  }
  return role.displayName;
};