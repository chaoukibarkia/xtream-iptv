"use client";

import { useState, useMemo } from "react";
import { useRoles, usePermissions, useCreateRole, useUpdateRolePermissions, useSeedPermissions } from "@/lib/api/hooks/useRoles";
import type { Role, Permission, CreateRoleData, RoleFormData } from "@/types/rbac";
import { groupPermissionsByCategory } from "@/lib/api/hooks/useRoles";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Plus, Settings, Users, Shield, MoreHorizontal, Key, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = {
  GENERAL: "General",
  BILLING: "Billing", 
  TECHNICAL: "Technical",
  SECURITY: "Security",
  ADMIN: "Administration",
} as const;

export default function RolesPage() {
  const { toast } = useToast();
  const { data: roles, isLoading: rolesLoading, refetch: refetchRoles } = useRoles({ includePermissions: true });
  const { data: permissions, isLoading: permissionsLoading } = usePermissions();
  const createRole = useCreateRole();
  const updateRolePermissions = useUpdateRolePermissions();
  const seedPermissions = useSeedPermissions();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState<RoleFormData>({
    name: "",
    displayName: "",
    description: "",
    selectedPermissions: [],
  });

  const [activeTab, setActiveTab] = useState("details");
  const [showSeedDialog, setShowSeedDialog] = useState(false);

  // Group permissions by category
  const permissionsByCategory = useMemo(() => {
    if (!permissions) return {};
    return groupPermissionsByCategory(permissions.permissions);
  }, [permissions]);

  // Filter roles
  const filteredRoles = useMemo(() => {
    if (!roles) return [];
    return roles.roles.filter(role =>
      role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      role.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [roles, searchTerm]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setFormData({
      name: "",
      displayName: "",
      description: "",
      selectedPermissions: [],
    });
    setActiveTab("details");
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      displayName: role.displayName,
      description: role.description || "",
      selectedPermissions: role.permissions?.map(p => p.id) || [],
    });
    setActiveTab("details");
    setIsDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingRole) {
        // Update role permissions
        await updateRolePermissions.mutateAsync({
          roleId: editingRole.id,
          permissionIds: formData.selectedPermissions,
        });
        toast({
          title: "Success",
          description: `Role "${formData.displayName}" updated successfully`,
        });
      } else {
        // Create new role
        const roleData: CreateRoleData = {
          name: formData.name,
          displayName: formData.displayName,
          description: formData.description,
          permissionIds: formData.selectedPermissions,
        };
        await createRole.mutateAsync(roleData);
        toast({
          title: "Success", 
          description: `Role "${formData.displayName}" created successfully`,
        });
      }

      setIsDialogOpen(false);
      refetchRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save role",
        variant: "destructive",
      });
    }
  };

  const handleSeedPermissions = async () => {
    try {
      await seedPermissions.mutateAsync();
      toast({
        title: "Success",
        description: "Default permissions and roles seeded successfully",
      });
      setShowSeedDialog(false);
      refetchRoles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to seed permissions",
        variant: "destructive",
      });
    }
  };

  const togglePermission = (permissionId: number) => {
    setFormData(prev => ({
      ...prev,
      selectedPermissions: prev.selectedPermissions.includes(permissionId)
        ? prev.selectedPermissions.filter(id => id !== permissionId)
        : [...prev.selectedPermissions, permissionId],
    }));
  };

  const selectAllPermissionsInCategory = (categoryPermissions: Permission[]) => {
    const permissionIds = categoryPermissions.map(p => p.id);
    setFormData(prev => ({
      ...prev,
      selectedPermissions: [
        ...prev.selectedPermissions.filter(id => !permissionIds.includes(id)),
        ...permissionIds
      ],
    }));
  };

  const deselectAllPermissionsInCategory = (categoryPermissions: Permission[]) => {
    const permissionIds = categoryPermissions.map(p => p.id);
    setFormData(prev => ({
      ...prev,
      selectedPermissions: prev.selectedPermissions.filter(id => !permissionIds.includes(id)),
    }));
  };

  const isPermissionSelected = (permissionId: number) => {
    return formData.selectedPermissions.includes(permissionId);
  };

  const getRoleBadgeColor = (role: Role) => {
    if (role.isSystem) return "default";
    if (!role.isActive) return "secondary";
    return "outline";
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Role Management
          </h1>
          <p className="text-muted-foreground">
            Manage user roles and permissions for the IPTV system
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowSeedDialog(true)}
            className="flex items-center gap-2"
          >
            <Key className="h-4 w-4" />
            Seed Permissions
          </Button>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Role
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Roles</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{roles?.roles.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Roles</CardTitle>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {roles?.roles.filter(r => r.isSystem).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custom Roles</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {roles?.roles.filter(r => !r.isSystem).length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Permissions</CardTitle>
            <Key className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{permissions?.permissions.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Roles Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rolesLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading roles...
                  </TableCell>
                </TableRow>
              ) : filteredRoles.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    No roles found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRoles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono">{role.name}</TableCell>
                    <TableCell className="font-medium">{role.displayName}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeColor(role)}>
                        {role.isSystem ? "System" : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {role.permissions?.length || 0} permissions
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.isActive ? "default" : "secondary"}>
                        {role.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(role.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleOpenEdit(role)}>
                            <Settings className="mr-2 h-4 w-4" />
                            Edit Role
                          </DropdownMenuItem>
                          {role.isSystem && (
                            <DropdownMenuItem disabled>
                              <AlertCircle className="mr-2 h-4 w-4" />
                              System role (cannot delete)
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Role Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRole ? 'Edit Role' : 'Create New Role'}
            </DialogTitle>
            <DialogDescription>
              {editingRole
                ? 'Update the role settings and permissions below'
                : 'Configure the new role and assign permissions'
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="permissions">Permissions</TabsTrigger>
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Role Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., CONTENT_MANAGER"
                      disabled={!!editingRole}
                      required
                    />
                    {editingRole && (
                      <p className="text-sm text-muted-foreground">
                        Role name cannot be changed after creation
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name *</Label>
                    <Input
                      id="displayName"
                      value={formData.displayName}
                      onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                      placeholder="e.g., Content Manager"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe what this role can do..."
                    rows={3}
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  {formData.selectedPermissions.length} permission(s) selected
                </div>
              </TabsContent>

              {/* Permissions Tab */}
              <TabsContent value="permissions" className="space-y-4 mt-4">
                {permissionsLoading ? (
                  <div className="text-center py-8">Loading permissions...</div>
                ) : (
                  Object.entries(permissionsByCategory).map(([category, categoryPermissions]) => (
                    <Card key={category}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{CATEGORIES[category as keyof typeof CATEGORIES] || category}</CardTitle>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => selectAllPermissionsInCategory(categoryPermissions)}
                            >
                              Select All
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => deselectAllPermissionsInCategory(categoryPermissions)}
                            >
                              Deselect All
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {categoryPermissions.map((permission) => (
                          <div key={permission.id} className="flex items-start space-x-3">
                            <Checkbox
                              id={`permission-${permission.id}`}
                              checked={isPermissionSelected(permission.id)}
                              onCheckedChange={() => togglePermission(permission.id)}
                            />
                            <div className="flex-1 space-y-1">
                              <Label
                                htmlFor={`permission-${permission.id}`}
                                className="font-medium cursor-pointer"
                              >
                                {permission.displayName}
                              </Label>
                              {permission.description && (
                                <p className="text-sm text-muted-foreground">
                                  {permission.description}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {permission.resource}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {permission.action}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createRole.isPending || updateRolePermissions.isPending}
              >
                {createRole.isPending || updateRolePermissions.isPending ? 'Saving...' : 'Save Role'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Seed Permissions Dialog */}
      <Dialog open={showSeedDialog} onOpenChange={setShowSeedDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seed Default Permissions</DialogTitle>
            <DialogDescription>
              This will create default permissions and system roles. Are you sure you want to continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeedDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSeedPermissions}
              disabled={seedPermissions.isPending}
            >
              {seedPermissions.isPending ? 'Seeding...' : 'Seed Permissions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}