import type { FlagInfo } from '../types';
import { findFlagInfo } from '../components/FlagHelpButton';

export interface FlagRowLike {
  name: string;
  value: string;
}

/** Empty rows are ignored; incomplete / unknown names fail validation. */
export function validateFlagRows(
  rows: FlagRowLike[],
  flagsCatalog: FlagInfo[],
): { ok: true } | { ok: false; errorKey: 'flags.incomplete' | 'flags.unknownName' } {
  for (const row of rows) {
    const name = row.name.trim();
    const value = row.value.trim();
    if (!name && !value) continue;
    if (!name || !value) {
      return { ok: false, errorKey: 'flags.incomplete' };
    }
    if (!findFlagInfo(flagsCatalog, name)) {
      return { ok: false, errorKey: 'flags.unknownName' };
    }
  }
  return { ok: true };
}
