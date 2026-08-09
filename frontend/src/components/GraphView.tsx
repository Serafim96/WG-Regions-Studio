import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import cytoscape, { Core } from 'cytoscape';
import type { Scheme } from '../types';
import { buildStylesheet, regionNodeShape } from '../cytoscape/styles';
import {
  buildHiddenDescendantCount,
  buildHierarchyDepthMap,
  buildParentMap,
  depthColor,
  nodeLabelMetrics,
  remapSpatialEdges,
} from '../utils/graph';
import {
  DEFAULT_LAYOUT_SPACING,
  FLAG_HIGHLIGHT_LAYOUT_SPACING,
  computeExpandAllHidden,
  layoutVisibleForest,
  type NodeDimensions,
} from '../utils/layout';
import { MAX_VALUE_LABEL_LEN } from '../utils/flagTree';
import { isTemporaryRegion } from '../utils/regions';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';

export interface GraphViewHandle {
  focusNode: (regionId: string) => boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  resize: () => void;
}

interface GraphViewProps {
  scheme: Scheme;
  hiddenNodes: Set<string>;
  orphanIds: Set<string>;
  conflictRegionIds: Set<string>;
  /** When set, dim nodes outside the flag assignment path. */
  flagHighlight: {
    definingIds: Set<string>;
    brightIds: Set<string>;
    brightEdgeKeys: Set<string>;
    containedNoInheritIds?: Set<string>;
    containedNoInheritEdgeKeys?: Set<string>;
    intersectPartialIds?: Set<string>;
    intersectPartialEdgeKeys?: Set<string>;
    conflictIds?: Set<string>;
    conflictEdgeKeys?: Set<string>;
    valueLabels?: Map<string, { text: string; defining: boolean }>;
  } | null;
  /** Dim nodes not in this set (problem mode / subtree highlight). Ignored while flagHighlight is active. */
  attentionBrightIds: Set<string> | null;
  /** When set with attentionBrightIds, only these edges stay bright (`source->target` or `relation-a-b`). */
  attentionBrightEdgeKeys: Set<string> | null;
  selectedId: string | null;
  baseSize: number;
  focusRequest: { id: string; seq: number } | null;
  centerRequest: { id: string; seq: number } | null;
  /** Fit camera to the given node ids (subtree highlight). */
  fitRequest: { ids: string[]; seq: number } | null;
  /** When seq changes, fit the whole scheme (used after «Build scheme»). */
  viewResetRequest: { seq: number } | null;
  /** When seq changes, recompute node positions (align / re-layout). */
  layoutRequest: { seq: number } | null;
  locked: boolean;
  subtreeHighlightActive: boolean;
  /** Which edge families to draw on the scheme (independent toggles). */
  edgeDisplayFilters: EdgeDisplayFilters;
  onNodeSelect: (regionId: string) => void;
  onNodeOpen: (regionId: string) => void;
  onBackgroundTap: () => void;
  onCopyName: (regionId: string) => void;
  onRename?: (regionId: string) => void;
  onAddManual: () => void;
  onAddDescendant: (regionId: string) => void;
  onDeleteManual: (regionId: string) => void;
  onOpenFlagsManager: (regionId: string) => void;
  onCollapseChildren: (regionId: string) => void;
  onExpandChildren: (regionId: string) => void;
  onCollapseRecursive: (regionId: string) => void;
  onExpandRecursive: (regionId: string) => void;
  onHighlightSubtree: (regionId: string, mode: HighlightBranchMode) => void;
  onClearSubtreeHighlight: () => void;
}

export type HighlightBranchMode =
  | 'children'
  | 'full'
  | 'containment-all'
  | 'containment-children'
  | 'containment-parents'
  | 'intersects';

export type EdgeDisplayFilters = {
  intersects: boolean;
  contains: boolean;
  hierarchy: boolean;
};

export const DEFAULT_EDGE_DISPLAY_FILTERS: EdgeDisplayFilters = {
  intersects: true,
  contains: true,
  hierarchy: true,
};

function edgeAllowedByDisplayFilters(
  kind: 'hierarchy' | 'intersects' | 'contains',
  filters: EdgeDisplayFilters,
): boolean {
  return filters[kind];
}

interface ContextMenuState {
  x: number;
  y: number;
  /** Absent when the menu was opened on empty canvas. */
  nodeId?: string;
}

function applyRegionNodeStyles(cy: Core): void {
  cy.nodes().forEach((node) => {
    const shape = node.data('nodeShape') as string;
    if (shape === 'rectangle' || shape === 'ellipse') {
      node.style('shape', shape);
    }
  });
}

