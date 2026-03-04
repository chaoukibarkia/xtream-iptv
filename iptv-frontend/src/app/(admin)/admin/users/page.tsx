"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Pencil,
  RefreshCw,
  Ban,
  Check,
  Loader2,
  AlertCircle,
  Coins,
  ArrowUpCircle,
  Shield,
  Users as UsersIcon,
  CheckCircle,
  XCircle,
  UserX,
  ChevronDown,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";

import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/lib/api/hooks/useUsers";
import { useTopUpCredits, useResellerTopUp, useResellerPackages, useCreditBalance } from "@/lib/api/hooks/useCredits";
import { useRoles, useUserRoleAssignments, useAssignRoleToUser, useRemoveRoleFromUser } from "@/lib/api/hooks/useRoles";
import { useAuthStore } from "@/stores/authStore";

interface User {
  id: number;
  username: string;
  email: string | null;
  status: "ACTIVE" | "EXPIRED" | "BANNED" | "DISABLED";
  expirationDate: string | null;
  maxConnections: number;
  isAdmin: boolean;
  isReseller: boolean;
  isTrial: boolean;
  createdAt: string;
  lastActivity: string | null;
  credits: number;
  role: "ADMIN" | "RESELLER" | "SUB_RESELLER";
  notes: string | null;
  parentId: number | null;
  _count: {
    bouquets: number;
    iptvLines?: number;
    children?: number;
  };
}

const statusColors = {
  ACTIVE: "success",
  EXPIRED: "destructive",
  BANNED: "destructive",
  DISABLED: "secondary",
} as const;

const roleColors = {
  ADMIN: "default",
  RESELLER: "secondary",
  SUB_RESELLER: "outline",
} as const;

const USER_STATUSES = ["ACTIVE", "EXPIRED", "BANNED", "DISABLED"] as const;
const ALL_USER_ROLES = ["ADMIN", "RESELLER", "SUB_RESELLER"] as const;

