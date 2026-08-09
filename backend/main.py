"""FastAPI application entry point."""

from __future__ import annotations

import json
import logging
import os
import sys
import threading
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.flags.catalog import (
    add_custom_flag,
    delete_all_custom_flags,
    delete_custom_flag,
    load_builtin_flags,
    load_custom_flags,
    load_flags_catalog,
    replace_custom_flags,
)
from backend.geometry.intersections import compute_spatial_edges
from backend.manual_geometry import (
    apply_geometry_fields,
    is_manual_region,
    normalize_manual_type,
)
from backend.manual_regions import ChildrenMode, clear_manual_regions, delete_manual_region
from backend.models.region import Region
from backend.parser.wg_parser import ParseError, parse_regions_yaml, validate_parent_links
from backend.scheme.io import build_scheme, load_scheme, save_scheme, source_hash
from backend.regions_export_yaml import export_regions_yaml
from backend.util.region_ids import is_valid_region_id
from backend.version import APP_VERSION, check_for_update


def _runtime_roots() -> tuple[Path, Path]:
    """Return (bundle_root for read-only assets, writable_root next to install)."""
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        return meipass, Path(sys.executable).resolve().parent
    app_root = Path(__file__).resolve().parents[1]
    return app_root, app_root


BUNDLE_ROOT, WRITABLE_ROOT = _runtime_roots()
APP_ROOT = BUNDLE_ROOT
WORKSPACE_ROOT = APP_ROOT.parent if not getattr(sys, "frozen", False) else BUNDLE_ROOT
STATIC_DIR = APP_ROOT / "backend" / "static"
if getattr(sys, "frozen", False):
    FLAGS_PATH = BUNDLE_ROOT / "all_flags.txt"
    WG_JAR_PATH = BUNDLE_ROOT / "worldguard-bukkit-7.0.17.jar"
else:
    FLAGS_PATH = WORKSPACE_ROOT / "all_flags.txt"
    WG_JAR_PATH = WORKSPACE_ROOT / "worldguard-bukkit-7.0.17.jar"
CUSTOM_FLAGS_PATH = WRITABLE_ROOT / "data" / "custom_flags.json"