const FLAG_NODE_CLASSES = [
  'flag-dim',
  'flag-path',
  'flag-define',
  'flag-contained-no-inherit',
  'flag-intersect-partial',
  'flag-conflict-pair',
  'flag-value-define',
  'flag-value-inherit',
  'flag-value-no-inherit',
  'flag-value-intersect',
] as const;

const FLAG_EDGE_CLASSES = [
  'flag-dim-edge',
  'flag-path-edge',
  'flag-conflict-edge',
  'flag-no-inherit-edge',
  'flag-intersect-edge',
] as const;

type FlagHighlightState = GraphViewProps['flagHighlight'];

function flagValueSuffix(
  valueInfo: { text: string; defining: boolean } | undefined,
): string {
  if (!valueInfo) return '';
  if (valueInfo.text.startsWith('∈') || valueInfo.text.startsWith('≈')) {
    return `\n${valueInfo.text}`;
  }
  return valueInfo.defining ? `\n◆ ${valueInfo.text}` : `\n◇ ${valueInfo.text}`;
}

function sizedManualNode(
  metrics: { width: number; height: number },
  manual: boolean,
  regionType: string,
): { width: number; height: number } {
  let { width, height } = metrics;
  if (manual && regionType !== 'global') {
    width = Math.max(metrics.width, metrics.height * 1.4);
    height = Math.max(metrics.height * 0.72, metrics.width * 0.5);
    width = Math.max(width, metrics.width);
    height = Math.max(height, metrics.height);
  }
  return { width, height };
}

/** Worst-case value line so flag-mode layout does not grow when inheritance turns on. */
function reservedFlagValueSuffix(): string {
  return `\n◆ ${'W'.repeat(MAX_VALUE_LABEL_LEN)}`;
}

function nodeBoxForLabel(
  baseLabel: string,
  depth: number,
  baseSize: number,
  manual: boolean,
  regionType: string,
  reserveFlagValue: boolean,
): { width: number; height: number; fontSize: number; textMaxWidth: number } {
  const label = reserveFlagValue
    ? `${baseLabel}${reservedFlagValueSuffix()}`
    : baseLabel;
  const metrics = nodeLabelMetrics(label, depth, baseSize, {
    denseText: reserveFlagValue,
    valueEmphasis: reserveFlagValue,
  });
  const sized = sizedManualNode(metrics, manual, regionType);
  return {
    ...sized,
    fontSize: metrics.fontSize,
    textMaxWidth: Math.max(metrics.textMaxWidth, sized.width - 14),
  };
}

/**
 * Apply / clear flag & attention highlight classes and value captions in place.
 * Does not move nodes — layout stays stable while toggling highlight layers.
 */
