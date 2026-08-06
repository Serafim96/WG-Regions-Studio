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
      selector: 'node.flag-path',
      style: {
        opacity: 1,
        'border-width': 3,
        'border-color': '#16a085',
        'background-opacity': 0.82,
        color: '#0e6655',
        'text-opacity': 1,
        'font-weight': 500,
      },
    },
    {
      // Region that locally assigns the highlighted flag.
      selector: 'node.flag-define',
      style: {
        opacity: 1,
        'border-width': 5,
        'border-color': '#1abc9c',
        'background-opacity': 1,
        color: '#064e3b',
        'text-opacity': 1,
        'font-weight': 700,
      },
    },
    {
      // Inherited flag value caption (larger + bold).
      selector: 'node.flag-value-inherit',
      style: {
        color: '#0f766e',
        'font-weight': 700,
        'text-opacity': 1,
      },
    },
    {
      // Local flag value caption (larger + bold).
      selector: 'node.flag-value-define',
      style: {
        color: '#065f46',
        'font-weight': 800,
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
  ];
}
