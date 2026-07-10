/** Cytoscape stylesheet helpers. */

import type { Theme } from '../utils/settings';

export function regionNodeShape(regionType: string): 'ellipse' | 'rectangle' {
  return regionType === 'manual' ? 'rectangle' : 'ellipse';
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
      selector: 'node.selected',
      style: {
        'border-width': 4,
        'border-color': '#2980b9',
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
  ];
}