function applyHighlightOverlay(
  cy: Core,
  flagHighlight: FlagHighlightState,
  attentionBrightIds: Set<string> | null,
  attentionBrightEdgeKeys: Set<string> | null,
  baseSize: number,
): void {
  const flagNodeClassStr = FLAG_NODE_CLASSES.join(' ');
  const flagEdgeClassStr = FLAG_EDGE_CLASSES.join(' ');

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      node.removeClass(flagNodeClassStr);
      const regionId = node.id();
      const baseLabel = String(node.data('baseLabel') ?? node.data('label') ?? '');
      const depth = Number(node.data('depth')) || 0;
      const regionType = String(node.data('regionType') ?? '');
      const manual = Boolean(node.data('isManual'));
      const valueInfo = flagHighlight?.valueLabels?.get(regionId);
      const label = `${baseLabel}${flagValueSuffix(valueInfo)}`;
      const layoutWidth = Number(node.data('layoutWidth'));
      const layoutHeight = Number(node.data('layoutHeight'));
      // While flag highlight is on, keep the reserved box so toggling layers
      // does not resize/overlap nodes. Outside flag mode, size to content.
      let width: number;
      let height: number;
      let fontSize: number;
      let textMaxWidth: number;
      if (flagHighlight && layoutWidth > 0 && layoutHeight > 0) {
        width = layoutWidth;
        height = layoutHeight;
        fontSize = Number(node.data('layoutFontSize')) || Number(node.data('baseFontSize')) || 12;
        textMaxWidth = Number(node.data('layoutTextMaxWidth'))
          || Math.max(8, width - 14);
      } else {
        const metrics = nodeLabelMetrics(label, depth, baseSize, {
          denseText: Boolean(valueInfo),
          valueEmphasis: Boolean(valueInfo),
        });
        const sized = sizedManualNode(metrics, manual, regionType);
        width = sized.width;
        height = sized.height;
        fontSize = metrics.fontSize;
        textMaxWidth = Math.max(metrics.textMaxWidth, width - 14);
      }

      node.data({
        label,
        width,
        height,
        fontSize,
        textMaxWidth,
      });

      if (flagHighlight) {
        if (flagHighlight.conflictIds?.has(regionId)) node.addClass('flag-conflict-pair');
        if (flagHighlight.definingIds.has(regionId)) node.addClass('flag-define');
        else if (flagHighlight.brightIds.has(regionId)) node.addClass('flag-path');
        else if (flagHighlight.containedNoInheritIds?.has(regionId)) {
          node.addClass('flag-contained-no-inherit');
        } else if (flagHighlight.intersectPartialIds?.has(regionId)) {
          node.addClass('flag-intersect-partial');
        } else if (!flagHighlight.conflictIds?.has(regionId)) {
          node.addClass('flag-dim');
        }
        if (valueInfo?.defining) node.addClass('flag-value-define');
        else if (valueInfo) {
          if (flagHighlight.containedNoInheritIds?.has(regionId)) {
            node.addClass('flag-value-no-inherit');
          } else if (flagHighlight.intersectPartialIds?.has(regionId)) {
            node.addClass('flag-value-intersect');
          } else {
            node.addClass('flag-value-inherit');
          }
        }
      } else if (attentionBrightIds) {
        if (!attentionBrightIds.has(regionId)) node.addClass('flag-dim');
      }
    });

    cy.edges().forEach((edge) => {
      edge.removeClass(flagEdgeClassStr);
      const source = edge.data('source') as string;
      const target = edge.data('target') as string;
      const isHierarchy = edge.hasClass('hierarchy');
      const isContains = edge.hasClass('contains');
      const isIntersects = edge.hasClass('intersects');

      if (flagHighlight) {
        if (isHierarchy) {
          const edgeKey = `${source}->${target}`;
          if (flagHighlight.brightEdgeKeys.has(edgeKey)) edge.addClass('flag-path-edge');
          else edge.addClass('flag-dim-edge');
        } else if (isContains || isIntersects) {
          const relation = isContains ? 'contains' : 'intersects';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          if (
            flagHighlight.conflictEdgeKeys?.has(edgeKey)
            || flagHighlight.conflictEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-conflict-edge');
          } else if (
            flagHighlight.containedNoInheritEdgeKeys?.has(edgeKey)
            || flagHighlight.containedNoInheritEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-no-inherit-edge');
          } else if (
            flagHighlight.intersectPartialEdgeKeys?.has(edgeKey)
            || flagHighlight.intersectPartialEdgeKeys?.has(edgeKeyAlt)
          ) {
            edge.addClass('flag-intersect-edge');
          } else {
            edge.addClass('flag-dim-edge');
          }
        }
      } else if (attentionBrightIds) {
        if (isHierarchy) {
          const edgeKey = `${source}->${target}`;
          const bothBright = attentionBrightIds.has(source) && attentionBrightIds.has(target);
          if (!bothBright) {
            edge.addClass('flag-dim-edge');
          } else if (attentionBrightEdgeKeys && !attentionBrightEdgeKeys.has(edgeKey)) {
            edge.addClass('flag-dim-edge');
          }
        } else if (isContains || isIntersects) {
          const relation = isContains ? 'contains' : 'intersects';
          const edgeKey = `${relation}-${source}-${target}`;
          const edgeKeyAlt = `${relation}-${target}-${source}`;
          if (attentionBrightEdgeKeys) {
            if (
              !attentionBrightEdgeKeys.has(edgeKey)
              && !attentionBrightEdgeKeys.has(edgeKeyAlt)
            ) {
              edge.addClass('flag-dim-edge');
            }
          } else if (
            !attentionBrightIds.has(source)
            || !attentionBrightIds.has(target)
          ) {
            edge.addClass('flag-dim-edge');
          }
        }
      }
    });
  });

  applyRegionNodeStyles(cy);
}

/** Shared zoom ceiling for focus/fit so 1-node and N-node centering look consistent. */
const CAMERA_FOCUS_MAX_ZOOM = 1.35;
const CAMERA_FOCUS_MIN_ZOOM = 0.25;
/** Padding used by expand-all / initial fit — also defines the zoom-out floor. */
const FIT_PADDING = 40;
/** Keep this much of the graph inside the viewport when panning (not flush to the edge). */
const PAN_EDGE_MARGIN = 360;
/** Keep the familiar wheel feel (do not globally lower — intermittent “speed mode” is separate). */
const WHEEL_SENSITIVITY = 3.5;
const CY_MAX_ZOOM = 12;
/** Per click on scheme +/- controls (was 1.2). */
const BUTTON_ZOOM_FACTOR = 1.4;

