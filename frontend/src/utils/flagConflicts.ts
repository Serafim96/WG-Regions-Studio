import type { FlagInfo, RegionData, Scheme, SpatialEdge } from '../types';

/** Child locally overrides a flag inherited from parent (not a real conflict). */
export interface FlagOverwrite {
  flagName: string;
  parentId: string;
  childId: string;
  parentValue: unknown;
  childValue: unknown;
}

export interface SpatialConflict {
  flagName: string;
  relation: SpatialEdge['relation'];
  aId: string;
  bId: string;
  aPriority: number;
  bPriority: number;
  aValue: unknown;
  bValue: unknown;
  winnerId: string | undefined;
  winnerValue: unknown | undefined;
  /** True when WorldGuard cannot pick a single clear winner. */
  ambiguous: boolean;
  undefinedReason?: string;
  /** Lowest common ancestor in the parent tree (if any). */
  commonAncestorId: string | null;
}

export interface FlagConflictsResult {
  hardErrors: string[];
  warningSummary: {
    overwriteCount: number;
    spatialResolvedCount: number;
    spatialAmbiguousCount: number;
    /** Ambiguous spatial only — used for sidebar warning. */
    totalCount: number;
  };
  conflictRegionIds: Set<string>;
  /** Spatial conflicts resolved by priority (warning category). */
  resolvedConflictRegionIds: Set<string>;
  resolvedConflictEdgeKeys: Set<string>;
  overwrites: FlagOverwrite[];
  spatialConflicts: SpatialConflict[];
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number' || t === 'boolean') return String(value);
  if (t === 'undefined') return 'undefined';
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function detectParentCycle(regions: RegionData[]): string[] {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const parentMap = new Map<string, string | null>(regions.map((r) => [r.id, r.parent]));

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];

