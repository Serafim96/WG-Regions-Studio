"""Parent-chain helpers shared by export and manual-region cleanup."""

from __future__ import annotations

from collections.abc import Callable, Mapping

from backend.models.region import Region


def resolve_parent_skipping(
    parent_id: str | None,
    should_skip: Callable[[str], bool],
    by_id: Mapping[str, Region],
) -> str | None:
    """Walk up parents while ``should_skip(current)`` is true.

    Used when clearing temporary regions (skip manual ids) and when exporting
    YAML (skip ids not included in the export set).
    """
    current = parent_id
    while current and should_skip(current):
        ancestor = by_id.get(current)
        current = ancestor.parent if ancestor else None
    return current
