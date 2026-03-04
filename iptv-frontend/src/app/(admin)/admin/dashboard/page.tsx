"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Tv,
  Server,
  Activity,
  Film,
  Clapperboard,
  RefreshCw,
  AlertCircle,
  Cpu,
  Gauge,
  Wifi,
  MemoryStick,
  Radio,
  Globe,
  Monitor,
  Ticket,
  Coins,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { StatsCard } from "@/components/admin/stats-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  useDashboardStats,
  useActiveConnections,
  useServersList,
  useSystemMetrics,
  useResellerStats,
  ConnectionData,
} from "@/lib/api/hooks/useDashboard";
import { useAuthStore } from "@/stores/authStore";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

// Country code to flag emoji converter
function getCountryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode === 'LOCAL' || countryCode === 'UNKNOWN') {
    return '🏠';
  }
  // Convert country code to flag emoji (A=🇦, B=🇧, etc)
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Content type badge color
function getContentTypeBadge(contentType: string) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Tv }> = {
    LIVE: { variant: 'destructive', icon: Tv },
    VOD: { variant: 'secondary', icon: Film },
    SERIES: { variant: 'default', icon: Clapperboard },
    RADIO: { variant: 'outline', icon: Radio },
  };
  return variants[contentType] || { variant: 'outline' as const, icon: Monitor };
}

