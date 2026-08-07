import type { ForestNode, Scheme } from '../types';
import { compareNatural } from './naturalSort';

const H_PAD = 30;
const V_GAP = 40;
/** Vertical gap between parent and children block. */
const LEVEL_GAP = 76;
/** Gap when stacking under / beside an earlier sibling box. */
const ROW_GAP = 48;
const ROOT_GAP = 40;
/** Max siblings in one left-to-right run before wrapping down. */
const MAX_CHILDREN_PER_ROW = 5;
/** Offset when parking an orphan root beside its spatial partners. */
const ORPHAN_NEAR_GAP = 90;

export interface NodeDimensions {
  width: number;
  height: number;
}

interface SubtreeLayout {
  height: number;
  width: number;
}

interface PlacedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function collectSubtreeIds(node: ForestNode, hiddenNodes: Set<string>, out: string[]): void {
  if (hiddenNodes.has(node.id)) return;
  out.push(node.id);
  for (const child of node.children) collectSubtreeIds(child, hiddenNodes, out);
}

/** Lowest Y where [x, x+w) clears already placed sibling boxes. */
function skylineTopY(
  placed: PlacedRect[],
  x: number,
  w: number,
  originY: number,
): number {
  let y = originY;
  for (const p of placed) {
    if (p.x < x + w && p.x + p.w > x) {
      y = Math.max(y, p.y + p.h + ROW_GAP);
    }
  }
  return y;
}

function countInYBand(placed: PlacedRect[], y: number): number {
  return placed.filter((p) => Math.abs(p.y - y) <= 1).length;
}

function rightEdgeInYBand(placed: PlacedRect[], y: number, fallbackX: number): number {
  let right = fallbackX;
  for (const p of placed) {
    if (Math.abs(p.y - y) <= 1) right = Math.max(right, p.x + p.w);
  }
  return right;
}

/**
 * Pick a slot for the next sibling box.
 * Prefer continuing the current L→R run (compact columns like metro tunnel).
 * Otherwise choose the lowest skyline among wrap / side pockets / right of tall boxes —
 * without extending any Y-band past MAX_CHILDREN_PER_ROW.
 */
function findSiblingSlot(
  placed: PlacedRect[],
  width: number,
  originX: number,
  originY: number,
  xCursor: number,
  itemsInRow: number,
): { x: number; y: number } {
  type Cand = { x: number; y: number };
  const cands: Cand[] = [];

  if (itemsInRow < MAX_CHILDREN_PER_ROW) {
    cands.push({
      x: xCursor,
      y: skylineTopY(placed, xCursor, width, originY),
    });
  }

  // New row / left pocket
  cands.push({
    x: originX,
    y: skylineTopY(placed, originX, width, originY),
  });

  // Pockets immediately to the right of each placed box (beside tall neighbours).
  for (const p of placed) {
    const x = p.x + p.w;
    const y = skylineTopY(placed, x, width, originY);
    // Band already has a full L→R run — do not keep growing it into empty space.
    if (countInYBand(placed, y) >= MAX_CHILDREN_PER_ROW) continue;
    cands.push({ x, y });
  }

  cands.sort((a, b) => a.y - b.y || a.x - b.x);
  return cands[0];
}

function packMeasuredSubtrees(
  measured: { width: number; height: number; local: Map<string, { x: number; y: number }> }[],
  originX: number,
  originY: number,
  out: Map<string, { x: number; y: number }>,
): { width: number; height: number } {
  const placed: PlacedRect[] = [];
  const origins: { x: number; y: number }[] = [];

  let xCursor = originX;
  let itemsInRow = 0;

  for (const m of measured) {
    if (itemsInRow >= MAX_CHILDREN_PER_ROW) {
      xCursor = originX;
      itemsInRow = 0;
    }

    const slot = findSiblingSlot(placed, m.width, originX, originY, xCursor, itemsInRow);
    placed.push({ x: slot.x, y: slot.y, w: m.width, h: m.height });
    origins.push({ x: slot.x, y: slot.y });
    // Recount from geometry so gap picks cannot reset the row counter to 1.
    itemsInRow = countInYBand(placed, slot.y);
    xCursor = rightEdgeInYBand(placed, slot.y, originX);
  }

  for (let i = 0; i < measured.length; i++) {
    const { local } = measured[i];
    const origin = origins[i];
    for (const [id, pos] of local) {
      out.set(id, { x: pos.x + origin.x, y: pos.y + origin.y });
    }
  }

  let maxRight = originX;
  let maxBottom = originY;
  for (const p of placed) {
    maxRight = Math.max(maxRight, p.x + p.w);
    maxBottom = Math.max(maxBottom, p.y + p.h);
  }
  return {
    width: Math.max(0, maxRight - originX),
    height: Math.max(0, maxBottom - originY),
  };
}

