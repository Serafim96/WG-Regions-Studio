import type { ForestNode, Scheme } from '../types';

const H_SPACING = 140;
const V_SPACING = 110;

/**
 * Compact tree layout for visible nodes only.
 * Hidden subtrees do not reserve horizontal space.
 */
export function layoutVisibleForest(
  scheme: Scheme,
  hiddenNodes: Set<string>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  function layoutSubtree(node: ForestNode, x: number, y: number): number {
    if (hiddenNodes.has(node.id)) return 0;

    const visibleChildren = node.children.filter((c) => !hiddenNodes.has(c.id));

    if (visibleChildren.length === 0) {
      positions.set(node.id, { x, y });
      return 1;
    }

    let childX = x;
    const childWidths: number[] = [];
    for (const child of visibleChildren) {
      const w = layoutSubtree(child, childX, y + V_SPACING);
      childWidths.push(w);
      childX += w * H_SPACING;
    }

    const totalW = childWidths.reduce((a, b) => a + b, 0);
    const centerX = x + (totalW * H_SPACING - H_SPACING) / 2;
    positions.set(node.id, { x: centerX, y });
    return totalW;
  }

  let xOffset = 0;
  for (const root of scheme.forest.roots) {
    if (hiddenNodes.has(root.id)) continue;
    const w = layoutSubtree(root, xOffset, 0);
    xOffset += w * H_SPACING + H_SPACING;
  }

  return positions;
}

/** Auto-hide direct children of nodes with more than threshold children. */
export function computeDefaultHiddenNodes(scheme: Scheme, threshold = 10): Set<string> {
  const hidden = new Set<string>();

  function walk(node: ForestNode) {
    if (node.children.length > threshold) {
      for (const child of node.children) {
        hidden.add(child.id);
      }
    }
    node.children.forEach(walk);
  }

  scheme.forest.roots.forEach(walk);
  return hidden;
}
