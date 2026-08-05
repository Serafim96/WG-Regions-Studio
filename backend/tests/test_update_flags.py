"""Tests for PATCH /api/regions/{id}/flags."""

from fastapi.testclient import TestClient

from backend.main import _session, app
from backend.models.region import Region


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def test_update_region_flags():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
        Region(id="a", type="cuboid", parent="root", priority=0, flags={"pvp": "deny"}),
    ]
    _session["scheme"] = {
        "regions": [
            {"id": "root", "flags": {}},
            {"id": "a", "flags": {"pvp": "deny"}},
        ],
    }
    client = TestClient(app)
    try:
        res = client.patch(
            "/api/regions/a/flags",
            json={"flags": {"pvp": "allow", "build": "deny"}},
        )
        assert res.status_code == 200
        assert res.json()["flags"] == {"pvp": "allow", "build": "deny"}
        assert _session["regions"][1].flags == {"pvp": "allow", "build": "deny"}
        assert _session["scheme"]["regions"][1]["flags"] == {
            "pvp": "allow",
            "build": "deny",
        }
    finally:
        _reset_session()


def test_update_region_flags_not_found():
    _reset_session()
    client = TestClient(app)
    try:
        res = client.patch("/api/regions/missing/flags", json={"flags": {}})
        assert res.status_code == 404
    finally:
        _reset_session()


def test_bulk_update_flags_list():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
        Region(id="a", type="cuboid", parent="root", priority=0, flags={"pvp": "deny"}),
        Region(id="b", type="cuboid", parent="root", priority=0, flags={"pvp": "deny"}),
    ]
    _session["scheme"] = {
        "regions": [
            {"id": "root", "flags": {}},
            {"id": "a", "flags": {"pvp": "deny"}},
            {"id": "b", "flags": {"pvp": "deny"}},
        ],
    }
    client = TestClient(app)
    try:
        res = client.post(
            "/api/regions/flags/bulk",
            json={
                "flag": "pvp",
                "action": "update",
                "value": "allow",
                "region_ids": ["a"],
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 1
        assert body["updated"] == ["a"]
        assert _session["regions"][1].flags["pvp"] == "allow"
        assert _session["regions"][2].flags["pvp"] == "deny"
    finally:
        _reset_session()


def test_bulk_delete_flags_all():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={"greeting": "hi"}),
        Region(id="a", type="cuboid", parent="root", priority=0, flags={"greeting": "hi", "pvp": "deny"}),
        Region(id="b", type="cuboid", parent="root", priority=0, flags={}),
    ]
    _session["scheme"] = {
        "regions": [
            {"id": "root", "flags": {"greeting": "hi"}},
            {"id": "a", "flags": {"greeting": "hi", "pvp": "deny"}},
            {"id": "b", "flags": {}},
        ],
    }
    client = TestClient(app)
    try:
        res = client.post(
            "/api/regions/flags/bulk",
            json={"flag": "greeting", "action": "delete", "region_ids": None},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 2
        assert "greeting" not in _session["regions"][0].flags
        assert "greeting" not in _session["regions"][1].flags
        assert _session["regions"][1].flags == {"pvp": "deny"}
        assert _session["scheme"]["regions"][0]["flags"] == {}
    finally:
        _reset_session()


def test_bulk_flags_bad_action():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
    ]
    client = TestClient(app)
    try:
        res = client.post(
            "/api/regions/flags/bulk",
            json={"flag": "pvp", "action": "noop"},
        )
        assert res.status_code == 400
    finally:
        _reset_session()


def test_update_region_parent():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
        Region(id="a", type="cuboid", parent="root", priority=0, flags={}),
        Region(id="b", type="cuboid", parent="root", priority=0, flags={}),
    ]
    client = TestClient(app)
    try:
        res = client.patch("/api/regions/a/parent", json={"parent": "b"})
        assert res.status_code == 200
        assert res.json()["parent"] == "b"
        assert _session["regions"][1].parent == "b"
    finally:
        _reset_session()


def test_update_region_parent_rejects_cycle():
    _reset_session()
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
        Region(id="a", type="cuboid", parent="root", priority=0, flags={}),
        Region(id="b", type="cuboid", parent="a", priority=0, flags={}),
    ]
    client = TestClient(app)
    try:
        res = client.patch("/api/regions/a/parent", json={"parent": "b"})
        assert res.status_code == 400
        assert _session["regions"][1].parent == "root"
    finally:
        _reset_session()
