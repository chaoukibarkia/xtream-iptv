"use client";

import { useState, useEffect } from "react";
import {
  Server,
  ArrowDown,
  ArrowRight,
  Check,
  AlertCircle,
  Network,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CascadeGraphEditor } from "./cascade-graph-editor";

interface ServerData {
  id: number;
  name: string;
  status: string;
  type?: string;
  region?: string;
  healthScore?: number;
  hasNvenc?: boolean;
  hasQsv?: boolean;
  hasVaapi?: boolean;
}

interface CascadeServer {
  serverId: number;
  pullFromServerId: number;
  tier: number;
}

interface ServerHierarchySelectorProps {
  servers: ServerData[];
  originServerId: number | undefined;
  childServerIds: number[];
  cascadeConfig?: CascadeServer[];
  onOriginChange: (serverId: number | undefined) => void;
  onChildrenChange: (serverIds: number[]) => void;
  onCascadeChange?: (cascade: CascadeServer[]) => void;
  mode?: "simple" | "cascade";
}

export function ServerHierarchySelector({
  servers,
  originServerId,
  childServerIds,
  cascadeConfig = [],
  onOriginChange,
  onChildrenChange,
  onCascadeChange,
  mode = "simple",
}: ServerHierarchySelectorProps) {
  const [viewMode, setViewMode] = useState<"simple" | "cascade">(mode);
  const [localCascade, setLocalCascade] = useState<CascadeServer[]>(cascadeConfig);

  // Update local cascade when props change
  useEffect(() => {
    if (cascadeConfig.length > 0) {
      setLocalCascade(cascadeConfig);
    }
  }, [cascadeConfig]);

  const onlineServers = servers.filter((s) => s.status === "ONLINE" || s.status === "DEGRADED");
  const originServer = servers.find((s) => s.id === originServerId);

  // Get servers available for selection (not origin)
  const availableForChild = onlineServers.filter((s) => s.id !== originServerId);

  // Simple mode handlers
  const handleChildToggle = (serverId: number, checked: boolean) => {
    if (checked) {
      onChildrenChange([...childServerIds, serverId]);
    } else {
      onChildrenChange(childServerIds.filter((id) => id !== serverId));
    }
  };

  // Cascade mode handlers
  const handleAddToCascade = (serverId: number, pullFromServerId: number) => {
    const parentTier = localCascade.find((c) => c.serverId === pullFromServerId)?.tier ?? 0;
    const newCascade = [
      ...localCascade.filter((c) => c.serverId !== serverId),
      { serverId, pullFromServerId, tier: parentTier + 1 },
    ];
    setLocalCascade(newCascade);
    onCascadeChange?.(newCascade);
    
    // Also update childServerIds for backward compatibility
    const childIds = newCascade.map((c) => c.serverId);
    onChildrenChange(childIds);
  };

  const handleRemoveFromCascade = (serverId: number) => {
    // Also remove any servers that were pulling from this one
    const toRemove = new Set<number>([serverId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of localCascade) {
        if (toRemove.has(c.pullFromServerId) && !toRemove.has(c.serverId)) {
          toRemove.add(c.serverId);
          changed = true;
        }
      }
    }
    
    const newCascade = localCascade.filter((c) => !toRemove.has(c.serverId));
    setLocalCascade(newCascade);
    onCascadeChange?.(newCascade);
    
    const childIds = newCascade.map((c) => c.serverId);
    onChildrenChange(childIds);
  };

  // Get servers in the cascade that can be parents (origin + servers already in cascade)
  const getPossibleParents = (): ServerData[] => {
    const parentIds = new Set<number>();
    if (originServerId) parentIds.add(originServerId);
    localCascade.forEach((c) => parentIds.add(c.serverId));
    return servers.filter((s) => parentIds.has(s.id));
  };

  // Get servers not yet in cascade
  const getUnassignedServers = (): ServerData[] => {
    const assignedIds = new Set<number>([originServerId || 0, ...localCascade.map((c) => c.serverId)]);
    return onlineServers.filter((s) => !assignedIds.has(s.id));
  };

  // Build visual tree for cascade mode
  const buildCascadeTree = () => {
    if (!originServerId) return [];
    
    interface TreeNode {
      server: ServerData;
      tier: number;
      children: TreeNode[];
    }

    const nodeMap = new Map<number, TreeNode>();
    
    // Create origin node
    const originNode: TreeNode = {
      server: originServer!,
      tier: 0,
      children: [],
    };
    nodeMap.set(originServerId, originNode);

    // Create child nodes
    for (const c of localCascade) {
      const server = servers.find((s) => s.id === c.serverId);
      if (server) {
        nodeMap.set(c.serverId, {
          server,
          tier: c.tier,
          children: [],
        });
      }
    }

    // Build tree structure
    for (const c of localCascade) {
      const node = nodeMap.get(c.serverId);
      const parentNode = nodeMap.get(c.pullFromServerId);
      if (node && parentNode) {
        parentNode.children.push(node);
      }
    }

    return [originNode];
  };

  const renderTreeNode = (node: { server: ServerData; tier: number; children: any[] }, depth: number = 0) => {
    const isOrigin = node.tier === 0;
    
    return (
      <div key={node.server.id} className="space-y-2">
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border transition-colors",
            isOrigin
              ? "bg-primary/10 border-primary/30"
              : "bg-zinc-800/50 border-zinc-700 hover:bg-zinc-800"
          )}
          style={{ marginLeft: depth * 24 }}
        >
          {depth > 0 && (
            <div className="flex items-center text-zinc-500">
              <ArrowRight className="h-4 w-4" />
            </div>
          )}
          
          <Server className={cn("h-4 w-4", isOrigin ? "text-primary" : "text-zinc-400")} />
          
          <span className="font-medium text-sm">{node.server.name}</span>
          
          <Badge
            variant={isOrigin ? "default" : "secondary"}
            className={cn("text-[10px]", isOrigin && "bg-primary")}
          >
            {isOrigin ? "ORIGIN" : `Tier ${node.tier}`}
          </Badge>
          
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              node.server.status === "ONLINE" ? "text-green-400 border-green-500/30" : "text-yellow-400 border-yellow-500/30"
            )}
          >
            {node.server.status}
          </Badge>

          {!isOrigin && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 text-xs text-destructive hover:text-destructive"
              onClick={() => handleRemoveFromCascade(node.server.id)}
            >
              Remove
            </Button>
          )}
        </div>

        {node.children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Architecture Explanation */}
      <Card className="bg-blue-950/20 border-blue-900/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Network className="h-4 w-4 text-blue-400" />
            Server Distribution Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-blue-300/80">
          <div className="space-y-1">
            <p className="font-medium text-blue-200">Purpose:</p>
            <p>Define how streams are distributed across your server infrastructure to optimize bandwidth and reduce costs.</p>
          </div>
          <div className="space-y-1">
            <p className="font-medium text-blue-200">Flow:</p>
            <div className="flex items-center gap-2 text-blue-400/90">
              <span>[External Source]</span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-medium">[Origin Server]</span>
              <ArrowRight className="h-3 w-3" />
              <span>[Child Servers]</span>
              <ArrowRight className="h-3 w-3" />
              <span>[End Users]</span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-blue-900/30">
            <div>
              <p className="font-medium text-blue-200 mb-1">Bandwidth Optimization</p>
              <p className="text-xs">Only Origin pulls from internet, others get it internally</p>
            </div>
            <div>
              <p className="font-medium text-blue-200 mb-1">Reliability</p>
              <p className="text-xs">Avoid hitting external source connection limits</p>
            </div>
            <div>
              <p className="font-medium text-blue-200 mb-1">Cost Reduction</p>
              <p className="text-xs">Internal traffic is free/cheaper than external</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <Button
          variant={viewMode === "simple" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("simple")}
        >
          <Server className="h-4 w-4 mr-1" />
          Simple
        </Button>
        <Button
          variant={viewMode === "cascade" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("cascade")}
        >
          <Layers className="h-4 w-4 mr-1" />
          Cascade (Escalier)
        </Button>
      </div>

      {/* Step 1: Select Origin Server */}
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
              1
            </div>
            Origin Server
          </CardTitle>
          <CardDescription className="text-xs">
            Select the server that will pull directly from the external source URL. This is the "source of truth" for your internal network - choose a server with good connectivity to the external source.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {onlineServers.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-700 p-4 text-center text-zinc-500">
              <Server className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No online servers available</p>
              <p className="text-xs mt-1">Servers must be ONLINE or DEGRADED to be selected</p>
            </div>
          ) : (
            <Select
              key={`origin-select-${onlineServers.length}-${originServerId ?? 'none'}`}
              value={originServerId !== undefined ? String(originServerId) : undefined}
              onValueChange={(v) => {
                console.log('Origin server selected:', v, 'parsed:', parseInt(v));
                const newOriginId = v ? parseInt(v) : undefined;
                onOriginChange(newOriginId);
                // Clear cascade when origin changes
                setLocalCascade([]);
                onCascadeChange?.([]);
                onChildrenChange([]);
              }}
            >
              <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                <SelectValue placeholder="Select origin server" />
              </SelectTrigger>
              <SelectContent>
                {onlineServers.map((server) => (
                  <SelectItem key={server.id} value={String(server.id)}>
                    {server.name} ({server.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {originServerId && (
            <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-primary" />
                <span className="font-medium">{originServer?.name}</span>
                <ArrowDown className="h-4 w-4 text-zinc-500" />
                <span className="text-zinc-400">pulls from source URL</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Select Child Servers */}
      {originServerId && (
        <>
          {viewMode === "simple" ? (
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-zinc-700 text-zinc-200 text-xs font-bold">
                    2
                  </div>
                  Child Servers
                </CardTitle>
                <CardDescription className="text-xs">
                  Select servers that will pull from the origin server. All children pull directly from Origin.
                  <div className="mt-2 text-[10px] text-zinc-500">
                    Source → [Origin] → [Child1, Child2, Child3]
                  </div>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-zinc-700 max-h-64 overflow-y-auto">
                  {availableForChild.length === 0 ? (
                    <div className="p-6 text-center text-zinc-500">
                      <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No other servers available</p>
                    </div>
                  ) : (
                    availableForChild.map((server) => {
                      const isSelected = childServerIds.includes(server.id);
                      return (
                        <div
                          key={server.id}
                          className={cn(
                            "flex items-center gap-3 p-3 cursor-pointer transition-colors border-b border-zinc-800 last:border-0",
                            isSelected ? "bg-zinc-800" : "hover:bg-zinc-800/50"
                          )}
                          onClick={() => handleChildToggle(server.id, !isSelected)}
                        >
                          <Checkbox checked={isSelected} />
                          <Server className="h-4 w-4 text-zinc-400" />
                          <span className="font-medium text-sm">{server.name}</span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              server.status === "ONLINE"
                                ? "text-green-400 border-green-500/30"
                                : "text-yellow-400 border-yellow-500/30"
                            )}
                          >
                            {server.status}
                          </Badge>
                          {server.region && (
                            <span className="text-xs text-zinc-500 ml-auto">{server.region}</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Summary */}
                {childServerIds.length > 0 && (
                  <div className="rounded-lg bg-blue-950/20 border border-blue-900/30 p-3">
                    <p className="text-xs text-blue-400">
                      ✓ {childServerIds.length} server(s) will pull from origin
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Cascade Mode: Visual Graph Editor */
            <CascadeGraphEditor
              servers={servers}
              originServerId={originServerId}
              cascadeConfig={localCascade}
              onOriginChange={onOriginChange}
              onCascadeChange={(cascade) => {
                setLocalCascade(cascade);
                onCascadeChange?.(cascade);
                // Also update childServerIds for backward compatibility
                const childIds = cascade.map((c) => c.serverId);
                onChildrenChange(childIds);
              }}
            />
          )}
        </>
      )}

      {/* Warning if no origin selected */}
      {!originServerId && servers.length > 0 && (
        <div className="rounded-lg bg-yellow-950/20 border border-yellow-900/30 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-400">No Origin Server Selected</p>
              <p className="text-xs text-yellow-500/80 mt-1">
                Select an origin server to define where the stream will be pulled from. 
                Without an origin, the stream cannot be distributed.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
