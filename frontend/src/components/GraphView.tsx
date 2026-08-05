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
import { layoutVisibleForest, type NodeDimensions } from '../utils/layout';
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
  deletableRegionIds: Set<string>;
  locked: boolean;
  subtreeHighlightActive: boolean;
  /** Which edge families to draw on the scheme. */
  edgeDisplayMode: EdgeDisplayMode;
  onNodeSelect: (regionId: string) => void;
  onNodeOpen: (regionId: string) => void;
  onBackgroundTap: () => void;
  onCopyName: (regionId: string) => void;
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

export type EdgeDisplayMode =
  | 'all'
  | 'intersects'
  | 'contains'
  | 'spatial'
  | 'hierarchy';

function edgeAllowedByDisplayMode(
  kind: 'hierarchy' | 'intersects' | 'contains',
  mode: EdgeDisplayMode,
): boolean {
  if (mode === 'all') return true;
  if (mode === 'hierarchy') return kind === 'hierarchy';
  if (mode === 'intersects') return kind === 'intersects';
  if (mode === 'contains') return kind === 'contains';
  // spatial = contains + intersects
  return kind === 'intersects' || kind === 'contains';
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
  hasDraftClass: boolean;
}

function applyRegionNodeStyles(cy: Core): void {
  cy.nodes().forEach((node) => {
    const shape = node.data('nodeShape') as string;
    if (shape === 'rectangle' || shape === 'ellipse') {
      node.style('shape', shape);
    }
  });
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
    { duration: 280 },
  );
  return true;
}

