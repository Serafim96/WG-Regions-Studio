import type { Core } from 'cytoscape';
import type { NodeDimensions } from '../../utils/layout';

/** Shared zoom ceiling for focus/fit so 1-node and N-node centering look consistent. */
export const CAMERA_FOCUS_MAX_ZOOM = 1.35;
export const CAMERA_FOCUS_MIN_ZOOM = 0.25;
/** Padding used by expand-all / initial fit — also defines the zoom-out floor. */
export const FIT_PADDING = 40;
/** Keep this much of the graph inside the viewport when panning (not flush to the edge). */
export const PAN_EDGE_MARGIN = 432;
/** Keep the familiar wheel feel (do not globally lower — intermittent “speed mode” is separate). */
export const WHEEL_SENSITIVITY = 3.5;
export const CY_MAX_ZOOM = 12;
/** Per click on scheme +/- controls (was 1.2). */
export const BUTTON_ZOOM_FACTOR = 1.4;

export function zoomToFitSize(
  viewW: number,
  viewH: number,
  contentW: number,
  contentH: number,
  padding: number,
): number {
  const aw = Math.max(viewW - 2 * padding, 1);
  const ah = Math.max(viewH - 2 * padding, 1);
  return Math.min(aw / Math.max(contentW, 1), ah / Math.max(contentH, 1));
}

export function modelBBoxFromPositions(
  positions: Map<string, { x: number; y: number }>,
  nodeDims: Map<string, NodeDimensions>,
): { w: number; h: number } | null {
  if (positions.size === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const [id, pos] of positions) {
    const d = nodeDims.get(id) ?? { width: 80, height: 56 };
    x1 = Math.min(x1, pos.x - d.width / 2);
    y1 = Math.min(y1, pos.y - d.height / 2);
    x2 = Math.max(x2, pos.x + d.width / 2);
    y2 = Math.max(y2, pos.y + d.height / 2);
  }
  return { w: Math.max(x2 - x1, 1), h: Math.max(y2 - y1, 1) };
}

/** Keep the graph from being panned completely off-screen. */
export function constrainPan(cy: Core, margin = PAN_EDGE_MARGIN): void {
  const nodes = cy.nodes();
  if (nodes.empty()) return;
  const bb = nodes.boundingBox({ includeLabels: false });
  const zoom = cy.zoom();
  const pan = cy.pan();
  const cw = cy.width();
  const ch = cy.height();
  let panX = pan.x;
  let panY = pan.y;

  const rx1 = bb.x1 * zoom + panX;
  const ry1 = bb.y1 * zoom + panY;
  const rx2 = bb.x2 * zoom + panX;
  const ry2 = bb.y2 * zoom + panY;
  const graphW = bb.w * zoom;
  const graphH = bb.h * zoom;

  if (graphW <= cw - 2 * margin) {
    if (rx1 < margin) panX += margin - rx1;
    if (rx2 > cw - margin) panX -= rx2 - (cw - margin);
  } else {
    if (rx1 > margin) panX -= rx1 - margin;
    if (rx2 < cw - margin) panX += (cw - margin) - rx2;
  }

  if (graphH <= ch - 2 * margin) {
    if (ry1 < margin) panY += margin - ry1;
    if (ry2 > ch - margin) panY -= ry2 - (ch - margin);
  } else {
    if (ry1 > margin) panY -= ry1 - margin;
    if (ry2 < ch - margin) panY += (ch - margin) - ry2;
  }

  if (panX !== pan.x || panY !== pan.y) {
    cy.pan({ x: panX, y: panY });
  }
}

export function applyZoomFloor(cy: Core, expandFitZoom: number): void {
  const minZ = Math.min(Math.max(expandFitZoom, 0.01), CY_MAX_ZOOM);
  cy.minZoom(minZ);
  cy.maxZoom(CY_MAX_ZOOM);
  const z = cy.zoom();
  if (z < minZ) cy.zoom(minZ);
  else if (z > CY_MAX_ZOOM) cy.zoom(CY_MAX_ZOOM);
  constrainPan(cy);
}

export function centerNodeOnCy(cy: Core, regionId: string): boolean {
  const node = cy.getElementById(regionId);
  if (node.empty()) return false;

  cy.stop(true);
  cy.animate(
    {
      center: { eles: node },
      zoom: cy.zoom(),
    },
    {
      duration: 280,
      complete: () => constrainPan(cy),
    },
  );
  return true;
}

export function focusNodeOnCy(cy: Core, regionId: string): boolean {
  const node = cy.getElementById(regionId);
  if (node.empty()) return false;

  const nw = Number(node.data('width')) || 80;
  const nh = Number(node.data('height')) || 56;
  const pad = 160;
  const zoom = Math.min(
    cy.width() / (nw + pad),
    cy.height() / (nh + pad),
    CAMERA_FOCUS_MAX_ZOOM,
  );

  cy.stop(true);
  cy.animate(
    {
      center: { eles: node },
      zoom: Math.max(CAMERA_FOCUS_MIN_ZOOM, zoom),
    },
    {
      duration: 280,
      complete: () => constrainPan(cy),
    },
  );
  return true;
}

export function fitNodesOnCy(cy: Core, ids: string[]): boolean {
  let eles = cy.collection();
  for (const id of ids) {
    const node = cy.getElementById(id);
    if (node.nonempty()) eles = eles.union(node);
  }
  if (eles.empty()) return false;
  if (eles.length === 1) {
    return focusNodeOnCy(cy, eles[0].id());
  }
  const padding = eles.length <= 2 ? 72 : 40;
  const bb = eles.boundingBox({ includeLabels: false });
  const zoomRaw = Math.min(
    (cy.width() - 2 * padding) / Math.max(bb.w, 1),
    (cy.height() - 2 * padding) / Math.max(bb.h, 1),
  );
  const zoom = Math.max(
    cy.minZoom(),
    Math.min(zoomRaw, CAMERA_FOCUS_MAX_ZOOM),
  );

  cy.stop(true);
  cy.animate(
    {
      center: { eles },
      zoom,
    },
    {
      duration: 280,
      complete: () => constrainPan(cy),
    },
  );
  return true;
}
