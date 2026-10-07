import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { suggestFlags } from '../flagSuggestions';

const catalog = [
  { name: 'pvp', type: 'state', description: '' },
  { name: 'greeting', type: 'string', description: '' },
];

describe('suggestFlags', () => {
  it('returns full catalog for empty query', () => {
    assert.equal(suggestFlags(catalog, '').length, 2);
  });

  it('matches name substring case-insensitively', () => {
    assert.deepEqual(suggestFlags(catalog, 'PV').map((f) => f.name), ['pvp']);
  });

  it('matches type substring', () => {
    assert.deepEqual(suggestFlags(catalog, 'str').map((f) => f.name), ['greeting']);
  });
});