  function dfs(id: string) {
    if (visiting.has(id)) {
      cycles.push(`Cycle detected involving region '${id}'`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = parentMap.get(id);
    if (parent && byId.has(parent)) dfs(parent);
    visiting.delete(id);
    visited.add(id);
  }

  for (const r of regions) dfs(r.id);
  return cycles;
}

function computeAllFlagNames(scheme: Scheme): string[] {
  const set = new Set<string>();
  for (const r of scheme.regions) {
    for (const k of Object.keys(r.flags || {})) set.add(k);
  }
  return Array.from(set).sort();
}

function buildParentMap(scheme: Scheme): Map<string, string | null> {
  return new Map(scheme.regions.map((r) => [r.id, r.parent]));
}

function isAncestor(
  ancestorId: string,
  descendantId: string,
  parentMap: Map<string, string | null>,
): boolean {
  let current: string | null | undefined = descendantId;
  const seen = new Set<string>();
  while (current) {
    if (current === ancestorId) return true;
    if (seen.has(current)) break;
    seen.add(current);
    current = parentMap.get(current) ?? null;
  }
  return false;
}

/** Lowest common ancestor in the parent tree, or null if none. */
export function findCommonAncestor(
  aId: string,
  bId: string,
  parentMap: Map<string, string | null>,
): string | null {
  const seen = new Set<string>();
  let current: string | null | undefined = aId;
  while (current) {
    seen.add(current);
    current = parentMap.get(current) ?? null;
  }
  current = bId;
  while (current) {
    if (seen.has(current)) return current;
    current = parentMap.get(current) ?? null;
  }
  return null;
}

export function computeEffectiveFlagsByRegion(
  scheme: Scheme,
): Map<string, Map<string, unknown>> {
  const regionsById = new Map(scheme.regions.map((r) => [r.id, r]));
  const parentMap = buildParentMap(scheme);
  const memo = new Map<string, Map<string, unknown>>();

  function walk(id: string): Map<string, unknown> {
    const cached = memo.get(id);
    if (cached) return cached;

    const region = regionsById.get(id);
    if (!region) {
      const empty = new Map<string, unknown>();
      memo.set(id, empty);
      return empty;
    }

    const parentId = parentMap.get(id);
    const parentEffective = parentId ? walk(parentId) : new Map<string, unknown>();
    const effective = new Map<string, unknown>(parentEffective);
    for (const [k, v] of Object.entries(region.flags || {})) {
      effective.set(k, v);
    }
    memo.set(id, effective);
    return effective;
  }

  for (const r of scheme.regions) walk(r.id);
  return memo;
}

function pickWinnerForSpatial(
  aId: string,
  bId: string,
  aDefined: boolean,
  bDefined: boolean,
  aValue: unknown,
  bValue: unknown,
  aPriority: number,
  bPriority: number,
): {
  winnerId: string | undefined;
  winnerValue: unknown | undefined;
  ambiguous: boolean;
  undefinedReason?: string;
} {
  const candidates: Array<{ id: string; priority: number; value: unknown }> = [];
  if (aDefined) candidates.push({ id: aId, priority: aPriority, value: aValue });
  if (bDefined) candidates.push({ id: bId, priority: bPriority, value: bValue });

  if (candidates.length === 1) {
    return {
      winnerId: candidates[0].id,
      winnerValue: candidates[0].value,
      ambiguous: false,
    };
  }

  if (candidates.length === 0) {
    return {
      winnerId: undefined,
      winnerValue: undefined,
      ambiguous: true,
      undefinedReason: 'No defined value',
    };
  }

  const maxPriority = Math.max(...candidates.map((c) => c.priority));
  const top = candidates.filter((c) => c.priority === maxPriority);

  if (top.length === 1) {
    return {
      winnerId: top[0].id,
      winnerValue: top[0].value,
      ambiguous: false,
    };
  }

  // Equal priority: WorldGuard may pick either region (order / internal rules vary).
  // Treat as a dangerous superposition → errors in the bell, not a "clear winner".
  return {
    winnerId: undefined,
    winnerValue: undefined,
    ambiguous: true,
    undefinedReason: 'equal max priority',
  };
}

export function runWorldGuardFlagChecks({
  scheme,
  flagsCatalog,
  precomputedEffective,
}: {
  scheme: Scheme;
  flagsCatalog: FlagInfo[];
  /** Optional precomputed effective flags (avoids a second walk). */
  precomputedEffective?: Map<string, Map<string, unknown>>;
}): FlagConflictsResult {
  const hardErrors = detectParentCycle(scheme.regions);
  if (hardErrors.length > 0) {
    return {
      hardErrors,
      warningSummary: {
        overwriteCount: 0,
        spatialResolvedCount: 0,
        spatialAmbiguousCount: 0,
        totalCount: 0,
      },
      conflictRegionIds: new Set(),
      resolvedConflictRegionIds: new Set(),
      resolvedConflictEdgeKeys: new Set(),
      overwrites: [],
      spatialConflicts: [],
    };
  }

  const conflictRegionIds = new Set<string>();
  const resolvedConflictRegionIds = new Set<string>();
  const resolvedConflictEdgeKeys = new Set<string>();
  const allFlagNames = computeAllFlagNames(scheme);
  const effectiveByRegion = precomputedEffective ?? computeEffectiveFlagsByRegion(scheme);
  const parentMap = buildParentMap(scheme);
  const regionsById = new Map(scheme.regions.map((r) => [r.id, r]));

  const overwrites: FlagOverwrite[] = [];
  const spatialConflicts: SpatialConflict[] = [];

  // Overwrites: child locally assigns a flag whose value differs from parent's effective.
  for (const child of scheme.regions) {
    if (!child.parent) continue;
    const parentEff = effectiveByRegion.get(child.parent) ?? new Map();
    const parentRegion = regionsById.get(child.parent);
    for (const [flagName, childValue] of Object.entries(child.flags || {})) {
      if (!parentEff.has(flagName)) continue;
      const parentValue = parentEff.get(flagName);
      if (valuesEqual(parentValue, childValue)) continue;
      // Prefer the parent's own assignment when present (clearer in the UI).
      const parentLocal = parentRegion?.flags
        ? Object.prototype.hasOwnProperty.call(parentRegion.flags, flagName)
          ? parentRegion.flags[flagName]
          : undefined
        : undefined;
      overwrites.push({
        flagName,
        parentId: child.parent,
        childId: child.id,
        parentValue: parentLocal !== undefined ? parentLocal : parentValue,
        childValue,
      });
    }
  }

  for (const edge of scheme.spatialEdges) {
    // Parent/child pairs differ via inheritance overwrite — not a spatial conflict.
    if (
      isAncestor(edge.source, edge.target, parentMap)
      || isAncestor(edge.target, edge.source, parentMap)
    ) {
      continue;
    }

    const aEff = effectiveByRegion.get(edge.source) ?? new Map();
    const bEff = effectiveByRegion.get(edge.target) ?? new Map();
    const aRegion = regionsById.get(edge.source);
    const bRegion = regionsById.get(edge.target);
    if (!aRegion || !bRegion) continue;

    for (const flagName of allFlagNames) {
      const aHas = aEff.has(flagName);
      const bHas = bEff.has(flagName);
      if (!aHas || !bHas) continue;

      const aVal = aEff.get(flagName);
      const bVal = bEff.get(flagName);
      if (valuesEqual(aVal, bVal)) continue;

      const { winnerId, winnerValue, ambiguous, undefinedReason } = pickWinnerForSpatial(
        edge.source,
        edge.target,
        aHas,
        bHas,
        aVal,
        bVal,
        aRegion.priority,
        bRegion.priority,
      );

      spatialConflicts.push({
        flagName,
        relation: edge.relation,
        aId: edge.source,
        bId: edge.target,
        aPriority: aRegion.priority,
        bPriority: bRegion.priority,
        aValue: aVal,
        bValue: bVal,
        winnerId,
        winnerValue,
        ambiguous,
        undefinedReason,
        commonAncestorId: findCommonAncestor(edge.source, edge.target, parentMap),
      });

      if (ambiguous) {
        conflictRegionIds.add(edge.source);
        conflictRegionIds.add(edge.target);
      } else {
        resolvedConflictRegionIds.add(edge.source);
        resolvedConflictRegionIds.add(edge.target);
        resolvedConflictEdgeKeys.add(`${edge.relation}-${edge.source}-${edge.target}`);
        resolvedConflictEdgeKeys.add(`${edge.relation}-${edge.target}-${edge.source}`);
      }
    }
  }

  const spatialAmbiguousCount = spatialConflicts.filter((c) => c.ambiguous).length;
  const spatialResolvedCount = spatialConflicts.length - spatialAmbiguousCount;

  return {
    hardErrors,
    warningSummary: {
      overwriteCount: overwrites.length,
      spatialResolvedCount,
      spatialAmbiguousCount,
      totalCount: spatialAmbiguousCount,
    },
    conflictRegionIds,
    resolvedConflictRegionIds,
    resolvedConflictEdgeKeys,
    overwrites,
    spatialConflicts,
  };
}
