export type EffectiveRowCategory =
  | 'local'
  | 'inheritance'
  | 'containment'
  | 'intersection'
  | 'warning'
  | 'conflict';

export function effectiveRowCategory(row: {
  kind: string;
  inheritType?: string | null;
}): EffectiveRowCategory {
  if (row.inheritType === 'warning') return 'warning';
  if (row.kind === 'ambiguous') return 'conflict';
  if (row.kind === 'local' || !row.inheritType) return 'local';
  return row.inheritType as 'inheritance' | 'containment' | 'intersection';
}
