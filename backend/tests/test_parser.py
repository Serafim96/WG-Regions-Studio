"""Tests for WorldGuard YAML parser."""

from pathlib import Path

import pytest

from backend.parser.wg_parser import ParseError, parse_regions_yaml, validate_parent_links

FIXTURES = Path(__file__).parent / "fixtures"
REGIONS_YML = Path(__file__).resolve().parents[2] / "regions.yml"


def test_parse_cuboid():
    yaml_text = """
regions:
    test_cuboid:
        parent: root
        min: {x: 0, y: 0, z: 0}
        max: {x: 10, y: 10, z: 10}
        type: cuboid
        priority: 5
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    assert len(regions) == 1
    r = regions[0]
    assert r.id == "test_cuboid"
    assert r.type == "cuboid"
    assert r.priority == 5
    assert r.min.x == 0
    assert r.max.z == 10


def test_parse_poly2d():
    yaml_text = """
regions:
    test_poly:
        type: poly2d
        priority: 0
        min-y: 10
        max-y: 20
        points:
        - {x: 0, z: 0}
        - {x: 10, z: 0}
        - {x: 10, z: 10}
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    r = regions[0]
    assert r.type == "poly2d"
    assert r.min_y == 10
    assert len(r.points) == 3


def test_parse_global():
    yaml_text = """
regions:
    g:
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    assert regions[0].type == "global"


def test_unknown_parent():
    yaml_text = """
regions:
    child:
        parent: missing
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    with pytest.raises(ParseError, match="unknown parent"):
        validate_parent_links(regions)


def test_cycle_detection():
    yaml_text = """
regions:
    a:
        parent: b
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
    b:
        parent: a
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    with pytest.raises(ParseError, match="Cycle"):
        validate_parent_links(regions)


def test_parse_full_regions_yml():
    if not REGIONS_YML.exists():
        pytest.skip("regions.yml not found")
    content = REGIONS_YML.read_text(encoding="utf-8")
    regions = parse_regions_yaml(content)
    validate_parent_links(regions)
    assert len(regions) == 403
    types = {r.type for r in regions}
    assert types == {"cuboid", "poly2d", "global"}
