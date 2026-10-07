"""Tests for WorldGuard-style spatial flag coverage."""

from __future__ import annotations

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.geometry.flag_coverage import (
    CoverageRow,
    _decompose_applicable_volumes,
    _node_label,
    compute_flag_scheme_coverage,
    compute_region_flag_coverage,
)
from backend.geometry.intersections import (
    NoIntersectionError,
    compute_spatial_edges,
    intersection_bbox_center,
)
from backend.main import _session, app
from backend.models.region import Region, Vec2, Vec3
from backend.services.region_service import RegionService
from backend.services.session_service import session_store


def _cuboid(
    rid: str,
    x0: int,
    y0: int,
    z0: int,
    x1: int,
    y1: int,
    z1: int,
    priority: int,
    flags: dict | None = None,
    parent: str | None = None,
) -> Region:
    return Region(
        id=rid,
        type="cuboid",
        parent=parent,
        priority=priority,
        flags=flags or {},
        min=Vec3(x=x0, y=y0, z=z0),
        max=Vec3(x=x1, y=y1, z=z1),
    )


def _pvp_rows_for_b(regions: list[Region], parent: str | None) -> list[dict]:
    b = _cuboid("b", 2, 0, 2, 4, 10, 4, 5, parent=parent)
    p = _cuboid("p", 0, 0, 0, 10, 10, 10, 0, flags={"pvp": "allow"})
    z = _cuboid("z", 1, 0, 1, 5, 10, 5, 3, flags={"pvp": "deny"})
    all_regions = [p, z, b]
    edges = compute_spatial_edges(all_regions)
    edge_dicts = [
        {
            "source": e.source,
            "target": e.target,
            "relation": e.relation,
            "overlapBlocks": e.overlap_blocks,
        }
        for e in edges
    ]
    rows = compute_region_flag_coverage("b", all_regions, edge_dicts, {"pvp": "state"})
    return [r for r in rows if r["flag"] == "pvp"]


def test_nested_without_parent_uses_intermediate_priority():
    rows = _pvp_rows_for_b([], parent=None)
    assert rows
    top = max(rows, key=lambda r: r["percent"])
    assert top["value"] == "deny"
    assert abs(sum(r["percent"] for r in rows) - 100.0) < 0.1
    assert top["blocks"] > 0


def test_nested_with_parent_inherits_at_child_priority():
    rows = _pvp_rows_for_b([], parent="p")
    assert rows
    top = max(rows, key=lambda r: r["percent"])
    assert top["value"] == "allow"
    assert top["definedIn"] == "p"


def test_passthrough_not_spatial_on_scheme():
    a = _cuboid("a", 0, 0, 0, 20, 10, 20, -1, flags={"passthrough": "allow"})
    b = _cuboid("b", 2, 0, 2, 4, 10, 4, 0)
    regions = [a, b]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    cov = compute_flag_scheme_coverage("passthrough", regions, edge_dicts, {"passthrough": "state"})
    assert "b" not in cov["regions"] or cov["regions"]["b"]["label"] == ""


def test_child_inherits_pvp_through_global_parent():
    ded = _cuboid("ded", 100, 0, 100, 110, 10, 110, 10, flags={"pvp": "allow"})
    root = Region(id="root", type="global", parent="ded", priority=0, flags={})
    child = _cuboid("child", 5, 0, 5, 8, 10, 8, 5, parent="root")
    regions = [ded, root, child]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    rows = compute_region_flag_coverage("child", regions, edge_dicts, {"pvp": "state"})
    pvp = [r for r in rows if r["flag"] == "pvp"]
    assert pvp
    top = max(pvp, key=lambda r: r["percent"])
    assert top["value"] == "allow"
    assert top["viaRegion"] == "root"
    assert top["definedIn"] == "ded"
    assert top["inheritType"] == "inheritance"
    assert top["kind"] == "parent"
    json.dumps(rows)


