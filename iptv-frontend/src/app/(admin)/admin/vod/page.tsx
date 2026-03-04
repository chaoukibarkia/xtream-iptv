"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Search,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Link2,
  Play,
  Star,
  Calendar,
  AlertCircle,
  Loader2,
  Clock,
  Users,
  Clapperboard,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/hooks/use-toast";

import {
  useAllVod,
  useVod,
  useCreateVod,
  useUpdateVod,
  useDeleteVod,
  useSyncVodTmdb,
  useBulkSyncVodTmdb,
  useVodStats,
  type VodWithDetails,
} from "@/lib/api/hooks/useVod";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { TmdbSearch, TmdbPreview, type TmdbMovieData } from "@/components/admin/tmdb-search";
import { FilePickerInput } from "@/components/admin/file-browser";
import { mapGenresToVodCategories } from "@/lib/genre-category-mapper";

interface MovieFormData {
  name: string;
  sourceUrl: string;
  serverId?: number; // Server where the file is located
  categoryIds: number[];
  primaryCategoryId?: number;
  year: number;
  posterUrl: string;
  backdropUrl: string;
  overview: string;
  runtime: number;
  rating: number;
  genres: string;
  cast: string;
  director: string;
  youtubeTrailer: string;
  tmdbId: number | null;
}

const initialFormData: MovieFormData = {
  name: "",
  sourceUrl: "",
  serverId: undefined,
  categoryIds: [],
  primaryCategoryId: undefined,
  year: new Date().getFullYear(),
  posterUrl: "",
  backdropUrl: "",
  overview: "",
  runtime: 0,
  rating: 0,
  genres: "",
  cast: "",
  director: "",
  youtubeTrailer: "",
  tmdbId: null,
};

