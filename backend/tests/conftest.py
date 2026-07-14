"""Shared paths for backend tests."""

from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent
WG_REGIONS_REFERENCE_YML = TESTS_DIR / "fixtures" / "wg_regions_reference.yml"

# Frozen counts for wg_regions_reference.yml (update when the fixture file changes).
WG_REGIONS_REFERENCE_COUNT = 487
WG_REGIONS_REFERENCE_TYPES = {
    "cuboid": 382,
    "poly2d": 34,
    "global": 71,
}
