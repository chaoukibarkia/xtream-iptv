"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import {
  Tv,
  Star,
  Calendar,
  Film,
  Users,
  Loader2,
  ChevronDown,
  ChevronRight,
  Folder,
  Check,
  X,
  Plus,
  Layers,
  Play,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  TmdbSearch, 
  TmdbPreview, 
  type TmdbSeriesData 
} from "@/components/admin/tmdb-search";
import { FileBrowser } from "@/components/admin/file-browser";
import {
  useTmdbTvDetails,
  useTmdbAllSeasons,
  getTmdbImageUrl,
  type TmdbSeasonDetails,
  type TmdbEpisode,
} from "@/lib/api/hooks/useTmdb";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { cn } from "@/lib/utils";
import { mapGenresToSeriesCategories } from "@/lib/genre-category-mapper";

interface EpisodeFormData {
  episodeNumber: number;
  name: string;
  overview: string;
  airDate: string | null;
  runtime: number | null;
  stillPath: string | null;
  sourceUrl: string;
  serverId?: number; // Server where the file is located
}

interface SeasonFormData {
  seasonNumber: number;
  name: string;
  overview: string;
  posterPath: string | null;
  episodes: EpisodeFormData[];
  isExpanded: boolean;
}

interface SeriesFormData {
  name: string;
  categoryIds: number[];
  primaryCategoryId?: number;
  tmdbId: number | null;
  coverUrl: string;
  backdropUrl: string;
  plot: string;
  year: number;
  rating: number;
  genres: string;
  cast: string;
  status: string;
  seasons: SeasonFormData[];
}

// Export the types for use in other components
export type { EpisodeFormData, SeasonFormData, SeriesFormData };

interface SeriesFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: SeriesFormData) => Promise<void>;
  initialData?: Partial<SeriesFormData>;
  isEditing?: boolean;
}

const initialFormData: SeriesFormData = {
  name: "",
  categoryIds: [],
  primaryCategoryId: undefined,
  tmdbId: null,
  coverUrl: "",
  backdropUrl: "",
  plot: "",
  year: new Date().getFullYear(),
  rating: 0,
  genres: "",
  cast: "",
  status: "",
  seasons: [],
};

