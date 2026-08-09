"""Spatial intersection and containment detection."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from shapely.geometry import Polygon
from shapely.geometry.base import BaseGeometry

from backend.models.region import Region, Vec2, Vec3

SpatialRelation = Literal["intersects", "contains"]

# Below this count, full pairwise is cheaper than grid bookkeeping.
_GRID_PAIR_THRESHOLD = 64
# Default XZ cell size for spatial hashing (blocks); adaptive override below.
_DEFAULT_GRID_CELL = 64.0


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
        return (self.source, self.target, self.relation)


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


@dataclass
class _CachedGeom:
    """Per-region geometry cache for one ``compute_spatial_edges`` call."""

    region: Region
    y0: int
    y1: int
    min_x: float
    max_x: float
    min_z: float
    max_z: float
    is_cuboid: bool
    _poly: Polygon | None = field(default=None, repr=False)

    def poly(self) -> Polygon | None:
        if self._poly is not None:
            return self._poly
        r = self.region
        if r.type == "cuboid":
            self._poly = _cuboid_to_polygon_xz(r)
        else:
            self._poly = _poly_to_polygon(r)
        return self._poly


def _build_cache(region: Region) -> _CachedGeom | None:
    y = _get_y_range(region)
    if y is None:
        return None
    if region.type == "cuboid" and region.min and region.max:
        return _CachedGeom(
            region=region,
            y0=y[0],
            y1=y[1],
            min_x=float(region.min.x),
            max_x=float(region.max.x),
            min_z=float(region.min.z),
            max_z=float(region.max.z),
            is_cuboid=True,
        )
    poly = _poly_to_polygon(region)
    if poly is None or poly.is_empty:
        return None
    min_x, min_z, max_x, max_z = poly.bounds
    return _CachedGeom(
        region=region,
        y0=y[0],
        y1=y[1],
        min_x=float(min_x),
        max_x=float(max_x),
        min_z=float(min_z),
        max_z=float(max_z),
        is_cuboid=False,
        _poly=poly,
    )


def _xz_aabb_positive_overlap(a: _CachedGeom, b: _CachedGeom) -> bool:
    """Positive-area XZ AABB overlap; touch-only edges do not count."""
    if a.max_x < b.min_x or b.max_x < a.min_x:
        return False
    if a.max_z < b.min_z or b.max_z < a.min_z:
        return False
    if a.max_x == b.min_x or b.max_x == a.min_x:
        return False
    if a.max_z == b.min_z or b.max_z == a.min_z:
        return False
    return True


def _y_covers(outer: _CachedGeom, inner: _CachedGeom) -> bool:
    return outer.y0 <= inner.y0 and outer.y1 >= inner.y1


def _cached_contains(outer: _CachedGeom, inner: _CachedGeom) -> bool:
    if not _y_covers(outer, inner):
        return False
    if outer.is_cuboid and inner.is_cuboid:
        assert outer.region.min and outer.region.max and inner.region.min and inner.region.max
        return _cuboid_contains(
            outer.region.min, outer.region.max, inner.region.min, inner.region.max
        )
    # Outer AABB must at least cover inner AABB on XZ (cheap reject).
    if (
        outer.min_x > inner.min_x
        or outer.max_x < inner.max_x
        or outer.min_z > inner.min_z
        or outer.max_z < inner.max_z
    ):
        return False
    poly_o = outer.poly()
    poly_i = inner.poly()
    if poly_o is None or poly_i is None:
        return False
    return _polygon_contains(poly_o, poly_i)


def _cached_intersect_volume(
    a: _CachedGeom,
    b: _CachedGeom,
) -> tuple[bool, int | None]:
    """Return (intersects?, overlap_blocks). Reuses one Shapely intersection when needed."""
    if not _y_ranges_overlap(a.y0, a.y1, b.y0, b.y1):
        return False, None
    if not _xz_aabb_positive_overlap(a, b):
        return False, None

    height = _inclusive_axis_overlap(a.y0, a.y1, b.y0, b.y1)
    if height is None:
        return False, None

    if a.is_cuboid and b.is_cuboid:
        assert a.region.min and a.region.max and b.region.min and b.region.max
        if not _cuboid_aabb_overlap(
            a.region.min, a.region.max, b.region.min, b.region.max
        ):
            return False, None
        dx = _inclusive_axis_overlap(a.region.min.x, a.region.max.x, b.region.min.x, b.region.max.x)
        dy = _inclusive_axis_overlap(a.region.min.y, a.region.max.y, b.region.min.y, b.region.max.y)
        dz = _inclusive_axis_overlap(a.region.min.z, a.region.max.z, b.region.min.z, b.region.max.z)
        if dx is None or dy is None or dz is None:
            return False, None
        return True, dx * dy * dz

    poly_a = a.poly()
    poly_b = b.poly()
    if poly_a is None or poly_b is None:
        return False, None
    inter: BaseGeometry = poly_a.intersection(poly_b)
    if inter.is_empty or inter.area <= 0:
        return False, None
    return True, int(inter.area * height)


def _adaptive_cell_size(cached: list[_CachedGeom]) -> float:
    if not cached:
        return _DEFAULT_GRID_CELL
    widths = [c.max_x - c.min_x for c in cached]
    depths = [c.max_z - c.min_z for c in cached]
    # Median-ish via sorted mid; prefer larger of median width/depth.
    widths.sort()
    depths.sort()
    mid = len(widths) // 2
    med = max(widths[mid], depths[mid], 1.0)
    # Cell roughly 1–2× median extent keeps neighbor buckets small.
    return max(med * 1.25, 8.0)


def _cells_for(c: _CachedGeom, cell: float) -> list[tuple[int, int]]:
    x0 = int(c.min_x // cell)
    x1 = int(c.max_x // cell)
    z0 = int(c.min_z // cell)
    z1 = int(c.max_z // cell)
    return [(x, z) for x in range(x0, x1 + 1) for z in range(z0, z1 + 1)]


def _candidate_pairs(cached: list[_CachedGeom]) -> list[tuple[int, int]]:
    n = len(cached)
    if n < 2:
        return []
    if n < _GRID_PAIR_THRESHOLD:
        return [(i, j) for i in range(n) for j in range(i + 1, n)]

    cell = _adaptive_cell_size(cached)
    buckets: dict[tuple[int, int], list[int]] = {}
    for i, c in enumerate(cached):
        for key in _cells_for(c, cell):
            buckets.setdefault(key, []).append(i)

    seen: set[tuple[int, int]] = set()
    pairs: list[tuple[int, int]] = []
    for indices in buckets.values():
        m = len(indices)
        if m < 2:
            continue
        for a in range(m):
            ia = indices[a]
            for b in range(a + 1, m):
                ib = indices[b]
                i, j = (ia, ib) if ia < ib else (ib, ia)
                if (i, j) not in seen:
                    seen.add((i, j))
                    pairs.append((i, j))
    return pairs


def compute_spatial_edges(regions: list[Region]) -> list[SpatialEdge]:
    """Pairwise spatial relation detection with AABB + grid prefilter and geom cache."""
    cached: list[_CachedGeom] = []
    for r in regions:
        if not is_spatial(r):
            continue
        entry = _build_cache(r)
        if entry is not None:
            cached.append(entry)

    edges: list[SpatialEdge] = []
    seen: set[tuple[str, str, SpatialRelation]] = set()

    for i, j in _candidate_pairs(cached):
        a = cached[i]
        b = cached[j]

        y_ok = _y_ranges_overlap(a.y0, a.y1, b.y0, b.y1) or _y_covers(a, b) or _y_covers(b, a)
        if not y_ok:
            continue

        xz_overlap = _xz_aabb_positive_overlap(a, b)
        xz_cover = (
            (a.min_x <= b.min_x and a.max_x >= b.max_x and a.min_z <= b.min_z and a.max_z >= b.max_z)
            or (b.min_x <= a.min_x and b.max_x >= a.max_x and b.min_z <= a.min_z and b.max_z >= a.max_z)
        )
        if not xz_overlap and not xz_cover:
            continue

        if _cached_contains(a, b):
            key = (b.region.id, a.region.id, "contains")
            if key not in seen:
                seen.add(key)
                edges.append(
                    SpatialEdge(source=b.region.id, target=a.region.id, relation="contains")
                )
            continue
        if _cached_contains(b, a):
            key = (a.region.id, b.region.id, "contains")
            if key not in seen:
                seen.add(key)
                edges.append(
                    SpatialEdge(source=a.region.id, target=b.region.id, relation="contains")
                )
            continue

        intersects, vol = _cached_intersect_volume(a, b)
        if intersects:
            x, y = sorted((a.region.id, b.region.id))
            key = (x, y, "intersects")
            if key not in seen:
                seen.add(key)
                edges.append(
                    SpatialEdge(
                        source=x,
                        target=y,
                        relation="intersects",
                        overlap_blocks=vol if vol is not None else 0,
                    )
                )

    return edges
