import type { FlagInfo, ForestNode, RegionData, Scheme } from '../types';
import { computeEffectiveFlagsByRegion } from './flagConflicts';
import { buildParentMap } from './graph';
import { compareNatural } from './naturalSort';

export interface FlagTreeNode {
  id: string;
  value: unknown;
  children: FlagTreeNode[];
}

export interface FlagValueLabel {
  /** Short display text for the flag value. */
  text: string;
  /** True when this region sets the flag locally. */
  defining: boolean;
}

export interface FlagHighlightOptions {
  /** Light regions that inherit the flag via parent (hierarchy path). */
  showInheritance: boolean;
  /** Light regions fully inside a flag carrier without parent inheritance (∈). */
  showContains: boolean;
  /** Light regions that spatially intersect a flag carrier (partial ≈). */
  showIntersects: boolean;
  /** Light spatial-conflict participants for this flag. */
  showConflicts: boolean;
}

export interface FlagHighlight {
  /** Regions that locally assign the flag (brightest on the scheme). */
  definingIds: Set<string>;
  /**
   * Nodes to keep bright: defining always; when inheritance is on — also every
   * region that inherits the flag (and hierarchy edges between them).
   */
  brightIds: Set<string>;
  /** Hierarchy edges (source=parent, target=child) on the bright path. */
  brightEdgeKeys: Set<string>;
  /**
   * Fully contained in a region that has the flag, but not a hierarchy child —
   * WorldGuard does not inherit the flag here.
   */
  containedNoInheritIds?: Set<string>;
  /** Spatial `contains` edges to contained-no-inherit nodes. */
  containedNoInheritEdgeKeys?: Set<string>;
  /**
   * Spatially intersects a region where the flag applies, but does not carry
   * the flag itself — partial / approximate influence.
   */
  intersectPartialIds?: Set<string>;
  /** Spatial `intersects` edges to partial nodes. */
  intersectPartialEdgeKeys?: Set<string>;
  /** Spatial-conflict participants not necessarily on the flag path. */
  conflictIds?: Set<string>;
  /** Spatial edges involved in the shown conflict (`relation-source-target`). */
  conflictEdgeKeys?: Set<string>;
  /** Flag values to show next to highlighted nodes (skipped for set-types). */
  valueLabels?: Map<string, FlagValueLabel>;
}

/** Max chars shown on a scheme node value caption (also used to reserve layout space). */
export const MAX_VALUE_LABEL_LEN = 28;
const SKIP_VALUE_TYPES = new Set(['set of strings', 'set of entity types']);

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldSkipValueLabels(flagType: string | undefined): boolean {
  if (!flagType) return false;
  return SKIP_VALUE_TYPES.has(flagType.toLowerCase());
}

