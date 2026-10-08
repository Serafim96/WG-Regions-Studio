import type { FlagSchemeCoverageResponse } from '../api';
import type { TranslationKey } from '../i18n/translations';
import type { Scheme } from '../types';
import type { EffectiveFlagsMap, FlagHighlight } from './flagTree';
import { computeEffectiveFlagsByRegion } from './flagConflicts';
import { formatFlagValueShort } from './flagRows';
import { isNonSpatialFlag } from './flagSpatialRules';

const VALUE_BLOCKED = '⮾';

function edgePair(a: string, b: string): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a];
}

/** Keep only containment/intersection marks backed by coverage (priority-aware). */
export function filterSpatialMarksByCoverage(
  highlight: FlagHighlight,
  coverage: FlagSchemeCoverageResponse,
): Pick<
  FlagHighlight,
  | 'containedNoInheritIds'
  | 'containedNoInheritEdgeKeys'
  | 'intersectPartialIds'
  | 'intersectPartialEdgeKeys'
  | 'brightIds'
> {
  if (isNonSpatialFlag(coverage.flag)) {
    return {
      containedNoInheritIds: highlight.containedNoInheritIds,
      containedNoInheritEdgeKeys: highlight.containedNoInheritEdgeKeys,
      intersectPartialIds: highlight.intersectPartialIds,
      intersectPartialEdgeKeys: highlight.intersectPartialEdgeKeys,
      brightIds: highlight.brightIds,
    };
  }

  const backed = new Set<string>();
  const backedNode = new Map<string, Set<'containment' | 'intersection'>>();

  for (const [id, entry] of Object.entries(coverage.regions)) {
    for (const g of entry.groups ?? []) {
      if (g.value == null || g.kind !== 'spatial' || !g.viaRegion || (g.blocks ?? 0) <= 0) {
        continue;
      }
      const [a, b] = edgePair(id, g.viaRegion);
      if (g.inheritType === 'containment') {
        backed.add(`contains|${a}|${b}`);
        const set = backedNode.get(id) ?? new Set();
        set.add('containment');
        backedNode.set(id, set);
      } else if (g.inheritType === 'intersection') {
        backed.add(`intersects|${a}|${b}`);
        const set = backedNode.get(id) ?? new Set();
        set.add('intersection');
        backedNode.set(id, set);
      }
    }
  }

  const bothDefining = (a: string, b: string) =>
    highlight.definingIds.has(a) && highlight.definingIds.has(b);

  const oneEndRelevant = (a: string, b: string) =>
    highlight.brightIds.has(a)
    || highlight.brightIds.has(b)
    || highlight.definingIds.has(a)
    || highlight.definingIds.has(b);

  const containedNoInheritEdgeKeys = new Set<string>();
  for (const key of highlight.containedNoInheritEdgeKeys ?? []) {
    const m = /^contains-([^-]+)-(.+)$/.exec(key);
    if (!m) continue;
    const inner = m[1];
    const outer = m[2];
    const [a, b] = edgePair(inner, outer);
    if (backed.has(`contains|${a}|${b}`) || bothDefining(inner, outer) || oneEndRelevant(inner, outer)) {
      containedNoInheritEdgeKeys.add(key);
    }
  }

  const containedNoInheritIds = new Set<string>();
  for (const id of highlight.containedNoInheritIds ?? []) {
    if (backedNode.get(id)?.has('containment') || highlight.definingIds.has(id)) {
      containedNoInheritIds.add(id);
    }
  }

  const intersectPartialEdgeKeys = new Set<string>();
  for (const key of highlight.intersectPartialEdgeKeys ?? []) {
    const m = /^intersects-([^-]+)-(.+)$/.exec(key);
    if (!m) continue;
    const a = m[1];
    const b = m[2];
    const [pa, pb] = edgePair(a, b);
    if (backed.has(`intersects|${pa}|${pb}`) || bothDefining(a, b) || oneEndRelevant(a, b)) {
      intersectPartialEdgeKeys.add(key);
    }
  }

  const intersectPartialIds = new Set<string>();
  for (const id of highlight.intersectPartialIds ?? []) {
    if (backedNode.get(id)?.has('intersection')) {
      intersectPartialIds.add(id);
    }
  }

  const removedSpatialIds = new Set<string>();
  for (const id of highlight.containedNoInheritIds ?? []) {
    if (!containedNoInheritIds.has(id)) removedSpatialIds.add(id);
  }
  for (const id of highlight.intersectPartialIds ?? []) {
    if (!intersectPartialIds.has(id)) removedSpatialIds.add(id);
  }

  const brightIds = new Set(highlight.brightIds);
  for (const id of removedSpatialIds) {
    if (highlight.definingIds.has(id)) continue;
    if (highlight.conflictIds?.has(id)) continue;
    const onHierarchy = [...(highlight.brightEdgeKeys ?? [])].some(
      (k) => k.startsWith(`${id}->`) || k.endsWith(`->${id}`),
    );
    if (onHierarchy) continue;
    brightIds.delete(id);
  }

  return {
    containedNoInheritIds,
    containedNoInheritEdgeKeys,
    intersectPartialIds,
    intersectPartialEdgeKeys,
    brightIds,
  };
}

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

