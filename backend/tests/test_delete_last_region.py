"""Deleting the last region returns remaining=0 and clears the scheme."""

from fastapi.testclient import TestClient

from backend.main import _session, app
from backend.models.region import Region


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def test_delete_last_manual_region_empties_session():
    _reset_session()
    _session["regions"] = [
        Region(
            id="temp",
            type="global",
            parent=None,
            priority=0,
            flags={},
            is_manual=True,
        ),
    ]
    _session["scheme"] = {
        "regions": [{"id": "temp", "is_manual": True}],
        "spatialEdges": [],
        "hierarchyEdges": [],
    }
    try:
        client = TestClient(app)
        res = client.post(
            "/api/regions/manual/delete",
            json={"id": "temp", "children_mode": "detach"},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["deleted"] == "temp"
        assert body["remaining"] == 0
        assert _session["regions"] == []
        assert _session["scheme"] is None
    finally:
        _reset_session()


def test_clear_manuals_only_session_empties_scheme():
    _reset_session()
    _session["regions"] = [
        Region(
            id="a",
            type="global",
            parent=None,
            priority=0,
            flags={},
            is_manual=True,
        ),
        Region(
            id="b",
            type="global",
            parent="a",
            priority=0,
            flags={},
            is_manual=True,
        ),
    ]
    _session["scheme"] = {"regions": [{"id": "a"}, {"id": "b"}], "spatialEdges": [], "hierarchyEdges": []}
    try:
        client = TestClient(app)
        res = client.post("/api/regions/manual/clear")
        assert res.status_code == 200
        body = res.json()
        assert body["remaining"] == 0
        assert body["removed"] == 2
        assert _session["regions"] == []
        assert _session["scheme"] is None
    finally:
        _reset_session()