app = FastAPI(title="WG Regions Studio", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class _SkipHealthAccessLog(logging.Filter):
    """Keep the 2s liveness poll out of the uvicorn console."""

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            return "/api/health" not in record.getMessage()
        except Exception:
            return True


def _quiet_health_access_log() -> None:
    log = logging.getLogger("uvicorn.access")
    if not any(isinstance(f, _SkipHealthAccessLog) for f in log.filters):
        log.addFilter(_SkipHealthAccessLog())


def _maybe_open_browser() -> None:
    if os.environ.get("MRV_OPEN_BROWSER", "").lower() in ("1", "true", "yes"):
        webbrowser.open("http://127.0.0.1:8000")


@app.on_event("startup")
def on_startup() -> None:
    _quiet_health_access_log()
    threading.Timer(1.2, _maybe_open_browser).start()

# In-memory session state
_session: dict[str, Any] = {
    "yaml_content": "",
    "source_path": "",
    "regions": [],
    "scheme": None,
}


class ManualRegionRequest(BaseModel):
    id: str
    parent: str | None = None
    type: str = "manual"
    priority: int = 0
    flags: dict[str, Any] = {}
    owners: dict[str, Any] = {}
    members: dict[str, Any] = {}
    min: dict[str, Any] | None = None
    max: dict[str, Any] | None = None
    min_y: int | None = None
    max_y: int | None = None
    points: list[dict[str, Any]] | None = None


class DeleteManualRegionRequest(BaseModel):
    id: str
    children_mode: ChildrenMode = "detach"


class UpdateFlagsRequest(BaseModel):
    flags: dict[str, Any]


class UpdateParentRequest(BaseModel):
    parent: str | None = None


class UpdatePriorityRequest(BaseModel):
    priority: int


class RenameRegionRequest(BaseModel):
    id: str


class UpdateMembersRequest(BaseModel):
    owners: dict[str, Any] = {}
    members: dict[str, Any] = {}


class UpdateManualGeometryRequest(BaseModel):
    type: str
    min: dict[str, Any] | None = None
    max: dict[str, Any] | None = None
    min_y: int | None = None
    max_y: int | None = None
    points: list[dict[str, Any]] | None = None


class BulkFlagsRequest(BaseModel):
    flag: str
    action: str  # "delete" | "update"
    value: Any = None
    region_ids: list[str] | None = None  # None = all regions


class SchemeSaveRequest(BaseModel):
    path: str


class SchemeLoadRequest(BaseModel):
    path: str


class CustomFlagRequest(BaseModel):
    name: str
    type: str = "string"
    description: str = ""


def _strip_flags_from_regions(flag_names: set[str]) -> list[str]:
    """Remove catalog-deleted flag keys from session data and current scheme."""
    if not flag_names:
        return []
    affected: list[str] = []
    regions: list[Region] = list(_session.get("regions") or [])
    for region in regions:
        flags = dict(region.flags)
        if not flag_names.intersection(flags):
            continue
        for name in flag_names:
            flags.pop(name, None)
        region.flags = flags
        _sync_region_flags_to_scheme(region.id, flags)
        affected.append(region.id)
    _session["regions"] = regions
    return affected


def _rebuild_scheme() -> dict[str, Any]:
    regions: list[Region] = _session["regions"]
    if not regions:
        raise HTTPException(status_code=400, detail="No regions loaded")
    spatial = compute_spatial_edges(regions)
    scheme = build_scheme(
        regions,
        spatial,
        _session.get("yaml_content", ""),
        _session.get("source_path", ""),
    )
    _session["scheme"] = scheme
    return scheme


def _flags_catalog():
    if not FLAGS_PATH.exists():
        return []
    jar = WG_JAR_PATH if WG_JAR_PATH.is_file() else None
    return load_flags_catalog(FLAGS_PATH, jar_path=jar, custom_path=CUSTOM_FLAGS_PATH)


def _builtin_flag_names() -> set[str]:
    if not FLAGS_PATH.exists():
        return set()
    jar = WG_JAR_PATH if WG_JAR_PATH.is_file() else None
    return {f.name for f in load_builtin_flags(FLAGS_PATH, jar_path=jar)}


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/version")
def get_version() -> dict[str, str]:
    return {"version": APP_VERSION}


@app.get("/api/updates/check")
def updates_check() -> dict[str, Any]:
    """Compare the running app version to the latest GitHub release."""
    return check_for_update()


@app.get("/api/flags")
def get_flags() -> list[dict[str, str | bool]]:
    return [f.to_dict() for f in _flags_catalog()]


@app.post("/api/flags/custom")
def create_custom_flag(req: CustomFlagRequest) -> dict[str, str | bool]:
    try:
        info = add_custom_flag(
            CUSTOM_FLAGS_PATH,
            name=req.name,
            flag_type=req.type,
            description=req.description,
            builtin_names=_builtin_flag_names(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return info.to_dict()


@app.delete("/api/flags/custom/{name}")
def remove_custom_flag(name: str) -> dict[str, Any]:
    try:
        delete_custom_flag(CUSTOM_FLAGS_PATH, name, _builtin_flag_names())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    affected = _strip_flags_from_regions({name.strip()})
    return {"deleted": name, "affected_region_ids": affected}


@app.delete("/api/flags/custom")
def remove_all_custom_flags() -> dict[str, Any]:
    deleted = delete_all_custom_flags(CUSTOM_FLAGS_PATH)
    affected = _strip_flags_from_regions(set(deleted))
    return {"deleted": deleted, "affected_region_ids": affected}


@app.get("/api/flags/custom/export")
def export_custom_flags() -> PlainTextResponse:
    payload = [
        {
            "name": flag.name,
            "type": flag.flag_type,
            "description": flag.description,
        }
        for flag in load_custom_flags(CUSTOM_FLAGS_PATH)
    ]
    return PlainTextResponse(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=custom_flags.json"},
    )


@app.post("/api/flags/custom/import")
async def import_custom_flags(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        raw = json.loads((await file.read()).decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Import file must be a UTF-8 JSON array") from exc
    if not isinstance(raw, list):
        raise HTTPException(status_code=400, detail="Import file must contain a JSON array")
    try:
        flags = replace_custom_flags(CUSTOM_FLAGS_PATH, raw, _builtin_flag_names())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"count": len(flags), "flags": [flag.to_dict() for flag in flags]}


@app.post("/api/parse")
async def parse_yaml(file: UploadFile = File(...)) -> dict[str, Any]:
    content = (await file.read()).decode("utf-8")
    try:
        regions = parse_regions_yaml(content)
        validate_parent_links(regions)
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    type_counts: dict[str, int] = {}
    for r in regions:
        type_counts[r.type] = type_counts.get(r.type, 0) + 1

    _session["yaml_content"] = content
    _session["source_path"] = file.filename or ""
    _session["regions"] = regions
    _session["scheme"] = None

    return {
        "count": len(regions),
        "by_type": type_counts,
        "source_path": _session["source_path"],
        "source_hash": source_hash(content),
    }


@app.post("/api/build")
def build() -> dict[str, Any]:
    scheme = _rebuild_scheme()
    return {
        "nodeCount": len(scheme["regions"]),
        "spatialEdgeCount": len(scheme["spatialEdges"]),
        "hierarchyEdgeCount": len(scheme["hierarchyEdges"]),
        "scheme": scheme,
    }


@app.post("/api/session/clear")
def clear_session() -> dict[str, str]:
    """Reset in-memory session to the empty post-startup state."""
    _session["yaml_content"] = ""
    _session["source_path"] = ""
    _session["regions"] = []
    _session["scheme"] = None
    return {"status": "ok"}


@app.get("/api/scheme")
def get_scheme() -> dict[str, Any]:
    scheme = _session.get("scheme")
    if not scheme:
        raise HTTPException(status_code=404, detail="No scheme built yet")
    return scheme


@app.post("/api/scheme/save")
def scheme_save(req: SchemeSaveRequest) -> dict[str, str]:
    scheme = _session.get("scheme")
    if not scheme:
        raise HTTPException(status_code=404, detail="No scheme to save")
    path = Path(req.path)
    save_scheme(scheme, path)
    return {"path": str(path)}


@app.post("/api/scheme/load")
def scheme_load(req: SchemeLoadRequest) -> dict[str, Any]:
    path = Path(req.path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")
    scheme = load_scheme(path)
    _session["scheme"] = scheme
    _session["regions"] = [Region.from_dict(r) for r in scheme["regions"]]
    _session["yaml_content"] = ""
    _session["source_path"] = scheme.get("sourcePath", "")
    return scheme


@app.post("/api/scheme/import")
def scheme_import(scheme: dict[str, Any]) -> dict[str, Any]:
    """Load a scheme JSON body (from browser file picker) into the session."""
    from backend.scheme.io import SCHEMA_VERSION

    if scheme.get("schemaVersion") != SCHEMA_VERSION:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported schema version: {scheme.get('schemaVersion')}",
        )
    if not isinstance(scheme.get("regions"), list):
        raise HTTPException(status_code=400, detail="Invalid scheme: missing regions")

    try:
        regions = [Region.from_dict(r) for r in scheme["regions"]]
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid region data: {exc}") from exc

    _session["scheme"] = scheme
    _session["regions"] = regions
    _session["yaml_content"] = ""
    _session["source_path"] = scheme.get("sourcePath", "")
    return scheme


@app.post("/api/regions/manual")
def add_manual_region(req: ManualRegionRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    if not is_valid_region_id(req.id):
        raise HTTPException(
            status_code=400,
            detail="Region id must use Latin letters, digits, underscore or hyphen only",
        )
    if any(r.id == req.id for r in regions):
        raise HTTPException(status_code=400, detail=f"Region '{req.id}' already exists")

    if req.parent == req.id:
        raise HTTPException(
            status_code=400,
            detail="Region parent cannot be the region itself (parent == id would create a cycle)",
        )

    if req.parent and not any(r.id == req.parent for r in regions):
        raise HTTPException(status_code=400, detail=f"Unknown parent '{req.parent}'")

    try:
        region_type = normalize_manual_type(req.type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    region = Region(
        id=req.id,
        type=region_type,
        parent=req.parent,
        priority=req.priority,
        flags=req.flags,
        owners=req.owners,
        members=req.members,
        is_manual=True,
    )
    apply_geometry_fields(
        region,
        region_type=region_type,
        min_v=req.min,
        max_v=req.max,
        min_y=req.min_y,
        max_y=req.max_y,
        points=req.points,
    )

    # Safety-net: reject any parent-cycle (including cycles involving new region).
    try:
        validate_parent_links([*regions, region])
    except Exception as exc:
        # parse_regions_yaml uses ParseError; but we intentionally keep this handler robust.
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    regions.append(region)
    _session["regions"] = regions

    if _session.get("scheme"):
        _rebuild_scheme()

    return region.to_dict()


@app.post("/api/regions/manual/delete")
def remove_manual_region(req: DeleteManualRegionRequest) -> dict[str, Any]:
    """Delete any session region (YAML or temporary) with children handling."""
    regions: list[Region] = list(_session.get("regions") or [])
    try:
        updated = delete_manual_region(regions, req.id, req.children_mode)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _session["regions"] = updated

    if _session.get("scheme"):
        _rebuild_scheme()

    return {"deleted": req.id, "children_mode": req.children_mode}


@app.post("/api/regions/manual/clear")
def clear_all_manual_regions() -> dict[str, Any]:
    """Remove all temporary regions from the session (used by «Reset scheme»)."""
    regions: list[Region] = list(_session.get("regions") or [])
    before = len(regions)
    updated = clear_manual_regions(regions)
    _session["regions"] = updated
    removed = before - len(updated)
    if _session.get("scheme") and updated:
        _rebuild_scheme()
    elif not updated:
        _session["scheme"] = None
    return {"removed": removed, "remaining": len(updated)}


@app.patch("/api/regions/{region_id}/geometry")
def update_region_geometry(region_id: str, req: UpdateManualGeometryRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")

    try:
        region_type = normalize_manual_type(req.type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Preserve is_manual for YAML-loaded regions; only temp regions stay marked manual.
    apply_geometry_fields(
        region,
        region_type=region_type,
        min_v=req.min,
        max_v=req.max,
        min_y=req.min_y,
        max_y=req.max_y,
        points=req.points,
        mark_as_manual=is_manual_region(region),
    )
    _session["regions"] = regions

    if _session.get("scheme"):
        _rebuild_scheme()

    return region.to_dict()


def _sync_region_flags_to_scheme(region_id: str, flags: dict[str, Any]) -> None:
    scheme = _session.get("scheme")
    if not scheme:
        return
    for entry in scheme["regions"]:
        if entry.get("id") == region_id:
            entry["flags"] = dict(flags)
            break


def _sync_region_field_to_scheme(region_id: str, field: str, value: Any) -> None:
    scheme = _session.get("scheme")
    if not scheme:
        return
    for entry in scheme["regions"]:
        if entry.get("id") == region_id:
            entry[field] = value
            break


@app.patch("/api/regions/{region_id}/flags")
def update_region_flags(region_id: str, req: UpdateFlagsRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")

    region.flags = dict(req.flags)
    _session["regions"] = regions
    _sync_region_flags_to_scheme(region_id, region.flags)

    return region.to_dict()


@app.patch("/api/regions/{region_id}/priority")
def update_region_priority(region_id: str, req: UpdatePriorityRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")

    region.priority = int(req.priority)
    _session["regions"] = regions
    _sync_region_field_to_scheme(region_id, "priority", region.priority)

    return region.to_dict()


@app.patch("/api/regions/{region_id}/members")
def update_region_members(region_id: str, req: UpdateMembersRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")

    region.owners = dict(req.owners or {})
    region.members = dict(req.members or {})
    _session["regions"] = regions
    _sync_region_field_to_scheme(region_id, "owners", region.owners)
    _sync_region_field_to_scheme(region_id, "members", region.members)

    return region.to_dict()


@app.patch("/api/regions/{region_id}/rename")
def rename_region(region_id: str, req: RenameRegionRequest) -> dict[str, Any]:
    new_id = req.id.strip()
    if not is_valid_region_id(new_id):
        raise HTTPException(
            status_code=400,
            detail="Region id must use Latin letters, digits, underscore or hyphen only",
        )
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")
    if new_id == region_id:
        return region.to_dict()
    if any(r.id == new_id for r in regions):
        raise HTTPException(status_code=400, detail=f"Region '{new_id}' already exists")

    region.id = new_id
    for other in regions:
        if other.parent == region_id:
            other.parent = new_id

    try:
        validate_parent_links(regions)
    except ParseError as exc:
        # Roll back id + parent rewrites.
        region.id = region_id
        for other in regions:
            if other.parent == new_id:
                other.parent = region_id
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _session["regions"] = regions
    if _session.get("scheme"):
        _rebuild_scheme()

    return region.to_dict()


@app.patch("/api/regions/{region_id}/parent")
def update_region_parent(region_id: str, req: UpdateParentRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    region = next((r for r in regions if r.id == region_id), None)
    if region is None:
        raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")

    new_parent = req.parent
    if new_parent == region_id:
        raise HTTPException(
            status_code=400,
            detail="Region parent cannot be the region itself (parent == id would create a cycle)",
        )
    if new_parent and not any(r.id == new_parent for r in regions):
        raise HTTPException(status_code=400, detail=f"Unknown parent '{new_parent}'")

    previous = region.parent
    region.parent = new_parent
    try:
        validate_parent_links(regions)
    except ParseError as exc:
        region.parent = previous
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _session["regions"] = regions
    if _session.get("scheme"):
        _rebuild_scheme()

    return region.to_dict()


@app.post("/api/regions/flags/bulk")
def bulk_update_flags(req: BulkFlagsRequest) -> dict[str, Any]:
    flag_name = req.flag.strip()
    if not flag_name:
        raise HTTPException(status_code=400, detail="Flag name is required")
    if req.action not in ("delete", "update"):
        raise HTTPException(status_code=400, detail="action must be 'delete' or 'update'")
    if req.action == "update" and req.value is None:
        raise HTTPException(status_code=400, detail="value is required for update")

    regions: list[Region] = list(_session.get("regions") or [])
    if not regions:
        raise HTTPException(status_code=400, detail="No regions loaded")

    if req.region_ids is None:
        targets = regions
    else:
        id_set = set(req.region_ids)
        targets = [r for r in regions if r.id in id_set]
        missing = id_set - {r.id for r in targets}
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Regions not found: {', '.join(sorted(missing))}",
            )

    updated_ids: list[str] = []
    for region in targets:
        flags = dict(region.flags)
        if req.action == "delete":
            if flag_name not in flags:
                continue
            del flags[flag_name]
        else:
            flags[flag_name] = req.value
        region.flags = flags
        _sync_region_flags_to_scheme(region.id, flags)
        updated_ids.append(region.id)

    _session["regions"] = regions
    return {
        "action": req.action,
        "flag": flag_name,
        "updated": updated_ids,
        "count": len(updated_ids),
    }


@app.delete("/api/regions/flags")
def clear_all_region_flags() -> dict[str, Any]:
    """Remove every flag from every region in the current session."""
    regions: list[Region] = list(_session.get("regions") or [])
    if not regions:
        raise HTTPException(status_code=400, detail="No regions loaded")

    updated_ids: list[str] = []
    for region in regions:
        if not region.flags:
            continue
        region.flags = {}
        _sync_region_flags_to_scheme(region.id, {})
        updated_ids.append(region.id)

    _session["regions"] = regions
    return {
        "updated": updated_ids,
        "count": len(updated_ids),
    }


@app.get("/api/regions/export/yml")
def export_regions_yml(
    include_manual: bool = Query(True, description="Include temporary regions"),
) -> PlainTextResponse:
    regions: list[Region] = list(_session.get("regions") or [])
    if not regions:
        raise HTTPException(status_code=400, detail="No regions loaded")

    try:
        yaml_text = export_regions_yaml(regions, include_manual=include_manual)
    except ParseError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover (safety-net)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return PlainTextResponse(yaml_text, media_type="text/yaml")


# Serve frontend static files when built
if STATIC_DIR.exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa_fallback(full_path: str) -> FileResponse:
        index = STATIC_DIR / "index.html"
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        if index.exists():
            return FileResponse(index)
        raise HTTPException(status_code=404, detail="Frontend not built")
