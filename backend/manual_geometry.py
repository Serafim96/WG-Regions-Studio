"""Helpers for temporary (manual) region geometry and type."""

from __future__ import annotations

from typing import Any

from backend.models.region import Region, RegionType, Vec2, Vec3

ALLOWED_MANUAL_TYPES: set[str] = {"manual", "global", "cuboid", "poly2d"}


def is_manual_region(region: Region) -> bool:
    return bool(region.is_manual) or region.type == "manual"


def region_has_exportable_coords(region: Region) -> bool:
    """True if a non-global region has coordinates required for YAML export."""
    exported_type = "global" if region.type == "manual" else region.type
    if exported_type == "global":
        return True
    if exported_type == "cuboid":
        return region.min is not None and region.max is not None
    if exported_type == "poly2d":
        return (
            region.points is not None
            and len(region.points) >= 3
            and region.min_y is not None
            and region.max_y is not None
        )
    return False


def incomplete_manual_regions(regions: list[Region]) -> list[str]:
    """Ids of temporary non-global regions missing coordinates."""
    missing: list[str] = []
    for region in regions:
        if not is_manual_region(region):
            continue
        exported_type = "global" if region.type == "manual" else region.type
        if exported_type == "global":
            continue
        if not region_has_exportable_coords(region):
            missing.append(region.id)
    return sorted(missing)


def parse_vec3(data: dict[str, Any] | None) -> Vec3 | None:
    if not data:
        return None
    return Vec3(x=int(data["x"]), y=int(data["y"]), z=int(data["z"]))


def parse_points(data: list[dict[str, Any]] | None) -> list[Vec2] | None:
    if data is None:
        return None
    return [Vec2(x=int(p["x"]), z=int(p["z"])) for p in data]


def normalize_manual_type(raw: str | None) -> RegionType:
    value = (raw or "manual").strip().lower()
    if value not in ALLOWED_MANUAL_TYPES:
        raise ValueError(f"Unsupported region type «{raw}»")
    return value  # type: ignore[return-value]


def apply_geometry_fields(
    region: Region,
    *,
    region_type: RegionType,
    min_v: dict[str, Any] | None = None,
    max_v: dict[str, Any] | None = None,
    min_y: int | None = None,
    max_y: int | None = None,
    points: list[dict[str, Any]] | None = None,
    clear_geometry: bool = False,
) -> None:
    """Mutate region type and coordinate fields for a temporary region."""
    region.type = region_type
    region.is_manual = True

    if region_type == "global" or clear_geometry:
        region.min = None
        region.max = None
        region.min_y = None
        region.max_y = None
        region.points = None
        return

    if region_type == "cuboid":
        region.min = parse_vec3(min_v)
        region.max = parse_vec3(max_v)
        region.min_y = None
        region.max_y = None
        region.points = None
        return

    if region_type == "poly2d":
        region.min = None
        region.max = None
        region.min_y = min_y
        region.max_y = max_y
        region.points = parse_points(points)
        return

    # Legacy type "manual" — keep as draft without forcing geometry.
    if clear_geometry or (min_v is None and max_v is None and points is None):
        region.min = None
        region.max = None
        region.min_y = None
        region.max_y = None
        region.points = None
