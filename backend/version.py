"""App version and GitHub release update check."""

from __future__ import annotations

from typing import Any

import httpx

# Bump when cutting a GitHub release (tag vX.Y.Z).
APP_VERSION = "2.0.8"
GITHUB_REPO = "Serafim96/WG-Regions-Studio"
RELEASES_LATEST_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
RELEASES_PAGE_URL = f"https://github.com/{GITHUB_REPO}/releases"


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
        latest = normalize_version(tag)
        result["latest"] = latest
        result["html_url"] = (
            html_url
            if isinstance(html_url, str) and html_url
            else f"https://github.com/{GITHUB_REPO}/releases/tag/{tag}"
        )
        result["name"] = name if isinstance(name, str) else tag
        result["outdated"] = is_newer(tag, APP_VERSION)
    except Exception:
        return result
    return result
