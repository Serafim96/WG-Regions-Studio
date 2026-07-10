/** Cytoscape stylesheet helpers. */

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
      selector: 'node.global',
      style: {
        'background-color': '#f5f5f5',
        'border-color': '#888',
      },
    },
    {
      selector: 'node.manual',
      style: {
        'background-color': '#f5f5f5',
        'border-style': 'dashed',
        'border-color': '#c60',
      },
    },
    {
      selector: 'node.orphan',
      style: {
        'background-color': '#ffdddd',
        'border-color': '#cc0000',
        color: '#900',
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
        'line-color': '#222',
        'target-arrow-color': '#222',
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