function focusNodeOnCy(cy: Core, regionId: string): boolean {
  const node = cy.getElementById(regionId);
  if (node.empty()) return false;

  const nw = Number(node.data('width')) || 80;
  const nh = Number(node.data('height')) || 56;
  const pad = 120;
  const zoom = Math.min(
    cy.width() / (nw + pad),
    cy.height() / (nh + pad),
    4,
  );

  cy.stop(true);
  cy.animate(
    {
      center: { eles: node },
      zoom: Math.max(0.25, zoom),
    },
    { duration: 280 },
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
  cy.stop(true);
  // Tight padding so the selection fills the viewport without clipping.
  const padding = eles.length <= 2 ? 72 : 40;
  cy.animate(
    {
      fit: { eles, padding },
    },
    { duration: 280 },
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
    deletableRegionIds,
    locked,
    subtreeHighlightActive,
    edgeDisplayMode,
    onNodeSelect,
    onNodeOpen,
    onBackgroundTap,
    onCopyName,
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
  const centerRequestRef = useRef(centerRequest);
  centerRequestRef.current = centerRequest;
  const focusRequestRef = useRef(focusRequest);
  focusRequestRef.current = focusRequest;
  const fitRequestRef = useRef(fitRequest);
  fitRequestRef.current = fitRequest;
  // Apply each focus/center/fit seq only once across rebuilds (avoids stale search focus).
  const lastAppliedFocusSeqRef = useRef(0);
  const lastAppliedCenterSeqRef = useRef(0);
  const lastAppliedFitSeqRef = useRef(0);
  const lastViewResetSeqRef = useRef(0);

  useEffect(() => {
    if (!viewResetRequest) return;
    if (viewResetRequest.seq === lastViewResetSeqRef.current) return;
    lastViewResetSeqRef.current = viewResetRequest.seq;
    fitOnNextLayout.current = true;
    viewStateRef.current = null;
  }, [viewResetRequest]);

  useImperativeHandle(ref, () => ({
    focusNode(regionId: string) {
      const cy = cyRef.current;
      if (!cy) return false;
      return focusNodeOnCy(cy, regionId);
    },
    zoomIn() {
      const cy = cyRef.current;
      if (cy) cy.zoom({ level: cy.zoom() * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    },
    zoomOut() {
      const cy = cyRef.current;
      if (cy) cy.zoom({ level: cy.zoom() / 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    },
    resize() {
      const cy = cyRef.current;
      if (!cy) return;
      cy.resize();
    },
  }));

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      cyRef.current?.resize();
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

  // Main graph build — NOT on selectedId changes
  useEffect(() => {
    if (!containerRef.current) return;

    const hierarchyDepths = buildHierarchyDepthMap(scheme);
    const hiddenCounts = buildHiddenDescendantCount(scheme, hiddenNodes);
    const parentMap = buildParentMap(scheme.regions);
    const nodeDims = new Map<string, NodeDimensions>();

    for (const region of scheme.regions) {
      const hd = hierarchyDepths.get(region.id);
      if (hd === undefined) continue;
      const hiddenN = hiddenCounts.get(region.id) ?? 0;
      const hiddenSuffix = hiddenN > 0 ? `\n${t('graph.hiddenCount', { count: hiddenN })}` : '';
      const valueInfo = flagHighlight?.valueLabels?.get(region.id);
      const valueSuffix = valueInfo
        ? (valueInfo.defining ? `\n◆ ${valueInfo.text}` : `\n◇ ${valueInfo.text}`)
        : '';
      const label = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}${valueSuffix}`;
      const m = nodeLabelMetrics(label, hd, baseSize, {
        denseText: Boolean(valueInfo),
        valueEmphasis: Boolean(valueInfo),
      });
      nodeDims.set(region.id, { width: m.width, height: m.height });
    }

    const visiblePositions = layoutVisibleForest(scheme, hiddenNodes, nodeDims);
    const visibleIds = new Set(visiblePositions.keys());
    const visibleSpatial = remapSpatialEdges(scheme.spatialEdges, hiddenNodes, parentMap);

    const elements: cytoscape.ElementDefinition[] = [];

    for (const region of scheme.regions) {
      const pos = visiblePositions.get(region.id);
      const hd = hierarchyDepths.get(region.id);
      if (!pos || hd === undefined) continue;

      const hiddenN = hiddenCounts.get(region.id) ?? 0;
      const hiddenSuffix = hiddenN > 0 ? `\n${t('graph.hiddenCount', { count: hiddenN })}` : '';
      const valueInfo = flagHighlight?.valueLabels?.get(region.id);
      const valueSuffix = valueInfo
        ? (valueInfo.defining ? `\n◆ ${valueInfo.text}` : `\n◇ ${valueInfo.text}`)
        : '';
      const label = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}${valueSuffix}`;
      const metrics = nodeLabelMetrics(label, hd, baseSize, {
        denseText: Boolean(valueInfo),
        valueEmphasis: Boolean(valueInfo),
      });
      const manual = isTemporaryRegion(region);
      const nodeShape = regionNodeShape(region.type, manual && region.type !== 'global');
      let { width, height } = metrics;
      if (manual && region.type !== 'global') {
        width = Math.max(metrics.width, metrics.height * 1.4);
        height = Math.max(metrics.height * 0.72, metrics.width * 0.5);
        // Keep room for the full multi-line label (id + value).
        width = Math.max(width, metrics.width);
        height = Math.max(height, metrics.height);
      }

      const classes: string[] = [];
      if (orphanIds.has(region.id)) classes.push('orphan');
      if (conflictRegionIds.has(region.id)) classes.push('flag-conflict');
      if (hiddenN > 0) classes.push('has-collapsed');
      if (manual) classes.push('draft');
      if (flagHighlight) {
        if (flagHighlight.conflictIds?.has(region.id)) classes.push('flag-conflict-pair');
        if (flagHighlight.definingIds.has(region.id)) classes.push('flag-define');
        else if (flagHighlight.brightIds.has(region.id)) classes.push('flag-path');
        else if (!flagHighlight.conflictIds?.has(region.id)) classes.push('flag-dim');
        if (valueInfo?.defining) classes.push('flag-value-define');
        else if (valueInfo) classes.push('flag-value-inherit');
      } else if (attentionBrightIds) {
        if (!attentionBrightIds.has(region.id)) classes.push('flag-dim');
      }

      elements.push({
        data: {
          id: region.id,
          label,
          color: orphanIds.has(region.id) ? '#ffdddd' : depthColor(hd),
          width,
          height,
          fontSize: metrics.fontSize,
          textMaxWidth: Math.max(metrics.textMaxWidth, width - 14),
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
      if (!edgeAllowedByDisplayMode('hierarchy', edgeDisplayMode)) continue;
      const edgeKey = `${edge.source}->${edge.target}`;
      const edgeClasses = ['hierarchy'];
      if (flagHighlight) {
        if (flagHighlight.brightEdgeKeys.has(edgeKey)) edgeClasses.push('flag-path-edge');
        else edgeClasses.push('flag-dim-edge');
      } else if (attentionBrightIds) {
        const bothBright = attentionBrightIds.has(edge.source) && attentionBrightIds.has(edge.target);
        if (!bothBright) {
          edgeClasses.push('flag-dim-edge');
        } else if (attentionBrightEdgeKeys && !attentionBrightEdgeKeys.has(edgeKey)) {
          edgeClasses.push('flag-dim-edge');
        }
      }
      elements.push({
        data: {
          id: `h-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
        classes: edgeClasses.join(' '),
      });
    }

    for (const edge of visibleSpatial) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
      if (!edgeAllowedByDisplayMode(edge.relation, edgeDisplayMode)) continue;
      const spatialClasses: string[] = [edge.relation];
      const edgeKey = `${edge.relation}-${edge.source}-${edge.target}`;
      const edgeKeyAlt = `${edge.relation}-${edge.target}-${edge.source}`;
      if (flagHighlight) {
        if (
          flagHighlight.conflictEdgeKeys?.has(edgeKey)
          || flagHighlight.conflictEdgeKeys?.has(edgeKeyAlt)
        ) {
          spatialClasses.push('flag-conflict-edge');
        } else {
          spatialClasses.push('flag-dim-edge');
        }
      } else if (attentionBrightIds) {
        if (attentionBrightEdgeKeys) {
          if (
            !attentionBrightEdgeKeys.has(edgeKey)
            && !attentionBrightEdgeKeys.has(edgeKeyAlt)
          ) {
            spatialClasses.push('flag-dim-edge');
          }
        } else if (
          !attentionBrightIds.has(edge.source)
          || !attentionBrightIds.has(edge.target)
        ) {
          spatialClasses.push('flag-dim-edge');
        }
      }
      elements.push({
        data: {
          id: `s-${edge.relation}-${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
        },
        classes: spatialClasses.join(' '),
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
      maxZoom: 12,
      wheelSensitivity: 3.5,
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
        hasDraftClass: node.hasClass('draft'),
      });
    });

    if (selectedId && cy.getElementById(selectedId).nonempty()) {
      cy.getElementById(selectedId).addClass('selected');
    }

    if (fitOnNextLayout.current) {
      cy.fit(undefined, 40);
      fitOnNextLayout.current = false;
    } else if (viewStateRef.current) {
      cy.zoom(viewStateRef.current.zoom);
      cy.pan(viewStateRef.current.pan);
    }

    applyRegionNodeStyles(cy);
    // Lock state is applied by a separate effect — do not depend on `locked` here,
    // otherwise toggle lock/unlock destroys the graph and recenters the camera.
    if (lockedRef.current) cy.nodes().ungrabify();
    cyRef.current = cy;

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
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      const cy = cyRef.current;
      if (cy) {
        // Capture the live camera before destroy — otherwise a flag-only scheme
        // update restores a stale pan/zoom from the previous rebuild.
        viewStateRef.current = {
          zoom: cy.zoom(),
          pan: { ...cy.pan() },
        };
        cy.destroy();
        cyRef.current = null;
      }
    };
  }, [
    scheme,
    hiddenNodes,
    orphanIds,
    conflictRegionIds,
    flagHighlight,
    attentionBrightIds,
    attentionBrightEdgeKeys,
    edgeDisplayMode,
    baseSize,
    locale,
    theme,
    t,
    onNodeSelect,
    onNodeOpen,
    onBackgroundTap,
  ]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (locked) cy.nodes().ungrabify();
    else cy.nodes().grabify();
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

  const contextRegion = contextMenu
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
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={blockBrowserMenu}
        >
          <button type="button" onClick={() => { onNodeOpen(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.properties')}
          </button>
          <button type="button" onClick={() => { onCopyName(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.copyName')}
          </button>
          <button type="button" onClick={() => { onAddDescendant(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.addDescendant')}
          </button>
          <button type="button" onClick={() => { onOpenFlagsManager(contextMenu.nodeId); setContextMenu(null); }}>
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
                onClick={() => { onHighlightSubtree(contextMenu.nodeId, 'full'); setContextMenu(null); }}
              >
                {t('graph.highlightSubtreeFull')}
              </button>
              <button
                type="button"
                onClick={() => { onHighlightSubtree(contextMenu.nodeId, 'children'); setContextMenu(null); }}
              >
                {t('graph.highlightSubtreeChildren')}
              </button>
              {!contextIsGlobal && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onHighlightSubtree(contextMenu.nodeId, 'intersects');
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
                          onHighlightSubtree(contextMenu.nodeId, 'containment-all');
                          setContextMenu(null);
                        }}
                      >
                        {t('graph.highlightSubtreeContainmentAll')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSubtree(contextMenu.nodeId, 'containment-children');
                          setContextMenu(null);
                        }}
                      >
                        {t('graph.highlightSubtreeContainmentChildren')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onHighlightSubtree(contextMenu.nodeId, 'containment-parents');
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
          {(deletableRegionIds.has(contextMenu.nodeId)
            || contextMenu.hasDraftClass
            || isTemporaryRegion(contextRegion)) && (
            <button
              type="button"
              className="danger-menu-item"
              onClick={() => { onDeleteManual(contextMenu.nodeId); setContextMenu(null); }}
            >
              {t('graph.deleteManual')}
            </button>
          )}
          <button type="button" onClick={() => { onCollapseChildren(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.hideChildren')}
          </button>
          <button type="button" onClick={() => { onCollapseRecursive(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.collapseRecursive')}
          </button>
          <button type="button" onClick={() => { onExpandChildren(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.showChildren')}
          </button>
          <button type="button" onClick={() => { onExpandRecursive(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.expandRecursive')}
          </button>
        </div>
      )}
    </>
  );
});
