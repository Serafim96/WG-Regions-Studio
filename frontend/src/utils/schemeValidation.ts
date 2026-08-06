import type { FlagConflictsResult } from './flagConflicts';
import { isValidRegionId } from './regionId';
import { isTemporaryRegion } from './regions';
import type { RegionData, Scheme } from '../types';

export type SchemeIssueSeverity = 'error' | 'warning';

export interface SchemeIssue {
  severity: SchemeIssueSeverity;
  /** Translation key or already-resolved message stored in `text`. */
  code:
    | 'invalidId'
    | 'hardError'
    | 'ambiguousConflict'
    | 'incompleteManual'
    | 'ok';
  /** Pre-formatted human-readable line. */
  text: string;
  regionIds?: string[];
}

export interface SchemeValidationResult {
  ok: boolean;
  errors: SchemeIssue[];
  warnings: SchemeIssue[];
  issues: SchemeIssue[];
}

function regionHasExportableCoords(region: RegionData): boolean {
  const exportedType = region.type === 'manual' ? 'global' : region.type;
  if (exportedType === 'global') return true;
  if (exportedType === 'cuboid') {
    return Boolean(region.min && region.max);
  }
  if (exportedType === 'poly2d') {
    return Boolean(
      region.points
      && region.points.length >= 3
      && region.min_y != null
      && region.max_y != null,
    );
  }
  return false;
}

/** Temporary non-global regions missing coordinates required for YAML export. */
export function findIncompleteManualRegions(scheme: Scheme): string[] {
  const missing: string[] = [];
  for (const region of scheme.regions) {
    if (!isTemporaryRegion(region)) continue;
    const exportedType = region.type === 'manual' ? 'global' : region.type;
    if (exportedType === 'global') continue;
    if (!regionHasExportableCoords(region)) missing.push(region.id);
  }
  return missing.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function findInvalidRegionIds(scheme: Scheme): string[] {
  return scheme.regions
    .map((r) => r.id)
    .filter((id) => !isValidRegionId(id))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Checks that matter for WorldGuard YAML export / plugin safety.
 * When `includeManual` is true, incomplete temporary regions are errors.
 */
export function validateSchemeForYamlExport(
  scheme: Scheme,
  flagConflicts: FlagConflictsResult | null,
  options: { includeManual: boolean },
  format: {
    invalidId: (id: string) => string;
    hardError: (msg: string) => string;
    ambiguous: (flag: string, a: string, b: string) => string;
    incompleteManual: (id: string) => string;
  },
): SchemeValidationResult {
  const errors: SchemeIssue[] = [];
  const warnings: SchemeIssue[] = [];

  for (const id of findInvalidRegionIds(scheme)) {
    errors.push({
      severity: 'error',
      code: 'invalidId',
      text: format.invalidId(id),
      regionIds: [id],
    });
  }

  if (flagConflicts) {
    for (const msg of flagConflicts.hardErrors) {
      errors.push({
        severity: 'error',
        code: 'hardError',
        text: format.hardError(msg),
      });
    }
    for (const c of flagConflicts.spatialConflicts.filter((x) => x.ambiguous)) {
      errors.push({
        severity: 'error',
        code: 'ambiguousConflict',
        text: format.ambiguous(c.flagName, c.aId, c.bId),
        regionIds: [c.aId, c.bId],
      });
    }
  }

  if (options.includeManual) {
    for (const id of findIncompleteManualRegions(scheme)) {
      errors.push({
        severity: 'error',
        code: 'incompleteManual',
        text: format.incompleteManual(id),
        regionIds: [id],
      });
    }
  }

  const issues = [...errors, ...warnings];
  return { ok: errors.length === 0, errors, warnings, issues };
}
