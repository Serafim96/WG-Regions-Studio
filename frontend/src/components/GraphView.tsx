import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import cytoscape, { Core } from 'cytoscape';
import type { Scheme } from '../types';
import { buildStylesheet } from '../cytoscape/styles';
import {
  buildHiddenDescendantCount,
  buildHierarchyDepthMap,
  buildParentMap,
  depthColor,
  nodeLabelMetrics,
  remapSpatialEdges,
} from '../utils/graph';
import { layoutVisibleForest, type NodeDimensions } from '../utils/layout';
import { useI18n } from '../i18n/I18nContext';

export interface GraphViewHandle {
  focusNode: (regionId: string) => boolean;
}

interface GraphViewProps {
  scheme: Scheme;
  hiddenNodes: Set<string>;
  orphanIds: Set<string>;
  selectedId: string | null;
  baseSize: number;
  focusRequest: { id: string; seq: number } | null;
  centerRequest: { id: string; seq: number } | null;
  onNodeSelect: (regionId: string) => void;
  onNodeOpen: (regionId: string) => void;
  onCopyName: (regionId: string) => void;
  onCollapseChildren: (regionId: string) => void;
  onExpandChildren: (regionId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

function centerNodeOnCy(cy: Core, regionId: string): boolean {
  const node = cy.getElementById(regionId);
  if (node.empty()) return false;

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

  cy.animate(
    {
      center: { eles: node },
      zoom: Math.max(0.25, zoom),
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
    selectedId,
    baseSize,
    focusRequest,
    centerRequest,
    onNodeSelect,
    onNodeOpen,
    onCopyName,
    onCollapseChildren,
    onExpandChildren,
  },
  ref,
) {
  const { t, locale } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fitOnNextLayout = useRef(true);
  const viewStateRef = useRef<{ zoom: number; pan: { x: number; y: number } } | null>(null);

  useImperativeHandle(ref, () => ({
    focusNode(regionId: string) {
      const cy = cyRef.current;
      if (!cy) return false;
      return focusNodeOnCy(cy, regionId);
    },
  }));

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

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
      const label = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}`;
      const m = nodeLabelMetrics(label, hd, baseSize);
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
      const label = `${region.id}\np:${region.priority} d:${hd}${hiddenSuffix}`;
      const metrics = nodeLabelMetrics(label, hd, baseSize);
      const classes: string[] = [];
      if (region.type === 'global') classes.push('global');
      if (region.type === 'manual' || region.is_manual) classes.push('manual');
      if (orphanIds.has(region.id)) classes.push('orphan');
      if (hiddenN > 0) classes.push('has-collapsed');

      elements.push({
        data: {
          id: region.id,
          label,
          color: orphanIds.has(region.id) ? '#ffdddd' : depthColor(hd),
          width: metrics.width,
          height: metrics.height,
          fontSize: metrics.fontSize,
          textMaxWidth: metrics.textMaxWidth,
          depth: hd,
          hiddenCount: hiddenN,
        },
        position: pos,
        classes: classes.join(' '),
      });
    }

    for (const edge of scheme.hierarchyEdges) {
      if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue;
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
      style: buildStylesheet() as cytoscape.StylesheetStyle[],
      layout: { name: 'preset' },
      minZoom: 0.02,
      maxZoom: 12,
      wheelSensitivity: 3.5,
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
      const id = evt.target.id();
      const rendered = evt.renderedPosition || evt.target.renderedPosition();
      const rect = containerRef.current!.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rendered.x,
        y: rect.top + rendered.y,
        nodeId: id,
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

    cyRef.current = cy;

    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      cy.destroy();
      cyRef.current = null;
    };
  }, [scheme, hiddenNodes, orphanIds, baseSize, locale, t, onNodeSelect, onNodeOpen]);

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
    centerNodeOnCy(cyRef.current, centerRequest.id);
  }, [centerRequest]);

  // External focus requests (search / partners list) — also zoom in
  useEffect(() => {
    if (!focusRequest || !cyRef.current) return;
    focusNodeOnCy(cyRef.current, focusRequest.id);
  }, [focusRequest]);

  const blockBrowserMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <div
        ref={containerRef}
        className="graph-container"
        onContextMenu={blockBrowserMenu}
      />
      {contextMenu && (
        <div
          className="node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={blockBrowserMenu}
        >
          <button type="button" onClick={() => { onCopyName(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.copyName')}
          </button>
          <button type="button" onClick={() => { onCollapseChildren(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.hideChildren')}
          </button>
          <button type="button" onClick={() => { onExpandChildren(contextMenu.nodeId); setContextMenu(null); }}>
            {t('graph.showChildren')}
          </button>
        </div>
      )}
    </>
  );
});