/** Attach short flag-value captions for nodes on the highlight path. */
export function enrichHighlightWithFlagValues(
  highlight: FlagHighlight,
  scheme: Scheme,
  flagName: string,
  flagsCatalog: FlagInfo[],
): FlagHighlight {
  const flagType = flagsCatalog.find((f) => f.name === flagName)?.type;
  if (shouldSkipValueLabels(flagType)) {
    const valueLabels = new Map<string, FlagValueLabel>();
    const effectiveSkip = computeEffectiveFlagsByRegion(scheme);
    for (const id of highlight.containedNoInheritIds ?? []) {
      if (effectiveSkip.get(id)?.has(flagName)) continue;
      const isNonInheritingInner = scheme.spatialEdges.some(
        (edge) =>
          edge.relation === 'contains'
          && edge.source === id
          && effectiveSkip.get(edge.target)?.has(flagName),
      );
      if (isNonInheritingInner) {
        valueLabels.set(id, { text: '∈', defining: false });
      }
    }
    for (const id of highlight.intersectPartialIds ?? []) {
      valueLabels.set(id, { text: '≈', defining: false });
    }
    return { ...highlight, valueLabels };
  }

  const effective = computeEffectiveFlagsByRegion(scheme);
  const ids = new Set<string>([
    ...highlight.definingIds,
    ...highlight.brightIds,
    ...(highlight.conflictIds ?? []),
  ]);
  const valueLabels = new Map<string, FlagValueLabel>();

  for (const id of ids) {
    const eff = effective.get(id);
    if (!eff || !eff.has(flagName)) continue;
    const text = formatValue(eff.get(flagName));
    if (!text || text.length > MAX_VALUE_LABEL_LEN) continue;
    valueLabels.set(id, {
      text,
      defining: highlight.definingIds.has(id),
    });
  }

  // Contained spatially under a flagged region but not in its parent tree —
  // mark containment and show the outer carrier's value (not inherited via parent).
  // Skip containers-without-flag that are only in the set for visibility.
  for (const id of highlight.containedNoInheritIds ?? []) {
    if (valueLabels.has(id)) continue;
    if (effective.get(id)?.has(flagName)) continue;
    let carrierValue: string | null = null;
    const isNonInheritingInner = scheme.spatialEdges.some(
      (edge) => {
        if (edge.relation !== 'contains' || edge.source !== id) return false;
        if (!effective.get(edge.target)?.has(flagName)) return false;
        if (!carrierValue) {
          const text = formatValue(effective.get(edge.target)!.get(flagName));
          if (text && text.length <= MAX_VALUE_LABEL_LEN) carrierValue = text;
        }
        return true;
      },
    );
    if (isNonInheritingInner) {
      valueLabels.set(id, {
        text: carrierValue ? `∈ ${carrierValue}` : '∈',
        defining: false,
      });
    }
  }

  // Intersects a carrier: show ≈ plus carrier value when short enough.
  for (const id of highlight.intersectPartialIds ?? []) {
    if (valueLabels.has(id)) continue;
    let carrierValue: string | null = null;
    for (const edge of scheme.spatialEdges) {
      if (edge.relation !== 'intersects') continue;
      const other =
        edge.source === id ? edge.target
          : edge.target === id ? edge.source
            : null;
      if (!other) continue;
      const effOther = effective.get(other);
      if (!effOther?.has(flagName)) continue;
      const text = formatValue(effOther.get(flagName));
      if (text && text.length <= MAX_VALUE_LABEL_LEN) {
        carrierValue = text;
        break;
      }
    }
    valueLabels.set(id, {
      text: carrierValue ? `≈ ${carrierValue}` : '≈',
      defining: false,
    });
  }

  return { ...highlight, valueLabels };
}

export function listUsedFlagNames(scheme: Scheme): string[] {
  const names = new Set<string>();
  for (const r of scheme.regions) {
    for (const name of Object.keys(r.flags || {})) names.add(name);
  }
  return Array.from(names).sort();
}

/** Build a forest of regions that locally assign `flagName` (any value). */
export function buildFlagDefinitionTree(
  scheme: Scheme,
  flagName: string,
): FlagTreeNode[] {
  const regionsById = new Map(scheme.regions.map((r) => [r.id, r]));
  const parentMap = buildParentMap(scheme.regions);
  const defining = new Set(
    scheme.regions
      .filter((r) => Object.prototype.hasOwnProperty.call(r.flags || {}, flagName))
      .map((r) => r.id),
  );
  if (defining.size === 0) return [];

  // Roots = defining nodes whose nearest defining ancestor does not exist.
  const nearestDefiningAncestor = (id: string): string | null => {
    let current = parentMap.get(id) ?? null;
    while (current) {
      if (defining.has(current)) return current;
      current = parentMap.get(current) ?? null;
    }
    return null;
  };

  const childrenOf = new Map<string, string[]>();
  const roots: string[] = [];
  for (const id of defining) {
    const anc = nearestDefiningAncestor(id);
    if (!anc) {
      roots.push(id);
    } else {
      const list = childrenOf.get(anc) ?? [];
      list.push(id);
      childrenOf.set(anc, list);
    }
  }

  const build = (id: string): FlagTreeNode => {
    const region = regionsById.get(id)!;
    const kids = (childrenOf.get(id) ?? []).sort(compareNatural);
    return {
      id,
      value: region.flags[flagName],
      children: kids.map(build),
    };
  };

  return roots.sort(compareNatural).map(build);
}

