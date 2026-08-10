"""Parse bundled Keep a Changelog markdown for the in-app release history dialog."""

from __future__ import annotations

import re
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.version import _strip_markdown_inline

_VERSION_RE = re.compile(r"^## \[([^\]]+)\]\s*[—–-]\s*(.+)$")
_SECTION_RE = re.compile(r"^### (.+)$")
_BULLET_RE = re.compile(r"^\s*[-*•]\s+(.+)$")
_FOOTER_RE = re.compile(r"^\[[\d.]+\]:\s*")


def _app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parents[1]


def _changelog_paths() -> dict[str, Path]:
    root = _app_root()
    return {
        "en": root / "docs" / "EN" / "CHANGELOG.md",
        "ru": root / "docs" / "RU" / "ЖУРНАЛ_ИЗМЕНЕНИЙ.md",
    }


def _parse_version_date(rest: str) -> tuple[str, str | None]:
    """Split ``2026-08-10`` or ``2026-08 — subtitle`` from a version header tail."""
    rest = rest.strip()
    m = re.match(r"^(\d{4}(?:-\d{2}(?:-\d{2})?)?)(?:\s*[—–-]\s*(.+))?$", rest)
    if m:
        subtitle = m.group(2).strip() if m.group(2) else None
        return m.group(1), subtitle
    return rest, None


def parse_changelog_markdown(text: str) -> list[dict[str, Any]]:
    """Return releases newest-first: version, date, optional subtitle, sections[{title, items}]."""
    releases: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    current_section: dict[str, Any] | None = None

    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if _FOOTER_RE.match(stripped):
            break

        vm = _VERSION_RE.match(stripped)
        if vm:
            if current is not None:
                releases.append(current)
            date, subtitle = _parse_version_date(vm.group(2))
            current = {
                "version": vm.group(1).strip(),
                "date": date,
                "subtitle": subtitle,
                "sections": [],
            }
            current_section = None
            continue

        if current is None:
            continue

        sm = _SECTION_RE.match(stripped)
        if sm:
            current_section = {"title": sm.group(1).strip(), "items": []}
            current["sections"].append(current_section)
            continue

        bm = _BULLET_RE.match(stripped)
        if bm:
            cleaned = _strip_markdown_inline(bm.group(1))
            if not cleaned:
                continue
            if current_section is None:
                current_section = {"title": "", "items": []}
                current["sections"].append(current_section)
            current_section["items"].append(cleaned)
            continue

        if stripped.startswith("#"):
            continue

        cleaned = _strip_markdown_inline(stripped)
        if not cleaned:
            continue
        if current_section is None:
            current_section = {"title": "", "items": []}
            current["sections"].append(current_section)
        current_section["items"].append(cleaned)

    if current is not None:
        releases.append(current)

    # Drop empty sections (no items).
    for rel in releases:
        rel["sections"] = [s for s in rel["sections"] if s.get("items")]

    return releases


def load_changelog(locale: str) -> list[dict[str, Any]]:
    paths = _changelog_paths()
    path = paths.get(locale) or paths["en"]
    if not path.is_file():
        return []
    return parse_changelog_markdown(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def load_bilingual_changelog() -> dict[str, list[dict[str, Any]]]:
    return {"en": load_changelog("en"), "ru": load_changelog("ru")}