function zoomToFitSize(
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

function modelBBoxFromPositions(
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
function constrainPan(cy: Core, margin = PAN_EDGE_MARGIN): void {
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

function applyZoomFloor(cy: Core, expandFitZoom: number): void {
  const minZ = Math.min(Math.max(expandFitZoom, 0.01), CY_MAX_ZOOM);
  cy.minZoom(minZ);
  cy.maxZoom(CY_MAX_ZOOM);
  const z = cy.zoom();
  if (z < minZ) cy.zoom(minZ);
  else if (z > CY_MAX_ZOOM) cy.zoom(CY_MAX_ZOOM);
  constrainPan(cy);
}

function centerNodeOnCy(cy: Core, regionId: string): boolean {
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

function focusNodeOnCy(cy: Core, regionId: string): boolean {
  const node = cy.getElementById(regionId);
  if (node.empty()) return false;

  const nw = Number(node.data('width')) || 80;
  const nh = Number(node.data('height')) || 56;
  const pad = 160;
  // Cap zoom so a lone region does not fill the whole viewport.
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

function fitNodesOnCy(cy: Core, ids: string[]): boolean {
  let eles = cy.collection();
  for (const id of ids) {
    const node = cy.getElementById(id);
    if (node.nonempty()) eles = eles.union(node);
  }
  if (eles.empty()) return false;
  if (eles.length === 1) {
    return focusNodeOnCy(cy, eles[0].id());
  }
  // Cap zoom-in like single-node focus, but allow zooming out below
  // CAMERA_FOCUS_MIN_ZOOM so distant nodes (e.g. opposite ends of the scheme)
  // still fit on screen.
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

export const GraphView = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
  {
    scheme,
    hiddenNodes,
    orphanIds,
    conflictRegionIds,
    flagHighlight,
    attentionBrightIds,
    attentionBrightEdgeKeys,
    selectedId,
    baseSize,
    focusRequest,
    centerRequest,
    fitRequest,
    viewResetRequest,
    layoutRequest,
    locked,
    subtreeHighlightActive,
    edgeDisplayFilters,
    onNodeSelect,
    onNodeOpen,
    onBackgroundTap,
    onCopyName,
    onRename,
    onAddManual,
    onAddDescendant,
    onDeleteManual,
    onOpenFlagsManager,
    onCollapseChildren,
    onExpandChildren,
    onCollapseRecursive,
    onExpandRecursive,
    onHighlightSubtree,
    onClearSubtreeHighlight,
  },
  ref,
) {
  const { t, locale } = useI18n();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const fitOnNextLayout = useRef(true);
  const viewStateRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const flagHighlightRef = useRef(flagHighlight);
  flagHighlightRef.current = flagHighlight;
  const attentionBrightIdsRef = useRef(attentionBrightIds);
  attentionBrightIdsRef.current = attentionBrightIds;
  const attentionBrightEdgeKeysRef = useRef(attentionBrightEdgeKeys);
  attentionBrightEdgeKeysRef.current = attentionBrightEdgeKeys;
  const centerRequestRef = useRef(centerRequest);
  centerRequestRef.current = centerRequest;
  const focusRequestRef = useRef(focusRequest);
  focusRequestRef.current = focusRequest;
  const fitRequestRef = useRef(fitRequest);
  fitRequestRef.current = fitRequest;
  // Expand-all content size in model coords — zoom-out floor tracks viewport size.
  const expandContentSizeRef = useRef<{ w: number; h: number } | null>(null);
  const constrainingPanRef = useRef(false);
  // Apply each focus/center/fit seq only once across rebuilds (avoids stale search focus).
  const lastAppliedFocusSeqRef = useRef(0);
  const lastAppliedCenterSeqRef = useRef(0);
  const lastAppliedFitSeqRef = useRef(0);
  const lastViewResetSeqRef = useRef(0);
  const lastLayoutSeqRef = useRef(0);
  const flagLayoutActive = Boolean(flagHighlight);

  useEffect(() => {
    if (!viewResetRequest) return;
    if (viewResetRequest.seq === lastViewResetSeqRef.current) return;
    lastViewResetSeqRef.current = viewResetRequest.seq;
    fitOnNextLayout.current = true;
    viewStateRef.current = null;
  }, [viewResetRequest]);

  useEffect(() => {
    if (!layoutRequest) return;
    if (layoutRequest.seq === lastLayoutSeqRef.current) return;
    lastLayoutSeqRef.current = layoutRequest.seq;
    // Force a rebuild with fresh layout positions; keep camera roughly.
    viewStateRef.current = cyRef.current
      ? { zoom: cyRef.current.zoom(), pan: { ...cyRef.current.pan() } }
      : viewStateRef.current;
    fitOnNextLayout.current = false;
  }, [layoutRequest]);

  useImperativeHandle(ref, () => ({
    focusNode(regionId: string) {
      const cy = cyRef.current;
      if (!cy) return false;
      return focusNodeOnCy(cy, regionId);
    },
    zoomIn() {
      const cy = cyRef.current;
      if (!cy) return;
      const next = Math.min(cy.zoom() * BUTTON_ZOOM_FACTOR, cy.maxZoom());
      cy.zoom({
        level: next,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
      constrainPan(cy);
    },
    zoomOut() {
      const cy = cyRef.current;
      if (!cy) return;
      const next = Math.max(cy.zoom() / BUTTON_ZOOM_FACTOR, cy.minZoom());
      cy.zoom({
        level: next,
        renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
      });
      constrainPan(cy);
    },
    resize() {
      const cy = cyRef.current;
      if (!cy) return;
      cy.resize();
      const content = expandContentSizeRef.current;
      if (content && cy.width() > 0 && cy.height() > 0) {
        const fitZ = zoomToFitSize(cy.width(), cy.height(), content.w, content.h, FIT_PADDING);
        applyZoomFloor(cy, fitZ);
      } else {
        constrainPan(cy);
      }
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.resize();
      const content = expandContentSizeRef.current;
      if (content && cy.width() > 0 && cy.height() > 0) {
        const fitZ = zoomToFitSize(cy.width(), cy.height(), content.w, content.h, FIT_PADDING);
        applyZoomFloor(cy, fitZ);
      } else {
        constrainPan(cy);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Keep the context menu inside the viewport (flip up / clamp near edges).
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let x = contextMenu.x;
    let y = contextMenu.y;
    if (y + rect.height > vh - pad) {
      y = Math.max(pad, contextMenu.y - rect.height);
    }
    if (y + rect.height > vh - pad) {
      y = Math.max(pad, vh - pad - rect.height);
    }
    if (x + rect.width > vw - pad) {
      x = Math.max(pad, vw - pad - rect.width);
    }
    if (x < pad) x = pad;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [contextMenu]);

  // Main graph build — NOT on selectedId / flag-highlight layer toggles.
  // Entering/leaving flag highlight re-lays out once with reserved value space.
  useEffect(() => {
    if (!containerRef.current) return;

    const layoutSpacing = flagLayoutActive
      ? FLAG_HIGHLIGHT_LAYOUT_SPACING
      : DEFAULT_LAYOUT_SPACING;

    const hierarchyDepths = buildHierarchyDepthMap(scheme);
    const hiddenCounts = buildHiddenDescendantCount(scheme, hiddenNodes);
    const parentMap = buildParentMap(scheme.regions);
    const nodeDims = new Map<string, NodeDimensions>();

    for (const region of scheme.regions) {
      const hd = hierarchyDepths.get(region.id);
      if (hd === undefined) continue;
      const hiddenN = hiddenCounts.get(region.id) ?? 0;
      const hiddenSuffix = hiddenN > 0 ? `\n${t('graph.hiddenCount', { count: hiddenN })}` : '';
      const baseLabel = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}`;
      const manual = isTemporaryRegion(region);
      const box = nodeBoxForLabel(
        baseLabel,
        hd,
        baseSize,
        manual,
        region.type,
        flagLayoutActive,
      );
      nodeDims.set(region.id, { width: box.width, height: box.height });
    }

    const visiblePositions = layoutVisibleForest(
      scheme,
      hiddenNodes,
      nodeDims,
      layoutSpacing,
    );
    const visibleIds = new Set(visiblePositions.keys());
    const visibleSpatial = remapSpatialEdges(scheme.spatialEdges, hiddenNodes, parentMap);

    // Zoom-out floor = camera zoom after «expand all» (full forest fit).
    const expandPositions = layoutVisibleForest(
      scheme,
      computeExpandAllHidden(),
      nodeDims,
      layoutSpacing,
    );
    const expandBb = modelBBoxFromPositions(expandPositions, nodeDims);
    expandContentSizeRef.current = expandBb;

    const elements: cytoscape.ElementDefinition[] = [];

    for (const region of scheme.regions) {
      const pos = visiblePositions.get(region.id);
      const hd = hierarchyDepths.get(region.id);
      if (!pos || hd === undefined) continue;

      const hiddenN = hiddenCounts.get(region.id) ?? 0;
      const hiddenSuffix = hiddenN > 0 ? `\n${t('graph.hiddenCount', { count: hiddenN })}` : '';
      const baseLabel = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}`;
      const manual = isTemporaryRegion(region);
      const nodeShape = regionNodeShape(region.type, manual && region.type !== 'global');
      const box = nodeBoxForLabel(
        baseLabel,
        hd,
        baseSize,
        manual,
        region.type,
        flagLayoutActive,
      );
      // Compact font when not showing a value yet; reserved box still holds space.
      const baseMetrics = nodeLabelMetrics(baseLabel, hd, baseSize);

      const classes: string[] = [];
      if (orphanIds.has(region.id)) classes.push('orphan');
      if (conflictRegionIds.has(region.id)) classes.push('flag-conflict');
      if (hiddenN > 0) classes.push('has-collapsed');
      if (manual) classes.push('draft');

      elements.push({
        data: {
          id: region.id,
          label: baseLabel,
          baseLabel,
          color: orphanIds.has(region.id) ? '#ffdddd' : depthColor(hd),
          width: box.width,
          height: box.height,
          layoutWidth: box.width,
          layoutHeight: box.height,
          layoutFontSize: box.fontSize,
          layoutTextMaxWidth: box.textMaxWidth,
          baseWidth: box.width,
          baseHeight: box.height,
          fontSize: flagLayoutActive ? box.fontSize : baseMetrics.fontSize,
          baseFontSize: baseMetrics.fontSize,
          textMaxWidth: box.textMaxWidth,
          baseTextMaxWidth: Math.max(baseMetrics.textMaxWidth, box.width - 14),
          depth: hd,
          hiddenCount: hiddenN,
          regionType: region.type,
          nodeShape,
          isManual: manual,
        },
        position: pos,
        classes: classes.join(' '),
      });
    }

    for (const edge of scheme.hierarchyEdges) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
      if (!edgeAllowedByDisplayFilters('hierarchy', edgeDisplayFilters)) continue;
      elements.push({
        data: {
          id: `h-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
        classes: 'hierarchy',
      });
    }

    for (const edge of visibleSpatial) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
      if (!edgeAllowedByDisplayFilters(edge.relation, edgeDisplayFilters)) continue;
      elements.push({
        data: {
          id: `s-${edge.relation}-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
        classes: edge.relation,
      });
    }

    if (cyRef.current) {
      viewStateRef.current = {
        zoom: cyRef.current.zoom(),
        pan: cyRef.current.pan(),
      };
      cyRef.current.destroy();
    }

    if (elements.length === 0) {
      cyRef.current = null;
      return;
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(theme) as cytoscape.StylesheetStyle[],
      layout: { name: 'preset' },
      minZoom: 0.02,
      maxZoom: CY_MAX_ZOOM,
      wheelSensitivity: WHEEL_SENSITIVITY,
    });

    // If a fit/focus tween is still running, stop it before wheel zoom so deltas
    // do not stack on top of the animation (rare “speed mode”). Normal sensitivity unchanged.
    const containerEl = containerRef.current;
    const onWheelGuard = () => {
      cy.stop(true);
      requestAnimationFrame(() => {
        if (cyRef.current === cy) constrainPan(cy);
      });
    };
    containerEl.addEventListener('wheel', onWheelGuard, { capture: true, passive: true });

    cy.on('dragpan', () => {
      if (constrainingPanRef.current) return;
      constrainingPanRef.current = true;
      try {
        constrainPan(cy);
      } finally {
        constrainingPanRef.current = false;
      }
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onBackgroundTap();
      }
    });

    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id();
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      clickTimerRef.current = setTimeout(() => {
        onNodeSelect(id);
        clickTimerRef.current = null;
      }, 220);
    });

    cy.on('dbltap', 'node', (evt) => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      onNodeOpen(evt.target.id());
    });

    cy.on('cxttap', 'node', (evt) => {
      evt.originalEvent.preventDefault();
      evt.originalEvent.stopPropagation();
      const node = evt.target;
      const id = node.id();
      const rendered = evt.renderedPosition || node.renderedPosition();
      const rect = containerRef.current!.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rendered.x,
        y: rect.top + rendered.y,
        nodeId: id,
      });
    });

    cy.on('cxttap', (evt) => {
      if (evt.target !== cy) return;
      evt.originalEvent.preventDefault();
      const rendered = evt.renderedPosition;
      if (!rendered || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rendered.x,
        y: rect.top + rendered.y,
      });
    });

    if (selectedId && cy.getElementById(selectedId).nonempty()) {
      cy.getElementById(selectedId).addClass('selected');
    }

    if (fitOnNextLayout.current) {
      cy.fit(undefined, FIT_PADDING);
      fitOnNextLayout.current = false;
    } else if (viewStateRef.current) {
      cy.zoom(viewStateRef.current.zoom);
      cy.pan(viewStateRef.current.pan);
    }

    if (expandBb && cy.width() > 0 && cy.height() > 0) {
      const expandFitZoom = zoomToFitSize(
        cy.width(),
        cy.height(),
        expandBb.w,
        expandBb.h,
        FIT_PADDING,
      );
      applyZoomFloor(cy, expandFitZoom);
    } else {
      constrainPan(cy);
    }

    applyRegionNodeStyles(cy);
    // Lock state is applied by a separate effect — do not depend on `locked` here,
    // otherwise toggle lock/unlock destroys the graph and recenters the camera.
    // panify: drag on a node pans the viewport (node stays put); cxttap still works.
    if (lockedRef.current) cy.nodes().panify();
    cyRef.current = cy;

    applyHighlightOverlay(
      cy,
      flagHighlightRef.current,
      attentionBrightIdsRef.current,
      attentionBrightEdgeKeysRef.current,
      baseSize,
    );

    // Prefer focus (search/partners) over fit / expand-collapse center.
    // Each seq is applied only once so an old search does not keep winning on later rebuilds.
    const pendingFocus = focusRequestRef.current;
    const pendingFit = fitRequestRef.current;
    const pendingCenter = centerRequestRef.current;
    if (pendingFocus && pendingFocus.seq !== lastAppliedFocusSeqRef.current) {
      const seq = pendingFocus.seq;
      const id = pendingFocus.id;
      lastAppliedFocusSeqRef.current = seq;
      requestAnimationFrame(() => {
        if (cyRef.current) {
          focusNodeOnCy(cyRef.current, id);
        }
      });
    } else if (pendingFit && pendingFit.seq !== lastAppliedFitSeqRef.current) {
      const seq = pendingFit.seq;
      const ids = pendingFit.ids;
      lastAppliedFitSeqRef.current = seq;
      requestAnimationFrame(() => {
        if (cyRef.current) {
          fitNodesOnCy(cyRef.current, ids);
        }
      });
    } else if (pendingCenter && pendingCenter.seq !== lastAppliedCenterSeqRef.current) {
      const seq = pendingCenter.seq;
      const id = pendingCenter.id;
      lastAppliedCenterSeqRef.current = seq;
      requestAnimationFrame(() => {
        if (cyRef.current) {
          centerNodeOnCy(cyRef.current, id);
        }
      });
    }

    return () => {
      containerEl.removeEventListener('wheel', onWheelGuard, { capture: true });
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      const living = cyRef.current;
      if (living) {
        // Capture the live camera before destroy — otherwise a flag-only scheme
        // update restores a stale pan/zoom from the previous rebuild.
        viewStateRef.current = {
          zoom: living.zoom(),
          pan: { ...living.pan() },
        };
        living.destroy();
        cyRef.current = null;
      }
    };
  }, [
    scheme,
    hiddenNodes,
    orphanIds,
    conflictRegionIds,
    // Re-layout only when entering/leaving flag highlight — not on layer toggles.
    flagLayoutActive,
    edgeDisplayFilters,
    baseSize,
    locale,
    theme,
    layoutRequest,
    t,
    onNodeSelect,
    onNodeOpen,
    onBackgroundTap,
  ]);

  // Flag / attention highlight: update classes & captions without re-layout.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    applyHighlightOverlay(
      cy,
      flagHighlight,
      attentionBrightIds,
      attentionBrightEdgeKeys,
      baseSize,
    );
  }, [flagHighlight, attentionBrightIds, attentionBrightEdgeKeys, baseSize]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (locked) {
      cy.nodes().panify();
    } else {
      cy.nodes().unpanify();
      cy.nodes().grabify();
    }
  }, [locked]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.style().fromJson(buildStylesheet(theme) as cytoscape.StylesheetStyle[]);
    applyRegionNodeStyles(cy);
  }, [theme]);

  // Selection highlight without full rebuild
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().removeClass('selected');
    if (selectedId) {
      const node = cy.getElementById(selectedId);
      if (node.nonempty()) node.addClass('selected');
    }
  }, [selectedId]);

  // Center on anchor region after collapse/expand (preserve zoom)
  useEffect(() => {
    if (!centerRequest || !cyRef.current) return;
    if (centerRequest.seq === lastAppliedCenterSeqRef.current) return;
    const seq = centerRequest.seq;
    const id = centerRequest.id;
    // Defer so a same-commit graph rebuild can apply first on the new cy.
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedCenterSeqRef.current) return;
      lastAppliedCenterSeqRef.current = seq;
      centerNodeOnCy(cyRef.current, id);
    });
    return () => cancelAnimationFrame(raf);
  }, [centerRequest]);

  // External focus requests (search / partners list) — also zoom in
  useEffect(() => {
    if (!focusRequest || !cyRef.current) return;
    if (focusRequest.seq === lastAppliedFocusSeqRef.current) return;
    const seq = focusRequest.seq;
    const id = focusRequest.id;
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedFocusSeqRef.current) return;
      lastAppliedFocusSeqRef.current = seq;
      focusNodeOnCy(cyRef.current, id);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusRequest]);

  // Fit a set of nodes (subtree highlight)
  useEffect(() => {
    if (!fitRequest || !cyRef.current) return;
    if (fitRequest.seq === lastAppliedFitSeqRef.current) return;
    const seq = fitRequest.seq;
    const ids = fitRequest.ids;
    const raf = requestAnimationFrame(() => {
      if (!cyRef.current) return;
      if (seq === lastAppliedFitSeqRef.current) return;
      lastAppliedFitSeqRef.current = seq;
      fitNodesOnCy(cyRef.current, ids);
    });
    return () => cancelAnimationFrame(raf);
  }, [fitRequest]);

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const contextRegion = contextMenu?.nodeId
    ? scheme.regions.find((region) => region.id === contextMenu.nodeId)
    : undefined;
  const contextIsGlobal = contextRegion?.type === 'global';

  return (
    <>
      <div
        ref={containerRef}
        className="graph-container"
        onContextMenu={blockBrowserMenu}
      />
      {contextMenu && !contextMenu.nodeId && (
        <div
          ref={contextMenuRef}
          className="node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={blockBrowserMenu}
        >
          <button
            type="button"
            onClick={() => {
              onAddManual();
              setContextMenu(null);
            }}
          >
            {t('graph.addManualRegion')}
          </button>
        </div>
      )}
      {contextMenu?.nodeId && (
        <div
          ref={contextMenuRef}
          className="node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={blockBrowserMenu}
        >
          <button type="button" onClick={() => { onNodeOpen(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.properties')}
          </button>
          <button type="button" onClick={() => { onCopyName(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.copyName')}
          </button>
          {onRename && (
            <button type="button" onClick={() => { onRename(contextMenu.nodeId!); setContextMenu(null); }}>
              {t('graph.rename')}
            </button>
          )}
          <button type="button" onClick={() => { onAddDescendant(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.addDescendant')}
          </button>
          <button type="button" onClick={() => { onOpenFlagsManager(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.flagsManager')}
          </button>
          <div className="node-context-menu-item has-submenu">
            <button type="button" className="node-context-menu-parent">
              {t('graph.highlightSubtree')}
              <span className="node-context-menu-caret">▸</span>
            </button>
            <div className="node-context-submenu">
              <button
                type="button"
                onClick={() => { onHighlightSubtree(contextMenu.nodeId!, 'full'); setContextMenu(null); }}
              >
                {t('graph.highlightSubtreeFull')}
              </button>
              <button
                type="button"
                onClick={() => { onHighlightSubtree(contextMenu.nodeId!, 'children'); setContextMenu(null); }}
              >
                {t('graph.highlightSubtreeChildren')}
              </button>
              {!contextIsGlobal && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onHighlightSubtree(contextMenu.nodeId!, 'intersects');
                      setContextMenu(null);
                    }}
                  >
                    {t('graph.highlightSubtreeIntersects')}
                  </button>
                  <div className="node-context-menu-item has-submenu node-context-menu-item--nested">
                    <button type="button" className="node-context-menu-parent">
                      {t('graph.highlightSubtreeContainment')}
                      <span className="node-context-menu-caret">▸</span>
                    </button>
                    <div className="node-context-submenu">
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSubtree(contextMenu.nodeId!, 'containment-all');
                          setContextMenu(null);
                        }}
                      >
                        {t('graph.highlightSubtreeContainmentAll')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSubtree(contextMenu.nodeId!, 'containment-children');
                          setContextMenu(null);
                        }}
                      >
                        {t('graph.highlightSubtreeContainmentChildren')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSubtree(contextMenu.nodeId!, 'containment-parents');
                          setContextMenu(null);
                        }}
                      >
                        {t('graph.highlightSubtreeContainmentParents')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          {subtreeHighlightActive && (
            <button type="button" onClick={() => { onClearSubtreeHighlight(); setContextMenu(null); }}>
              {t('graph.clearSubtreeHighlight')}
            </button>
          )}
          <button
            type="button"
            className="danger-menu-item"
            onClick={() => { onDeleteManual(contextMenu.nodeId!); setContextMenu(null); }}
          >
            {t('graph.deleteManual')}
          </button>
          <button type="button" onClick={() => { onCollapseChildren(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.hideChildren')}
          </button>
          <button type="button" onClick={() => { onCollapseRecursive(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.collapseRecursive')}
          </button>
          <button type="button" onClick={() => { onExpandChildren(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.showChildren')}
          </button>
          <button type="button" onClick={() => { onExpandRecursive(contextMenu.nodeId!); setContextMenu(null); }}>
            {t('graph.expandRecursive')}
          </button>
        </div>
      )}
    </>
  );
});