export function buildFlagHighlight(
  scheme: Scheme,
  flagName: string,
  options: FlagHighlightOptions = {
    showInheritance: false,
    showContains: false,
    showIntersects: false,
    showConflicts: false,
  },
): FlagHighlight {
  const definingIds = new Set(
    scheme.regions
      .filter((r) => Object.prototype.hasOwnProperty.call(r.flags || {}, flagName))
      .map((r) => r.id),
  );
  const brightIds = new Set<string>(definingIds);
  const brightEdgeKeys = new Set<string>();
  const containedNoInheritIds = new Set<string>();
  const containedNoInheritEdgeKeys = new Set<string>();
  const intersectPartialIds = new Set<string>();
  const intersectPartialEdgeKeys = new Set<string>();

  const effective = (
    options.showInheritance || options.showContains || options.showIntersects
  )
    ? computeEffectiveFlagsByRegion(scheme)
    : null;

  const carrierIds = new Set<string>(definingIds);
  if (effective) {
    for (const r of scheme.regions) {
      if (effective.get(r.id)?.has(flagName)) carrierIds.add(r.id);
    }
  }

  if (options.showInheritance && effective) {
    for (const id of carrierIds) brightIds.add(id);

    for (const edge of scheme.hierarchyEdges) {
      if (!brightIds.has(edge.source) || !brightIds.has(edge.target)) continue;
      if (!effective.get(edge.source)?.has(flagName)) continue;
      if (!effective.get(edge.target)?.has(flagName)) continue;
      brightEdgeKeys.add(`${edge.source}->${edge.target}`);
    }
  }

  if (options.showContains && effective) {
    for (const edge of scheme.spatialEdges) {
      if (edge.relation !== 'contains') continue;
      const innerId = edge.source;
      const outerId = edge.target;
      const innerCarrier = carrierIds.has(innerId);
      const outerCarrier = carrierIds.has(outerId);
      // Need at least one side where the flag applies.
      if (!innerCarrier && !outerCarrier) continue;

      // Always light the containment edge when a flag carrier is involved
      // (previously we skipped entirely when the inner also had the flag —
      // so with inheritance on the checkbox looked like a no-op).
      containedNoInheritEdgeKeys.add(`contains-${innerId}-${outerId}`);

      if (outerCarrier && !innerCarrier) {
        // Fully inside a carrier but does not get the flag via parent (∈).
        containedNoInheritIds.add(innerId);
        if (!definingIds.has(outerId)) brightIds.add(outerId);
      } else {
        // Carrier on one or both sides: keep carrier endpoints visible.
        if (innerCarrier && !definingIds.has(innerId)) brightIds.add(innerId);
        if (outerCarrier && !definingIds.has(outerId)) brightIds.add(outerId);
        // Non-carrier container of a flagged inner: keep visible via purple style
        // without the ∈ caption (that mark is only for non-inheriting inners).
        if (innerCarrier && !outerCarrier) {
          containedNoInheritIds.add(outerId);
        }
      }
    }
  }

  if (options.showIntersects && effective) {
    for (const edge of scheme.spatialEdges) {
      if (edge.relation !== 'intersects') continue;
      const a = edge.source;
      const b = edge.target;
      const aCarrier = carrierIds.has(a);
      const bCarrier = carrierIds.has(b);
      if (aCarrier === bCarrier) {
        // Both carriers (or neither): still light the edge when both carry the flag.
        if (aCarrier && bCarrier) {
          intersectPartialEdgeKeys.add(`intersects-${a}-${b}`);
          intersectPartialEdgeKeys.add(`intersects-${b}-${a}`);
          if (!definingIds.has(a)) brightIds.add(a);
          if (!definingIds.has(b)) brightIds.add(b);
        }
        continue;
      }
      const partialId = aCarrier ? b : a;
      const carrierId = aCarrier ? a : b;
      if (
        definingIds.has(partialId)
        || brightIds.has(partialId)
        || containedNoInheritIds.has(partialId)
      ) {
        continue;
      }
      intersectPartialIds.add(partialId);
      intersectPartialEdgeKeys.add(`intersects-${partialId}-${carrierId}`);
      intersectPartialEdgeKeys.add(`intersects-${carrierId}-${partialId}`);
      if (!definingIds.has(carrierId)) brightIds.add(carrierId);
    }
  }

  return {
    definingIds,
    brightIds,
    brightEdgeKeys,
    ...(containedNoInheritIds.size > 0
      ? { containedNoInheritIds, containedNoInheritEdgeKeys }
      : {}),
    ...(intersectPartialIds.size > 0 || intersectPartialEdgeKeys.size > 0
      ? { intersectPartialIds, intersectPartialEdgeKeys }
      : {}),
  };
}

