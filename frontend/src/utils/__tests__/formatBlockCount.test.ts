import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBlockCount } from '../volume';

test('formatBlockCount groups thousands with dots', () => {
  assert.equal(formatBlockCount(1234567), '1.234.567');
  assert.equal(formatBlockCount(-42), '-42');
  assert.equal(formatBlockCount(0), '0');
});
