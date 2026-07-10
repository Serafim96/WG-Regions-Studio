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

/**
 * Balanced tree layout: siblings spread horizontally (up to N per row),
 * extra rows wrap downward; generous vertical gaps between levels.
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

  return positions;
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
