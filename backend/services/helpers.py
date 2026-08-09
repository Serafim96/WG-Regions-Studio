"""HTTP-oriented helpers for region service (cycle messages, scheme version)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException

from backend.scheme.io import ensure_supported_schema_version

SELF_PARENT_CYCLE_DETAIL = (
    "Region parent cannot be the region itself (parent == id would create a cycle)"
)


def raise_if_self_parent(region_id: str, parent: str | None) -> None:
    """Reject parent == id (would create a trivial cycle)."""
    if parent == region_id:
        raise HTTPException(status_code=400, detail=SELF_PARENT_CYCLE_DETAIL)


def validate_scheme_version(scheme: Mapping[str, Any]) -> None:
    """Ensure scheme schemaVersion matches the supported SCHEMA_VERSION."""
    try:
        ensure_supported_schema_version(dict(scheme))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
