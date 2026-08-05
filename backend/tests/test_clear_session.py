"""Clear session API returns to empty startup state."""

from fastapi.testclient import TestClient

from backend.main import _session, app
from backend.models.region import Region


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def test_clear_session():
    _reset_session()
    _session["yaml_content"] = "regions: {}"
    _session["source_path"] = "regions.yml"
    _session["regions"] = [
        Region(id="root", type="global", parent=None, priority=0, flags={}),
    ]
    _session["scheme"] = {"regions": [{"id": "root"}], "spatialEdges": [], "hierarchyEdges": []}
    try:
        client = TestClient(app)
        res = client.post("/api/session/clear")
        assert res.status_code == 200
        assert res.json()["status"] == "ok"
        assert _session["yaml_content"] == ""
        assert _session["source_path"] == ""
        assert _session["regions"] == []
        assert _session["scheme"] is None
    finally:
        _reset_session()
