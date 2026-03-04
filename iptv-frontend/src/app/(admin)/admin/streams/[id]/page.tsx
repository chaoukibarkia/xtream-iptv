"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Pause,
  RefreshCw,
  Activity,
  Server,
  Clock,
  Users,
  Wifi,
  WifiOff,
  Zap,
  Film,
  Tv,
  Radio,
  ExternalLink,
  Settings,
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  Monitor,
  Volume2,
  Gauge,
  FileVideo,
  FileAudio,
  Shield,
  RotateCcw,
  Eye,
  BarChart3,
  Info,
  Pencil,
  Calendar,
  Link2,
  ChevronLeft,
  ChevronRight,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StreamPlayer } from "@/components/player/stream-player";
import { formatBitrate, formatDuration, formatDate, formatDateTime, formatRunningSince } from "@/lib/utils";
import {
  useStreamDetails,
  useProbeStream,
  useHealthCheckStream,
  useRestartAlwaysOn,
  useEnableAlwaysOn,
  useDisableAlwaysOn,
  useDeleteStream,
} from "@/lib/api/hooks/useStreams";
import { useStreamEpg } from "@/lib/api/hooks/useEpg";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { EpgAssignmentModal } from "@/components/admin/epg-assignment-modal";
import { format as formatDateFns, formatDistanceToNow } from "date-fns";

const streamTypeIcons = {
  LIVE: Tv,
  VOD: Film,
  SERIES: Film,
  RADIO: Radio,
};

