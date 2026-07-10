import { useEffect, useRef, useState } from 'react';
import cytoscape, { Core } from 'cytoscape';
import type { Scheme } from '../types';
import { buildStylesheet } from '../cytoscape/styles';
import { depthColor, nodeSize, remapSpatialEdges } from '../utils/graph';
import { layoutVisibleForest } from '../utils/layout';

interface GraphViewProps {
  scheme: Scheme;
  hiddenNodes: Set<string>;
  depthScale: number;
  baseSize: number;
  onNodeClick: (regionId: string) => void;
  onCopyName: (regionId: string) => void;
  onCollapseChildren: (regionId: string) => void;
  onExpandChildren: (regionId: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

function buildDepthMap(scheme: Scheme): Map<string, number> {
  const depths = new Map<string, number>();
  function walk(node: { id: string; depth: number; children: typeof node[] }) {
    depths.set(node.id, node.depth);
    node.children.forEach(walk);
  }
  scheme.forest.roots.forEach(walk);
  return depths;
}

export function GraphView({
  scheme,
  hiddenNodes,
  depthScale,
  baseSize,
  onNodeClick,
  onCopyName,
  onCollapseChildren,
  onExpandChildren,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const fitOnNextLayout = useRef(true);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const depths = buildDepthMap(scheme);
    const parentMap = new Map<string, string | null>();
    scheme.regions.forEach((r) => parentMap.set(r.id, r.parent));

    const visiblePositions = layoutVisibleForest(scheme, hiddenNodes);
    const visibleSpatial = remapSpatialEdges(scheme.spatialEdges, hiddenNodes, parentMap);

    const elements: cytoscape.ElementDefinition[] = [];

    for (const region of scheme.regions) {
      const pos = visiblePositions.get(region.id);
      if (!pos) continue;
      const depth = depths.get(region.id) ?? 0;
      const isCloud = region.type === 'global' || region.type === 'manual';

      elements.push({
        data: {
          id: region.id,
          label: `${region.id}\np:${region.priority} d:${depth}`,
          color: depthColor(depth),
          size: nodeSize(depth, baseSize, depthScale),
          depth,
        },
        position: pos,
        classes: [isCloud ? 'cloud' : '', region.is_manual ? 'manual' : ''].filter(Boolean).join(' '),
      });
    }

    for (const edge of scheme.hierarchyEdges) {
      if (hiddenNodes.has(edge.source) || hiddenNodes.has(edge.target)) continue;
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
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: buildStylesheet(baseSize, depthScale) as cytoscape.StylesheetStyle[],
      layout: { name: 'preset' },
      minZoom: 0.02,
      maxZoom: 12,
      // Higher value = faster zoom per wheel tick (default 1; was 0.3 — too slow)
      wheelSensitivity: 3.5,
    });

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.id());
    });

    cy.on('cxttap', 'node', (evt) => {
      const id = evt.target.id();
      const rendered = evt.renderedPosition || evt.target.renderedPosition();
      const rect = containerRef.current!.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rendered.x,
        y: rect.top + rendered.y,
        nodeId: id,
      });
      evt.originalEvent.preventDefault();
    });

    if (fitOnNextLayout.current) {
      cy.fit(undefined, 40);
      fitOnNextLayout.current = false;
    }

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [scheme, hiddenNodes, depthScale, baseSize, onNodeClick]);

  // Re-fit when collapse changes (not on every depthScale tweak if already fit)
  useEffect(() => {
    const cy = cyRef.current;
    if (cy && cy.nodes().length > 0) {
      cy.fit(undefined, 40);
    }
  }, [hiddenNodes]);

  return (
    <>
      <div ref={containerRef} className="graph-container" />
      {contextMenu && (
        <div
          className="node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={() => { onCopyName(contextMenu.nodeId); setContextMenu(null); }}>
            Копировать имя
          </button>
          <button type="button" onClick={() => { onCollapseChildren(contextMenu.nodeId); setContextMenu(null); }}>
            − Скрыть детей
          </button>
          <button type="button" onClick={() => { onExpandChildren(contextMenu.nodeId); setContextMenu(null); }}>
            + Показать детей
          </button>
        </div>
      )}
    </>
  );
}
