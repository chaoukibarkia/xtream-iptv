"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Folder,
  File,
  ChevronRight,
  ChevronUp,
  Search,
  Film,
  HardDrive,
  FolderOpen,
  Check,
  X,
  Loader2,
  Home,
  Server,
  Wifi,
  WifiOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useServers } from "@/lib/api/hooks/useServers";

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  extension: string | null;
}

interface FileBrowserResponse {
  currentPath: string;
  parentPath: string | null;
  items: FileItem[];
  totalFiles: number;
  totalDirs: number;
}

interface SearchResult {
  name: string;
  path: string;
  directory: string;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
  truncated: boolean;
}

interface FileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string, filename: string, serverId?: number) => void;
  title?: string;
  description?: string;
  initialPath?: string;
  allowedExtensions?: string[];
  showServerSelector?: boolean;
  defaultServerId?: number;
  browseFullFilesystem?: boolean;
}

export function FileBrowser({
  open,
  onOpenChange,
  onSelect,
  title = "Select Media File",
  description = "Browse and select a video file from the server",
  initialPath = "/media",
  allowedExtensions = [".mkv", ".mp4", ".avi", ".mov", ".webm"],
  showServerSelector = true,
  defaultServerId,
  browseFullFilesystem = true,
}: FileBrowserProps) {
  // If full filesystem browsing is enabled, start from root
  const effectiveInitialPath = browseFullFilesystem ? "/" : initialPath;
  const [currentPath, setCurrentPath] = useState(effectiveInitialPath);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(defaultServerId);

  // Fetch available servers
  const { data: serversData } = useServers();
  const servers = Array.isArray(serversData) 
    ? serversData 
    : (serversData as any)?.data || [];
  
  // Filter to only show online edge servers (exclude MAIN since it's covered by "Local Server")
  const availableServers = servers.filter((s: any) => 
    (s.status === 'ONLINE' || s.status === 'DEGRADED') && s.type !== 'MAIN'
  );

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentPath(effectiveInitialPath);
      setSearchQuery("");
      setSearchMode(false);
      setSelectedFile(null);
      if (defaultServerId) {
        setSelectedServerId(defaultServerId);
      }
    }
  }, [open, effectiveInitialPath, defaultServerId]);

  // Browse directory
  const { data: browseData, isLoading: isBrowsing, error: browseError } = useQuery({
    queryKey: ["file-browser", currentPath, selectedServerId],
    queryFn: () =>
      api.get<FileBrowserResponse>("/admin/servers/files", {
        path: currentPath,
        extensions: allowedExtensions.join(","),
        ...(selectedServerId && { serverId: selectedServerId.toString() }),
      }),
    enabled: open && !searchMode,
    staleTime: 10000,
  });

  // Search files
  const { data: searchData, isLoading: isSearching } = useQuery({
    queryKey: ["file-search", searchQuery, selectedServerId],
    queryFn: () =>
      api.get<SearchResponse>("/admin/servers/files/search", {
        query: searchQuery,
        path: initialPath,
        maxResults: "50",
        ...(selectedServerId && { serverId: selectedServerId.toString() }),
      }),
    enabled: open && searchMode && searchQuery.length >= 2,
    staleTime: 30000,
  });

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
    setSelectedFile(null);
  };

  const handleSelect = (item: FileItem) => {
    if (item.isDirectory) {
      handleNavigate(item.path);
    } else {
      setSelectedFile(item);
    }
  };

  const handleConfirm = () => {
    if (selectedFile) {
      onSelect(selectedFile.path, selectedFile.name, selectedServerId);
      onOpenChange(false);
    }
  };

  const handleServerChange = (value: string) => {
    const serverId = value === "local" ? undefined : parseInt(value);
    setSelectedServerId(serverId);
    setCurrentPath(initialPath);
    setSelectedFile(null);
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value.length >= 2) {
      setSearchMode(true);
    } else {
      setSearchMode(false);
    }
  };

  const getFileIcon = (ext: string | null) => {
    const videoExts = [".mkv", ".mp4", ".avi", ".mov", ".webm", ".m4v", ".ts"];
    if (ext && videoExts.includes(ext.toLowerCase())) {
      return <Film className="h-4 w-4 text-blue-500" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* Server Selector */}
        {showServerSelector && (
          <div className="flex items-center gap-3 pb-2 border-b">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Server className="h-4 w-4" />
              <span>Server:</span>
            </div>
            <Select
              value={selectedServerId?.toString() || "local"}
              onValueChange={handleServerChange}
            >
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select server" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    <span>Local Server (Main)</span>
                  </div>
                </SelectItem>
                {availableServers.map((server: any) => (
                  <SelectItem key={server.id} value={server.id.toString()}>
                    <div className="flex items-center gap-2">
                      {server.status === 'ONLINE' ? (
                        <Wifi className="h-4 w-4 text-green-500" />
                      ) : (
                        <WifiOff className="h-4 w-4 text-yellow-500" />
                      )}
                      <span>{server.name}</span>
                      <Badge variant="outline" className="text-xs ml-2">
                        {server.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServerId && (
              <Badge variant="secondary" className="text-xs">
                Remote
              </Badge>
            )}
          </div>
        )}

        {/* Search & Breadcrumb */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => handleSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          {!searchMode && (
            <div className="flex items-center gap-1 text-sm overflow-x-auto pb-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => handleNavigate("/")}
                title="Go to root"
              >
                <Home className="h-4 w-4" />
              </Button>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {pathParts.map((part, index) => (
                <div key={index} className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={() =>
                      handleNavigate("/" + pathParts.slice(0, index + 1).join("/"))
                    }
                  >
                    {part}
                  </Button>
                  {index < pathParts.length - 1 && (
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* File List */}
        <div className="flex-1 border rounded-lg overflow-y-auto max-h-[400px]">
          <div className="p-2">
            {searchMode ? (
              // Search Results
              isSearching ? (
                <div className="space-y-2 p-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !searchData?.results?.length ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Search className="h-12 w-12 mb-2 opacity-50" />
                  <p>No files found matching &quot;{searchQuery}&quot;</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {searchData.results.map((result, index) => (
                    <button
                      key={index}
                      onClick={() =>
                        handleSelect({
                          name: result.name,
                          path: result.path,
                          isDirectory: false,
                          extension:
                            "." + result.name.split(".").pop()?.toLowerCase(),
                        })
                      }
                      className={cn(
                        "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                        "hover:bg-muted",
                        selectedFile?.path === result.path && "bg-primary/10 border border-primary"
                      )}
                    >
                      <Film className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{result.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {result.directory}
                        </p>
                      </div>
                      {selectedFile?.path === result.path && (
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                      )}
                    </button>
                  ))}
                  {searchData.truncated && (
                    <p className="text-xs text-center text-muted-foreground py-2">
                      Results limited to {searchData.total} items
                    </p>
                  )}
                </div>
              )
            ) : // Browse Mode
            isBrowsing ? (
              <div className="space-y-2 p-2">
                {[...Array(8)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : browseError ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Folder className="h-12 w-12 mb-2 opacity-50" />
                <p>Failed to load directory</p>
                <p className="text-sm">{(browseError as Error).message}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Parent directory */}
                {browseData?.parentPath && (
                  <button
                    onClick={() => handleNavigate(browseData.parentPath!)}
                    className="w-full flex items-center gap-3 p-2 rounded-md text-left hover:bg-muted transition-colors"
                  >
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">..</span>
                  </button>
                )}

                {/* Items */}
                {browseData?.items?.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelect(item)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-md text-left transition-colors",
                      "hover:bg-muted",
                      !item.isDirectory &&
                        selectedFile?.path === item.path &&
                        "bg-primary/10 border border-primary"
                    )}
                  >
                    {item.isDirectory ? (
                      <Folder className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                    ) : (
                      getFileIcon(item.extension)
                    )}
                    <span
                      className={cn(
                        "flex-1 truncate",
                        item.isDirectory && "font-medium"
                      )}
                    >
                      {item.name}
                    </span>
                    {item.isDirectory && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    {!item.isDirectory && selectedFile?.path === item.path && (
                      <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    )}
                    {!item.isDirectory && item.extension && (
                      <Badge variant="outline" className="text-xs">
                        {item.extension.replace(".", "").toUpperCase()}
                      </Badge>
                    )}
                  </button>
                ))}

                {browseData?.items?.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <FolderOpen className="h-12 w-12 mb-2 opacity-50" />
                    <p>No media files in this directory</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected File Preview */}
        {selectedFile && (
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Film className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedFile.path}
              </p>
            </div>
            <Badge>{selectedFile.extension?.replace(".", "").toUpperCase()}</Badge>
          </div>
        )}

        <DialogFooter>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
            {browseData && !searchMode && (
              <>
                <span>{browseData.totalDirs} folders</span>
                <span>•</span>
                <span>{browseData.totalFiles} files</span>
              </>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedFile}>
            {selectedFile ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Select File
              </>
            ) : (
              "Select a File"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple inline file picker for forms
interface FilePickerInputProps {
  value: string;
  onChange: (path: string, serverId?: number) => void;
  placeholder?: string;
  disabled?: boolean;
  showServerSelector?: boolean;
  serverId?: number;
}

export function FilePickerInput({
  value,
  onChange,
  placeholder = "Select a file...",
  disabled = false,
  showServerSelector = true,
  serverId,
}: FilePickerInputProps) {
  const [browserOpen, setBrowserOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(serverId);

  const handleSelect = (path: string, filename: string, sId?: number) => {
    onChange(path, sId);
    setSelectedServerId(sId);
  };

  const filename = value ? value.split("/").pop() : "";

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value, selectedServerId)}
          placeholder={placeholder}
          disabled={disabled}
          className="pr-20"
        />
        {filename && (
          <Badge
            variant="secondary"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs"
          >
            {filename.split(".").pop()?.toUpperCase()}
          </Badge>
        )}
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={() => setBrowserOpen(true)}
        disabled={disabled}
      >
        <Folder className="h-4 w-4 mr-2" />
        Browse
      </Button>
      <FileBrowser
        open={browserOpen}
        onOpenChange={setBrowserOpen}
        onSelect={handleSelect}
        showServerSelector={showServerSelector}
        defaultServerId={selectedServerId}
      />
    </div>
  );
}

