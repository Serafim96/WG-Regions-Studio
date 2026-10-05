import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { RegionData, Scheme } from '../../types';
import { CROSS_FLAG_NAMES, findCrossFlagHits } from '../crossFlagRules';
import { runWorldGuardFlagChecks } from '../flagConflicts';

const here = dirname(fileURLToPath(import.meta.url));
const ruleFlags = JSON.parse(
  readFileSync(join(here, '../crossFlagRuleFlags.json'), 'utf8'),
) as string[];

function flags(entries: Record<string, unknown>): Map<string, unknown> {
  return new Map(Object.entries(entries));
}

function ids(entries: Record<string, unknown>): string[] {
  return findCrossFlagHits(flags(entries)).map((hit) => hit.ruleId);
}

function region(id: string, parent: string | null, regionFlags: Record<string, unknown>, priority = 0): RegionData {
  return {
    id,
    type: 'cuboid',
    parent,
    priority,
    flags: regionFlags,
    owners: {},
    members: {},
  };
}

function scheme(regions: RegionData[], spatialEdges: Scheme['spatialEdges'] = []): Scheme {
  return {
    schemaVersion: 1,
    sourceHash: 'test',
    sourcePath: 'test.yml',
    builtAt: '2026-01-01T00:00:00Z',
    regions,
    forest: { roots: [] },
    hierarchyEdges: [],
    spatialEdges,
    layout: {},
    metrics: { total: regions.length, by_type: {}, by_volume: [], by_points: [], by_intersections: [] },
  };
}

test('A1 fires when interact deny overrides use allow, and not when both allow', () => {
  assert.ok(ids({ interact: 'deny', use: 'allow' }).includes('A1'));
  assert.equal(ids({ interact: 'allow', use: 'allow' }).includes('A1'), false);
});

test('A2 and A3 need the wide deny', () => {
  assert.ok(ids({ 'block-break': 'deny', tnt: 'allow' }).includes('A2'));
  assert.equal(ids({ 'block-break': 'allow', tnt: 'allow' }).includes('A2'), false);
  assert.ok(ids({ 'block-place': 'deny', lighter: 'allow' }).includes('A3'));
  assert.equal(ids({ 'block-place': 'allow', lighter: 'allow' }).includes('A3'), false);
});

test('A4 fires only when a placement deny meets a fire allow', () => {
  assert.ok(ids({ lighter: 'deny', 'fire-spread': 'allow' }).includes('A4'));
  assert.equal(ids({ lighter: 'allow', 'fire-spread': 'allow' }).includes('A4'), false);
});

test('B1 and B2', () => {
  assert.ok(ids({ invincible: 'allow', pvp: 'allow' }).includes('B1'));
  assert.equal(ids({ invincible: 'deny', pvp: 'allow' }).includes('B1'), false);
  assert.ok(ids({ 'game-mode': 'creative', 'heal-amount': -1 }).includes('B2'));
  assert.equal(ids({ 'game-mode': 'survival', 'heal-amount': -1 }).includes('B2'), false);
});

test('C1 contradictory range and C2 delay zero versus negative', () => {
  assert.ok(ids({ 'heal-min-health': 10, 'heal-max-health': 4 }).includes('C1'));
  assert.equal(ids({ 'heal-min-health': 4, 'heal-max-health': 10 }).includes('C1'), false);
  assert.ok(ids({ 'heal-delay': 0, 'heal-amount': -2 }).includes('C2'));
  assert.equal(ids({ 'heal-delay': -1, 'heal-amount': -2 }).includes('C2'), false);
  assert.equal(ids({ 'heal-delay': 0, 'heal-amount': -2, 'heal-min-health': 6 }).includes('C2'), false);
});

test('D1, E1 and F rules', () => {
  assert.ok(ids({ 'allowed-cmds': ['/spawn'], 'blocked-cmds': ['/op'] }).includes('D1'));
  assert.equal(ids({ 'blocked-cmds': ['/op'] }).includes('D1'), false);
  assert.ok(ids({ exit: 'deny' }).includes('E1'));
  assert.equal(ids({ exit: 'deny', 'exit-via-teleport': 'deny' }).includes('E1'), false);
  assert.ok(ids({ 'entry-deny-message': 'no' }).includes('F1'));
  assert.equal(ids({ entry: 'deny', 'entry-deny-message': 'no' }).includes('F1'), false);
  assert.ok(ids({ 'exit-deny-message': 'no' }).includes('F2'));
  assert.equal(ids({ exit: 'deny', 'exit-deny-message': 'no' }).includes('F2'), false);
  assert.ok(ids({ 'heal-delay': 5 }).includes('F3'));
  assert.equal(ids({ 'heal-delay': 5, 'heal-amount': 2 }).includes('F3'), false);
  assert.ok(ids({ 'mob-spawning': 'deny', 'deny-spawn': ['creeper'] }).includes('F4'));
  assert.equal(ids({ 'mob-spawning': 'allow', 'deny-spawn': ['creeper'] }).includes('F4'), false);
});

test('different region groups suppress the pair', () => {
  const hits = findCrossFlagHits(flags({
    interact: 'deny',
    use: 'allow',
    'use-group': 'nonmembers',
  }));
  assert.equal(hits.some((hit) => hit.ruleId === 'A1'), false);
});

test('a child inherits the parent deny', () => {
  const result = runWorldGuardFlagChecks({
    scheme: scheme([
      region('parent', null, { interact: 'deny' }),
      region('child', 'parent', { use: 'allow' }),
    ]),
    flagsCatalog: [],
  });
  const hit = result.crossFlagConflicts.find((item) => item.regionId === 'child' && item.ruleId === 'A1');
  assert.ok(hit);
  assert.equal(hit?.scope, 'region');
  assert.equal(hit?.flags.find((flag) => flag.name === 'interact')?.definedBy, 'parent');
});

test('an overlap reports a pair that neither region has alone', () => {
  const result = runWorldGuardFlagChecks({
    scheme: scheme(
      [
        region('left', null, { interact: 'deny' }),
        region('right', null, { use: 'allow' }),
      ],
      [{ source: 'left', target: 'right', relation: 'intersects' }],
    ),
    flagsCatalog: [
      { name: 'interact', type: 'state', description: '' },
      { name: 'use', type: 'state', description: '' },
    ],
  });
  assert.equal(result.crossFlagConflicts.some((item) => item.scope === 'region'), false);
  const hit = result.crossFlagConflicts.find((item) => item.scope === 'overlap');
  assert.equal(hit?.ruleId, 'A1');
  assert.equal(hit?.regionId, 'left');
  assert.equal(hit?.otherRegionId, 'right');
});

test('rule flag names match the catalog checklist', () => {
  assert.deepEqual([...CROSS_FLAG_NAMES].sort(), [...ruleFlags].sort());
});

test('600 regions stay within a tenth of a second', () => {
  const regions: RegionData[] = [];
  const edges: Scheme['spatialEdges'] = [];
  for (let i = 0; i < 600; i += 1) {
    regions.push(region(`r${i}`, null, i % 20 === 0 ? { pvp: 'allow' } : {}));
    if (i > 0 && i % 3 === 0) {
      edges.push({ source: `r${i - 1}`, target: `r${i}`, relation: 'intersects' });
    }
  }
  const started = performance.now();
  runWorldGuardFlagChecks({ scheme: scheme(regions, edges), flagsCatalog: [] });
  assert.ok(performance.now() - started < 100);
});