export function SeriesFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  isEditing = false,
}: SeriesFormDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<SeriesFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    seasonIndex: number;
    episodeIndex: number;
  } | null>(null);
  // Track the tmdbId for which seasons were loaded to prevent stale data
  const [seasonsLoadedForTmdbId, setSeasonsLoadedForTmdbId] = useState<number | null>(null);

  const { data: categories } = useCategories("SERIES");

  // Fetch TMDB details when tmdbId is set
  const { data: tmdbDetails, isLoading: loadingTmdbDetails } = useTmdbTvDetails(
    formData.tmdbId || 0
  );

  // Get season numbers from TMDB details - memoized to prevent unnecessary re-fetches
  const seasonNumbers = useMemo(() => {
    if (!tmdbDetails?.seasons) return [];
    return tmdbDetails.seasons
      .filter(s => s.season_number > 0) // Exclude specials (season 0)
      .map(s => s.season_number);
  }, [tmdbDetails?.seasons]);

  // Fetch all season details
  const { data: allSeasons, isLoading: loadingSeasons } = useTmdbAllSeasons(
    formData.tmdbId || 0,
    seasonNumbers
  );

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setFormData(initialData ? { ...initialFormData, ...initialData } : initialFormData);
      setActiveTab("details");
      setSeasonsLoadedForTmdbId(null); // Reset so new seasons can be loaded
    }
  }, [open, initialData]);

  // Auto-populate seasons when TMDB data is loaded
  useEffect(() => {
    // Only populate if:
    // 1. allSeasons data is available
    // 2. We have a tmdbId
    // 3. Seasons haven't been loaded for this tmdbId yet
    if (
      allSeasons && 
      allSeasons.length > 0 && 
      formData.tmdbId && 
      seasonsLoadedForTmdbId !== formData.tmdbId
    ) {
      const seasons: SeasonFormData[] = allSeasons.map((season) => ({
        seasonNumber: season.season_number,
        name: season.name,
        overview: season.overview,
        posterPath: season.poster_path,
        isExpanded: season.season_number === 1,
        episodes: season.episodes.map((ep) => ({
          episodeNumber: ep.episode_number,
          name: ep.name,
          overview: ep.overview,
          airDate: ep.air_date,
          runtime: ep.runtime,
          stillPath: ep.still_path,
          sourceUrl: "",
        })),
      }));

      setFormData((prev) => ({ ...prev, seasons }));
      setSeasonsLoadedForTmdbId(formData.tmdbId);

      toast({
        title: "Seasons & Episodes Loaded",
        description: `Found ${seasons.length} seasons with ${seasons.reduce((acc, s) => acc + s.episodes.length, 0)} episodes from TMDB`,
      });
    }
  }, [allSeasons, formData.tmdbId, seasonsLoadedForTmdbId, toast]);

  const handleTmdbSelect = useCallback((tmdbData: TmdbSeriesData) => {
    // Reset seasonsLoadedForTmdbId to null so new seasons can be loaded
    setSeasonsLoadedForTmdbId(null);
    
    // Auto-map genres to categories
    const { categoryIds, primaryCategoryId } = mapGenresToSeriesCategories(
      tmdbData.genres,
      categories || []
    );

    setFormData((prev) => ({
      ...prev,
      name: tmdbData.name,
      year: tmdbData.year,
      coverUrl: tmdbData.posterUrl || "",
      backdropUrl: tmdbData.backdropUrl || "",
      plot: tmdbData.overview,
      rating: tmdbData.rating,
      genres: tmdbData.genres,
      cast: tmdbData.cast,
      status: tmdbData.status.toLowerCase() === "ended" ? "completed" :
              tmdbData.status.toLowerCase() === "returning series" ? "ongoing" : "",
      tmdbId: tmdbData.tmdbId,
      seasons: [], // Will be populated after TMDB details are fetched
      // Auto-populate categories based on TMDB genres
      categoryIds: categoryIds.length > 0 ? categoryIds : prev.categoryIds,
      primaryCategoryId: primaryCategoryId || prev.primaryCategoryId,
    }));
  }, [categories]);

  const handleEpisodeFileSelect = (path: string, filename: string, serverId?: number) => {
    if (selectedEpisode) {
      const { seasonIndex, episodeIndex } = selectedEpisode;
      const newSeasons = [...formData.seasons];
      newSeasons[seasonIndex].episodes[episodeIndex].sourceUrl = path;
      newSeasons[seasonIndex].episodes[episodeIndex].serverId = serverId;
      setFormData({ ...formData, seasons: newSeasons });
      setSelectedEpisode(null);
    }
  };

  const openFileBrowserForEpisode = (seasonIndex: number, episodeIndex: number) => {
    setSelectedEpisode({ seasonIndex, episodeIndex });
    setFileBrowserOpen(true);
  };

  const toggleSeasonExpanded = (seasonIndex: number) => {
    const newSeasons = [...formData.seasons];
    newSeasons[seasonIndex].isExpanded = !newSeasons[seasonIndex].isExpanded;
    setFormData({ ...formData, seasons: newSeasons });
  };

  const updateEpisodeUrl = (seasonIndex: number, episodeIndex: number, url: string, serverId?: number) => {
    const newSeasons = [...formData.seasons];
    newSeasons[seasonIndex].episodes[episodeIndex].sourceUrl = url;
    if (serverId !== undefined) {
      newSeasons[seasonIndex].episodes[episodeIndex].serverId = serverId;
    }
    setFormData({ ...formData, seasons: newSeasons });
  };

  const clearEpisodeFile = (seasonIndex: number, episodeIndex: number) => {
    const newSeasons = [...formData.seasons];
    newSeasons[seasonIndex].episodes[episodeIndex].sourceUrl = "";
    newSeasons[seasonIndex].episodes[episodeIndex].serverId = undefined;
    setFormData({ ...formData, seasons: newSeasons });
  };

  const getAssignedEpisodesCount = () => {
    return formData.seasons.reduce(
      (acc, season) => acc + season.episodes.filter((ep) => ep.sourceUrl).length,
      0
    );
  };

  const getTotalEpisodesCount = () => {
    return formData.seasons.reduce((acc, season) => acc + season.episodes.length, 0);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Series name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in parent
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tv className="h-5 w-5" />
              {isEditing ? "Edit Series" : "Add Series"}
            </DialogTitle>
            <DialogDescription>
              {isEditing
                ? "Update series information and episode files."
                : "Search TMDB to auto-fill series details, then assign video files to each episode."}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="details" className="flex items-center gap-2">
                <Film className="h-4 w-4" />
                Series Details
              </TabsTrigger>
              <TabsTrigger 
                value="episodes" 
                className="flex items-center gap-2"
                disabled={formData.seasons.length === 0}
              >
                <Layers className="h-4 w-4" />
                Episodes
                {formData.seasons.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {getAssignedEpisodesCount()}/{getTotalEpisodesCount()}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 mt-4 overflow-y-auto max-h-[calc(90vh-220px)] pr-2" style={{ scrollbarWidth: 'thin', scrollbarColor: 'hsl(var(--border)) transparent' }}>
              <TabsContent value="details" className="m-0 pr-2">
                <div className="grid gap-6 pb-4">
                  {/* TMDB Search */}
                  <TmdbSearch
                    type="tv"
                    initialQuery={formData.name}
                    onSelect={(data) => handleTmdbSelect(data as TmdbSeriesData)}
                    selectedTmdbId={formData.tmdbId}
                    placeholder="Type series name to search TMDB..."
                  />

                  {/* Loading indicator for TMDB data */}
                  {(loadingTmdbDetails || loadingSeasons) && formData.tmdbId && (
                    <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Loading series data from TMDB...</span>
                    </div>
                  )}

                  {/* TMDB Preview */}
                  {formData.tmdbId && !loadingTmdbDetails && (
                    <TmdbPreview
                      type="tv"
                      posterUrl={formData.coverUrl}
                      backdropUrl={formData.backdropUrl}
                      title={formData.name}
                      year={formData.year}
                      rating={formData.rating}
                      genres={formData.genres}
                      overview={formData.plot}
                      status={formData.status}
                    />
                  )}

                  {/* Seasons info */}
                  {formData.seasons.length > 0 && (
                    <div className="flex gap-4 flex-wrap">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        {formData.seasons.length} Seasons
                      </Badge>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Film className="h-3 w-3" />
                        {getTotalEpisodesCount()} Episodes
                      </Badge>
                      <Badge 
                        variant={getAssignedEpisodesCount() === getTotalEpisodesCount() ? "success" : "secondary"} 
                        className="flex items-center gap-1"
                      >
                        <Check className="h-3 w-3" />
                        {getAssignedEpisodesCount()} Files Assigned
                      </Badge>
                    </div>
                  )}

                  <Separator />

                  {/* Basic Info */}
                  <div className="grid gap-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Tv className="h-4 w-4" />
                      Basic Information
                    </h4>

                    <div className="grid gap-2">
                      <Label htmlFor="name">Series Name *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter series name"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
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
                          Click ★ to set primary category.
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
                      <Label htmlFor="status">Status</Label>
                      <Select
                        value={formData.status}
                        onValueChange={(v) => setFormData({ ...formData, status: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ongoing">Ongoing</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

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
                          placeholder="Drama, Action, ..."
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="plot">Plot/Overview</Label>
                      <Textarea
                        id="plot"
                        value={formData.plot}
                        onChange={(e) => setFormData({ ...formData, plot: e.target.value })}
                        placeholder="Series plot description..."
                        rows={3}
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
              </TabsContent>

              <TabsContent value="episodes" className="m-0 pr-4">
                <div className="space-y-4 pb-4">
                  {/* Quick stats */}
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="text-sm">
                      <span className="text-muted-foreground">Episodes assigned: </span>
                      <span className="font-medium">
                        {getAssignedEpisodesCount()} / {getTotalEpisodesCount()}
                      </span>
                    </div>
                    {getAssignedEpisodesCount() === getTotalEpisodesCount() && getTotalEpisodesCount() > 0 && (
                      <Badge variant="success" className="flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        All episodes assigned
                      </Badge>
                    )}
                  </div>

                  {/* Seasons */}
                  {formData.seasons.map((season, seasonIndex) => (
                    <Collapsible
                      key={season.seasonNumber}
                      open={season.isExpanded}
                      onOpenChange={() => toggleSeasonExpanded(seasonIndex)}
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start p-4 h-auto hover:bg-muted"
                        >
                          <div className="flex items-center gap-3 w-full">
                            {season.isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            {season.posterPath && (
                              <img
                                src={getTmdbImageUrl(season.posterPath, "w92") || ""}
                                alt={season.name}
                                className="w-10 h-14 rounded object-cover"
                              />
                            )}
                            <div className="flex-1 text-left">
                              <p className="font-medium">{season.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {season.episodes.length} episodes
                              </p>
                            </div>
                            <Badge
                              variant={
                                season.episodes.filter((ep) => ep.sourceUrl).length ===
                                season.episodes.length
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              {season.episodes.filter((ep) => ep.sourceUrl).length}/
                              {season.episodes.length}
                            </Badge>
                          </div>
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pl-8 pr-2 py-2 space-y-2 border-l-2 border-muted ml-4 max-h-[350px] overflow-y-auto">
                          {season.episodes.map((episode, episodeIndex) => (
                            <div
                              key={episode.episodeNumber}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg border",
                                episode.sourceUrl
                                  ? "bg-green-500/5 border-green-500/20"
                                  : "bg-muted/30"
                              )}
                            >
                              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                {episode.episodeNumber}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{episode.name}</p>
                                {episode.runtime && (
                                  <p className="text-xs text-muted-foreground">
                                    {episode.runtime} min
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {episode.sourceUrl ? (
                                  <>
                                    <div className="flex flex-col items-end">
                                      <Badge variant="outline" className="text-xs max-w-32 truncate">
                                        {episode.sourceUrl.split("/").pop()}
                                      </Badge>
                                      {episode.serverId && (
                                        <span className="text-xs text-muted-foreground">
                                          Server #{episode.serverId}
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => clearEpisodeFile(seasonIndex, episodeIndex)}
                                    >
                                      <X className="h-4 w-4" />
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      openFileBrowserForEpisode(seasonIndex, episodeIndex)
                                    }
                                  >
                                    <Folder className="h-4 w-4 mr-1" />
                                    Assign File
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}

                  {formData.seasons.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <Layers className="h-12 w-12 mb-2 opacity-50" />
                      <p>No seasons loaded</p>
                      <p className="text-sm">Search and select a series from TMDB first</p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Update Series" : "Create Series"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Browser */}
      <FileBrowser
        open={fileBrowserOpen}
        onOpenChange={setFileBrowserOpen}
        onSelect={handleEpisodeFileSelect}
        title="Select Episode File"
        description={
          selectedEpisode
            ? `Select video file for S${formData.seasons[selectedEpisode.seasonIndex]?.seasonNumber}E${formData.seasons[selectedEpisode.seasonIndex]?.episodes[selectedEpisode.episodeIndex]?.episodeNumber}`
            : "Select a video file"
        }
      />
    </>
  );
}

