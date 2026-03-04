"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Trash2,
  Plus,
  Tv,
  Film,
  Radio,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StreamType } from "@/types";

export interface CategoryNode {
  id: number;
  name: string;
  type: StreamType;
  parentId?: number | null;
  sortOrder?: number;
  isActive: boolean;
  countryCode?: string | null;
  flagSvgUrl?: string | null;
  streamCount?: number;
  _count?: {
    streams: number;
  };
  children?: CategoryNode[];
}

interface CategoryTreeProps {
  categories: CategoryNode[];
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
  onAddChild: (parent: CategoryNode) => void;
  onMove?: (categoryId: number, direction: "up" | "down", siblings: CategoryNode[]) => void;
  isLoading?: boolean;
}

const typeIcons: Record<StreamType, React.ReactNode> = {
  LIVE: <Tv className="h-4 w-4 text-blue-500" />,
  VOD: <Film className="h-4 w-4 text-purple-500" />,
  SERIES: <Film className="h-4 w-4 text-green-500" />,
  RADIO: <Radio className="h-4 w-4 text-orange-500" />,
};

const typeColors: Record<StreamType, "default" | "secondary" | "outline" | "destructive"> = {
  LIVE: "default",
  VOD: "secondary",
  SERIES: "outline",
  RADIO: "default",
};

interface TreeNodeProps {
  node: CategoryNode;
  level: number;
  index: number;
  siblings: CategoryNode[];
  onEdit: (category: CategoryNode) => void;
  onDelete: (category: CategoryNode) => void;
  onAddChild: (parent: CategoryNode) => void;
  onMove?: (categoryId: number, direction: "up" | "down", siblings: CategoryNode[]) => void;
  expandedNodes: Set<number>;
  toggleExpanded: (id: number) => void;
}

