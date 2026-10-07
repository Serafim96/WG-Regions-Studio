import { describe, expect, it } from 'vitest';
import { formatCoveragePercent } from '../formatCoveragePercent';

describe('formatCoveragePercent', () => {
  it('uses one decimal for normal values', () => {
    expect(formatCoveragePercent(12.34)).toBe('12.3%');
  });

  it('shows tiny non-zero values without rounding to 0.0', () => {
    expect(formatCoveragePercent(0.000001)).toBe('0.000001%');
  });

  it('compresses very long zero runs', () => {
    const s = formatCoveragePercent(1e-12, 8);
    expect(s).toMatch(/^0\.0\.\./);
    expect(s.endsWith('%')).toBe(true);
  });
});
