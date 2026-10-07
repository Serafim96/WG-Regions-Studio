import type { FlagInfo } from '../types';

export function suggestFlags(catalog: FlagInfo[], query: string): FlagInfo[] {
  const q = query.trim().toLowerCase();
  return !q
    ? catalog
    : catalog.filter(
      (f) => f.name.toLowerCase().includes(q) || f.type.toLowerCase().includes(q),
    );
}
