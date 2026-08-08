import type { RegionData, Scheme } from '../types';

/** Temporary draft region added in the UI (not from YAML). */
export function isTemporaryRegion(region: RegionData | undefined): boolean {
  if (!region) return false;
  if (region.type === 'manual') return true;
  return region.is_manual === true;
}

export function collectDeletableRegionIds(scheme: Scheme | null): Set<string> {
  const ids = new Set<string>();
  if (!scheme) return ids;
  for (const region of scheme.regions) {
    if (isTemporaryRegion(region)) {
      ids.add(region.id);
    }
  }
  return ids;
}
