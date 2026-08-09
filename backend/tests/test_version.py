"""Tests for app version / update check helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from backend.version import (
    APP_VERSION,
    CURRENT_HIGHLIGHTS,
    check_for_update,
    highlights_from_release_body,
    is_newer,
    normalize_version,
    parse_version,
)


def test_normalize_and_parse() -> None:
    assert normalize_version("v2.0.1") == "2.0.1"
    assert normalize_version("2.0.1-beta") == "2.0.1"
    assert parse_version("v2.0.1") == (2, 0, 1)


def test_is_newer() -> None:
    assert is_newer("2.0.2", "2.0.1")
    assert is_newer("v3.0.0", "2.9.9")
    assert not is_newer("2.0.1", "2.0.1")
    assert not is_newer("2.0.0", "2.0.1")
    assert is_newer("2.1", "2.0.9")


def test_highlights_from_release_body() -> None:
    body = """## Changed

- Windows: **classic** `conhost` relaunch
- Browser tab uses the [app favicon](https://example.com/icon.png)

### Fixed

- Double-clicking the exe no longer opens in Windows Terminal
"""
    notes = highlights_from_release_body(body, limit=3)
    assert notes == [
        "Windows: classic conhost relaunch",
        "Browser tab uses the app favicon",
        "Double-clicking the exe no longer opens in Windows Terminal",
    ]
    assert highlights_from_release_body(None) == []
    assert highlights_from_release_body("") == []


def test_current_highlights_bilingual() -> None:
    assert CURRENT_HIGHLIGHTS["ru"]
    assert CURRENT_HIGHLIGHTS["en"]
    assert len(CURRENT_HIGHLIGHTS["ru"]) == len(CURRENT_HIGHLIGHTS["en"])


def test_check_for_update_outdated() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "tag_name": "v9.9.9",
        "html_url": "https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v9.9.9",
        "name": "v9.9.9",
        "body": "- New feature A\n- Bug fix B",
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.get.return_value = mock_resp

    with patch("backend.version.httpx.Client", return_value=mock_client):
        info = check_for_update()

    assert info["current"] == APP_VERSION
    assert info["latest"] == "9.9.9"
    assert info["outdated"] is True
    assert "v9.9.9" in info["html_url"]
    assert info["highlights"] == ["New feature A", "Bug fix B"]


def test_check_for_update_same_or_fail_soft() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "tag_name": f"v{APP_VERSION}",
        "html_url": f"https://github.com/example/releases/tag/v{APP_VERSION}",
        "name": f"v{APP_VERSION}",
        "body": "- Should not appear when up to date",
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.get.return_value = mock_resp

    with patch("backend.version.httpx.Client", return_value=mock_client):
        info = check_for_update()
    assert info["outdated"] is False
    assert info["highlights"] == []

    with patch("backend.version.httpx.Client", side_effect=OSError("offline")):
        soft = check_for_update()
    assert soft["outdated"] is False
    assert soft["latest"] is None
    assert soft["highlights"] == []
