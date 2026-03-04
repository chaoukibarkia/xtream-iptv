"use client";

import { useState, useMemo } from "react";
import {
  Activity,
  RefreshCw,
  Tv,
  Film,
  Clapperboard,
  Radio,
  Monitor,
  Globe,
  Users,
  Clock,
  Smartphone,
  Wifi,
  Server,
  Filter,
  X,
  Zap,
  WifiOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useRealtimeConnections,
  ConnectionData,
  ServerType,
} from "@/lib/api/hooks/useDashboard";
import { formatDistanceToNow } from "date-fns";

// Country code to flag emoji converter
function getCountryFlag(countryCode: string | null): string {
  if (!countryCode || countryCode === 'LOCAL' || countryCode === 'UNKNOWN') {
    return '🏠';
  }
  // Convert country code to flag emoji
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

// Content type badge config
function getContentTypeBadge(contentType: string) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Tv; color: string }> = {
    LIVE: { variant: 'destructive', icon: Tv, color: 'text-red-500' },
    VOD: { variant: 'secondary', icon: Film, color: 'text-amber-500' },
    SERIES: { variant: 'default', icon: Clapperboard, color: 'text-violet-500' },
    RADIO: { variant: 'outline', icon: Radio, color: 'text-pink-500' },
  };
  return variants[contentType] || { variant: 'outline' as const, icon: Monitor, color: 'text-gray-500' };
}

// Server type badge styling
function getServerBadgeStyle(serverType: ServerType | null): string {
  switch (serverType) {
    case 'MAIN':
      return 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400';
    case 'LOAD_BALANCER':
      return 'border-purple-500 bg-purple-500/10 text-purple-600 dark:text-purple-400';
    case 'EDGE_STREAMER':
      return 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400';
    case 'TRANSCODER':
      return 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400';
    default:
      return 'border-gray-500 bg-gray-500/10 text-gray-600 dark:text-gray-400';
  }
}

// Server type short label
function getServerTypeLabel(serverType: ServerType | null): string {
  switch (serverType) {
    case 'MAIN':
      return 'Main';
    case 'LOAD_BALANCER':
      return 'LB';
    case 'EDGE_STREAMER':
      return 'Edge';
    case 'TRANSCODER':
      return 'Trans';
    default:
      return 'Unknown';
  }
}

// Parse user agent to get device info
function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Unknown Device';
  
  // Common IPTV players
  if (ua.includes('TiviMate')) return 'TiviMate';
  if (ua.includes('IPTV Smarters')) return 'IPTV Smarters';
  if (ua.includes('Perfect Player')) return 'Perfect Player';
  if (ua.includes('VLC')) return 'VLC Player';
  if (ua.includes('Kodi')) return 'Kodi';
  if (ua.includes('GSE')) return 'GSE Smart IPTV';
  if (ua.includes('OTT Navigator')) return 'OTT Navigator';
  if (ua.includes('Televizo')) return 'Televizo';
  
  // Browsers
  if (ua.includes('Chrome')) return 'Chrome Browser';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge Browser';
  
  // Devices
  if (ua.includes('iPhone')) return 'iPhone';
  if (ua.includes('iPad')) return 'iPad';
  if (ua.includes('Android')) return 'Android Device';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'Mac';
  if (ua.includes('Linux')) return 'Linux';
  
  return ua.length > 20 ? ua.substring(0, 20) + '...' : ua;
}

