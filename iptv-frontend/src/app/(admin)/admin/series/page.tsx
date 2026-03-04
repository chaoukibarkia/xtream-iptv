"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  Clapperboard,
  Search,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Eye,
  Calendar,
  Film,
  Star,
  RefreshCw,
  AlertCircle,
  Loader2,
  Users,
  Tv,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

import {
  useAllSeries,
  useCreateSeries,
  useCreateSeriesWithEpisodes,
  useUpdateSeries,
  useDeleteSeries,
  useSyncSeriesTmdb,
  useBulkSyncSeriesTmdb,
} from "@/lib/api/hooks/useSeries";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { TmdbSearch, TmdbPreview, type TmdbSeriesData } from "@/components/admin/tmdb-search";
import { SeriesFormDialog } from "@/components/admin/series-form-dialog";

interface SeriesData {
  id: number;
  name: string;
  categoryId: number;
  category?: {
    id: number;
    name: string;
  };
  categories?: Array<{
    isPrimary: boolean;
    category: {
      id: number;
      name: string;
    };
  }>;
  cover?: string;         // Backend uses 'cover' not 'coverUrl'
  coverUrl?: string;      // Keep for backward compatibility
  backdropPath?: string | string[]; // Can be array or string
  backdropUrl?: string;   // Keep for backward compatibility
  plot?: string;
  genre?: string;
  releaseDate?: string;   // Backend uses releaseDate (DateTime)
  year?: number;
  rating?: number;
  rating5?: number;       // Backend also has rating5
  cast?: string;
  status?: string | "ongoing" | "completed" | "cancelled";
  seasons?: Array<{
    id: number;
    seasonNumber: number;
    episodes?: Array<{ id: number }>;
  }>;
  episodes?: Array<{      // Episodes come directly sometimes
    id: number;
    seasonNumber: number;
  }>;
  _count?: {
    seasons?: number;
    episodes: number;
  };
  tmdbId?: number;
  isActive?: boolean;
  updatedAt?: string;
}

interface SeriesFormData {
  name: string;
  categoryIds: number[];
  primaryCategoryId?: number;
  genre: string;
  year: number;
  coverUrl: string;
  backdropUrl: string;
  plot: string;
  rating: number;
  cast: string;
  status: string;
  tmdbId: number | null;
  numberOfSeasons: number;
  numberOfEpisodes: number;
}

const initialFormData: SeriesFormData = {
  name: "",
  categoryIds: [],
  primaryCategoryId: undefined,
  genre: "",
  year: new Date().getFullYear(),
  coverUrl: "",
  backdropUrl: "",
  plot: "",
  rating: 0,
  cast: "",
  status: "",
  tmdbId: null,
  numberOfSeasons: 0,
  numberOfEpisodes: 0,
};

const statusColors = {
  ongoing: "default",
  completed: "secondary",
  cancelled: "destructive",
} as const;

// Helper functions to extract data from series object
function getSeriesCoverUrl(series: SeriesData): string | undefined {
  return series.coverUrl || series.cover || undefined;
}

function getSeriesBackdropUrl(series: SeriesData): string | undefined {
  if (series.backdropUrl) return series.backdropUrl;
  if (typeof series.backdropPath === 'string') return series.backdropPath;
  if (Array.isArray(series.backdropPath) && series.backdropPath.length > 0) {
    return series.backdropPath[0];
  }
  return undefined;
}

function getSeriesYear(series: SeriesData): number | undefined {
  if (series.year) return series.year;
  if (series.releaseDate) {
    return new Date(series.releaseDate).getFullYear();
  }
  return undefined;
}

function getSeriesSeasonCount(series: SeriesData): number {
  // Try _count first
  if (series._count?.seasons) return series._count.seasons;
  
  // Calculate from seasons array
  if (series.seasons && series.seasons.length > 0) {
    return series.seasons.length;
  }
  
  // Calculate from episodes array by counting unique season numbers
  if (series.episodes && series.episodes.length > 0) {
    const uniqueSeasons = new Set(series.episodes.map(e => e.seasonNumber));
    return uniqueSeasons.size;
  }
  
  return 0;
}

