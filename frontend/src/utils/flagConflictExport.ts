import { localizedFlagDescription } from '../i18n/flagDescription';
import type { Locale } from '../i18n/I18nContext';
import type { FlagInfo, RegionData, Scheme } from '../types';
import type { FlagConflictsResult, FlagOverwrite, SpatialConflict } from './flagConflicts';
import { compareNatural } from './naturalSort';

/**
 * Self-contained flag-conflict report for an external AI chat.
 * The scheme file does not store conflicts; this is computed at export time.
 */

export interface ExplicitLevel {
  ru: 'ошибка' | 'предупреждение';
  en: 'error' | 'warning';
}

function explicitLevel(isError: boolean): ExplicitLevel {
  return isError
    ? { ru: 'ошибка', en: 'error' }
    : { ru: 'предупреждение', en: 'warning' };
}

const WARNING_LEVEL = explicitLevel(false);
const ERROR_LEVEL = explicitLevel(true);

export interface FlagConflictExportRegion {
  id: string;
  type: RegionData['type'];
  parent: string | null;
  /** Parent, then grandparent, up to the root. */
  ancestors: string[];
  priority: number;
  /** Flags set on this region itself. Inherited values are not copied here. */
  flags: Record<string, unknown>;
  min?: RegionData['min'];
  max?: RegionData['max'];
  min_y?: number;
  max_y?: number;
  points?: RegionData['points'];
}

export interface FlagConflictExportSide {
  id: string;
  priority: number;
  parent: string | null;
  /** Value WorldGuard applies on this region (own flag, else nearest ancestor). */
  effectiveValue: unknown;
  /** Value written on this region, or null when the flag is only inherited. */
  localValue: unknown;
  /** Region whose local assignment produced effectiveValue. */
  definedBy: string | null;
}

export interface FlagConflictExportOverwrite {
  flag: string;
  parentId: string;
  childId: string;
  /** Value the child replaces: parent's own flag, or the parent's effective value. */
  parentValue: unknown;
  childValue: unknown;
  /** True when the parent region itself sets this flag. */
  parentDefinesLocally: boolean;
  /** Region that locally sets parentValue (parent, or an ancestor of the parent). */
  definedBy: string | null;
  /** Plain label: this row is always a warning, never an error. */
  classification: ExplicitLevel;
}

export interface FlagConflictExportSpatial {
  flag: string;
  /**
   * intersects — partial overlap; regionA/regionB ids are sorted alphabetically.
   * contains — regionA is fully inside regionB. Flags are not inherited across this edge.
   */
  relation: 'intersects' | 'contains';
  /** Shared volume in blocks for intersects; null for contains. */
  overlapBlocks: number | null;
  /** True when priorities are equal and WorldGuard has no single winner. */
  ambiguous: boolean;
  /** Same fact as classification, as a short code. */
  severity: 'error' | 'warning';
  /** Plain label: ошибка or предупреждение. */
  classification: ExplicitLevel;
  undefinedReason: string | null;
  winnerId: string | null;
  winnerValue: unknown;
  /** Lowest common ancestor in the parent tree, or null. */
  commonAncestorId: string | null;
  regionA: FlagConflictExportSide;
  regionB: FlagConflictExportSide;
}

export interface FlagConflictReport {
  kind: 'wg-regions-studio.flag-conflicts';
  schemaVersion: 1;
  exportedAt: string;
  sourcePath: string;
  sourceHash: string;
  schemeBuiltAt: string;
  /** Which dialog checkboxes were on when this file was written. */
  filters: {
    errors: boolean;
    warnings: boolean;
  };
  guide: {
    ru: string[];
    en: string[];
  };
  summary: {
    analysisComplete: boolean;
    hardErrorCount: number;
    overwriteCount: number;
    spatialConflictCount: number;
    spatialAmbiguousCount: number;
    spatialResolvedCount: number;
    regionCount: number;
  };
  hardErrors: string[];
  flags: Record<string, { type: string | null; description: string | null }>;
  regions: Record<string, FlagConflictExportRegion>;
  overwrites: FlagConflictExportOverwrite[];
  spatialConflicts: FlagConflictExportSpatial[];
}

const GUIDE_RU = [
  'Это разбор флагов WorldGuard из WG Regions Studio, а не файл регионов. Конфликты в сохранённую схему не пишутся — они посчитаны на момент выгрузки.',
  'В файл попали только записи включённых фильтров окна: filters.errors — ошибки, filters.warnings — предупреждения. У каждой записи поле classification: ru «ошибка» или «предупреждение», en «error» или «warning».',
  'Действующее значение флага региона = его собственный флаг, иначе ближайший предок по parent. Через пространственное вхождение флаги не наследуются.',
  'overwrites — потомок явно задаёт другое значение, чем действующее у родителя. Так и задумано в WorldGuard: classification = предупреждение, не ошибка. Менять нужно только если различие случайное.',
  'spatialConflicts — регионы пересекаются в мире, не являются парой родитель/потомок, и действующие значения одного флага различаются. Побеждает больший priority, даже если там allow, а у более низкого deny. У флага типа state при равном максимальном priority итог deny, если deny есть среди этих значений, иначе allow: classification = предупреждение, экспорт YAML не блокируется. У остальных типов равный priority и разные значения — classification = ошибка, победитель не определён, экспорт блокируется.',
  'definedBy — регион, который локально задаёт действующее значение (сам регион или предок). Править нужно флаг у definedBy, а не у наследника, если localValue=null.',
  'relation=contains: regionA полностью внутри regionB. relation=intersects: частичное пересечение, overlapBlocks — общий объём в блоках. regions — геометрия, parent, priority и локальные флаги всех упомянутых регионов.',
];

