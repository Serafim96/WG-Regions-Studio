"""Tests for scheme I/O round-trip."""

import json
import tempfile
from pathlib import Path

from backend.geometry.intersections import compute_spatial_edges
from backend.parser.wg_parser import parse_regions_yaml, validate_parent_links
from backend.scheme.io import build_scheme, load_scheme, save_scheme

REGIONS_YML = Path(__file__).resolve().parents[2] / "regions.yml"


def test_scheme_round_trip():
    if not REGIONS_YML.exists():
        return
    content = REGIONS_YML.read_text(encoding="utf-8")
    regions = parse_regions_yaml(content)
    validate_parent_links(regions)
    spatial = compute_spatial_edges(regions)
    scheme = build_scheme(regions, spatial, content, "regions.yml")

    with tempfile.NamedTemporaryFile(suffix=".mrv.json", delete=False) as f:
        path = Path(f.name)

    try:
        save_scheme(scheme, path)
        loaded = load_scheme(path)
        assert loaded["schemaVersion"] == 1
        assert len(loaded["regions"]) == len(scheme["regions"])
        assert loaded["sourceHash"] == scheme["sourceHash"]
    finally:
        path.unlink(missing_ok=True)