function formatIntersectCoreLabel(label: string, ambiguous: boolean, t: TFn): string {
  if (label === 'undefined') return t('flagCoverage.undefined');
  if (label.startsWith('mixed:')) {
    const n = label.split(':')[1] ?? '?';
    return t('flagCoverage.mixed', { count: n });
  }
  if (ambiguous) return `${label}?`;
  return label;
}

export function formatEndpointPercent(percent: number | undefined): string {
  if (percent == null || Number.isNaN(percent)) return '';
  const text = percent < 1 ? '<1%' : `${Math.round(percent)}%`;
  return `(${text})`;
}

function regionCoverageLabel(
  regionId: string,
  coverage: FlagSchemeCoverageResponse,
  scheme: Scheme,
  t: TFn,
): string {
  const entry = coverage.regions[regionId];
  if (entry?.label) {
    if (entry.label === 'partial') return t('app.flagCoveragePartial');
    if (entry.label === 'undefined') return t('flagCoverage.undefined');
    if (entry.label.startsWith('mixed:')) {
      const n = entry.label.split(':')[1] ?? '?';
      return t('flagCoverage.mixed', { count: n });
    }
    return entry.label;
  }
  const region = scheme.regions.find((r) => r.id === regionId);
  const raw = region?.flags?.[coverage.flag];
  if (raw === undefined) return t('flagCoverage.undefined');
  const text = formatCoverageValue(raw);
  return text === '—' ? t('flagCoverage.undefined') : text;
}

/** True when `descendantId` is a hierarchy child (direct or indirect) of `ancestorId`. */
export function isDescendantOf(scheme: Scheme, ancestorId: string, descendantId: string): boolean {
  let currentId: string | null | undefined = descendantId;
  while (currentId) {
    const current = scheme.regions.find((r) => r.id === currentId);
    if (!current?.parent) return false;
    if (current.parent === ancestorId) return true;
    currentId = current.parent;
  }
  return false;
}

function formatOwnFlagValue(
  regionId: string,
  coverage: FlagSchemeCoverageResponse,
  scheme: Scheme,
): string | undefined {
  const region = scheme.regions.find((r) => r.id === regionId);
  if (!region || !Object.prototype.hasOwnProperty.call(region.flags || {}, coverage.flag)) {
    return undefined;
  }
  const text = formatCoverageValue(region.flags![coverage.flag]);
  return text === '—' ? undefined : text;
}

function formatEffectiveFlagValue(
  regionId: string,
  coverage: FlagSchemeCoverageResponse,
  effective: EffectiveFlagsMap,
): string | undefined {
  const raw = effective.get(regionId)?.get(coverage.flag);
  if (raw === undefined) return undefined;
  const text = formatCoverageValue(raw);
  return text === '—' ? undefined : text;
}

function buildHierarchyEdgeLabel(
  parentId: string,
  childId: string,
  coverage: FlagSchemeCoverageResponse,
  scheme: Scheme,
  effective: EffectiveFlagsMap,
): string {
  const parentValue = formatEffectiveFlagValue(parentId, coverage, effective);
  if (!parentValue) return '';
  const childOwn = formatOwnFlagValue(childId, coverage, scheme);
  if (!childOwn || childOwn === parentValue) return `${parentValue}→`;
  return `${parentValue}→${VALUE_BLOCKED}`;
}

function buildContainsEdgeLabel(
  innerId: string,
  outerId: string,
  coverage: FlagSchemeCoverageResponse,
  scheme: Scheme,
  effective: EffectiveFlagsMap,
  t: TFn,
): string {
  if (isDescendantOf(scheme, outerId, innerId)) {
    const outerValue = formatEffectiveFlagValue(outerId, coverage, effective);
    if (outerValue) {
      const innerOwn = formatOwnFlagValue(innerId, coverage, scheme);
      if (!innerOwn || innerOwn === outerValue) return `←${outerValue}`;
      return `${outerValue}←${VALUE_BLOCKED}`;
    }
  }

  const innerOwn = formatOwnFlagValue(innerId, coverage, scheme);
  const outerOwn = formatOwnFlagValue(outerId, coverage, scheme);
  if (innerOwn && outerOwn && innerOwn !== outerOwn) {
    return `${outerOwn}→${VALUE_BLOCKED}`;
  }

  const inner = scheme.regions.find((r) => r.id === innerId);
  const outer = scheme.regions.find((r) => r.id === outerId);
  const priInner = inner?.priority ?? 0;
  const priOuter = outer?.priority ?? 0;
  const valInner = regionCoverageLabel(innerId, coverage, scheme, t);
  const valOuter = regionCoverageLabel(outerId, coverage, scheme, t);
  const undefinedText = t('flagCoverage.undefined');
  if (valInner === undefinedText || valOuter === undefinedText) return undefinedText;
  if (valInner !== valOuter && priInner === priOuter) return undefinedText;
  if (priInner > priOuter) return `${valInner}→`;
  return `←${valOuter}`;
}