const GUIDE_EN = [
  'WorldGuard flag analysis from WG Regions Studio, not a regions file. Conflicts are not stored in the scheme; this file is computed at export time.',
  'The file contains only rows matching the dialog checkboxes: filters.errors and filters.warnings. Each row has classification.ru («ошибка» or «предупреждение») and classification.en («error» or «warning»).',
  'A region\'s effective flag value is its own flag, otherwise the nearest ancestor along parent. Flags are not inherited across spatial containment.',
  'overwrites: a child explicitly sets a different value than its parent\'s effective value. This is normal WorldGuard inheritance (classification = warning, not an error). Change it only if the difference was accidental.',
  'spatialConflicts: regions overlap in the world, are not a parent/child pair, and their effective values for one flag differ. Higher priority wins, even when that value is allow and a lower priority has deny. For a state flag at equal max priority, deny wins if any of those values is deny, otherwise allow: classification = warning, YAML export is not blocked. For every other flag type, equal priority and different values mean classification = error, no defined winner, and YAML export is blocked.',
  'definedBy is the region that locally assigns the effective value (itself or an ancestor). Edit the flag on definedBy, not on the inheriting region, when localValue is null.',
  'relation=contains: regionA is fully inside regionB. relation=intersects: partial overlap; overlapBlocks is the shared volume in blocks. regions holds geometry, parent, priority, and local flags for every region mentioned.',
];

export function flagConflictExportFileName(sourcePath: string): string {
  const base = sourcePath.split(/[/\\]/).pop() ?? '';
  const stem = base
    .replace(/\.(mrv\.json|json|yml|yaml)$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim();
  return `${stem || 'regions'}.flag-conflicts.json`;
}

function ancestorsOf(id: string, parentOf: Map<string, string | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let current = parentOf.get(id) ?? null;
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    out.push(current);
    current = parentOf.get(current) ?? null;
  }
  return out;
}

function definesLocally(region: RegionData | undefined, flagName: string): boolean {
  if (!region?.flags) return false;
  return Object.prototype.hasOwnProperty.call(region.flags, flagName);
}

function definedById(
  id: string,
  flagName: string,
  regionsById: Map<string, RegionData>,
  parentOf: Map<string, string | null>,
): string | null {
  if (definesLocally(regionsById.get(id), flagName)) return id;
  for (const ancestorId of ancestorsOf(id, parentOf)) {
    if (definesLocally(regionsById.get(ancestorId), flagName)) return ancestorId;
  }
  return null;
}

function localValue(region: RegionData | undefined, flagName: string): unknown {
  if (!definesLocally(region, flagName)) return null;
  return region!.flags[flagName];
}

function regionRecord(region: RegionData, parentOf: Map<string, string | null>): FlagConflictExportRegion {
  const rec: FlagConflictExportRegion = {
    id: region.id,
    type: region.type,
    parent: region.parent,
    ancestors: ancestorsOf(region.id, parentOf),
    priority: region.priority,
    flags: { ...(region.flags || {}) },
  };
  if (region.min) rec.min = region.min;
  if (region.max) rec.max = region.max;
  if (region.min_y != null) rec.min_y = region.min_y;
  if (region.max_y != null) rec.max_y = region.max_y;
  if (region.points) rec.points = region.points;
  return rec;
}

function side(
  id: string,
  effectiveValue: unknown,
  flagName: string,
  regionsById: Map<string, RegionData>,
  parentOf: Map<string, string | null>,
): FlagConflictExportSide {
  const region = regionsById.get(id);
  return {
    id,
    priority: region?.priority ?? 0,
    parent: region?.parent ?? null,
    effectiveValue,
    localValue: localValue(region, flagName),
    definedBy: definedById(id, flagName, regionsById, parentOf),
  };
}

function compareSpatial(a: SpatialConflict, b: SpatialConflict): number {
  if (a.ambiguous !== b.ambiguous) return a.ambiguous ? -1 : 1;
  const byFlag = compareNatural(a.flagName, b.flagName);
  if (byFlag) return byFlag;
  const aFirst = compareNatural(a.aId, a.bId) <= 0 ? a.aId : a.bId;
  const aSecond = aFirst === a.aId ? a.bId : a.aId;
  const bFirst = compareNatural(b.aId, b.bId) <= 0 ? b.aId : b.bId;
  const bSecond = bFirst === b.aId ? b.bId : b.aId;
  return compareNatural(aFirst, bFirst) || compareNatural(aSecond, bSecond);
}

