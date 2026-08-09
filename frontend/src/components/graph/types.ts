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
  valueLabels?: Map<string, { text: string; defining: boolean }>;
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
