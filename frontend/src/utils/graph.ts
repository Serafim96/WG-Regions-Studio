import type { ForestNode, RegionData, Scheme, SpatialEdge } from '../types';

const EDGE_STRENGTH: Record<string, number> = { contains: 2, intersects: 1 };

/** Build map: nodeId → nearest visible ancestor (or self). */
export function buildVisibleAncestorMap(
  hidden: Set<string>,
  parentMap: Map<string, string | null>,
): Map<string, string> {
  const cache = new Map<string, string>();

  function resolve(id: string): string {
    if (cache.has(id)) return cache.get(id)!;
    if (!hidden.has(id)) {
      cache.set(id, id);
      return id;
    }
    const parent = parentMap.get(id);
    if (!parent) {
      cache.set(id, id);
      return id;
    }
    const result = resolve(parent);
    cache.set(id, result);
    return result;
  }

  for (const id of parentMap.keys()) resolve(id);
  return cache;
}

export function remapSpatialEdges(
  edges: SpatialEdge[],
  hidden: Set<string>,
  parentMap: Map<string, string | null>,
): SpatialEdge[] {
  const ancestors = buildVisibleAncestorMap(hidden, parentMap);
  const result = new Map<string, SpatialEdge>();

  for (const edge of edges) {
    let src = ancestors.get(edge.source) ?? edge.source;
    let tgt = ancestors.get(edge.target) ?? edge.target;
    if (hidden.has(src) || hidden.has(tgt) || src === tgt) continue;

    let out: SpatialEdge;
    if (edge.relation === 'contains') {
      out = { source: src, target: tgt, relation: 'contains' };
    } else {
      const [a, b] = [src, tgt].sort();
      out = { source: a, target: b, relation: 'intersects' };
    }

    const key = `${out.relation}:${out.source}:${out.target}`;
    const existing = result.get(key);
    if (!existing || EDGE_STRENGTH[out.relation] > EDGE_STRENGTH[existing.relation]) {
      result.set(key, out);
    }
  }

  return Array.from(result.values());
}

export function collectDescendants(node: ForestNode): string[] {
  const ids: string[] = [];
  for (const child of node.children) {
    ids.push(child.id, ...collectDescendants(child));
  }
  return ids;
}

export function depthColor(depth: number): string {
  const hue = (depth * 137.5) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

const BASE_FONT = 11;
const CHAR_WIDTH_EM = 0.58;
const LINE_HEIGHT_EM = 1.25;

/** Fixed per-level size decay (no UI setting). */
export const NODE_DEPTH_SCALE = 0.85;

/** Node box and font scale by hierarchy depth (scale = NODE_DEPTH_SCALE^depth). */
export function nodeLabelMetrics(
  label: string,
  hierarchyDepth: number,
  baseSize: number,
): { width: number; height: number; fontSize: number; textMaxWidth: number } {
  const scale = Math.pow(NODE_DEPTH_SCALE, hierarchyDepth);
  const fontSize = Math.max(7, BASE_FONT * scale);
  const lines = label.split('\n');
  const longest = Math.max(...lines.map((l) => l.length), 1);
  const textW = longest * fontSize * CHAR_WIDTH_EM;
  const textH = lines.length * fontSize * LINE_HEIGHT_EM;
  const minBox = baseSize * scale;
  const width = Math.max(minBox, textW + 20);
  const height = Math.max(minBox * 0.72, textH + 16);
  return { width, height, fontSize, textMaxWidth: width - 12 };
}

/** Absolute hierarchy depth from forest (0 = root without parent). */
export function buildHierarchyDepthMap(scheme: Scheme): Map<string, number> {
  const depths = new Map<string, number>();

  function walk(node: ForestNode) {
    depths.set(node.id, node.depth);
    for (const child of node.children) walk(child);
  }

  for (const root of scheme.forest?.roots ?? []) walk(root);
  return depths;
}

/** Depth among currently visible nodes (0 = visible root). */
export function buildVisibleDepthMap(scheme: Scheme, hiddenNodes: Set<string>): Map<string, number> {
  const depths = new Map<string, number>();

  function walk(node: ForestNode, depth: number) {
    if (hiddenNodes.has(node.id)) return;
    depths.set(node.id, depth);
    for (const child of node.children) {
      if (!hiddenNodes.has(child.id)) walk(child, depth + 1);
    }
  }

  for (const root of scheme.forest?.roots ?? []) {
    if (!hiddenNodes.has(root.id)) walk(root, 0);
  }
  return depths;
}

/** Count hidden descendants under each visible node (for collapsed indicator). */
export function buildHiddenDescendantCount(
  scheme: Scheme,
  hiddenNodes: Set<string>,
): Map<string, number> {
  const counts = new Map<string, number>();

  function subtreeSize(node: ForestNode): number {
    return 1 + node.children.reduce((sum, child) => sum + subtreeSize(child), 0);
  }

  function walk(node: ForestNode) {
    if (hiddenNodes.has(node.id)) return;

    let hiddenCount = 0;
    for (const child of node.children) {
      if (hiddenNodes.has(child.id)) {
        hiddenCount += subtreeSize(child);
      } else {
        walk(child);
      }
    }
    if (hiddenCount > 0) counts.set(node.id, hiddenCount);
  }

  for (const root of scheme.forest?.roots ?? []) walk(root);
  return counts;
}

/** Regions without parent except canonical root. */
export function findOrphanRegionIds(regions: RegionData[]): string[] {
  return regions.filter((r) => !r.parent && r.id !== 'root').map((r) => r.id);
}

export function getSpatialPartners(scheme: Scheme, regionId: string): string[] {
  const grouped = getSpatialRelationsGrouped(scheme, regionId);
  return [...grouped.intersects, ...grouped.containedIn, ...grouped.contains].sort();
}

export interface SpatialRelationsGrouped {
  intersects: string[];
  /** Regions that fully contain this one (outer). */
  containedIn: string[];
  /** Regions fully inside this one (inner). */
  contains: string[];
}

export function getSpatialRelationsGrouped(
  scheme: Scheme,
  regionId: string,
): SpatialRelationsGrouped {
  const intersects = new Set<string>();
  const containedIn = new Set<string>();
  const contains = new Set<string>();

  for (const edge of scheme.spatialEdges) {
    if (edge.relation === 'intersects') {
      if (edge.source === regionId) intersects.add(edge.target);
      else if (edge.target === regionId) intersects.add(edge.source);
    } else if (edge.relation === 'contains') {
      // source = inner region, target = outer (container)
      if (edge.source === regionId) containedIn.add(edge.target);
      else if (edge.target === regionId) contains.add(edge.source);
    }
  }

  const sort = (s: Set<string>) => Array.from(s).sort();
  return {
    intersects: sort(intersects),
    containedIn: sort(containedIn),
    contains: sort(contains),
  };
}

/** Unhide target and all ancestors so the node can be shown. */
export function revealPathToNode(
  targetId: string,
  hidden: Set<string>,
  parentMap: Map<string, string | null>,
): Set<string> {
  const next = new Set(hidden);
  let current: string | null | undefined = targetId;
  while (current) {
    next.delete(current);
    current = parentMap.get(current) ?? null;
  }
  return next;
}

export function buildParentMap(regions: RegionData[]): Map<string, string | null> {
  return new Map(regions.map((r) => [r.id, r.parent]));
}