export default function SeriesPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [genreFilter, setGenreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedSeries, setSelectedSeries] = useState<SeriesData | null>(null);

  // Form state
  const [formData, setFormData] = useState<SeriesFormData>(initialFormData);

  // Memoize filters to prevent infinite re-renders
  const seriesFilters = useMemo(() => ({
    search: searchTerm || undefined,
    status: statusFilter !== "all" ? statusFilter as "ongoing" | "completed" | "cancelled" : undefined,
    page,
    pageSize,
  }), [searchTerm, statusFilter, page, pageSize]);

  // API hooks
  const { data, isLoading, error, refetch } = useAllSeries(seriesFilters);
  const { data: categories } = useCategories("SERIES");
  const createSeries = useCreateSeries();
  const createSeriesWithEpisodes = useCreateSeriesWithEpisodes();
  const updateSeries = useUpdateSeries();
  const deleteSeries = useDeleteSeries();
  const syncSeriesTmdb = useSyncSeriesTmdb();
  const bulkSyncSeriesTmdb = useBulkSyncSeriesTmdb();

  const seriesList = ((data as unknown as { data?: SeriesData[] })?.data || 
    (Array.isArray(data) ? data : [])) as SeriesData[];
  
  // Extract pagination info
  const paginatedData = data as unknown as { data?: SeriesData[]; total?: number; page?: number; pageSize?: number; totalPages?: number };
  const totalSeries = paginatedData?.total ?? seriesList.length;
  const totalPages = paginatedData?.totalPages ?? Math.ceil(totalSeries / pageSize);

  // Extract unique genres from series
  const genres = [...new Set(seriesList.map((s) => s.genre).filter(Boolean))] as string[];

  // Apply client-side genre filter only (search and status are handled server-side)
  const filteredSeries = genreFilter === "all" 
    ? seriesList 
    : seriesList.filter((series) => series.genre === genreFilter);

  const totalEpisodes = seriesList.reduce((acc, s) => acc + (s._count?.episodes || 0), 0);
  const ongoingSeries = seriesList.filter((s) => s.status === "ongoing").length;
  const avgRating = seriesList.length > 0
    ? seriesList.reduce((acc, s) => acc + (s.rating || 0), 0) / seriesList.length
    : 0;

  // Memoize initialData to prevent infinite re-renders in SeriesFormDialog
  const seriesInitialData = useMemo(() => {
    if (!selectedSeries) return undefined;
    
    // Handle both nested {category: {id}} and flat {id} structures from API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getCategoryId = (c: any) => c?.category?.id ?? c?.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = selectedSeries.categories as any[] | undefined;
    
    return {
      name: selectedSeries.name,
      categoryIds: categories?.map(getCategoryId).filter(Boolean) as number[] || [selectedSeries.categoryId],
      primaryCategoryId: getCategoryId(categories?.find((c: any) => c.isPrimary)) ?? selectedSeries.categoryId,
      tmdbId: selectedSeries.tmdbId || null,
      coverUrl: getSeriesCoverUrl(selectedSeries) || "",
      backdropUrl: getSeriesBackdropUrl(selectedSeries) || "",
      plot: selectedSeries.plot || "",
      year: getSeriesYear(selectedSeries) || new Date().getFullYear(),
      rating: selectedSeries.rating || 0,
      genres: selectedSeries.genre || "",
      cast: selectedSeries.cast || "",
      status: selectedSeries.status || "",
      seasons: [],
    };
  }, [selectedSeries]);

  const handleTmdbSelect = useCallback((tmdbData: TmdbSeriesData) => {
    setFormData((prev) => ({
      ...prev,
      name: tmdbData.name,
      year: tmdbData.year,
      coverUrl: tmdbData.posterUrl || "",
      backdropUrl: tmdbData.backdropUrl || "",
      plot: tmdbData.overview,
      rating: tmdbData.rating,
      genre: tmdbData.genres,
      cast: tmdbData.cast,
      status: tmdbData.status.toLowerCase() === "ended" ? "completed" : 
              tmdbData.status.toLowerCase() === "returning series" ? "ongoing" : "",
      tmdbId: tmdbData.tmdbId,
      numberOfSeasons: tmdbData.numberOfSeasons,
      numberOfEpisodes: tmdbData.numberOfEpisodes,
    }));
  }, []);

  const handleEdit = (series: SeriesData) => {
    setSelectedSeries(series);
    
    // Handle both nested {category: {id}} and flat {id} structures from API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getCategoryId = (c: any) => c?.category?.id ?? c?.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categories = series.categories as any[] | undefined;
    
    const categoryIds = categories?.map(getCategoryId).filter(Boolean) as number[] || [];
    const primaryCategoryId = getCategoryId(categories?.find((c: any) => c.isPrimary)) || 
                              series.category?.id || 
                              categoryIds[0];
    
    setFormData({
      name: series.name,
      categoryIds: categoryIds.length > 0 ? categoryIds : (series.category?.id ? [series.category.id] : [series.categoryId]),
      primaryCategoryId: primaryCategoryId,
      genre: series.genre || "",
      year: getSeriesYear(series) || new Date().getFullYear(),
      coverUrl: getSeriesCoverUrl(series) || "",
      backdropUrl: getSeriesBackdropUrl(series) || "",
      plot: series.plot || "",
      rating: series.rating || 0,
      cast: series.cast || "",
      status: series.status || "",
      tmdbId: series.tmdbId || null,
      numberOfSeasons: getSeriesSeasonCount(series),
      numberOfEpisodes: series._count?.episodes || 0,
    });
    setIsCreateDialogOpen(true);
  };

  const handleSyncTmdb = async (series: SeriesData) => {
    setSyncingId(series.id);
    try {
      await syncSeriesTmdb.mutateAsync(series.id);
      toast({
        title: "Metadata synced",
        description: `${series.name} metadata has been updated.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to sync metadata.",
        variant: "destructive",
      });
    } finally {
      setSyncingId(null);
    }
  };

  const handleBulkSync = async () => {
    try {
      await bulkSyncSeriesTmdb.mutateAsync();
      toast({
        title: "Bulk sync started",
        description: "All series are being synced with TMDB.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to start bulk sync.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Series name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (selectedSeries) {
        await updateSeries.mutateAsync({
          id: selectedSeries.id,
          data: {
            name: formData.name,
            categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
            genre: formData.genre || undefined,
            year: formData.year,
            coverUrl: formData.coverUrl || undefined,
            plot: formData.plot || undefined,
            rating: formData.rating || undefined,
            cast: formData.cast || undefined,
            tmdbId: formData.tmdbId || undefined,
          },
        });
        toast({
          title: "Series updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createSeries.mutateAsync({
          name: formData.name,
          categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
          genre: formData.genre || undefined,
          year: formData.year,
          coverUrl: formData.coverUrl || undefined,
          plot: formData.plot || undefined,
          rating: formData.rating || undefined,
          cast: formData.cast || undefined,
          tmdbId: formData.tmdbId || undefined,
        });
        toast({
          title: "Series created",
          description: `${formData.name} has been created with TMDB metadata.`,
        });
      }
      setIsCreateDialogOpen(false);
      setSelectedSeries(null);
      setFormData(initialFormData);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save series.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedSeries) return;
    try {
      await deleteSeries.mutateAsync(selectedSeries.id);
      toast({
        title: "Series deleted",
        description: `${selectedSeries.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedSeries(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete series.",
        variant: "destructive",
      });
    }
  };

  const openCreateDialog = () => {
    setSelectedSeries(null);
    setFormData(initialFormData);
    setIsCreateDialogOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load series</h2>
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">TV Series</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage TV series library with TMDB integration
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBulkSync}
            disabled={bulkSyncSeriesTmdb.isPending}
            className="flex-1 sm:flex-none"
          >
            {bulkSyncSeriesTmdb.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Sync TMDB
          </Button>
          <Button onClick={openCreateDialog} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Add Series
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-primary/10 p-3">
                <Clapperboard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalSeries}</p>
                <p className="text-sm text-muted-foreground">Total Series</p>
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
                <p className="text-2xl font-bold">{totalEpisodes}</p>
                <p className="text-sm text-muted-foreground">Total Episodes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-500/10 p-3">
                <Calendar className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{ongoingSeries}</p>
                <p className="text-sm text-muted-foreground">Ongoing Series</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-yellow-500/10 p-3">
                <Star className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{avgRating.toFixed(1)}</p>
                <p className="text-sm text-muted-foreground">Avg. Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5" />
            Series Library
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search series..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1); // Reset to first page on search
                }}
                className="pl-8"
              />
            </div>
            <Select value={genreFilter} onValueChange={setGenreFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Genres</SelectItem>
                {genres.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="ongoing">Ongoing</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile Cards View */}
          <div className="md:hidden space-y-3">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-16 w-12 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16" />
                          <Skeleton className="h-5 w-12" />
                        </div>
                      </div>
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : filteredSeries.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  No series found.
                </CardContent>
              </Card>
            ) : (
              filteredSeries.map((series) => (
                <Card key={series.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Cover */}
                      <div className="relative h-16 w-12 overflow-hidden rounded bg-muted flex-shrink-0">
                        {getSeriesCoverUrl(series) ? (
                          <img
                            src={getSeriesCoverUrl(series)}
                            alt={series.name}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Film className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div>
                          <p className="font-medium truncate">{series.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {getSeriesYear(series) || 'N/A'}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {series.genre && (
                            <Badge variant="outline" className="text-xs">
                              {series.genre.split(",")[0]}
                            </Badge>
                          )}
                          {series.status && (
                            <Badge variant={statusColors[series.status as keyof typeof statusColors] || "secondary"} className="text-xs">
                              {series.status}
                            </Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{getSeriesSeasonCount(series)} seasons</span>
                          <span>{series._count?.episodes || 0} episodes</span>
                          {series.rating && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                              {series.rating.toFixed(1)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="flex-shrink-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/series/${series.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEdit(series)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleSyncTmdb(series)}
                            disabled={syncingId === series.id}
                          >
                            {syncingId === series.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-2 h-4 w-4" />
                            )}
                            Sync TMDB
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={() => {
                              setSelectedSeries(series);
                              setIsDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Series</TableHead>
                  <TableHead>Genre</TableHead>
                  <TableHead>Seasons</TableHead>
                  <TableHead>Episodes</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-12 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredSeries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No series found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSeries.map((series) => (
                    <TableRow key={series.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative h-12 w-8 overflow-hidden rounded bg-muted">
                            {getSeriesCoverUrl(series) ? (
                              <img
                                src={getSeriesCoverUrl(series)}
                                alt={series.name}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center">
                                <Film className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{series.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {getSeriesYear(series) || 'N/A'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {series.genre ? (
                          <Badge variant="outline">{series.genre.split(",")[0]}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getSeriesSeasonCount(series)}</TableCell>
                      <TableCell>{series._count?.episodes || 0}</TableCell>
                      <TableCell>
                        {series.rating ? (
                          <div className="flex items-center gap-1">
                            <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                            {series.rating.toFixed(1)}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {series.status ? (
                          <Badge variant={statusColors[series.status as keyof typeof statusColors] || "secondary"}>
                            {series.status}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">unknown</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/admin/series/${series.id}`}>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEdit(series)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleSyncTmdb(series)}
                              disabled={syncingId === series.id}
                            >
                              {syncingId === series.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-2 h-4 w-4" />
                              )}
                              Sync TMDB
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => {
                                setSelectedSeries(series);
                                setIsDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t mt-6">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalSeries)} of {totalSeries} series
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1 || isLoading}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages || isLoading}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages || isLoading}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog with TMDB integration and Episode Management */}
      <SeriesFormDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSubmit={async (data) => {
          try {
            if (selectedSeries) {
              await updateSeries.mutateAsync({
                id: selectedSeries.id,
                data: {
                  name: data.name,
                  categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
                  genre: data.genres || undefined,
                  year: data.year,
                  coverUrl: data.coverUrl || undefined,
                  plot: data.plot || undefined,
                  rating: data.rating || undefined,
                  cast: data.cast || undefined,
                  tmdbId: data.tmdbId || undefined,
                },
              });
              toast({
                title: "Series updated",
                description: `${data.name} has been updated.`,
              });
            } else {
              // Use the full series creation endpoint that includes episodes
              const episodesWithFiles = data.seasons.reduce(
                (acc, s) => acc + s.episodes.filter(e => e.sourceUrl).length,
                0
              );
              
              await createSeriesWithEpisodes.mutateAsync({
                name: data.name,
                categoryIds: data.categoryIds.length > 0 ? data.categoryIds : undefined,
                tmdbId: data.tmdbId || undefined,
                coverUrl: data.coverUrl || undefined,
                backdropUrl: data.backdropUrl || undefined,
                genre: data.genres || undefined,
                year: data.year,
                rating: data.rating || undefined,
                plot: data.plot || undefined,
                cast: data.cast || undefined,
                status: data.status || undefined,
                seasons: data.seasons.map(season => ({
                  seasonNumber: season.seasonNumber,
                  name: season.name,
                  overview: season.overview || undefined,
                  posterPath: season.posterPath || undefined,
                  episodes: season.episodes.map(ep => ({
                    episodeNumber: ep.episodeNumber,
                    name: ep.name,
                    overview: ep.overview || undefined,
                    airDate: ep.airDate || undefined,
                    runtime: ep.runtime || undefined,
                    stillPath: ep.stillPath || undefined,
                    sourceUrl: ep.sourceUrl,
                  })),
                })),
              });
              
              toast({
                title: "Series created",
                description: `${data.name} has been created with ${data.seasons.length} seasons and ${episodesWithFiles} episode files.`,
              });
            }
            setSelectedSeries(null);
          } catch {
            toast({
              title: "Error",
              description: "Failed to save series.",
              variant: "destructive",
            });
            throw new Error("Failed to save");
          }
        }}
        initialData={seriesInitialData}
        isEditing={!!selectedSeries}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Series</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedSeries?.name}&quot;? 
              All seasons and episodes will be deleted. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteSeries.isPending}
            >
              {deleteSeries.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
