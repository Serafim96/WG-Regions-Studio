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

const BASE_FONT = 11;
const CHAR_WIDTH_EM = 0.58;
const LINE_HEIGHT_EM = 1.25;

/** Node box and font scale together with depthScale. */
export function nodeLabelMetrics(
  label: string,
  depth: number,
  baseSize: number,
  depthScale: number,
): { width: number; height: number; fontSize: number; textMaxWidth: number } {
  const scale = Math.pow(depthScale, depth);
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
