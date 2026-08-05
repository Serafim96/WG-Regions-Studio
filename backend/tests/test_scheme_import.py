"""Tests for scheme import via JSON body (browser file picker)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import _session, app
from backend.models.region import Region
from backend.scheme.io import SCHEMA_VERSION, build_scheme
from backend.geometry.intersections import compute_spatial_edges


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def test_scheme_import_round_trip() -> None:
    _reset_session()
    try:
        regions = [
            Region(id="root", type="global", parent=None, priority=0, flags={}, owners={}, members={}),
            Region(
                id="a",
                type="cuboid",
                parent="root",
                priority=0,
                flags={"pvp": "deny"},
                owners={},
                members={},
            ),
        ]
        scheme = build_scheme(regions, compute_spatial_edges(regions), "", "test.yml")
        assert scheme["schemaVersion"] == SCHEMA_VERSION

        client = TestClient(app)
        res = client.post("/api/scheme/import", json=scheme)
        assert res.status_code == 200
        body = res.json()
        assert body["schemaVersion"] == SCHEMA_VERSION
        assert {r["id"] for r in body["regions"]} == {"root", "a"}
        assert {r.id for r in _session["regions"]} == {"root", "a"}
        assert _session["scheme"] is not None
    finally:
        _reset_session()


def test_scheme_import_rejects_bad_version() -> None:
    _reset_session()
    try:
        client = TestClient(app)
        res = client.post(
            "/api/scheme/import",
            json={"schemaVersion": 999, "regions": []},
        )
        assert res.status_code == 400
    finally:
        _reset_session()
