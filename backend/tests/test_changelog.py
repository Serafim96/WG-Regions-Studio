"""Tests for Keep a Changelog markdown parsing."""

from __future__ import annotations

from backend.changelog import load_bilingual_changelog, parse_changelog_markdown


SAMPLE = """# Changelog

## [2.0.11] — 2026-08-10

### Changed

- First **item** with `code`
- Second item

## [2.0.10] — 2026-08-09

### Added

- Older release bullet

## [0.1.0] — 2026-08 — initial public tree

Baseline published on GitHub.

[2.0.8]: https://example.com
"""


def test_parse_changelog_markdown_order_and_dates() -> None:
    releases = parse_changelog_markdown(SAMPLE)
    assert [r["version"] for r in releases] == ["2.0.11", "2.0.10", "0.1.0"]
    assert releases[0]["date"] == "2026-08-10"
    assert releases[1]["date"] == "2026-08-09"
    assert releases[2]["date"] == "2026-08"
    assert releases[2]["subtitle"] == "initial public tree"
    assert releases[0]["sections"][0]["title"] == "Changed"
    assert releases[0]["sections"][0]["items"][0] == "First item with code"
    assert releases[2]["sections"][0]["items"] == ["Baseline published on GitHub."]


def test_load_bilingual_changelog_from_repo() -> None:
    data = load_bilingual_changelog()
    assert data["en"]
    assert data["ru"]
    assert data["en"][0]["version"] == data["ru"][0]["version"]
    assert data["en"][0]["date"]
    assert data["ru"][0]["date"]
