"use client";

import { useState, useMemo } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  Plus,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Package,
  MoreHorizontal,
  Coins,
} from "lucide-react";
import { format } from "date-fns";

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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

import {
  useResellerPackages,
  useCreateResellerPackage,
  useUpdateResellerPackage,
  useDeleteResellerPackage,
  useCreditBalance,
  ResellerCreditPackage,
} from "@/lib/api/hooks/useCredits";
import { useAuthStore } from "@/stores/authStore";

export default function ResellerPackagesPage() {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [sorting, setSorting] = useState<SortingState>([]);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<ResellerCreditPackage | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    credits: 10,
    price: 10,
    description: "",
    isActive: true,
  });

  // API hooks
  const { data, isLoading, error, refetch } = useResellerPackages();
  const { data: balanceData } = useCreditBalance();
  const createPackage = useCreateResellerPackage();
  const updatePackage = useUpdateResellerPackage();
  const deletePackage = useDeleteResellerPackage();

  const packages = data?.packages || [];
  const balance = balanceData?.balance || 0;

  const columns: ColumnDef<ResellerCreditPackage>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Package Name",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.getValue("name")}</div>
            {row.original.description && (
              <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                {row.original.description}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "credits",
        header: "Credits Given",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Coins className="h-4 w-4 text-green-500" />
            <span className="font-medium text-green-600">+{row.getValue("credits")}</span>
          </div>
        ),
      },
      {
        accessorKey: "price",
        header: "Your Cost",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Coins className="h-4 w-4 text-red-500" />
            <span className="font-medium text-red-600">-{row.getValue("price")}</span>
          </div>
        ),
      },
      {
        id: "profit",
        header: "Margin",
        cell: ({ row }) => {
          const credits = row.original.credits;
          const price = row.original.price;
          const margin = credits - price;
          const marginPercent = price > 0 ? ((margin / price) * 100).toFixed(1) : 0;
          return (
            <div className={cn("font-medium", margin >= 0 ? "text-green-600" : "text-red-600")}>
              {margin >= 0 ? "+" : ""}{margin} ({marginPercent}%)
            </div>
          );
        },
      },
      {
        accessorKey: "isActive",
        header: "Status",
        cell: ({ row }) => {
          const isActive = row.getValue("isActive") as boolean;
          return (
            <Badge variant={isActive ? "default" : "secondary"}>
              {isActive ? "Active" : "Inactive"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        cell: ({ row }) => format(new Date(row.getValue("createdAt")), "PP"),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const pkg = row.original;
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
                <DropdownMenuItem onClick={() => handleEdit(pkg)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => {
                    setSelectedPackage(pkg);
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
    ],
    []
  );

  const table = useReactTable({
    data: packages,
    columns,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: { sorting },
  });

  const handleEdit = (pkg: ResellerCreditPackage) => {
    setSelectedPackage(pkg);
    setFormData({
      name: pkg.name,
      credits: pkg.credits,
      price: pkg.price,
      description: pkg.description || "",
      isActive: pkg.isActive,
    });
    setIsCreateDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: "",
      credits: 10,
      price: 10,
      description: "",
      isActive: true,
    });
    setSelectedPackage(null);
  };

  const handleCreateOrUpdate = async () => {
    try {
      if (selectedPackage) {
        await updatePackage.mutateAsync({
          id: selectedPackage.id,
          data: formData,
        });
        toast({
          title: "Package updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createPackage.mutateAsync(formData);
        toast({
          title: "Package created",
          description: `${formData.name} has been created.`,
        });
      }
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to save package.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedPackage) return;
    try {
      await deletePackage.mutateAsync(selectedPackage.id);
      toast({
        title: "Package deleted",
        description: `${selectedPackage.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedPackage(null);
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.response?.data?.error || "Failed to delete package.",
        variant: "destructive",
      });
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load packages</h2>
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : "Unable to connect to the server"}
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
            <Package className="h-8 w-8" />
            My Credit Packages
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Create packages to sell credits to your sub-resellers at custom rates
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Package
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Balance</CardTitle>
            <Coins className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Packages</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Packages</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{packages.filter((p) => p.isActive).length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Margin</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {packages.length > 0
                ? (
                    packages.reduce((sum, p) => sum + (p.credits - p.price), 0) / packages.length
                  ).toFixed(1)
                : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How Credit Packages Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Credits Given:</strong> The amount of credits your sub-reseller will receive.
          </p>
          <p>
            <strong>Your Cost:</strong> The amount deducted from YOUR balance when a sub-reseller uses this package.
          </p>
          <p>
            <strong>Margin:</strong> Your profit per transaction. Set cost lower than credits given to earn profit.
          </p>
        </CardContent>
      </Card>

      {/* Packages Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Packages ({packages.length})</CardTitle>
          <CardDescription>
            Manage the credit packages available to your sub-resellers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[600px]">
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
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
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Package className="h-8 w-8 text-muted-foreground" />
                        <p>No packages yet. Create your first package to get started.</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            resetForm();
                            setIsCreateDialogOpen(true);
                          }}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Create Package
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedPackage ? "Edit Package" : "Create Package"}
            </DialogTitle>
            <DialogDescription>
              {selectedPackage
                ? "Update the package details below."
                : "Create a new credit package for your sub-resellers."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Package Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Starter Pack, Premium Bundle"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="credits">Credits Given *</Label>
                <Input
                  id="credits"
                  type="number"
                  min={1}
                  value={formData.credits}
                  onChange={(e) =>
                    setFormData({ ...formData, credits: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">Amount sub-reseller receives</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="price">Your Cost *</Label>
                <Input
                  id="price"
                  type="number"
                  min={1}
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: parseInt(e.target.value) || 0 })
                  }
                />
                <p className="text-xs text-muted-foreground">Deducted from your balance</p>
              </div>
            </div>

            {/* Margin Preview */}
            <div className="p-3 rounded-md bg-muted">
              <div className="flex justify-between text-sm">
                <span>Margin per sale:</span>
                <span
                  className={cn(
                    "font-medium",
                    formData.credits - formData.price >= 0 ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formData.credits - formData.price >= 0 ? "+" : ""}
                  {formData.credits - formData.price} credits
                </span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description for this package"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isActive">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive packages won&apos;t be available for selection
                </p>
              </div>
              <Switch
                id="isActive"
                checked={formData.isActive}
                onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrUpdate}
              disabled={
                createPackage.isPending ||
                updatePackage.isPending ||
                !formData.name ||
                formData.credits < 1 ||
                formData.price < 1
              }
            >
              {(createPackage.isPending || updatePackage.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedPackage ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Package</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedPackage?.name}&quot;? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePackage.isPending}
            >
              {deletePackage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
