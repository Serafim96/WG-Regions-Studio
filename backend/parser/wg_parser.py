"""Parse WorldGuard regions.yml into Region objects."""

from __future__ import annotations

from typing import Any

import yaml

from backend.models.region import Region, Vec2, Vec3

VALID_TYPES = {"cuboid", "poly2d", "global", "manual"}


class ParseError(Exception):
    """Raised when YAML cannot be parsed into valid regions."""


def parse_regions_yaml(content: str) -> list[Region]:
    """Parse YAML text and return a list of Region objects."""
    try:
        data = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise ParseError(f"Invalid YAML: {exc}") from exc

    if not isinstance(data, dict):
        raise ParseError("Root must be a mapping")

    regions_block = data.get("regions")
    if regions_block is None:
        raise ParseError("Missing 'regions' key")
    if not isinstance(regions_block, dict):
        raise ParseError("'regions' must be a mapping")

    regions: list[Region] = []
    for region_id, raw in regions_block.items():
        if not isinstance(raw, dict):
            raise ParseError(f"Region '{region_id}' must be a mapping")
        regions.append(_parse_region(str(region_id), raw))

    return regions


def _parse_region(region_id: str, raw: dict[str, Any]) -> Region:
    region_type = raw.get("type")
    if region_type not in VALID_TYPES - {"manual"}:
        raise ParseError(f"Region '{region_id}': unknown type '{region_type}'")

    parent = raw.get("parent")
    if parent is not None:
        parent = str(parent)

    priority = int(raw.get("priority", 0))
    flags = raw.get("flags") or {}
    owners = raw.get("owners") or {}
    members = raw.get("members") or {}

    if not isinstance(flags, dict):
        raise ParseError(f"Region '{region_id}': flags must be a mapping")
    if not isinstance(owners, dict):
        raise ParseError(f"Region '{region_id}': owners must be a mapping")
    if not isinstance(members, dict):
        raise ParseError(f"Region '{region_id}': members must be a mapping")

    min_v = raw.get("min")
    max_v = raw.get("max")
    min_y = raw.get("min-y")
    max_y = raw.get("max-y")
    points_raw = raw.get("points")

    min_vec = Vec3.from_dict(min_v) if min_v else None
    max_vec = Vec3.from_dict(max_v) if max_v else None
    points = None
    if points_raw:
        if not isinstance(points_raw, list):
            raise ParseError(f"Region '{region_id}': points must be a list")
        points = [Vec2.from_dict(p) for p in points_raw]

    return Region(
        id=region_id,
        type=region_type,
        parent=parent,
        priority=priority,
        flags=flags,
        owners=owners,
        members=members,
        min=min_vec,
        max=max_vec,
        min_y=int(min_y) if min_y is not None else None,
        max_y=int(max_y) if max_y is not None else None,
        points=points,
        is_manual=False,
    )


def validate_parent_links(regions: list[Region]) -> None:
    """Ensure every parent exists and there are no cycles."""
    by_id = {r.id: r for r in regions}

    for region in regions:
        if region.parent and region.parent not in by_id:
            raise ParseError(
                f"Region '{region.id}' references unknown parent '{region.parent}'"
            )

    # Cycle detection via DFS
    visiting: set[str] = set()
    visited: set[str] = set()

    def dfs(node_id: str) -> None:
        if node_id in visiting:
            raise ParseError(f"Cycle detected involving region '{node_id}'")
        if node_id in visited:
            return
        visiting.add(node_id)
        region = by_id.get(node_id)
        if region and region.parent:
            dfs(region.parent)
        visiting.remove(node_id)
        visited.add(node_id)

    for region in regions:
        dfs(region.id)
