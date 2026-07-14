"""Operations on temporary (manual) regions in the session."""

from __future__ import annotations

from dataclasses import replace
from typing import Literal

from backend.models.region import Region

ChildrenMode = Literal["detach", "cascade"]


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


def delete_manual_region(
    regions: list[Region],
    region_id: str,
    children_mode: ChildrenMode,
) -> list[Region]:
    """Remove a manual region; detach or cascade-delete its children."""
    target = next((region for region in regions if region.id == region_id), None)
    if target is None:
        raise ValueError(f"Region '{region_id}' not found")
    if not target.is_manual:
        raise ValueError(f"Region '{region_id}' is not manual")

    if children_mode == "cascade":
        remove_ids = {region_id} | collect_descendant_ids(regions, region_id)
        return [region for region in regions if region.id not in remove_ids]

    new_parent = target.parent
    updated: list[Region] = []
    for region in regions:
        if region.id == region_id:
            continue
        if region.parent == region_id:
            updated.append(replace(region, parent=new_parent))
        else:
            updated.append(region)
    return updated
