import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Scheme } from '../../types';
import {
  flowLabelFlipped,
  intersectEdgeLabelPlacement,
  mirrorFlowLabel,
  shouldMirrorFlowLabel,
} from '../../components/graph/intersectEdgeLabels';
import { FLAG_EDGE_CLASSES } from '../../components/graph/highlightOverlay';
import {
  ambiguousEdgeLabelsForFocusedPair,
  attachFlagConflicts,
  buildFlagHighlight,
  enrichHighlightWithFlagValues,
  spatialConflictEdgeLabel,
} from '../flagTree';

function miniScheme(): Scheme {
  return {
    schemaVersion: 1,
    sourceHash: 'x',
    sourcePath: '',
    builtAt: '',
    regions: [
      {
        id: 'a',
        type: 'cuboid',
        parent: null,
        priority: -1,
        flags: { passthrough: 'allow' },
        owners: {},
        members: {},
        min: { x: 0, y: 0, z: 0 },
        max: { x: 20, y: 10, z: 20 },
      },
      {
        id: 'b',
        type: 'cuboid',
        parent: null,
        priority: 0,
        flags: {},
        owners: {},
        members: {},
        min: { x: 2, y: 0, z: 2 },
        max: { x: 4, y: 10, z: 4 },
      },
    ],
    forest: { roots: [] },
    hierarchyEdges: [],
    spatialEdges: [
      { source: 'b', target: 'a', relation: 'contains' },
    ],
    layout: {},
    metrics: { total: 2, by_type: {}, by_volume: [], by_points: [], by_intersections: [] },
  };
}

