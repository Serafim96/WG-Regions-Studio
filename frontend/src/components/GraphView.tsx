import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
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
import { isTemporaryRegion } from '../utils/regions';
import { useI18n } from '../i18n/I18nContext';
import { useTheme } from '../theme/ThemeContext';
import { GraphContextMenu } from './graph/GraphContextMenu';
import {
  applyZoomFloor,
  centerNodeOnCy,
  constrainPan,
  CY_MAX_ZOOM,
  FIT_PADDING,
  focusNodeOnCy,
  fitNodesOnCy,
  modelBBoxFromPositions,
  nextWheelZoom,
  zoomToFitSize,
} from './graph/camera';
import { applyHighlightOverlay, nodeBoxForLabel } from './graph/highlightOverlay';
import { applyRegionNodeStyles } from './graph/nodeStyles';
import {
  DEFAULT_EDGE_DISPLAY_FILTERS,
  edgeAllowedByDisplayFilters,
  type ContextMenuState,
  type EdgeDisplayFilters,
  type FlagHighlightState,
  type HighlightBranchMode,
} from './graph/types';
import { useGraphCameraControl } from '../hooks/graph/useGraphCameraControl';
import { useGraphEvents } from '../hooks/graph/useGraphEvents';
import { useGraphLayout } from '../hooks/graph/useGraphLayout';
import { useHighlightOverlay } from '../hooks/graph/useHighlightOverlay';

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
  flagHighlight: FlagHighlightState;
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
  /** When seq changes, fit the whole scheme (used after В«Build schemeВ»). */
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

export type { HighlightBranchMode, EdgeDisplayFilters };
export { DEFAULT_EDGE_DISPLAY_FILTERS };


export const GraphViewInner = forwardRef<GraphViewHandle, GraphViewProps>(function GraphView(
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
  const expandLayoutCacheRef = useRef<{
    key: string;
    bb: { w: number; h: number };
  } | null>(null);
  const expandContentSizeRef = useRef<{ w: number; h: number } | null>(null);
  const constrainingPanRef = useRef(false);
  const flagLayoutActive = Boolean(flagHighlight);

  const cameraControl = useGraphCameraControl({
    cyRef,
    focusRequest,
    centerRequest,
    fitRequest,
    viewResetRequest,
    layoutRequest,
    fitOnNextLayout,
    viewStateRef,
    expandContentSizeRef,
  });

  useImperativeHandle(ref, () => cameraControl.makeHandle());

  useGraphLayout({
    cyRef,
    expandContentSizeRef,
    expandLayoutCacheRef,
    containerRef,
  });

  useGraphEvents({
    cyRef,
    locked,
    selectedId,
    theme,
    contextMenu,
    setContextMenu,
    contextMenuRef,
  });

  useHighlightOverlay(
    cyRef,
    flagHighlight,
    attentionBrightIds,
    attentionBrightEdgeKeys,
    baseSize,
  );

  const { lastAppliedFocusSeqRef, lastAppliedCenterSeqRef, lastAppliedFitSeqRef } = cameraControl;
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

    // Zoom-out floor = camera zoom after В«expand allВ» (full forest fit).
    // Avoid a second full layout when nothing is collapsed, and cache across
    // rebuilds that only change hiddenNodes / selection overlays.
    const expandCacheKey = [
      scheme.sourceHash,
      scheme.regions.length,
      layoutSpacing.hPad,
      layoutSpacing.vGap,
      layoutSpacing.levelGap,
      layoutSpacing.rowGap,
      layoutSpacing.overlapGap,
      baseSize,
      flagLayoutActive ? 1 : 0,
    ].join('|');
    let expandBb: { w: number; h: number };
    if (hiddenNodes.size === 0) {
      expandBb = modelBBoxFromPositions(visiblePositions, nodeDims) ?? { w: 1, h: 1 };
      expandLayoutCacheRef.current = { key: expandCacheKey, bb: expandBb };
    } else if (expandLayoutCacheRef.current?.key === expandCacheKey) {
      expandBb = expandLayoutCacheRef.current.bb;
    } else {
      const expandPositions = layoutVisibleForest(
        scheme,
        computeExpandAllHidden(),
        nodeDims,
        layoutSpacing,
      );
      expandBb = modelBBoxFromPositions(expandPositions, nodeDims) ?? { w: 1, h: 1 };
      expandLayoutCacheRef.current = { key: expandCacheKey, bb: expandBb };
    }
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
      // Native Cytoscape wheel zoom auto-detects “coarse vs fine” from the first
      // few deltas per instance — intermittent “speed mode” after scheme reload.
      userZoomingEnabled: false,
    });

    // Deterministic wheel zoom: direction-only step, cursor-centered, no device heuristic.
    // Also stops any in-flight fit/focus tween so deltas do not stack on animation.
    const containerEl = containerRef.current;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (cyRef.current !== cy) return;
      cy.stop(true);
      const rect = containerEl.getBoundingClientRect();
      const nextZoom = nextWheelZoom(cy.zoom(), e.deltaY, cy.minZoom(), cy.maxZoom());
      if (nextZoom !== cy.zoom()) {
        cy.zoom({
          level: nextZoom,
          renderedPosition: {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          },
        });
      }
      constrainPan(cy);
    };
    containerEl.addEventListener('wheel', onWheel, { capture: true, passive: false });

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
    // Lock state is applied by a separate effect вЂ” do not depend on `locked` here,
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
      containerEl.removeEventListener('wheel', onWheel, { capture: true });
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      const living = cyRef.current;
      if (living) {
        // Capture the live camera before destroy вЂ” otherwise a flag-only scheme
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
    // Re-layout only when entering/leaving flag highlight вЂ” not on layer toggles.
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
      {contextMenu && (
        <GraphContextMenu
          contextMenu={contextMenu}
          contextMenuRef={contextMenuRef}
          contextIsGlobal={Boolean(contextIsGlobal)}
          subtreeHighlightActive={subtreeHighlightActive}
          onClose={() => setContextMenu(null)}
          onNodeOpen={onNodeOpen}
          onCopyName={onCopyName}
          onRename={onRename}
          onAddManual={onAddManual}
          onAddDescendant={onAddDescendant}
          onDeleteManual={onDeleteManual}
          onOpenFlagsManager={onOpenFlagsManager}
          onCollapseChildren={onCollapseChildren}
          onExpandChildren={onExpandChildren}
          onCollapseRecursive={onCollapseRecursive}
          onExpandRecursive={onExpandRecursive}
          onHighlightSubtree={onHighlightSubtree}
          onClearSubtreeHighlight={onClearSubtreeHighlight}
        />
      )}
    </>
  );
});

export const GraphView = memo(GraphViewInner);
GraphView.displayName = 'GraphView';
