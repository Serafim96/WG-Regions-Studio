"""App version and GitHub release update check."""

from __future__ import annotations

import re
from typing import Any

import httpx

# Bump when cutting a GitHub release (tag vX.Y.Z).
# Full checklist: docs/dev/RELEASE.md
APP_VERSION = "2.0.14"
GITHUB_REPO = "Serafim96/WG-Regions-Studio"
RELEASES_LATEST_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
RELEASES_PAGE_URL = f"https://github.com/{GITHUB_REPO}/releases"

# Short bilingual bullets for the update toast / bell (current build only).
# The first-launch dialog reads the full release history from docs/*/CHANGELOG*.md.
CURRENT_HIGHLIGHTS: dict[str, list[str]] = {
    "ru": [
        "Временный регион можно добавить сразу после запуска — без открытия файла (+ или ПКМ на схеме)",
        "Сброс / удаление последнего временного региона возвращает к пустому старту",
        "Исправлен чрезмерный zoom при одном узле на схеме",
    ],
    "en": [
        "Add a temporary region right after launch — no file needed (+ or right-click on the scheme)",
        "Reset / deleting the last temporary region returns to the empty start state",
        "Fixed over-zoom when only one node is on the scheme",
    ],
}

_BULLET_RE = re.compile(r"^\s*[-*•]\s+(.+)$")
_MD_LINK_RE = re.compile(r"\[([^\]]+)\]\([^)]+\)")
_MD_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*|__([^_]+)__")
_MD_CODE_RE = re.compile(r"`([^`]+)`")


def normalize_version(tag: str) -> str:
    """Strip leading ``v`` and trailing build metadata / prerelease suffix for compare."""
    s = tag.strip()
    if s.lower().startswith("v"):
        s = s[1:]
    for sep in ("+", "-"):
        if sep in s:
            s = s.split(sep, 1)[0]
    return s


def parse_version(tag: str) -> tuple[int, ...]:
    parts = normalize_version(tag).split(".")
    out: list[int] = []
    for part in parts:
        digits = "".join(ch for ch in part if ch.isdigit())
        out.append(int(digits) if digits else 0)
    return tuple(out) if out else (0,)


def is_newer(remote: str, local: str) -> bool:
    """True if ``remote`` is a higher semver than ``local``."""
    a = parse_version(remote)
    b = parse_version(local)
    n = max(len(a), len(b))
    a_pad = a + (0,) * (n - len(a))
    b_pad = b + (0,) * (n - len(b))
    return a_pad > b_pad


def _strip_markdown_inline(text: str) -> str:
    s = _MD_LINK_RE.sub(r"\1", text)
    s = _MD_BOLD_RE.sub(lambda m: m.group(1) or m.group(2) or "", s)
    s = _MD_CODE_RE.sub(r"\1", s)
    return " ".join(s.split()).strip()


def highlights_from_release_body(body: str | None, *, limit: int = 4) -> list[str]:
    """Extract short plain-text bullets from a GitHub release markdown body."""
    if not body or not body.strip():
        return []
    out: list[str] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        m = _BULLET_RE.match(line)
        if not m:
            continue
        cleaned = _strip_markdown_inline(m.group(1))
        if not cleaned:
            continue
        if len(cleaned) > 160:
            cleaned = cleaned[:157].rstrip() + "…"
        out.append(cleaned)
        if len(out) >= limit:
            break
    return out


def check_for_update(timeout: float = 4.0) -> dict[str, Any]:
    """
    Compare ``APP_VERSION`` to the latest GitHub release tag.

    On network / API failure returns ``outdated=False`` and keeps ``latest`` null
    so the UI stays quiet when offline.
    """
    result: dict[str, Any] = {
        "current": APP_VERSION,
        "latest": None,
        "outdated": False,
        "html_url": RELEASES_PAGE_URL,
        "name": None,
        "highlights": [],
    }
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(
                RELEASES_LATEST_URL,
                headers={
                    "Accept": "application/vnd.github+json",
                    "User-Agent": f"WG-Regions-Studio/{APP_VERSION}",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            )
        if resp.status_code != 200:
            return result
        data = resp.json()
        tag = data.get("tag_name")
        if not isinstance(tag, str) or not tag.strip():
            return result
        html_url = data.get("html_url")
        name = data.get("name")
        body = data.get("body")
        latest = normalize_version(tag)
        result["latest"] = latest
        result["html_url"] = (
            html_url
            if isinstance(html_url, str) and html_url
            else f"https://github.com/{GITHUB_REPO}/releases/tag/{tag}"
        )
        result["name"] = name if isinstance(name, str) else tag
        result["outdated"] = is_newer(tag, APP_VERSION)
        if result["outdated"]:
            result["highlights"] = highlights_from_release_body(
                body if isinstance(body, str) else None
            )
    except Exception:
        return result
    return result
