import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FlagSchemeCoverageResponse } from '../../api';
import type { RegionData, Scheme } from '../../types';
import { applyFlagSchemeCoverage } from '../flagSchemeCoverage';
import { buildFlagHighlight } from '../flagTree';

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === 'flagCoverage.mixed' && params?.count) return `mixed:${params.count}`;
  if (key === 'flagCoverage.undefined') return 'undefined';
  if (key === 'app.flagCoveragePartial') return 'partial';
  return key;
};

function cuboid(
  id: string,
  flags: Record<string, unknown>,
  opts: { parent?: string | null; priority?: number } = {},
): RegionData {
  return {
    id,
    type: 'cuboid',
    parent: opts.parent ?? null,
    priority: opts.priority ?? 0,
    flags,
    owners: {},
    members: {},
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
  };
}

function emptyScheme(
  regions: RegionData[],
  spatialEdges: Scheme['spatialEdges'] = [],
  hierarchyEdges: Scheme['hierarchyEdges'] = [],
): Scheme {
  return {
    schemaVersion: 1,
    sourceHash: 'x',
    sourcePath: '',
    builtAt: '',
    regions,
    forest: { roots: [] },
    hierarchyEdges,
    spatialEdges,
    layout: {},
    metrics: { total: regions.length, by_type: {}, by_volume: [], by_points: [], by_intersections: [] },
  };
}

const emptyCoverage = (flag: string): FlagSchemeCoverageResponse => ({
  flag,
  regions: {},
  intersects: [],
});

describe('applyFlagSchemeCoverage intersect labels', () => {
  it('only attaches labels to highlighted intersect edge keys', () => {
    const scheme = emptyScheme(
      [cuboid('x', { pvp: 'allow' }), cuboid('y', { pvp: 'deny' }, { priority: 1 })],
      [
        { source: 'x', target: 'y', relation: 'intersects' },
        { source: 'y', target: 'x', relation: 'intersects' },
      ],
    );
    const base = buildFlagHighlight(scheme, 'pvp', {
      showInheritance: false,
      showContains: false,
      showIntersects: true,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {},
      intersects: [
        {
          aId: 'x',
          bId: 'y',
          label: 'mixed:2',
          ambiguous: true,
          groups: [],
        },
      ],
    };
    const merged = applyFlagSchemeCoverage(base, coverage, scheme, t);
    const k = 'intersects-x-y';
    if (base.intersectPartialEdgeKeys?.has(k)) {
      assert.ok(merged.intersectEdgeLabels?.has(k));
      assert.equal(merged.intersectEdgeLabels?.get(k), 'mixed:2');
    } else {
      assert.equal(merged.intersectEdgeLabels?.has(k), false);
    }
  });
});

describe('applyFlagSchemeCoverage containment and hierarchy labels', () => {
  it('labels child→root containment with parent inheritance as ←hello', () => {
    const scheme = emptyScheme(
      [
        cuboid('root', { greeting: 'hello' }),
        cuboid('child', {}, { parent: 'root' }),
      ],
      [{ source: 'child', target: 'root', relation: 'contains' }],
      [{ source: 'root', target: 'child' }],
    );
    const base = buildFlagHighlight(scheme, 'greeting', {
      showInheritance: true,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const merged = applyFlagSchemeCoverage(base, emptyCoverage('greeting'), scheme, t);
    assert.equal(merged.containsEdgeLabels?.get('contains-child-root'), '←hello');
    assert.equal(merged.hierarchyEdgeLabels?.get('root->child'), 'hello→');
  });

  it('labels equal coverage labels at equal priority as ←allow', () => {
    const scheme = emptyScheme(
      [
        cuboid('outer', { pvp: 'allow' }, { priority: 0 }),
        cuboid('inner', { pvp: 'allow' }, { priority: 0 }),
      ],
      [{ source: 'inner', target: 'outer', relation: 'contains' }],
    );
    const base = buildFlagHighlight(scheme, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {
        inner: { label: 'allow', groups: [] },
        outer: { label: 'allow', groups: [] },
      },
      intersects: [],
    };
    const merged = applyFlagSchemeCoverage(base, coverage, scheme, t);
    assert.equal(merged.containsEdgeLabels?.get('contains-inner-outer'), '←allow');
  });

  it('labels equal coverage labels with higher inner priority as allow→', () => {
    const scheme = emptyScheme(
      [
        cuboid('outer', { pvp: 'allow' }, { priority: 0 }),
        cuboid('inner', { pvp: 'allow' }, { priority: 2 }),
      ],
      [{ source: 'inner', target: 'outer', relation: 'contains' }],
    );
    const base = buildFlagHighlight(scheme, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {
        inner: { label: 'allow', groups: [] },
        outer: { label: 'allow', groups: [] },
      },
      intersects: [],
    };
    const merged = applyFlagSchemeCoverage(base, coverage, scheme, t);
    assert.equal(merged.containsEdgeLabels?.get('contains-inner-outer'), 'allow→');
  });

  it('labels rival→root containment without parent as hello→⮾', () => {
    const scheme = emptyScheme(
      [
        cuboid('root', { greeting: 'hello' }),
        cuboid('rival', { greeting: 'bye' }, { priority: 3 }),
      ],
      [{ source: 'rival', target: 'root', relation: 'contains' }],
    );
    const base = buildFlagHighlight(scheme, 'greeting', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const merged = applyFlagSchemeCoverage(base, emptyCoverage('greeting'), scheme, t);
    assert.equal(merged.containsEdgeLabels?.get('contains-rival-root'), 'hello→⮾');
  });

  it('labels hierarchy edge blocked when child sets its own value', () => {
    const scheme = emptyScheme(
      [
        cuboid('root', { greeting: 'hello' }),
        cuboid('child', { greeting: 'bye' }, { parent: 'root' }),
      ],
      [],
      [{ source: 'root', target: 'child' }],
    );
    const base = buildFlagHighlight(scheme, 'greeting', {
      showInheritance: true,
      showContains: false,
      showIntersects: false,
      showConflicts: false,
    });
    const merged = applyFlagSchemeCoverage(base, emptyCoverage('greeting'), scheme, t);
    assert.equal(merged.hierarchyEdgeLabels?.get('root->child'), 'hello→⮾');
  });
});
