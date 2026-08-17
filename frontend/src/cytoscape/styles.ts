/** Cytoscape stylesheet helpers. */

import type { Theme } from '../utils/settings';

export function regionNodeShape(
  regionType: string,
  isTemporary = false,
): 'ellipse' | 'rectangle' {
  if (regionType === 'global') return 'ellipse';
  if (regionType === 'manual' || isTemporary) return 'rectangle';
  return 'ellipse';
}

export function buildStylesheet(theme: Theme = 'light') {
  const cached = _stylesheetCache.get(theme);
  if (cached) return cached;
  const sheet = _buildStylesheetUncached(theme);
  _stylesheetCache.set(theme, sheet);
  return sheet;
}

const _stylesheetCache = new Map<Theme, ReturnType<typeof _buildStylesheetUncached>>();

function _buildStylesheetUncached(theme: Theme) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#e8eaed' : '#222';
  const borderColor = isDark ? '#aaa' : '#333';
  const globalBg = isDark ? '#3a3f47' : '#f5f5f5';
  const globalBorder = isDark ? '#9aa0a6' : '#888';
  const manualBorder = isDark ? '#ff9933' : '#c60';
  const orphanBg = isDark ? '#4a2020' : '#ffdddd';
  const orphanBorder = isDark ? '#ff6666' : '#cc0000';
  const orphanText = isDark ? '#ffb3b3' : '#900';
  const hierarchyColor = isDark ? '#d0d0d0' : '#222';

  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 'data(fontSize)',
        color: textColor,
        'text-wrap': 'wrap',
        'text-max-width': 'data(textMaxWidth)',
        width: 'data(width)',
        height: 'data(height)',
        'background-color': 'data(color)',
        'border-width': 2,
        'border-color': borderColor,
      },
    },
    {
      selector: 'node[nodeShape = "ellipse"]',
      style: {
        shape: 'ellipse',
      },
    },
    {
      selector: 'node[nodeShape = "rectangle"]',
      style: {
        shape: 'rectangle',
      },
    },
    {
      selector: 'node[regionType = "global"]',
      style: {
        'background-color': globalBg,
        'border-color': globalBorder,
      },
    },
    {
      selector: 'node[regionType = "manual"]',
      style: {
        'background-color': globalBg,
        'border-color': manualBorder,
        'border-style': 'dashed',
      },
    },
    {
      selector: 'node.draft',
      style: {
        'border-style': 'dashed',
        'border-color': manualBorder,
      },
    },
    {
      selector: 'node.orphan',
      style: {
        'background-color': orphanBg,
        'border-color': orphanBorder,
        color: orphanText,
      },
    },
    {
      selector: 'node.has-collapsed',
      style: {
        'border-width': 4,
        'border-color': '#d35400',
        'border-style': 'double',
        'background-opacity': 1,
      },
    },
    {
      selector: 'node.flag-conflict',
      style: {
        'border-width': 5,
        'border-color': '#ffc107',
        'border-style': 'solid',
      },
    },
    {
      selector: 'node.flag-conflict-resolved',
      style: {
        'border-width': 4.5,
        'border-color': '#c9a227',
        'border-style': 'dashed',
        color: '#8a7220',
        'text-outline-width': 1.8,
        'text-outline-color': '#c9a227',
        'text-outline-opacity': 0.75,
      },
    },
    {
      // Dim without transparency — washed / desaturated fill so edges never show through.
      selector: 'node.flag-dim',
      style: {
        opacity: 1,
        'background-opacity': 1,
        'background-color': isDark ? '#3a3d42' : '#e4e4e8',
        'border-color': isDark ? '#5c6168' : '#c5c5cc',
        'border-width': 1,
        color: isDark ? '#8b9098' : '#9a9aa3',
        'text-opacity': 1,
      },
    },
    {
      // On the inheritance path but does not locally set the flag.
      // Keep fill opaque so edges under the node stay covered (Cytoscape draws
      // edges under nodes by default; low opacity makes arrows show through).
      selector: 'node.flag-path',
      style: {
        opacity: 1,
        'border-width': 2,
        'border-color': '#64748b',
        'border-style': 'dashed',
        'background-opacity': 1,
        // Dark text without outline — readable on white/pastel fills (no glow).
        color: isDark ? '#e2e8f0' : '#1e293b',
        'text-opacity': 1,
        'font-weight': 500,
      },
    },
    {
      // Region that locally assigns the highlighted flag.
      selector: 'node.flag-define',
      style: {
        opacity: 1,
        'border-width': 7,
        'border-color': '#047857',
        'border-style': 'solid',
        'background-opacity': 1,
        color: '#ecfdf5',
        'text-opacity': 1,
        'font-weight': 800,
        'text-outline-width': 2,
        'text-outline-color': '#047857',
        'text-outline-opacity': 0.9,
      },
    },
    {
      // Inherited flag value caption — same contrast treatment as flag-path.
      selector: 'node.flag-value-inherit',
      style: {
        color: isDark ? '#e2e8f0' : '#334155',
        'font-weight': 600,
        'text-opacity': 1,
      },
    },
    {
      // Contained spatially but does not inherit the flag.
      selector: 'node.flag-contained-no-inherit',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#a855f7',
        'border-style': 'dashed',
        'background-opacity': 1,
        color: '#6b21a8',
        'text-opacity': 1,
        'font-weight': 600,
      },
    },
    {
      // Intersects a flag carrier — partial / approximate influence.
      selector: 'node.flag-intersect-partial',
      style: {
        opacity: 1,
        'border-width': 4,
        'border-color': '#f97316',
        'border-style': 'dashed',
        'background-opacity': 1,
        color: '#c2410c',
        'text-opacity': 1,
        'font-weight': 600,
      },
    },
    {
      selector: 'node.flag-value-no-inherit',
      style: {
        color: '#7e22ce',
        'font-weight': 800,
        'text-opacity': 1,
      },
    },
    {
      selector: 'node.flag-value-intersect',
      style: {
        color: '#ea580c',
        'font-weight': 700,
        'text-opacity': 1,
      },
    },
    {
      // Local flag value caption — same green glow as flag-define.
      selector: 'node.flag-value-define',
      style: {
        color: '#ecfdf5',
        'font-weight': 900,
        'text-opacity': 1,
        'text-outline-width': 2,
        'text-outline-color': '#047857',
        'text-outline-opacity': 0.9,
      },
    },
    {
      // Spatial-conflict participant — red glow (overrides define green when both).
      selector: 'node.flag-conflict-pair',
      style: {
        opacity: 1,
        'border-width': 5,
        'border-color': '#e74c3c',
        'background-opacity': 1,
        color: '#fef2f2',
        'text-opacity': 1,
        'font-weight': 800,
        'text-outline-width': 2,
        'text-outline-color': '#b91c1c',
        'text-outline-opacity': 0.9,
      },
    },
    {
      // Resolved spatial conflict (priority winner) — muted yellow dashed.
      selector: 'node.flag-conflict-pair-resolved',
      style: {
        opacity: 1,
        'border-width': 4.5,
        'border-color': '#c9a227',
        'border-style': 'dashed',
        'background-opacity': 1,
        color: '#3d3410',
        'text-opacity': 1,
        'font-weight': 700,
        'text-outline-width': 1.8,
        'text-outline-color': '#c9a227',
        'text-outline-opacity': 0.75,
      },
    },
    {
      selector: 'node.flag-conflict-pair-resolved.flag-value-define',
      style: {
        color: '#3d3410',
        'font-weight': 700,
        'text-outline-color': '#c9a227',
      },
    },
    {
      selector: 'node.flag-conflict-pair-resolved.flag-value-inherit',
      style: {
        color: '#3d3410',
        'font-weight': 700,
        'text-outline-width': 1.8,
        'text-outline-color': '#c9a227',
        'text-outline-opacity': 0.75,
      },
    },
    {
      selector: 'node.flag-conflict-pair.flag-value-define',
      style: {
        color: '#fef2f2',
        'font-weight': 800,
        'text-outline-color': '#b91c1c',
      },
    },
    {
      selector: 'node.flag-conflict-pair.flag-value-inherit',
      style: {
        color: '#fef2f2',
        'font-weight': 800,
        'text-outline-width': 2,
        'text-outline-color': '#b91c1c',
        'text-outline-opacity': 0.9,
      },
    },
    {
      selector: 'node.selected',
      style: {
        'border-width': 4,
        'border-color': '#2980b9',
      },
    },
    {
      selector: 'edge',
      style: {
        events: 'no',
      },
    },
    {
      selector: 'edge.hierarchy',
      style: {
        width: 6,
        'line-color': hierarchyColor,
        'target-arrow-color': hierarchyColor,
        'target-arrow-shape': 'triangle',
        'arrow-scale': 1.4,
        'curve-style': 'bezier',
      },
    },
    {
      selector: 'edge.intersects',
      style: {
        width: 1,
        'line-color': '#e67e22',
        'line-style': 'dashed',
        opacity: 0.6,
        'curve-style': 'bezier',
      },
    },
    {
      selector: 'edge.contains',
      style: {
        width: 2,
        'line-color': '#8e44ad',
        'target-arrow-color': '#8e44ad',
        'target-arrow-shape': 'triangle',
        opacity: 0.85,
        'curve-style': 'bezier',
      },
    },
    // Dim / path / conflict must come after base edge styles so overrides win.
    {
      // Hierarchy dim: faint via opacity (few edges when inheritance lights most).
      selector: 'edge.flag-dim-edge',
      style: {
        opacity: 0.12,
      },
    },
    {
      // Spatial dim intersects: washed dashed (same language as normal scheme;
      // bright flag-intersect stays solid so it stands out).
      selector: 'edge.intersects.flag-dim-edge',
      style: {
        opacity: 1,
        width: 1,
        'line-style': 'dashed',
        'line-color': isDark ? '#5a534c' : '#ead9c8',
        'curve-style': 'bezier',
        'target-arrow-shape': 'none',
      },
    },
    {
      selector: 'edge.contains.flag-dim-edge',
      style: {
        opacity: 1,
        width: 1,
        'line-style': 'solid',
        'line-color': isDark ? '#4e4858' : '#ddd0e6',
        'target-arrow-shape': 'none',
        'curve-style': 'haystack',
        'haystack-radius': 0,
      },
    },
    {
      selector: 'edge.flag-path-edge',
      style: {
        opacity: 1,
        width: 7,
        'line-color': '#1abc9c',
        'target-arrow-color': '#1abc9c',
      },
    },
    {
      selector: 'edge.flag-conflict-edge',
      style: {
        opacity: 1,
        width: 7,
        'line-color': '#ef4444',
        'target-arrow-color': '#ef4444',
        'line-style': 'solid',
      },
    },
    {
      selector: 'edge.flag-conflict-resolved-edge',
      style: {
        opacity: 1,
        width: 6.3,
        'line-color': '#c9a227',
        'target-arrow-color': '#c9a227',
        'line-style': 'dashed',
      },
    },
    {
      // Bright containment highlight — solid (color/width carry meaning; dash is costly).
      selector: 'edge.flag-no-inherit-edge',
      style: {
        opacity: 1,
        width: 3,
        'line-color': '#a855f7',
        'target-arrow-color': '#a855f7',
        'line-style': 'solid',
      },
    },
    {
      // Bright intersection highlight — solid haystack (no arrows on intersects).
      selector: 'edge.flag-intersect-edge',
      style: {
        opacity: 1,
        width: 3,
        'line-color': '#f97316',
        'line-style': 'solid',
        'curve-style': 'haystack',
        'haystack-radius': 0,
        'target-arrow-shape': 'none',
      },
    },
  ];
}