/**
 * Hierarchical layout, natural sibling order.
 * Children form compact rows of ~5 (tall columns like metro_express_tunnel).
 * Wide branches that cannot fit in the left pocket park beside/under other boxes
 * at the lowest free skyline (not necessarily after the tallest neighbour).
 */
export function layoutVisibleForest(
  scheme: Scheme,
  hiddenNodes: Set<string>,
  nodeDims: Map<string, NodeDimensions>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const defaultDim = { width: 80, height: 56 };

  function layoutSubtreeInto(
    node: ForestNode,
    leftX: number,
    topY: number,
    out: Map<string, { x: number; y: number }>,
  ): SubtreeLayout {
    if (hiddenNodes.has(node.id)) return { height: 0, width: 0 };

    const dims = nodeDims.get(node.id) ?? defaultDim;
    const visibleChildren = node.children
      .filter((c) => !hiddenNodes.has(c.id))
      .sort((a, b) => compareNatural(a.id, b.id));

    if (visibleChildren.length === 0) {
      out.set(node.id, { x: leftX + dims.width / 2, y: topY + dims.height / 2 });
      return { height: dims.height + V_GAP, width: dims.width + H_PAD };
    }

    const measured: {
      width: number;
      height: number;
      local: Map<string, { x: number; y: number }>;
    }[] = [];

    for (const child of visibleChildren) {
      const local = new Map<string, { x: number; y: number }>();
      const size = layoutSubtreeInto(child, 0, 0, local);
      measured.push({ width: size.width, height: size.height, local });
    }

    const childOriginY = topY + dims.height + LEVEL_GAP;
    const packed = packMeasuredSubtrees(measured, leftX, childOriginY, out);

    const contentWidth = Math.max(dims.width + H_PAD, packed.width + H_PAD);
    const contentHeight = dims.height + LEVEL_GAP + packed.height + V_GAP;
    out.set(node.id, {
      x: leftX + contentWidth / 2,
      y: topY + dims.height / 2,
    });

    return { height: contentHeight, width: contentWidth };
  }

  const roots = [...(scheme.forest?.roots ?? [])]
    .filter((r) => !hiddenNodes.has(r.id))
    .sort((a, b) => compareNatural(a.id, b.id));

  const measuredRoots: {
    width: number;
    height: number;
    local: Map<string, { x: number; y: number }>;
  }[] = [];

  for (const root of roots) {
    const local = new Map<string, { x: number; y: number }>();
    const size = layoutSubtreeInto(root, 0, 0, local);
    measuredRoots.push({ width: size.width, height: size.height, local });
  }

  if (measuredRoots.length === 1) {
    for (const [id, pos] of measuredRoots[0].local) positions.set(id, pos);
  } else if (measuredRoots.length > 1) {
    packMeasuredSubtrees(measuredRoots, 0, 0, positions);
  }

  void ROOT_GAP;

  pullOrphanRootsNearSpatialPartners(scheme, hiddenNodes, positions, nodeDims);
  separateOverlappingNodes(positions, nodeDims);
  return positions;
}

function nodeAabb(
  id: string,
  positions: Map<string, { x: number; y: number }>,
  nodeDims: Map<string, NodeDimensions>,
  defaultDim: NodeDimensions,
  gap = 0,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const pos = positions.get(id);
  if (!pos) return null;
  const d = nodeDims.get(id) ?? defaultDim;
  const hw = d.width / 2 + gap;
  const hh = d.height / 2 + gap;
  return { x0: pos.x - hw, y0: pos.y - hh, x1: pos.x + hw, y1: pos.y + hh };
}

function aabbsOverlap(
  a: { x0: number; y0: number; x1: number; y1: number },
  b: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1;
}