function MovieCard({ 
  movie, 
  onEdit,
  onDelete,
  onSyncTmdb,
  isSyncing,
}: { 
  movie: VodWithDetails;
  onEdit: () => void;
  onDelete: () => void;
  onSyncTmdb: () => void;
  isSyncing: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border bg-card transition-all hover:border-primary">
      {/* Poster - Clickable to go to detail page */}
      <Link href={`/admin/vod/${movie.id}`}>
        <div className="aspect-[2/3] bg-muted cursor-pointer">
          {movie.posterUrl ? (
            <img
              src={movie.posterUrl}
              alt={movie.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              No Poster
            </div>
          )}

          {/* Overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={(e) => e.preventDefault()}>
                <Eye className="mr-1 h-4 w-4" />
                View Details
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={(e) => {
                  e.preventDefault();
                  onSyncTmdb();
                }}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="mr-1 h-4 w-4" />
                )}
                TMDB
              </Button>
            </div>
          </div>
        </div>
      </Link>

      {/* Info */}
      <div className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <Link href={`/admin/vod/${movie.id}`}>
              <h3 className="truncate font-medium hover:text-primary cursor-pointer">{movie.name}</h3>
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{movie.year || 'N/A'}</span>
              {(movie.rating || 0) > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center">
                    <Star className="mr-1 h-3 w-3 fill-yellow-500 text-yellow-500" />
                    {(movie.rating || 0).toFixed(1)}
                  </span>
                </>
              )}
            </div>
            {movie.viewerCount !== undefined && movie.viewerCount > 0 && (
              <div className="flex items-center gap-1 text-xs text-green-500 mt-1">
                <Users className="h-3 w-3" />
                <span>{movie.viewerCount} watching</span>
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/admin/vod/${movie.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/admin/vod/${movie.id}`}>
                  <Play className="mr-2 h-4 w-4" />
                  Preview
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSyncTmdb}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync Metadata
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Sync Status */}
        <div className="mt-2">
          <Badge
            variant={movie.tmdbSynced ? "success" : "warning"}
            className="text-xs"
          >
            {movie.tmdbSynced ? "🟢 Synced" : "🟡 Pending"}
          </Badge>
        </div>
      </div>
    </div>
  );
}

export default function VodPage() {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  // Track the edit ID from URL to fetch the specific movie
  const editIdFromUrl = searchParams.get("edit");
  const editIdNum = editIdFromUrl ? parseInt(editIdFromUrl) : 0;
  const processedEditId = useRef<number | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<VodWithDetails | null>(null);

  // Form state
  const [formData, setFormData] = useState<MovieFormData>(initialFormData);

  // API hooks
  const { data, isLoading, error, refetch } = useAllVod({
    search: searchQuery || undefined,
    page,
    pageSize: 50,
  });
  const { data: categories } = useCategories("VOD");
  const { data: vodStats, refetch: refetchStats } = useVodStats();
  
  // Fetch specific movie for editing (only when edit param is present)
  const { data: movieToEdit } = useVod(editIdNum);
  
  const createVod = useCreateVod();
  const updateVod = useUpdateVod();
  const deleteVod = useDeleteVod();
  const syncVodTmdb = useSyncVodTmdb();
  const bulkSyncVodTmdb = useBulkSyncVodTmdb();

  // Extract movies array and pagination info from response
  const paginatedData = data as unknown as { data?: VodWithDetails[]; total?: number; page?: number; pageSize?: number; totalPages?: number };
  const movies = (paginatedData?.data || (Array.isArray(data) ? data : [])) as VodWithDetails[];
  // Use stats endpoint for total (most reliable), fallback to pagination total, then array length
  const totalMovies = vodStats?.total ?? paginatedData?.total ?? movies.length;
  const currentPage = paginatedData?.page ?? 1;
  const pageSize = paginatedData?.pageSize ?? 50;
  const totalPages = paginatedData?.totalPages ?? Math.ceil(totalMovies / pageSize);

  // Use stats from the dedicated endpoint for accurate counts across all movies
  const syncedCount = vodStats?.synced ?? movies.filter((m) => m.tmdbSynced).length;
  const pendingCount = vodStats?.pending ?? movies.filter((m) => !m.tmdbSynced).length;
  const recentlyAdded = vodStats?.recentlyAdded ?? 0;

  const handleEdit = useCallback((movie: VodWithDetails) => {
    setSelectedMovie(movie);
    
    // Handle both nested {category: {id}} and flat {id} structures from API
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getCategoryId = (c: any) => c?.category?.id ?? c?.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movieCategories = movie.categories as any[] | undefined;
    
    const categoryIds = movieCategories?.map(getCategoryId).filter(Boolean) as number[] || [];
    const primaryCategoryId = getCategoryId(movieCategories?.find((c: any) => c.isPrimary)) || 
                              movie.category?.id || 
                              categoryIds[0];
    
    setFormData({
      name: movie.name,
      sourceUrl: movie.stream?.sourceUrl || "",
      categoryIds: categoryIds.length > 0 ? categoryIds : (movie.category?.id ? [movie.category.id] : []),
      primaryCategoryId: primaryCategoryId,
      year: movie.year || new Date().getFullYear(),
      posterUrl: movie.posterUrl || "",
      backdropUrl: movie.backdropUrl || "",
      overview: movie.overview || "",
      runtime: movie.runtime || 0,
      rating: movie.rating || 0,
      genres: movie.genres || "",
      cast: movie.cast || "",
      director: movie.director || "",
      youtubeTrailer: movie.youtubeTrailer || "",
      tmdbId: movie.tmdbId || null,
    });
    setIsCreateDialogOpen(true);
  }, []);

  // Handle edit query parameter - fetch movie by ID and open dialog
  useEffect(() => {
    // Only process if we have an edit ID that we haven't processed yet
    if (editIdNum && movieToEdit && processedEditId.current !== editIdNum) {
      processedEditId.current = editIdNum;
      // Clear the query parameter immediately to prevent re-triggering
      router.replace("/admin/vod", { scroll: false });
      // Open edit dialog with the fetched movie
      handleEdit(movieToEdit);
    }
    // Reset processed ID when there's no edit param
    if (!editIdFromUrl) {
      processedEditId.current = null;
    }
  }, [editIdNum, editIdFromUrl, movieToEdit, router, handleEdit]);

  const handleTmdbSelect = useCallback((tmdbData: TmdbMovieData) => {
    // Auto-map genres to categories
    const { categoryIds, primaryCategoryId } = mapGenresToVodCategories(
      tmdbData.genres,
      categories || []
    );

    setFormData((prev) => ({
      ...prev,
      name: tmdbData.title,
      year: tmdbData.year,
      posterUrl: tmdbData.posterUrl || "",
      backdropUrl: tmdbData.backdropUrl || "",
      overview: tmdbData.overview,
      runtime: tmdbData.runtime,
      rating: tmdbData.rating,
      genres: tmdbData.genres,
      cast: tmdbData.cast,
      director: tmdbData.director,
      youtubeTrailer: tmdbData.youtubeTrailer || "",
      tmdbId: tmdbData.tmdbId,
      // Auto-populate categories based on TMDB genres
      categoryIds: categoryIds.length > 0 ? categoryIds : prev.categoryIds,
      primaryCategoryId: primaryCategoryId || prev.primaryCategoryId,
    }));
  }, [categories]);

  const handleSyncTmdb = async (movie: VodWithDetails) => {
    setSyncingId(movie.id);
    try {
      await syncVodTmdb.mutateAsync(movie.id);
      toast({
        title: "Metadata synced",
        description: `${movie.name} metadata has been updated.`,
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
      await bulkSyncVodTmdb.mutateAsync();
      toast({
        title: "Bulk sync started",
        description: "All movies are being synced with TMDB.",
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
    if (!formData.name.trim() || !formData.sourceUrl.trim()) {
      toast({
        title: "Error",
        description: "Name and source URL are required",
        variant: "destructive",
      });
      return;
    }

    try {
      if (selectedMovie) {
        await updateVod.mutateAsync({
          id: selectedMovie.id,
          data: {
            name: formData.name,
            sourceUrl: formData.sourceUrl,
            categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
            year: formData.year,
            rating: formData.rating,
            runtime: formData.runtime,
            posterUrl: formData.posterUrl || undefined,
            backdropUrl: formData.backdropUrl || undefined,
            overview: formData.overview || undefined,
            genres: formData.genres || undefined,
            cast: formData.cast || undefined,
            director: formData.director || undefined,
            youtubeTrailer: formData.youtubeTrailer || undefined,
            tmdbId: formData.tmdbId || undefined,
          },
        });
        toast({
          title: "Movie updated",
          description: `${formData.name} has been updated.`,
        });
      } else {
        await createVod.mutateAsync({
          name: formData.name,
          sourceUrl: formData.sourceUrl,
          categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
          year: formData.year,
          rating: formData.rating,
          runtime: formData.runtime,
          posterUrl: formData.posterUrl || undefined,
          backdropUrl: formData.backdropUrl || undefined,
          overview: formData.overview || undefined,
          genres: formData.genres || undefined,
          cast: formData.cast || undefined,
          director: formData.director || undefined,
          youtubeTrailer: formData.youtubeTrailer || undefined,
          tmdbId: formData.tmdbId || undefined,
        });
        toast({
          title: "Movie added",
          description: `${formData.name} has been added with TMDB metadata.`,
        });
      }
      setIsCreateDialogOpen(false);
      setSelectedMovie(null);
      setFormData(initialFormData);
    } catch {
      toast({
        title: "Error",
        description: "Failed to save movie.",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedMovie) return;
    try {
      await deleteVod.mutateAsync(selectedMovie.id);
      toast({
        title: "Movie deleted",
        description: `${selectedMovie.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedMovie(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete movie.",
        variant: "destructive",
      });
    }
  };

  const openCreateDialog = () => {
    setSelectedMovie(null);
    setFormData(initialFormData);
    setIsCreateDialogOpen(true);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load movies</h2>
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
          <h1 className="text-2xl sm:text-3xl font-bold">VOD</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your video on demand library with TMDB integration
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="outline" 
            onClick={handleBulkSync}
            disabled={bulkSyncVodTmdb.isPending}
            className="flex-1 sm:flex-none"
          >
            {bulkSyncVodTmdb.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            <span className="hidden xs:inline">Sync All TMDB</span>
            <span className="xs:hidden">Sync TMDB</span>
          </Button>
          <Button onClick={openCreateDialog} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Add Movie
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <Play className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Movies</p>
                <p className="text-2xl font-bold">{totalMovies}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">TMDB Synced</p>
                <p className="text-2xl font-bold">{syncedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-500/10 p-2 text-yellow-500">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Sync</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-500">
                <Calendar className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Added This Week</p>
                <p className="text-2xl font-bold">{recentlyAdded}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle>Movie Library</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">
                {totalMovies} movies
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 sm:mb-6 flex flex-wrap items-center gap-3 sm:gap-4">
            <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search movies..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1); // Reset to first page on search
                }}
                className="pl-8"
              />
            </div>
          </div>

          {/* Movie Grid */}
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-lg border bg-card">
                  <Skeleton className="aspect-[2/3] w-full" />
                  <div className="p-3 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : movies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Play className="h-12 w-12 mb-2 opacity-50" />
              <p>No movies found</p>
              <p className="text-sm">Add a movie to get started</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {movies.map((movie) => (
                <MovieCard 
                  key={movie.id} 
                  movie={movie}
                  onEdit={() => handleEdit(movie)}
                  onDelete={() => {
                    setSelectedMovie(movie);
                    setIsDeleteDialogOpen(true);
                  }}
                  onSyncTmdb={() => handleSyncTmdb(movie)}
                  isSyncing={syncingId === movie.id}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t mt-6">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalMovies)} of {totalMovies} movies
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

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{selectedMovie ? "Edit Movie" : "Add Movie"}</DialogTitle>
            <DialogDescription>
              {selectedMovie 
                ? "Update movie information below." 
                : "Search TMDB for a movie and all details will be auto-filled."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-2 min-h-0">
            <div className="grid gap-6 py-4">
              {/* TMDB Search */}
              <TmdbSearch
                type="movie"
                initialQuery={formData.name}
                onSelect={(data) => handleTmdbSelect(data as TmdbMovieData)}
                selectedTmdbId={formData.tmdbId}
                placeholder="Type movie name to search TMDB..."
              />

              {/* TMDB Preview */}
              {formData.tmdbId && (
                <TmdbPreview
                  type="movie"
                  posterUrl={formData.posterUrl}
                  backdropUrl={formData.backdropUrl}
                  title={formData.name}
                  year={formData.year}
                  rating={formData.rating}
                  genres={formData.genres}
                  overview={formData.overview}
                  runtime={formData.runtime}
                />
              )}

              <Separator />

              {/* Basic Info */}
              <div className="grid gap-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Clapperboard className="h-4 w-4" />
                  Basic Information
                </h4>
                
                <div className="grid gap-2">
                  <Label htmlFor="name">Title *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter movie title"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="sourceUrl">Source URL / File *</Label>
                  <FilePickerInput
                    value={formData.sourceUrl}
                    onChange={(path, serverId) => setFormData({ ...formData, sourceUrl: path, serverId })}
                    placeholder="Enter URL or browse for file..."
                    serverId={formData.serverId}
                  />
                  <p className="text-xs text-muted-foreground">
                    Select a server and browse for MKV/MP4 file, or enter a URL directly
                  </p>
                  {formData.serverId && (
                    <p className="text-xs text-muted-foreground">
                      File located on Server #{formData.serverId}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="categories">Categories</Label>
                    <MultiSelect
                      options={categories?.map(cat => ({
                        label: cat.name,
                        value: cat.id.toString(),
                      })) || []}
                      selected={formData.categoryIds.map(id => id.toString())}
                      onChange={(values) => {
                        const ids = values.map(v => parseInt(v));
                        setFormData({ 
                          ...formData, 
                          categoryIds: ids,
                          // If primary is not in the list, set it to the first one
                          primaryCategoryId: ids.includes(formData.primaryCategoryId || 0) 
                            ? formData.primaryCategoryId 
                            : ids[0]
                        });
                      }}
                      onPrimaryChange={(value) => {
                        setFormData({ 
                          ...formData, 
                          primaryCategoryId: value ? parseInt(value) : undefined 
                        });
                      }}
                      primaryValue={formData.primaryCategoryId?.toString()}
                      placeholder="Select categories..."
                      allowPrimary={true}
                    />
                    <p className="text-xs text-muted-foreground">
                      Select multiple categories. Click ★ to set primary category.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      min={1900}
                      max={2100}
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || new Date().getFullYear() })}
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="runtime">Runtime (min)</Label>
                  <Input
                    id="runtime"
                    type="number"
                    min={0}
                    value={formData.runtime}
                    onChange={(e) => setFormData({ ...formData, runtime: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <Separator />

              {/* TMDB Details */}
              <div className="grid gap-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Star className="h-4 w-4" />
                  TMDB Details
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="rating">Rating</Label>
                    <Input
                      id="rating"
                      type="number"
                      step="0.1"
                      min={0}
                      max={10}
                      value={formData.rating}
                      onChange={(e) => setFormData({ ...formData, rating: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="genres">Genres</Label>
                    <Input
                      id="genres"
                      value={formData.genres}
                      onChange={(e) => setFormData({ ...formData, genres: e.target.value })}
                      placeholder="Action, Drama, ..."
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="overview">Overview</Label>
                  <Textarea
                    id="overview"
                    value={formData.overview}
                    onChange={(e) => setFormData({ ...formData, overview: e.target.value })}
                    placeholder="Movie plot description..."
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="director" className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      Director
                    </Label>
                    <Input
                      id="director"
                      value={formData.director}
                      onChange={(e) => setFormData({ ...formData, director: e.target.value })}
                      placeholder="Director name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cast" className="flex items-center gap-2">
                      <Users className="h-3 w-3" />
                      Cast
                    </Label>
                    <Input
                      id="cast"
                      value={formData.cast}
                      onChange={(e) => setFormData({ ...formData, cast: e.target.value })}
                      placeholder="Actor 1, Actor 2, ..."
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Media URLs */}
              <div className="grid gap-4">
                <h4 className="font-medium flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  Media URLs
                </h4>

                <div className="grid gap-2">
                  <Label htmlFor="posterUrl">Poster URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="posterUrl"
                      value={formData.posterUrl}
                      onChange={(e) => setFormData({ ...formData, posterUrl: e.target.value })}
                      placeholder="https://example.com/poster.jpg"
                      className="flex-1"
                    />
                    {formData.posterUrl && (
                      <div className="w-12 h-16 rounded overflow-hidden bg-muted flex-shrink-0">
                        <img src={formData.posterUrl} alt="Poster" className="w-full h-full object-cover" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="backdropUrl">Backdrop URL</Label>
                  <Input
                    id="backdropUrl"
                    value={formData.backdropUrl}
                    onChange={(e) => setFormData({ ...formData, backdropUrl: e.target.value })}
                    placeholder="https://example.com/backdrop.jpg"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="youtubeTrailer">YouTube Trailer URL</Label>
                  <Input
                    id="youtubeTrailer"
                    value={formData.youtubeTrailer}
                    onChange={(e) => setFormData({ ...formData, youtubeTrailer: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateOrUpdate}
              disabled={createVod.isPending || updateVod.isPending}
            >
              {(createVod.isPending || updateVod.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedMovie ? "Update" : "Add Movie"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Movie</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedMovie?.name}&quot;? 
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
              disabled={deleteVod.isPending}
            >
              {deleteVod.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
