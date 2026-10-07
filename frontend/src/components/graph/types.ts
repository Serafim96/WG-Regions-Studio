export type FlagHighlightState = {
  definingIds: Set<string>;
  brightIds: Set<string>;
  brightEdgeKeys: Set<string>;
  containedNoInheritIds?: Set<string>;
  containedNoInheritEdgeKeys?: Set<string>;
  intersectPartialIds?: Set<string>;
  intersectPartialEdgeKeys?: Set<string>;
  conflictIds?: Set<string>;
  conflictEdgeKeys?: Set<string>;
  resolvedConflictIds?: Set<string>;
  resolvedConflictEdgeKeys?: Set<string>;
  resolvedEdgeLabels?: Map<string, string>;
  ambiguousEdgeLabels?: Map<string, string>;
  intersectEdgeLabels?: Map<string, string>;
  intersectEdgeEndpoints?: Map<string, { sourcePct: string; targetPct: string }>;
  containsEdgeLabels?: Map<string, string>;
  hierarchyEdgeLabels?: Map<string, string>;
  valueLabels?: Map<string, { text: string; defining: boolean; partial?: boolean }>;
} | null;

export type EdgeDisplayFilters = {
  intersects: boolean;
  contains: boolean;
  hierarchy: boolean;
};

export const DEFAULT_EDGE_DISPLAY_FILTERS: EdgeDisplayFilters = {
  intersects: true,
  contains: true,
  hierarchy: true,
};

export type HighlightBranchMode =
  | 'children'
  | 'full'
  | 'containment-all'
  | 'containment-children'
  | 'containment-parents'
  | 'intersects';

export interface ContextMenuState {
  x: number;
  y: number;
  /** Absent when the menu was opened on empty canvas. */
  nodeId?: string;
}

export function edgeAllowedByDisplayFilters(
  kind: 'hierarchy' | 'intersects' | 'contains',
  filters: EdgeDisplayFilters,
): boolean {
  return filters[kind];
}

/** Region has a role on the active flag scheme (double-click opens effective flags). */
export function regionParticipatesInFlagScheme(
  regionId: string,
  highlight: NonNullable<FlagHighlightState>,
): boolean {
  if (highlight.definingIds.has(regionId)) return true;
  if (highlight.brightIds.has(regionId)) return true;
  if (highlight.valueLabels?.has(regionId)) return true;
  if (highlight.containedNoInheritIds?.has(regionId)) return true;
  if (highlight.intersectPartialIds?.has(regionId)) return true;
  if (highlight.conflictIds?.has(regionId)) return true;
  if (highlight.resolvedConflictIds?.has(regionId)) return true;
  return false;
}