export function applyFlagSchemeCoverage(
  highlight: FlagHighlight,
  coverage: FlagSchemeCoverageResponse,
  scheme: Scheme,
  t: TFn,
): FlagHighlight {
  const valueLabels = new Map<string, { text: string; defining: boolean }>();

  for (const region of scheme.regions) {
    const entry = coverage.regions[region.id];
    if (!entry?.label) continue;
    const meaningful = (entry.groups ?? []).filter(
      (g) => g.kind !== 'none' && g.value != null,
    );
    const isPartial = meaningful.length > 1;
    valueLabels.set(region.id, {
      text: entry.label,
      defining: highlight.definingIds.has(region.id),
      ...(isPartial ? { partial: true as const } : {}),
    });
  }

  for (const id of highlight.definingIds) {
    if (valueLabels.has(id)) continue;
    const region = scheme.regions.find((r) => r.id === id);
    const raw = region?.flags?.[coverage.flag];
    if (raw === undefined) continue;
    const text = formatFlagValueShort(raw);
    if (text) {
      valueLabels.set(id, { text, defining: true });
    }
  }

  const spatialFiltered = filterSpatialMarksByCoverage(highlight, coverage);
  const mergedHighlight: FlagHighlight = { ...highlight, ...spatialFiltered };

  const effective = computeEffectiveFlagsByRegion(scheme);

  const intersectEdgeLabels = new Map<string, string>();
  const intersectEdgeEndpoints = new Map<string, { sourcePct: string; targetPct: string }>();
  const containsEdgeLabels = new Map<string, string>();
  const hierarchyEdgeLabels = new Map<string, string>();
  for (const key of mergedHighlight.containedNoInheritEdgeKeys ?? []) {
    const m = /^contains-([^-]+)-(.+)$/.exec(key);
    if (!m) continue;
    const innerId = m[1];
    const outerId = m[2];
    const text = buildContainsEdgeLabel(innerId, outerId, coverage, scheme, effective, t);
    containsEdgeLabels.set(key, text);
  }
  for (const edgeKey of mergedHighlight.brightEdgeKeys) {
    const arrow = edgeKey.indexOf('->');
    if (arrow < 0) continue;
    const parentId = edgeKey.slice(0, arrow);
    const childId = edgeKey.slice(arrow + 2);
    const text = buildHierarchyEdgeLabel(parentId, childId, coverage, scheme, effective);
    if (text) hierarchyEdgeLabels.set(edgeKey, text);
  }
  const partialKeys = mergedHighlight.intersectPartialEdgeKeys;
  const conflictKeys = mergedHighlight.resolvedConflictEdgeKeys;
  const ambiguousKeys = mergedHighlight.conflictEdgeKeys;
  for (const inter of coverage.intersects) {
    const k1 = `intersects-${inter.aId}-${inter.bId}`;
    const k2 = `intersects-${inter.bId}-${inter.aId}`;
    const onHighlightedEdge =
      (partialKeys?.has(k1) || partialKeys?.has(k2))
      || (conflictKeys?.has(k1) || conflictKeys?.has(k2))
      || (ambiguousKeys?.has(k1) || ambiguousKeys?.has(k2));
    if (partialKeys?.size || conflictKeys?.size || ambiguousKeys?.size) {
      if (!onHighlightedEdge) continue;
    }
    const onWarningOrConflict =
      (conflictKeys?.has(k1) || conflictKeys?.has(k2))
      || (ambiguousKeys?.has(k1) || ambiguousKeys?.has(k2));
    if (!onWarningOrConflict) {
      const text = formatIntersectCoreLabel(inter.label, inter.ambiguous, t);
      intersectEdgeLabels.set(k1, text);
      intersectEdgeLabels.set(k2, text);
    }
    const aPct = formatEndpointPercent(inter.aPercent);
    const bPct = formatEndpointPercent(inter.bPercent);
    intersectEdgeEndpoints.set(k1, { sourcePct: aPct, targetPct: bPct });
    intersectEdgeEndpoints.set(k2, { sourcePct: bPct, targetPct: aPct });
  }

  const resolvedEdgeLabels = new Map(highlight.resolvedEdgeLabels);
  for (const inter of coverage.intersects) {
    if (inter.ambiguous) continue;
    const text = formatIntersectCoreLabel(inter.label, false, t);
    const k1 = `intersects-${inter.aId}-${inter.bId}`;
    const k2 = `intersects-${inter.bId}-${inter.aId}`;
    if (!resolvedEdgeLabels.has(k1)) {
      resolvedEdgeLabels.set(k1, text);
      resolvedEdgeLabels.set(k2, text);
    }
  }

  return {
    ...mergedHighlight,
    valueLabels,
    intersectEdgeLabels,
    ...(intersectEdgeEndpoints.size > 0 ? { intersectEdgeEndpoints } : {}),
    ...(containsEdgeLabels.size > 0 ? { containsEdgeLabels } : {}),
    ...(hierarchyEdgeLabels.size > 0 ? { hierarchyEdgeLabels } : {}),
    ...(resolvedEdgeLabels.size > 0 ? { resolvedEdgeLabels } : {}),
  };
}

export function formatCoverageValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  return formatFlagValueShort(value);
}