/** Attach all spatial conflicts for `flagName` onto an existing highlight. */
export function attachFlagConflicts(
  highlight: FlagHighlight,
  conflicts: Array<{
    flagName: string;
    relation: string;
    aId: string;
    bId: string;
  }>,
  flagName: string,
): FlagHighlight {
  const conflictIds = new Set<string>(highlight.conflictIds);
  const conflictEdgeKeys = new Set<string>(highlight.conflictEdgeKeys);
  for (const c of conflicts) {
    if (c.flagName !== flagName) continue;
    conflictIds.add(c.aId);
    conflictIds.add(c.bId);
    conflictEdgeKeys.add(`${c.relation}-${c.aId}-${c.bId}`);
    conflictEdgeKeys.add(`${c.relation}-${c.bId}-${c.aId}`);
  }
  if (conflictIds.size === 0) return highlight;
  return { ...highlight, conflictIds, conflictEdgeKeys };
}

function collectAncestors(
  id: string,
  parentMap: Map<string, string | null>,
): string[] {
  const list: string[] = [];
  let current = parentMap.get(id) ?? null;
  while (current) {
    list.push(current);
    current = parentMap.get(current) ?? null;
  }
  return list;
}

function lightHierarchyPath(
  fromId: string,
  toId: string,
  parentMap: Map<string, string | null>,
  brightIds: Set<string>,
  brightEdgeKeys: Set<string>,
): void {
  if (fromId === toId) {
    brightIds.add(fromId);
    return;
  }
  let child = fromId;
  let current = parentMap.get(fromId) ?? null;
  brightIds.add(fromId);
  while (current) {
    brightIds.add(current);
    brightEdgeKeys.add(`${current}->${child}`);
    if (current === toId) break;
    child = current;
    current = parentMap.get(current) ?? null;
  }
}

/**
 * When a spatial conflict / overwrite is shown on the flag scheme, light only
 * hierarchy paths for the focused pair (not every region that sets the flag):
 * - each participant → nearest ancestor that sets the flag (if any)
 * - both participants → their lowest common ancestor, but only when that LCA
 *   itself sets the flag (otherwise the shared parent is unrelated noise)
 */
function lightConflictPairPaths(
  aId: string,
  bId: string,
  parentMap: Map<string, string | null>,
  definingIds: Set<string>,
  brightIds: Set<string>,
  brightEdgeKeys: Set<string>,
): void {
  for (const id of [aId, bId]) {
    brightIds.add(id);
    const anc = collectAncestors(id, parentMap);
    const nearestDefining = anc.find((pid) => definingIds.has(pid));
    if (nearestDefining) {
      lightHierarchyPath(id, nearestDefining, parentMap, brightIds, brightEdgeKeys);
    }
    if (definingIds.has(id)) {
      brightIds.add(id);
    }
  }

  // LCA only if it assigns the flag (e.g. overwrite under a shared setter).
  // Skip unrelated shared parents like `root` above two independent setters.
  const bSet = new Set([bId, ...collectAncestors(bId, parentMap)]);
  let lca: string | null = null;
  for (const id of [aId, ...collectAncestors(aId, parentMap)]) {
    if (bSet.has(id)) {
      lca = id;
      break;
    }
  }
  if (lca && definingIds.has(lca)) {
    lightHierarchyPath(aId, lca, parentMap, brightIds, brightEdgeKeys);
    lightHierarchyPath(bId, lca, parentMap, brightIds, brightEdgeKeys);
  }
}

