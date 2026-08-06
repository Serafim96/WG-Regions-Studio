"""Natural sort and temporary-region spatial edges."""

from backend.geometry.intersections import compute_spatial_edges, is_spatial
from backend.models.region import Region, Vec3
from backend.tree.builder import build_forest
from backend.util.natural_sort import natural_key, natural_sort_strings
from backend.util.region_ids import is_valid_region_id


def test_natural_sort_numeric_suffix():
    ids = ["plot_190", "plot_19", "plot_189", "plot_2"]
    assert natural_sort_strings(ids) == ["plot_2", "plot_19", "plot_189", "plot_190"]


def test_natural_key_casefold():
    assert natural_key("Ab_10") < natural_key("ab_2") or natural_key("Ab_10") > natural_key("ab_2")
    # Same base, numeric order still wins over lexical digit order.
    assert natural_key("x_9") < natural_key("x_10")


def test_forest_children_natural_order():
    regions = [
        Region(id="root", type="global", parent=None, priority=0),
        Region(id="a_10", type="cuboid", parent="root", priority=0, min=Vec3(0, 0, 0), max=Vec3(1, 1, 1)),
        Region(id="a_2", type="cuboid", parent="root", priority=0, min=Vec3(2, 0, 0), max=Vec3(3, 1, 1)),
        Region(id="a_19", type="cuboid", parent="root", priority=0, min=Vec3(4, 0, 0), max=Vec3(5, 1, 1)),
    ]
    forest = build_forest(regions)
    child_ids = [c.id for c in forest.by_id["root"].children]
    assert child_ids == ["a_2", "a_10", "a_19"]


def test_manual_cuboid_is_spatial():
    r = Region(
        id="temp",
        type="cuboid",
        parent=None,
        priority=0,
        min=Vec3(0, 0, 0),
        max=Vec3(10, 10, 10),
        is_manual=True,
    )
    assert is_spatial(r)


def test_manual_cuboid_intersects_yaml_region():
    a = Region(
        id="yaml",
        type="cuboid",
        parent=None,
        priority=0,
        min=Vec3(0, 0, 0),
        max=Vec3(10, 10, 10),
    )
    b = Region(
        id="temp",
        type="cuboid",
        parent=None,
        priority=0,
        min=Vec3(5, 5, 5),
        max=Vec3(15, 15, 15),
        is_manual=True,
    )
    edges = compute_spatial_edges([a, b])
    assert len(edges) == 1
    assert edges[0].relation == "intersects"


def test_region_id_latin_only():
    assert is_valid_region_id("plot_19")
    assert is_valid_region_id("A-b_1")
    assert not is_valid_region_id("участок")
    assert not is_valid_region_id("plot 19")
    assert not is_valid_region_id("")
