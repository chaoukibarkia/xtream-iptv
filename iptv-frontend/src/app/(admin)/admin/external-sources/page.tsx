"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenuSeparator,
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Download,
  Search,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Tv,
  AlertCircle,
  Pencil,
  Trash2,
  MoreHorizontal,
  Globe,
  Play,
  Eye,
  Flag,
  Zap,
  AlertTriangle,
  List,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  useExternalSourcesList,
  useCreateExternalSource,
  useUpdateExternalSource,
  useDeleteExternalSource,
  usePreviewExternalSource,
  useSyncExternalSource,
  useExternalSourceStreams,
  useSyncAllExternalSources,
  useExternalSourcesStatus,
  useCreateFrenchSourcePreset,
  type ExternalSource,
  type CreateExternalSourceData,
  type PreviewResult,
  type ExternalSourceStream,
} from "@/lib/api/hooks/useExternalSources";

type SyncStatus = 'PENDING' | 'SYNCING' | 'SUCCESS' | 'FAILED' | 'PARTIAL';

const statusIcons: Record<SyncStatus, React.ReactNode> = {
  PENDING: <Clock className="h-4 w-4 text-gray-500" />,
  SYNCING: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
  SUCCESS: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  FAILED: <XCircle className="h-4 w-4 text-red-500" />,
  PARTIAL: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
};

const statusColors: Record<SyncStatus, "default" | "secondary" | "destructive" | "outline"> = {
  PENDING: "secondary",
  SYNCING: "secondary",
  SUCCESS: "default",
  FAILED: "destructive",
  PARTIAL: "outline",
};

const defaultFormData: CreateExternalSourceData = {
  name: "",
  description: "",
  m3uUrl: "",
  epgUrl: "",
  isActive: true,
  autoSync: false,
  syncIntervalHours: 24,
  defaultStreamType: "LIVE",
  createCategories: true,
  updateExisting: true,
  categoryPrefix: "",
  sourceCountry: "",
  sourceLanguage: "",
  tags: [],
};