function overlapBlocksFor(scheme: Scheme, conflict: SpatialConflict): number | null {
  if (conflict.relation !== 'intersects') return null;
  const edge = scheme.spatialEdges.find(
    (e) => e.relation === 'intersects'
      && ((e.source === conflict.aId && e.target === conflict.bId)
        || (e.source === conflict.bId && e.target === conflict.aId)),
  );
  return edge?.overlapBlocks ?? null;
}

export function buildFlagConflictReport(
  scheme: Scheme,
  result: FlagConflictsResult,
  flagsCatalog: FlagInfo[],
  exportedAt: string = new Date().toISOString(),
  filters: { errors: boolean; warnings: boolean } = { errors: true, warnings: true },
  locale: Locale = 'en',
): FlagConflictReport {
  const regionsById = new Map(scheme.regions.map((r) => [r.id, r]));
  const parentOf = new Map(scheme.regions.map((r) => [r.id, r.parent]));
  const catalogByName = new Map(flagsCatalog.map((f) => [f.name, f]));
  const mentioned = new Set<string>();

  const overwrites = (filters.warnings ? [...result.overwrites] : []).sort((a, b) => (
    compareNatural(a.flagName, b.flagName)
    || compareNatural(a.childId, b.childId)
    || compareNatural(a.parentId, b.parentId)
  ));
  const spatial = [...result.spatialConflicts]
    .filter((item) => (item.ambiguous ? filters.errors : filters.warnings))
    .sort(compareSpatial);

  const overwriteRows: FlagConflictExportOverwrite[] = overwrites.map((item: FlagOverwrite) => {
    const definedBy = definedById(item.parentId, item.flagName, regionsById, parentOf);
    mentioned.add(item.parentId);
    mentioned.add(item.childId);
    if (definedBy) mentioned.add(definedBy);
    return {
      flag: item.flagName,
      parentId: item.parentId,
      childId: item.childId,
      parentValue: item.parentValue,
      childValue: item.childValue,
      parentDefinesLocally: definesLocally(regionsById.get(item.parentId), item.flagName),
      definedBy,
      classification: WARNING_LEVEL,
    };
  });

  const spatialRows: FlagConflictExportSpatial[] = spatial.map((item) => {
    const regionA = side(item.aId, item.aValue, item.flagName, regionsById, parentOf);
    const regionB = side(item.bId, item.bValue, item.flagName, regionsById, parentOf);
    for (const id of [item.aId, item.bId, item.winnerId, item.commonAncestorId, regionA.definedBy, regionB.definedBy]) {
      if (id) mentioned.add(id);
    }
    return {
      flag: item.flagName,
      relation: item.relation,
      overlapBlocks: overlapBlocksFor(scheme, item),
      ambiguous: item.ambiguous,
      severity: item.ambiguous ? 'error' : 'warning',
      classification: item.ambiguous ? ERROR_LEVEL : WARNING_LEVEL,
      undefinedReason: item.undefinedReason ?? null,
      winnerId: item.winnerId ?? null,
      winnerValue: item.winnerValue ?? null,
      commonAncestorId: item.commonAncestorId,
      regionA,
      regionB,
    };
  });

  const flagNames = new Set<string>([
    ...overwriteRows.map((row) => row.flag),
    ...spatialRows.map((row) => row.flag),
  ]);
  const flags: FlagConflictReport['flags'] = {};
  for (const name of [...flagNames].sort(compareNatural)) {
    const info = catalogByName.get(name);
    flags[name] = {
      type: info?.type ?? null,
      description: info ? localizedFlagDescription(info, locale) || null : null,
    };
  }

  const regions: FlagConflictReport['regions'] = {};
  for (const id of [...mentioned].sort(compareNatural)) {
    const region = regionsById.get(id);
    if (region) regions[id] = regionRecord(region, parentOf);
  }

  return {
    kind: 'wg-regions-studio.flag-conflicts',
    schemaVersion: 1,
    exportedAt,
    sourcePath: scheme.sourcePath,
    sourceHash: scheme.sourceHash,
    schemeBuiltAt: scheme.builtAt,
    filters: {
      errors: filters.errors,
      warnings: filters.warnings,
    },
    guide: { ru: GUIDE_RU, en: GUIDE_EN },
    summary: {
      analysisComplete: result.hardErrors.length === 0,
      hardErrorCount: result.hardErrors.length,
      overwriteCount: overwriteRows.length,
      spatialConflictCount: spatialRows.length,
      spatialAmbiguousCount: spatialRows.filter((row) => row.ambiguous).length,
      spatialResolvedCount: spatialRows.filter((row) => !row.ambiguous).length,
      regionCount: Object.keys(regions).length,
    },
    hardErrors: [...result.hardErrors],
    flags,
    regions,
    overwrites: overwriteRows,
    spatialConflicts: spatialRows,
  };
}

export function serializeFlagConflictReport(report: FlagConflictReport): string {
  return `${JSON.stringify(report, (_key, value) => (value === undefined ? null : value), 2)}\n`;
}
