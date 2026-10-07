import type { SpatialConflict } from './flagConflicts';

export interface SpatialConflictFlagNameSets {
  warningNames: ReadonlySet<string>;
  undefinedNames: ReadonlySet<string>;
}

/** Resolved intersections (ambiguous === false) vs unclear winner (ambiguous === true). */
export function spatialConflictFlagNameSets(
  spatialConflicts: SpatialConflict[],
): SpatialConflictFlagNameSets {
  const warningNames = new Set<string>();
  const undefinedNames = new Set<string>();
  for (const c of spatialConflicts) {
    if (c.ambiguous) {
      undefinedNames.add(c.flagName);
    } else {
      warningNames.add(c.flagName);
    }
  }
  return { warningNames, undefinedNames };
}

export function conflictsForDefinedFlag(
  regionId: string,
  flagName: string,
  spatialConflicts: SpatialConflict[],
  regionsById: Map<string, { parent?: string | null; flags?: Record<string, unknown> }>,
): SpatialConflict[] {
  const sourceOf = (id: string): string | null => {
    let current: string | null = id;
    while (current) {
      const region = regionsById.get(current);
      if (!region) return null;
      if (Object.prototype.hasOwnProperty.call(region.flags ?? {}, flagName)) {
        return current;
      }
      current = region.parent ?? null;
    }
    return null;
  };

  return spatialConflicts.filter((c) => {
    if (!c.ambiguous || c.flagName !== flagName) return false;
    const srcA = sourceOf(c.aId);
    const srcB = sourceOf(c.bId);
    return srcA === regionId || srcB === regionId;
  });
}
