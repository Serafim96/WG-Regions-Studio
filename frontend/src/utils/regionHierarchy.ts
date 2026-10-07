export type AddChildCheck =
  | { ok: true; moveFrom: string | null }
  | { ok: false; reason: 'self' | 'already' | 'ancestor' | 'unknown' };

export function checkCanAddChild(
  parentId: string,
  childId: string,
  regionsById: Map<string, { parent?: string | null }>,
): AddChildCheck {
  const child = regionsById.get(childId);
  if (!child) return { ok: false, reason: 'unknown' };
  if (childId === parentId) return { ok: false, reason: 'self' };
  if (child.parent === parentId) return { ok: false, reason: 'already' };
  let current: string | null | undefined = parentId;
  while (current) {
    if (current === childId) return { ok: false, reason: 'ancestor' };
    const node = regionsById.get(current);
    current = node?.parent ?? null;
  }
  return { ok: true, moveFrom: child.parent ?? null };
}