export function attachConflictInheritancePaths(
  highlight: FlagHighlight,
  scheme: Scheme,
  aId: string,
  bId: string,
): FlagHighlight {
  const parentMap = buildParentMap(scheme.regions);
  const brightIds = new Set<string>();
  const brightEdgeKeys = new Set<string>();
  const { definingIds } = highlight;

  lightConflictPairPaths(aId, bId, parentMap, definingIds, brightIds, brightEdgeKeys);

  const focusedDefining = new Set(
    [...definingIds].filter((id) => brightIds.has(id)),
  );

  return {
    ...highlight,
    definingIds: focusedDefining,
    brightIds,
    brightEdgeKeys,
  };
}

/**
 * Merge inheritance paths for many conflict pairs onto an existing highlight
 * (keeps defining / bright nodes from the base; used by "show conflicts" mode).
 */
export function mergeConflictInheritancePaths(
  highlight: FlagHighlight,
  scheme: Scheme,
  pairs: Array<{ aId: string; bId: string }>,
): FlagHighlight {
  if (pairs.length === 0) return highlight;
  const parentMap = buildParentMap(scheme.regions);
  const brightIds = new Set(highlight.brightIds);
  const brightEdgeKeys = new Set(highlight.brightEdgeKeys);
  for (const { aId, bId } of pairs) {
    lightConflictPairPaths(
      aId,
      bId,
      parentMap,
      highlight.definingIds,
      brightIds,
      brightEdgeKeys,
    );
  }
  return { ...highlight, brightIds, brightEdgeKeys };
}

export function flagValueLabel(region: RegionData | undefined, flagName: string): string {
  if (!region || !(flagName in (region.flags || {}))) return '';
  return formatValue(region.flags[flagName]);
}

/** Default collapsed set: nodes whose entire subtree has no flags. */
export function defaultCollapsedWithoutFlagSubtrees(
  roots: ForestNode[],
  regionsById: Map<string, RegionData>,
): Set<string> {
  const collapsed = new Set<string>();

  function subtreeHasFlags(node: ForestNode): boolean {
    const self = regionsById.get(node.id);
    const selfHas = !!self && Object.keys(self.flags || {}).length > 0;
    let childHas = false;
    for (const child of node.children) {
      if (subtreeHasFlags(child)) childHas = true;
    }
    // Collapse when children exist but none (including deeper) have flags.
    if (node.children.length > 0 && !childHas) {
      collapsed.add(node.id);
    }
    return selfHas || childHas;
  }

  for (const root of roots) subtreeHasFlags(root);
  return collapsed;
}

/** Collapse branches that never assign `flagName` locally. */
export function defaultCollapsedWithoutNamedFlag(
  roots: ForestNode[],
  regionsById: Map<string, RegionData>,
  flagName: string,
): Set<string> {
  const collapsed = new Set<string>();

  function subtreeDefines(node: ForestNode): boolean {
    const self = regionsById.get(node.id);
    const selfHas = !!self && Object.prototype.hasOwnProperty.call(self.flags || {}, flagName);
    let childHas = false;
    for (const child of node.children) {
      if (subtreeDefines(child)) childHas = true;
    }
    if (node.children.length > 0 && !childHas) {
      collapsed.add(node.id);
    }
    return selfHas || childHas;
  }

  for (const root of roots) subtreeDefines(root);
  return collapsed;
}
