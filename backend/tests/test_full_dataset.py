"""Integration tests on full regions.yml dataset."""

from __future__ import annotations

import time

import pytest

from backend.geometry.intersections import compute_spatial_edges, poly2d_volume, region_volume
from backend.parser.wg_parser import parse_regions_yaml, validate_parent_links
from backend.scheme.io import build_scheme
from backend.tests.conftest import (
    WG_REGIONS_REFERENCE_COUNT,
    WG_REGIONS_REFERENCE_TYPES,
    WG_REGIONS_REFERENCE_YML,
)


@pytest.fixture(scope="module")
def full_regions():
    if not WG_REGIONS_REFERENCE_YML.exists():
        pytest.skip("wg_regions_reference.yml fixture not found")
    content = WG_REGIONS_REFERENCE_YML.read_text(encoding="utf-8")
    regions = parse_regions_yaml(content)
    validate_parent_links(regions)
    return content, regions


def test_full_dataset_region_count(full_regions):
    _, regions = full_regions
    assert len(regions) == WG_REGIONS_REFERENCE_COUNT
    types = {}
    for r in regions:
        types[r.type] = types.get(r.type, 0) + 1
    assert types == WG_REGIONS_REFERENCE_TYPES


def test_full_dataset_build_performance(full_regions):
    content, regions = full_regions
    t0 = time.time()
    spatial = compute_spatial_edges(regions)
    scheme = build_scheme(regions, spatial, content)
    elapsed = time.time() - t0

    assert len(scheme["spatialEdges"]) > 0
    assert len(scheme["hierarchyEdges"]) == sum(1 for r in regions if r.parent)
    assert elapsed < 5.0, f"Build took {elapsed:.2f}s, expected < 5s"


def test_historical_center_main_poly2d_volume(full_regions):
    _, regions = full_regions
    by_id = {r.id: r for r in regions}
    region = by_id.get("historical_center_main")
    assert region is not None
    assert region.type == "poly2d"
    assert region.points is not None
    assert len(region.points) >= 50

    vol = poly2d_volume(region)
    assert vol is not None
    assert vol > 0
    assert region_volume(region) == vol