def test_set_flag_value_serializes_in_coverage_json():
    parent = _cuboid("p", 0, 0, 0, 10, 10, 10, 0, flags={"blocked-cmds": {"a", "b"}})
    child = _cuboid("c", 2, 0, 2, 4, 10, 4, 5, parent="p")
    regions = [parent, child]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    rows = compute_region_flag_coverage(
        "c",
        regions,
        edge_dicts,
        {"blocked-cmds": "set"},
    )
    cmd_rows = [r for r in rows if r["flag"] == "blocked-cmds"]
    assert cmd_rows
    payload = json.dumps(cmd_rows)
    parsed = json.loads(payload)
    assert isinstance(parsed[0]["value"], list)


def _square_poly2d(rid: str, x0: int, z0: int, x1: int, z1: int, priority: int, **kwargs) -> Region:
    return Region(
        id=rid,
        type="poly2d",
        parent=kwargs.get("parent"),
        priority=priority,
        flags=kwargs.get("flags") or {},
        min_y=0,
        max_y=10,
        points=[
            Vec2(x=x0, z=z0),
            Vec2(x=x1, z=z0),
            Vec2(x=x1, z=z1),
            Vec2(x=x0, z=z1),
        ],
    )


def test_poly2d_intersect_edge_has_scheme_label():
    a = _square_poly2d("a", 0, 0, 10, 10, 0, flags={"pvp": "allow"})
    b = _square_poly2d("b", 5, 5, 15, 15, 0, flags={"pvp": "deny"})
    regions = [a, b]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    cov = compute_flag_scheme_coverage("pvp", regions, edge_dicts, {"pvp": "state"})
    assert cov["intersects"]
    labels = {e["label"] for e in cov["intersects"]}
    assert "undefined" not in labels
    assert labels


def test_invalid_neighbor_polygon_does_not_break_subject_coverage():
    subject = _cuboid("sub", 0, 0, 0, 5, 10, 5, 5, flags={"pvp": "allow"})
    bowtie = Region(
        id="bad",
        type="poly2d",
        parent=None,
        priority=0,
        flags={"pvp": "deny"},
        min_y=0,
        max_y=10,
        points=[
            Vec2(x=20, z=0),
            Vec2(x=30, z=10),
            Vec2(x=30, z=0),
            Vec2(x=20, z=10),
        ],
    )
    regions = [subject, bowtie]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    rows = compute_region_flag_coverage("sub", regions, edge_dicts, {"pvp": "state"})
    assert any(r["flag"] == "pvp" for r in rows)


def _reset_session() -> None:
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None


def _spatial_edge_dicts(regions: list[Region]) -> list[dict]:
    edges = compute_spatial_edges(regions)
    return [
        {
            "source": e.source,
            "target": e.target,
            "relation": e.relation,
            **(
                {"overlapBlocks": e.overlap_blocks if e.overlap_blocks is not None else 0}
                if e.relation == "intersects"
                else {}
            ),
        }
        for e in edges
    ]


def test_passthrough_is_inherited_from_parent():
    parent = _cuboid(
        "build_allowed", 0, 0, 0, 40, 20, 40, 0, flags={"passthrough": "allow", "interact": "deny"},
    )
    child = _cuboid("deepest_warm_ocean_lab", 2, 0, 2, 8, 10, 8, -1, parent="build_allowed")
    regions = [parent, child]
    edge_dicts = _spatial_edge_dicts(regions)
    rows = compute_region_flag_coverage("deepest_warm_ocean_lab", regions, edge_dicts, {
        "passthrough": "state",
        "interact": "state",
    })
    passthrough = [r for r in rows if r["flag"] == "passthrough"]
    assert len(passthrough) == 1
    pt = passthrough[0]
    assert pt["value"] == "allow"
    assert pt["definedIn"] == "build_allowed"
    assert pt["viaRegion"] == "build_allowed"
    assert pt["kind"] == "parent"
    assert pt["inheritType"] == "inheritance"
    assert pt["percent"] == 100
    interact = [r for r in rows if r["flag"] == "interact"]
    assert interact
    assert interact[0]["viaRegion"] == "build_allowed"
    assert interact[0]["definedIn"] == "build_allowed"
    assert interact[0]["value"] == "deny"


def _global(rid: str, priority: int = 0, flags: dict | None = None, parent: str | None = None) -> Region:
    return Region(
        id=rid,
        type="global",
        parent=parent,
        priority=priority,
        flags=flags or {},
    )


