"""FastAPI application entry point."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.flags.catalog import parse_flags_file
from backend.geometry.intersections import compute_spatial_edges
from backend.models.region import Region
from backend.parser.wg_parser import ParseError, parse_regions_yaml, validate_parent_links
from backend.scheme.io import build_scheme, load_scheme, save_scheme

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = PROJECT_ROOT / "backend" / "static"
FLAGS_PATH = PROJECT_ROOT / "all_flags.txt"

app = FastAPI(title="Minecraft Regions Viewer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

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


class SchemeSaveRequest(BaseModel):
    path: str


class SchemeLoadRequest(BaseModel):
    path: str


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


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/flags")
def get_flags() -> list[dict[str, str]]:
    if not FLAGS_PATH.exists():
        return []
    return [f.to_dict() for f in parse_flags_file(FLAGS_PATH)]


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


@app.post("/api/regions/manual")
def add_manual_region(req: ManualRegionRequest) -> dict[str, Any]:
    regions: list[Region] = list(_session.get("regions") or [])
    if any(r.id == req.id for r in regions):
        raise HTTPException(status_code=400, detail=f"Region '{req.id}' already exists")

    if req.parent and not any(r.id == req.parent for r in regions):
        raise HTTPException(status_code=400, detail=f"Unknown parent '{req.parent}'")

    region = Region(
        id=req.id,
        type="manual",
        parent=req.parent,
        priority=req.priority,
        flags=req.flags,
        owners=req.owners,
        members=req.members,
        is_manual=True,
    )
    regions.append(region)
    _session["regions"] = regions

    if _session.get("scheme"):
        _rebuild_scheme()

    return region.to_dict()


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
