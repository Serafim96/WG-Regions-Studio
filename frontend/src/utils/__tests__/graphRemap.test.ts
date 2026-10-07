import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SpatialEdge } from '../../types';
import { remapSpatialEdges } from '../graph';

describe('remapSpatialEdges origins', () => {
  const parentMap = new Map<string, string | null>([
    ['child', 'group'],
    ['group', 'root'],
    ['root', null],
    ['other', 'root'],
  ]);

  it('accumulates origins when collapsing hidden nodes', () => {
    const edges: SpatialEdge[] = [
      { source: 'child', target: 'other', relation: 'intersects' },
    ];
    const hidden = new Set(['child']);
    const out = remapSpatialEdges(edges, hidden, parentMap);
    assert.equal(out.length, 1);
    assert.equal(out[0].source, 'group');
    assert.ok(out[0].origins && out[0].origins.length >= 1);
    assert.ok(out[0].origins!.some((o) => o.source === 'child' && o.target === 'other'));
  });

  it('has single origin without collapse', () => {
    const edges: SpatialEdge[] = [
      { source: 'child', target: 'other', relation: 'intersects' },
    ];
    const out = remapSpatialEdges(edges, new Set(), parentMap);
    assert.equal(out[0].origins?.length, 1);
    assert.equal(out[0].origins?.[0].source, 'child');
  });
});
