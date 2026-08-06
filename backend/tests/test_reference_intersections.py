"""Validate spatial intersections against draw.io reference."""

import json
from pathlib import Path

import pytest

from backend.geometry.intersections import compute_spatial_edges, region_contains, regions_intersect
from backend.parser.wg_parser import parse_regions_yaml, validate_parent_links
from backend.tests.conftest import WG_REGIONS_REFERENCE_YML

APP_ROOT = Path(__file__).resolve().parents[2]
REFERENCE_JSON = APP_ROOT / "data" / "reference_spatial_edges.json"


@pytest.fixture(scope="module")
def regions_and_edges():
    if not WG_REGIONS_REFERENCE_YML.exists():
        pytest.skip("wg_regions_reference.yml fixture not found")
    content = WG_REGIONS_REFERENCE_YML.read_text(encoding="utf-8")
    regions = parse_regions_yaml(content)
    validate_parent_links(regions)
    by_id = {r.id: r for r in regions}
    edges = compute_spatial_edges(regions)
    return by_id, edges


@pytest.fixture(scope="module")
def reference():
    if not REFERENCE_JSON.exists():
        pytest.skip("reference_spatial_edges.json not found — run extract_drawio_reference.py")
    return json.loads(REFERENCE_JSON.read_text(encoding="utf-8"))


def test_reference_intersects(regions_and_edges, reference):
    """Only confirmed intersect pairs (validated at extraction time) must match algorithm."""
    by_id, computed = regions_and_edges
    computed_intersects = {
        tuple(sorted((e.source, e.target)))
        for e in computed
        if e.relation == "intersects"
    }

    for pair in reference.get("intersects", []):
        a, b = pair
        assert a in by_id, f"Region '{a}' not in wg_regions_reference.yml"
        assert b in by_id, f"Region '{b}' not in wg_regions_reference.yml"
        ra, rb = by_id[a], by_id[b]
        assert regions_intersect(ra, rb), f"Expected intersect: {a} <-> {b}"
        assert tuple(sorted((a, b))) in computed_intersects


def test_reference_contains(regions_and_edges, reference):
    by_id, computed = regions_and_edges
    computed_contains = {
        (e.source, e.target) for e in computed if e.relation == "contains"
    }

    for inner, outer in reference.get("contains", []):
        assert inner in by_id
        assert outer in by_id
        assert region_contains(by_id[outer], by_id[inner]), f"Expected {inner} in {outer}"
        assert (inner, outer) in computed_contains
