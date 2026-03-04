"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Server,
  Plus,
  ArrowDown,
  Network,
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
import { cn } from "@/lib/utils";

interface ServerData {
  id: number;
  name: string;
  status: string;
  type?: string;
  region?: string;
}

interface CascadeServer {
  serverId: number;
  pullFromServerId: number;
  tier: number;
}

interface CascadeGraphEditorProps {
  servers: ServerData[];
  originServerId: number | undefined;
  cascadeConfig: CascadeServer[];
  onOriginChange: (serverId: number | undefined) => void;
  onCascadeChange: (cascade: CascadeServer[]) => void;
}

// Custom node component for servers
function ServerNode({ data }: { data: { server: ServerData; isOrigin: boolean; tier: number } }) {
  return (
    <div className={cn(
      "px-4 py-3 rounded-lg border-2 shadow-lg min-w-[180px]",
      data.isOrigin
        ? "bg-primary/20 border-primary/50"
        : "bg-zinc-800 border-zinc-600"
    )}>
      <Handle type="target" position={Position.Top} className="!bg-zinc-500" />
      
      <div className="flex items-center gap-2 mb-2">
        <Server className={cn(
          "h-4 w-4",
          data.isOrigin ? "text-primary" : "text-zinc-400"
        )} />
        <span className={cn(
          "font-semibold text-sm",
          data.isOrigin ? "text-primary" : "text-zinc-200"
        )}>
          {data.server.name}
        </span>
      </div>
      
      <div className="flex items-center gap-2 flex-wrap">
        <Badge
          variant={data.isOrigin ? "default" : "secondary"}
          className={cn(
            "text-[10px] px-1.5 py-0",
            data.isOrigin && "bg-primary"
          )}
        >
          {data.isOrigin ? "ORIGIN" : `Tier ${data.tier}`}
        </Badge>
        
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0",
            data.server.status === "ONLINE"
              ? "text-green-400 border-green-500/50"
              : "text-yellow-400 border-yellow-500/50"
          )}
        >
          {data.server.status}
        </Badge>
      </div>
      
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-500" />
    </div>
  );
}

const nodeTypes: NodeTypes = {
  server: ServerNode,
};

