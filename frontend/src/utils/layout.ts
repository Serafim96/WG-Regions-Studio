import type { ForestNode, Scheme } from '../types';

const H_PAD = 30;
const V_GAP = 40;
/** Vertical gap between parent and children block. */
const LEVEL_GAP = 76;
/** Gap between wrapped sibling rows under the same parent. */
const ROW_GAP = 48;
const ROOT_GAP = 40;
/** Max direct siblings in one horizontal row before wrapping. */
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

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function collectSubtreeIds(node: ForestNode, hiddenNodes: Set<string>, out: string[]): void {
  if (hiddenNodes.has(node.id)) return;
  out.push(node.id);
  for (const child of node.children) collectSubtreeIds(child, hiddenNodes, out);
}

/**
 * Balanced tree layout: siblings spread horizontally (up to N per row),
 * extra rows wrap downward; generous vertical gaps between levels.
 * Orphan forest roots (no parent, not «root») are then pulled toward regions
 * they share a spatial edge with, when those partners already have positions.
 */
export function layoutVisibleForest(
  scheme: Scheme,
  hiddenNodes: Set<string>,
  nodeDims: Map<string, NodeDimensions>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const defaultDim = { width: 80, height: 56 };

  function layoutSubtree(node: ForestNode, leftX: number, topY: number): SubtreeLayout {
    if (hiddenNodes.has(node.id)) return { height: 0, width: 0 };

    const dims = nodeDims.get(node.id) ?? defaultDim;
    const visibleChildren = node.children.filter((c) => !hiddenNodes.has(c.id));

    if (visibleChildren.length === 0) {
      positions.set(node.id, { x: leftX + dims.width / 2, y: topY + dims.height / 2 });
      return { height: dims.height + V_GAP, width: dims.width + H_PAD };
    }

    const childRows = chunk(visibleChildren, MAX_CHILDREN_PER_ROW);
    let rowTopY = topY + dims.height + LEVEL_GAP;
    let maxRowWidth = 0;
    let childBlockHeight = 0;

    for (let rowIndex = 0; rowIndex < childRows.length; rowIndex++) {
      const row = childRows[rowIndex];
      let xCursor = leftX;
      let rowHeight = 0;

      for (const child of row) {
        const sub = layoutSubtree(child, xCursor, rowTopY);
        rowHeight = Math.max(rowHeight, sub.height);
        xCursor += sub.width;
      }

      const rowWidth = xCursor - leftX;
      maxRowWidth = Math.max(maxRowWidth, rowWidth);
      childBlockHeight += rowHeight;
      if (rowIndex < childRows.length - 1) {
        childBlockHeight += ROW_GAP;
        rowTopY += rowHeight + ROW_GAP;
      } else {
        rowTopY += rowHeight;
      }
    }

    const parentCenterX = leftX + maxRowWidth / 2;
    positions.set(node.id, { x: parentCenterX, y: topY + dims.height / 2 });

    const totalWidth = Math.max(dims.width + H_PAD, maxRowWidth + H_PAD);
    const totalHeight = dims.height + LEVEL_GAP + childBlockHeight + V_GAP;
    return { height: totalHeight, width: totalWidth };
  }

  let xOffset = 0;
  for (const root of scheme.forest?.roots ?? []) {
    if (hiddenNodes.has(root.id)) continue;
    const sub = layoutSubtree(root, xOffset, 0);
    xOffset += sub.width + ROOT_GAP;
  }

  pullOrphanRootsNearSpatialPartners(scheme, hiddenNodes, positions, nodeDims);
  return positions;
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

  for (const root of scheme.forest?.roots ?? []) {
    if (hiddenNodes.has(root.id)) continue;
    const region = regionById.get(root.id);
    if (!region || region.parent || region.id === 'root') continue;

    const linked = partners.get(root.id);
    if (!linked || linked.size === 0) continue;

    const partnerPos: { x: number; y: number }[] = [];
    for (const id of linked) {
      // Prefer partners that are not themselves orphan roots being moved.
      const pos = positions.get(id);
      if (!pos) continue;
      const other = regionById.get(id);
      if (other && !other.parent && other.id !== 'root') continue;
      partnerPos.push(pos);
    }
    if (partnerPos.length === 0) {
      for (const id of linked) {
        const pos = positions.get(id);
        if (pos) partnerPos.push(pos);
      }
    }
    if (partnerPos.length === 0) continue;

    const avgX = partnerPos.reduce((s, p) => s + p.x, 0) / partnerPos.length;
    const avgY = partnerPos.reduce((s, p) => s + p.y, 0) / partnerPos.length;
    const current = positions.get(root.id);
    if (!current) continue;

    const dims = nodeDims.get(root.id) ?? defaultDim;
    const side = parkIndex % 2 === 0 ? 1 : -1;
    const row = Math.floor(parkIndex / 2);
    parkIndex += 1;
    const targetX = avgX + side * (dims.width / 2 + ORPHAN_NEAR_GAP + row * 24);
    const targetY = avgY + row * (dims.height * 0.35);
    const dx = targetX - current.x;
    const dy = targetY - current.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

    const ids: string[] = [];
    collectSubtreeIds(root, hiddenNodes, ids);
    for (const id of ids) {
      const pos = positions.get(id);
      if (!pos) continue;
      positions.set(id, { x: pos.x + dx, y: pos.y + dy });
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