/** After label-driven growth, push overlapping nodes apart horizontally. */
function separateOverlappingNodes(
  positions: Map<string, { x: number; y: number }>,
  nodeDims: Map<string, NodeDimensions>,
  gap = 16,
): void {
  const ids = [...positions.keys()];
  const defaultDim = { width: 80, height: 56 };
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const aId = ids[i];
        const bId = ids[j];
        const aBox = nodeAabb(aId, positions, nodeDims, defaultDim, gap / 2);
        const bBox = nodeAabb(bId, positions, nodeDims, defaultDim, gap / 2);
        if (!aBox || !bBox || !aabbsOverlap(aBox, bBox)) continue;

        const pa = positions.get(aId)!;
        const pb = positions.get(bId)!;
        const overlapX = Math.min(aBox.x1, bBox.x1) - Math.max(aBox.x0, bBox.x0);
        if (overlapX <= 0) continue;
        const push = overlapX / 2 + 1;
        if (pa.x <= pb.x) {
          positions.set(aId, { x: pa.x - push, y: pa.y });
          positions.set(bId, { x: pb.x + push, y: pb.y });
        } else {
          positions.set(aId, { x: pa.x + push, y: pa.y });
          positions.set(bId, { x: pb.x - push, y: pb.y });
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function pullOrphanRootsNearSpatialPartners(
  scheme: Scheme,
  hiddenNodes: Set<string>,
  positions: Map<string, { x: number; y: number }>,
  nodeDims: Map<string, NodeDimensions>,
): void {
  const regionById = new Map(scheme.regions.map((r) => [r.id, r]));
  const partners = new Map<string, Set<string>>();
  for (const edge of scheme.spatialEdges) {
    if (!partners.has(edge.source)) partners.set(edge.source, new Set());
    if (!partners.has(edge.target)) partners.set(edge.target, new Set());
    partners.get(edge.source)!.add(edge.target);
    partners.get(edge.target)!.add(edge.source);
  }

  const defaultDim = { width: 80, height: 56 };
  let parkIndex = 0;

  const roots = [...(scheme.forest?.roots ?? [])].sort((a, b) => compareNatural(a.id, b.id));
  for (const root of roots) {
    if (hiddenNodes.has(root.id)) continue;
    const region = regionById.get(root.id);
    if (!region || region.parent || region.id === 'root') continue;

    const linked = partners.get(root.id);
    if (!linked || linked.size === 0) continue;

    const partnerEntries: { id: string; x: number; y: number }[] = [];
    for (const id of linked) {
      const pos = positions.get(id);
      if (!pos) continue;
      const other = regionById.get(id);
      if (other && !other.parent && other.id !== 'root') continue;
      partnerEntries.push({ id, ...pos });
    }
    if (partnerEntries.length === 0) {
      for (const id of linked) {
        const pos = positions.get(id);
        if (pos) partnerEntries.push({ id, ...pos });
      }
    }
    if (partnerEntries.length === 0) continue;

    const avgX = partnerEntries.reduce((s, p) => s + p.x, 0) / partnerEntries.length;
    const avgY = partnerEntries.reduce((s, p) => s + p.y, 0) / partnerEntries.length;
    const current = positions.get(root.id);
    if (!current) continue;

    const dims = nodeDims.get(root.id) ?? defaultDim;
    const maxPartnerHalfW = Math.max(
      ...partnerEntries.map((p) => (nodeDims.get(p.id) ?? defaultDim).width / 2),
      defaultDim.width / 2,
    );
    const side = parkIndex % 2 === 0 ? 1 : -1;
    const row = Math.floor(parkIndex / 2);
    parkIndex += 1;

    const subtreeIds: string[] = [];
    collectSubtreeIds(root, hiddenNodes, subtreeIds);
    const subtreeSet = new Set(subtreeIds);

    let extra = 0;
    for (let guard = 0; guard < 24; guard++) {
      const targetX =
        avgX + side * (dims.width / 2 + maxPartnerHalfW + ORPHAN_NEAR_GAP + row * 24 + extra);
      const targetY = avgY + row * (dims.height * 0.35);
      const dx = targetX - current.x;
      const dy = targetY - current.y;

      const trial = new Map(positions);
      for (const id of subtreeIds) {
        const pos = trial.get(id);
        if (!pos) continue;
        trial.set(id, { x: pos.x + dx, y: pos.y + dy });
      }

      let hits = false;
      for (const id of subtreeIds) {
        const box = nodeAabb(id, trial, nodeDims, defaultDim, 8);
        if (!box) continue;
        for (const [otherId] of trial) {
          if (subtreeSet.has(otherId)) continue;
          const other = nodeAabb(otherId, trial, nodeDims, defaultDim, 8);
          if (other && aabbsOverlap(box, other)) {
            hits = true;
            break;
          }
        }
        if (hits) break;
      }
      if (!hits || guard === 23) {
        if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
          for (const id of subtreeIds) {
            const pos = positions.get(id);
            if (!pos) continue;
            positions.set(id, { x: pos.x + dx, y: pos.y + dy });
          }
        }
        break;
      }
      extra += 28;
    }
  }
}

/** Auto-hide entire subtrees under nodes with more than threshold direct children. */
export function computeDefaultHiddenNodes(scheme: Scheme, threshold = 40): Set<string> {
  const hidden = new Set<string>();

  function hideSubtree(node: ForestNode) {
    hidden.add(node.id);
    node.children.forEach(hideSubtree);
  }

  function walk(node: ForestNode) {
    if (node.children.length > threshold) {
      node.children.forEach(hideSubtree);
    }
    node.children.forEach(walk);
  }

  scheme.forest?.roots?.forEach(walk);
  return hidden;
}

/** Hide every node except forest roots. */
export function computeCollapseAllHidden(scheme: Scheme): Set<string> {
  const hidden = new Set<string>();

  function hideDescendants(node: ForestNode) {
    for (const child of node.children) {
      hidden.add(child.id);
      hideDescendants(child);
    }
  }

  for (const root of scheme.forest?.roots ?? []) {
    hideDescendants(root);
  }
  return hidden;
}

/** All region ids except roots. */
export function computeExpandAllHidden(): Set<string> {
  return new Set();
}
