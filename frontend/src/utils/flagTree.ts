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

export interface FlagHighlight {
  /** Regions that locally assign the flag (brightest on the scheme). */
  definingIds: Set<string>;
  /**
   * Defining regions + non-defining ancestors that lie between a defining
   * region and its nearest defining ancestor (inheritance override path).
   * Ancestors above the topmost assignment are not included.
   */
  brightIds: Set<string>;
  /** Hierarchy edges (source=parent, target=child) on the bright path. */
  brightEdgeKeys: Set<string>;
  /** Spatial-conflict participants not necessarily on the flag path. */
  conflictIds?: Set<string>;
  /** Spatial edges involved in the shown conflict (`relation-source-target`). */
  conflictEdgeKeys?: Set<string>;
  /** Flag values to show next to highlighted nodes (skipped for set-types). */
  valueLabels?: Map<string, FlagValueLabel>;
}

const MAX_VALUE_LABEL_LEN = 28;
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
    return { ...highlight, valueLabels: new Map() };
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

export function buildFlagHighlight(scheme: Scheme, flagName: string): FlagHighlight {
  const parentMap = buildParentMap(scheme.regions);
  const definingIds = new Set(
    scheme.regions
      .filter((r) => Object.prototype.hasOwnProperty.call(r.flags || {}, flagName))
      .map((r) => r.id),
  );
  const brightIds = new Set<string>(definingIds);
  const brightEdgeKeys = new Set<string>();

  // Light the path only between a defining region and its nearest defining
  // ancestor. If nothing above sets the flag, keep only the defining node.
  for (const id of definingIds) {
    const intermediates: string[] = [];
    let current = parentMap.get(id) ?? null;
    while (current && !definingIds.has(current)) {
      intermediates.push(current);
      current = parentMap.get(current) ?? null;
    }
    if (!current) continue;

    const chain = [id, ...intermediates, current];
    for (let i = 0; i < chain.length - 1; i++) {
      const child = chain[i];
      const parent = chain[i + 1];
      brightIds.add(parent);
      brightEdgeKeys.add(`${parent}->${child}`);
    }
  }

  return { definingIds, brightIds, brightEdgeKeys };
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
 * - both participants → their lowest common ancestor
 */
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

  // Lowest common ancestor — explains why the two regions are related.
  const bSet = new Set([bId, ...collectAncestors(bId, parentMap)]);
  let lca: string | null = null;
  for (const id of [aId, ...collectAncestors(aId, parentMap)]) {
    if (bSet.has(id)) {
      lca = id;
      break;
    }
  }
  if (lca) {
    lightHierarchyPath(aId, lca, parentMap, brightIds, brightEdgeKeys);
    lightHierarchyPath(bId, lca, parentMap, brightIds, brightEdgeKeys);
  }

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
