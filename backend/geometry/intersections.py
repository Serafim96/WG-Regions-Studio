"""Spatial intersection and containment detection."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from shapely.geometry import Polygon

from backend.models.region import Region, Vec2, Vec3

SpatialRelation = Literal["intersects", "contains"]


@dataclass(frozen=True)
class SpatialEdge:
    source: str
    target: str
    relation: SpatialRelation
    # Shared intersection volume in blocks (intersects edges only).
    overlap_blocks: int | None = None

    def normalized_key(self) -> tuple[str, str, SpatialRelation]:
        if self.relation == "intersects":
            a, b = sorted((self.source, self.target))
            return (a, b, "intersects")
        return (self.source, self.target, "contains")


def cuboid_volume(region: Region) -> int | None:
    if region.type != "cuboid" or not region.min or not region.max:
        return None
    dx = region.max.x - region.min.x + 1
    dy = region.max.y - region.min.y + 1
    dz = region.max.z - region.min.z + 1
    return dx * dy * dz


def poly2d_volume(region: Region) -> int | None:
    if region.type != "poly2d" or not region.points:
        return None
    if region.min_y is None or region.max_y is None:
        return None
    area = _polygon_area_xz(region.points)
    height = region.max_y - region.min_y + 1
    return int(area * height)


def region_volume(region: Region) -> int | None:
    if region.type == "cuboid":
        return cuboid_volume(region)
    if region.type == "poly2d":
        return poly2d_volume(region)
    return None


def _inclusive_axis_overlap(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> int | None:
    """Inclusive block count along one axis; None if no positive overlap."""
    lo = max(a_lo, b_lo)
    hi = min(a_hi, b_hi)
    if hi < lo:
        return None
    return hi - lo + 1


def intersection_volume(a: Region, b: Region) -> int | None:
    """Volume of A ∩ B in blocks, or None when not computable / empty."""
    if not is_spatial(a) or not is_spatial(b):
        return None

    y_a = _get_y_range(a)
    y_b = _get_y_range(b)
    if y_a is None or y_b is None:
        return None
    height = _inclusive_axis_overlap(y_a[0], y_a[1], y_b[0], y_b[1])
    if height is None:
        return None

    if a.type == "cuboid" and b.type == "cuboid":
        assert a.min and a.max and b.min and b.max
        dx = _inclusive_axis_overlap(a.min.x, a.max.x, b.min.x, b.max.x)
        dy = _inclusive_axis_overlap(a.min.y, a.max.y, b.min.y, b.max.y)
        dz = _inclusive_axis_overlap(a.min.z, a.max.z, b.min.z, b.max.z)
        if dx is None or dy is None or dz is None:
            return None
        return dx * dy * dz

    poly_a = _cuboid_to_polygon_xz(a) if a.type == "cuboid" else _poly_to_polygon(a)
    poly_b = _cuboid_to_polygon_xz(b) if b.type == "cuboid" else _poly_to_polygon(b)
    if poly_a is None or poly_b is None:
        return None
    inter = poly_a.intersection(poly_b)
    if inter.is_empty or inter.area <= 0:
        return None
    return int(inter.area * height)


def _polygon_area_xz(points: list[Vec2]) -> float:
    poly = Polygon([(p.x, p.z) for p in points])
    return abs(poly.area)


def _cuboid_aabb_overlap(a_min: Vec3, a_max: Vec3, b_min: Vec3, b_max: Vec3) -> bool:
    """True if AABBs overlap with positive volume (touch-only returns False)."""
    for lo_a, hi_a, lo_b, hi_b in [
        (a_min.x, a_max.x, b_min.x, b_max.x),
        (a_min.y, a_max.y, b_min.y, b_max.y),
        (a_min.z, a_max.z, b_min.z, b_max.z),
    ]:
        if hi_a < lo_b or hi_b < lo_a:
            return False
        if hi_a == lo_b or hi_b == lo_a:
            return False
    return True


def _cuboid_contains(a_min: Vec3, a_max: Vec3, b_min: Vec3, b_max: Vec3) -> bool:
    return (
        a_min.x <= b_min.x
        and a_max.x >= b_max.x
        and a_min.y <= b_min.y
        and a_max.y >= b_max.y
        and a_min.z <= b_min.z
        and a_max.z >= b_max.z
    )


def _y_ranges_overlap(a_lo: int, a_hi: int, b_lo: int, b_hi: int) -> bool:
    if a_hi < b_lo or b_hi < a_lo:
        return False
    if a_hi == b_lo or b_hi == a_lo:
        return False
    return True


def _poly_y_range(region: Region) -> tuple[int, int] | None:
    if region.type == "poly2d":
        if region.min_y is None or region.max_y is None:
            return None
        return region.min_y, region.max_y
    return None


def _cuboid_y_range(region: Region) -> tuple[int, int] | None:
    if region.type == "cuboid" and region.min and region.max:
        return region.min.y, region.max.y
    return None


def _get_y_range(region: Region) -> tuple[int, int] | None:
    return _cuboid_y_range(region) or _poly_y_range(region)


def _poly_to_polygon(region: Region) -> Polygon | None:
    if not region.points or len(region.points) < 3:
        return None
    return Polygon([(p.x, p.z) for p in region.points])


def _cuboid_to_polygon_xz(region: Region) -> Polygon | None:
    if not region.min or not region.max:
        return None
    x0, x1 = region.min.x, region.max.x
    z0, z1 = region.min.z, region.max.z
    return Polygon([(x0, z0), (x1, z0), (x1, z1), (x0, z1)])


def _polygons_intersect(a: Polygon, b: Polygon) -> bool:
    inter = a.intersection(b)
    return not inter.is_empty and inter.area > 0


def _polygon_contains(outer: Polygon, inner: Polygon) -> bool:
    return outer.contains(inner) and not outer.touches(inner)


def is_spatial(region: Region) -> bool:
    """True when the region has geometry that participates in spatial edges.

    Temporary (manual) regions with complete cuboid/poly2d coords are included;
    only global / incomplete / draft ``manual`` types are excluded.
    """
    if region.type in ("global", "manual"):
        return False
    if region.type == "cuboid":
        return region.min is not None and region.max is not None
    if region.type == "poly2d":
        return bool(region.points) and region.min_y is not None and region.max_y is not None
    return False


def regions_intersect(a: Region, b: Region) -> bool:
    if not is_spatial(a) or not is_spatial(b):
        return False

    y_a = _get_y_range(a)
    y_b = _get_y_range(b)
    if y_a is None or y_b is None:
        return False
    if not _y_ranges_overlap(y_a[0], y_a[1], y_b[0], y_b[1]):
        return False

    if a.type == "cuboid" and b.type == "cuboid":
        assert a.min and a.max and b.min and b.max
        return _cuboid_aabb_overlap(a.min, a.max, b.min, b.max)

    poly_a = _cuboid_to_polygon_xz(a) if a.type == "cuboid" else _poly_to_polygon(a)
    poly_b = _cuboid_to_polygon_xz(b) if b.type == "cuboid" else _poly_to_polygon(b)
    if poly_a is None or poly_b is None:
        return False
    return _polygons_intersect(poly_a, poly_b)


def region_contains(outer: Region, inner: Region) -> bool:
    if not is_spatial(outer) or not is_spatial(inner):
        return False

    y_outer = _get_y_range(outer)
    y_inner = _get_y_range(inner)
    if y_outer is None or y_inner is None:
        return False
    if not (y_outer[0] <= y_inner[0] and y_outer[1] >= y_inner[1]):
        return False

    if outer.type == "cuboid" and inner.type == "cuboid":
        assert outer.min and outer.max and inner.min and inner.max
        return _cuboid_contains(outer.min, outer.max, inner.min, inner.max)

    poly_outer = (
        _cuboid_to_polygon_xz(outer) if outer.type == "cuboid" else _poly_to_polygon(outer)
    )
    poly_inner = (
        _cuboid_to_polygon_xz(inner) if inner.type == "cuboid" else _poly_to_polygon(inner)
    )
    if poly_outer is None or poly_inner is None:
        return False
    return _polygon_contains(poly_outer, poly_inner)


def compute_spatial_edges(regions: list[Region]) -> list[SpatialEdge]:
    """O(n²) pairwise spatial relation detection."""
    spatial = [r for r in regions if is_spatial(r)]
    edges: list[SpatialEdge] = []
    seen: set[tuple[str, str, SpatialRelation]] = set()

    for i, a in enumerate(spatial):
        for b in spatial[i + 1 :]:
            if region_contains(a, b):
                key = (b.id, a.id, "contains")
                if key not in seen:
                    seen.add(key)
                    edges.append(SpatialEdge(source=b.id, target=a.id, relation="contains"))
                continue
            if region_contains(b, a):
                key = (a.id, b.id, "contains")
                if key not in seen:
                    seen.add(key)
                    edges.append(SpatialEdge(source=a.id, target=b.id, relation="contains"))
                continue
            if regions_intersect(a, b):
                x, y = sorted((a.id, b.id))
                key = (x, y, "intersects")
                if key not in seen:
                    seen.add(key)
                    edges.append(
                        SpatialEdge(
                            source=x,
                            target=y,
                            relation="intersects",
                            overlap_blocks=intersection_volume(a, b),
                        )
                    )

    return edges
