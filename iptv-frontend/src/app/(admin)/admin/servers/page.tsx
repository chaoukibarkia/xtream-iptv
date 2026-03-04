"use client";

import { useState } from "react";
import {
  Plus,
  RefreshCw,
  Server as ServerIcon,
  Settings,
  Wrench,
  AlertCircle,
  Loader2,
  Pencil,
  Trash2,
  MoreHorizontal,
  Rocket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

import {
  useServers,
  useCreateServer,
  useUpdateServer,
  useDeleteServer,
  useUpdateServerStatus,
  useRebalanceServers,
} from "@/lib/api/hooks/useServers";
import { useSystemMetrics, useBandwidthStatus } from "@/lib/api/hooks/useDashboard";
import { EdgeServerDeployWizard } from "@/components/admin/edge-server-deploy-wizard";

interface ServerData {
  id: number;
  name: string;
  type: "MAIN" | "LOAD_BALANCER" | "EDGE_STREAMER" | "TRANSCODER";
  status: "ONLINE" | "OFFLINE" | "MAINTENANCE" | "OVERLOADED" | "DEGRADED";
  domain?: string;
  internalIp: string;
  externalIp: string;
  httpPort: number;
  httpsPort: number;
  rtmpPort?: number;
  apiPort: number;
  maxConnections: number;
  currentConnections?: number;
  currentBandwidth?: number;
  maxBandwidthMbps?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  healthScore?: number;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  // Capabilities
  canTranscode?: boolean;
  supportsHls?: boolean;
  supportsMpegts?: boolean;
  supportsRtmp?: boolean;
  // Hardware acceleration
  hasNvenc?: boolean;
  nvencGpuModel?: string;
  nvencMaxSessions?: number;
  hasQsv?: boolean;
  qsvModel?: string;
  hasVaapi?: boolean;
  vaapiDevice?: string;
  // Transcoding
  maxTranscodes?: number;
  lastHeartbeat?: string;
  _count?: {
    connections: number;
    streams: number;
  };
}

const statusColors = {
  ONLINE: "bg-green-500",
  OFFLINE: "bg-red-500",
  DEGRADED: "bg-yellow-500",
  MAINTENANCE: "bg-blue-500",
  OVERLOADED: "bg-orange-500",
};

const statusBadgeVariants = {
  ONLINE: "success",
  OFFLINE: "destructive",
  DEGRADED: "warning",
  MAINTENANCE: "secondary",
  OVERLOADED: "warning",
} as const;

function ServerCard({ 
  server, 
  onEdit,
  onDelete,
  onToggleMaintenance,
}: { 
  server: ServerData;
  onEdit: () => void;
  onDelete: () => void;
  onToggleMaintenance: () => void;
}) {
  const connections = server._count?.connections || server.currentConnections || 0;
  const connectionPercent = (connections / server.maxConnections) * 100;
  const healthScore = server.healthScore || 100;
  const cpuUsage = server.cpuUsage || 0;
  const memoryUsage = server.memoryUsage || 0;
  const bandwidthPercent = server.maxBandwidthMbps 
    ? ((server.currentBandwidth || 0) / server.maxBandwidthMbps) * 100 
    : 0;

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return 'text-red-500';
    if (usage >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getProgressClass = (usage: number) => {
    if (usage >= 90) return '[&>div]:bg-red-500';
    if (usage >= 70) return '[&>div]:bg-yellow-500';
    return '';
  };

  return (
    <Card className={`relative overflow-hidden transition-all hover:shadow-md ${
      server.status === "OFFLINE" ? "opacity-60" : ""
    }`}>
      {/* Status indicator */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${statusColors[server.status]}`} />
      
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${statusColors[server.status]}`} />
            <CardTitle className="text-base">{server.name}</CardTitle>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleMaintenance}>
                <Wrench className="mr-2 h-4 w-4" />
                {server.status === "MAINTENANCE" ? "End Maintenance" : "Maintenance Mode"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{server.region || server.domain || server.country || 'Local'}</span>
          <span>•</span>
          <Badge variant={statusBadgeVariants[server.status] || "secondary"}>
            {server.status}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-3">
        {/* CPU Usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">CPU</span>
            <span className={`font-medium ${getUsageColor(cpuUsage)}`}>{cpuUsage}%</span>
          </div>
          <Progress value={cpuUsage} className={`h-1.5 ${getProgressClass(cpuUsage)}`} />
        </div>

        {/* Memory Usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">RAM</span>
            <span className={`font-medium ${getUsageColor(memoryUsage)}`}>{memoryUsage}%</span>
          </div>
          <Progress value={memoryUsage} className={`h-1.5 ${getProgressClass(memoryUsage)}`} />
        </div>

        {/* Connection Usage */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Connections</span>
            <span className="font-medium">{connections} / {server.maxConnections}</span>
          </div>
          <Progress value={connectionPercent} className="h-1.5" />
        </div>

        {/* Bandwidth */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Bandwidth</span>
            <span className="font-medium">
              {server.currentBandwidth || 0} / {server.maxBandwidthMbps || 0} Mb/s
            </span>
          </div>
          <Progress value={bandwidthPercent} className={`h-1.5 ${getProgressClass(bandwidthPercent)}`} />
        </div>

        {/* Server Info */}
        <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t">
          <div>
            <span className="text-muted-foreground text-xs">Internal IP</span>
            <p className="font-mono text-xs">{server.internalIp}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">External IP</span>
            <p className="font-mono text-xs">{server.externalIp}</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <Badge variant="outline">{server.type}</Badge>
          <span className="text-xs text-muted-foreground">
            Port: {server.httpPort}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ServersPage() {
  const { toast } = useToast();
  
  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeployWizardOpen, setIsDeployWizardOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerData | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    type: "EDGE_STREAMER" as ServerData["type"],
    domain: "",
    internalIp: "",
    externalIp: "",
    httpPort: 80,
    httpsPort: 443,
    rtmpPort: 1935,
    apiPort: 8080,
    maxConnections: 5000,
    maxBandwidthMbps: 10000,
    maxTranscodes: 10,
    region: "",
    country: "",
    latitude: 0,
    longitude: 0,
    // Capabilities
    canTranscode: true,
    supportsHls: true,
    supportsMpegts: true,
    supportsRtmp: false,
    // Hardware acceleration
    hasNvenc: false,
    nvencGpuModel: "",
    nvencMaxSessions: 0,
    hasQsv: false,
    qsvModel: "",
    hasVaapi: false,
    vaapiDevice: "",
  });

  // API hooks - with auto-refresh for real-time connection updates
  const { data, isLoading, error, refetch, isFetching } = useServers(undefined, {
    refetchInterval: 5000, // Refresh every 5 seconds for real-time connection counts
    refetchIntervalInBackground: false,
  });
  const { data: systemMetrics, isLoading: metricsLoading } = useSystemMetrics();
  const { data: bandwidthStatus, isLoading: bandwidthLoading } = useBandwidthStatus();
  const createServer = useCreateServer();
  const updateServer = useUpdateServer();
  const deleteServer = useDeleteServer();
  const updateServerStatus = useUpdateServerStatus();
  const rebalanceServers = useRebalanceServers();

  const servers = ((data as unknown as { servers?: ServerData[] })?.servers || 
    (data as unknown as { data?: ServerData[] })?.data ||
    (Array.isArray(data) ? data : [])) as ServerData[];

  const onlineServers = servers.filter((s) => s.status === "ONLINE").length;
  const totalConnections = servers.reduce(
    (sum, s) => sum + (s._count?.connections || s.currentConnections || 0),
    0
  );

  const handleEdit = (server: ServerData) => {
    setSelectedServer(server);
    setFormData({
      name: server.name,
      type: server.type,
      domain: server.domain || "",
      internalIp: server.internalIp,
      externalIp: server.externalIp,
      httpPort: server.httpPort,
      httpsPort: server.httpsPort || 443,
      rtmpPort: server.rtmpPort || 1935,
      apiPort: server.apiPort || 8080,
      maxConnections: server.maxConnections,
      maxBandwidthMbps: server.maxBandwidthMbps || 10000,
      maxTranscodes: server.maxTranscodes || 10,
      region: server.region || "",
      country: server.country || "",
      latitude: server.latitude || 0,
      longitude: server.longitude || 0,
      canTranscode: server.canTranscode ?? true,
      supportsHls: server.supportsHls ?? true,
      supportsMpegts: server.supportsMpegts ?? true,
      supportsRtmp: server.supportsRtmp ?? false,
      hasNvenc: server.hasNvenc ?? false,
      nvencGpuModel: server.nvencGpuModel || "",
      nvencMaxSessions: server.nvencMaxSessions || 0,
      hasQsv: server.hasQsv ?? false,
      qsvModel: server.qsvModel || "",
      hasVaapi: server.hasVaapi ?? false,
      vaapiDevice: server.vaapiDevice || "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleToggleMaintenance = async (server: ServerData) => {
    try {
      const newStatus = server.status === "MAINTENANCE" ? "ONLINE" : "MAINTENANCE";
      await updateServerStatus.mutateAsync({ id: server.id, status: newStatus });
      toast({
        title: "Server status updated",
        description: `${server.name} is now ${newStatus.toLowerCase()}.`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to update server status.",
        variant: "destructive",
      });
    }
  };

  const handleRebalance = async () => {
    try {
      await rebalanceServers.mutateAsync();
      toast({
        title: "Rebalancing complete",
        description: "Server connections have been rebalanced.",
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to rebalance servers.",
        variant: "destructive",
      });
    }
  };

  const handleCreateOrUpdate = async () => {
    console.log('[Server Update] handleCreateOrUpdate called');
    console.log('[Server Update] formData:', formData);
    console.log('[Server Update] selectedServer:', selectedServer);
    
    if (!formData.name.trim() || !formData.internalIp.trim() || !formData.externalIp.trim()) {
      toast({
        title: "Error",
        description: "Name, Internal IP, and External IP are required",
        variant: "destructive",
      });
      return;
    }

    // Build the complete server data object
    const serverData = {
      name: formData.name,
      type: formData.type,
      domain: formData.domain || undefined,
      internalIp: formData.internalIp,
      externalIp: formData.externalIp,
      httpPort: formData.httpPort,
      httpsPort: formData.httpsPort,
      rtmpPort: formData.rtmpPort,
      apiPort: formData.apiPort,
      maxConnections: formData.maxConnections,
      maxBandwidthMbps: formData.maxBandwidthMbps,
      maxTranscodes: formData.maxTranscodes,
      region: formData.region || undefined,
      country: formData.country || undefined,
      latitude: formData.latitude || undefined,
      longitude: formData.longitude || undefined,
      // Capabilities
      canTranscode: formData.canTranscode,
      supportsHls: formData.supportsHls,
      supportsMpegts: formData.supportsMpegts,
      supportsRtmp: formData.supportsRtmp,
      // Hardware acceleration
      hasNvenc: formData.hasNvenc,
      nvencGpuModel: formData.nvencGpuModel || undefined,
      nvencMaxSessions: formData.nvencMaxSessions,
      hasQsv: formData.hasQsv,
      qsvModel: formData.qsvModel || undefined,
      hasVaapi: formData.hasVaapi,
      vaapiDevice: formData.vaapiDevice || undefined,
    };

    console.log('[Server Update] Payload to send:', serverData);

    try {
      if (selectedServer) {
        console.log('[Server Update] Calling updateServer.mutateAsync with id:', selectedServer.id);
        const result = await updateServer.mutateAsync({
          id: selectedServer.id,
          data: serverData,
        });
        console.log('[Server Update] Update successful, result:', result);
        toast({
          title: "Server updated",
          description: `${formData.name} has been updated successfully.`,
        });
      } else {
        console.log('[Server Update] Calling createServer.mutateAsync');
        await createServer.mutateAsync(serverData);
        console.log('[Server Update] Create successful');
        toast({
          title: "Server created",
          description: `${formData.name} has been created.`,
        });
      }
      setIsCreateDialogOpen(false);
      setSelectedServer(null);
      // Refresh the server list
      refetch();
      setFormData({
        name: "",
        type: "EDGE_STREAMER",
        domain: "",
        internalIp: "",
        externalIp: "",
        httpPort: 80,
        httpsPort: 443,
        rtmpPort: 1935,
        apiPort: 8080,
        maxConnections: 5000,
        maxBandwidthMbps: 10000,
        maxTranscodes: 10,
        region: "",
        country: "",
        latitude: 0,
        longitude: 0,
        canTranscode: true,
        supportsHls: true,
        supportsMpegts: true,
        supportsRtmp: false,
        hasNvenc: false,
        nvencGpuModel: "",
        nvencMaxSessions: 0,
        hasQsv: false,
        qsvModel: "",
        hasVaapi: false,
        vaapiDevice: "",
      });
    } catch (error: unknown) {
      console.error('[Server Update] Error occurred:', error);
      // Extract error message from various error formats
      let errorMessage = "Failed to save server.";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      // Check for axios error response
      const axiosError = error as { response?: { data?: { error?: string; details?: string | { message?: string }[] } } };
      if (axiosError?.response?.data?.error) {
        errorMessage = axiosError.response.data.error;
        if (axiosError.response.data.details) {
          if (typeof axiosError.response.data.details === 'string') {
            errorMessage += `: ${axiosError.response.data.details}`;
          } else if (Array.isArray(axiosError.response.data.details)) {
            const detailMessages = axiosError.response.data.details.map((d: { message?: string }) => d.message).join(', ');
            errorMessage += `: ${detailMessages}`;
          }
        }
      }
      console.error('[Server Update] Error message to display:', errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedServer) return;
    try {
      await deleteServer.mutateAsync(selectedServer.id);
      toast({
        title: "Server deleted",
        description: `${selectedServer.name} has been deleted.`,
      });
      setIsDeleteDialogOpen(false);
      setSelectedServer(null);
    } catch {
      toast({
        title: "Error",
        description: "Failed to delete server.",
        variant: "destructive",
      });
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load servers</h2>
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
            Servers
            {isFetching && !isLoading && (
              <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" />
            )}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your edge servers and load balancing
            <span className="text-xs ml-2 text-zinc-500">• Auto-refreshing</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isLoading || isFetching ? 'animate-spin' : ''}`} />
          </Button>
          <Button 
            variant="outline" 
            onClick={handleRebalance}
            disabled={rebalanceServers.isPending}
            className="flex-1 sm:flex-none"
          >
            {rebalanceServers.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            <span className="hidden xs:inline">Rebalance</span> All
          </Button>
          <Button 
            variant="default"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 flex-1 sm:flex-none"
            onClick={() => setIsDeployWizardOpen(true)}
          >
            <Rocket className="mr-2 h-4 w-4" />
            <span className="hidden xs:inline">Deploy Edge</span>
            <span className="xs:hidden">Deploy</span>
          </Button>
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => {
            setSelectedServer(null);
            setFormData({
              name: "",
              type: "EDGE_STREAMER" as ServerData["type"],
              domain: "",
              internalIp: "",
              externalIp: "",
              httpPort: 8080,
              httpsPort: 443,
              rtmpPort: 1935,
              apiPort: 8080,
              maxConnections: 2000,
              maxBandwidthMbps: 10000,
              maxTranscodes: 10,
              region: "",
              country: "",
              latitude: 0,
              longitude: 0,
              canTranscode: false,
              supportsHls: true,
              supportsMpegts: true,
              supportsRtmp: false,
              hasNvenc: false,
              nvencGpuModel: "",
              nvencMaxSessions: 0,
              hasQsv: false,
              qsvModel: "",
              hasVaapi: false,
              vaapiDevice: "",
            });
            setIsCreateDialogOpen(true);
          }}>
            <Plus className="mr-2 h-4 w-4" />
            Manual
          </Button>
        </div>
      </div>

      {/* Stats - Aggregated from all servers */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-500/10 p-2 text-green-500">
                <ServerIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Online Servers</p>
                <p className="text-2xl font-bold">
                  {onlineServers}/{servers.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Open Connections
                </p>
                <p className="text-2xl font-bold">
                  {servers.reduce((sum, s) => sum + (s.currentConnections || 0), 0).toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-500">
                <RefreshCw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Bandwidth</p>
                <p className="text-2xl font-bold">
                  {bandwidthStatus?.system.totalCurrentBandwidth || servers.reduce((sum, s) => sum + (s.currentBandwidth || 0), 0)} Mb/s
                </p>
                <p className="text-xs text-muted-foreground">
                  {bandwidthStatus?.system.overallUsagePercent || 0}% of {bandwidthStatus?.system.totalMaxBandwidth || servers.reduce((sum, s) => sum + (s.maxBandwidthMbps || 0), 0).toLocaleString()} Mb/s
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-yellow-500/10 p-2 text-yellow-500">
                <Wrench className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Maintenance</p>
                <p className="text-2xl font-bold">
                  {servers.filter((s) => s.status === "MAINTENANCE").length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm text-muted-foreground">Status:</span>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-sm">Online</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-yellow-500" />
          <span className="text-sm">Degraded</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-sm">Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="text-sm">Maintenance</span>
        </div>
      </div>

      {/* Server Grid */}
      {isLoading ? (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : servers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <ServerIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Servers Found</h3>
            <p className="text-sm text-muted-foreground text-center mb-4 max-w-md">
              Deploy your first edge server automatically or add one manually.
            </p>
            <div className="flex gap-3">
              <Button 
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                onClick={() => setIsDeployWizardOpen(true)}
              >
                <Rocket className="mr-2 h-4 w-4" />
                Deploy Edge Server
              </Button>
              <Button variant="outline" onClick={() => {
                setSelectedServer(null);
                setFormData({
                  name: "",
                  type: "EDGE_STREAMER",
                  domain: "",
                  internalIp: "",
                  externalIp: "",
                  httpPort: 80,
                  httpsPort: 443,
                  rtmpPort: 1935,
                  apiPort: 8080,
                  maxConnections: 5000,
                  maxBandwidthMbps: 10000,
                  maxTranscodes: 10,
                  region: "",
                  country: "",
                  latitude: 0,
                  longitude: 0,
                  canTranscode: true,
                  supportsHls: true,
                  supportsMpegts: true,
                  supportsRtmp: false,
                  hasNvenc: false,
                  nvencGpuModel: "",
                  nvencMaxSessions: 0,
                  hasQsv: false,
                  qsvModel: "",
                  hasVaapi: false,
                  vaapiDevice: "",
                });
                setIsCreateDialogOpen(true);
              }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Manual
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onEdit={() => handleEdit(server)}
              onDelete={() => {
                setSelectedServer(server);
                setIsDeleteDialogOpen(true);
              }}
              onToggleMaintenance={() => handleToggleMaintenance(server)}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedServer ? "Edit Server" : "Add Server"}</DialogTitle>
            <DialogDescription>
              {selectedServer 
                ? "Update server configuration below." 
                : "Fill in the details to add a new server."}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="network">Network</TabsTrigger>
              <TabsTrigger value="capacity">Capacity</TabsTrigger>
              <TabsTrigger value="hardware">Hardware</TabsTrigger>
            </TabsList>
            
            {/* General Tab */}
            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Server Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., EU-EDGE-01"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Server Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) => setFormData({ ...formData, type: v as ServerData["type"] })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MAIN">Main</SelectItem>
                    <SelectItem value="LOAD_BALANCER">Load Balancer</SelectItem>
                    <SelectItem value="EDGE_STREAMER">Edge Streamer</SelectItem>
                    <SelectItem value="TRANSCODER">Transcoder</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="region">Region</Label>
                  <Input
                    id="region"
                    value={formData.region || ""}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    placeholder="e.g., Frankfurt"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country || ""}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="e.g., DE"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="0.0001"
                    value={formData.latitude ?? 0}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 50.1109"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="0.0001"
                    value={formData.longitude ?? 0}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) || 0 })}
                    placeholder="e.g., 8.6821"
                  />
                </div>
              </div>
            </TabsContent>
            
            {/* Network Tab */}
            <TabsContent value="network" className="space-y-4 mt-4">
              <div className="grid gap-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  value={formData.domain || ""}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  placeholder="e.g., stream1.example.com"
                />
                <span className="text-xs text-muted-foreground">The domain name for this server (optional)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="internalIp">Internal IP</Label>
                  <Input
                    id="internalIp"
                    value={formData.internalIp}
                    onChange={(e) => setFormData({ ...formData, internalIp: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="externalIp">External IP</Label>
                  <Input
                    id="externalIp"
                    value={formData.externalIp}
                    onChange={(e) => setFormData({ ...formData, externalIp: e.target.value })}
                    placeholder="203.0.113.50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="httpPort">HTTP Port</Label>
                  <Input
                    id="httpPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={formData.httpPort}
                    onChange={(e) => setFormData({ ...formData, httpPort: parseInt(e.target.value) || 80 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="httpsPort">HTTPS Port</Label>
                  <Input
                    id="httpsPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={formData.httpsPort}
                    onChange={(e) => setFormData({ ...formData, httpsPort: parseInt(e.target.value) || 443 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="rtmpPort">RTMP Port</Label>
                  <Input
                    id="rtmpPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={formData.rtmpPort}
                    onChange={(e) => setFormData({ ...formData, rtmpPort: parseInt(e.target.value) || 1935 })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="apiPort">API Port</Label>
                  <Input
                    id="apiPort"
                    type="number"
                    min={1}
                    max={65535}
                    value={formData.apiPort}
                    onChange={(e) => setFormData({ ...formData, apiPort: parseInt(e.target.value) || 8080 })}
                  />
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <Label className="text-sm font-medium">Protocol Support</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="supportsHls" className="cursor-pointer">HLS Support</Label>
                    <Switch
                      id="supportsHls"
                      checked={formData.supportsHls}
                      onCheckedChange={(checked) => setFormData({ ...formData, supportsHls: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="supportsMpegts" className="cursor-pointer">MPEG-TS Support</Label>
                    <Switch
                      id="supportsMpegts"
                      checked={formData.supportsMpegts}
                      onCheckedChange={(checked) => setFormData({ ...formData, supportsMpegts: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <Label htmlFor="supportsRtmp" className="cursor-pointer">RTMP Support</Label>
                    <Switch
                      id="supportsRtmp"
                      checked={formData.supportsRtmp}
                      onCheckedChange={(checked) => setFormData({ ...formData, supportsRtmp: checked })}
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
            
            {/* Capacity Tab */}
            <TabsContent value="capacity" className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="maxConnections">Max Connections</Label>
                  <Input
                    id="maxConnections"
                    type="number"
                    min={1}
                    value={formData.maxConnections}
                    onChange={(e) => setFormData({ ...formData, maxConnections: parseInt(e.target.value) || 5000 })}
                  />
                  <span className="text-xs text-muted-foreground">Maximum concurrent connections</span>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="maxBandwidthMbps">Max Bandwidth (Mb/s)</Label>
                  <Input
                    id="maxBandwidthMbps"
                    type="number"
                    min={1}
                    value={formData.maxBandwidthMbps}
                    onChange={(e) => setFormData({ ...formData, maxBandwidthMbps: parseInt(e.target.value) || 10000 })}
                  />
                  <span className="text-xs text-muted-foreground">Network capacity in megabits/second</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="maxTranscodes">Max Transcodes</Label>
                  <Input
                    id="maxTranscodes"
                    type="number"
                    min={0}
                    value={formData.maxTranscodes}
                    onChange={(e) => setFormData({ ...formData, maxTranscodes: parseInt(e.target.value) || 10 })}
                  />
                  <span className="text-xs text-muted-foreground">Maximum concurrent transcode jobs</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3 h-fit mt-6">
                  <Label htmlFor="canTranscode" className="cursor-pointer">Can Transcode</Label>
                  <Switch
                    id="canTranscode"
                    checked={formData.canTranscode}
                    onCheckedChange={(checked) => setFormData({ ...formData, canTranscode: checked })}
                  />
                </div>
              </div>
            </TabsContent>
            
            {/* Hardware Tab */}
            <TabsContent value="hardware" className="space-y-4 mt-4">
              {/* NVIDIA NVENC */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">NVIDIA NVENC</Label>
                    <p className="text-xs text-muted-foreground">Hardware encoding using NVIDIA GPU</p>
                  </div>
                  <Switch
                    id="hasNvenc"
                    checked={formData.hasNvenc}
                    onCheckedChange={(checked) => setFormData({ ...formData, hasNvenc: checked })}
                  />
                </div>
                {formData.hasNvenc && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="grid gap-2">
                      <Label htmlFor="nvencGpuModel">GPU Model</Label>
                      <Input
                        id="nvencGpuModel"
                        value={formData.nvencGpuModel || ""}
                        onChange={(e) => setFormData({ ...formData, nvencGpuModel: e.target.value })}
                        placeholder="e.g., NVIDIA GeForce RTX 3080"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="nvencMaxSessions">Max Sessions</Label>
                      <Input
                        id="nvencMaxSessions"
                        type="number"
                        min={0}
                        value={formData.nvencMaxSessions ?? 0}
                        onChange={(e) => setFormData({ ...formData, nvencMaxSessions: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Intel Quick Sync */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Intel Quick Sync Video</Label>
                    <p className="text-xs text-muted-foreground">Hardware encoding using Intel iGPU</p>
                  </div>
                  <Switch
                    id="hasQsv"
                    checked={formData.hasQsv}
                    onCheckedChange={(checked) => setFormData({ ...formData, hasQsv: checked })}
                  />
                </div>
                {formData.hasQsv && (
                  <div className="grid gap-2 pt-2">
                    <Label htmlFor="qsvModel">Intel GPU Model</Label>
                    <Input
                      id="qsvModel"
                      value={formData.qsvModel || ""}
                      onChange={(e) => setFormData({ ...formData, qsvModel: e.target.value })}
                      placeholder="e.g., Intel UHD Graphics 630"
                    />
                  </div>
                )}
              </div>
              
              {/* VAAPI */}
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">VAAPI</Label>
                    <p className="text-xs text-muted-foreground">Linux Video Acceleration API</p>
                  </div>
                  <Switch
                    id="hasVaapi"
                    checked={formData.hasVaapi}
                    onCheckedChange={(checked) => setFormData({ ...formData, hasVaapi: checked })}
                  />
                </div>
                {formData.hasVaapi && (
                  <div className="grid gap-2 pt-2">
                    <Label htmlFor="vaapiDevice">VAAPI Device Path</Label>
                    <Input
                      id="vaapiDevice"
                      value={formData.vaapiDevice || ""}
                      onChange={(e) => setFormData({ ...formData, vaapiDevice: e.target.value })}
                      placeholder="e.g., /dev/dri/renderD128"
                    />
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="button"
              onClick={handleCreateOrUpdate}
              disabled={createServer.isPending || updateServer.isPending}
            >
              {(createServer.isPending || updateServer.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {selectedServer ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Server</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{selectedServer?.name}&quot;? 
              All active connections will be terminated. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDelete}
              disabled={deleteServer.isPending}
            >
              {deleteServer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edge Server Deploy Wizard */}
      <EdgeServerDeployWizard
        open={isDeployWizardOpen}
        onOpenChange={setIsDeployWizardOpen}
        onDeploymentComplete={(serverId, apiKey) => {
          toast({
            title: "Edge Server Deployed",
            description: `Server ID ${serverId} has been deployed successfully. API key has been saved.`,
          });
          refetch();
        }}
      />
    </div>
  );
}
