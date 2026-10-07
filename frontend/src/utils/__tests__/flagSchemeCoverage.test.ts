import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { FlagSchemeCoverageResponse } from '../../api';
import type { Scheme } from '../../types';
import { filterSpatialMarksByCoverage } from '../flagSchemeCoverage';
import { buildFlagHighlight } from '../flagTree';

function scheme(): Scheme {
  return {
    schemaVersion: 1,
    sourceHash: 'x',
    sourcePath: '',
    builtAt: '',
    regions: [
      {
        id: 'R',
        type: 'cuboid',
        parent: null,
        priority: 0,
        flags: {},
        owners: {},
        members: {},
        min: { x: 0, y: 0, z: 0 },
        max: { x: 10, y: 10, z: 10 },
      },
      {
        id: 'C',
        type: 'cuboid',
        parent: null,
        priority: -1,
        flags: { pvp: 'allow' },
        owners: {},
        members: {},
        min: { x: 0, y: 0, z: 0 },
        max: { x: 20, y: 10, z: 20 },
      },
      {
        id: 'D',
        type: 'cuboid',
        parent: null,
        priority: 5,
        flags: { pvp: 'deny' },
        owners: {},
        members: {},
        min: { x: 0, y: 0, z: 0 },
        max: { x: 20, y: 10, z: 20 },
      },
    ],
    forest: { roots: [] },
    hierarchyEdges: [],
    spatialEdges: [
      { source: 'R', target: 'C', relation: 'contains' },
      { source: 'R', target: 'D', relation: 'contains' },
    ],
    layout: {},
    metrics: { total: 3, by_type: {}, by_volume: [], by_points: [], by_intersections: [] },
  };
}

describe('filterSpatialMarksByCoverage', () => {
  it('keeps only containment edge backed by coverage winner', () => {
    const s = scheme();
    const base = buildFlagHighlight(s, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {
        R: {
          regionId: 'R',
          totalVolume: 1000,
          label: 'deny',
          groups: [
            {
              flag: 'pvp',
              value: 'deny',
              percent: 100,
              blocks: 1000,
              viaRegion: 'D',
              definedIn: 'D',
              kind: 'spatial',
              inheritType: 'containment',
            },
          ],
        },
      },
      intersects: [],
    };
    const filtered = filterSpatialMarksByCoverage(base, coverage);
    assert.equal(filtered.containedNoInheritEdgeKeys?.has('contains-R-C'), true);
    assert.equal(filtered.containedNoInheritEdgeKeys?.has('contains-R-D'), true);
    assert.equal(filtered.containedNoInheritIds?.has('R'), true);
  });

  it('drops contained marks when coverage has no groups for region', () => {
    const s = scheme();
    const base = buildFlagHighlight(s, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {},
      intersects: [],
    };
    const filtered = filterSpatialMarksByCoverage(base, coverage);
    assert.equal(filtered.containedNoInheritIds?.has('R') ?? false, false);
  });

  it('keeps contains/intersects when one end carries the flag', () => {
    const s = scheme();
    s.regions.push({
      id: 'N1',
      type: 'cuboid',
      parent: 'C',
      priority: 0,
      flags: {},
      owners: {},
      members: {},
      min: { x: 2, y: 0, z: 2 },
      max: { x: 8, y: 10, z: 8 },
    });
    s.regions.push({
      id: 'N2',
      type: 'cuboid',
      parent: 'C',
      priority: 0,
      flags: {},
      owners: {},
      members: {},
      min: { x: 12, y: 0, z: 2 },
      max: { x: 18, y: 10, z: 8 },
    });
    s.spatialEdges.push(
      { source: 'N1', target: 'N2', relation: 'intersects' },
      { source: 'N1', target: 'C', relation: 'contains' },
      { source: 'N2', target: 'C', relation: 'contains' },
    );
    const base = buildFlagHighlight(s, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: true,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = {
      flag: 'pvp',
      regions: {
        C: {
          regionId: 'C',
          totalVolume: 1000,
          label: 'allow',
          groups: [
            {
              flag: 'pvp',
              value: 'allow',
              percent: 100,
              blocks: 1000,
              viaRegion: 'C',
              definedIn: 'C',
              kind: 'spatial',
              inheritType: 'containment',
            },
          ],
        },
      },
      intersects: [],
    };
    const filtered = filterSpatialMarksByCoverage(base, coverage);
    assert.equal(filtered.containedNoInheritEdgeKeys?.has('contains-N1-C'), true);
    assert.equal(filtered.containedNoInheritEdgeKeys?.has('contains-N2-C'), true);
    assert.equal(filtered.intersectPartialEdgeKeys?.has('intersects-N1-N2'), true);
  });

  it('does not change passthrough highlight sets', () => {
    const s = scheme();
    s.regions[1].flags = { passthrough: 'allow' };
    const base = buildFlagHighlight(s, 'passthrough', {
      showInheritance: true,
      showContains: true,
      showIntersects: true,
      showConflicts: false,
    });
    const coverage: FlagSchemeCoverageResponse = { flag: 'passthrough', regions: {}, intersects: [] };
    const filtered = filterSpatialMarksByCoverage(base, coverage);
    assert.deepEqual(filtered.containedNoInheritIds, base.containedNoInheritIds);
    assert.deepEqual(filtered.intersectPartialIds, base.intersectPartialIds);
  });
});
