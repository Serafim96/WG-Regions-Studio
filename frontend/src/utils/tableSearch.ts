export function matchesMultiSelect(
  value: string | null | undefined,
  selected: Set<string>,
  total: number,
): boolean {
  if (selected.size === 0 || selected.size === total) return true;
  if (value == null) return true;
  return selected.has(value);
}

/** Substring match like scheme region search (case-insensitive). */
export function matchesTableSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export type PercentCompareOp = 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte';

export function matchesPercentFilter(
  value: number,
  op: PercentCompareOp,
  raw: string,
): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  const target = Number(trimmed);
  if (!Number.isFinite(target)) return true;
  switch (op) {
    case 'eq':
      return value === target;
    case 'ne':
      return value !== target;
    case 'gt':
      return value > target;
    case 'lt':
      return value < target;
    case 'gte':
      return value >= target;
    case 'lte':
      return value <= target;
    default:
      return true;
  }
}
