"""Tests for exporting regions.yml."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import _session, app
from backend.models.region import Region, Vec2, Vec3
from backend.parser.wg_parser import parse_regions_yaml, validate_parent_links
from backend.tests.conftest import WG_REGIONS_REFERENCE_YML


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def _region_signature(r: Region) -> dict:
    return {
        "id": r.id,
        "type": r.type,
        "parent": r.parent,
        "priority": r.priority,
        "flags": r.flags,
        "owners": r.owners,
        "members": r.members,
        "min": r.min.to_dict() if r.min else None,
        "max": r.max.to_dict() if r.max else None,
        "min_y": r.min_y,
        "max_y": r.max_y,
        "points": [p.to_dict() for p in r.points] if r.points else None,
    }


def _regions_equivalent(a: list[Region], b: list[Region]) -> None:
    amap = {r.id: r for r in a}
    bmap = {r.id: r for r in b}
    assert set(amap.keys()) == set(bmap.keys())
    for rid in sorted(amap.keys()):
        assert _region_signature(amap[rid]) == _region_signature(bmap[rid])


def test_export_yaml_manual_is_global() -> None:
    _reset_session()
    try:
        _session["regions"] = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(
                id="temp_manual",
                type="manual",
                parent="root",
                priority=5,
                flags={"pvp": "deny"},
                owners={},
                members={},
                is_manual=True,
            ),
        ]

        client = TestClient(app)
        res = client.get("/api/regions/export/yml")
        assert res.status_code == 200

        parsed = parse_regions_yaml(res.text)
        validate_parent_links(parsed)
        temp = next(r for r in parsed if r.id == "temp_manual")
        assert temp.type == "global"
        assert temp.flags == {"pvp": "deny"}
    finally:
        _reset_session()


def test_export_yaml_skips_manual_when_requested() -> None:
    _reset_session()
    try:
        _session["regions"] = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(
                id="temp",
                type="cuboid",
                parent="root",
                priority=0,
                flags={},
                owners={},
                members={},
                is_manual=True,
                min=Vec3(0, 0, 0),
                max=Vec3(1, 1, 1),
            ),
            Region(
                id="yaml_child",
                type="cuboid",
                parent="temp",
                priority=0,
                flags={},
                owners={},
                members={},
                min=Vec3(0, 0, 0),
                max=Vec3(1, 1, 1),
            ),
        ]
        client = TestClient(app)
        res = client.get("/api/regions/export/yml?include_manual=false")
        assert res.status_code == 200
        parsed = parse_regions_yaml(res.text)
        ids = {r.id for r in parsed}
        assert ids == {"root", "yaml_child"}
        child = next(r for r in parsed if r.id == "yaml_child")
        assert child.parent == "root"
    finally:
        _reset_session()


def test_export_yaml_rejects_incomplete_manual_coords() -> None:
    _reset_session()
    try:
        _session["regions"] = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(
                id="draft",
                type="cuboid",
                parent="root",
                priority=0,
                flags={},
                owners={},
                members={},
                is_manual=True,
            ),
        ]
        client = TestClient(app)
        res = client.get("/api/regions/export/yml?include_manual=true")
        assert res.status_code == 400
        assert "draft" in res.text
    finally:
        _reset_session()


def test_update_manual_geometry() -> None:
    _reset_session()
    try:
        _session["regions"] = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(
                id="draft",
                type="manual",
                parent="root",
                priority=0,
                flags={},
                owners={},
                members={},
                is_manual=True,
            ),
        ]
        client = TestClient(app)
        res = client.patch(
            "/api/regions/draft/geometry",
            json={
                "type": "cuboid",
                "min": {"x": 1, "y": 2, "z": 3},
                "max": {"x": 4, "y": 5, "z": 6},
            },
        )
        assert res.status_code == 200
        body = res.json()
        assert body["type"] == "cuboid"
        assert body["min"] == {"x": 1, "y": 2, "z": 3}
        assert body["max"] == {"x": 4, "y": 5, "z": 6}
        assert body["is_manual"] is True
    finally:
        _reset_session()


def test_export_yaml_round_trip_fixture() -> None:
    if not WG_REGIONS_REFERENCE_YML.exists():
        return

    _reset_session()
    try:
        content = WG_REGIONS_REFERENCE_YML.read_text(encoding="utf-8")
        original = parse_regions_yaml(content)
        validate_parent_links(original)
        _session["regions"] = original

        client = TestClient(app)
        res = client.get("/api/regions/export/yml")
        assert res.status_code == 200

        exported_parsed = parse_regions_yaml(res.text)
        validate_parent_links(exported_parsed)
        _regions_equivalent(original, exported_parsed)
    finally:
        _reset_session()


def test_add_manual_region_rejects_self_parent() -> None:
    _reset_session()
    try:
        _session["regions"] = [Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={})]

        client = TestClient(app)
        res = client.post(
            "/api/regions/manual",
            json={
                "id": "a",
                "parent": "a",
                "type": "manual",
                "priority": 0,
                "flags": {},
                "owners": {},
                "members": {},
            },
        )
        assert res.status_code == 400
        assert len(_session["regions"]) == 1
    finally:
        _reset_session()


def test_add_manual_region_rejects_existing_cycle() -> None:
    _reset_session()
    try:
        # Existing cycles should prevent new mutations.
        _session["regions"] = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(id="a", type="cuboid", parent="b", priority=0, flags={}, owners={}, members={}),
            Region(id="b", type="cuboid", parent="a", priority=0, flags={}, owners={}, members={}),
        ]

        client = TestClient(app)
        res = client.post(
            "/api/regions/manual",
            json={
                "id": "c",
                "parent": "root",
                "type": "manual",
                "priority": 0,
                "flags": {},
                "owners": {},
                "members": {},
            },
        )
        assert res.status_code == 400
        assert {r.id for r in _session["regions"]} == {"root", "a", "b"}
    finally:
        _reset_session()

