"""Stress / diagnostic timing for compute_spatial_edges on a synthetic set.

Not a hard CI time gate — only checks that the call completes and returns edges.
Use backend.tools.benchmark for median/min reporting across phases.
"""

from __future__ import annotations

import time

from backend.geometry.intersections import compute_spatial_edges
from backend.tests.fixtures.synthetic import make_synthetic_regions

SYNTHETIC_COUNT = 1500


def test_synthetic_spatial_edges_completes():
    regions = make_synthetic_regions(SYNTHETIC_COUNT)
    t0 = time.perf_counter()
    edges = compute_spatial_edges(regions)
    elapsed = time.perf_counter() - t0

    assert len(regions) == SYNTHETIC_COUNT
    assert isinstance(edges, list)
    # Grid with spacing 16 and size 20 guarantees some overlaps.
    assert len(edges) > 0
    # Soft diagnostic only — printed for local runs / pytest -s.
    print(
        f"[synthetic-{SYNTHETIC_COUNT}] compute_spatial_edges: "
        f"{elapsed * 1000:.1f} ms, {len(edges)} edges"
    )
