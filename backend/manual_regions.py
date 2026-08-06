"""Operations on temporary (manual) regions in the session."""

from __future__ import annotations

from dataclasses import replace
from typing import Literal

from backend.models.region import Region

ChildrenMode = Literal["detach", "cascade", "orphan"]


def collect_descendant_ids(regions: list[Region], root_id: str) -> set[str]:
    """Return all descendant region ids (not including root_id)."""
    by_parent: dict[str, list[str]] = {}
    for region in regions:
        if region.parent:
            by_parent.setdefault(region.parent, []).append(region.id)

    result: set[str] = set()
    stack = list(by_parent.get(root_id, []))
    while stack:
        region_id = stack.pop()
        if region_id in result:
            continue
        result.add(region_id)
        stack.extend(by_parent.get(region_id, []))
    return result


def delete_region(
    regions: list[Region],
    region_id: str,
    children_mode: ChildrenMode,
) -> list[Region]:
    """Remove a region; cascade-delete, reparent, or orphan its children."""
    target = next((region for region in regions if region.id == region_id), None)
    if target is None:
        raise ValueError(f"Region '{region_id}' not found")

    if children_mode == "cascade":
        remove_ids = {region_id} | collect_descendant_ids(regions, region_id)
        return [region for region in regions if region.id not in remove_ids]

    new_parent = None if children_mode == "orphan" else target.parent
    updated: list[Region] = []
    for region in regions:
        if region.id == region_id:
            continue
        if region.parent == region_id:
            updated.append(replace(region, parent=new_parent))
        else:
            updated.append(region)
    return updated


# Backwards-compatible alias (manual-only check removed; any region can be deleted).
def delete_manual_region(
    regions: list[Region],
    region_id: str,
    children_mode: ChildrenMode,
) -> list[Region]:
    return delete_region(regions, region_id, children_mode)


def clear_manual_regions(regions: list[Region]) -> list[Region]:
    """Remove all temporary regions; re-link remaining children past deleted manuals."""
    by_id = {region.id: region for region in regions}
    manual_ids = {region.id for region in regions if region.is_manual}
    if not manual_ids:
        return list(regions)

    def resolve_parent(parent_id: str | None) -> str | None:
        current = parent_id
        while current and current in manual_ids:
            current = by_id[current].parent if current in by_id else None
        return current

    result: list[Region] = []
    for region in regions:
        if region.id in manual_ids:
            continue
        new_parent = resolve_parent(region.parent)
        if new_parent != region.parent:
            result.append(replace(region, parent=new_parent))
        else:
            result.append(region)
    return result
