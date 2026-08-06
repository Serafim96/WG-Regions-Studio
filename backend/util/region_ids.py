"""Region id validation (WorldGuard-friendly Latin identifiers)."""

from __future__ import annotations

import re

# Letters, digits, underscore, hyphen — Latin only (no Cyrillic / spaces).
REGION_ID_RE = re.compile(r"^[A-Za-z0-9_-]+$")


def is_valid_region_id(region_id: str) -> bool:
    return bool(region_id) and REGION_ID_RE.fullmatch(region_id) is not None