// Connection Card Component
function ConnectionCard({ conn }: { conn: ConnectionData }) {
  const typeInfo = getContentTypeBadge(conn.contentType);
  const TypeIcon = typeInfo.icon;
  
  return (
    <Card className="relative overflow-hidden">
      {/* Status indicator bar with server color */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${
        conn.serverType === 'MAIN' ? 'bg-blue-500' :
        conn.serverType === 'LOAD_BALANCER' ? 'bg-purple-500' :
        conn.serverType === 'EDGE_STREAMER' ? 'bg-green-500' :
        conn.serverType === 'TRANSCODER' ? 'bg-orange-500' :
        'bg-gray-400'
      }`} />
      
      <CardContent className="p-4 pt-5">
        {/* Header: User and Status */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
            <span className="font-semibold text-base">{conn.username}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xl" title={conn.countryCode || 'Unknown'}>
              {getCountryFlag(conn.countryCode)}
            </span>
            <Badge variant={typeInfo.variant} className="text-xs">
              <TypeIcon className="h-3 w-3 mr-1" />
              {conn.contentType}
            </Badge>
          </div>
        </div>
        
        {/* Server Badge */}
        <div className="mb-3">
          <Badge 
            variant="outline" 
            className={`text-xs py-0.5 ${getServerBadgeStyle(conn.serverType)}`}
            title={`Server Type: ${conn.serverType || 'Unknown'}`}
          >
            <Server className="h-3 w-3 mr-1" />
            {conn.serverName || 'Unknown Server'}
            <span className="ml-1 opacity-70">({getServerTypeLabel(conn.serverType)})</span>
          </Badge>
        </div>
        
        {/* Content being watched */}
        <div className="mb-3 p-2 bg-muted/50 rounded-md">
          <p className="text-sm font-medium truncate">
            {conn.contentName || `Stream #${conn.streamId}`}
            {conn.contentType === 'SERIES' && conn.seasonNumber && (
              <span className="text-muted-foreground ml-1">
                S{conn.seasonNumber}E{conn.episodeNumber}
              </span>
            )}
          </p>
        </div>
        
        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {/* IP Address */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Wifi className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-mono text-xs truncate">{conn.ipAddress}</span>
          </div>
          
          {/* Protocol */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-3.5 w-3.5 flex-shrink-0" />
            <Badge variant="outline" className="text-xs h-5">
              {conn.isHls ? 'HLS' : 'MPEG-TS'}
            </Badge>
          </div>
          
          {/* Device/User Agent */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Smartphone className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs truncate" title={conn.userAgent || 'Unknown'}>
              {parseUserAgent(conn.userAgent)}
            </span>
          </div>
          
          {/* Duration */}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-xs">
              {formatDistanceToNow(new Date(conn.startedAt), { addSuffix: false })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ConnectionsPage() {
  // Use realtime SSE connections instead of polling
  const {
    connections,
    summary,
    isConnected,
    error: sseError,
    reconnect,
  } = useRealtimeConnections();

  const isLoading = !isConnected && connections.length === 0;

  // Filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [serverFilter, setServerFilter] = useState<string>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");

  // Get unique values for filters
  const filterOptions = useMemo(() => {
    if (!connections || connections.length === 0) return { servers: [], countries: [] };
    
    const servers = new Set<string>();
    const countries = new Set<string>();
    
    connections.forEach(conn => {
      if (conn.serverName) servers.add(conn.serverName);
      if (conn.countryCode) countries.add(conn.countryCode);
    });
    
    return {
      servers: Array.from(servers).sort(),
      countries: Array.from(countries).sort(),
    };
  }, [connections]);

  // Filter connections
  const filteredConnections = useMemo(() => {
    if (!connections || connections.length === 0) return [];
    
    return connections.filter(conn => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          conn.username.toLowerCase().includes(query) ||
          conn.ipAddress.toLowerCase().includes(query) ||
          (conn.contentName?.toLowerCase().includes(query) ?? false) ||
          (conn.serverName?.toLowerCase().includes(query) ?? false);
        if (!matchesSearch) return false;
      }
      
      // Server filter
      if (serverFilter !== "all" && conn.serverName !== serverFilter) {
        return false;
      }
      
      // Content type filter
      if (contentTypeFilter !== "all" && conn.contentType !== contentTypeFilter) {
        return false;
      }
      
      // Country filter
      if (countryFilter !== "all" && conn.countryCode !== countryFilter) {
        return false;
      }
      
      return true;
    });
  }, [connections, searchQuery, serverFilter, contentTypeFilter, countryFilter]);

  // Check if any filters are active
  const hasActiveFilters = searchQuery || serverFilter !== "all" || contentTypeFilter !== "all" || countryFilter !== "all";

  // Clear all filters
  const clearFilters = () => {
    setSearchQuery("");
    setServerFilter("all");
    setContentTypeFilter("all");
    setCountryFilter("all");
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            Active Connections
            {isConnected ? (
              <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500">
                <Zap className="h-3 w-3 mr-1" />
                Live
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500">
                <WifiOff className="h-3 w-3 mr-1" />
                Connecting...
              </Badge>
            )}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {isConnected 
              ? 'Real-time view of all active streaming connections (updates every 2s)'
              : sseError || 'Connecting to real-time updates...'
            }
          </p>
        </div>
        {!isConnected && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => reconnect()}
            className="w-full sm:w-auto"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Reconnect
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4 lg:grid-cols-7">
        {isLoading ? (
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
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Activity className="h-4 w-4 text-green-500" />
                  <span>Total Active</span>
                </div>
                <p className="text-2xl font-bold">{summary?.total || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span>Unique Users</span>
                </div>
                <p className="text-2xl font-bold">{summary?.uniqueUsers || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Tv className="h-4 w-4 text-red-500" />
                  <span>Live TV</span>
                </div>
                <p className="text-2xl font-bold">{summary?.byContentType?.LIVE || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Film className="h-4 w-4 text-amber-500" />
                  <span>Movies</span>
                </div>
                <p className="text-2xl font-bold">{summary?.byContentType?.VOD || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Clapperboard className="h-4 w-4 text-violet-500" />
                  <span>Series</span>
                </div>
                <p className="text-2xl font-bold">{summary?.byContentType?.SERIES || 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Globe className="h-4 w-4 text-cyan-500" />
                  <span>Countries</span>
                </div>
                <p className="text-2xl font-bold">{Object.keys(summary?.byCountry || {}).length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                  <Server className="h-4 w-4 text-purple-500" />
                  <span>Servers</span>
                </div>
                <p className="text-2xl font-bold">{Object.keys(summary?.byServer || {}).length}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Server Distribution */}
      {summary && Object.keys(summary.byServer || {}).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4" />
              By Server
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.byServer)
                .sort((a, b) => b[1] - a[1])
                .map(([server, count]) => (
                  <Badge 
                    key={server} 
                    variant="outline" 
                    className="text-xs py-1 px-2 cursor-pointer hover:bg-muted"
                    onClick={() => setServerFilter(server)}
                  >
                    <Server className="h-3 w-3 mr-1" />
                    <span className="font-medium">{server}</span>
                    <span className="ml-1 text-muted-foreground">({count})</span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connections by Country */}
      {summary && Object.keys(summary.byCountry).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4" />
              By Country
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.byCountry)
                .sort((a, b) => b[1] - a[1])
                .map(([country, count]) => (
                  <Badge 
                    key={country} 
                    variant="secondary" 
                    className="text-xs py-1 px-2 cursor-pointer hover:bg-muted"
                    onClick={() => setCountryFilter(country)}
                  >
                    <span className="mr-1">{getCountryFlag(country)}</span>
                    <span className="font-medium">{country}</span>
                    <span className="ml-1 text-muted-foreground">({count})</span>
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 px-2 ml-2">
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div>
              <Input
                placeholder="Search user, IP, content..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-9"
              />
            </div>
            
            {/* Server Filter */}
            <Select value={serverFilter} onValueChange={setServerFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Servers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Servers</SelectItem>
                {filterOptions.servers.map(server => (
                  <SelectItem key={server} value={server}>
                    <span className="flex items-center gap-2">
                      <Server className="h-3 w-3" />
                      {server}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Content Type Filter */}
            <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="LIVE">
                  <span className="flex items-center gap-2">
                    <Tv className="h-3 w-3 text-red-500" />
                    Live TV
                  </span>
                </SelectItem>
                <SelectItem value="VOD">
                  <span className="flex items-center gap-2">
                    <Film className="h-3 w-3 text-amber-500" />
                    Movies
                  </span>
                </SelectItem>
                <SelectItem value="SERIES">
                  <span className="flex items-center gap-2">
                    <Clapperboard className="h-3 w-3 text-violet-500" />
                    Series
                  </span>
                </SelectItem>
                <SelectItem value="RADIO">
                  <span className="flex items-center gap-2">
                    <Radio className="h-3 w-3 text-pink-500" />
                    Radio
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            
            {/* Country Filter */}
            <Select value={countryFilter} onValueChange={setCountryFilter}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All Countries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Countries</SelectItem>
                {filterOptions.countries.map(country => (
                  <SelectItem key={country} value={country}>
                    <span className="flex items-center gap-2">
                      <span>{getCountryFlag(country)}</span>
                      {country}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Connections Cards */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Active Connections
            {isConnected && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />}
          </h2>
          {filteredConnections.length > 0 && (
            <Badge variant="outline">
              {filteredConnections.length} {hasActiveFilters ? 'filtered' : 'active'}
              {hasActiveFilters && connections.length > 0 && ` of ${connections.length}`}
            </Badge>
          )}
        </div>
        
        {isLoading ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-24 mb-3" />
                  <Skeleton className="h-6 w-32 mb-3" />
                  <Skeleton className="h-10 w-full mb-3" />
                  <div className="grid grid-cols-2 gap-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredConnections.length > 0 ? (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredConnections.map((conn) => (
              <ConnectionCard key={conn.id} conn={conn} />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Activity className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg">
                {hasActiveFilters ? 'No connections match filters' : 'No active connections'}
              </p>
              <p className="text-sm text-center">
                {hasActiveFilters 
                  ? 'Try adjusting your filters to see more connections'
                  : 'Connections will appear here when users start streaming'
                }
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
