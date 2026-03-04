"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FolderTree,
  Search,
  Plus,
  Tv,
  Film,
  Radio,
  RefreshCw,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  useAllCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useBatchUpdateCategories,
} from "@/lib/api/hooks/useCategories";
import { CategoryTree, CategorySelect, type CategoryNode } from "@/components/admin/category-tree";
import type { StreamType } from "@/types";

export default function CategoriesPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<StreamType | "all">("all");

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryNode | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "LIVE" as StreamType,
    parentId: null as number | null,
    sortOrder: 0,
    isActive: true,
    countryCode: "",
    flagSvgUrl: "",
  });

  // API hooks
  const { data, isLoading, error, refetch } = useAllCategories({
    search: searchTerm || undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const categories = useMemo(() => {
    const raw = ((data as unknown as { data?: CategoryNode[] })?.data || 
      (Array.isArray(data) ? data : [])) as CategoryNode[];
    return raw;
  }, [data]);

  // Filter categories for display
  const filteredCategories = useMemo(() => {
    if (!searchTerm && typeFilter === "all") return categories;
    
    return categories.filter((cat) => {
      const matchesSearch = !searchTerm || 
        cat.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = typeFilter === "all" || cat.type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [categories, searchTerm, typeFilter]);

  // Calculate stats
  const categoryStats = useMemo(() => ({
    LIVE: categories.filter((c) => c.type === "LIVE").length,
    VOD: categories.filter((c) => c.type === "VOD").length,
    SERIES: categories.filter((c) => c.type === "SERIES").length,
    RADIO: categories.filter((c) => c.type === "RADIO").length,
  }), [categories]);

  // Batch update hook for reordering
  const batchUpdateCategories = useBatchUpdateCategories();

  // Handle moving categories up/down
  const handleMove = useCallback(async (categoryId: number, direction: "up" | "down", siblings: CategoryNode[]) => {
    const currentIndex = siblings.findIndex(s => s.id === categoryId);
    if (currentIndex === -1) return;

    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;

    const current = siblings[currentIndex];
    const target = siblings[targetIndex];

    // Use array indices as the new sortOrder values (swap positions)
    // This ensures unique sortOrder values even if they were the same before
    const updates = [
      { id: current.id, sortOrder: targetIndex },
      { id: target.id, sortOrder: currentIndex },
    ];

    try {
      await batchUpdateCategories.mutateAsync(updates);
      toast({
        title: "Category moved",
        description: `${current.name} moved ${direction}.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to reorder category.",
        variant: "destructive",
      });
    }
  }, [batchUpdateCategories, toast]);

  const handleEdit = (category: CategoryNode) => {
    setSelectedCategory(category);
    setFormData({
      name: category.name,
      type: category.type,
      parentId: category.parentId || null,
      sortOrder: category.sortOrder || 0,
      isActive: category.isActive,
      countryCode: category.countryCode || "",
      flagSvgUrl: category.flagSvgUrl || "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleAddChild = (parent: CategoryNode) => {
    setSelectedCategory(null);
    setFormData({
      name: "",
      type: parent.type, // Inherit parent's type
      parentId: parent.id,
      sortOrder: 0,
      isActive: true,
      countryCode: "",
      flagSvgUrl: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (selectedCategory) {
        await updateCategory.mutateAsync({
          id: selectedCategory.id,
          data: {
            name: formData.name,
            parentId: formData.parentId,
            sortOrder: formData.sortOrder,
            isActive: formData.isActive,
            countryCode: formData.countryCode || undefined,
            flagSvgUrl: formData.flagSvgUrl || undefined,
          },
        });
        toast({
          title: "Category updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createCategory.mutateAsync({
          name: formData.name,
          type: formData.type,
          parentId: formData.parentId,
          sortOrder: formData.sortOrder,
          isActive: formData.isActive,
          countryCode: formData.countryCode || undefined,
          flagSvgUrl: formData.flagSvgUrl || undefined,
        });
        toast({
          title: "Category created",
          description: `${formData.name} has been created.`,
        });
      }
      setIsCreateDialogOpen(false);
      setSelectedCategory(null);
      setFormData({ name: "", type: "LIVE", parentId: null, sortOrder: 0, isActive: true, countryCode: "", flagSvgUrl: "" });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save category.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedCategory) return;
    try {
      await deleteCategory.mutateAsync(selectedCategory.id);
      toast({
        title: "Category deleted",
        description: `${selectedCategory.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedCategory(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete category.",
        variant: "destructive",
      });
    }
  };

  const openDeleteDialog = (category: CategoryNode) => {
    setSelectedCategory(category);
    setIsDeleteDialogOpen(true);
  };

  // Get potential parent categories for the form
  const potentialParents = useMemo(() => {
    // Filter categories of the same type, excluding the current category and its descendants
    return categories.filter((c) => c.type === formData.type);
  }, [categories, formData.type]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load categories</h2>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Categories</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage content categories with hierarchical organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => {
            setSelectedCategory(null);
            setFormData({ name: "", type: "LIVE", parentId: null, sortOrder: 0, isActive: true, countryCode: "", flagSvgUrl: "" });
            setIsCreateDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-500/10 p-3">
                <Tv className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categoryStats.LIVE}</p>
                <p className="text-sm text-muted-foreground">Live Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-purple-500/10 p-3">
                <Film className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categoryStats.VOD}</p>
                <p className="text-sm text-muted-foreground">Movie Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-500/10 p-3">
                <Film className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categoryStats.SERIES}</p>
                <p className="text-sm text-muted-foreground">Series Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-orange-500/10 p-3">
                <Radio className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{categoryStats.RADIO}</p>
                <p className="text-sm text-muted-foreground">Radio Categories</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderTree className="h-5 w-5" />
            Category Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as StreamType | "all")}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="LIVE">Live TV</SelectItem>
                <SelectItem value="VOD">VOD</SelectItem>
                <SelectItem value="SERIES">Series</SelectItem>
                <SelectItem value="RADIO">Radio</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CategoryTree
            categories={filteredCategories}
            onEdit={handleEdit}
            onDelete={openDeleteDialog}
            onAddChild={handleAddChild}
            onMove={handleMove}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedCategory ? "Edit Category" : formData.parentId ? "Add Subcategory" : "Create Category"}
            </DialogTitle>
            <DialogDescription>
              {selectedCategory 
                ? "Update category information below." 
                : formData.parentId
                ? "Create a new subcategory under the selected parent."
                : "Fill in the details to create a new root category."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter category name"
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(v) => setFormData({ 
                  ...formData, 
                  type: v as StreamType,
                  parentId: null // Reset parent when type changes
                })}
                disabled={!!selectedCategory || !!formData.parentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LIVE">Live TV</SelectItem>
                  <SelectItem value="VOD">VOD</SelectItem>
                  <SelectItem value="SERIES">Series</SelectItem>
                  <SelectItem value="RADIO">Radio</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="parentId">Parent Category</Label>
              <CategorySelect
                categories={potentialParents}
                value={formData.parentId}
                onChange={(value) => setFormData({ ...formData, parentId: value })}
                excludeId={selectedCategory?.id}
                type={formData.type}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to create a root-level category.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                min={0}
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="isActive">Visible</Label>
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
              disabled={createCategory.isPending || updateCategory.isPending}
            >
              {(createCategory.isPending || updateCategory.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedCategory?.name}&quot;? 
              {selectedCategory?.children && selectedCategory.children.length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This category has subcategories that will also be deleted.
                </span>
              )}
              <span className="block mt-2">
                This will affect all streams in this category. This action cannot be undone.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteCategory.isPending}
            >
              {deleteCategory.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
