"""Tests for app version / update check helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from backend.version import APP_VERSION, check_for_update, is_newer, normalize_version, parse_version


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


def test_check_for_update_outdated() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "tag_name": "v9.9.9",
        "html_url": "https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v9.9.9",
        "name": "v9.9.9",
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


def test_check_for_update_same_or_fail_soft() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "tag_name": f"v{APP_VERSION}",
        "html_url": f"https://github.com/example/releases/tag/v{APP_VERSION}",
        "name": f"v{APP_VERSION}",
    }
    mock_client = MagicMock()
    mock_client.__enter__.return_value = mock_client
    mock_client.__exit__.return_value = False
    mock_client.get.return_value = mock_resp

    with patch("backend.version.httpx.Client", return_value=mock_client):
        info = check_for_update()
    assert info["outdated"] is False

    with patch("backend.version.httpx.Client", side_effect=OSError("offline")):
        soft = check_for_update()
    assert soft["outdated"] is False
    assert soft["latest"] is None
