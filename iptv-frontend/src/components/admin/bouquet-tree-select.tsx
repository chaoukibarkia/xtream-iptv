"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Package } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Bouquet } from "@/lib/api/hooks/useBouquets";

export interface BouquetNode extends Bouquet {
  children?: BouquetNode[];
}

interface BouquetTreeSelectProps {
  bouquets: Bouquet[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  className?: string;
}

// Build tree structure from flat array
function buildBouquetTree(bouquets: Bouquet[]): BouquetNode[] {
  const map = new Map<number, BouquetNode>();
  const roots: BouquetNode[] = [];

  // First pass: create a map of all bouquets
  bouquets.forEach((bouquet) => {
    map.set(bouquet.id, { ...bouquet, children: [] });
  });

  // Second pass: build the tree
  bouquets.forEach((bouquet) => {
    const node = map.get(bouquet.id)!;
    if (bouquet.parentId && map.has(bouquet.parentId)) {
      const parent = map.get(bouquet.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Sort children by name
  const sortChildren = (nodes: BouquetNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => {
      if (node.children && node.children.length > 0) {
        sortChildren(node.children);
      }
    });
  };

  sortChildren(roots);
  return roots;
}

// Get all descendant IDs of a node
function getDescendantIds(node: BouquetNode): number[] {
  const ids: number[] = [];
  if (node.children) {
    node.children.forEach((child) => {
      ids.push(child.id);
      ids.push(...getDescendantIds(child));
    });
  }
  return ids;
}

// Get all ancestor IDs of a node
function getAncestorIds(nodeId: number, bouquets: Bouquet[]): number[] {
  const ids: number[] = [];
  const node = bouquets.find((b) => b.id === nodeId);
  if (node?.parentId) {
    ids.push(node.parentId);
    ids.push(...getAncestorIds(node.parentId, bouquets));
  }
  return ids;
}

interface TreeNodeProps {
  node: BouquetNode;
  level: number;
  selectedIds: number[];
  onToggle: (id: number, selected: boolean) => void;
  expandedNodes: Set<number>;
  toggleExpanded: (id: number) => void;
  allBouquets: Bouquet[];
}

function TreeNode({
  node,
  level,
  selectedIds,
  onToggle,
  expandedNodes,
  toggleExpanded,
}: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const isSelected = selectedIds.includes(node.id);
  const streamCount = node._count?.streams || 0;
  const userCount = node._count?.users || 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-2 py-2.5 px-2 rounded-lg cursor-pointer transition-colors",
          isSelected
            ? "bg-purple-500/10 border border-purple-500/30"
            : "hover:bg-zinc-800 border border-transparent"
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onToggle(node.id, !isSelected)}
      >
        {/* Expand/Collapse button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(node.id);
            }}
            className="flex items-center justify-center w-5 h-5 rounded hover:bg-zinc-700 flex-shrink-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <div className="w-5" />
        )}

        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggle(node.id, !!checked)}
          onClick={(e) => e.stopPropagation()}
        />

        <Package className="h-4 w-4 text-purple-500 flex-shrink-0" />

        <span className="font-medium text-sm flex-1 min-w-0 truncate">
          {node.name}
        </span>

        <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">
          {streamCount} streams
        </Badge>

        <span className="text-xs text-zinc-500 flex-shrink-0">
          {userCount} users
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="border-l border-zinc-700 ml-4">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedIds={selectedIds}
              onToggle={onToggle}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              allBouquets={[]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function BouquetTreeSelect({
  bouquets,
  selectedIds,
  onSelectionChange,
  className,
}: BouquetTreeSelectProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<number>>(() => {
    // Auto-expand nodes that have selected children
    const expanded = new Set<number>();
    bouquets.forEach((bouquet) => {
      if (bouquet.parentId && selectedIds.includes(bouquet.id)) {
        // Find and expand all ancestors
        let currentParentId: number | null | undefined = bouquet.parentId;
        while (currentParentId) {
          expanded.add(currentParentId);
          const parent = bouquets.find((b) => b.id === currentParentId);
          currentParentId = parent?.parentId ?? null;
        }
      }
    });
    return expanded;
  });

  const tree = useMemo(() => buildBouquetTree(bouquets), [bouquets]);

  const toggleExpanded = (id: number) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggle = (id: number, selected: boolean) => {
    if (selected) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    }
  };

  if (bouquets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-700 p-6 text-center text-zinc-500">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No bouquets available</p>
        <p className="text-xs">Create bouquets in the Bouquets section first</p>
      </div>
    );
  }

  // Check if there are any subcategories
  const hasSubcategories = bouquets.some((b) => b.parentId);

  return (
    <div className={cn("rounded-lg border border-zinc-700 p-3 max-h-64 overflow-y-auto space-y-1", className)}>
      {hasSubcategories && (
        <div className="flex gap-2 justify-end mb-2 pb-2 border-b border-zinc-800">
          <button
            type="button"
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => {
              const allIds = new Set(bouquets.map((b) => b.id));
              setExpandedNodes(allIds);
            }}
          >
            Expand All
          </button>
          <button
            type="button"
            className="text-xs text-zinc-400 hover:text-zinc-200"
            onClick={() => setExpandedNodes(new Set())}
          >
            Collapse All
          </button>
        </div>
      )}
      {tree.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          selectedIds={selectedIds}
          onToggle={handleToggle}
          expandedNodes={expandedNodes}
          toggleExpanded={toggleExpanded}
          allBouquets={bouquets}
        />
      ))}
    </div>
  );
}

// Helper component for selecting parent bouquet in forms
interface BouquetParentSelectProps {
  bouquets: Bouquet[];
  value?: number | null;
  onChange: (value: number | null) => void;
  excludeId?: number;
}

export function BouquetParentSelect({
  bouquets,
  value,
  onChange,
  excludeId,
}: BouquetParentSelectProps) {
  const tree = useMemo(() => buildBouquetTree(bouquets), [bouquets]);

  // Build flattened list with indentation
  const flattenWithIndent = (
    nodes: BouquetNode[],
    level: number = 0,
    result: { id: number; name: string; level: number }[] = []
  ) => {
    nodes.forEach((node) => {
      // Exclude the specified bouquet and its descendants
      if (excludeId && node.id === excludeId) return;

      result.push({
        id: node.id,
        name: node.name,
        level,
      });

      if (node.children && node.children.length > 0) {
        flattenWithIndent(node.children, level + 1, result);
      }
    });
    return result;
  };

  const options = useMemo(
    () => flattenWithIndent(tree),
    [tree, excludeId]
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
