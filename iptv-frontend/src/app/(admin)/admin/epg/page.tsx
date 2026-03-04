"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Tv,
  Upload,
  AlertCircle,
  Pencil,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  useEpgSourcesList,
  useCreateEpgSource,
  useUpdateEpgSource,
  useDeleteEpgSource,
  useRefreshEpgSource,
  useRefreshAllEpgSources,
  type EpgSource,
} from "@/lib/api/hooks/useEpg";

const statusIcons = {
  active: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  updating: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
};

const statusColors = {
  active: "default",
  updating: "secondary",
  error: "destructive",
} as const;

export default function EpgPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<EpgSource | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    url: "",
    updateInterval: 6,
    isActive: true,
  });

  // API hooks
  const { data, isLoading, error, refetch } = useEpgSourcesList({
    search: searchTerm || undefined,
  });
  const createEpgSource = useCreateEpgSource();
  const updateEpgSource = useUpdateEpgSource();
  const deleteEpgSource = useDeleteEpgSource();
  const refreshEpgSource = useRefreshEpgSource();
  const refreshAllEpgSources = useRefreshAllEpgSources();

  const sources = ((data as unknown as { data?: EpgSource[] })?.data || 
    (Array.isArray(data) ? data : [])) as EpgSource[];

  const filteredSources = sources.filter(
    (source) =>
      source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMapped = sources.reduce((acc, s) => acc + (s.channelsMapped || 0), 0);
  const totalChannels = sources.reduce((acc, s) => acc + (s.totalChannels || 0), 0);
  const coveragePercent = totalChannels > 0 ? Math.round((totalMapped / totalChannels) * 100) : 0;

  const handleEdit = (source: EpgSource) => {
    setSelectedSource(source);
    setFormData({
      name: source.name,
      url: source.url,
      updateInterval: source.updateInterval || 6,
      isActive: source.isActive,
    });
    setIsCreateDialogOpen(true);
  };

  const handleRefreshSource = async (source: EpgSource) => {
    setRefreshingId(source.id);
    try {
      await refreshEpgSource.mutateAsync(source.id);
      toast({
        title: "EPG refreshed",
        description: `${source.name} has been refreshed.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to refresh EPG source.",
        variant: "destructive",
      });
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRefreshAll = async () => {
    try {
      await refreshAllEpgSources.mutateAsync();
      toast({
        title: "Refreshing all sources",
        description: "All EPG sources are being updated.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to refresh EPG sources.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim() || !formData.url.trim()) {
      toast({
        title: "Error",
        description: "Name and URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (selectedSource) {
        await updateEpgSource.mutateAsync({
          id: selectedSource.id,
          data: {
            name: formData.name,
            url: formData.url,
            updateInterval: formData.updateInterval,
            isActive: formData.isActive,
          },
        });
        toast({
          title: "EPG source updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createEpgSource.mutateAsync({
          name: formData.name,
          url: formData.url,
          updateInterval: formData.updateInterval,
          isActive: formData.isActive,
        });
        toast({
          title: "EPG source added",
          description: `${formData.name} has been added.`,
        });
      }
      setIsCreateDialogOpen(false);
      setSelectedSource(null);
      setFormData({ name: "", url: "", updateInterval: 6, isActive: true });
    } catch {
      toast({
        title: "Error",
        description: "Failed to save EPG source.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedSource) return;
    try {
      await deleteEpgSource.mutateAsync(selectedSource.id);
      toast({
        title: "EPG source deleted",
        description: `${selectedSource.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedSource(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete EPG source.",
        variant: "destructive",
      });
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load EPG sources</h2>
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">EPG Management</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage Electronic Program Guide sources and mappings
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} className="flex-shrink-0">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none">
            <Upload className="mr-2 h-4 w-4" />
            Import XMLTV
          </Button>
          <Button onClick={() => {
            setSelectedSource(null);
            setFormData({ name: "", url: "", updateInterval: 6, isActive: true });
            setIsCreateDialogOpen(true);
          }} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Add Source
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sources.length}</p>
                <p className="text-sm text-muted-foreground">EPG Sources</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-green-500/10 p-3">
                <Tv className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalMapped}</p>
                <p className="text-sm text-muted-foreground">Mapped Channels</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-500/10 p-3">
                <CheckCircle2 className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{coveragePercent}%</p>
                <p className="text-sm text-muted-foreground">Coverage</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-orange-500/10 p-3">
                <Clock className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">7 days</p>
                <p className="text-sm text-muted-foreground">Guide Data</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            EPG Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search EPG sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button 
              variant="outline" 
              onClick={handleRefreshAll}
              disabled={refreshAllEpgSources.isPending}
              className="w-full sm:w-auto"
            >
              {refreshAllEpgSources.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Update All
            </Button>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-48" />
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-20" />
                          <Skeleton className="h-5 w-16" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredSources.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No EPG sources found.
                </CardContent>
              </Card>
            ) : (
              filteredSources.map((source) => (
                <Card key={source.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {statusIcons[source.status as keyof typeof statusIcons] || statusIcons.error}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="font-medium truncate">{source.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {source.url}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={statusColors[source.status as keyof typeof statusColors] || "secondary"} className="text-xs">
                            {source.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {source.updateInterval || 6}h interval
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Channels: {source.channelsMapped || 0} / {source.totalChannels || 0}</span>
                          </div>
                          <Progress
                            value={source.totalChannels ? ((source.channelsMapped || 0) / source.totalChannels) * 100 : 0}
                            className="h-1.5"
                          />
                        </div>

                        <p className="text-xs text-muted-foreground">
                          Last update: {source.lastImport 
                            ? new Date(source.lastImport).toLocaleString()
                            : 'Never'
                          }
                        </p>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        <Button 
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleRefreshSource(source)}
                          disabled={refreshingId === source.id}
                        >
                          {refreshingId === source.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(source)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                setSelectedSource(source);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-md border overflow-x-auto">
            <Table className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Update</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Interval</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No EPG sources found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {source.url}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusIcons[source.status as keyof typeof statusIcons] || statusIcons.error}
                          <Badge variant={statusColors[source.status as keyof typeof statusColors] || "secondary"}>
                            {source.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {source.lastImport 
                          ? new Date(source.lastImport).toLocaleString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{source.channelsMapped || 0}</span>
                            <span className="text-muted-foreground">
                              / {source.totalChannels || 0}
                            </span>
                          </div>
                          <Progress
                            value={source.totalChannels ? ((source.channelsMapped || 0) / source.totalChannels) * 100 : 0}
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell>{source.updateInterval || 6} hours</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleRefreshSource(source)}
                            disabled={refreshingId === source.id}
                          >
                            {refreshingId === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(source)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => {
                                  setSelectedSource(source);
                                  setIsDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedSource ? "Edit EPG Source" : "Add EPG Source"}</DialogTitle>
            <DialogDescription>
              {selectedSource 
                ? "Update EPG source configuration below." 
                : "Fill in the details to add a new EPG source."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main EPG Provider"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="url">XMLTV URL</Label>
              <Input
                id="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="http://example.com/epg.xml"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="updateInterval">Update Interval (hours)</Label>
              <Input
                id="updateInterval"
                type="number"
                min={1}
                max={168}
                value={formData.updateInterval}
                onChange={(e) => setFormData({ ...formData, updateInterval: parseInt(e.target.value) || 6 })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="isActive">Active</Label>
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
              disabled={createEpgSource.isPending || updateEpgSource.isPending}
            >
              {(createEpgSource.isPending || updateEpgSource.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedSource ? "Update" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete EPG Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedSource?.name}&quot;? 
              This will remove all channel mappings. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteEpgSource.isPending}
            >
              {deleteEpgSource.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