// Reseller Dashboard Component
function ResellerDashboard() {
  const {
    data: stats,
    isLoading,
    error,
    refetch,
  } = useResellerStats();

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
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
          <h1 className="text-2xl sm:text-3xl font-bold">Reseller Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Overview of your reseller account
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetch()}
          disabled={isLoading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Credit Balance Card */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Available Credits</p>
              <p className="text-4xl font-bold">
                {isLoading ? <Skeleton className="h-10 w-24" /> : stats?.credits.balance.toLocaleString() || 0}
              </p>
            </div>
            <Coins className="h-12 w-12 text-primary opacity-80" />
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {isLoading ? (
          <>
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Total Lines"
              value={(stats?.lines.total || 0).toString()}
              description="IPTV subscribers"
              icon={Radio}
              iconColor="text-blue-500"
            />
            <StatsCard
              title="Active Lines"
              value={(stats?.lines.active || 0).toString()}
              description="Currently active"
              icon={Activity}
              iconColor="text-green-500"
            />
            <StatsCard
              title="Expired Lines"
              value={(stats?.lines.expired || 0).toString()}
              description="Need renewal"
              icon={AlertCircle}
              iconColor="text-red-500"
            />
            <StatsCard
              title="Unused Codes"
              value={(stats?.activationCodes.unused || 0).toString()}
              description="Available to use"
              icon={Ticket}
              iconColor="text-amber-500"
            />
            <StatsCard
              title="Used Codes"
              value={(stats?.activationCodes.used || 0).toString()}
              description="Already activated"
              icon={Ticket}
              iconColor="text-gray-500"
            />
            <StatsCard
              title="Sub-Resellers"
              value={(stats?.subResellers.total || 0).toString()}
              description="Your team"
              icon={Users}
              iconColor="text-purple-500"
            />
          </>
        )}
      </div>

      {/* Quick Actions & Recent Transactions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
            <CardDescription>Common tasks you can perform</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/activation-codes">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Ticket className="h-4 w-4" />
                  Generate Activation Codes
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/lines">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Radio className="h-4 w-4" />
                  Manage IPTV Lines
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/users">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Manage Sub-Resellers
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/credits">
              <Button variant="outline" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Coins className="h-4 w-4" />
                  View Transactions
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recent Transactions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Transactions</CardTitle>
            <CardDescription>Your latest credit activity</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[240px]">
              {isLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
                <div className="space-y-2">
                  {stats.recentTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        {tx.amount > 0 ? (
                          <div className="p-2 rounded-full bg-green-500/10">
                            <TrendingUp className="h-4 w-4 text-green-500" />
                          </div>
                        ) : (
                          <div className="p-2 rounded-full bg-red-500/10">
                            <TrendingDown className="h-4 w-4 text-red-500" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium">{tx.type.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                            {tx.description || 'No description'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${tx.amount > 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {tx.amount > 0 ? '+' : ''}{tx.amount}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(tx.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Coins className="h-10 w-10 mb-2 opacity-50" />
                  <p className="text-sm">No recent transactions</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Admin Dashboard Component
function AdminDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
    refetch: refetchStats,
  } = useDashboardStats();

  const {
    data: connections,
    isLoading: connectionsLoading,
  } = useActiveConnections();

  const {
    data: serversData,
    isLoading: serversLoading,
  } = useServersList();

  const {
    data: systemMetrics,
    isLoading: metricsLoading,
  } = useSystemMetrics();

  const servers = serversData?.servers || [];

  // Connection history for charts (keep last 20 data points)
  const [connectionHistory, setConnectionHistory] = useState<{ time: string; live: number; vod: number; total: number }[]>([]);

  useEffect(() => {
    if (stats) {
      const now = new Date();
      const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const liveViewers = stats.connections.live || 0;
      const vodViewers = stats.connections.vod || 0;
      
      setConnectionHistory(prev => {
        const newHistory = [...prev, { time, live: liveViewers, vod: vodViewers, total: liveViewers + vodViewers }];
        // Keep only last 20 points (about 10 minutes of data with 30s refresh)
        return newHistory.slice(-20);
      });
    }
  }, [stats]);

  // Calculate total connections (live + vod viewers)
  const totalViewers = (stats?.connections.live || 0) + (stats?.connections.vod || 0);

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return "text-red-500";
    if (usage >= 70) return "text-yellow-500";
    return "text-green-500";
  };

  if (statsError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive" />
        <h2 className="text-xl font-semibold">Failed to load dashboard</h2>
        <p className="text-muted-foreground">
          {statsError instanceof Error ? statsError.message : 'Unable to connect to the server'}
        </p>
        <Button onClick={() => refetchStats()} variant="outline">
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
          <h1 className="text-2xl sm:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Overview of your IPTV system
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => refetchStats()}
          disabled={statsLoading}
          className="w-full sm:w-auto"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
        {statsLoading || metricsLoading ? (
          <>
            {[...Array(7)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <StatsCard
              title="Active Connections"
              value={totalViewers.toLocaleString() || "0"}
              description={
                stats?.connections.live !== undefined 
                  ? `${stats.connections.live} live, ${stats.connections.vod || 0} VOD`
                  : undefined
              }
              icon={Activity}
              iconColor="text-green-500"
            />
            <StatsCard
              title="Bandwidth"
              value={systemMetrics?.bandwidth.totalFormatted || "0 Mb/s"}
              description={systemMetrics ? `↓${systemMetrics.bandwidth.inFormatted} ↑${systemMetrics.bandwidth.outFormatted}` : undefined}
              icon={Wifi}
              iconColor="text-cyan-500"
            />
            <StatsCard
              title="Live Channels"
              value={(stats?.streams.live || 0).toLocaleString()}
              description="TV channels"
              icon={Tv}
              iconColor="text-red-500"
            />
            <StatsCard
              title="Movies"
              value={(stats?.streams.vod || 0).toLocaleString()}
              description="VOD content"
              icon={Film}
              iconColor="text-amber-500"
            />
            <StatsCard
              title="TV Shows"
              value="-"
              description="Series episodes"
              icon={Clapperboard}
              iconColor="text-violet-500"
            />
            <StatsCard
              title="Radio"
              value={(stats?.streams.radio || 0).toLocaleString()}
              description="Radio stations"
              icon={Radio}
              iconColor="text-pink-500"
            />
            <StatsCard
              title="Online Servers"
              value={servers.filter(s => s.status === 'ONLINE').length.toString()}
              description={`${servers.length} total`}
              icon={Server}
              iconColor="text-orange-500"
            />
          </>
        )}
      </div>

      {/* Active Connections and Content Stats */}
      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Recent Connections */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Active Connections
              {connectionsLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
            </CardTitle>
            {connections && connections.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {connections.length} active
              </Badge>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="h-[320px]">
              {connectionsLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              ) : connections && connections.length > 0 ? (
                <div className="space-y-2">
                  {connections.slice(0, 10).map((conn) => {
                    const typeInfo = getContentTypeBadge(conn.contentType);
                    const TypeIcon = typeInfo.icon;
                    return (
                      <div
                        key={conn.id}
                        className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      >
                        {/* Top row: User, Country, Type */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                            <span className="text-base" title={conn.countryCode || 'Unknown'}>
                              {getCountryFlag(conn.countryCode)}
                            </span>
                            <span className="font-medium truncate text-sm">
                              {conn.username}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {conn.serverName && (
                              <Badge 
                                variant="outline" 
                                className={`text-[10px] h-4 px-1.5 ${
                                  conn.serverType === 'MAIN' ? 'border-blue-500 text-blue-500' :
                                  conn.serverType === 'LOAD_BALANCER' ? 'border-purple-500 text-purple-500' :
                                  conn.serverType === 'EDGE_STREAMER' ? 'border-green-500 text-green-500' :
                                  conn.serverType === 'TRANSCODER' ? 'border-orange-500 text-orange-500' :
                                  'border-gray-500 text-gray-500'
                                }`}
                                title={`Server: ${conn.serverName} (${conn.serverType})`}
                              >
                                <Server className="h-2.5 w-2.5 mr-0.5" />
                                {conn.serverName}
                              </Badge>
                            )}
                            <Badge variant={typeInfo.variant} className="text-xs">
                              <TypeIcon className="h-3 w-3 sm:mr-1" />
                              <span className="hidden sm:inline">{conn.contentType}</span>
                            </Badge>
                          </div>
                        </div>
                        
                        {/* Content name */}
                        <p className="text-xs text-muted-foreground truncate mb-1.5 pl-6">
                          {conn.contentName || `Stream #${conn.streamId}`}
                          {conn.contentType === 'SERIES' && conn.seasonNumber && (
                            <span className="ml-1">S{conn.seasonNumber}E{conn.episodeNumber}</span>
                          )}
                        </p>
                        
                        {/* Bottom row: IP, Protocol, Time */}
                        <div className="flex items-center justify-between text-xs text-muted-foreground/70 pl-6">
                          <span className="font-mono truncate flex-1">
                            {conn.ipAddress}
                          </span>
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              {conn.isHls ? 'HLS' : 'TS'}
                            </Badge>
                            <span>{formatDistanceToNow(new Date(conn.startedAt), { addSuffix: false })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-8">
                  <Activity className="h-10 w-10 mb-2 opacity-50" />
                  <p className="text-sm">No active connections</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Content Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Tv className="h-5 w-5 text-red-500" />
                  <span>Live Channels</span>
                </div>
                <span className="font-bold">
                  {statsLoading ? <Skeleton className="h-5 w-10" /> : stats?.streams.live || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Film className="h-5 w-5 text-amber-500" />
                  <span>VOD Movies</span>
                </div>
                <span className="font-bold">
                  {statsLoading ? <Skeleton className="h-5 w-10" /> : stats?.streams.vod || 0}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Clapperboard className="h-5 w-5 text-violet-500" />
                  <span>Series Episodes</span>
                </div>
                <span className="font-bold">
                  {statsLoading ? <Skeleton className="h-5 w-10" /> : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-500" />
                  <span>Active Users</span>
                </div>
                <span className="font-bold">
                  {statsLoading ? <Skeleton className="h-5 w-10" /> : stats?.users.active || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Streaming Analytics Chart */}
      {connectionHistory.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Viewership Trends
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Last 10 minutes
              </Badge>
            </div>
            <CardDescription>Real-time viewer count over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={connectionHistory}>
                  <defs>
                    <linearGradient id="colorLive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorVod" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10 }} 
                    className="text-muted-foreground"
                  />
                  <YAxis 
                    tick={{ fontSize: 10 }} 
                    className="text-muted-foreground"
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px'
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="live"
                    stroke="#ef4444"
                    fillOpacity={1}
                    fill="url(#colorLive)"
                    name="Live TV"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="vod"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorVod)"
                    name="VOD"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500" />
                <span>Live TV: {stats?.connections.live || 0}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-amber-500" />
                <span>VOD: {stats?.connections.vod || 0}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Server Status - System Metrics */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">System Status</h2>
          {(serversLoading || metricsLoading) && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        
        {/* Main Server Metrics */}
        {metricsLoading ? (
          <Card className="mb-4">
            <CardContent className="p-6">
              <div className="grid gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
                {[...Array(6)].map((_, i) => (
                  <div key={i}>
                    <Skeleton className="h-4 w-20 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : systemMetrics ? (
          <Card className="mb-4">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  {systemMetrics.server?.name || 'Main Server'}
                </CardTitle>
                <Badge variant="outline" className="text-xs">
                  Uptime: {systemMetrics.system.uptimeFormatted}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                {/* CPU Usage */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Cpu className="h-4 w-4" />
                    <span>CPU</span>
                  </div>
                  <div className={`text-2xl font-bold ${getUsageColor(systemMetrics.cpu.usage)}`}>
                    {systemMetrics.cpu.usage}%
                  </div>
                  <Progress 
                    value={systemMetrics.cpu.usage} 
                    className="h-1.5"
                  />
                  <p className="text-xs text-muted-foreground">{systemMetrics.cpu.cores} cores</p>
                </div>

                {/* Memory Usage */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MemoryStick className="h-4 w-4" />
                    <span>RAM</span>
                  </div>
                  <div className={`text-2xl font-bold ${getUsageColor(systemMetrics.memory.usage)}`}>
                    {systemMetrics.memory.usage}%
                  </div>
                  <Progress 
                    value={systemMetrics.memory.usage} 
                    className="h-1.5"
                  />
                  <p className="text-xs text-muted-foreground">
                    {systemMetrics.memory.usedFormatted} / {systemMetrics.memory.totalFormatted}
                  </p>
                </div>

                {/* Load Average */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Gauge className="h-4 w-4" />
                    <span>Load Avg</span>
                  </div>
                  <div className="text-2xl font-bold">
                    {systemMetrics.load.load1m.toFixed(2)}
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>1m: {systemMetrics.load.load1m.toFixed(2)}</span>
                    <span>5m: {systemMetrics.load.load5m.toFixed(2)}</span>
                    <span>15m: {systemMetrics.load.load15m.toFixed(2)}</span>
                  </div>
                </div>

                {/* Active Connections */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>Open Connections</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-500">
                    {totalViewers}
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>{stats?.connections.live || 0} live</span>
                    <span>{stats?.connections.vod || 0} VOD</span>
                  </div>
                </div>

                {/* Bandwidth */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Wifi className="h-4 w-4" />
                    <span>Bandwidth</span>
                  </div>
                  <div className="text-2xl font-bold text-purple-500">
                    {systemMetrics.bandwidth.totalFormatted}
                  </div>
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    <span>↓ {systemMetrics.bandwidth.inFormatted}</span>
                    <span>↑ {systemMetrics.bandwidth.outFormatted}</span>
                  </div>
                </div>

                {/* System Info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Server className="h-4 w-4" />
                    <span>System</span>
                  </div>
                  <div className="text-lg font-medium truncate">
                    {systemMetrics.system.hostname}
                  </div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {systemMetrics.system.platform}
                  </p>
                  <Badge variant="success" className="text-xs">
                    {systemMetrics.server?.status || 'ONLINE'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// Main Dashboard Page - Routes to appropriate dashboard based on user role
export default function DashboardPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === "admin";

  if (isAdmin) {
    return <AdminDashboard />;
  }

  return <ResellerDashboard />;
}
