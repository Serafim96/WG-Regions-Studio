/** Cytoscape stylesheet helpers. */

export const CLOUD_BG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 60">
      <path d="M25 45 Q10 45 10 30 Q10 15 25 15 Q30 5 50 10 Q65 0 80 15 Q100 10 110 30 Q115 45 95 45 Z"
        fill="#e8ecf8" stroke="#667" stroke-width="2"/>
    </svg>`,
  );

export function buildStylesheet() {
  return [
    {
      selector: 'node',
      style: {
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': 'data(fontSize)',
        color: '#222',
        'text-wrap': 'wrap',
        'text-max-width': 'data(textMaxWidth)',
        width: 'data(width)',
        height: 'data(height)',
        'background-color': 'data(color)',
        shape: 'ellipse',
        'border-width': 2,
        'border-color': '#333',
      },
    },
    {
      selector: 'node.cloud',
      style: {
        shape: 'round-rectangle',
        'background-image': CLOUD_BG,
        'background-fit': 'cover',
        'background-opacity': 0.9,
        'background-color': '#e8ecf8',
      },
    },
    {
      selector: 'node.manual',
      style: {
        'border-style': 'dashed',
        'border-color': '#c60',
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
        width: 2,
        'line-color': '#444',
        'target-arrow-color': '#444',
        'target-arrow-shape': 'triangle',
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
        width: 3,
        'line-color': '#8e44ad',
        'target-arrow-color': '#8e44ad',
        'target-arrow-shape': 'triangle',
        opacity: 0.8,
        'curve-style': 'bezier',
      },
    },
  ];
}
