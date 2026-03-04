"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Search,
  Upload,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Trash2,
  Play,
  Link2,
  Radio,
  Tv,
  Film,
  AlertCircle,
  Loader2,
  ExternalLink,
  Server,
  Power,
  PowerOff,
  Activity,
  RotateCcw,
  Eye,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Wifi,
  WifiOff,
  HelpCircle,
  ChevronDown,
  Edit,
  CheckCircle,
  XCircle,
  GripVertical,
  LayoutGrid,
  List,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown } from "lucide-react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { StreamLogo, StreamLogoContainer } from "@/components/ui/stream-logo";

import {
  useStreams,
  useDeleteStream,
  useDuplicateStream,
  useTestStream,
  useEnableAlwaysOn,
  useDisableAlwaysOn,
  useRestartAlwaysOn,
  useBatchReorderStreams,
} from "@/lib/api/hooks/useStreams";
import { useCategories } from "@/lib/api/hooks/useDashboard";
import { useServers } from "@/lib/api/hooks/useServers";
import { api } from "@/lib/api/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRunningSince } from "@/lib/utils";
import { Users, Clock } from "lucide-react";
import { EpgAssignmentModal } from "@/components/admin/epg-assignment-modal";
import { VideoPlayer } from "@/components/player/video-player";

// This page only manages LIVE and RADIO streams
// VOD content is managed in the dedicated /admin/vod page

interface ServerDistribution {
  id: number;
  serverId: number;
  streamId: number;
  role: "ORIGIN" | "CHILD";
  tier: number;
  pullFromServerId: number | null;
  isActive: boolean;
  priority: number;
  server: {
    id: number;
    name: string;
    status: string;
    region?: string;
  };
}

interface Stream {
  id: number;
  name: string;
  streamType: "LIVE" | "VOD" | "SERIES" | "RADIO";
  sourceUrl: string;
  backupUrls: string[];
  logoUrl: string | null;
  isActive: boolean;
  alwaysOn: boolean;
  categoryId: number;
  category?: {
    id: number;
    name: string;
  };
  epgChannelId: string | null;
  transcodeProfile: string | null;
  tvArchive: boolean;
  tvArchiveDuration: number;
  serverDistribution?: ServerDistribution[];
  // Stream status info
  streamStatus?: "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "ERROR" | "RESTARTING";
  lastStartedAt?: string;
  ffmpegPid?: number;
  // Display status: 'active' (running/viewers) or 'on_demand' (idle)
  displayStatus?: "active" | "on_demand" | "stopping";
  viewerCount?: number;
  // Always-on status from API
  alwaysOnStatus?: {
    status: string;
    viewers: number;
    startedAt?: string;
    restartCount: number;
  };
  // Source status (online/offline based on source URL checks)
  sourceStatus?: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastSourceCheck?: string;
  onlineSourceCount?: number;
  totalSourceCount?: number;
}

const streamTypeIcons = {
  LIVE: Tv,
  VOD: Film,
  SERIES: Film,
  RADIO: Radio,
};

// Sortable table row component for drag and drop
function SortableTableRow({ 
  id, 
  children, 
  disabled 
}: { 
  id: number; 
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? "bg-muted" : ""}>
      {!disabled && (
        <TableCell>
          <button
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </TableCell>
      )}
      {children}
    </TableRow>
  );
}

