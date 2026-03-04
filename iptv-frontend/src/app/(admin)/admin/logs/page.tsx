"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  Search,
  RefreshCw,
  AlertCircle,
  Info,
  AlertTriangle,
  XCircle,
  Bug,
  Flame,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useLogs, useLogFilters, useLogStats, useCleanupLogs, LogLevel, SystemLog } from "@/lib/api/hooks";
import { formatDistanceToNow } from "date-fns";

const levelIcons: Record<LogLevel, React.ReactNode> = {
  DEBUG: <Bug className="h-4 w-4 text-muted-foreground" />,
  INFO: <Info className="h-4 w-4 text-blue-500" />,
  WARNING: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  ERROR: <XCircle className="h-4 w-4 text-red-500" />,
  CRITICAL: <Flame className="h-4 w-4 text-red-700" />,
};

const levelColors: Record<LogLevel, "secondary" | "default" | "outline" | "destructive"> = {
  DEBUG: "secondary",
  INFO: "default",
  WARNING: "outline",
  ERROR: "destructive",
  CRITICAL: "destructive",
};

const ITEMS_PER_PAGE = 50;

export default function LogsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<SystemLog | null>(null);

  // Fetch logs with current filters
  const { data: logsData, isLoading, isFetching, refetch } = useLogs(
    {
      level: levelFilter !== "all" ? (levelFilter as LogLevel) : undefined,
      source: sourceFilter !== "all" ? (sourceFilter as "STREAM" | "AUTH" | "USER" | "SERVER" | "EPG" | "TRANSCODE" | "SYSTEM" | "API") : undefined,
      search: searchTerm || undefined,
      limit: ITEMS_PER_PAGE,
      offset: currentPage * ITEMS_PER_PAGE,
    },
    { refetchInterval: 10000 } // Auto-refresh every 10 seconds
  );

  const { data: filters } = useLogFilters();
  const { data: stats } = useLogStats();
  const cleanupMutation = useCleanupLogs();

  const logs = logsData?.logs || [];
  const totalLogs = logsData?.total || 0;
  const totalPages = Math.ceil(totalLogs / ITEMS_PER_PAGE);

  const handleRefresh = () => {
    refetch();
  };

  const handleCleanup = async () => {
    if (confirm("Are you sure you want to delete logs older than 7 days?")) {
      await cleanupMutation.mutateAsync(7);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">System Logs</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            View and search system activity logs
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCleanup} disabled={cleanupMutation.isPending} className="flex-1 sm:flex-none">
            <Trash2 className="mr-2 h-4 w-4" />
            Cleanup
          </Button>
          <Button onClick={handleRefresh} disabled={isFetching} className="flex-1 sm:flex-none">
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-3 sm:gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Logs
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="text-2xl font-bold">{stats.total.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Last 24 Hours
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="text-2xl font-bold">{stats.lastDay.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Errors (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="text-2xl font-bold text-red-500">{stats.errors24h}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Warnings (24h)
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="text-2xl font-bold text-yellow-500">{stats.warnings24h}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Log Entries
            {isFetching && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(0);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={levelFilter}
              onValueChange={(value) => {
                setLevelFilter(value);
                setCurrentPage(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Log Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {(filters?.levels || ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]).map(
                  (level) => (
                    <SelectItem key={level} value={level}>
                      {level}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Select
              value={sourceFilter}
              onValueChange={(value) => {
                setSourceFilter(value);
                setCurrentPage(0);
              }}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                {(filters?.sources || ["STREAM", "AUTH", "USER", "SERVER", "EPG", "TRANSCODE", "SYSTEM", "API"]).map(
                  (source) => (
                    <SelectItem key={source} value={source}>
                      {source}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground" />
              <p className="mt-4 text-lg font-medium">No logs found</p>
              <p className="text-muted-foreground">
                Try adjusting your filters or check back later
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Cards View */}
              <div className="md:hidden space-y-3">
                {logs.map((log) => (
                  <Card 
                    key={log.id} 
                    className="overflow-hidden cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedLog(log)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {levelIcons[log.level]}
                        </div>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant={levelColors[log.level]} className="text-xs">
                              {log.level}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm font-medium truncate">{log.message}</p>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{log.source}</span>
                            {log.streamId && (
                              <>
                                <span>•</span>
                                <span>Stream: {log.streamId}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block rounded-md border overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Timestamp</TableHead>
                      <TableHead className="w-[100px]">Level</TableHead>
                      <TableHead className="w-[120px]">Source</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="w-[100px]">Stream ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="font-mono text-sm">
                          <span title={formatTimestamp(log.timestamp)}>
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {levelIcons[log.level]}
                            <Badge variant={levelColors[log.level]}>
                              {log.level}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{log.source}</TableCell>
                        <TableCell className="max-w-md truncate">
                          {log.message}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {log.streamId || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {currentPage * ITEMS_PER_PAGE + 1} -{" "}
                  {Math.min((currentPage + 1) * ITEMS_PER_PAGE, totalLogs)} of{" "}
                  {totalLogs.toLocaleString()} logs
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && levelIcons[selectedLog.level]}
              Log Details
            </DialogTitle>
            <DialogDescription>
              {selectedLog && formatTimestamp(selectedLog.timestamp)}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Level</p>
                  <Badge variant={levelColors[selectedLog.level]} className="mt-1">
                    {selectedLog.level}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Source</p>
                  <p className="mt-1">{selectedLog.source}</p>
                </div>
                {selectedLog.streamId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Stream ID</p>
                    <p className="mt-1">{selectedLog.streamId}</p>
                  </div>
                )}
                {selectedLog.userId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">User ID</p>
                    <p className="mt-1">{selectedLog.userId}</p>
                  </div>
                )}
                {selectedLog.serverId && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Server ID</p>
                    <p className="mt-1">{selectedLog.serverId}</p>
                  </div>
                )}
                {selectedLog.ipAddress && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">IP Address</p>
                    <p className="mt-1 font-mono">{selectedLog.ipAddress}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Message</p>
                <p className="mt-1 whitespace-pre-wrap">{selectedLog.message}</p>
              </div>
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Details</p>
                  <pre className="mt-1 p-4 bg-muted rounded-md overflow-auto text-xs max-h-64">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}