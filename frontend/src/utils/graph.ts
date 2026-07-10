import type { ForestNode, SpatialEdge } from '../types';

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

/** Hide node and all descendants. */
export function collectSubtreeIds(node: ForestNode): string[] {
  return [node.id, ...collectDescendants(node)];
}

export function depthColor(depth: number): string {
  const hue = (depth * 137.5) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

export function nodeSize(depth: number, baseSize: number, depthScale: number): number {
  return baseSize * Math.pow(depthScale, depth);
}