function StreamTable({
  streams,
  isLoading,
  onEdit,
  onDelete,
  onDuplicate,
  onTest,
  onPreview,
  onToggleAlwaysOn,
  onRestartAlwaysOn,
  onLinkEpg,
  sortBy,
  sortOrder,
  onSort,
  selectedStreams,
  onToggleSelection,
  onToggleAll,
  onReorder,
}: {
  streams: Stream[];
  isLoading: boolean;
  onEdit: (stream: Stream) => void;
  onDelete: (stream: Stream) => void;
  onDuplicate: (stream: Stream) => void;
  onTest: (stream: Stream) => void;
  onPreview: (stream: Stream) => void;
  onToggleAlwaysOn: (stream: Stream, enable: boolean) => void;
  onRestartAlwaysOn: (stream: Stream) => void;
  onLinkEpg: (stream: Stream) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort: (field: string) => void;
  selectedStreams?: Set<number>;
  onToggleSelection?: (id: number) => void;
  onToggleAll?: () => void;
  onReorder?: (updates: { id: number; sortOrder: number }[]) => void;
}) {
  const SortableHeader = ({ field, children }: { field: string; children: React.ReactNode }) => {
    const isActive = sortBy === field;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={() => onSort(field)}
      >
        {children}
        {isActive ? (
          sortOrder === 'asc' ? (
            <ArrowUp className="ml-2 h-4 w-4" />
          ) : (
            <ArrowDown className="ml-2 h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
        )}
      </Button>
    );
  };

  // Client-side sorting for dynamic fields - removed as too slow with large datasets
  const sortedStreams = streams;

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id && onReorder) {
      const oldIndex = sortedStreams.findIndex((s) => s.id === active.id);
      const newIndex = sortedStreams.findIndex((s) => s.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedStreams = arrayMove(sortedStreams, oldIndex, newIndex);
        // Generate updates with new sortOrder values based on position
        const updates = reorderedStreams.map((stream, index) => ({
          id: stream.id,
          sortOrder: index,
        }));
        onReorder(updates);
      }
    }
  };

  if (isLoading) {
    return (
      <>
        {/* Mobile Loading */}
        <div className="md:hidden space-y-3 p-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-12 w-12 rounded" />
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
          ))}
        </div>
        {/* Desktop Loading */}
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead className="w-[50px]">Logo</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Servers</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Always On</TableHead>
              <TableHead className="text-center">Viewers</TableHead>
              <TableHead>Running Since</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...Array(5)].map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                <TableCell><Skeleton className="h-10 w-10" /></TableCell>
                <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell><Skeleton className="h-8 w-8" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </>
    );
  }

  if (streams.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Tv className="h-12 w-12 mb-2 opacity-50" />
        <p>No streams found</p>
        <p className="text-sm">Add a stream to get started</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3 p-3">
        {sortedStreams.map((stream) => {
          const Icon = streamTypeIcons[stream.streamType] || Tv;
          const isLive = stream.streamType === "LIVE";
          const serverCount = stream.serverDistribution?.length || 0;
          
          return (
            <Card key={stream.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  {/* Logo */}
                  <StreamLogoContainer>
                    <StreamLogo 
                      logoUrl={stream.logoUrl} 
                      alt={stream.name}
                      className="h-10 w-10 object-contain"
                    />
                  </StreamLogoContainer>

                  {/* Content */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div>
                      <div className="font-medium flex items-center gap-2 truncate">
                        {stream.name}
                        {stream.alwaysOn && (
                          <Activity className="h-3 w-3 text-green-500 animate-pulse flex-shrink-0" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {stream.category?.name || "Uncategorized"}
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-1.5">
                      {!stream.isActive ? (
                        <Badge variant="secondary" className="text-xs">⚪ Inactive</Badge>
                      ) : stream.alwaysOn ? (
                        <Badge variant="default" className="bg-green-600 text-white text-xs">
                          🟢 Active
                        </Badge>
                      ) : stream.displayStatus === "active" ? (
                        <Badge variant="default" className="bg-green-600 text-white text-xs">
                          🟢 Active
                        </Badge>
                      ) : stream.displayStatus === "stopping" ? (
                        <Badge variant="outline" className="text-amber-400 border-amber-400 text-xs">
                          ⏳ Stopping
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-blue-400 border-blue-400 text-xs">
                          ⏸ On Demand
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">{stream.streamType}</Badge>
                      {/* Source Status Badge */}
                      {stream.sourceStatus === "OFFLINE" && (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1">
                          <WifiOff className="h-3 w-3" />
                          Source Offline
                        </Badge>
                      )}
                      {stream.sourceStatus === "ONLINE" && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1 text-green-500 border-green-500">
                          <Wifi className="h-3 w-3" />
                          Source OK
                        </Badge>
                      )}
                    </div>

                    {/* Info row */}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {/* Always show viewer count for on-demand streams */}
                      <span className="flex items-center gap-1">
                        <Users className={`h-3.5 w-3.5 ${(stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0) > 0 ? 'text-blue-400' : 'text-muted-foreground'}`} />
                        <span className={`font-medium ${(stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0) > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                          {stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0}
                        </span>
                      </span>
                      {stream.alwaysOn && (stream.alwaysOnStatus?.status === "running" && stream.alwaysOnStatus?.startedAt) && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-medium">
                            {formatRunningSince(stream.alwaysOnStatus.startedAt)}
                          </span>
                        </span>
                      )}
                      {serverCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Server className="h-3.5 w-3.5" />
                          {serverCount} server{serverCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Always On toggle for LIVE */}
                    {isLive && (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          checked={stream.alwaysOn}
                          onCheckedChange={(checked) => onToggleAlwaysOn(stream, checked)}
                          aria-label="Always on"
                        />
                        <span className="text-xs text-muted-foreground">Always On</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0 flex-shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => window.location.href = `/admin/streams/${stream.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTest(stream)}>
                        <Play className="mr-2 h-4 w-4" />
                        Test Stream
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPreview(stream)}>
                        <Tv className="mr-2 h-4 w-4" />
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(stream)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(stream)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(stream.sourceUrl, '_blank')}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Source
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onLinkEpg(stream)}>
                        <Link2 className="mr-2 h-4 w-4" />
                        {stream.epgChannelId ? "Change EPG" : "Link EPG"}
                      </DropdownMenuItem>
                      {isLive && (
                        <>
                          <DropdownMenuSeparator />
                          {stream.alwaysOn ? (
                            <>
                              <DropdownMenuItem onClick={() => onRestartAlwaysOn(stream)}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Restart Stream
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onToggleAlwaysOn(stream, false)}>
                                <PowerOff className="mr-2 h-4 w-4 text-orange-500" />
                                Disable Always-On
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => onToggleAlwaysOn(stream, true)}>
                              <Power className="mr-2 h-4 w-4 text-green-500" />
                              Enable Always-On
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(stream)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Desktop Table View */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow>
              {onReorder && <TableHead className="w-[50px]"></TableHead>}
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={selectedStreams?.size === streams.length && streams.length > 0}
                  onCheckedChange={onToggleAll}
                />
              </TableHead>
              <TableHead className="w-[50px]">Logo</TableHead>
              <TableHead><SortableHeader field="name">Name</SortableHeader></TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Servers</TableHead>
              <TableHead><SortableHeader field="isActive">Status</SortableHeader></TableHead>
              <TableHead><SortableHeader field="alwaysOn">Always On</SortableHeader></TableHead>
              <TableHead className="text-center">Viewers</TableHead>
              <TableHead>Running Since</TableHead>
              <TableHead><SortableHeader field="streamType">Type</SortableHeader></TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <SortableContext
            items={sortedStreams.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
            disabled={!onReorder}
          >
            <TableBody>
          {sortedStreams.map((stream) => {
            const Icon = streamTypeIcons[stream.streamType] || Tv;
            const isLive = stream.streamType === "LIVE";
            const serverCount = stream.serverDistribution?.length || 0;
              return (
              <SortableTableRow key={stream.id} id={stream.id} disabled={!onReorder}>
                <TableCell>
                  <Checkbox
                    checked={selectedStreams?.has(stream.id)}
                    onCheckedChange={() => onToggleSelection?.(stream.id)}
                  />
                </TableCell>
                <TableCell>
                  <StreamLogoContainer className="h-10 w-10">
                    <StreamLogo 
                      logoUrl={stream.logoUrl} 
                      alt={stream.name}
                      className="h-8 w-8 object-contain"
                      iconClassName="h-5 w-5 text-muted-foreground"
                    />
                  </StreamLogoContainer>
                </TableCell>
                <TableCell>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {stream.name}
                      {stream.alwaysOn && (
                        <Activity className="h-3 w-3 text-green-500 animate-pulse" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {stream.sourceUrl}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{stream.category?.name || "Uncategorized"}</Badge>
                </TableCell>
                <TableCell>
                  {serverCount > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {stream.serverDistribution!.slice(0, 2).map((sd) => (
                        <Badge 
                          key={sd.id} 
                          variant={sd.server.status === "ONLINE" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          <Server className="h-2.5 w-2.5 mr-1" />
                          {sd.server.name}
                        </Badge>
                      ))}
                      {serverCount > 2 && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          +{serverCount - 2}
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Auto</span>
                  )}
                </TableCell>
                <TableCell>
                  {!stream.isActive ? (
                    <Badge variant="secondary">⚪ Inactive</Badge>
                  ) : stream.alwaysOn ? (
                    <Badge variant="default" className="bg-green-600 text-white">
                      🟢 Active
                    </Badge>
                  ) : stream.displayStatus === "active" ? (
                    <Badge variant="default" className="bg-green-600 text-white">
                      🟢 Active
                    </Badge>
                  ) : stream.displayStatus === "stopping" ? (
                    <Badge variant="outline" className="text-amber-400 border-amber-400">
                      ⏳ Stopping
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-blue-400 border-blue-400">
                      ⏸ On Demand
                    </Badge>
                  )}
                  {/* Source Status */}
                  {stream.sourceStatus === "OFFLINE" && (
                    <Badge variant="destructive" className="ml-1 text-xs">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Offline
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  {isLive ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={stream.alwaysOn}
                        onCheckedChange={(checked) => onToggleAlwaysOn(stream, checked)}
                        aria-label="Always on"
                      />
                      {stream.alwaysOn && (
                        <Badge variant="default" className="bg-green-600 text-white">
                          <Activity className="h-3 w-3 mr-1" />
                          24/7
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                {/* Active Viewers - Always show for on-demand streams */}
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Users className={`h-3.5 w-3.5 ${(stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0) > 0 ? 'text-blue-400' : 'text-muted-foreground'}`} />
                    <span className={`font-medium ${(stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0) > 0 ? 'text-blue-400' : 'text-muted-foreground'}`}>
                      {stream.alwaysOnStatus?.viewers ?? stream.viewerCount ?? 0}
                    </span>
                  </div>
                </TableCell>
                {/* Running Since */}
                <TableCell>
                  {stream.alwaysOn && stream.alwaysOnStatus?.status === "running" && stream.alwaysOnStatus?.startedAt ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        {formatRunningSince(stream.alwaysOnStatus.startedAt)}
                      </span>
                    </div>
                  ) : stream.alwaysOn && stream.lastStartedAt && stream.streamStatus === "RUNNING" ? (
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        {formatRunningSince(stream.lastStartedAt)}
                      </span>
                    </div>
                  ) : stream.streamStatus === "STARTING" || stream.alwaysOnStatus?.status === "starting" ? (
                    <span className="text-amber-400 text-sm">Starting...</span>
                  ) : stream.streamStatus === "RESTARTING" ? (
                    <span className="text-amber-400 text-sm">Restarting...</span>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{stream.streamType}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => window.location.href = `/admin/streams/${stream.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onTest(stream)}>
                        <Play className="mr-2 h-4 w-4" />
                        Test Stream
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onPreview(stream)}>
                        <Tv className="mr-2 h-4 w-4" />
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onEdit(stream)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(stream)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => window.open(stream.sourceUrl, '_blank')}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Source
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onLinkEpg(stream)}>
                        <Link2 className="mr-2 h-4 w-4" />
                        {stream.epgChannelId ? "Change EPG" : "Link EPG"}
                      </DropdownMenuItem>
                      {isLive && (
                        <>
                          <DropdownMenuSeparator />
                          {stream.alwaysOn ? (
                            <>
                              <DropdownMenuItem onClick={() => onRestartAlwaysOn(stream)}>
                                <RotateCcw className="mr-2 h-4 w-4" />
                                Restart Stream
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onToggleAlwaysOn(stream, false)}>
                                <PowerOff className="mr-2 h-4 w-4 text-orange-500" />
                                Disable Always-On
                              </DropdownMenuItem>
                            </>
                          ) : (
                            <DropdownMenuItem onClick={() => onToggleAlwaysOn(stream, true)}>
                              <Power className="mr-2 h-4 w-4 text-green-500" />
                              Enable Always-On
                            </DropdownMenuItem>
                          )}
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => onDelete(stream)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </SortableTableRow>
            );
          })}
          </TableBody>
          </SortableContext>
        </Table>
      </DndContext>
    </>
  );
}

export default function StreamsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"LIVE" | "RADIO">("LIVE");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>(undefined);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [countryId, setCountryId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [countryOpen, setCountryOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Dialog states (only for delete confirmation)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  
  // Bulk edit states
  const [selectedStreams, setSelectedStreams] = useState<Set<number>>(new Set());
  const [selectAllRecords, setSelectAllRecords] = useState(false); // Select all across pages
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
  const [isBulkEditLoading, setIsBulkEditLoading] = useState(false);
  const [bulkCountryId, setBulkCountryId] = useState<number | undefined>(undefined);
  const [bulkEditData, setBulkEditData] = useState({
    categoryId: undefined as number | undefined,
    isActive: undefined as boolean | undefined,
    alwaysOn: undefined as boolean | undefined,
    serverIds: undefined as number[] | undefined,
    cascadeDistribution: false,
  });
  
  // EPG modal state
  const [isEpgModalOpen, setIsEpgModalOpen] = useState(false);
  const [epgStream, setEpgStream] = useState<Stream | null>(null);

  // Preview modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewStream, setPreviewStream] = useState<Stream | null>(null);

  // Fetch categories for filter
  const { data: categories } = useCategories(activeTab);
  
  // Split categories into countries (parent) and subcategories
  const countries = useMemo(() => {
    if (!categories) return [];
    return categories.filter(cat => !cat.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories]);
  
  const subcategories = useMemo(() => {
    if (!categories || !countryId) return [];
    return categories.filter(cat => cat.parentId === countryId).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, countryId]);
  
  // Subcategories for bulk edit dialog (based on bulkCountryId)
  const bulkSubcategories = useMemo(() => {
    if (!categories || !bulkCountryId) return [];
    return categories.filter(cat => cat.parentId === bulkCountryId).sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, bulkCountryId]);
  
  // Fetch servers for bulk edit
  const { data: serversData } = useServers();
  
  // Extract servers array from API response
  const servers = useMemo(() => {
    if (!serversData) return [];
    return (serversData as any)?.servers || (serversData as any)?.data || [];
  }, [serversData]);

  // API hooks with automatic background refresh
  // When country is selected but no subcategory, filter by parent category
  const effectiveCategoryId = categoryId || countryId;
  const { data, isLoading, error, refetch, isFetching } = useStreams({
    type: activeTab,
    search: searchQuery || undefined,
    categoryId: effectiveCategoryId,
    page,
    pageSize: 50,
    sortBy,
    sortOrder,
  }, {
    refetchInterval: 5000, // Refresh every 5 seconds in background
    refetchIntervalInBackground: false, // Don't refresh when tab is not focused
  });
  const deleteStream = useDeleteStream();
  const duplicateStream = useDuplicateStream();
  const testStream = useTestStream();
  const enableAlwaysOn = useEnableAlwaysOn();
  const disableAlwaysOn = useDisableAlwaysOn();
  const restartAlwaysOn = useRestartAlwaysOn();
  const batchReorderStreams = useBatchReorderStreams();

  const streams = (data as { streams?: Stream[] })?.streams || [];
  const pagination = (data as { pagination?: { total: number; pages: number } })?.pagination;

  // Handle reordering streams via drag and drop
  const handleReorder = useCallback(async (updates: { id: number; sortOrder: number }[]) => {
    try {
      await batchReorderStreams.mutateAsync(updates);
    } catch {
      // Error handling - toast will be shown by the mutation
    }
  }, [batchReorderStreams]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
    setPage(1); // Reset to first page on sort change
  };

  const handleEdit = (stream: Stream) => {
    router.push(`/admin/streams/${stream.id}/edit`);
  };

  const handleDuplicate = async (stream: Stream) => {
    try {
      const result = await duplicateStream.mutateAsync({ id: stream.id });
      toast({
        title: "Stream duplicated",
        description: `Created "${result.name}"`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to duplicate stream.",
        variant: "destructive",
      });
    }
  };

  const handleTest = async (stream: Stream) => {
    try {
      const result = await testStream.mutateAsync(stream.sourceUrl);
      toast({
        title: result.success ? "Stream is working" : "Stream test failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({
        title: "Test failed",
        description: "Unable to test the stream",
        variant: "destructive",
      });
    }
  };

  const handlePreview = (stream: Stream) => {
    setPreviewStream(stream);
    setIsPreviewOpen(true);
  };

  const handleToggleAlwaysOn = async (stream: Stream, enable: boolean) => {
    try {
      if (enable) {
        const result = await enableAlwaysOn.mutateAsync(stream.id);
        toast({
          title: result.success ? "Always-On Enabled" : "Stream Started",
          description: result.message || (result.success
            ? `${stream.name} is now running 24/7`
            : `Started ${stream.name}, but may take a moment to go live`),
          variant: result.success ? "default" : "default",
        });
      } else {
        await disableAlwaysOn.mutateAsync(stream.id);
        toast({
          title: "Always-On Disabled",
          description: `${stream.name} will now be on-demand only`,
        });
      }
      refetch();
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message
        || error?.message
        || `Failed to ${enable ? 'enable' : 'disable'} always-on for ${stream.name}`;

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleRestartAlwaysOn = async (stream: Stream) => {
    try {
      const result = await restartAlwaysOn.mutateAsync(stream.id);
      toast({
        title: result.success ? "Stream Restarted" : "Restart Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive",
      });
    } catch {
      toast({
        title: "Restart Failed",
        description: `Unable to restart ${stream.name}`,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedStream) return;
    try {
      await deleteStream.mutateAsync(selectedStream.id);
      toast({
        title: "Stream deleted",
        description: `${selectedStream.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedStream(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete stream.",
        variant: "destructive",
      });
    }
  };

  const handleLinkEpg = (stream: Stream) => {
    setEpgStream(stream);
    setIsEpgModalOpen(true);
  };

  // Bulk edit handlers
  const toggleStreamSelection = (streamId: number) => {
    const newSelection = new Set(selectedStreams);
    if (newSelection.has(streamId)) {
      newSelection.delete(streamId);
    } else {
      newSelection.add(streamId);
    }
    setSelectedStreams(newSelection);
    setSelectAllRecords(false); // Reset select all when individual selection changes
  };

  const toggleAllStreams = () => {
    if (selectedStreams.size === streams.length && streams.length > 0) {
      setSelectedStreams(new Set());
      setSelectAllRecords(false);
    } else {
      setSelectedStreams(new Set(streams.map(s => s.id)));
      setSelectAllRecords(false);
    }
  };

  const selectAllRecordsAcrossPages = () => {
    setSelectAllRecords(true);
  };

  const deselectAllRecords = () => {
    setSelectedStreams(new Set());
    setSelectAllRecords(false);
  };

  const handleBulkEdit = () => {
    if (selectedStreams.size === 0) {
      toast({
        title: "No streams selected",
        description: "Please select at least one stream to edit.",
        variant: "destructive",
      });
      return;
    }
    setIsBulkEditDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedStreams.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedStreams).map(id => deleteStream.mutateAsync(id))
      );
      toast({
        title: "Streams deleted",
        description: `${selectedStreams.size} stream(s) have been deleted.`,
      });
      setSelectedStreams(new Set());
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete some streams.",
        variant: "destructive",
      });
    }
  };

  const executeBulkEdit = async () => {
    setIsBulkEditLoading(true);
    try {
      let streamIds: number[];
      let totalCount: number;

      if (selectAllRecords) {
        // Fetch all stream IDs matching current filters
        const result = await api.get<{ ids: number[] }>('/admin/streams', {
          type: activeTab,
          search: searchQuery || '',
          categoryId: categoryId || '',
          allIds: true,
        });
        streamIds = result.ids || [];
        totalCount = streamIds.length;
      } else {
        streamIds = Array.from(selectedStreams);
        totalCount = streamIds.length;
      }

      if (streamIds.length === 0) {
        toast({
          title: "No streams to update",
          description: "No streams match the current selection.",
          variant: "destructive",
        });
        return;
      }

      // Build update payload
      const updates: any = {};
      // Use subcategory if selected, otherwise use country
      const effectiveBulkCategoryId = bulkEditData.categoryId || bulkCountryId;
      if (effectiveBulkCategoryId !== undefined) updates.categoryId = effectiveBulkCategoryId;
      if (bulkEditData.isActive !== undefined) updates.isActive = bulkEditData.isActive;
      if (bulkEditData.alwaysOn !== undefined) updates.alwaysOn = bulkEditData.alwaysOn;
      if (bulkEditData.serverIds !== undefined) {
        updates.serverIds = bulkEditData.serverIds;
        updates.cascadeDistribution = bulkEditData.cascadeDistribution;
      }

      // Use bulk update endpoint for efficient batch operation
      const result = await api.put<{ success: boolean; updated: number; failed: number }>('/admin/streams/bulk', {
        streamIds,
        updates,
      });
      
      toast({
        title: "Streams updated",
        description: `${result.updated} stream(s) have been updated.${result.failed > 0 ? ` ${result.failed} failed.` : ''}`,
      });
      
      setIsBulkEditDialogOpen(false);
      setBulkCountryId(undefined);
      setBulkEditData({
        categoryId: undefined,
        isActive: undefined,
        alwaysOn: undefined,
        serverIds: undefined,
        cascadeDistribution: false,
      });
      setSelectedStreams(new Set());
      setSelectAllRecords(false);
      refetch();
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update some streams.",
        variant: "destructive",
      });
    } finally {
      setIsBulkEditLoading(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load streams</h2>
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
            Live Streams
            {isFetching && !isLoading && (
              <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your live TV channels and radio streams
            <span className="text-xs ml-2 text-zinc-500">• Auto-refreshing</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(selectedStreams.size > 0 || selectAllRecords) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex-1 sm:flex-none">
                  <Edit className="mr-2 h-4 w-4" />
                  Actions ({selectAllRecords ? pagination?.total || 0 : selectedStreams.size})
                  <ChevronDown className="ml-2 h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleBulkEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Mass Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => {
                  await api.put('/admin/streams/bulk', {
                    streamIds: Array.from(selectedStreams),
                    updates: { isActive: true },
                  });
                  toast({ title: "Success", description: "Streams activated" });
                  setSelectedStreams(new Set());
                  refetch();
                }}>
                  <CheckCircle className="mr-2 h-4 w-4 text-green-500" />
                  Activate All
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  await api.put('/admin/streams/bulk', {
                    streamIds: Array.from(selectedStreams),
                    updates: { isActive: false },
                  });
                  toast({ title: "Success", description: "Streams deactivated" });
                  setSelectedStreams(new Set());
                  refetch();
                }}>
                  <XCircle className="mr-2 h-4 w-4 text-orange-500" />
                  Deactivate All
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBulkDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button variant="outline" onClick={() => refetch()} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading || isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none">
            <Upload className="mr-2 h-4 w-4" />
            <span className="hidden xs:inline">Import</span> M3U
          </Button>
          <Button onClick={() => router.push("/admin/streams/new")} className="flex-1 sm:flex-none">
            <Plus className="mr-2 h-4 w-4" />
            Add Stream
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Live Streams ({pagination?.total || streams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "LIVE" | "RADIO"); setCountryId(undefined); setCategoryId(undefined); setPage(1); }}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="LIVE" className="flex-1 sm:flex-none">
                  <Tv className="mr-2 h-4 w-4" />
                  Live TV
                </TabsTrigger>
                <TabsTrigger value="RADIO" className="flex-1 sm:flex-none">
                  <Radio className="mr-2 h-4 w-4" />
                  Radio
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {/* Country Filter (Parent Categories) */}
                <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={countryOpen}
                      className="w-full sm:w-[180px] justify-between"
                    >
                      <Filter className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate">
                        {countryId
                          ? countries?.find((cat) => cat.id === countryId)?.name || "Select..."
                          : "All Countries"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[220px] p-0">
                    <Command>
                      <CommandInput placeholder="Search countries..." />
                      <CommandList>
                        <CommandEmpty>No country found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="all-countries"
                            onSelect={() => {
                              setCountryId(undefined);
                              setCategoryId(undefined);
                              setCountryOpen(false);
                              setPage(1);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${
                                countryId === undefined ? "opacity-100" : "opacity-0"
                              }`}
                            />
                            All Countries
                          </CommandItem>
                          {countries?.map((cat) => (
                            <CommandItem
                              key={cat.id}
                              value={cat.name}
                              onSelect={() => {
                                setCountryId(cat.id);
                                setCategoryId(undefined);
                                setCountryOpen(false);
                                setPage(1);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  countryId === cat.id ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              {cat.name} ({cat._count.streams})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Subcategory Filter (only shown when country selected) */}
                {countryId && subcategories.length > 0 && (
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryOpen}
                        className="w-full sm:w-[180px] justify-between"
                      >
                        <span className="truncate">
                          {categoryId
                            ? subcategories?.find((cat) => cat.id === categoryId)?.name || "Select..."
                            : "All Subcategories"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[220px] p-0">
                      <Command>
                        <CommandInput placeholder="Search subcategories..." />
                        <CommandList>
                          <CommandEmpty>No subcategory found.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem
                              value="all-subcategories"
                              onSelect={() => {
                                setCategoryId(undefined);
                                setCategoryOpen(false);
                                setPage(1);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  categoryId === undefined ? "opacity-100" : "opacity-0"
                                }`}
                              />
                              All Subcategories
                            </CommandItem>
                            {subcategories?.map((cat) => (
                              <CommandItem
                                key={cat.id}
                                value={cat.name}
                                onSelect={() => {
                                  setCategoryId(cat.id);
                                  setCategoryOpen(false);
                                  setPage(1);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${
                                    categoryId === cat.id ? "opacity-100" : "opacity-0"
                                  }`}
                                />
                                {cat.name} ({cat._count.streams})
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Search */}
                <div className="relative w-full sm:max-w-sm">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search streams..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                    className="pl-8"
                  />
                </div>
              </div>
            </div>

            {/* Gmail-style "Select All" Banner */}
            {selectedStreams.size === streams.length && streams.length > 0 && !selectAllRecords && pagination && pagination.total > streams.length && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex items-center justify-between">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  All {streams.length} streams on this page are selected.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={selectAllRecordsAcrossPages}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                  Select all {pagination.total} streams
                </Button>
              </div>
            )}

            {/* Selected All Records Banner */}
            {selectAllRecords && pagination && (
              <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md p-3 flex items-center justify-between">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  All {pagination.total} streams are selected.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={deselectAllRecords}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
                >
                  Clear selection
                </Button>
              </div>
            )}

            <TabsContent value="LIVE">
              <div className="rounded-md border overflow-x-auto">
                <StreamTable
                  streams={streams}
                  isLoading={isLoading}
                  onEdit={handleEdit}
                  onDelete={(stream) => {
                    setSelectedStream(stream);
                    setIsDeleteDialogOpen(true);
                  }}
                  onDuplicate={handleDuplicate}
                  onTest={handleTest}
                  onPreview={handlePreview}
                  onToggleAlwaysOn={handleToggleAlwaysOn}
                  onRestartAlwaysOn={handleRestartAlwaysOn}
                  onLinkEpg={handleLinkEpg}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  selectedStreams={selectedStreams}
                  onToggleSelection={toggleStreamSelection}
                  onToggleAll={toggleAllStreams}
                  onReorder={effectiveCategoryId ? handleReorder : undefined}
                />
              </div>
            </TabsContent>

            <TabsContent value="RADIO">
              <div className="rounded-md border overflow-x-auto">
                <StreamTable
                  streams={streams}
                  isLoading={isLoading}
                  onEdit={handleEdit}
                  onDelete={(stream) => {
                    setSelectedStream(stream);
                    setIsDeleteDialogOpen(true);
                  }}
                  onDuplicate={handleDuplicate}
                  onTest={handleTest}
                  onPreview={handlePreview}
                  onToggleAlwaysOn={handleToggleAlwaysOn}
                  onRestartAlwaysOn={handleRestartAlwaysOn}
                  onLinkEpg={handleLinkEpg}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={handleSort}
                  selectedStreams={selectedStreams}
                  onToggleSelection={toggleStreamSelection}
                  onToggleAll={toggleAllStreams}
                  onReorder={effectiveCategoryId ? handleReorder : undefined}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
              <div className="text-sm text-muted-foreground">
                Showing {streams.length} of {pagination.total} streams
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
                  Page {page} of {pagination.pages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}

          {/* Bulk Import Section */}
          <div className="mt-6 rounded-lg border border-dashed p-4 sm:p-6">
            <div className="flex flex-col items-center justify-center text-center">
              <Upload className="h-8 w-8 sm:h-10 sm:w-10 text-muted-foreground mb-3 sm:mb-4" />
              <h3 className="font-semibold text-sm sm:text-base">Bulk Import Streams</h3>
              <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                Upload an M3U file, paste URLs, or import from a remote URL
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" size="sm">
                  📎 Upload M3U
                </Button>
                <Button variant="outline" size="sm">
                  📋 Paste URLs
                </Button>
                <Button variant="outline" size="sm">
                  🔗 Import URL
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Edit Dialog */}
      <Dialog open={isBulkEditDialogOpen} onOpenChange={setIsBulkEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mass Edit Streams</DialogTitle>
            <DialogDescription>
              Update {selectedStreams.size} selected stream(s). Only fields you change will be updated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-country">Country</Label>
              <Select
                value={bulkCountryId?.toString() ?? "none"}
                onValueChange={(value) => {
                  const newCountryId = value === "none" ? undefined : parseInt(value);
                  setBulkCountryId(newCountryId);
                  // Clear subcategory when country changes
                  setBulkEditData({ ...bulkEditData, categoryId: undefined });
                }}
              >
                <SelectTrigger id="bulk-country">
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  {countries?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bulkCountryId && bulkSubcategories.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="bulk-subcategory">Subcategory</Label>
                <Select
                  value={bulkEditData.categoryId?.toString() ?? "none"}
                  onValueChange={(value) =>
                    setBulkEditData({ ...bulkEditData, categoryId: value === "none" ? undefined : parseInt(value) })
                  }
                >
                  <SelectTrigger id="bulk-subcategory">
                    <SelectValue placeholder="No change (use country only)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No change (use country only)</SelectItem>
                    {bulkSubcategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bulk-status">Status</Label>
              <Select
                value={bulkEditData.isActive?.toString()}
                onValueChange={(value) =>
                  setBulkEditData({
                    ...bulkEditData,
                    isActive: value === "none" ? undefined : value === "true",
                  })
                }
              >
                <SelectTrigger id="bulk-status">
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-always-on">Always-On</Label>
              <Select
                value={bulkEditData.alwaysOn?.toString()}
                onValueChange={(value) =>
                  setBulkEditData({
                    ...bulkEditData,
                    alwaysOn: value === "none" ? undefined : value === "true",
                  })
                }
              >
                <SelectTrigger id="bulk-always-on">
                  <SelectValue placeholder="No change" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="true">Enable</SelectItem>
                  <SelectItem value="false">Disable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-servers">Server Distribution</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md min-h-[40px]">
                {bulkEditData.serverIds && bulkEditData.serverIds.length > 0 ? (
                  bulkEditData.serverIds.map((serverId) => {
                    const server = servers?.find((s: any) => s.id === serverId);
                    return server ? (
                      <Badge key={serverId} variant="secondary" className="flex items-center gap-1">
                        {server.name}
                        <button
                          type="button"
                          onClick={() => {
                            setBulkEditData({
                              ...bulkEditData,
                              serverIds: bulkEditData.serverIds?.filter((id) => id !== serverId),
                            });
                          }}
                          className="ml-1 hover:bg-secondary-foreground/20 rounded-full"
                        >
                          ×
                        </button>
                      </Badge>
                    ) : null;
                  })
                ) : (
                  <span className="text-sm text-muted-foreground">No change (click to select servers)</span>
                )}
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full mt-1">
                    <Server className="mr-2 h-4 w-4" />
                    {bulkEditData.serverIds && bulkEditData.serverIds.length > 0
                      ? `${bulkEditData.serverIds.length} server(s) selected`
                      : "Select servers"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search servers..." />
                    <CommandList>
                      <CommandEmpty>No servers found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setBulkEditData({ ...bulkEditData, serverIds: undefined });
                          }}
                        >
                          <Check
                            className={`mr-2 h-4 w-4 ${
                              !bulkEditData.serverIds ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          No change
                        </CommandItem>
                        {servers?.map((server: any) => {
                          const isSelected = bulkEditData.serverIds?.includes(server.id);
                          return (
                            <CommandItem
                              key={server.id}
                              onSelect={() => {
                                const current = bulkEditData.serverIds || [];
                                if (isSelected) {
                                  setBulkEditData({
                                    ...bulkEditData,
                                    serverIds: current.filter((id) => id !== server.id),
                                  });
                                } else {
                                  setBulkEditData({
                                    ...bulkEditData,
                                    serverIds: [...current, server.id],
                                  });
                                }
                              }}
                            >
                              <Checkbox
                                checked={!!isSelected}
                                className="mr-2"
                                onCheckedChange={() => {}}
                              />
                              <div className="flex items-center gap-2">
                                <span>{server.name}</span>
                                <Badge 
                                  variant={server.status === "ONLINE" ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {server.status}
                                </Badge>
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              
              {/* Cascade Distribution Toggle */}
              {bulkEditData.serverIds && bulkEditData.serverIds.length > 0 && (
                <div className="flex items-center space-x-2 p-3 bg-muted/50 rounded-md">
                  <Checkbox
                    id="cascade-distribution"
                    checked={bulkEditData.cascadeDistribution}
                    onCheckedChange={(checked) =>
                      setBulkEditData({
                        ...bulkEditData,
                        cascadeDistribution: checked as boolean,
                      })
                    }
                  />
                  <div className="flex flex-col">
                    <Label
                      htmlFor="cascade-distribution"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                    >
                      Enable Cascade Distribution
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Automatically distribute streams across selected servers in a hierarchical cascade pattern
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkEditDialogOpen(false)} disabled={isBulkEditLoading}>
              Cancel
            </Button>
            <Button onClick={executeBulkEdit} disabled={isBulkEditLoading}>
              {isBulkEditLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Edit className="mr-2 h-4 w-4" />
              )}
              {isBulkEditLoading ? 'Updating...' : `Update ${selectAllRecords ? pagination?.total || 0 : selectedStreams.size} Stream(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Stream</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedStream?.name}&quot;?
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
              disabled={deleteStream.isPending}
            >
              {deleteStream.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* EPG Assignment Modal */}
      {epgStream && (
        <EpgAssignmentModal
          isOpen={isEpgModalOpen}
          onClose={() => {
            setIsEpgModalOpen(false);
            setEpgStream(null);
          }}
          streamId={epgStream.id}
          streamName={epgStream.name}
          currentEpgChannelId={epgStream.epgChannelId}
          onSuccess={() => {
            refetch();
          }}
        />
      )}

      {/* Stream Preview Modal */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl w-full">
          <DialogHeader>
            <DialogTitle>Preview: {previewStream?.name}</DialogTitle>
            <DialogDescription>
              Live preview of the stream
            </DialogDescription>
          </DialogHeader>
          <div className="aspect-video bg-black rounded-lg overflow-hidden">
            {previewStream && (
              <VideoPlayer
                src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '')}/streaming/${previewStream.id}/preview.m3u8`}
                title={previewStream.name}
                autoPlay
                isAdminPreview
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
