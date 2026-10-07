"""Tests for spatial intersection engine."""

from backend.geometry.intersections import (
    NoIntersectionError,
    compute_spatial_edges,
    cuboid_volume,
    intersection_bbox_center,
    poly2d_volume,
    region_contains,
    regions_intersect,
)
from backend.models.region import Region, Vec2, Vec3


def _cuboid(rid: str, x0, y0, z0, x1, y1, z1, parent=None) -> Region:
    return Region(
        id=rid,
        type="cuboid",
        parent=parent,
        priority=0,
        min=Vec3(x0, y0, z0),
        max=Vec3(x1, y1, z1),
    )


def test_cuboid_volume_1x1x1():
    r = _cuboid("a", 0, 0, 0, 0, 0, 0)
    assert cuboid_volume(r) == 1


def test_intersecting_cuboids():
    a = _cuboid("a", 0, 0, 0, 10, 10, 10)
    b = _cuboid("b", 5, 5, 5, 15, 15, 15)
    assert regions_intersect(a, b)


def test_non_intersecting_cuboids():
    a = _cuboid("a", 0, 0, 0, 5, 5, 5)
    b = _cuboid("b", 10, 10, 10, 15, 15, 15)
    assert not regions_intersect(a, b)


def test_touch_only_not_intersect():
    a = _cuboid("a", 0, 0, 0, 5, 5, 5)
    b = _cuboid("b", 6, 0, 0, 10, 5, 5)
    assert not regions_intersect(a, b)


def test_cuboid_contains():
    outer = _cuboid("outer", 0, 0, 0, 20, 20, 20)
    inner = _cuboid("inner", 5, 5, 5, 10, 10, 10)
    assert region_contains(outer, inner)
    assert not region_contains(inner, outer)


def test_global_no_spatial_edges():
    g = Region(id="g", type="global", parent=None, priority=0)
    c = _cuboid("c", 0, 0, 0, 5, 5, 5)
    edges = compute_spatial_edges([g, c])
    assert edges == []


def test_poly2d_volume():
    r = Region(
        id="p",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(0, 0), Vec2(10, 0), Vec2(10, 10), Vec2(0, 10)],
    )
    assert poly2d_volume(r) == 1000  # 10*10*10


def test_poly2d_intersection():
    a = Region(
        id="a",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=10,
        points=[Vec2(0, 0), Vec2(10, 0), Vec2(10, 10), Vec2(0, 10)],
    )
    b = Region(
        id="b",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=10,
        points=[Vec2(5, 5), Vec2(15, 5), Vec2(15, 15), Vec2(5, 15)],
    )
    assert regions_intersect(a, b)


def test_cuboid_intersection_volume():
    from backend.geometry.intersections import intersection_volume

    a = _cuboid("a", 0, 0, 0, 10, 10, 10)
    b = _cuboid("b", 5, 5, 5, 15, 15, 15)
    # Overlap box: 5..10 on each axis → 6³ = 216
    assert intersection_volume(a, b) == 216


def test_intersects_edge_includes_overlap_blocks():
    from backend.geometry.intersections import compute_spatial_edges

    a = _cuboid("a", 0, 0, 0, 10, 10, 10)
    b = _cuboid("b", 5, 5, 5, 15, 15, 15)
    edges = compute_spatial_edges([a, b])
    assert len(edges) == 1
    assert edges[0].relation == "intersects"
    assert edges[0].overlap_blocks == 216


def test_poly2d_intersection_volume():
    from backend.geometry.intersections import intersection_volume

    a = Region(
        id="a",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(0, 0), Vec2(10, 0), Vec2(10, 10), Vec2(0, 10)],
    )
    b = Region(
        id="b",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(5, 5), Vec2(15, 5), Vec2(15, 15), Vec2(5, 15)],
    )
    # XZ overlap 5×5 = 25, height 10 → 250
    assert intersection_volume(a, b) == 250


def test_intersection_bbox_center_cuboids():
    a = _cuboid("a", 0, 0, 0, 10, 10, 10)
    b = _cuboid("b", 5, 5, 5, 15, 15, 15)
    x, y, z = intersection_bbox_center(a, b)
    assert (x, y, z) == (8, 8, 8)


def test_intersection_bbox_center_poly2d():
    a = Region(
        id="a",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(0, 0), Vec2(10, 0), Vec2(10, 10), Vec2(0, 10)],
    )
    b = Region(
        id="b",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(5, 5), Vec2(15, 5), Vec2(15, 15), Vec2(5, 15)],
    )
    x, y, z = intersection_bbox_center(a, b)
    assert 4 <= x <= 8
    assert y == 4
    assert 4 <= z <= 8


def test_disjoint_intersect_components_poly2d():
    """Disconnected XZ overlap patches yield one intersect edge per component."""
    from shapely.geometry import LineString

    strip = Region(
        id="strip",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=[Vec2(0, 20), Vec2(80, 20), Vec2(80, 24), Vec2(0, 24)],
    )
    line = LineString([(10, 10), (10, 28), (30, 12), (50, 28), (70, 12), (70, 30)])
    wave = line.buffer(2, cap_style=2)
    wave_pts = [Vec2(float(x), float(z)) for x, z in wave.exterior.coords[:-1]]
    zigzag = Region(
        id="zigzag",
        type="poly2d",
        parent=None,
        priority=0,
        min_y=0,
        max_y=9,
        points=wave_pts,
    )
    edges = compute_spatial_edges([strip, zigzag])
    intersects = [e for e in edges if e.relation == "intersects"]
    assert len(intersects) >= 2
    assert {e.component_index for e in intersects} == set(range(len(intersects)))
    assert all((e.overlap_blocks or 0) > 0 for e in intersects)


def test_contains_suppresses_intersects_for_pair():
    outer = _cuboid("outer", 0, 0, 0, 20, 20, 20)
    inner = _cuboid("inner", 5, 5, 5, 10, 10, 10)
    edges = compute_spatial_edges([outer, inner])
    assert len(edges) == 1
    assert edges[0].relation == "contains"


def test_intersection_bbox_center_no_overlap():
    a = _cuboid("a", 0, 0, 0, 5, 5, 5)
    b = _cuboid("b", 10, 10, 10, 15, 15, 15)
    try:
        intersection_bbox_center(a, b)
        raised = False
    except NoIntersectionError:
        raised = True
    assert raised
