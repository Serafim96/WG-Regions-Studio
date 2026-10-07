import type { Core, EdgeSingular } from 'cytoscape';

export type ModelExtent = { x1: number; y1: number; x2: number; y2: number };
export type ModelPoint = { x: number; y: number };

const FLOW_ARROW_LEFT = '←';
const FLOW_ARROW_RIGHT = '→';
const FLOW_VALUE_BLOCKED = '⮾';

function tokenizeFlowLabel(label: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < label.length) {
    const ch = label[i];
    if (ch === FLOW_ARROW_LEFT || ch === FLOW_ARROW_RIGHT || ch === FLOW_VALUE_BLOCKED) {
      tokens.push(ch);
      i += 1;
    } else {
      let j = i;
      while (
        j < label.length
        && label[j] !== FLOW_ARROW_LEFT
        && label[j] !== FLOW_ARROW_RIGHT
        && label[j] !== FLOW_VALUE_BLOCKED
      ) {
        j += 1;
      }
      const text = label.slice(i, j);
      if (text) tokens.push(text);
      i = j;
    }
  }
  return tokens;
}

/** True when Cytoscape autorotate would flip edge label (target left of source). */
export function flowLabelFlipped(source: ModelPoint, target: ModelPoint): boolean {
  return target.x - source.x < 0;
}

/** Mirror label tokens and swap arrow direction for autorotate flip. */
export function mirrorFlowLabel(label: string): string {
  return tokenizeFlowLabel(label)
    .reverse()
    .map((token) => {
      if (token === FLOW_ARROW_LEFT) return FLOW_ARROW_RIGHT;
      if (token === FLOW_ARROW_RIGHT) return FLOW_ARROW_LEFT;
      return token;
    })
    .join('');
}

/** True when the first flow arrow in the canonical label points forward (→ along reading order). */
export function flowLabelCanonForward(label: string): boolean {
  for (const token of tokenizeFlowLabel(label)) {
    if (token === FLOW_ARROW_RIGHT) return true;
    if (token === FLOW_ARROW_LEFT) return false;
  }
  return false;
}

/** Whether to mirror the canonical label for autorotate (dx-based flip). */
export function shouldMirrorFlowLabel(
  canonical: string,
  flipped: boolean,
  edgeKind: 'contains' | 'hierarchy',
): boolean {
  if (edgeKind === 'hierarchy') return flipped;
  return flowLabelCanonForward(canonical) ? !flipped : flipped;
}

function displayFlowLabel(edge: EdgeSingular, canonical: string): string {
  if (!canonical) return canonical;
  const isContains = edge.hasClass('flag-contains-labeled-edge');
  const isHierarchy = edge.hasClass('flag-hierarchy-labeled-edge');
  if (!isContains && !isHierarchy) return canonical;
  const src = edge.source().position();
  const tgt = edge.target().position();
  const flipped = flowLabelFlipped(src, tgt);
  const edgeKind = isContains ? 'contains' : 'hierarchy';
  return shouldMirrorFlowLabel(canonical, flipped, edgeKind)
    ? mirrorFlowLabel(canonical)
    : canonical;
}

export type IntersectEdgeLabelFields = {
  intersectCenterLabel: string;
  intersectSourceLabel: string;
  intersectTargetLabel: string;
};

function pointInExtent(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  return x >= x1 && x <= x2 && y >= y1 && y <= y2;
}

/** Model-space endpoints vs graph extent (same space as cy.extent()). */
export function intersectEdgeLabelPlacement(
  center: string,
  sourceEnd: string,
  targetEnd: string,
  source: ModelPoint,
  target: ModelPoint,
  extent: ModelExtent,
): IntersectEdgeLabelFields {
  const { x1, y1, x2, y2 } = extent;
  const srcIn = pointInExtent(source.x, source.y, x1, y1, x2, y2);
  const tgtIn = pointInExtent(target.x, target.y, x1, y1, x2, y2);

  if (srcIn && tgtIn) {
    return {
      intersectCenterLabel: center,
      intersectSourceLabel: sourceEnd,
      intersectTargetLabel: targetEnd,
    };
  }
  if (srcIn) {
    const srcText = [sourceEnd, center].filter(Boolean).join(' ').trim();
    return {
      intersectCenterLabel: '',
      intersectSourceLabel: srcText,
      intersectTargetLabel: '',
    };
  }
  if (tgtIn) {
    const tgtText = [targetEnd, center].filter(Boolean).join(' ').trim();
    return {
      intersectCenterLabel: '',
      intersectSourceLabel: '',
      intersectTargetLabel: tgtText,
    };
  }
  return {
    intersectCenterLabel: center,
    intersectSourceLabel: sourceEnd,
    intersectTargetLabel: targetEnd,
  };
}

export function intersectEdgeLabelFieldsChanged(
  edge: EdgeSingular,
  fields: IntersectEdgeLabelFields,
): boolean {
  return (
    String(edge.data('intersectCenterLabel') ?? '') !== fields.intersectCenterLabel
    || String(edge.data('intersectSourceLabel') ?? '') !== fields.intersectSourceLabel
    || String(edge.data('intersectTargetLabel') ?? '') !== fields.intersectTargetLabel
  );
}

function applyPlacementToEdge(
  edge: EdgeSingular,
  center: string,
  sourceEnd: string,
  targetEnd: string,
  extent: ModelExtent,
): void {
  const src = edge.source().position();
  const tgt = edge.target().position();
  const fields = intersectEdgeLabelPlacement(center, sourceEnd, targetEnd, src, tgt, extent);
  if (intersectEdgeLabelFieldsChanged(edge, fields)) {
    edge.data(fields);
  }
}

/** Place flag labels at center or visible endpoints depending on viewport. */
export function updateIntersectEdgeLabels(cy: Core): void {
  const ext = cy.extent();
  const extent = { x1: ext.x1, y1: ext.y1, x2: ext.x2, y2: ext.y2 };
  cy.batch(() => {
    cy.edges('.flag-intersect-labeled-edge, .flag-contains-labeled-edge, .flag-hierarchy-labeled-edge, .flag-conflict-resolved-edge, .flag-conflict-labeled-edge, .flag-conflict-resolved-labeled-edge').forEach((edge) => {
      const canonical = String(edge.data('intersectLabel') ?? edge.data('winnerLabel') ?? '');
      const center = displayFlowLabel(edge, canonical);
      const sourceEnd = String(edge.data('intersectSourcePct') ?? '');
      const targetEnd = String(edge.data('intersectTargetPct') ?? '');
      applyPlacementToEdge(edge, center, sourceEnd, targetEnd, extent);
    });
  });
}