def _lorien_moria_regions() -> list[Region]:
    root = _global("root", flags={"block-trampling": "deny"})
    lorien = _global("lorien", parent="root")
    build_allowed = _global(
        "build_allowed",
        priority=-1,
        flags={"enderpearl": "allow"},
    )
    moria_main = _cuboid(
        "moria_main", 0, 0, 0, 100, 50, 100, -1, parent="build_allowed",
    )
    lorien_main = _cuboid(
        "lorien_main", 95, 0, 0, 200, 50, 100, 0, parent="lorien",
    )
    return [root, lorien, build_allowed, moria_main, lorien_main]


def test_unrelated_global_group_does_not_apply_to_all_points():
    root = _global("root", flags={"block-trampling": "deny"})
    grp = _global("grp", parent="root")
    other_root = _global("other_root", flags={"enderpearl": "allow"})
    subject = _cuboid("subject", 0, 0, 0, 10, 10, 10, 0)
    regions = [root, grp, other_root, subject]
    edge_dicts = _spatial_edge_dicts(regions)
    flag_types = {"block-trampling": "state", "enderpearl": "state"}
    rows = compute_region_flag_coverage("subject", regions, edge_dicts, flag_types)
    assert not any(r["flag"] == "enderpearl" for r in rows)
    assert not any(r.get("kind") == "none" for r in rows)
    assert not any(r.get("viaRegion") == "other_root" for r in rows)
    assert not any(r.get("viaRegion") == "grp" for r in rows)


def test_lorien_moria_regression():
    regions = _lorien_moria_regions()
    edge_dicts = _spatial_edge_dicts(regions)
    flag_types = {"enderpearl": "state", "block-trampling": "state"}

    lorien_rows = [
        r for r in compute_region_flag_coverage("lorien_main", regions, edge_dicts, flag_types)
        if r["flag"] == "enderpearl"
    ]
    assert not any(r.get("viaRegion") == "build_allowed" for r in lorien_rows)
    inter = [r for r in lorien_rows if r.get("inheritType") == "intersection"]
    assert len(inter) == 1
    assert inter[0]["viaRegion"] == "moria_main"
    assert inter[0]["definedIn"] == "build_allowed"
    assert inter[0]["percent"] < 10
    assert len(lorien_rows) == 1

    moria_bt = [
        r for r in compute_region_flag_coverage("moria_main", regions, edge_dicts, flag_types)
        if r["flag"] == "block-trampling"
    ]
    assert not any(r.get("viaRegion") == "build_allowed" for r in moria_bt)
    assert not any(r.get("viaRegion") in ("root", "lorien") for r in moria_bt)
    moria_all = compute_region_flag_coverage("moria_main", regions, edge_dicts, flag_types)
    assert not any(r.get("viaRegion") in ("bamboo_fabric", "grp", "lorien", "root") for r in moria_all)
    assert not any(r.get("kind") == "none" for r in moria_all)


def test_none_rows_are_not_emitted():
    regions = _lorien_moria_regions()
    edge_dicts = _spatial_edge_dicts(regions)
    flag_types = {"enderpearl": "state", "block-trampling": "state", "pvp": "state"}
    for region in regions:
        rows = compute_region_flag_coverage(region.id, regions, edge_dicts, flag_types)
        assert not any(r.get("kind") == "none" for r in rows)


def test_world_global_still_applies():
    world = _global("__global__", flags={"pvp": "deny"})
    subject = _cuboid("subject", 0, 0, 0, 10, 10, 10, 0)
    regions = [world, subject]
    edge_dicts = _spatial_edge_dicts(regions)
    rows = compute_region_flag_coverage("subject", regions, edge_dicts, {"pvp": "state"})
    pvp = [r for r in rows if r["flag"] == "pvp"]
    assert len(pvp) == 1
    assert pvp[0]["value"] == "deny"
    assert pvp[0]["viaRegion"] == "__global__"
    assert pvp[0]["percent"] == 100


