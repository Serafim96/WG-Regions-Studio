import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveRowCategory } from '../effectiveRowCategory';

describe('effectiveRowCategory', () => {
  it('maps ambiguous to conflict', () => {
    assert.equal(effectiveRowCategory({ kind: 'ambiguous' }), 'conflict');
  });

  it('maps local without inheritType', () => {
    assert.equal(effectiveRowCategory({ kind: 'local' }), 'local');
  });

  it('maps inheritance types', () => {
    assert.equal(effectiveRowCategory({ kind: 'parent', inheritType: 'inheritance' }), 'inheritance');
    assert.equal(effectiveRowCategory({ kind: 'spatial', inheritType: 'containment' }), 'containment');
  });

  it('maps warning before ambiguous', () => {
    assert.equal(effectiveRowCategory({ kind: 'spatial', inheritType: 'warning' }), 'warning');
  });
});
