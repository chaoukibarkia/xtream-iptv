"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  Tv,
  Users,
  Plus,
  Trash2,
  Loader2,
  Search,
  X,
  Film,
  Radio,
  Pencil,
  Check,
  CheckSquare,
  Square,
  FolderPlus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { StreamLogo, StreamLogoContainer } from "@/components/ui/stream-logo";

import {
  useBouquet,
  useUpdateBouquet,
  useAddStreamsToBouquet,
  useRemoveStreamsFromBouquet,
  useAddLinesToBouquet,
  useRemoveLinesFromBouquet,
} from "@/lib/api/hooks/useBouquets";
import { useStreams } from "@/lib/api/hooks/useStreams";
import { useLines } from "@/lib/api/hooks/useLines";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { api } from "@/lib/api/client";

const streamTypeIcons: Record<string, React.ElementType> = {
  LIVE: Tv,
  VOD: Film,
  SERIES: Film,
  RADIO: Radio,
};

export default function BouquetDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const bouquetId = parseInt(params.id as string);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [addStreamsOpen, setAddStreamsOpen] = useState(false);
  const [addLinesOpen, setAddLinesOpen] = useState(false);
  const [addByCategoryOpen, setAddByCategoryOpen] = useState(false);
  const [streamSearch, setStreamSearch] = useState("");
  const [debouncedStreamSearch, setDebouncedStreamSearch] = useState("");
  const [streamTypeFilter, setStreamTypeFilter] = useState<string>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<number | null>(null);
  const [lineSearch, setLineSearch] = useState("");
  const [selectedStreamIds, setSelectedStreamIds] = useState<number[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [removingStreamIds, setRemovingStreamIds] = useState<Set<number>>(new Set());
  const [removingLineIds, setRemovingLineIds] = useState<Set<number>>(new Set());
  const [isAddingByCategory, setIsAddingByCategory] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);

  // Debounce search to avoid too many API calls
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedStreamSearch(streamSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [streamSearch]);

  const { data: bouquet, isLoading } = useBouquet(bouquetId);

  // Fetch streams with server-side filtering
  const { data: streamsData, isLoading: streamsLoading } = useStreams({
    pageSize: 500,
    search: debouncedStreamSearch || undefined,
    type: streamTypeFilter !== "ALL" ? streamTypeFilter as any : undefined,
    categoryId: categoryFilter || undefined,
  }, { enabled: addStreamsOpen });

  const { data: linesData } = useLines({ pageSize: 1000 });
  const { data: categories } = useCategories();

  const updateBouquet = useUpdateBouquet();
  const addStreams = useAddStreamsToBouquet();
  const removeStreams = useRemoveStreamsFromBouquet();
  const addLines = useAddLinesToBouquet();
  const removeLines = useRemoveLinesFromBouquet();

  // Get streams not in this bouquet
  const existingStreamIds = useMemo(() =>
    new Set((bouquet?.streams || []).map((s) => s.streamId)),
    [bouquet?.streams]
  );

  const streamsArray = useMemo(() => {
    if (Array.isArray(streamsData)) return streamsData;
    if (streamsData?.data) return streamsData.data;
    if ((streamsData as any)?.streams) return (streamsData as any).streams;
    return [];
  }, [streamsData]);

  // Filter out streams already in this bouquet (allow streams from other bouquets)
  const availableStreams = useMemo(() =>
    streamsArray.filter((s: any) => !existingStreamIds.has(s.id)),
    [streamsArray, existingStreamIds]
  );

  // Get lines not in this bouquet
  const existingLineIds = useMemo(() =>
    new Set((bouquet?.lines || []).map((l) => l.lineId)),
    [bouquet?.lines]
  );

  const linesArray = useMemo(() =>
    Array.isArray(linesData) ? linesData : [],
    [linesData]
  );

  const availableLines = useMemo(() =>
    linesArray.filter((l: any) =>
      !existingLineIds.has(l.id) &&
      l.username.toLowerCase().includes(lineSearch.toLowerCase())
    ),
    [linesArray, existingLineIds, lineSearch]
  );

  // Group categories by type for the "Add by Category" feature
  const categoriesByType = useMemo(() => {
    if (!categories) return {};
    const grouped: Record<string, typeof categories> = {};
    categories.forEach((cat: any) => {
      const type = cat.type || 'LIVE';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(cat);
    });
    return grouped;
  }, [categories]);

  const handleSaveName = async () => {
    if (!editName.trim()) return;

    try {
      await updateBouquet.mutateAsync({ id: bouquetId, data: { name: editName } });
      toast({ title: "Success", description: "Bouquet name updated" });
      setIsEditing(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddStreams = async () => {
    if (selectedStreamIds.length === 0) return;

    try {
      await addStreams.mutateAsync({ bouquetId, streamIds: selectedStreamIds });
      toast({
        title: "Success",
        description: `Added ${selectedStreamIds.length} stream(s) to bouquet`,
      });
      setAddStreamsOpen(false);
      setSelectedStreamIds([]);
      setStreamSearch("");
      setCategoryFilter(null);
      setStreamTypeFilter("ALL");
      setDisplayLimit(100);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Select/deselect all visible streams
  const handleSelectAllVisible = useCallback(() => {
    const visibleIds = availableStreams.slice(0, displayLimit).map((s: any) => s.id);
    const allSelected = visibleIds.every((id: number) => selectedStreamIds.includes(id));

    if (allSelected) {
      // Deselect all visible
      setSelectedStreamIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      // Select all visible (add to existing selection)
      setSelectedStreamIds(prev => [...new Set([...prev, ...visibleIds])]);
    }
  }, [availableStreams, displayLimit, selectedStreamIds]);

  // Add streams by category
  const handleAddByCategory = async () => {
    if (selectedCategoryIds.length === 0) return;

    setIsAddingByCategory(true);
    try {
      // Fetch all streams for selected categories and add them
      let totalAdded = 0;
      for (const catId of selectedCategoryIds) {
        // Use the API client to get streams by category
        const data = await api.get<any>('/admin/streams', { categoryId: catId, limit: 10000 });
        const streams = data.streams || data.data || data || [];
        const streamIds = streams.map((s: any) => s.id).filter((id: number) => !existingStreamIds.has(id));

        if (streamIds.length > 0) {
          await addStreams.mutateAsync({ bouquetId, streamIds });
          totalAdded += streamIds.length;
        }
      }

      toast({
        title: "Success",
        description: `Added ${totalAdded} stream(s) from ${selectedCategoryIds.length} category(ies)`,
      });
      setAddByCategoryOpen(false);
      setSelectedCategoryIds([]);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsAddingByCategory(false);
    }
  };

  const handleRemoveStream = async (streamId: number) => {
    setRemovingStreamIds((prev) => new Set(prev).add(streamId));

    try {
      await removeStreams.mutateAsync({ bouquetId, streamIds: [streamId] });
      toast({ title: "Success", description: "Stream removed from bouquet" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setRemovingStreamIds((prev) => {
        const next = new Set(prev);
        next.delete(streamId);
        return next;
      });
    }
  };

  const handleAddLines = async () => {
    if (selectedLineIds.length === 0) return;

    try {
      await addLines.mutateAsync({ bouquetId, lineIds: selectedLineIds });
      toast({
        title: "Success",
        description: `Added ${selectedLineIds.length} user(s) to bouquet`,
      });
      setAddLinesOpen(false);
      setSelectedLineIds([]);
      setLineSearch("");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveLine = async (lineId: number) => {
    setRemovingLineIds((prev) => new Set(prev).add(lineId));

    try {
      await removeLines.mutateAsync({ bouquetId, lineIds: [lineId] });
      toast({ title: "Success", description: "Line removed from bouquet" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setRemovingLineIds((prev) => {
        const next = new Set(prev);
        next.delete(lineId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!bouquet) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold">Bouquet not found</h2>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/admin/bouquets")}>
          Back to Bouquets
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/bouquets")} className="flex-shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="max-w-sm text-2xl font-bold h-10"
                autoFocus
              />
              <Button size="icon" onClick={handleSaveName} disabled={updateBouquet.isPending}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold">{bouquet.name}</h1>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditName(bouquet.name);
                  setIsEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="text-muted-foreground">
            Created {new Date(bouquet.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streams in Bouquet</CardTitle>
            <Tv className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bouquet._count.streams}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Users with Access</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bouquet._count.users}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="streams">
        <TabsList>
          <TabsTrigger value="streams" className="gap-2">
            <Tv className="h-4 w-4" />
            Streams ({bouquet._count.streams})
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Users ({bouquet._count.users})
          </TabsTrigger>
        </TabsList>

        {/* Streams Tab */}
        <TabsContent value="streams">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Streams</CardTitle>
                <CardDescription>Streams included in this bouquet</CardDescription>
              </div>
              <Button onClick={() => setAddStreamsOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Streams
              </Button>
            </CardHeader>
            <CardContent>
              {(bouquet.streams || []).length === 0 ? (
                <div className="text-center py-8">
                  <Tv className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">No streams in this bouquet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setAddStreamsOpen(true)}>
                    Add Streams
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile Cards View */}
                  <div className="md:hidden space-y-3">
                    {(bouquet.streams || []).map((bs) => {
                      const Icon = streamTypeIcons[bs.stream.streamType] || Tv;
                      return (
                        <Card key={bs.id} className="overflow-hidden">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <StreamLogoContainer className="h-10 w-10">
                                <StreamLogo 
                                  logoUrl={bs.stream.logoUrl} 
                                  alt={bs.stream.name}
                                  className="h-8 w-8 object-contain"
                                  iconClassName="h-5 w-5 text-muted-foreground"
                                />
                              </StreamLogoContainer>
                              <div className="flex-1 min-w-0 space-y-1">
                                <span className="font-medium truncate block">{bs.stream.name}</span>
                                <div className="flex flex-wrap gap-1.5">
                                  <Badge variant="outline" className="text-xs">{bs.stream.streamType}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {bs.stream.category?.name || "Uncategorized"}
                                  </span>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="flex-shrink-0"
                                onClick={() => handleRemoveStream(bs.streamId)}
                                disabled={removingStreamIds.has(bs.streamId)}
                              >
                                {removingStreamIds.has(bs.streamId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                  <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Stream</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bouquet.streams || []).map((bs) => {
                        const Icon = streamTypeIcons[bs.stream.streamType] || Tv;
                        return (
                          <TableRow key={bs.id}>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <StreamLogoContainer className="h-10 w-10">
                                  <StreamLogo 
                                    logoUrl={bs.stream.logoUrl} 
                                    alt={bs.stream.name}
                                    className="h-8 w-8 object-contain"
                                    iconClassName="h-5 w-5 text-muted-foreground"
                                  />
                                </StreamLogoContainer>
                                <span className="font-medium">{bs.stream.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{bs.stream.streamType}</Badge>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground">
                                {bs.stream.category?.name || "Uncategorized"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveStream(bs.streamId)}
                                disabled={removingStreamIds.has(bs.streamId)}
                              >
                                {removingStreamIds.has(bs.streamId) ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Users</CardTitle>
                <CardDescription>Users with access to this bouquet</CardDescription>
              </div>
              <Button onClick={() => setAddLinesOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Users
              </Button>
            </CardHeader>
            <CardContent>
              {(bouquet.lines || []).length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-muted-foreground">No users assigned to this bouquet</p>
                  <Button variant="outline" className="mt-4" onClick={() => setAddLinesOpen(true)}>
                    Add Users
                  </Button>
                </div>
              ) : (
                <>
                  {/* Mobile Cards View */}
                  <div className="md:hidden space-y-3">
                    {(bouquet.lines || []).map((bu) => (
                      <Card key={bu.id} className="overflow-hidden">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-1">
                              <span className="font-medium truncate block">{bu.line.username}</span>
                              <span className="text-xs text-muted-foreground truncate block">
                                {bu.line.expirationDate ? new Date(bu.line.expirationDate).toLocaleDateString() : "No expiration"}
                              </span>
                              <Badge
                                variant={bu.line.status === "ACTIVE" ? "default" : "secondary"}
                                className={`text-xs ${
                                  bu.line.status === "ACTIVE"
                                    ? "bg-green-500/20 text-green-400"
                                    : ""
                                }`}
                              >
                                {bu.line.status}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="flex-shrink-0"
                              onClick={() => handleRemoveLine(bu.lineId)}
                              disabled={removingLineIds.has(bu.lineId)}
                            >
                              {removingLineIds.has(bu.lineId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <Table className="min-w-[500px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Username</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(bouquet.lines || []).map((bu) => (
                        <TableRow key={bu.id}>
                          <TableCell className="font-medium">{bu.line.username}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {bu.line.expirationDate ? new Date(bu.line.expirationDate).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={bu.line.status === "ACTIVE" ? "default" : "secondary"}
                              className={
                                bu.line.status === "ACTIVE"
                                  ? "bg-green-500/20 text-green-400"
                                  : ""
                              }
                            >
                              {bu.line.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLine(bu.lineId)}
                              disabled={removingLineIds.has(bu.lineId)}
                            >
                              {removingLineIds.has(bu.lineId) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4 text-red-500" />
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Streams Dialog */}
      <Dialog open={addStreamsOpen} onOpenChange={(open) => {
        setAddStreamsOpen(open);
        if (!open) {
          setStreamSearch("");
          setStreamTypeFilter("ALL");
          setCategoryFilter(null);
          setSelectedStreamIds([]);
          setDisplayLimit(100);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>Add Streams to Bouquet</DialogTitle>
            <DialogDescription>
              Select streams to add to &quot;{bouquet.name}&quot;. Streams can belong to multiple bouquets.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Filters Row */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search streams..."
                  value={streamSearch}
                  onChange={(e) => setStreamSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background"
                value={streamTypeFilter}
                onChange={(e) => {
                  setStreamTypeFilter(e.target.value);
                  setCategoryFilter(null);
                }}
              >
                <option value="ALL">All Types</option>
                <option value="LIVE">Live TV</option>
                <option value="VOD">Movies</option>
                <option value="SERIES">Series</option>
              </select>
              <select
                className="border rounded-md px-3 py-2 text-sm bg-background max-w-[200px]"
                value={categoryFilter || ""}
                onChange={(e) => setCategoryFilter(e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="">All Categories</option>
                {categories?.filter((cat: any) =>
                  streamTypeFilter === "ALL" || cat.type === streamTypeFilter
                ).map((cat: any) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat._count?.streams || 0})
                  </option>
                ))}
              </select>
            </div>

            {/* Selection Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAllVisible}
                  disabled={availableStreams.length === 0}
                >
                  {availableStreams.slice(0, displayLimit).every((s: any) => selectedStreamIds.includes(s.id)) ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Deselect All Visible
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All Visible ({Math.min(displayLimit, availableStreams.length)})
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAddByCategoryOpen(true)}
                >
                  <FolderPlus className="h-4 w-4 mr-2" />
                  Add by Category
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {streamsLoading ? (
                  <span className="flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading...
                  </span>
                ) : (
                  `${availableStreams.length} available`
                )}
              </p>
            </div>

            {/* Stream List */}
            <ScrollArea className="h-[40vh] border rounded-lg">
              {streamsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : availableStreams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {debouncedStreamSearch || categoryFilter || streamTypeFilter !== "ALL"
                    ? "No streams match your filters"
                    : "No available streams found"}
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {availableStreams.slice(0, displayLimit).map((stream: any) => {
                      const Icon = streamTypeIcons[stream.streamType] || Tv;
                      return (
                        <TableRow key={stream.id} className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            if (selectedStreamIds.includes(stream.id)) {
                              setSelectedStreamIds(selectedStreamIds.filter((id) => id !== stream.id));
                            } else {
                              setSelectedStreamIds([...selectedStreamIds, stream.id]);
                            }
                          }}
                        >
                          <TableCell className="w-[40px]">
                            <Checkbox
                              checked={selectedStreamIds.includes(stream.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedStreamIds([...selectedStreamIds, stream.id]);
                                } else {
                                  setSelectedStreamIds(
                                    selectedStreamIds.filter((id) => id !== stream.id)
                                  );
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <StreamLogoContainer className="h-8 w-8">
                                <StreamLogo 
                                  logoUrl={stream.logoUrl} 
                                  alt={stream.name}
                                  className="h-6 w-6 object-contain"
                                  iconClassName="h-4 w-4 text-muted-foreground"
                                />
                              </StreamLogoContainer>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{stream.name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {stream.category?.name || "No category"}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">{stream.streamType}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>

            {/* Load More */}
            {availableStreams.length > displayLimit && (
              <div className="text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDisplayLimit(prev => prev + 100)}
                >
                  Load More ({availableStreams.length - displayLimit} remaining)
                </Button>
              </div>
            )}

            {/* Selection Count */}
            {selectedStreamIds.length > 0 && (
              <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                <p className="text-sm font-medium">
                  {selectedStreamIds.length} stream(s) selected
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStreamIds([])}
                >
                  Clear Selection
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddStreamsOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddStreams}
              disabled={selectedStreamIds.length === 0 || addStreams.isPending}
            >
              {addStreams.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {selectedStreamIds.length > 0 && `(${selectedStreamIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add by Category Dialog */}
      <Dialog open={addByCategoryOpen} onOpenChange={setAddByCategoryOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Streams by Category</DialogTitle>
            <DialogDescription>
              Select categories to add all their streams to &quot;{bouquet.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ScrollArea className="h-[50vh] border rounded-lg p-2">
              {Object.entries(categoriesByType).map(([type, cats]) => (
                <div key={type} className="mb-4">
                  <h4 className="font-semibold text-sm mb-2 sticky top-0 bg-background py-1">
                    {type === 'LIVE' ? 'Live TV' : type === 'VOD' ? 'Movies' : type === 'SERIES' ? 'Series' : type}
                  </h4>
                  <div className="space-y-1">
                    {(cats as any[]).map((cat: any) => (
                      <label
                        key={cat.id}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedCategoryIds.includes(cat.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedCategoryIds([...selectedCategoryIds, cat.id]);
                            } else {
                              setSelectedCategoryIds(selectedCategoryIds.filter(id => id !== cat.id));
                            }
                          }}
                        />
                        <span className="flex-1">{cat.name}</span>
                        <Badge variant="secondary">{cat._count?.streams || 0}</Badge>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </ScrollArea>
            {selectedCategoryIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedCategoryIds.length} category(ies) selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddByCategoryOpen(false);
              setSelectedCategoryIds([]);
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleAddByCategory}
              disabled={selectedCategoryIds.length === 0 || isAddingByCategory}
            >
              {isAddingByCategory && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add All Streams from Selected Categories
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Users Dialog */}
      <Dialog open={addLinesOpen} onOpenChange={setAddLinesOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Add Users to Bouquet</DialogTitle>
            <DialogDescription>
              Select users to grant access to &quot;{bouquet.name}&quot;
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={lineSearch}
                onChange={(e) => setLineSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="border rounded-lg max-h-[40vh] overflow-y-auto">
              {availableLines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No available users found
                </div>
              ) : (
                <Table>
                  <TableBody>
                    {availableLines.slice(0, 50).map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="w-[40px]">
                          <Checkbox
                            checked={selectedLineIds.includes(user.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLineIds([...selectedLineIds, user.id]);
                              } else {
                                setSelectedLineIds(
                                  selectedLineIds.filter((id) => id !== user.id)
                                );
                              }
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{user.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString() : "No expiration"}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={user.status === "active" ? "default" : "secondary"}
                            className={
                              user.status === "active"
                                ? "bg-green-500/20 text-green-400"
                                : ""
                            }
                          >
                            {user.status === "active" ? "Active" : user.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            {selectedLineIds.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {selectedLineIds.length} user(s) selected
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLinesOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddLines}
              disabled={selectedLineIds.length === 0 || addLines.isPending}
            >
              {addLines.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add {selectedLineIds.length > 0 && `(${selectedLineIds.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