export default function ExternalSourcesPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [syncingId, setSyncingId] = useState<number | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [isStreamsDialogOpen, setIsStreamsDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<ExternalSource | null>(null);
  const [deleteStreams, setDeleteStreams] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CreateExternalSourceData>(defaultFormData);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);

  // Streams dialog state
  const [streamsSourceId, setStreamsSourceId] = useState<number | null>(null);
  const [streamsPage, setStreamsPage] = useState(1);

  // API hooks
  const { data, isLoading, error, refetch } = useExternalSourcesList({
    search: searchTerm || undefined,
  });
  const { data: statusData } = useExternalSourcesStatus();
  const createSource = useCreateExternalSource();
  const updateSource = useUpdateExternalSource();
  const deleteSource = useDeleteExternalSource();
  const previewSource = usePreviewExternalSource();
  const syncSource = useSyncExternalSource();
  const syncAllSources = useSyncAllExternalSources();
  const createFrenchPreset = useCreateFrenchSourcePreset();
  const { data: streamsData, isLoading: streamsLoading } = useExternalSourceStreams(
    streamsSourceId || 0,
    streamsPage,
    20
  );

  const sources = data?.sources || [];
  const pagination = data?.pagination;
  const statusSummary = statusData?.summary;

  const filteredSources = sources.filter(
    (source) =>
      source.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      source.m3uUrl.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalImported = sources.reduce((acc, s) => acc + (s.importedChannels || 0), 0);
  const totalFailed = sources.reduce((acc, s) => acc + (s.failedChannels || 0), 0);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!isCreateDialogOpen) {
      setFormData(defaultFormData);
      setSelectedSource(null);
      setPreviewResult(null);
      setPreviewUrl("");
    }
  }, [isCreateDialogOpen]);

  const handleEdit = (source: ExternalSource) => {
    setSelectedSource(source);
    setFormData({
      name: source.name,
      description: source.description || "",
      m3uUrl: source.m3uUrl,
      epgUrl: source.epgUrl || "",
      isActive: source.isActive,
      autoSync: source.autoSync,
      syncIntervalHours: source.syncIntervalHours,
      defaultStreamType: source.defaultStreamType,
      createCategories: source.createCategories,
      updateExisting: source.updateExisting,
      categoryPrefix: source.categoryPrefix || "",
      sourceCountry: source.sourceCountry || "",
      sourceLanguage: source.sourceLanguage || "",
      tags: source.tags || [],
    });
    setIsCreateDialogOpen(true);
  };

  const handlePreview = async () => {
    const urlToPreview = previewUrl || formData.m3uUrl;
    if (!urlToPreview) {
      toast({
        title: "Error",
        description: "Please enter an M3U URL to preview",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await previewSource.mutateAsync(urlToPreview);
      setPreviewResult(result);
      if (result.epgUrl && !formData.epgUrl) {
        setFormData({ ...formData, epgUrl: result.epgUrl });
      }
    } catch {
      toast({
        title: "Preview failed",
        description: "Unable to fetch or parse the M3U URL",
        variant: "destructive",
      });
    }
  };

  const handleSync = async (source: ExternalSource) => {
    setSyncingId(source.id);
    try {
      const result = await syncSource.mutateAsync({ id: source.id });
      toast({
        title: "Sync completed",
        description: `Imported ${result.importedChannels} channels, updated ${result.updatedChannels}, ${result.failedChannels} failed.`,
      });
      refetch();
    } catch {
      toast({
        title: "Sync failed",
        description: "Failed to sync external source.",
        variant: "destructive",
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    try {
      const result = await syncAllSources.mutateAsync();
      toast({
        title: "Sync all completed",
        description: result.message,
      });
      refetch();
    } catch {
      toast({
        title: "Sync failed",
        description: "Failed to sync all sources.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim() || !formData.m3uUrl.trim()) {
      toast({
        title: "Error",
        description: "Name and M3U URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (selectedSource) {
        await updateSource.mutateAsync({
          id: selectedSource.id,
          data: formData,
        });
        toast({
          title: "Source updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createSource.mutateAsync(formData);
        toast({
          title: "Source added",
          description: `${formData.name} has been added.`,
        });
      }
      setIsCreateDialogOpen(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save external source.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedSource) return;
    try {
      await deleteSource.mutateAsync({ id: selectedSource.id, deleteStreams });
      toast({
        title: "Source deleted",
        description: `${selectedSource.name} has been deleted${deleteStreams ? " along with its streams" : ""}.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedSource(null);
      setDeleteStreams(false);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete external source.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFrenchPreset = async () => {
    try {
      const result = await createFrenchPreset.mutateAsync();
      toast({
        title: "French source added",
        description: result.message,
      });
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to create French source preset.",
        variant: "destructive",
      });
    }
  };

  const handleViewStreams = (source: ExternalSource) => {
    setStreamsSourceId(source.id);
    setStreamsPage(1);
    setSelectedSource(source);
    setIsStreamsDialogOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load external sources</h2>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">External M3U Sources</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Import and sync channels from external M3U playlists
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} className="flex-shrink-0">
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="outline"
            onClick={handleCreateFrenchPreset}
            disabled={createFrenchPreset.isPending}
            className="flex-1 sm:flex-none"
          >
            {createFrenchPreset.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Flag className="mr-2 h-4 w-4" />
            )}
            Add French TV
          </Button>
          <Button
            onClick={() => {
              setSelectedSource(null);
              setFormData(defaultFormData);
              setIsCreateDialogOpen(true);
            }}
            className="flex-1 sm:flex-none"
          >
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
                <Globe className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{sources.length}</p>
                <p className="text-sm text-muted-foreground">Sources</p>
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
                <p className="text-2xl font-bold">{totalImported}</p>
                <p className="text-sm text-muted-foreground">Imported</p>
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
                <p className="text-2xl font-bold">{statusSummary?.success || 0}</p>
                <p className="text-sm text-muted-foreground">Synced OK</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-red-500/10 p-3">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalFailed}</p>
                <p className="text-sm text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            External Sources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleSyncAll}
              disabled={syncAllSources.isPending}
              className="w-full sm:w-auto"
            >
              {syncAllSources.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Zap className="mr-2 h-4 w-4" />
              )}
              Sync All
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
                  No external sources found. Add one to get started.
                </CardContent>
              </Card>
            ) : (
              filteredSources.map((source) => (
                <Card key={source.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {statusIcons[source.syncStatus]}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="font-medium truncate">{source.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {source.m3uUrl}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={statusColors[source.syncStatus]} className="text-xs">
                            {source.syncStatus}
                          </Badge>
                          {source.autoSync && (
                            <Badge variant="outline" className="text-xs">
                              Auto-sync {source.syncIntervalHours}h
                            </Badge>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground space-y-0.5">
                          <p>
                            Imported: {source.importedChannels} / {source.totalChannels}
                            {source.failedChannels > 0 && (
                              <span className="text-red-500 ml-1">
                                ({source.failedChannels} failed)
                              </span>
                            )}
                          </p>
                          <p>
                            Last sync:{" "}
                            {source.lastSync
                              ? new Date(source.lastSync).toLocaleString()
                              : "Never"}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => handleSync(source)}
                          disabled={syncingId === source.id}
                        >
                          {syncingId === source.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleViewStreams(source)}>
                              <List className="mr-2 h-4 w-4" />
                              View Streams
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(source)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
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
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Channels</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Auto-Sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Skeleton className="h-10 w-48" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-20" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-32" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-20 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredSources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No external sources found. Add one to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSources.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{source.name}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                            {source.m3uUrl}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {statusIcons[source.syncStatus]}
                          <Badge variant={statusColors[source.syncStatus]}>
                            {source.syncStatus}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <span className="text-green-600">{source.importedChannels}</span>
                          <span className="text-muted-foreground"> / {source.totalChannels}</span>
                          {source.failedChannels > 0 && (
                            <span className="text-red-500 ml-1">
                              ({source.failedChannels} failed)
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {source.lastSync
                          ? new Date(source.lastSync).toLocaleString()
                          : "Never"}
                        {source.lastSyncError && (
                          <p className="text-xs text-red-500 truncate max-w-[200px]">
                            {source.lastSyncError}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        {source.autoSync ? (
                          <Badge variant="outline">Every {source.syncIntervalHours}h</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSync(source)}
                            disabled={syncingId === source.id}
                          >
                            {syncingId === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewStreams(source)}>
                                <List className="mr-2 h-4 w-4" />
                                View Streams
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(source)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedSource ? "Edit External Source" : "Add External Source"}
            </DialogTitle>
            <DialogDescription>
              {selectedSource
                ? "Update external source configuration below."
                : "Add a new M3U playlist source to import channels from."}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., French Free TV"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="m3uUrl">M3U URL *</Label>
                <div className="flex gap-2">
                  <Input
                    id="m3uUrl"
                    value={formData.m3uUrl}
                    onChange={(e) => setFormData({ ...formData, m3uUrl: e.target.value })}
                    placeholder="https://example.com/playlist.m3u"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePreview}
                    disabled={previewSource.isPending || !formData.m3uUrl}
                  >
                    {previewSource.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="epgUrl">EPG URL (optional)</Label>
                <Input
                  id="epgUrl"
                  value={formData.epgUrl}
                  onChange={(e) => setFormData({ ...formData, epgUrl: e.target.value })}
                  placeholder="https://example.com/epg.xml"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description..."
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sourceCountry">Country</Label>
                  <Input
                    id="sourceCountry"
                    value={formData.sourceCountry}
                    onChange={(e) => setFormData({ ...formData, sourceCountry: e.target.value })}
                    placeholder="e.g., FR"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="sourceLanguage">Language</Label>
                  <Input
                    id="sourceLanguage"
                    value={formData.sourceLanguage}
                    onChange={(e) => setFormData({ ...formData, sourceLanguage: e.target.value })}
                    placeholder="e.g., French"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="options" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="defaultStreamType">Default Stream Type</Label>
                <Select
                  value={formData.defaultStreamType}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      defaultStreamType: value as "LIVE" | "VOD" | "SERIES" | "RADIO",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LIVE">Live Stream</SelectItem>
                    <SelectItem value="VOD">Video on Demand</SelectItem>
                    <SelectItem value="SERIES">Series</SelectItem>
                    <SelectItem value="RADIO">Radio</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="categoryPrefix">Category Prefix</Label>
                <Input
                  id="categoryPrefix"
                  value={formData.categoryPrefix}
                  onChange={(e) => setFormData({ ...formData, categoryPrefix: e.target.value })}
                  placeholder="e.g., FR:"
                />
                <p className="text-xs text-muted-foreground">
                  Prefix added to category names (e.g., "FR: Sports")
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="syncIntervalHours">Sync Interval (hours)</Label>
                <Input
                  id="syncIntervalHours"
                  type="number"
                  min={1}
                  max={168}
                  value={formData.syncIntervalHours}
                  onChange={(e) =>
                    setFormData({ ...formData, syncIntervalHours: parseInt(e.target.value) || 24 })
                  }
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="isActive">Active</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable this source for syncing
                    </p>
                  </div>
                  <Switch
                    id="isActive"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="autoSync">Auto-Sync</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically sync at interval
                    </p>
                  </div>
                  <Switch
                    id="autoSync"
                    checked={formData.autoSync}
                    onCheckedChange={(checked) => setFormData({ ...formData, autoSync: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="createCategories">Create Categories</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-create categories from M3U groups
                    </p>
                  </div>
                  <Switch
                    id="createCategories"
                    checked={formData.createCategories}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, createCategories: checked })
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="updateExisting">Update Existing</Label>
                    <p className="text-xs text-muted-foreground">
                      Update existing streams on re-sync
                    </p>
                  </div>
                  <Switch
                    id="updateExisting"
                    checked={formData.updateExisting}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, updateExisting: checked })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="preview" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label>Preview URL</Label>
                <div className="flex gap-2">
                  <Input
                    value={previewUrl || formData.m3uUrl}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    placeholder="Enter M3U URL to preview..."
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewSource.isPending}
                  >
                    {previewSource.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Preview
                  </Button>
                </div>
              </div>

              {previewResult && (
                <div className="space-y-4">
                  {previewResult.success && previewResult.stats ? (
                    <>
                      <Card>
                        <CardHeader className="py-3">
                          <CardTitle className="text-sm">M3U Statistics</CardTitle>
                        </CardHeader>
                        <CardContent className="py-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Total Entries</p>
                              <p className="font-medium">{previewResult.stats.totalEntries}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Categories</p>
                              <p className="font-medium">{previewResult.stats.categories}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">With EPG ID</p>
                              <p className="font-medium">{previewResult.stats.withEpgId}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">With Logo</p>
                              <p className="font-medium">{previewResult.stats.withLogo}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">With Catchup</p>
                              <p className="font-medium">{previewResult.stats.withCatchup}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {previewResult.sampleEntries && previewResult.sampleEntries.length > 0 && (
                        <Card>
                          <CardHeader className="py-3">
                            <CardTitle className="text-sm">Sample Entries</CardTitle>
                          </CardHeader>
                          <CardContent className="py-2">
                            <div className="space-y-2 text-sm">
                              {previewResult.sampleEntries.slice(0, 5).map((entry, i) => (
                                <div key={i} className="flex items-center gap-2 py-1 border-b last:border-0">
                                  {entry.tvgLogo && (
                                    <img
                                      src={entry.tvgLogo}
                                      alt=""
                                      className="w-6 h-6 rounded object-contain bg-muted"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{entry.name}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {entry.groupTitle || "Uncategorized"}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </>
                  ) : (
                    <Card className="border-destructive">
                      <CardContent className="py-4">
                        <div className="flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          <span>{previewResult.error || "Failed to parse M3U"}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateOrUpdate}
              disabled={createSource.isPending || updateSource.isPending}
            >
              {(createSource.isPending || updateSource.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedSource ? "Update" : "Add Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete External Source</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedSource?.name}&quot;?
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between py-4">
            <div>
              <Label htmlFor="deleteStreams">Also delete imported streams</Label>
              <p className="text-xs text-muted-foreground">
                Remove all {selectedSource?.importedChannels || 0} streams from this source
              </p>
            </div>
            <Switch
              id="deleteStreams"
              checked={deleteStreams}
              onCheckedChange={setDeleteStreams}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSource.isPending}
            >
              {deleteSource.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Streams Dialog */}
      <Dialog open={isStreamsDialogOpen} onOpenChange={setIsStreamsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Streams from {selectedSource?.name}</DialogTitle>
            <DialogDescription>
              Showing {streamsData?.streams?.length || 0} of{" "}
              {streamsData?.pagination?.total || 0} imported streams
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[50vh]">
            {streamsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {streamsData?.streams?.map((stream: ExternalSourceStream) => (
                    <TableRow key={stream.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {stream.logoUrl && (
                            <img
                              src={stream.logoUrl}
                              alt=""
                              className="w-6 h-6 rounded object-contain bg-muted"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <span className="truncate max-w-[200px]">{stream.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{stream.category?.name || "Uncategorized"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{stream.streamType}</Badge>
                      </TableCell>
                      <TableCell>
                        {stream.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {streamsData?.pagination && streamsData.pagination.pages > 1 && (
            <div className="flex justify-between items-center pt-4">
              <p className="text-sm text-muted-foreground">
                Page {streamsData.pagination.page} of {streamsData.pagination.pages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStreamsPage((p) => Math.max(1, p - 1))}
                  disabled={streamsData.pagination.page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStreamsPage((p) => p + 1)}
                  disabled={streamsData.pagination.page >= streamsData.pagination.pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStreamsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
