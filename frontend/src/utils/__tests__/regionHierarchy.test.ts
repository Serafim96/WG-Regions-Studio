import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkCanAddChild } from '../regionHierarchy';

const map = new Map([
  ['p', { parent: null }],
  ['c', { parent: 'p' }],
  ['g', { parent: 'c' }],
  ['x', { parent: null }],
]);

describe('checkCanAddChild', () => {
  it('rejects self', () => {
    assert.deepEqual(checkCanAddChild('p', 'p', map), { ok: false, reason: 'self' });
  });

  it('rejects already child', () => {
    assert.deepEqual(checkCanAddChild('p', 'c', map), { ok: false, reason: 'already' });
  });

  it('rejects ancestor cycle', () => {
    assert.deepEqual(checkCanAddChild('g', 'p', map), { ok: false, reason: 'ancestor' });
  });

  it('allows free region', () => {
    assert.deepEqual(checkCanAddChild('p', 'x', map), { ok: true, moveFrom: null });
  });

  it('reports moveFrom when re-parenting', () => {
    assert.deepEqual(checkCanAddChild('x', 'c', map), { ok: true, moveFrom: 'p' });
  });
});