def test_spatial_rows_have_real_geometric_link():
    regions = _lorien_moria_regions()
    by_id = {r.id: r for r in regions}
    edge_dicts = _spatial_edge_dicts(regions)
    flag_types = {"enderpearl": "state", "block-trampling": "state"}
    for region in regions:
        rows = compute_region_flag_coverage(region.id, regions, edge_dicts, flag_types)
        for row in rows:
            inherit = row.get("inheritType")
            if inherit not in ("containment", "intersection"):
                continue
            via = row.get("viaRegion")
            assert via
            subject = by_id[region.id]
            carrier = by_id.get(via)
            assert carrier is not None
            try:
                intersection_bbox_center(subject, carrier)
            except NoIntersectionError:
                current = via
                ok = False
                while current:
                    if current == region.id:
                        ok = True
                        break
                    parent = by_id.get(current)
                    if not parent or not parent.parent:
                        break
                    current = parent.parent
                assert ok, f"{region.id} {row['flag']} via {via}"


def test_node_label_multiple_groups_uses_effective_value():
    parent = _cuboid("p", 0, 0, 0, 20, 10, 20, 0, flags={"pvp": "allow"})
    child = _cuboid("c", 2, 0, 2, 18, 10, 18, 0, parent="p")
    deny = _cuboid("d", 10, 0, 10, 25, 10, 25, 5, flags={"pvp": "deny"})
    regions = [parent, child, deny]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    cov = compute_flag_scheme_coverage("pvp", regions, edge_dicts, {"pvp": "state"})
    child_label = cov["regions"].get("c", {}).get("label", "")
    assert child_label
    assert "partial" not in child_label
    assert "allow" in child_label


def test_flag_conflict_demo_fixture_parses():
    path = Path(__file__).resolve().parent / "fixtures" / "flag_conflict_demo.yml"
    assert path.is_file()
    from backend.parser.wg_parser import parse_regions_yaml, validate_parent_links

    regions = parse_regions_yaml(path.read_text(encoding="utf-8"))
    validate_parent_links(regions)
    ids = {r.id for r in regions}
    assert "fc_parent_allow" in ids
    assert "fc_chain_rival" in ids


def test_intersect_coverage_includes_endpoint_percents():
    a = _cuboid("a", 0, 0, 0, 10, 10, 10, 0, flags={"pvp": "allow"})
    b = _cuboid("b", 5, 0, 5, 15, 10, 15, 1, flags={"pvp": "deny"})
    regions = [a, b]
    edges = compute_spatial_edges(regions)
    edge_dicts = [
        {"source": e.source, "target": e.target, "relation": e.relation}
        for e in edges
    ]
    cov = compute_flag_scheme_coverage("pvp", regions, edge_dicts, {"pvp": "state"})
    inter = next((i for i in cov["intersects"] if {i["aId"], i["bId"]} == {"a", "b"}), None)
    assert inter is not None
    assert inter.get("aPercent", 0) > 0
    assert inter.get("bPercent", 0) > 0


def test_node_label_small_percent():
    rows = [
        CoverageRow(
            flag="pvp",
            value="allow",
            percent=0.09,
            via_region="a",
            defined_in="a",
            kind="spatial",
            inherit_type="intersection",
            blocks=1,
        ),
    ]
    label = _node_label(rows, "pvp", "b", {})
    assert label.startswith("<1%")


def test_passthrough_scheme_label_for_child():
    parent = _cuboid(
        "parent", 0, 0, 0, 10, 10, 10, 0, flags={"passthrough": "allow"},
    )
    child = _cuboid("child", 1, 0, 1, 4, 10, 4, 0, parent="parent")
    inner = _cuboid("inner", 2, 0, 2, 3, 10, 3, 0)
    regions = [parent, child, inner]
    edge_dicts = _spatial_edge_dicts(regions)
    cov = compute_flag_scheme_coverage("passthrough", regions, edge_dicts, {"passthrough": "state"})
    assert cov["regions"]["child"]["label"] == "allow"
    assert "inner" not in cov["regions"]


SCHEME = Path(__file__).resolve().parents[3] / "scheme.mrv.json"


