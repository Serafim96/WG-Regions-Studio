import type { Core } from 'cytoscape';

export function applyRegionNodeStyles(cy: Core): void {
  cy.nodes().forEach((node) => {
    const shape = node.data('nodeShape') as string;
    if (shape === 'rectangle' || shape === 'ellipse') {
      node.style('shape', shape);
    }
  });
}
