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
      selector: 'node.flag-dim',
      style: {
        opacity: 0.18,
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
        color: '#475569',
        'text-opacity': 0.92,
        'font-weight': 400,
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
        color: '#064e3b',
        'text-opacity': 1,
        'font-weight': 800,
      },
    },
    {
      // Inherited flag value caption (muted vs define).
      selector: 'node.flag-value-inherit',
      style: {
        color: '#64748b',
        'font-weight': 500,
        'text-opacity': 0.9,
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
        'border-color': '#c2410c',
        'border-style': 'dashed',
        'background-opacity': 1,
        color: '#9a3412',
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
        color: '#c2410c',
        'font-weight': 700,
        'text-opacity': 1,
      },
    },
    {
      // Local flag value caption (stronger than inherit).
      selector: 'node.flag-value-define',
      style: {
        color: '#065f46',
        'font-weight': 900,
        'text-opacity': 1,
      },
    },
    {
      // Spatial-conflict participant while a flag highlight is active.
      selector: 'node.flag-conflict-pair',
      style: {
        opacity: 1,
        'border-width': 5,
        'border-color': '#e74c3c',
        'background-opacity': 1,
        color: '#7f1d1d',
        'text-opacity': 1,
        'font-weight': 800,
      },
    },
    {
      selector: 'node.flag-conflict-pair.flag-value-define',
      style: {
        color: '#7f1d1d',
        'font-weight': 800,
      },
    },
    {
      selector: 'node.flag-conflict-pair.flag-value-inherit',
      style: {
        color: '#b91c1c',
        'font-weight': 800,
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
    // Dim / path / conflict must come after base edge styles so opacity wins.
    {
      selector: 'edge.flag-dim-edge',
      style: {
        opacity: 0.12,
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
        width: 4,
        'line-color': '#e74c3c',
        'target-arrow-color': '#e74c3c',
        'line-style': 'solid',
      },
    },
    {
      selector: 'edge.flag-no-inherit-edge',
      style: {
        opacity: 1,
        width: 3,
        'line-color': '#a855f7',
        'target-arrow-color': '#a855f7',
        'line-style': 'dashed',
      },
    },
    {
      selector: 'edge.flag-intersect-edge',
      style: {
        opacity: 1,
        width: 3,
        'line-color': '#c2410c',
        'target-arrow-color': '#c2410c',
        'line-style': 'dashed',
      },
    },
  ];
}