@pytest.mark.skipif(not SCHEME.exists(), reason="scheme.mrv.json not in workspace root")
def test_user_scheme_regression():
    from backend.scheme.io import load_scheme, regions_from_scheme

    scheme = load_scheme(SCHEME)
    regions = regions_from_scheme(scheme)
    edges = scheme.get("spatialEdges") or []
    flag_types = {"enderpearl": "state", "block-trampling": "state"}

    lorien_ep = [
        r for r in compute_region_flag_coverage("lorien_main", regions, edges, flag_types)
        if r["flag"] == "enderpearl"
    ]
    assert len(lorien_ep) == 1
    assert lorien_ep[0].get("inheritType") == "intersection"
    assert lorien_ep[0]["viaRegion"] == "moria_main"
    assert abs(lorien_ep[0]["percent"] - 0.0875) < 0.02

    moria_bt = compute_region_flag_coverage("moria_main", regions, edges, flag_types)
    assert not any(r["flag"] == "block-trampling" and r.get("viaRegion") == "bamboo_fabric" for r in moria_bt)
    assert not any(r.get("kind") == "none" for r in moria_bt)


def test_coverage_job_reports_percent_until_done():
    import time

    parent = _cuboid("build_allowed", 0, 0, 0, 10, 10, 10, 0, flags={"interact": "allow"})
    child = _cuboid("lab", 1, 0, 1, 4, 10, 4, 0, parent="build_allowed")
    _reset_session()
    _session["regions"] = [parent, child]
    _session["scheme"] = {"regions": [], "spatialEdges": _spatial_edge_dicts([parent, child])}
    client = TestClient(app)
    try:
        started = client.post("/api/regions/lab/flag-coverage/jobs")
        assert started.status_code == 200
        job_id = started.json()["jobId"]
        body = None
        for _ in range(50):
            res = client.get(f"/api/flag-coverage/jobs/{job_id}")
            assert res.status_code == 200
            body = res.json()
            assert 0 <= body["percent"] <= 100
            if body["done"]:
                break
            time.sleep(0.05)
        assert body is not None and body["done"]
        assert body["error"] is None
        assert body["percent"] == 100
        interact = [r for r in body["rows"] if r["flag"] == "interact"]
        assert interact
        assert interact[0]["viaRegion"] == "build_allowed"
        assert not any(r["flag"] == "passthrough" for r in body["rows"])
    finally:
        _reset_session()


def test_region_service_flag_types_reads_catalog():
    svc = RegionService(session_store)
    types = svc._flag_types()
    assert types
    assert types.get("pvp") == "state"


def test_warm_ocean_lab_main_parent_root_columns():
    root = Region(
        id="root",
        type="global",
        parent=None,
        priority=0,
        flags={"pvp": "deny"},
    )
    ocean = _cuboid("deepest_warm_ocean", 0, 0, 0, 40, 10, 40, 0, parent="root")
    main = _cuboid(
        "deepest_warm_ocean_main",
        10,
        0,
        10,
        20,
        10,
        20,
        5,
        parent="deepest_warm_ocean",
    )
    lab = _cuboid("deepest_warm_ocean_lab", 10, 0, 10, 20, 10, 20, -1, parent="root")
    regions = [root, ocean, main, lab]
    edge_dicts = _spatial_edge_dicts(regions)
    flag_types = {"pvp": "state"}

    lab_rows = [r for r in compute_region_flag_coverage("deepest_warm_ocean_lab", regions, edge_dicts, flag_types) if r["flag"] == "pvp"]
    assert lab_rows
    lab_top = max(lab_rows, key=lambda r: r["percent"])
    assert lab_top["viaRegion"] == "deepest_warm_ocean_main"
    assert lab_top["definedIn"] == "root"
    assert lab_top["inheritType"] == "containment"

    main_rows = [r for r in compute_region_flag_coverage("deepest_warm_ocean_main", regions, edge_dicts, flag_types) if r["flag"] == "pvp"]
    main_top = max(main_rows, key=lambda r: r["percent"])
    assert main_top["viaRegion"] == "deepest_warm_ocean"
    assert main_top["definedIn"] == "root"
    assert main_top["inheritType"] == "inheritance"

    ocean_rows = [r for r in compute_region_flag_coverage("deepest_warm_ocean", regions, edge_dicts, flag_types) if r["flag"] == "pvp"]
    ocean_top = max(ocean_rows, key=lambda r: r["percent"])
    assert ocean_top["viaRegion"] == "root"
    assert ocean_top["definedIn"] == "root"
    assert ocean_top["inheritType"] == "inheritance"


