"""Tests for tree builder."""

from backend.models.region import Region
from backend.parser.wg_parser import parse_regions_yaml
from backend.tree.builder import build_forest


def test_forest_multiple_roots():
    yaml_text = """
regions:
    root_a:
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
    root_b:
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
    child:
        parent: root_a
        type: global
        priority: 0
        flags: {}
        owners: {}
        members: {}
"""
    regions = parse_regions_yaml(yaml_text)
    forest = build_forest(regions)
    assert len(forest.roots) == 2
    root_a = forest.by_id["root_a"]
    assert len(root_a.children) == 1
    assert root_a.children[0].id == "child"
    assert root_a.depth == 0
    assert root_a.children[0].depth == 1
