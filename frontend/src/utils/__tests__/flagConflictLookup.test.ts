import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SpatialConflict } from '../flagConflicts';
import { conflictsForDefinedFlag, spatialConflictFlagNameSets } from '../flagConflictLookup';

const conflicts: SpatialConflict[] = [
  { aId: 'a', bId: 'b', flagName: 'pvp', ambiguous: true },
  { aId: 'a', bId: 'c', flagName: 'greet', ambiguous: true },
  { aId: 'a', bId: 'd', flagName: 'pvp', ambiguous: false },
];

describe('spatialConflictFlagNameSets', () => {
  it('returns empty sets for empty input', () => {
    const { warningNames, undefinedNames } = spatialConflictFlagNameSets([]);
    assert.equal(warningNames.size, 0);
    assert.equal(undefinedNames.size, 0);
  });

  it('splits resolved and ambiguous flag names', () => {
    const list: SpatialConflict[] = [
      { aId: 'a', bId: 'b', flagName: 'sleep', ambiguous: false },
      { aId: 'a', bId: 'c', flagName: 'pvp', ambiguous: true },
    ];
    const { warningNames, undefinedNames } = spatialConflictFlagNameSets(list);
    assert.ok(warningNames.has('sleep'));
    assert.ok(!warningNames.has('pvp'));
    assert.ok(undefinedNames.has('pvp'));
    assert.ok(!undefinedNames.has('sleep'));
  });
});

describe('conflictsForDefinedFlag', () => {
  const regions = new Map([
    ['a', { parent: null, flags: { pvp: 'allow' } }],
    ['b', { parent: null, flags: { pvp: 'deny' } }],
    ['c', { parent: 'a', flags: {} }],
  ]);

  it('includes direct conflict when region defines flag', () => {
    const list = conflictsForDefinedFlag('a', 'pvp', conflicts, regions);
    assert.equal(list.length, 1);
    assert.equal(list[0].bId, 'b');
  });

  it('ignores non-ambiguous', () => {
    const list = conflictsForDefinedFlag('a', 'pvp', conflicts, regions);
    assert.ok(!list.some((c) => c.bId === 'd'));
  });
});
