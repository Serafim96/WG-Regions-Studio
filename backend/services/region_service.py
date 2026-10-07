"""Region CRUD and scheme-sync business logic for the in-memory session."""

from __future__ import annotations

import logging
import sys
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from backend.flags.catalog import load_flags_catalog
from backend.geometry.flag_coverage import (
    CoverageCancelled,
    compute_flag_scheme_coverage,
    compute_region_flag_coverage,
)
from backend.geometry.intersections import NoIntersectionError, compute_spatial_edges, intersection_bbox_center
from backend.manual_geometry import (
    apply_geometry_fields,
    is_manual_region,
    normalize_manual_type,
)
from backend.manual_regions import ChildrenMode, clear_manual_regions, delete_manual_region
from backend.models.region import Region
from backend.parser.wg_parser import ParseError, validate_parent_links
from backend.scheme.io import build_scheme, regions_from_scheme
from backend.services.helpers import raise_if_self_parent, validate_scheme_version
from backend.services.session_service import SessionStore
from backend.util.region_ids import is_valid_region_id

logger = logging.getLogger(__name__)


class RegionService:
    def __init__(self, store: SessionStore) -> None:
        self._store = store
        self._coverage_jobs: dict[str, dict[str, Any]] = {}
        self._coverage_lock = threading.Lock()

    def find_by_id(self, region_id: str) -> Region | None:
        regions: list[Region] = list(self._store.get("regions") or [])
        by_id = {r.id: r for r in regions}
        return by_id.get(region_id)

    def _regions(self) -> list[Region]:
        return list(self._store.get("regions") or [])

    def _require_region(self, region_id: str) -> tuple[list[Region], Region]:
        regions = self._regions()
        by_id = {r.id: r for r in regions}
        region = by_id.get(region_id)
        if region is None:
            raise HTTPException(status_code=404, detail=f"Region '{region_id}' not found")
        return regions, region

    def rebuild_scheme(self) -> dict[str, Any]:
        regions: list[Region] = self._store["regions"]
        if not regions:
            raise HTTPException(status_code=400, detail="No regions loaded")
        spatial = compute_spatial_edges(regions)
        scheme = build_scheme(
            regions,
            spatial,
            self._store.get("yaml_content", ""),
            self._store.get("source_path", ""),
        )
        self._store["scheme"] = scheme
        return scheme

    def sync_region_flags_to_scheme(self, region_id: str, flags: dict[str, Any]) -> None:
        scheme = self._store.get("scheme")
        if not scheme:
            return
        for entry in scheme["regions"]:
            if entry.get("id") == region_id:
                entry["flags"] = dict(flags)
                break

    def sync_region_field_to_scheme(self, region_id: str, field: str, value: Any) -> None:
        scheme = self._store.get("scheme")
        if not scheme:
            return
        for entry in scheme["regions"]:
            if entry.get("id") == region_id:
                entry[field] = value
                break

    def strip_flags_from_regions(self, flag_names: set[str]) -> list[str]:
        """Remove catalog-deleted flag keys from session data and current scheme."""
        if not flag_names:
            return []
        affected: list[str] = []
        regions: list[Region] = self._regions()
        for region in regions:
            flags = dict(region.flags)
            if not flag_names.intersection(flags):
                continue
            for name in flag_names:
                flags.pop(name, None)
            region.flags = flags
            self.sync_region_flags_to_scheme(region.id, flags)
            affected.append(region.id)
        self._store["regions"] = regions
        return affected

    def apply_scheme(self, scheme: dict[str, Any]) -> dict[str, Any]:
        validate_scheme_version(scheme)
        if not isinstance(scheme.get("regions"), list):
            raise HTTPException(status_code=400, detail="Invalid scheme: missing regions")
        try:
            regions = regions_from_scheme(scheme)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid region data: {exc}") from exc
        self._store["scheme"] = scheme
        self._store["regions"] = regions
        self._store["yaml_content"] = ""
        self._store["source_path"] = scheme.get("sourcePath", "")
        return scheme

    def add_manual_region(self, req: Any) -> dict[str, Any]:
        regions = self._regions()
        if not is_valid_region_id(req.id):
            raise HTTPException(
                status_code=400,
                detail="Region id must use Latin letters, digits, underscore or hyphen only",
            )
        if any(r.id == req.id for r in regions):
            raise HTTPException(status_code=400, detail=f"Region '{req.id}' already exists")

        raise_if_self_parent(req.id, req.parent)

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

        try:
            validate_parent_links([*regions, region])
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        regions.append(region)
        self._store["regions"] = regions

        if self._store.get("scheme"):
            self.rebuild_scheme()

        return region.to_dict()

    def remove_manual_region(self, region_id: str, children_mode: ChildrenMode) -> dict[str, Any]:
        regions = self._regions()
        try:
            updated = delete_manual_region(regions, region_id, children_mode)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        self._store["regions"] = updated

        if not updated:
            self._store["scheme"] = None
        elif self._store.get("scheme"):
            self.rebuild_scheme()

        return {
            "deleted": region_id,
            "children_mode": children_mode,
            "remaining": len(updated),
        }

    def clear_all_manual_regions(self) -> dict[str, Any]:
        regions = self._regions()
        before = len(regions)
        updated = clear_manual_regions(regions)
        self._store["regions"] = updated
        removed = before - len(updated)
        if self._store.get("scheme") and updated:
            self.rebuild_scheme()
        elif not updated:
            self._store["scheme"] = None
        return {"removed": removed, "remaining": len(updated)}

    def update_geometry(self, region_id: str, req: Any) -> dict[str, Any]:
        regions, region = self._require_region(region_id)

        try:
            region_type = normalize_manual_type(req.type)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

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
        self._store["regions"] = regions

        if self._store.get("scheme"):
            self.rebuild_scheme()

        return region.to_dict()

    def update_flags(self, region_id: str, flags: dict[str, Any]) -> dict[str, Any]:
        regions, region = self._require_region(region_id)
        region.flags = dict(flags)
        self._store["regions"] = regions
        self.sync_region_flags_to_scheme(region_id, region.flags)
        return region.to_dict()

    def update_priority(self, region_id: str, priority: int) -> dict[str, Any]:
        regions, region = self._require_region(region_id)
        region.priority = int(priority)
        self._store["regions"] = regions
        self.sync_region_field_to_scheme(region_id, "priority", region.priority)
        return region.to_dict()

    def update_members(
        self,
        region_id: str,
        owners: dict[str, Any],
        members: dict[str, Any],
    ) -> dict[str, Any]:
        regions, region = self._require_region(region_id)
        region.owners = dict(owners or {})
        region.members = dict(members or {})
        self._store["regions"] = regions
        self.sync_region_field_to_scheme(region_id, "owners", region.owners)
        self.sync_region_field_to_scheme(region_id, "members", region.members)
        return region.to_dict()

    def rename(self, region_id: str, new_id: str) -> dict[str, Any]:
        new_id = new_id.strip()
        if not is_valid_region_id(new_id):
            raise HTTPException(
                status_code=400,
                detail="Region id must use Latin letters, digits, underscore or hyphen only",
            )
        regions, region = self._require_region(region_id)
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
            region.id = region_id
            for other in regions:
                if other.parent == new_id:
                    other.parent = region_id
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        self._store["regions"] = regions
        if self._store.get("scheme"):
            self.rebuild_scheme()

        return region.to_dict()

    def update_parent(self, region_id: str, new_parent: str | None) -> dict[str, Any]:
        regions, region = self._require_region(region_id)
        raise_if_self_parent(region_id, new_parent)
        if new_parent and not any(r.id == new_parent for r in regions):
            raise HTTPException(status_code=400, detail=f"Unknown parent '{new_parent}'")

        previous = region.parent
        region.parent = new_parent
        try:
            validate_parent_links(regions)
        except ParseError as exc:
            region.parent = previous
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        self._store["regions"] = regions
        if self._store.get("scheme"):
            self.rebuild_scheme()

        return region.to_dict()

    def bulk_update_flags(
        self,
        flag_name: str,
        action: str,
        value: Any,
        region_ids: list[str] | None,
    ) -> dict[str, Any]:
        flag_name = flag_name.strip()
        if not flag_name:
            raise HTTPException(status_code=400, detail="Flag name is required")
        if action not in ("delete", "update"):
            raise HTTPException(status_code=400, detail="action must be 'delete' or 'update'")
        if action == "update" and value is None:
            raise HTTPException(status_code=400, detail="value is required for update")

        regions = self._regions()
        if not regions:
            raise HTTPException(status_code=400, detail="No regions loaded")

        if region_ids is None:
            targets = regions
        else:
            id_set = set(region_ids)
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
            if action == "delete":
                if flag_name not in flags:
                    continue
                del flags[flag_name]
            else:
                flags[flag_name] = value
            region.flags = flags
            self.sync_region_flags_to_scheme(region.id, flags)
            updated_ids.append(region.id)

        self._store["regions"] = regions
        return {
            "action": action,
            "flag": flag_name,
            "updated": updated_ids,
            "count": len(updated_ids),
        }

    def clear_all_region_flags(self) -> dict[str, Any]:
        regions = self._regions()
        if not regions:
            raise HTTPException(status_code=400, detail="No regions loaded")

        updated_ids: list[str] = []
        for region in regions:
            if not region.flags:
                continue
            region.flags = {}
            self.sync_region_flags_to_scheme(region.id, {})
            updated_ids.append(region.id)

        self._store["regions"] = regions
        return {
            "updated": updated_ids,
            "count": len(updated_ids),
        }

    def _flag_types(self) -> dict[str, str]:
        if getattr(sys, "frozen", False):
            flags_path = Path(getattr(sys, "_MEIPASS")) / "all_flags.txt"
            writable = Path(sys.executable).resolve().parent
        else:
            app_root = Path(__file__).resolve().parents[2]
            flags_path = app_root.parent / "all_flags.txt"
            writable = app_root
        custom_path = writable / "data" / "custom_flags.json"
        catalog = load_flags_catalog(flags_path, custom_path=custom_path)
        return {f.name: f.flag_type for f in catalog}

    def _spatial_edges(self) -> list[dict[str, Any]]:
        scheme = self._store.get("scheme") or {}
        return list(scheme.get("spatialEdges") or [])

    def begin_region_flag_coverage(self, region_id: str) -> str:
        """Start coverage in a background thread and return a pollable job id."""
        self._require_region(region_id)
        regions = self._regions()
        edges = self._spatial_edges()
        flag_types = self._flag_types()
        job_id = uuid.uuid4().hex
        job: dict[str, Any] = {
            "percent": 0.0,
            "rows": [],
            "done": False,
            "error": None,
            "cancel": False,
        }
        with self._coverage_lock:
            for existing in self._coverage_jobs.values():
                existing["cancel"] = True
            self._coverage_jobs.clear()
            self._coverage_jobs[job_id] = job

        def _run() -> None:
            def on_progress(percent: float, rows: list[dict[str, Any]]) -> bool:
                with self._coverage_lock:
                    if job["cancel"]:
                        return False
                    job["percent"] = round(percent, 1)
                    job["rows"] = list(rows)
                    return True

            try:
                rows = compute_region_flag_coverage(
                    region_id,
                    regions,
                    edges,
                    flag_types,
                    on_progress=on_progress,
                )
                with self._coverage_lock:
                    if not job["cancel"]:
                        job["rows"] = rows
                        job["percent"] = 100.0
                        job["done"] = True
            except CoverageCancelled:
                with self._coverage_lock:
                    job["done"] = True
            except Exception as exc:
                logger.exception("region_flag_coverage failed for %s", region_id)
                with self._coverage_lock:
                    job["error"] = f"{type(exc).__name__}: region {region_id!r} ({exc})"
                    job["done"] = True

        threading.Thread(
            target=_run,
            name=f"flag-coverage-{job_id[:8]}",
            daemon=True,
        ).start()
        return job_id

    def region_flag_coverage_job(self, job_id: str) -> dict[str, Any]:
        with self._coverage_lock:
            job = self._coverage_jobs.get(job_id)
            if job is None:
                raise HTTPException(status_code=404, detail="Unknown coverage job")
            return {
                "percent": job["percent"],
                "rows": list(job["rows"]),
                "done": job["done"],
                "error": job["error"],
            }

    def cancel_region_flag_coverage_job(self, job_id: str) -> None:
        with self._coverage_lock:
            job = self._coverage_jobs.get(job_id)
            if job is not None:
                job["cancel"] = True

    def region_flag_coverage(self, region_id: str) -> list[dict[str, Any]]:
        self._require_region(region_id)
        try:
            return compute_region_flag_coverage(
                region_id,
                self._regions(),
                self._spatial_edges(),
                self._flag_types(),
            )
        except Exception as exc:
            logger.exception("region_flag_coverage failed for %s", region_id)
            raise HTTPException(
                status_code=500,
                detail=f"{type(exc).__name__}: region {region_id!r} ({exc})",
            ) from exc

    def region_intersection_center(self, region_id: str, other_id: str) -> dict[str, int]:
        _, subject = self._require_region(region_id)
        _, other = self._require_region(other_id)
        try:
            x, y, z = intersection_bbox_center(subject, other)
        except NoIntersectionError:
            raise HTTPException(
                status_code=404,
                detail=f"No geometric intersection between {region_id!r} and {other_id!r}",
            ) from None
        return {"x": x, "y": y, "z": z}

    def flag_scheme_coverage(self, flag_name: str) -> dict[str, Any]:
        regions = self._regions()
        if not regions:
            raise HTTPException(status_code=400, detail="No regions loaded")
        try:
            return compute_flag_scheme_coverage(
                flag_name,
                regions,
                self._spatial_edges(),
                self._flag_types(),
            )
        except Exception as exc:
            logger.exception("flag_scheme_coverage failed for flag %s", flag_name)
            raise HTTPException(
                status_code=500,
                detail=f"{type(exc).__name__}: flag {flag_name!r} ({exc})",
            ) from exc
