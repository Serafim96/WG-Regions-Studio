import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchesMultiSelect } from '../tableSearch';

describe('matchesMultiSelect', () => {
  it('passes when selection empty or full', () => {
    assert.equal(matchesMultiSelect('a', new Set(), 3), true);
    assert.equal(matchesMultiSelect('a', new Set(['a', 'b', 'c']), 3), true);
  });

  it('filters by membership', () => {
    assert.equal(matchesMultiSelect('b', new Set(['a']), 3), false);
    assert.equal(matchesMultiSelect(null, new Set(['a']), 3), true);
  });
});