def test_losing_neighbor_not_listed_as_via():
    winner = _cuboid("subject", 0, 0, 0, 10, 10, 10, 10, flags={"pvp": "allow"})
    loser = _cuboid("loser", 2, 0, 2, 8, 10, 8, 0, flags={"pvp": "deny"})
    regions = [winner, loser]
    edge_dicts = _spatial_edge_dicts(regions)
    rows = compute_region_flag_coverage("subject", regions, edge_dicts, {"pvp": "state"})
    pvp = [r for r in rows if r["flag"] == "pvp"]
    assert pvp
    assert all(r["viaRegion"] != "loser" for r in pvp)


def test_state_tie_with_deny_winner_is_warning_not_ambiguous():
    subject = _cuboid("subject", 0, 0, 0, 10, 10, 10, 5)
    a = _cuboid("a", 0, 0, 0, 10, 10, 10, 5, flags={"sleep": "allow"})
    b = _cuboid("b", 5, 0, 5, 15, 10, 15, 5, flags={"sleep": "deny"})
    regions = [subject, a, b]
    edge_dicts = _spatial_edge_dicts(regions)
    rows = compute_region_flag_coverage("subject", regions, edge_dicts, {"sleep": "state"})
    sleep = [r for r in rows if r["flag"] == "sleep"]
    assert sleep
    deny_rows = [r for r in sleep if r["value"] == "deny"]
    assert deny_rows
    assert deny_rows[0].get("inheritType") == "warning"
    assert deny_rows[0].get("kind") != "ambiguous"
    assert all(r.get("kind") != "ambiguous" for r in sleep)


def test_intersect_inherit_type_on_overlap():
    a = _cuboid("a", 0, 0, 0, 10, 10, 10, 5)
    b = _cuboid("b", 5, 0, 5, 15, 10, 15, 5, flags={"pvp": "deny"})
    regions = [a, b]
    edge_dicts = _spatial_edge_dicts(regions)
    rows = compute_region_flag_coverage("a", regions, edge_dicts, {"pvp": "state"})
    assert any(
        r.get("inheritType") == "intersection"
        for r in rows
        if r["flag"] == "pvp"
    )


def test_many_nested_tunnels_decompose_quickly():
    subject = _cuboid("moria_main", 0, 0, 0, 300, 50, 300, 0)
    tunnels = [
        _cuboid(
            f"metro_express_tunnel_{i}",
            i * 2,
            0,
            0,
            i * 2 + 1,
            50,
            300,
            i + 1,
            flags={"pvp": "allow"},
        )
        for i in range(150)
    ]
    regions = [subject, *tunnels]
    by_id = {r.id: r for r in regions}
    started = time.monotonic()
    groups = _decompose_applicable_volumes(subject, {r.id for r in regions}, by_id)
    elapsed = time.monotonic() - started
    assert len(groups) < 5000
    assert elapsed < 5.0


def test_api_flag_coverage_with_real_flag_types():
    a = _square_poly2d("a", 0, 0, 10, 10, 0, flags={"pvp": "allow"})
    b = _square_poly2d("b", 5, 5, 15, 15, 0, flags={"pvp": "deny"})
    regions = [a, b]
    edge_dicts = _spatial_edge_dicts(regions)
    _reset_session()
    _session["regions"] = regions
    _session["scheme"] = {"regions": [], "spatialEdges": edge_dicts}
    client = TestClient(app)
    try:
        res_region = client.get("/api/regions/a/flag-coverage")
        assert res_region.status_code == 200
        assert isinstance(res_region.json(), list)

        res_scheme = client.get("/api/flags/pvp/coverage")
        assert res_scheme.status_code == 200
        body = res_scheme.json()
        assert body.get("intersects")
        labels = {e["label"] for e in body["intersects"]}
        assert "undefined" not in labels
        assert labels
    finally:
        _reset_session()
