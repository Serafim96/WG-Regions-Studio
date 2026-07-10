import { useEffect, useRef, useState } from 'react';
import cytoscape, { Core } from 'cytoscape';
import type { Scheme } from '../types';
import { buildStylesheet } from '../cytoscape/styles';
import { depthColor, nodeSize, remapSpatialEdges } from '../utils/graph';

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

    const visibleSpatial = remapSpatialEdges(scheme.spatialEdges, hiddenNodes, parentMap);

    const elements: cytoscape.ElementDefinition[] = [];

    for (const region of scheme.regions) {
      const depth = depths.get(region.id) ?? 0;
      const pos = scheme.layout[region.id] ?? { x: 0, y: 0 };
      const isCloud = region.type === 'global' || region.type === 'manual';
      const classes = [
        isCloud ? 'cloud' : '',
        region.is_manual ? 'manual' : '',
        hiddenNodes.has(region.id) ? 'hidden-node' : '',
      ]
        .filter(Boolean)
        .join(' ');

      elements.push({
        data: {
          id: region.id,
          label: `${region.id}\np:${region.priority} d:${depth}`,
          color: depthColor(depth),
          size: nodeSize(depth, baseSize, depthScale),
          depth,
        },
        position: pos,
        classes,
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
      minZoom: 0.05,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id();
      if (!hiddenNodes.has(id)) onNodeClick(id);
    });

    cy.on('cxttap', 'node', (evt) => {
      const id = evt.target.id();
      if (hiddenNodes.has(id)) return;
      const rendered = evt.renderedPosition || evt.target.renderedPosition();
      const rect = containerRef.current!.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rendered.x,
        y: rect.top + rendered.y,
        nodeId: id,
      });
      evt.originalEvent.preventDefault();
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [scheme, hiddenNodes, depthScale, baseSize, onNodeClick]);

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