describe('passthrough spatial highlight', () => {
  it('does not mark contained regions for passthrough', () => {
    const scheme = miniScheme();
    const hl = buildFlagHighlight(scheme, 'passthrough', {
      showInheritance: false,
      showContains: true,
      showIntersects: true,
      showConflicts: false,
    });
    assert.equal(hl.containedNoInheritIds?.has('b') ?? false, false);
    assert.equal(hl.brightIds.has('b'), false);
    const enriched = enrichHighlightWithFlagValues(hl, scheme, 'passthrough', [
      { name: 'passthrough', type: 'state', description: '' },
    ]);
    assert.equal(enriched.valueLabels?.has('b'), false);
  });

  it('expands brightIds via parent inheritance for passthrough', () => {
    const scheme = miniScheme();
    scheme.regions[1].parent = 'a';
    scheme.hierarchyEdges = [{ source: 'a', target: 'b', relation: 'parent' }];
    const hl = buildFlagHighlight(scheme, 'passthrough', {
      showInheritance: true,
      showContains: true,
      showIntersects: true,
      showConflicts: false,
    });
    assert.equal(hl.brightIds.has('a'), true);
    assert.equal(hl.brightIds.has('b'), true);
  });

  it('lights contains edges when both ends inherit the flag', () => {
    const scheme: Scheme = {
      ...miniScheme(),
      regions: [
        {
          id: 'root',
          type: 'cuboid',
          parent: null,
          priority: 0,
          flags: { greeting: 'hi' },
          owners: {},
          members: {},
          min: { x: 0, y: 0, z: 0 },
          max: { x: 100, y: 10, z: 100 },
        },
        {
          id: 'child',
          type: 'cuboid',
          parent: 'root',
          priority: 0,
          flags: {},
          owners: {},
          members: {},
          min: { x: 10, y: 0, z: 10 },
          max: { x: 20, y: 10, z: 20 },
        },
        {
          id: 'grand',
          type: 'cuboid',
          parent: 'child',
          priority: 0,
          flags: {},
          owners: {},
          members: {},
          min: { x: 12, y: 0, z: 12 },
          max: { x: 14, y: 10, z: 14 },
        },
      ],
      hierarchyEdges: [
        { source: 'root', target: 'child', relation: 'parent' },
        { source: 'child', target: 'grand', relation: 'parent' },
      ],
      spatialEdges: [
        { source: 'child', target: 'root', relation: 'contains' },
        { source: 'grand', target: 'child', relation: 'contains' },
      ],
    };
    const hl = buildFlagHighlight(scheme, 'greeting', {
      showInheritance: true,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    assert.ok(hl.containedNoInheritEdgeKeys?.has('contains-child-root'));
    assert.ok(hl.containedNoInheritEdgeKeys?.has('contains-grand-child'));
  });

  it('still marks containment for pvp', () => {
    const scheme = miniScheme();
    scheme.regions[0].flags = { pvp: 'allow' };
    const hl = buildFlagHighlight(scheme, 'pvp', {
      showInheritance: false,
      showContains: true,
      showIntersects: false,
      showConflicts: false,
    });
    assert.equal(hl.containedNoInheritIds?.has('b'), true);
  });
});

describe('focused ambiguous conflict edge labels', () => {
  const t = (key: 'flagConflicts.warningEquals' | 'flagConflicts.edgeUndefined') =>
    key === 'flagConflicts.edgeUndefined' ? 'неопределено' : '?';

  it('maps undefined label to both edge keys', () => {
    const label = spatialConflictEdgeLabel({ ambiguous: true }, t);
    const map = ambiguousEdgeLabelsForFocusedPair('intersects', 'a', 'b', label);
    assert.equal(label, 'неопределено');
    assert.equal(map.get('intersects-a-b'), 'неопределено');
    assert.equal(map.get('intersects-b-a'), 'неопределено');
  });
});

describe('FLAG_EDGE_CLASSES conflict reset', () => {
  it('includes resolved and labeled conflict edge classes', () => {
    assert.ok(FLAG_EDGE_CLASSES.includes('flag-conflict-resolved-edge'));
    assert.ok(FLAG_EDGE_CLASSES.includes('flag-conflict-labeled-edge'));
    assert.ok(FLAG_EDGE_CLASSES.includes('flag-conflict-resolved-labeled-edge'));
  });
});

describe('intersect edge label placement', () => {
  const text = 'allow';
  const extent = { x1: 0, y1: 0, x2: 100, y2: 100 };

  it('uses center label when both endpoints are in extent', () => {
    const fields = intersectEdgeLabelPlacement(
      text,
      '(1%)',
      '(2%)',
      { x: 10, y: 10 },
      { x: 90, y: 90 },
      extent,
    );
    assert.equal(fields.intersectCenterLabel, text);
    assert.equal(fields.intersectSourceLabel, '(1%)');
    assert.equal(fields.intersectTargetLabel, '(2%)');
  });

  it('uses endpoint labels when one end is outside extent', () => {
    const fields = intersectEdgeLabelPlacement(
      text,
      '(1%)',
      '',
      { x: 10, y: 10 },
      { x: 200, y: 200 },
      extent,
    );
    assert.equal(fields.intersectCenterLabel, '');
    assert.equal(fields.intersectSourceLabel, '(1%) allow');
    assert.equal(fields.intersectTargetLabel, '');
  });
});

describe('flow label mirror (autorotate flip)', () => {
  const forms = [
    { canonical: '←hello', mirrored: 'hello→' },
    { canonical: 'hello→', mirrored: '←hello' },
    { canonical: 'hello→⮾', mirrored: '⮾←hello' },
    { canonical: 'bye←⮾', mirrored: '⮾→bye' },
  ] as const;

  for (const { canonical, mirrored } of forms) {
    it(`mirrors ${canonical} → ${mirrored}`, () => {
      assert.equal(mirrorFlowLabel(canonical), mirrored);
      assert.equal(mirrorFlowLabel(mirrored), canonical);
    });
  }

  it('flowLabelFlipped is false when target is not left of source', () => {
    assert.equal(flowLabelFlipped({ x: 0, y: 0 }, { x: 10, y: 0 }), false);
    assert.equal(flowLabelFlipped({ x: 10, y: 0 }, { x: 10, y: 0 }), false);
  });

  it('flowLabelFlipped is true when target is left of source', () => {
    assert.equal(flowLabelFlipped({ x: 20, y: 0 }, { x: 5, y: 0 }), true);
  });

  it('contains ←hello mirrors only when dx < 0 (flipped)', () => {
    const canonical = '←hello';
    assert.equal(shouldMirrorFlowLabel(canonical, false, 'contains'), false);
    assert.equal(shouldMirrorFlowLabel(canonical, true, 'contains'), true);
  });

  it('contains bye→ and bye→⮾ mirror only when dx >= 0 (not flipped)', () => {
    for (const canonical of ['bye→', 'bye→⮾'] as const) {
      assert.equal(shouldMirrorFlowLabel(canonical, false, 'contains'), true);
      assert.equal(shouldMirrorFlowLabel(canonical, true, 'contains'), false);
    }
  });

  it('hierarchy hello→ mirrors only when dx < 0 (flipped)', () => {
    const canonical = 'hello→';
    assert.equal(shouldMirrorFlowLabel(canonical, false, 'hierarchy'), false);
    assert.equal(shouldMirrorFlowLabel(canonical, true, 'hierarchy'), true);
  });
});

describe('attachFlagConflicts', () => {
  it('does not add node ids for contains; adds intersects winner pair', () => {
    const base = buildFlagHighlight(miniScheme(), 'greeting', {
      showInheritance: false,
      showContains: true,
      showIntersects: true,
      showConflicts: false,
    });
    const hl = attachFlagConflicts(
      base,
      [
        {
          flagName: 'greeting',
          relation: 'contains',
          aId: 'rival',
          bId: 'root',
          ambiguous: false,
          winnerValue: 'bye',
        },
        {
          flagName: 'greeting',
          relation: 'intersects',
          aId: 'x',
          bId: 'y',
          ambiguous: false,
          winnerValue: 'allow',
        },
      ],
      'greeting',
    );
    assert.equal(hl.resolvedConflictIds?.has('rival'), false);
    assert.equal(hl.resolvedConflictIds?.has('root'), false);
    assert.ok(hl.resolvedConflictIds?.has('x'));
    assert.ok(hl.resolvedConflictIds?.has('y'));
  });
});
