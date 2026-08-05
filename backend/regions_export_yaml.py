"""Export current session regions into WorldGuard-compatible regions.yml."""

from __future__ import annotations

from typing import Any

import yaml

from backend.manual_geometry import incomplete_manual_regions, is_manual_region
from backend.models.region import Region
from backend.parser.wg_parser import validate_parent_links


def export_type_of(region: Region) -> str:
    """WorldGuard-compatible type for YAML export."""
    return "global" if region.type == "manual" else region.type


def _export_parent(
    region: Region,
    selected_ids: set[str],
    by_id: dict[str, Region],
) -> str | None:
    """Skip excluded ancestors so parent always points to an exported region."""
    parent = region.parent
    while parent and parent not in selected_ids:
        ancestor = by_id.get(parent)
        parent = ancestor.parent if ancestor else None
    return parent


def export_regions_yaml(
    regions: list[Region],
    *,
    include_manual: bool = True,
) -> str:
    """
    Build YAML in a format that `parse_regions_yaml()` can read.

    Notes:
    - Internal `type: manual` is exported as WorldGuard-compatible `type: global`.
    - For `poly2d` we export `min-y`/`max-y` and `points`.
    - For `cuboid` we export `min`/`max` blocks.
    - When `include_manual` is False, temporary (`is_manual`) regions are omitted.
    """
    by_id = {r.id: r for r in regions}
    selected = [
        r for r in regions
        if include_manual or not is_manual_region(r)
    ]
    selected_ids = {r.id for r in selected}

    if include_manual:
        missing = incomplete_manual_regions(selected)
        if missing:
            raise ValueError(
                "Temporary regions without coordinates: " + ", ".join(missing)
            )

    # Validate against a copy with remapped parents (excluded ancestors skipped).
    export_snapshot: list[Region] = []
    for r in selected:
        export_snapshot.append(
            Region(
                id=r.id,
                type=r.type,
                parent=_export_parent(r, selected_ids, by_id),
                priority=r.priority,
                flags=dict(r.flags or {}),
                owners=dict(r.owners or {}),
                members=dict(r.members or {}),
                min=r.min,
                max=r.max,
                min_y=r.min_y,
                max_y=r.max_y,
                points=list(r.points) if r.points else None,
                is_manual=r.is_manual,
            )
        )
    validate_parent_links(export_snapshot)

    regions_block: dict[str, Any] = {}
    for r in export_snapshot:
        exported_type = export_type_of(r)

        entry: dict[str, Any] = {
            "type": exported_type,
            "priority": r.priority,
            "flags": dict(r.flags or {}),
            "owners": dict(r.owners or {}),
            "members": dict(r.members or {}),
        }

        if r.parent:
            entry["parent"] = r.parent

        if exported_type == "cuboid":
            if r.min is not None:
                entry["min"] = r.min.to_dict()
            if r.max is not None:
                entry["max"] = r.max.to_dict()

        if exported_type == "poly2d":
            if r.points is not None:
                entry["points"] = [p.to_dict() for p in r.points]
            if r.min_y is not None:
                entry["min-y"] = r.min_y
            if r.max_y is not None:
                entry["max-y"] = r.max_y

        regions_block[r.id] = entry

    payload = {"regions": regions_block}
    return yaml.safe_dump(payload, sort_keys=False, default_flow_style=False)