export function CascadeGraphEditor({
  servers,
  originServerId,
  cascadeConfig,
  onOriginChange,
  onCascadeChange,
}: CascadeGraphEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedServerToAdd, setSelectedServerToAdd] = useState<string>("");
  const [selectedParentForAdd, setSelectedParentForAdd] = useState<string>("");

  const onlineServers = useMemo(
    () => servers.filter((s) => s.status === "ONLINE" || s.status === "DEGRADED"),
    [servers]
  );

  const originServer = useMemo(
    () => servers.find((s) => s.id === originServerId),
    [servers, originServerId]
  );

  // Get servers not yet in the graph
  const unassignedServers = useMemo(() => {
    const assignedIds = new Set<number>();
    if (originServerId) assignedIds.add(originServerId);
    cascadeConfig.forEach((c) => assignedIds.add(c.serverId));
    return onlineServers.filter((s) => !assignedIds.has(s.id));
  }, [onlineServers, originServerId, cascadeConfig]);

  // Get servers that can be parents (origin + all cascade servers)
  const possibleParents = useMemo(() => {
    const parentIds = new Set<number>();
    if (originServerId) parentIds.add(originServerId);
    cascadeConfig.forEach((c) => parentIds.add(c.serverId));
    return servers.filter((s) => parentIds.has(s.id));
  }, [servers, originServerId, cascadeConfig]);

  // Build graph nodes and edges from cascade config
  useEffect(() => {
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    if (!originServerId || !originServer) return;

    // Add origin node
    const originNode: Node = {
      id: `server-${originServerId}`,
      type: "server",
      position: { x: 250, y: 50 },
      data: {
        server: originServer,
        isOrigin: true,
        tier: 0,
      },
    };
    newNodes.push(originNode);

    // Build tier map for positioning
    const tierMap = new Map<number, number[]>();
    tierMap.set(0, [originServerId]);
    
    cascadeConfig.forEach((c) => {
      const tier = c.tier;
      if (!tierMap.has(tier)) {
        tierMap.set(tier, []);
      }
      tierMap.get(tier)!.push(c.serverId);
    });

    // Add cascade nodes with tier-based positioning
    const tierPositions = new Map<number, number>();
    tierMap.forEach((serverIds, tier) => {
      tierPositions.set(tier, 0);
    });

    cascadeConfig.forEach((c) => {
      const server = servers.find((s) => s.id === c.serverId);
      if (!server) return;

      const tier = c.tier;
      const tierIndex = tierPositions.get(tier) || 0;
      tierPositions.set(tier, tierIndex + 1);

      const x = 250 + (tier - 1) * 300;
      const y = 200 + tierIndex * 120;

      const node: Node = {
        id: `server-${c.serverId}`,
        type: "server",
        position: { x, y },
        data: {
          server,
          isOrigin: false,
          tier,
        },
      };
      newNodes.push(node);

      // Add edge from parent
      const parentId = c.pullFromServerId === originServerId 
        ? `server-${originServerId}`
        : `server-${c.pullFromServerId}`;
      
      const edge: Edge = {
        id: `edge-${c.pullFromServerId}-${c.serverId}`,
        source: parentId,
        target: `server-${c.serverId}`,
        type: "smoothstep",
        animated: true,
        style: { stroke: "#3b82f6", strokeWidth: 2 },
      };
      newEdges.push(edge);
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [originServerId, originServer, cascadeConfig, servers, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      
      const sourceId = parseInt(params.source.replace("server-", ""));
      const targetId = parseInt(params.target.replace("server-", ""));

      // Don't allow connecting origin to itself
      if (sourceId === originServerId && targetId === originServerId) return;

      // Find parent tier
      const parentTier = sourceId === originServerId 
        ? 0 
        : cascadeConfig.find((c) => c.serverId === sourceId)?.tier ?? 0;

      // Check if target already exists in cascade
      const existingIndex = cascadeConfig.findIndex((c) => c.serverId === targetId);
      
      const newCascade = [...cascadeConfig];
      if (existingIndex >= 0) {
        // Update existing
        newCascade[existingIndex] = {
          serverId: targetId,
          pullFromServerId: sourceId,
          tier: parentTier + 1,
        };
      } else {
        // Add new
        newCascade.push({
          serverId: targetId,
          pullFromServerId: sourceId,
          tier: parentTier + 1,
        });
      }

      onCascadeChange(newCascade);
    },
    [originServerId, cascadeConfig, onCascadeChange]
  );

  const handleAddServer = () => {
    if (!selectedServerToAdd || !selectedParentForAdd) return;
    
    const serverId = parseInt(selectedServerToAdd);
    const parentId = parseInt(selectedParentForAdd);

    const parentTier = parentId === originServerId
      ? 0
      : cascadeConfig.find((c) => c.serverId === parentId)?.tier ?? 0;

    const newCascade = [
      ...cascadeConfig.filter((c) => c.serverId !== serverId),
      {
        serverId,
        pullFromServerId: parentId,
        tier: parentTier + 1,
      },
    ];

    onCascadeChange(newCascade);
    setSelectedServerToAdd("");
    setSelectedParentForAdd("");
  };

  const handleDeleteNode = (nodeId: string) => {
    const serverId = parseInt(nodeId.replace("server-", ""));
    
    if (serverId === originServerId) {
      // Can't delete origin
      return;
    }

    // Remove server and all its children recursively
    const toRemove = new Set<number>([serverId]);
    let changed = true;
    while (changed) {
      changed = false;
      cascadeConfig.forEach((c) => {
        if (toRemove.has(c.pullFromServerId) && !toRemove.has(c.serverId)) {
          toRemove.add(c.serverId);
          changed = true;
        }
      });
    }

    const newCascade = cascadeConfig.filter((c) => !toRemove.has(c.serverId));
    onCascadeChange(newCascade);
  };

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    // Allow deleting non-origin nodes on click
    if (node.data.isOrigin) return;
    
    const serverId = parseInt(node.id.replace("server-", ""));
    
    // Remove server and all its children recursively
    const toRemove = new Set<number>([serverId]);
    let changed = true;
    while (changed) {
      changed = false;
      cascadeConfig.forEach((c) => {
        if (toRemove.has(c.pullFromServerId) && !toRemove.has(c.serverId)) {
          toRemove.add(c.serverId);
          changed = true;
        }
      });
    }

    const newCascade = cascadeConfig.filter((c) => !toRemove.has(c.serverId));
    onCascadeChange(newCascade);
  }, [cascadeConfig, onCascadeChange]);

  return (
    <div className="space-y-4">
      {/* Graph Visualization - Origin is selected in parent component */}
      {originServerId && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDown className="h-4 w-4 text-blue-400" />
              Cascade Distribution Graph
            </CardTitle>
            <CardDescription className="text-xs">
              Drag nodes to reposition. Click edges to connect servers. Click a server node to remove it (except origin).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[500px] w-full rounded-lg border border-zinc-700 bg-zinc-950">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                nodeTypes={nodeTypes}
                fitView
                className="bg-zinc-950"
              >
                <Background color="#27272a" gap={16} />
                <Controls className="bg-zinc-800 border-zinc-700" />
                <MiniMap
                  className="bg-zinc-900 border-zinc-700"
                  nodeColor={(node) => {
                    return node.data.isOrigin ? "#3b82f6" : "#71717a";
                  }}
                />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Server to Cascade */}
      {originServerId && unassignedServers.length > 0 && (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="h-4 w-4 text-green-400" />
              Add Server to Cascade
            </CardTitle>
            <CardDescription className="text-xs">
              Select a server and its parent to add to the cascade
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={selectedServerToAdd}
                onValueChange={setSelectedServerToAdd}
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue placeholder="Select server" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedServers.map((server) => (
                    <SelectItem key={server.id} value={server.id.toString()}>
                      {server.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={selectedParentForAdd}
                onValueChange={setSelectedParentForAdd}
                disabled={!selectedServerToAdd}
              >
                <SelectTrigger className="bg-zinc-800/50 border-zinc-700">
                  <SelectValue placeholder="Select parent" />
                </SelectTrigger>
                <SelectContent>
                  {possibleParents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id.toString()}>
                      {parent.name}
                      {parent.id === originServerId && " (Origin)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAddServer}
              disabled={!selectedServerToAdd || !selectedParentForAdd}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add to Cascade
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {originServerId && cascadeConfig.length > 0 && (
        <Card className="bg-blue-950/20 border-blue-900/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-sm text-blue-300">
              <Network className="h-4 w-4" />
              <span>
                Cascade configured: {cascadeConfig.length} server(s) in {Math.max(...cascadeConfig.map(c => c.tier), 0)} tier(s)
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