export default function UsersPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuthStore();
  const isAdmin = currentUser?.role === "admin";
  
  // Resellers can only create SUB_RESELLER
  const availableRoles = isAdmin ? ALL_USER_ROLES : (["SUB_RESELLER"] as const);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isTopUpDialogOpen, setIsTopUpDialogOpen] = useState(false);
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [isBulkActionDialogOpen, setIsBulkActionDialogOpen] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'delete' | 'activate' | 'disable' | 'ban' | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState("details");

  // Form state - enhanced with all fields
  // Default role depends on user type: admin defaults to RESELLER, reseller defaults to SUB_RESELLER
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    email: "",
    role: (isAdmin ? "RESELLER" : "SUB_RESELLER") as "ADMIN" | "RESELLER" | "SUB_RESELLER",
    status: "ACTIVE" as "ACTIVE" | "EXPIRED" | "BANNED" | "DISABLED",
    credits: 0,
    notes: "",
    parentId: null as number | null,
  });

  // Top-up form state
  const [topUpData, setTopUpData] = useState({
    amount: 10,
    isPaid: false,
    paymentNotes: "",
    selectedPackageId: null as number | null,
    topUpMode: "direct" as "direct" | "package",
  });

  // API hooks
  const { data, isLoading, error, refetch } = useUsers({ 
    search: search || undefined, 
    page,
    limit: 50,
  });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const topUpCredits = useTopUpCredits();
  const resellerTopUp = useResellerTopUp();
  
  // Reseller-specific hooks
  const { data: resellerPackagesData } = useResellerPackages();
  const { data: creditBalanceData } = useCreditBalance({ enabled: !isAdmin });
  const resellerPackages = resellerPackagesData?.packages || [];
  const resellerBalance = creditBalanceData?.balance || 0;
  
  // RBAC hooks
  const { data: rolesData } = useRoles({ includePermissions: false });
  const assignRole = useAssignRoleToUser();
  const removeRole = useRemoveRoleFromUser();
  
  // User role assignments - only fetch when role dialog is open AND user is selected
  const roleDialogUserId = isRoleDialogOpen && selectedUser ? selectedUser.id : 0;
  const { data: userRolesData, refetch: refetchUserRoles } = useUserRoleAssignments(roleDialogUserId);

  const users = data?.users || [];
  
  // Parent users for selection - filter from main users list
  // Memoize with stringified IDs to prevent infinite re-renders
  const parentUsers = useMemo(() => {
    return users.filter(u => u.role === "ADMIN" || u.role === "RESELLER");
  }, [users.map(u => u.id).join(',')]);
  
  const pagination = data?.pagination;
  const roles = rolesData?.roles || [];

  // Handle dialog close properly
  const handleCloseDialog = () => {
    setIsCreateDialogOpen(false);
    setSelectedUser(null);
    setActiveTab("details");
  };

  const columns: ColumnDef<User>[] = useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "username",
      header: "Username",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.getValue("username")}</div>
          {row.original.email && (
            <div className="text-xs text-muted-foreground">{row.original.email}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => {
        const role = row.getValue("role") as keyof typeof roleColors;
        return (
          <Badge variant={roleColors[role] || "outline"}>
            {role}
          </Badge>
        );
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as keyof typeof statusColors;
        return (
          <Badge variant={statusColors[status] || "secondary"}>
            {status}
          </Badge>
        );
      },
    },
    {
      accessorKey: "credits",
      header: "Credits",
      cell: ({ row }) => {
        const credits = row.original.credits || 0;
        return (
          <div className="flex items-center gap-1">
            <Coins className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">{credits}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "_count",
      header: "Lines",
      cell: ({ row }) => {
        const count = row.original._count;
        return (
          <span className="text-muted-foreground">
            {count?.iptvLines || 0} lines
          </span>
        );
      },
    },
    {
      accessorKey: "lastActivity",
      header: "Last Active",
      cell: ({ row }) => {
        const date = row.getValue("lastActivity") as string | null;
        if (!date) return <span className="text-muted-foreground">Never</span>;
        return formatDistanceToNow(new Date(date), { addSuffix: true });
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const user = row.original;

        return (
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
              <DropdownMenuItem onClick={() => handleEdit(user)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit User
              </DropdownMenuItem>
              {isAdmin && (
                <DropdownMenuItem onClick={() => handleOpenRoleDialog(user)}>
                  <Shield className="mr-2 h-4 w-4" />
                  Manage Roles
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => handleOpenTopUp(user)}>
                <ArrowUpCircle className="mr-2 h-4 w-4 text-green-600" />
                Top Up Credits
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {user.status === "DISABLED" ? (
                <DropdownMenuItem onClick={() => handleToggleStatus(user, "ACTIVE")}>
                  <Check className="mr-2 h-4 w-4" />
                  Enable
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => handleToggleStatus(user, "DISABLED")}>
                  <Ban className="mr-2 h-4 w-4" />
                  Disable
                </DropdownMenuItem>
              )}
              <DropdownMenuItem 
                className="text-destructive"
                onClick={() => {
                  setSelectedUser(user);
                  setIsDeleteDialogOpen(true);
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ], []);

  const table = useReactTable({
    data: users,
    columns: columns as any,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  const handleEdit = (user: User) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      password: "",
      email: user.email || "",
      role: user.role,
      status: user.status,
      credits: user.credits,
      notes: user.notes || "",
      parentId: user.parentId,
    });
    setActiveTab("details");
    setIsCreateDialogOpen(true);
  };

  const handleOpenTopUp = (user: User) => {
    setSelectedUser(user);
    setTopUpData({ 
      amount: 10, 
      isPaid: false, 
      paymentNotes: "",
      selectedPackageId: null,
      topUpMode: isAdmin ? "direct" : (resellerPackages.length > 0 ? "package" : "direct"),
    });
    setIsTopUpDialogOpen(true);
  };

  const handleOpenRoleDialog = (user: User) => {
    setSelectedUser(user);
    setIsRoleDialogOpen(true);
    // Note: userRolesData will auto-fetch due to roleDialogUserId changing
  };

  const handleTopUp = async () => {
    if (!selectedUser) return;
    try {
      if (isAdmin) {
        // Admin top-up (unlimited credits)
        await topUpCredits.mutateAsync({
          userId: selectedUser.id,
          data: {
            amount: topUpData.amount,
            isPaid: topUpData.isPaid,
            paymentNotes: topUpData.paymentNotes || undefined,
          },
        });
        toast({
          title: "Credits added",
          description: `${topUpData.amount} credits added to ${selectedUser.username}.`,
        });
      } else {
        // Reseller top-up (deducts from reseller balance)
        const result = await resellerTopUp.mutateAsync({
          userId: selectedUser.id,
          data: topUpData.topUpMode === "package" && topUpData.selectedPackageId
            ? { packageId: topUpData.selectedPackageId }
            : { amount: topUpData.amount },
        });
        toast({
          title: "Credits transferred",
          description: `${result.creditsGiven} credits given to ${selectedUser.username}. ${result.creditsDeducted} credits deducted from your balance.`,
        });
      }
      setIsTopUpDialogOpen(false);
      setSelectedUser(null);
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to add credits.",
        variant: "destructive",
      });
    }
  };

  const handleToggleStatus = async (user: User, newStatus: "ACTIVE" | "DISABLED") => {
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { status: newStatus },
      });
      toast({
        title: "User updated",
        description: `${user.username} has been ${newStatus === "ACTIVE" ? "enabled" : "disabled"}.`,
      });
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to update user status.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOrUpdate = async () => {
    try {
      if (selectedUser) {
        // Update existing user
        await updateUser.mutateAsync({
          id: selectedUser.id,
          data: {
            email: formData.email || undefined,
            password: formData.password || undefined,
            role: formData.role,
            status: formData.status,
            notes: formData.notes || undefined,
            parentId: formData.parentId || undefined,
          },
        });
        toast({
          title: "User updated",
          description: `${formData.username} has been updated.`,
        });
      } else {
        // Create new user
        await createUser.mutateAsync({
          username: formData.username,
          password: formData.password,
          email: formData.email || undefined,
          role: formData.role,
          status: formData.status,
          credits: formData.credits,
          notes: formData.notes || undefined,
          parentId: formData.parentId || undefined,
        });
        toast({
          title: "User created",
          description: `${formData.username} has been created.`,
        });
      }
      handleCloseDialog();
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to save user.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      await deleteUser.mutateAsync(selectedUser.id);
      toast({
        title: "User deleted",
        description: `${selectedUser.username} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete user.",
        variant: "destructive",
      });
    }
  };

  const handleAssignRole = async (roleId: number) => {
    if (!selectedUser) return;
    try {
      await assignRole.mutateAsync({ userId: selectedUser.id, roleId });
      toast({
        title: "Role assigned",
        description: "Role has been assigned to the user.",
      });
      refetchUserRoles();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to assign role.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveRole = async (roleId: number) => {
    if (!selectedUser) return;
    try {
      await removeRole.mutateAsync({ userId: selectedUser.id, roleId });
      toast({
        title: "Role removed",
        description: "Role has been removed from the user.",
      });
      refetchUserRoles();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to remove role.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      email: "",
      role: isAdmin ? "RESELLER" : "SUB_RESELLER",
      status: "ACTIVE",
      credits: 0,
      notes: "",
      parentId: null,
    });
  };

  const handleBulkAction = (action: 'delete' | 'activate' | 'disable' | 'ban') => {
    const selectedCount = Object.keys(rowSelection).length;
    if (selectedCount === 0) {
      toast({
        title: "No users selected",
        description: "Please select at least one user to perform bulk actions.",
        variant: "destructive",
      });
      return;
    }
    setBulkActionType(action);
    setIsBulkActionDialogOpen(true);
  };

  const executeBulkAction = async () => {
    const selectedUserIds = Object.keys(rowSelection).map(key => users[parseInt(key)].id);
    
    try {
      if (bulkActionType === 'delete') {
        await Promise.all(selectedUserIds.map(id => deleteUser.mutateAsync(id)));
        toast({
          title: "Users deleted",
          description: `${selectedUserIds.length} user(s) have been deleted.`,
        });
      } else if (bulkActionType) {
        const statusMap = {
          activate: 'ACTIVE',
          disable: 'DISABLED',
          ban: 'BANNED',
        } as const;
        const newStatus = statusMap[bulkActionType];
        
        await Promise.all(
          selectedUserIds.map(id => {
            const user = users.find(u => u.id === id);
            if (user) {
              return updateUser.mutateAsync({
                id,
                data: { status: newStatus as "ACTIVE" | "DISABLED" | "BANNED" },
              });
            }
            return Promise.resolve();
          })
        );
        
        toast({
          title: "Status updated",
          description: `${selectedUserIds.length} user(s) have been ${bulkActionType}d.`,
        });
      }
      
      setIsBulkActionDialogOpen(false);
      setBulkActionType(null);
      setRowSelection({});
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to perform bulk action.",
        variant: "destructive",
      });
    }
  };

  const userAssignedRoleIds = useMemo(() => {
    return userRolesData?.roles?.map((r: any) => r.id) || [];
  }, [userRolesData]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load users</h2>
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : 'Unable to connect to the server'}
        </p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <UsersIcon className="h-8 w-8" />
            {isAdmin ? "Users" : "Sub-Resellers"}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isAdmin ? "Manage admin users and resellers" : "Manage your sub-reseller accounts"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => {
            setSelectedUser(null);
            resetForm();
            setActiveTab("details");
            setIsCreateDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pagination?.total || users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Admins</CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => u.role === "ADMIN").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resellers</CardTitle>
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => u.role === "RESELLER").length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <Coins className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.reduce((sum, u) => sum + (u.credits || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users ({pagination?.total || users.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="relative flex-1 min-w-0 sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>

            {Object.keys(rowSelection).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {Object.keys(rowSelection).length} selected
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Bulk Actions
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleBulkAction('activate')}>
                      <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                      Activate Users
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkAction('disable')}>
                      <XCircle className="mr-2 h-4 w-4 text-gray-600" />
                      Disable Users
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBulkAction('ban')}>
                      <Ban className="mr-2 h-4 w-4 text-orange-600" />
                      Ban Users
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => handleBulkAction('delete')}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Users
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {/* Desktop Table View */}
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {columns.map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-6 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={row.getIsSelected() && "selected"}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
            <div className="text-sm text-muted-foreground">
              Showing {users.length} of {pagination?.total || users.length} users
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {page} of {pagination?.pages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= (pagination?.pages || 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit User Dialog - Enhanced */}
      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
        if (!open) {
          handleCloseDialog();
        } else {
          setIsCreateDialogOpen(true);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsersIcon className="h-5 w-5" />
              {selectedUser ? "Edit User" : "Create User"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser 
                ? "Update user information and settings." 
                : "Fill in the details to create a new admin or reseller account."}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details">Account Details</TabsTrigger>
              <TabsTrigger value="settings">Settings & Permissions</TabsTrigger>
            </TabsList>

            {/* Account Details Tab */}
            <TabsContent value="details" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    disabled={!!selectedUser}
                    placeholder="Enter username"
                  />
                  {selectedUser && (
                    <p className="text-xs text-muted-foreground">Username cannot be changed</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password">
                    Password {selectedUser ? "(leave empty to keep current)" : "*"}
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={selectedUser ? "Enter new password" : "Enter password"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role *</Label>
                  <Select 
                    value={formData.role} 
                    onValueChange={(value) => setFormData({ ...formData, role: value as any })}
                    disabled={!isAdmin && availableRoles.length === 1}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role.replace("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!isAdmin && (
                    <p className="text-xs text-muted-foreground">
                      You can only create sub-reseller accounts
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select 
                    value={formData.status} 
                    onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!selectedUser && (
                  <div className="space-y-2">
                    <Label htmlFor="credits">Initial Credits</Label>
                    <Input
                      id="credits"
                      type="number"
                      min={0}
                      max={isAdmin ? undefined : resellerBalance}
                      value={formData.credits}
                      onChange={(e) => setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })}
                      placeholder="0"
                    />
                    {!isAdmin && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Your balance:</span>
                          <span className="font-medium flex items-center gap-1">
                            <Coins className="h-3 w-3 text-yellow-500" />
                            {resellerBalance} credits
                          </span>
                        </div>
                        {formData.credits > 0 && (
                          <div className={cn(
                            "text-xs",
                            formData.credits > resellerBalance ? "text-red-600" : "text-muted-foreground"
                          )}>
                            {formData.credits > resellerBalance ? (
                              <span className="flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" />
                                Insufficient balance
                              </span>
                            ) : (
                              <span>After: {resellerBalance - formData.credits} credits remaining</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Settings & Permissions Tab */}
            <TabsContent value="settings" className="space-y-4 mt-4">
              {isAdmin && (
                <div className="space-y-2">
                  <Label htmlFor="parentId">Parent User (Reseller Hierarchy)</Label>
                  <Select 
                    value={formData.parentId?.toString() || "none"} 
                    onValueChange={(value) => setFormData({ 
                      ...formData, 
                      parentId: value === "none" ? null : parseInt(value) 
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select parent user (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Parent (Top Level)</SelectItem>
                      {parentUsers
                        .filter(u => u.id !== selectedUser?.id)
                        .map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.username} ({user.role})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Set a parent user to create a reseller hierarchy
                  </p>
                </div>
              )}
              {!isAdmin && (
                <div className="p-3 rounded-md bg-muted">
                  <p className="text-sm text-muted-foreground">
                    New sub-resellers will be automatically assigned to your account.
                  </p>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="notes">Admin Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Internal notes about this user (not visible to the user)"
                  rows={4}
                />
              </div>

              {selectedUser && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Account Information</Label>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Created:</span>{" "}
                        {format(new Date(selectedUser.createdAt), "PPP")}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Last Activity:</span>{" "}
                        {selectedUser.lastActivity 
                          ? formatDistanceToNow(new Date(selectedUser.lastActivity), { addSuffix: true })
                          : "Never"}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Credits:</span>{" "}
                        <span className="font-medium">{selectedUser.credits}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">IPTV Lines:</span>{" "}
                        <span className="font-medium">{selectedUser._count?.iptvLines || 0}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateOrUpdate}
              disabled={
                createUser.isPending || 
                updateUser.isPending || 
                (!selectedUser && !formData.password) ||
                (!isAdmin && !selectedUser && formData.credits > resellerBalance)
              }
            >
              {(createUser.isPending || updateUser.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedUser ? "Update User" : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Management Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Manage Roles - {selectedUser?.username}
            </DialogTitle>
            <DialogDescription>
              Assign or remove RBAC roles for this user. These roles determine what permissions the user has in the system.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Current Roles</Label>
              {(userRolesData?.roles?.length ?? 0) > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {userRolesData?.roles?.map((role: any) => (
                    <Badge key={role.id} variant="secondary" className="flex items-center gap-1">
                      {role.displayName}
                      <button
                        onClick={() => handleRemoveRole(role.id)}
                        className="ml-1 hover:text-destructive"
                        disabled={removeRole.isPending}
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No roles assigned</p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Available Roles</Label>
              <div className="space-y-2">
                {roles
                  .filter((role: any) => !userAssignedRoleIds.includes(role.id))
                  .map((role: any) => (
                    <div key={role.id} className="flex items-center justify-between p-2 border rounded">
                      <div>
                        <div className="font-medium">{role.displayName}</div>
                        {role.description && (
                          <div className="text-xs text-muted-foreground">{role.description}</div>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAssignRole(role.id)}
                        disabled={assignRole.isPending}
                      >
                        {assignRole.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Assign"
                        )}
                      </Button>
                    </div>
                  ))}
                {roles.filter((role: any) => !userAssignedRoleIds.includes(role.id)).length === 0 && (
                  <p className="text-sm text-muted-foreground">All roles have been assigned</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user &quot;{selectedUser?.username}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteUser.isPending}
            >
              {deleteUser.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Confirmation Dialog */}
      <Dialog open={isBulkActionDialogOpen} onOpenChange={setIsBulkActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkActionType === 'delete' && 'Delete Users'}
              {bulkActionType === 'activate' && 'Activate Users'}
              {bulkActionType === 'disable' && 'Disable Users'}
              {bulkActionType === 'ban' && 'Ban Users'}
            </DialogTitle>
            <DialogDescription>
              {bulkActionType === 'delete' 
                ? `Are you sure you want to delete ${Object.keys(rowSelection).length} user(s)? This action cannot be undone.`
                : `Are you sure you want to ${bulkActionType} ${Object.keys(rowSelection).length} user(s)?`
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkActionDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={bulkActionType === 'delete' ? 'destructive' : 'default'}
              onClick={executeBulkAction}
              disabled={updateUser.isPending || deleteUser.isPending}
            >
              {(updateUser.isPending || deleteUser.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Top Up Credits Dialog */}
      <Dialog open={isTopUpDialogOpen} onOpenChange={setIsTopUpDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-yellow-500" />
              Top Up Credits
            </DialogTitle>
            <DialogDescription>
              Add credits to {selectedUser?.username}&apos;s account.
              Current balance: {selectedUser?.credits || 0} credits
            </DialogDescription>
          </DialogHeader>
          
          {isAdmin ? (
            /* Admin Top-Up UI */
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="topUpAmount">Amount</Label>
                <Input
                  id="topUpAmount"
                  type="number"
                  min={1}
                  max={100000}
                  value={topUpData.amount}
                  onChange={(e) => setTopUpData({ ...topUpData, amount: parseInt(e.target.value) || 1 })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="paymentNotes">Payment Notes (optional)</Label>
                <Input
                  id="paymentNotes"
                  value={topUpData.paymentNotes}
                  onChange={(e) => setTopUpData({ ...topUpData, paymentNotes: e.target.value })}
                  placeholder="e.g., Bank transfer ref: ABC123"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isPaid"
                  checked={topUpData.isPaid}
                  onCheckedChange={(checked) => setTopUpData({ ...topUpData, isPaid: !!checked })}
                />
                <Label htmlFor="isPaid">Mark as Paid</Label>
              </div>
            </div>
          ) : (
            /* Reseller Top-Up UI */
            <div className="grid gap-4 py-4">
              {/* Reseller Balance Display */}
              <div className="p-3 rounded-md bg-muted">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Your Balance:</span>
                  <span className="font-bold text-lg flex items-center gap-1">
                    <Coins className="h-4 w-4 text-yellow-500" />
                    {resellerBalance} credits
                  </span>
                </div>
              </div>

              {/* Mode Selection - only if packages exist */}
              {resellerPackages.length > 0 && (
                <div className="grid gap-2">
                  <Label>Top-Up Method</Label>
                  <Select
                    value={topUpData.topUpMode}
                    onValueChange={(value: "direct" | "package") => 
                      setTopUpData({ ...topUpData, topUpMode: value, selectedPackageId: null })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="package">Use Package</SelectItem>
                      <SelectItem value="direct">Direct Amount</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {topUpData.topUpMode === "package" && resellerPackages.length > 0 ? (
                /* Package Selection */
                <div className="grid gap-2">
                  <Label>Select Package</Label>
                  <div className="space-y-2">
                    {resellerPackages.filter(p => p.isActive).map((pkg) => (
                      <div
                        key={pkg.id}
                        className={cn(
                          "p-3 border rounded-md cursor-pointer transition-colors",
                          topUpData.selectedPackageId === pkg.id 
                            ? "border-primary bg-primary/5" 
                            : "hover:border-muted-foreground/50"
                        )}
                        onClick={() => setTopUpData({ ...topUpData, selectedPackageId: pkg.id })}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{pkg.name}</div>
                            {pkg.description && (
                              <div className="text-xs text-muted-foreground">{pkg.description}</div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="text-sm">
                              <span className="text-green-600 font-medium">+{pkg.credits}</span> credits
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Cost: {pkg.price} credits
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {resellerPackages.filter(p => p.isActive).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No active packages. Create packages in &quot;My Packages&quot; or use direct amount.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Direct Amount Input */
                <div className="grid gap-2">
                  <Label htmlFor="topUpAmountReseller">Credits to Give</Label>
                  <Input
                    id="topUpAmountReseller"
                    type="number"
                    min={1}
                    max={resellerBalance}
                    value={topUpData.amount}
                    onChange={(e) => setTopUpData({ ...topUpData, amount: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-xs text-muted-foreground">
                    This amount will be deducted from your balance.
                  </p>
                </div>
              )}

              {/* Cost Preview */}
              <div className="p-3 rounded-md border bg-muted/50">
                <div className="text-sm font-medium mb-2">Summary:</div>
                {topUpData.topUpMode === "package" && topUpData.selectedPackageId ? (
                  <>
                    {(() => {
                      const pkg = resellerPackages.find(p => p.id === topUpData.selectedPackageId);
                      if (!pkg) return null;
                      const canAfford = resellerBalance >= pkg.price;
                      return (
                        <>
                          <div className="flex justify-between text-sm">
                            <span>Sub-reseller receives:</span>
                            <span className="text-green-600 font-medium">+{pkg.credits} credits</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Deducted from you:</span>
                            <span className="text-red-600 font-medium">-{pkg.price} credits</span>
                          </div>
                          <div className="flex justify-between text-sm mt-1 pt-1 border-t">
                            <span>Your new balance:</span>
                            <span className={cn("font-medium", !canAfford && "text-red-600")}>
                              {resellerBalance - pkg.price} credits
                            </span>
                          </div>
                          {!canAfford && (
                            <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              Insufficient balance
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-sm">
                      <span>Sub-reseller receives:</span>
                      <span className="text-green-600 font-medium">+{topUpData.amount} credits</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Deducted from you:</span>
                      <span className="text-red-600 font-medium">-{topUpData.amount} credits</span>
                    </div>
                    <div className="flex justify-between text-sm mt-1 pt-1 border-t">
                      <span>Your new balance:</span>
                      <span className={cn("font-medium", resellerBalance < topUpData.amount && "text-red-600")}>
                        {resellerBalance - topUpData.amount} credits
                      </span>
                    </div>
                    {resellerBalance < topUpData.amount && (
                      <div className="mt-2 text-xs text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Insufficient balance
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTopUpDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleTopUp}
              disabled={
                topUpCredits.isPending || 
                resellerTopUp.isPending ||
                (!isAdmin && topUpData.topUpMode === "package" && !topUpData.selectedPackageId) ||
                (!isAdmin && topUpData.topUpMode === "direct" && resellerBalance < topUpData.amount) ||
                (!isAdmin && topUpData.topUpMode === "package" && !!topUpData.selectedPackageId && 
                  resellerBalance < (resellerPackages.find(p => p.id === topUpData.selectedPackageId)?.price || 0))
              }
            >
              {(topUpCredits.isPending || resellerTopUp.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isAdmin ? "Add Credits" : "Transfer Credits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}