function StatusBadge({ 
  online, 
  latency,
  activeViewers = 0,
  isPlaying = false,
  alwaysOn = false,
  sourceDown = false,
}: { 
  online: boolean; 
  latency?: number;
  activeViewers?: number;
  isPlaying?: boolean;
  alwaysOn?: boolean;
  sourceDown?: boolean;
}) {
  // Source is down - show warning even if stream process is running
  if (sourceDown) {
    return (
      <Badge
        variant="destructive"
        className="bg-orange-500/10 text-orange-400 border-orange-500/30 flex items-center gap-1.5"
      >
        <AlertCircle className="h-3 w-3" />
        Source Down
      </Badge>
    );
  }

  // Always-on streams are always "Active" when enabled
  // On-demand streams are "Active" when viewers are watching
  const isActive = online && (alwaysOn || activeViewers > 0 || isPlaying);
  
  if (!online) {
    return (
      <Badge
        variant="destructive"
        className="bg-red-500/10 text-red-400 border-red-500/30 flex items-center gap-1.5"
      >
        <WifiOff className="h-3 w-3" />
        Offline
      </Badge>
    );
  }
  
  if (isActive) {
    return (
      <Badge
        className="bg-green-500/10 text-green-400 border-green-500/30 flex items-center gap-1.5 animate-pulse"
      >
        <Activity className="h-3 w-3" />
        Active {latency && <span className="opacity-70">({latency}ms)</span>}
      </Badge>
    );
  }
  
  // On Demand - source is available but no one is watching
  return (
    <Badge
      className="bg-blue-500/10 text-blue-400 border-blue-500/30 flex items-center gap-1.5"
    >
      <Wifi className="h-3 w-3" />
      On Demand {latency && <span className="opacity-70">({latency}ms)</span>}
    </Badge>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="bg-gradient-to-br from-zinc-900 to-zinc-950 border-zinc-800">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-zinc-800">
            <Icon className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
            <p className="text-xl font-bold text-zinc-100">{value}</p>
            {subValue && <p className="text-xs text-zinc-500">{subValue}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProbeInfoCard({ probe }: { probe: any }) {
  if (!probe || !probe.success) {
    // Determine if this is a probe failure (stream down) vs just not probed yet
    const isProbeFailure = probe?.error && probe?.probeTime !== undefined;
    
    return (
      <Card className={`border ${isProbeFailure ? 'bg-red-950/30 border-red-900/50' : 'bg-zinc-900/50 border-zinc-800'}`}>
        <CardContent className={`p-6 text-center ${isProbeFailure ? 'text-red-400' : 'text-zinc-500'}`}>
          <AlertCircle className={`h-8 w-8 mx-auto mb-2 ${isProbeFailure ? 'text-red-400' : 'opacity-50'}`} />
          <p className="font-medium">{isProbeFailure ? 'Stream Offline' : 'Stream probe data not available'}</p>
          <p className="text-xs mt-1">{probe?.error || "Click 'Probe Stream' to analyze"}</p>
          {isProbeFailure && probe?.probeTime && (
            <p className="text-xs text-red-400/70 mt-2">Probe took {probe.probeTime}ms</p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Estimate video bitrate for live streams (typically 2-8 Mbps for 1080p)
  const estimateVideoBitrate = () => {
    if (probe.video?.bit_rate) return probe.video.bit_rate;
    if (probe.video?.height) {
      // Rough estimates based on resolution
      if (probe.video.height >= 1080) return 4000000; // 4 Mbps
      if (probe.video.height >= 720) return 2500000;  // 2.5 Mbps
      if (probe.video.height >= 480) return 1000000;  // 1 Mbps
      return 500000; // 500 Kbps
    }
    return null;
  };

  const videoBitrate = probe.video?.bit_rate || estimateVideoBitrate();
  const isVideoBitrateEstimated = !probe.video?.bit_rate && !!estimateVideoBitrate();

  // Calculate total bitrate from streams if format bitrate is not available
  // Include estimated video bitrate when actual isn't available
  const calculateTotalBitrate = () => {
    if (probe.format?.bit_rate && probe.format.bit_rate > 0) {
      return { value: probe.format.bit_rate, estimated: false };
    }
    let total = 0;
    let hasEstimate = false;
    
    // Use actual video bitrate or estimated
    if (probe.video?.bit_rate) {
      total += probe.video.bit_rate;
    } else if (videoBitrate) {
      total += videoBitrate;
      hasEstimate = true;
    }
    
    // Add audio bitrate
    if (probe.audio?.bit_rate) {
      total += probe.audio.bit_rate;
    }
    
    return total > 0 ? { value: total, estimated: hasEstimate } : null;
  };

  const totalBitrateData = calculateTotalBitrate();
  const totalBitrate = totalBitrateData?.value || null;
  const isTotalBitrateEstimated = totalBitrateData?.estimated || false;

  return (
    <div className="space-y-4">
      {/* Video Info */}
      {probe.video && (
        <Card className="bg-gradient-to-br from-blue-950/30 to-zinc-950 border-blue-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileVideo className="h-4 w-4 text-blue-400" />
              Video Stream
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Codec</p>
              <p className="font-medium text-zinc-200">{probe.video.codec?.toUpperCase()}</p>
              {probe.video.profile && (
                <p className="text-xs text-zinc-500">{probe.video.profile}</p>
              )}
            </div>
            <div>
              <p className="text-zinc-500">Resolution</p>
              <p className="font-medium text-zinc-200">{probe.video.resolution}</p>
              {probe.video.aspect_ratio && (
                <p className="text-xs text-zinc-500">{probe.video.aspect_ratio}</p>
              )}
            </div>
            <div>
              <p className="text-zinc-500">Frame Rate</p>
              <p className="font-medium text-zinc-200">{probe.video.frame_rate}</p>
            </div>
            <div>
              <p className="text-zinc-500">Bitrate</p>
              <p className="font-medium text-zinc-200">
                {videoBitrate ? formatBitrate(videoBitrate) : "Variable"}
              </p>
              {!probe.video.bit_rate && videoBitrate && (
                <p className="text-xs text-zinc-500">estimated</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audio Info */}
      {probe.audio && (
        <Card className="bg-gradient-to-br from-purple-950/30 to-zinc-950 border-purple-900/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileAudio className="h-4 w-4 text-purple-400" />
              Audio Stream
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Codec</p>
              <p className="font-medium text-zinc-200">{probe.audio.codec?.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-zinc-500">Sample Rate</p>
              <p className="font-medium text-zinc-200">
                {probe.audio.sample_rate ? `${probe.audio.sample_rate / 1000} kHz` : "N/A"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Channels</p>
              <p className="font-medium text-zinc-200">
                {probe.audio.channel_layout || (probe.audio.channels ? `${probe.audio.channels} ch` : "N/A")}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Bitrate</p>
              <p className="font-medium text-zinc-200">
                {probe.audio.bit_rate ? formatBitrate(probe.audio.bit_rate) : "Variable"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Format Info */}
      {probe.format && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-zinc-400" />
              Container Format
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Format</p>
              <p className="font-medium text-zinc-200">{probe.format.format_name?.toUpperCase()}</p>
            </div>
            <div>
              <p className="text-zinc-500">Duration</p>
              <p className="font-medium text-zinc-200">
                {probe.format.duration > 0 ? formatDuration(probe.format.duration) : "Live Stream"}
              </p>
            </div>
            <div>
              <p className="text-zinc-500">Total Bitrate</p>
              <p className="font-medium text-zinc-200">
                {totalBitrate ? formatBitrate(totalBitrate) : "Variable"}
              </p>
              {totalBitrate && (
                <p className="text-xs text-zinc-500">
                  {probe.format?.bit_rate ? "from container" : isTotalBitrateEstimated ? "estimated" : "calculated"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Streams */}
      {probe.streams.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-zinc-400" />
              All Streams ({probe.streams.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {probe.streams.map((stream: any, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2 rounded-lg bg-zinc-800/50 text-sm"
                >
                  <Badge variant="outline" className="font-mono">
                    #{stream.index}
                  </Badge>
                  <Badge
                    className={
                      stream.codec_type === "video"
                        ? "bg-blue-500/20 text-blue-300"
                        : stream.codec_type === "audio"
                        ? "bg-purple-500/20 text-purple-300"
                        : "bg-zinc-500/20 text-zinc-300"
                    }
                  >
                    {stream.codec_type}
                  </Badge>
                  <span className="font-medium text-zinc-200">{stream.codec_name}</span>
                  {stream.width && stream.height && (
                    <span className="text-zinc-500">{stream.width}x{stream.height}</span>
                  )}
                  {stream.language && (
                    <Badge variant="outline" className="text-xs">
                      {stream.language}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function StreamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const streamId = parseInt(params.id as string);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Get settings for preview line
  const { data: settings } = useSettings();
  const previewUsername = (settings?.streaming as any)?.previewLineUsername || '';
  const previewPassword = (settings?.streaming as any)?.previewLinePassword || '';

  // Queries with automatic background refresh
  const { data, isLoading, error, refetch, isFetching } = useStreamDetails(streamId, {
    includeHealth: true,
    includeProbe: false,
  }, {
    refetchInterval: 5000, // Refresh every 5 seconds in background
    refetchIntervalInBackground: false, // Don't refresh when tab is not focused
  });

  // Mutations
  const probeStream = useProbeStream();
  const healthCheck = useHealthCheckStream();
  const restartAlwaysOn = useRestartAlwaysOn();
  const enableAlwaysOn = useEnableAlwaysOn();
  const disableAlwaysOn = useDisableAlwaysOn();
  const deleteStream = useDeleteStream();

  const stream = data?.stream;
  const health = data?.health;
  const alwaysOn = data?.alwaysOn;
  const stats = data?.stats;
  const probe = data?.probe;
  const probeStatus = data?.probeStatus;

  const [probeData, setProbeData] = useState<any>(null);
  const [isEpgModalOpen, setIsEpgModalOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // EPG data for this stream
  const { data: epgData, refetch: refetchEpg } = useStreamEpg(streamId, {
    enabled: !!stream?.epgChannelId,
  });

  const handleProbe = async () => {
    try {
      const result = await probeStream.mutateAsync({ id: streamId, useCache: false });
      setProbeData(result);
      toast({
        title: result.success ? "Probe Complete" : "Probe Failed",
        description: result.success
          ? `Found ${result.streams?.length || 0} streams in ${result.probeTime}ms`
          : result.error,
        variant: result.success ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({
        title: "Probe Failed",
        description: err.message || "Unable to probe stream",
        variant: "destructive",
      });
    }
  };

  const handleHealthCheck = async () => {
    try {
      const result = await healthCheck.mutateAsync({ id: streamId, useFfprobe: true });
      toast({
        title: result.anyOnline ? "Stream Online" : "Stream Offline",
        description: result.anyOnline
          ? `Primary: ${result.primary.online ? "✓" : "✗"}, Backups: ${result.backups.filter(b => b.health.online).length}/${result.backups.length}`
          : "No sources responding",
        variant: result.anyOnline ? "default" : "destructive",
      });
      refetch();
    } catch (err: any) {
      toast({
        title: "Health Check Failed",
        description: err.message || "Unable to check stream health",
        variant: "destructive",
      });
    }
  };

  const handlePlay = () => {
    if (stream && previewUsername && previewPassword) {
      // Get the best edge server for streaming
      // Try serverDistribution first (cascade hierarchy), then serverAssignments (simple assignment)
      const edgeServer = stream.serverDistribution?.find(
        (dist) => dist.server.status === 'ONLINE' && dist.server.domain
      )?.server || stream.serverAssignments?.find(
        (assign) => assign.server.status === 'ONLINE' && assign.server.domain && assign.isActive
      )?.server;

      let hlsUrl: string;
      if (edgeServer?.domain) {
        // Use edge server directly for HLS v7 fMP4 streaming
        hlsUrl = `https://${edgeServer.domain}/live/${previewUsername}/${previewPassword}/${stream.id}.m3u8`;
      } else {
        // Fallback to local proxy (may not work with fMP4 on main panel)
        hlsUrl = `/api-proxy/live/${previewUsername}/${previewPassword}/${stream.id}.m3u8`;
      }
      
      setPlayUrl(hlsUrl);
      setIsPlaying(true);
      setActiveTab("player"); // Switch to player tab
    } else if (stream && (!previewUsername || !previewPassword)) {
      toast({
        title: "Preview Line Not Configured",
        description: "Please configure a preview line in Settings → Streaming",
        variant: "destructive",
      });
    }
  };

  const handleToggleAlwaysOn = async () => {
    if (!stream) return;
    try {
      if (alwaysOn?.status === "running" || alwaysOn) {
        await disableAlwaysOn.mutateAsync(streamId);
        toast({ title: "Always-On Disabled" });
      } else {
        await enableAlwaysOn.mutateAsync(streamId);
        toast({ title: "Always-On Enabled" });
      }
      refetch();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleRestart = async () => {
    try {
      const result = await restartAlwaysOn.mutateAsync(streamId);
      toast({
        title: result.success ? "Stream Restarted" : "Restart Failed",
        description: result.message,
      });
      refetch();
    } catch (err: any) {
      toast({
        title: "Restart Failed",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard` });
  };

  const handleDelete = async () => {
    try {
      await deleteStream.mutateAsync(streamId);
      toast({
        title: "Stream deleted",
        description: `${stream?.name} has been deleted.`,
      });
      router.push("/admin/streams");
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete stream.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48 sm:w-64" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64 sm:h-96" />
      </div>
    );
  }

  if (error || !stream) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Stream Not Found</h2>
        <Button onClick={() => router.back()} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const Icon = streamTypeIcons[stream.streamType as keyof typeof streamTypeIcons] || Tv;
  // Stream is considered offline if health check fails OR if a probe was done and failed
  // Use probeStatus (cached from last probe/health check) or manual probeData
  const lastProbeSuccess = probeData?.success ?? probeStatus?.success;
  const isOnline = (health?.online ?? false) && (lastProbeSuccess !== false);
  // Source is down when we have a recent probe that failed, but stream might still be "running"
  const isSourceDown = lastProbeSuccess === false;
  const isLive = stream.streamType === "LIVE";

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center border rounded-md">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push(`/admin/streams/${streamId - 1}`)}
                disabled={streamId <= 1}
                className="h-8 w-8 rounded-r-none"
                title="Previous stream"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push(`/admin/streams/${streamId + 1}`)}
                className="h-8 w-8 rounded-l-none"
                title="Next stream"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            {stream.logoUrl ? (
              <img
                src={stream.logoUrl}
                alt={stream.name}
                className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg object-contain bg-zinc-800 flex-shrink-0"
              />
            ) : (
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-zinc-800 flex items-center justify-center flex-shrink-0">
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-zinc-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 truncate">
                <span className="truncate">{stream.name}</span>
                {alwaysOn && (
                  <Activity className="h-4 w-4 text-emerald-400 animate-pulse flex-shrink-0" />
                )}
                {isFetching && !isLoading && (
                  <RefreshCw className="h-3 w-3 text-zinc-500 animate-spin flex-shrink-0" />
                )}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm text-zinc-500 mt-1">
                <Badge variant="outline" className="text-xs">{stream.streamType}</Badge>
                <Badge variant="outline" className="text-xs">{stream.category?.name}</Badge>
                <StatusBadge 
                  online={isOnline} 
                  latency={health?.latency}
                  activeViewers={stats?.activeViewers || 0}
                  isPlaying={isPlaying}
                  alwaysOn={stream.alwaysOn}
                  sourceDown={isSourceDown}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Button variant="outline" size="sm" onClick={handleHealthCheck} disabled={healthCheck.isPending} className="flex-1 md:flex-none">
            {healthCheck.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">Health Check</span>
            <span className="sm:hidden">Check</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleProbe} disabled={probeStream.isPending} className="flex-1 md:flex-none">
            {probeStream.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Gauge className="h-4 w-4 mr-2" />
            )}
            <span className="hidden sm:inline">Probe Stream</span>
            <span className="sm:hidden">Probe</span>
          </Button>
          {isLive && (
            <Button
              variant={alwaysOn?.status === "running" ? "default" : "outline"}
              size="sm"
              onClick={handleToggleAlwaysOn}
              className="flex-1 md:flex-none"
            >
              <Activity className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">{alwaysOn?.status === "running" ? "Always-On Active" : "Enable Always-On"}</span>
              <span className="sm:hidden">Always-On</span>
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsEpgModalOpen(true)}
            className="flex-1 md:flex-none"
          >
            <Calendar className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">{stream.epgChannelId ? "Change EPG" : "Link EPG"}</span>
            <span className="sm:hidden">EPG</span>
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => router.push(`/admin/streams/${streamId}/edit`)}
            className="flex-1 md:flex-none"
          >
            <Pencil className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setIsDeleteDialogOpen(true)}
            className="flex-1 md:flex-none text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          <Button onClick={handlePlay} size="sm" className="flex-1 md:flex-none">
            <Play className="h-4 w-4 mr-2" />
            Play
          </Button>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <StatCard
          icon={isOnline ? (isPlaying || (stats?.activeViewers || 0) > 0 ? Activity : CheckCircle2) : AlertCircle}
          label="Status"
          value={
            !isOnline 
              ? "Offline" 
              : (stream.alwaysOn || isPlaying || (stats?.activeViewers || 0) > 0) 
                ? "Active" 
                : "On Demand"
          }
          subValue={health?.latency ? `${health.latency}ms latency` : undefined}
        />
        <StatCard
          icon={Users}
          label="Active Viewers"
          value={stats?.activeViewers || 0}
        />
        <StatCard
          icon={Shield}
          label="Backup Sources"
          value={stream.backupUrls?.length || 0}
          subValue="configured"
        />
        <StatCard
          icon={RotateCcw}
          label="Failovers"
          value={stats?.failoverCount || 0}
          subValue="total"
        />
      </motion.div>

      {/* Main Content Tabs */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-zinc-900 w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="overview" className="flex-shrink-0">Overview</TabsTrigger>
            <TabsTrigger value="player" className="flex-shrink-0">Player</TabsTrigger>
            <TabsTrigger value="technical" className="flex-shrink-0"><span className="hidden sm:inline">Technical Info</span><span className="sm:hidden">Technical</span></TabsTrigger>
            <TabsTrigger value="sources" className="flex-shrink-0"><span className="hidden sm:inline">Sources & Failover</span><span className="sm:hidden">Sources</span></TabsTrigger>
            {isLive && <TabsTrigger value="alwayson" className="flex-shrink-0">Always-On</TabsTrigger>}
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stream Info */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg">Stream Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-500">Stream ID</p>
                      <p className="font-mono text-zinc-200">{stream.id}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Type</p>
                      <p className="text-zinc-200">{stream.streamType}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Category</p>
                      <p className="text-zinc-200">{stream.category?.name}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Status</p>
                      <Badge 
                        className={
                          !isOnline 
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : (isPlaying || (stats?.activeViewers || 0) > 0)
                              ? "bg-green-500/10 text-green-400 border-green-500/30"
                              : "bg-blue-500/10 text-blue-400 border-blue-500/30"
                        }
                      >
                        {!isOnline 
                          ? "Offline" 
                          : (stream.alwaysOn || isPlaying || (stats?.activeViewers || 0) > 0)
                            ? "Active"
                            : "On Demand"
                        }
                      </Badge>
                    </div>
                    <div>
                      <p className="text-zinc-500">Transcode Profile</p>
                      <p className="text-zinc-200">{stream.transcodeProfile || "Passthrough"}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">EPG Channel</p>
                      <div className="flex items-center gap-2">
                        {stream.epgChannelId ? (
                          <>
                            <p className="text-zinc-200">{stream.epgChannelId}</p>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-6 px-2 text-xs"
                              onClick={() => setIsEpgModalOpen(true)}
                            >
                              Change
                            </Button>
                          </>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-6 px-2 text-xs"
                            onClick={() => setIsEpgModalOpen(true)}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Link EPG
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator className="bg-zinc-800" />

                  <div>
                    <p className="text-zinc-500 text-sm mb-2">Source URL</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-2 rounded bg-zinc-800 text-xs text-zinc-300 truncate min-w-0">
                        {stream.sourceUrl}
                      </code>
                      <div className="flex flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(stream.sourceUrl, "Source URL")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => window.open(stream.sourceUrl, "_blank")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Server Assignments */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    Server Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stream.serverAssignments?.length ? (
                    <div className="space-y-2">
                      {stream.serverAssignments.map((sa: any) => (
                        <div
                          key={sa.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-3">
                            <Server className="h-4 w-4 text-zinc-400" />
                            <div>
                              <p className="font-medium text-zinc-200">{sa.server.name}</p>
                              {sa.server.region && (
                                <p className="text-xs text-zinc-500">{sa.server.region}</p>
                              )}
                            </div>
                          </div>
                          <Badge
                            variant={sa.server.status === "ONLINE" ? "default" : "secondary"}
                            className={
                              sa.server.status === "ONLINE"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : ""
                            }
                          >
                            {sa.server.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500 py-8">
                      <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Auto-assigned based on load balancing</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bouquet Assignments */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Bouquet Assignments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stream.bouquets?.length ? (
                    <div className="space-y-2">
                      {stream.bouquets.map((b: any) => (
                        <div
                          key={b.bouquet.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50"
                        >
                          <div className="flex items-center gap-3">
                            <Shield className="h-4 w-4 text-purple-400" />
                            <p className="font-medium text-zinc-200">{b.bouquet.name}</p>
                          </div>
                          <Badge
                            variant="outline"
                            className="text-purple-400 border-purple-400/30"
                          >
                            Package
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-zinc-500 py-8">
                      <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Not assigned to any bouquets</p>
                      <p className="text-xs">Add this stream to a bouquet to make it available to users</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* EPG Programs */}
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    EPG Programs
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stream.epgChannelId ? (
                    epgData?.upcomingPrograms?.length ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {epgData.upcomingPrograms.slice(0, 5).map((program: any, idx: number) => {
                          const startTime = new Date(program.start);
                          const endTime = new Date(program.end);
                          const now = new Date();
                          const isLive = now >= startTime && now <= endTime;
                          const isPast = now > endTime;
                          
                          return (
                            <div
                              key={program.id || idx}
                              className={`flex items-start gap-3 p-3 rounded-lg ${
                                isLive 
                                  ? 'bg-emerald-500/10 border border-emerald-500/30' 
                                  : isPast 
                                    ? 'bg-zinc-800/30 opacity-60' 
                                    : 'bg-zinc-800/50'
                              }`}
                            >
                              <div className="flex-shrink-0 text-center">
                                <p className="text-xs text-zinc-500">
                                  {formatDateFns(startTime, 'HH:mm')}
                                </p>
                                <p className="text-xs text-zinc-500">
                                  {formatDateFns(endTime, 'HH:mm')}
                                </p>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-zinc-200 truncate">{program.title}</p>
                                  {isLive && (
                                    <Badge className="bg-emerald-500/20 text-emerald-300 text-xs flex-shrink-0">
                                      LIVE
                                    </Badge>
                                  )}
                                </div>
                                {program.description && (
                                  <p className="text-xs text-zinc-500 line-clamp-2">{program.description}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {epgData.upcomingPrograms.length > 5 && (
                          <p className="text-xs text-zinc-500 text-center py-2">
                            +{epgData.upcomingPrograms.length - 5} more programs
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-center text-zinc-500 py-8">
                        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No upcoming programs</p>
                        <p className="text-xs">EPG data may not be available for this channel</p>
                      </div>
                    )
                  ) : (
                    <div className="text-center text-zinc-500 py-8">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No EPG linked</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3"
                        onClick={() => setIsEpgModalOpen(true)}
                      >
                        <Link2 className="h-4 w-4 mr-2" />
                        Link EPG Channel
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Recent Failovers */}
            {stats?.lastFailovers && stats.lastFailovers.length > 0 && (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Recent Failovers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {stats.lastFailovers.map((f: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-zinc-800/50 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-zinc-500 flex-shrink-0" />
                          <span className="text-zinc-400">
                            {formatDate(f.timestamp)}
                          </span>
                          <Badge variant="outline">{f.reason}</Badge>
                        </div>
                        <span className="text-zinc-500 truncate flex-1 pl-6 sm:pl-0">
                          {f.fromSource} → {f.toSource}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Player Tab */}
          <TabsContent value="player" className="space-y-4">
            <Card className="bg-zinc-900/50 border-zinc-800 overflow-hidden">
              <CardContent className="p-0">
                {isPlaying && playUrl ? (
                  <StreamPlayer
                    src={playUrl}
                    title={stream.name}
                    autoPlay
                    poster={stream.logoUrl || undefined}
                    className="w-full"
                    onError={(error) => {
                      toast({
                        title: "Playback Error",
                        description: error,
                        variant: "destructive",
                      });
                    }}
                  />
                ) : (
                  <div className="aspect-video bg-zinc-950 flex flex-col items-center justify-center">
                    <Icon className="h-16 w-16 text-zinc-700 mb-4" />
                    <p className="text-zinc-500 mb-4">Click to start playback</p>
                    <div className="flex gap-2">
                      <Button onClick={handlePlay}>
                        <Play className="h-4 w-4 mr-2" />
                        Play via HLS
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={() => window.open(stream.sourceUrl, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Open in VLC
                      </Button>
                    </div>
                    <p className="text-xs text-zinc-600 mt-4 max-w-md text-center">
                      HLS playback uses the backend for live streaming. 
                      VLC can play the direct source URL.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm text-zinc-500">
              <div className="flex items-center gap-2">
                <Monitor className="h-4 w-4" />
                <span className="truncate max-w-md">Source: {stream.sourceUrl}</span>
              </div>
              {isPlaying && (
                <Button variant="ghost" size="sm" onClick={() => setIsPlaying(false)}>
                  Stop Playback
                </Button>
              )}
            </div>

            {/* Copy URLs section */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Stream URLs</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">HLS URL (Browser Compatible)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-zinc-800 text-xs text-zinc-300 truncate min-w-0">
                      {previewUsername && previewPassword 
                        ? `${window.location.origin}/live/${previewUsername}/${previewPassword}/${stream.id}.m3u8`
                        : 'Configure preview line in Settings'}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => previewUsername && previewPassword && copyToClipboard(`${window.location.origin}/live/${previewUsername}/${previewPassword}/${stream.id}.m3u8`, "HLS URL")}
                      disabled={!previewUsername || !previewPassword}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Direct Source URL</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 rounded bg-zinc-800 text-xs text-zinc-300 truncate min-w-0">
                      {stream.sourceUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => copyToClipboard(stream.sourceUrl, "Direct URL")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Technical Info Tab */}
          <TabsContent value="technical" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium">Stream Technical Details</h3>
                <p className="text-sm text-zinc-500">
                  Codec, bitrate, resolution, and format information
                </p>
              </div>
              <Button
                onClick={handleProbe}
                disabled={probeStream.isPending}
                variant="outline"
              >
                {probeStream.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {probeData ? "Re-probe" : "Probe Stream"}
              </Button>
            </div>

            <ProbeInfoCard probe={probeData || probe} />
          </TabsContent>

          {/* Sources Tab */}
          <TabsContent value="sources" className="space-y-4">
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-4 w-4 text-emerald-400" />
                  Primary Source
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg bg-zinc-800/50">
                  <StatusBadge 
                    online={isOnline} 
                    latency={health?.latency}
                    activeViewers={stats?.activeViewers || 0}
                    isPlaying={isPlaying}
                    alwaysOn={stream.alwaysOn}
                    sourceDown={isSourceDown}
                  />
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <code className="flex-1 text-sm text-zinc-300 truncate min-w-0">
                      {stream.sourceUrl}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => copyToClipboard(stream.sourceUrl, "Primary URL")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-400" />
                  Backup Sources ({stream.backupUrls?.length || 0})
                </CardTitle>
                <CardDescription>
                  Failover sources used when primary is unavailable
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stream.backupUrls?.length ? (
                  <div className="space-y-2">
                    {stream.backupUrls.map((url: string, idx: number) => (
                      <div
                        key={idx}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 p-3 rounded-lg bg-zinc-800/50"
                      >
                        <Badge variant="outline" className="font-mono self-start sm:self-center">
                          #{idx + 1}
                        </Badge>
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <code className="flex-1 text-sm text-zinc-300 truncate min-w-0">
                            {url}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="flex-shrink-0"
                            onClick={() => copyToClipboard(url, `Backup #${idx + 1}`)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-zinc-500 py-8">
                    <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No backup sources configured</p>
                    <p className="text-xs">Add backup URLs to enable automatic failover</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Always-On Tab */}
          {isLive && (
            <TabsContent value="alwayson" className="space-y-4">
              <Card className="bg-gradient-to-br from-emerald-950/30 to-zinc-950 border-emerald-900/30">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-4 w-4 text-emerald-400" />
                    Always-On Status
                  </CardTitle>
                  <CardDescription>
                    Keep this stream running 24/7 for instant playback
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {alwaysOn ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-zinc-500 text-sm">Status</p>
                          <Badge
                            className={
                              alwaysOn.status === "running"
                                ? "bg-emerald-500/20 text-emerald-300 mt-1"
                                : alwaysOn.status === "error"
                                ? "bg-red-500/20 text-red-300 mt-1"
                                : "mt-1"
                            }
                          >
                            {alwaysOn.status}
                          </Badge>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-zinc-500 text-sm">Viewers</p>
                          <p className="text-xl font-bold text-zinc-200">{alwaysOn.viewers}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-zinc-500 text-sm">Restarts</p>
                          <p className="text-xl font-bold text-zinc-200">{alwaysOn.restartCount}</p>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-zinc-500 text-sm">Started At</p>
                          <p className="text-sm text-zinc-200">
                            {alwaysOn.startedAt ? formatDateTime(alwaysOn.startedAt) : "N/A"}
                          </p>
                        </div>
                        <div className="p-4 rounded-lg bg-zinc-800/50">
                          <p className="text-zinc-500 text-sm">Running Since</p>
                          <p className="text-lg font-semibold text-emerald-400">
                            {alwaysOn.startedAt && alwaysOn.status === "running" 
                              ? formatRunningSince(alwaysOn.startedAt) 
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {alwaysOn.lastError && (
                        <div className="p-4 rounded-lg bg-red-950/30 border border-red-900/30">
                          <p className="text-red-400 text-sm font-medium">Last Error</p>
                          <p className="text-red-300 text-sm">{alwaysOn.lastError}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={handleRestart}
                          disabled={restartAlwaysOn.isPending}
                        >
                          {restartAlwaysOn.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-2" />
                          )}
                          Restart Stream
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleToggleAlwaysOn}
                          disabled={disableAlwaysOn.isPending}
                        >
                          Disable Always-On
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <Activity className="h-12 w-12 mx-auto mb-4 text-zinc-700" />
                      <p className="text-zinc-400 mb-4">
                        Always-On is not enabled for this stream
                      </p>
                      <Button onClick={handleToggleAlwaysOn} disabled={enableAlwaysOn.isPending}>
                        {enableAlwaysOn.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Zap className="h-4 w-4 mr-2" />
                        )}
                        Enable Always-On
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </motion.div>

      {/* EPG Assignment Modal */}
      <EpgAssignmentModal
        isOpen={isEpgModalOpen}
        onClose={() => setIsEpgModalOpen(false)}
        streamId={streamId}
        streamName={stream.name}
        currentEpgChannelId={stream.epgChannelId}
        onSuccess={() => {
          refetch();
          refetchEpg();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Stream</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{stream.name}&quot;?
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
    </div>
  );
}