function TreeNode({
  node,
  level,
  index,
  siblings,
  onEdit,
  onDelete,
  onAddChild,
  onMove,
  expandedNodes,
  toggleExpanded,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const streamCount = node._count?.streams || node.streamCount || 0;
  const isParentCategory = !node.parentId;
  const isFirst = index === 0;
  const isLast = index === siblings.length - 1;

  return (
    <div className="select-none">
      <div
        className={cn(
          "group flex flex-wrap sm:flex-nowrap items-center gap-1.5 sm:gap-2 py-2.5 sm:py-2 px-2 rounded-md transition-colors",
          "hover:bg-muted/50"
        )}
        style={{ paddingLeft: `${Math.min(level * 16, 48) + 8}px` }}
      >
        <button
          onClick={() => toggleExpanded(node.id)}
          className={cn(
            "flex items-center justify-center w-6 h-6 rounded hover:bg-muted flex-shrink-0",
            !hasChildren && "invisible"
          )}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : null}
        </button>

        {isParentCategory && node.flagSvgUrl ? (
          <img
            src={node.flagSvgUrl}
            alt={`${node.name} flag`}
            className="h-4 w-6 object-cover rounded flex-shrink-0"
            title={node.countryCode || undefined}
          />
        ) : (
          <div className="w-4 hidden sm:block" />
        )}

        <span className="flex-shrink-0">{typeIcons[node.type]}</span>

        <span className="font-medium flex-1 min-w-0 truncate">{node.name}</span>

        <span className="text-xs sm:text-sm text-muted-foreground flex-shrink-0">
          {streamCount}
          <span className="hidden sm:inline"> {streamCount === 1 ? "stream" : "streams"}</span>
        </span>

        <Badge variant={typeColors[node.type]} className="text-xs flex-shrink-0">
          {node.type}
        </Badge>

        <Badge variant={node.isActive ? "default" : "secondary"} className="text-xs flex-shrink-0">
          {node.isActive ? "Visible" : "Hidden"}
        </Badge>

        {/* Move up/down buttons */}
        {onMove && (
          <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMove(node.id, "up", siblings)}
              disabled={isFirst}
              title="Move up"
            >
              <ArrowUp className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onMove(node.id, "down", siblings)}
              disabled={isLast}
              title="Move down"
            >
              <ArrowDown className="h-3 w-3" />
            </Button>
          </div>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onAddChild(node)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Subcategory
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(node)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {hasChildren && isExpanded && (
        <div className="border-l border-muted ml-4 sm:ml-8">
          {node.children!.map((child, childIndex) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              index={childIndex}
              siblings={node.children!}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              onMove={onMove}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryTree({
  categories,
  onEdit,
  onDelete,
  onAddChild,
  onMove,
  isLoading,
}: CategoryTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(new Set());

  const tree = useMemo(() => buildTree(categories), [categories]);

  // Group tree by type - must be before any early returns to follow Rules of Hooks
  const groupedTree = useMemo(() => {
    const groups: Record<StreamType, CategoryNode[]> = {
      LIVE: [],
      VOD: [],
      SERIES: [],
      RADIO: [],
    };

    tree.forEach((node) => {
      groups[node.type].push(node);
    });

    return groups;
  }, [tree]);

  const toggleExpanded = useCallback((id: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    const allIds = new Set(categories.map((c) => c.id));
    setExpandedNodes(allIds);
  }, [categories]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-10 bg-muted/50 rounded animate-pulse"
            style={{ marginLeft: `${(i % 3) * 24}px` }}
          />
        ))}
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Folder className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">No categories found</h3>
        <p className="text-sm text-muted-foreground">
          Create your first category to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse All
        </Button>
      </div>

      <div className="space-y-6">
        {(["LIVE", "VOD", "SERIES", "RADIO"] as StreamType[]).map((type) => {
          const nodes = groupedTree[type];
          if (nodes.length === 0) return null;

          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 px-2">
                {typeIcons[type]}
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  {type === "LIVE"
                    ? "Live TV"
                    : type === "VOD"
                    ? "Movies (VOD)"
                    : type === "SERIES"
                    ? "TV Series"
                    : "Radio"}
                </h3>
                <Badge variant="outline" className="ml-auto">
                  {nodes.length} {nodes.length === 1 ? "category" : "categories"}
                </Badge>
              </div>
              <div className="rounded-lg border bg-card">
                {nodes.map((node, index) => (
                  <TreeNode
                    key={node.id}
                    node={node}
                    level={0}
                    index={index}
                    siblings={nodes}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onAddChild={onAddChild}
                    onMove={onMove}
                    expandedNodes={expandedNodes}
                    toggleExpanded={toggleExpanded}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function buildTree(categories: CategoryNode[]): CategoryNode[] {
  const map = new Map<number, CategoryNode>();
  const roots: CategoryNode[] = [];

  categories.forEach((cat) => {
    map.set(cat.id, { ...cat, children: [] });
  });

  categories.forEach((cat) => {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortChildren = (nodes: CategoryNode[]) => {
    nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortChildren(node.children);
      }
    });
  };

  sortChildren(roots);
  return roots;
}

interface CategorySelectProps {
  categories: CategoryNode[];
  value?: number | null;
  onChange: (value: number | null) => void;
  excludeId?: number;
  type?: StreamType;
}

function flattenTreeWithIndent(
  nodes: CategoryNode[],
  excludeId?: number,
  filterType?: StreamType,
  level: number = 0,
  result: { id: number; name: string; level: number; type: StreamType }[] = []
): { id: number; name: string; level: number; type: StreamType }[] {
  nodes.forEach((node) => {
    if (excludeId && node.id === excludeId) return;
    if (filterType && node.type !== filterType) return;

    result.push({
      id: node.id,
      name: node.name,
      level,
      type: node.type,
    });

    if (node.children && node.children.length > 0) {
      flattenTreeWithIndent(node.children, excludeId, filterType, level + 1, result);
    }
  });
  return result;
}

export function CategorySelect({
  categories,
  value,
  onChange,
  excludeId,
  type,
}: CategorySelectProps) {
  const tree = useMemo(() => buildTree(categories), [categories]);
  const options = useMemo(
    () => flattenTreeWithIndent(tree, excludeId, type),
    [tree, excludeId, type]
  );

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <option value="">No parent (Root level)</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.id}>
          {"—".repeat(opt.level)} {opt.name}
        </option>
      ))}
    </select>
  );
}
