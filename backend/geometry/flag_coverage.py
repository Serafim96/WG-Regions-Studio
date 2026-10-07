"""WorldGuard-style flag values over region volume (spatial + parent inheritance)."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal

from shapely.errors import GEOSException
from shapely.geometry import Point, Polygon, box as shapely_box
from shapely.validation import make_valid

from backend.geometry.intersections import (
    _build_cache,
    _cached_intersect_volume,
    _get_y_range,
    _poly_to_polygon,
    _cuboid_to_polygon_xz,
    is_spatial,
    region_volume,
)
from backend.models.region import Region, Vec2, Vec3

WG_GLOBAL_PRIORITY = -(2**31)
WORLD_GLOBAL_ID = "__global__"
NON_SPATIAL_FLAGS = frozenset({"passthrough"})
# Let the health check and coverage-progress poll run during long pure-Python loops.
_YIELD_INTERVAL_S = 0.04

Kind = Literal["local", "parent", "spatial", "none", "ambiguous"]
InheritType = Literal["inheritance", "intersection", "containment", "warning"]
ProgressCb = Callable[[float, list[dict[str, Any]]], bool]

_DECOMP_PROGRESS_END = 30.0
_PROGRESS_INTERVAL_S = 0.1


class CoverageCancelled(Exception):
    """Client closed the effective-flags panel before the job finished."""


_last_yield = 0.0


def _yield_gil() -> None:
    global _last_yield
    now = time.monotonic()
    if now - _last_yield < _YIELD_INTERVAL_S:
        return
    time.sleep(0)
    _last_yield = time.monotonic()


def _report(on_progress: ProgressCb | None, percent: float, rows: list[dict[str, Any]]) -> None:
    if on_progress is None:
        return
    if not on_progress(percent, rows):
        raise CoverageCancelled()


@dataclass(frozen=True)
class CoverageRow:
    flag: str
    value: Any | None
    percent: float
    via_region: str | None
    defined_in: str | None
    kind: Kind
    inherit_type: InheritType | None = None
    blocks: int = 0

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "flag": self.flag,
            "value": _json_safe_value(self.value),
            "percent": round(self.percent, 4),
            "blocks": self.blocks,
            "viaRegion": self.via_region,
            "definedIn": self.defined_in,
            "kind": self.kind,
        }
        if self.inherit_type is not None:
            out["inheritType"] = self.inherit_type
        return out


@dataclass(frozen=True)
class FlagRegionCoverage:
    region_id: str
    total_volume: int
    groups: list[CoverageRow]
    label: str  # node caption for scheme

    def to_dict(self) -> dict[str, Any]:
        return {
            "regionId": self.region_id,
            "totalVolume": self.total_volume,
            "groups": [g.to_dict() for g in self.groups],
            "label": self.label,
        }


@dataclass(frozen=True)
class IntersectCoverage:
    a_id: str
    b_id: str
    label: str
    ambiguous: bool
    groups: list[CoverageRow]
    a_percent: float = 0.0
    b_percent: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "aId": self.a_id,
            "bId": self.b_id,
            "label": self.label,
            "ambiguous": self.ambiguous,
            "groups": [g.to_dict() for g in self.groups],
            "aPercent": round(self.a_percent, 4),
            "bPercent": round(self.b_percent, 4),
        }


def _wg_priority(region: Region) -> int:
    if region.type == "global":
        return WG_GLOBAL_PRIORITY
    return region.priority


def _stable_key(value: Any) -> str:
    return json.dumps(value, sort_keys=True, default=str)


def _json_safe_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, set):
        return sorted(value, key=str)
    if isinstance(value, tuple):
        return [_json_safe_value(v) for v in value]
    if isinstance(value, list):
        return [_json_safe_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _json_safe_value(v) for k, v in value.items()}
    return value


def _effective_flag(
    region_id: str,
    flag_name: str,
    by_id: dict[str, Region],
) -> tuple[Any | None, str | None]:
    current: str | None = region_id
    while current and current in by_id:
        region = by_id[current]
        if flag_name in region.flags:
            return region.flags[flag_name], current
        current = region.parent
    return None, None


def _state_token(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    token = value.strip().lower()
    if token in ("allow", "deny"):
        return token
    return None


def _is_parent_of(ancestor: str, descendant: str, by_id: dict[str, Region]) -> bool:
    current: str | None = descendant
    while current and current in by_id:
        if current == ancestor:
            return True
        current = by_id[current].parent
    return False


def _region_volume_or_zero(region_id: str, by_id: dict[str, Region]) -> int:
    region = by_id.get(region_id)
    if region is None:
        return 0
    return region_volume(region) or 0


def _edge_relation_between(
    a_id: str,
    b_id: str,
    spatial_edges: list[dict[str, Any]],
) -> str | None:
    for edge in spatial_edges:
        s = edge.get("source")
        t = edge.get("target")
        if not isinstance(s, str) or not isinstance(t, str):
            continue
        rel = edge.get("relation")
        if {s, t} != {a_id, b_id}:
            continue
        if rel in ("contains", "intersects"):
            return rel
    return None


def _via_defined_kind_inherit(
    subject_id: str,
    winner: str,
    defined_in: str | None,
    by_id: dict[str, Region],
    spatial_edges: list[dict[str, Any]],
    global_ids: set[str],
    *,
    ambiguous: bool,
) -> tuple[str | None, str | None, Kind, InheritType | None]:
    defined = defined_in or winner
    if ambiguous:
        return winner, defined, "ambiguous", None

    subject = by_id.get(subject_id)
    if subject is None:
        return winner, defined, "spatial", None

    if winner == subject_id and defined == subject_id:
        return subject_id, subject_id, "local", None

    parent = subject.parent
    if winner == parent or (winner == subject_id and defined != subject_id):
        via = parent if parent else subject_id
        if defined and _is_parent_of(defined, via, by_id):
            kind: Kind = "parent"
        elif defined == via:
            kind = "local"
        else:
            kind = "parent"
        return via, defined, kind, "inheritance"

    via = winner
    if via in global_ids or (
        by_id.get(via) is not None and by_id[via].type == "global"
    ):
        return via, defined, "spatial", "containment"

    rel = _edge_relation_between(subject_id, via, spatial_edges)
    if rel == "intersects":
        return via, defined, "spatial", "intersection"
    return via, defined, "spatial", "containment"


def _pick_same_value_winner(
    matches: list[tuple[Any, str, str | None]],
    subject_id: str,
    by_id: dict[str, Region],
    spatial_edges: list[dict[str, Any]],
    global_ids: set[str],
) -> tuple[Any, str, str | None]:
    subject = by_id[subject_id]

    def sort_key(entry: tuple[Any, str, str | None]) -> tuple[int, int, str]:
        _value, winner, _defined = entry
        if winner == subject_id:
            return (0, 0, winner)
        if subject.parent and winner == subject.parent:
            return (1, 0, winner)
        rel = _edge_relation_between(subject_id, winner, spatial_edges)
        if rel == "intersects":
            tier = 2
        else:
            tier = 3
        vol = _region_volume_or_zero(winner, by_id)
        return (tier, vol, winner)

    return min(matches, key=sort_key)


def _resolve_values_fixed(
    entries: list[tuple[Any, str, str | None]],
    flag_type: str | None,
    subject_id: str,
    by_id: dict[str, Region],
    spatial_edges: list[dict[str, Any]],
    global_ids: set[str],
) -> tuple[Any | None, str | None, str | None, Kind, InheritType | None]:
    if not entries:
        return None, None, None, "none", None

    by_value: dict[str, list[tuple[Any, str, str | None]]] = {}
    for value, winner, defined in entries:
        by_value.setdefault(_stable_key(value), []).append((value, winner, defined))

    if len(by_value) == 1:
        value, winner, defined = _pick_same_value_winner(
            entries, subject_id, by_id, spatial_edges, global_ids,
        )
        via, defined_out, kind, inherit = _via_defined_kind_inherit(
            subject_id, winner, defined, by_id, spatial_edges, global_ids, ambiguous=False,
        )
        return value, via, defined_out, kind, inherit

    ft = (flag_type or "").strip().lower()
    if ft == "state":
        for token in ("deny", "allow"):
            matches = [e for e in entries if _state_token(e[0]) == token]
            if matches:
                value, winner, defined = _pick_same_value_winner(
                    matches, subject_id, by_id, spatial_edges, global_ids,
                )
                via, defined_out, kind, inherit = _via_defined_kind_inherit(
                    subject_id,
                    winner,
                    defined,
                    by_id,
                    spatial_edges,
                    global_ids,
                    ambiguous=False,
                )
                if len(by_value) > 1:
                    inherit = "warning"
                return value, via, defined_out, kind, inherit

    return None, None, None, "ambiguous", None


def _query_flag_at_point(
    applicable: list[str],
    flag_name: str,
    by_id: dict[str, Region],
    flag_type: str | None,
    subject_id: str,
    spatial_edges: list[dict[str, Any]],
    global_ids: set[str],
) -> tuple[Any | None, str | None, str | None, Kind, InheritType | None]:
    minimum_priority = WG_GLOBAL_PRIORITY
    ignored: set[str] = set()
    considered: list[tuple[Any, str, str | None]] = []

    sorted_ids = sorted(applicable, key=lambda rid: _wg_priority(by_id[rid]), reverse=True)

    for region_id in sorted_ids:
        region = by_id[region_id]
        priority = _wg_priority(region)
        if priority < minimum_priority:
            break
        if region_id in ignored:
            continue

        value, defined_in = _effective_flag(region_id, flag_name, by_id)
        if value is not None:
            minimum_priority = priority
            considered.append((value, region_id, defined_in))

        parent = region.parent
        while parent and parent in by_id:
            ignored.add(parent)
            parent = by_id[parent].parent

    return _resolve_values_fixed(
        considered, flag_type, subject_id, by_id, spatial_edges, global_ids,
    )


def _point_in_region(x: float, y: float, z: float, region: Region) -> bool:
    if region.type == "global":
        return True
    if not is_spatial(region):
        return False
    y_rng = _get_y_range(region)
    if y_rng is None or y < y_rng[0] or y > y_rng[1]:
        return False
    if region.type == "cuboid" and region.min and region.max:
        return (
            region.min.x <= x <= region.max.x
            and region.min.y <= y <= region.max.y
            and region.min.z <= z <= region.max.z
        )
    poly = _region_xz_polygon(region)
    if poly is None:
        return False
    try:
        pt = Point(x, z)
        return poly.contains(pt) and not poly.touches(pt)
    except GEOSException:
        return False


def _subject_xz_bounds(subject: Region, subj_poly: Polygon) -> tuple[int, int, int, int]:
    if subject.type == "cuboid" and subject.min and subject.max:
        return subject.min.x, subject.max.x, subject.min.z, subject.max.z
    b = subj_poly.bounds
    return int(b[0]), int(b[2]), int(b[1]), int(b[3])


def _xz_aabb_overlaps(
    ax0: int,
    ax1: int,
    az0: int,
    az1: int,
    bx0: int,
    bx1: int,
    bz0: int,
    bz1: int,
) -> bool:
    return ax0 <= bx1 and ax1 >= bx0 and az0 <= bz1 and az1 >= bz0


def _region_xz_polygon(region: Region) -> Polygon | None:
    raw: Polygon | None
    if region.type == "cuboid":
        raw = _cuboid_to_polygon_xz(region)
    else:
        raw = _poly_to_polygon(region)
    if raw is None or raw.is_empty:
        return None
    try:
        if not raw.is_valid:
            fixed = make_valid(raw)
            if fixed.is_empty:
                return None
            if fixed.geom_type == "Polygon":
                return fixed
            if fixed.geom_type == "MultiPolygon":
                polys = [g for g in fixed.geoms if g.geom_type == "Polygon" and g.area > 0]
                return max(polys, key=lambda p: p.area) if polys else None
            if fixed.geom_type == "GeometryCollection":
                polys = [g for g in fixed.geoms if g.geom_type == "Polygon" and g.area > 0]
                return max(polys, key=lambda p: p.area) if polys else None
            return None
        return raw
    except GEOSException:
        return None


def _axis_breaks(values: list[int]) -> list[int]:
    uniq = sorted(set(values))
    return uniq


@dataclass(frozen=True)
class _IntBox:
    x0: int
    y0: int
    z0: int
    x1: int
    y1: int
    z1: int

    def volume(self) -> int:
        dx = self.x1 - self.x0 + 1
        dy = self.y1 - self.y0 + 1
        dz = self.z1 - self.z0 + 1
        if dx <= 0 or dy <= 0 or dz <= 0:
            return 0
        return dx * dy * dz


def _subject_int_box(subject: Region, subj_poly: Polygon | None) -> _IntBox | None:
    y_rng = _get_y_range(subject)
    if y_rng is None:
        return None
    if subject.type == "cuboid" and subject.min and subject.max:
        return _IntBox(
            subject.min.x,
            y_rng[0],
            subject.min.z,
            subject.max.x,
            subject.max.y,
            subject.max.z,
        )
    if subj_poly is None:
        return None
    b = subj_poly.bounds
    return _IntBox(int(b[0]), y_rng[0], int(b[1]), int(b[2]), y_rng[1], int(b[3]))


def _xz_rect(box: _IntBox) -> Polygon:
    return shapely_box(box.x0, box.z0, box.x1, box.z1)


def _box_y_overlaps(box: _IntBox, y0: int, y1: int) -> bool:
    return box.y0 <= y1 and box.y1 >= y0


def _box_region_relation(
    box: _IntBox,
    region: Region,
    poly_cache: dict[str, Polygon | None],
) -> Literal["none", "full", "partial"]:
    if region.type == "global":
        return "full"
    if not is_spatial(region):
        return "none"
    y_rng = _get_y_range(region)
    if y_rng is None or not _box_y_overlaps(box, y_rng[0], y_rng[1]):
        return "none"
    if region.type == "cuboid" and region.min and region.max:
        if (
            region.min.x <= box.x0
            and region.max.x >= box.x1
            and region.min.y <= box.y0
            and region.max.y >= box.y1
            and region.min.z <= box.z0
            and region.max.z >= box.z1
        ):
            return "full"
        if (
            box.x1 < region.min.x
            or box.x0 > region.max.x
            or box.y1 < region.min.y
            or box.y0 > region.max.y
            or box.z1 < region.min.z
            or box.z0 > region.max.z
        ):
            return "none"
        return "partial"
    poly = poly_cache.get(region.id)
    if poly is None:
        poly = _region_xz_polygon(region)
        poly_cache[region.id] = poly
    if poly is None:
        return "none"
    rect = _xz_rect(box)
    try:
        if poly.covers(rect):
            return "full"
        if not poly.intersects(rect):
            return "none"
    except GEOSException:
        return "none"
    return "partial"


def _box_subject_relation(
    box: _IntBox,
    subject: Region,
    subj_poly: Polygon | None,
) -> Literal["none", "full", "partial"]:
    if subject.type == "global":
        return "full"
    y_rng = _get_y_range(subject)
    if y_rng is None or not _box_y_overlaps(box, y_rng[0], y_rng[1]):
        return "none"
    if subject.type == "cuboid" and subject.min and subject.max:
        if (
            subject.min.x <= box.x0
            and subject.max.x >= box.x1
            and subject.min.y <= box.y0
            and subject.max.y >= box.y1
            and subject.min.z <= box.z0
            and subject.max.z >= box.z1
        ):
            return "full"
        if (
            box.x1 < subject.min.x
            or box.x0 > subject.max.x
            or box.y1 < subject.min.y
            or box.y0 > subject.max.y
            or box.z1 < subject.min.z
            or box.z0 > subject.max.z
        ):
            return "none"
        return "partial"
    if subj_poly is None:
        return "none"
    rect = _xz_rect(box)
    try:
        if subj_poly.covers(rect):
            return "full"
        if not subj_poly.intersects(rect):
            return "none"
    except GEOSException:
        return "none"
    return "partial"


def _cuboid_split_planes(box: _IntBox, region: Region) -> list[tuple[str, int]]:
    if not (region.type == "cuboid" and region.min and region.max):
        return []
    planes: list[tuple[str, int]] = []
    for axis, lo, hi in (
        ("x", region.min.x, region.max.x + 1),
        ("y", region.min.y, region.max.y + 1),
        ("z", region.min.z, region.max.z + 1),
    ):
        for plane in (lo, hi):
            if axis == "x" and box.x0 < plane <= box.x1 and plane <= box.x1:
                planes.append((axis, plane))
            elif axis == "y" and box.y0 < plane <= box.y1 and plane <= box.y1:
                planes.append((axis, plane))
            elif axis == "z" and box.z0 < plane <= box.z1 and plane <= box.z1:
                planes.append((axis, plane))
    return planes


def _poly_split_planes(box: _IntBox, poly: Polygon) -> list[tuple[str, int]]:
    planes: list[tuple[str, int]] = []
    for x, z in poly.exterior.coords:
        xi, zi = int(round(x)), int(round(z))
        if box.x0 < xi <= box.x1:
            planes.append(("x", xi))
        if box.z0 < zi <= box.z1:
            planes.append(("z", zi))
    return planes


def _split_box(box: _IntBox, axis: str, plane: int) -> list[_IntBox]:
    if axis == "x":
        if plane <= box.x0 or plane > box.x1:
            return [box]
        left = _IntBox(box.x0, box.y0, box.z0, plane - 1, box.y1, box.z1)
        right = _IntBox(plane, box.y0, box.z0, box.x1, box.y1, box.z1)
        return [b for b in (left, right) if b.volume() > 0]
    if axis == "y":
        if plane <= box.y0 or plane > box.y1:
            return [box]
        left = _IntBox(box.x0, box.y0, box.z0, box.x1, plane - 1, box.z1)
        right = _IntBox(box.x0, plane, box.z0, box.x1, box.y1, box.z1)
        return [b for b in (left, right) if b.volume() > 0]
    if axis == "z":
        if plane <= box.z0 or plane > box.z1:
            return [box]
        left = _IntBox(box.x0, box.y0, box.z0, box.x1, box.y1, plane - 1)
        right = _IntBox(box.x0, box.y0, plane, box.x1, box.y1, box.z1)
        return [b for b in (left, right) if b.volume() > 0]
    return [box]


def _pick_split_plane(
    box: _IntBox,
    region: Region,
    subj_poly: Polygon | None,
    poly_cache: dict[str, Polygon | None],
) -> tuple[str, int] | None:
    if region.type == "cuboid" and region.min and region.max:
        planes = _cuboid_split_planes(box, region)
        if planes:
            return sorted(planes, key=lambda p: (p[0], p[1]))[0]
    poly = poly_cache.get(region.id)
    if poly is None:
        poly = _region_xz_polygon(region)
        poly_cache[region.id] = poly
    if poly is not None:
        planes = _poly_split_planes(box, poly)
        if planes:
            return sorted(planes, key=lambda p: (p[0], p[1]))[0]
    return None


def _decompose_applicable_volumes(
    subject: Region,
    candidate_ids: set[str],
    by_id: dict[str, Region],
    on_progress: Callable[[float], None] | None = None,
) -> dict[frozenset[str], int]:
    if not is_spatial(subject):
        return {}

    subj_poly = _region_xz_polygon(subject)
    root = _subject_int_box(subject, subj_poly)
    if root is None or root.volume() <= 0:
        return {}

    poly_cache: dict[str, Polygon | None] = {subject.id: subj_poly}
    stack: list[_IntBox] = [root]
    out: dict[frozenset[str], int] = {}
    ops = 0
    while stack:
        box = stack.pop()
        ops += 1
        if ops % 64 == 0:
            _yield_gil()
            if on_progress is not None:
                on_progress(min(1.0, ops / max(ops + len(stack), 1)))

        subj_rel = _box_subject_relation(box, subject, subj_poly)
        if subj_rel == "none":
            continue

        covering: set[str] = set()
        partial_candidates: list[Region] = []
        for rid in sorted(candidate_ids):
            region = by_id.get(rid)
            if region is None:
                continue
            rel = _box_region_relation(box, region, poly_cache)
            if rel == "full":
                covering.add(rid)
            elif rel == "partial":
                partial_candidates.append(region)

        if not partial_candidates and subj_rel == "partial":
            partial_candidates.append(subject)

        if not partial_candidates:
            vol = box.volume()
            if vol > 0:
                key = frozenset(covering)
                out[key] = out.get(key, 0) + vol
            continue

        plane: tuple[str, int] | None = None
        for partial in partial_candidates:
            plane = _pick_split_plane(box, partial, subj_poly, poly_cache)
            if plane is not None:
                break

        if plane is None:
            cx = (box.x0 + box.x1) / 2.0
            cy = (box.y0 + box.y1) / 2.0
            cz = (box.z0 + box.z1) / 2.0
            applicable = _applicable_at_point(cx, cy, cz, candidate_ids, by_id)
            vol = box.volume()
            if vol > 0:
                out[frozenset(applicable)] = out.get(frozenset(applicable), 0) + vol
            continue
        axis, coord = plane
        stack.extend(_split_box(box, axis, coord))

    if on_progress is not None:
        on_progress(1.0)
    return out


class _ThrottledProgress:
    def __init__(
        self,
        on_progress: ProgressCb | None,
        rows: list[dict[str, Any]],
        phase_start: float,
        phase_end: float,
    ) -> None:
        self._on_progress = on_progress
        self._rows = rows
        self._phase_start = phase_start
        self._phase_end = phase_end
        self._last = 0.0

    def report(self, frac: float) -> None:
        if self._on_progress is None:
            return
        now = time.monotonic()
        if now - self._last < _PROGRESS_INTERVAL_S and frac < 1.0:
            return
        self._last = now
        pct = self._phase_start + max(0.0, min(1.0, frac)) * (
            self._phase_end - self._phase_start
        )
        _report(self._on_progress, pct, self._rows)


def _neighbor_ids(
    region_id: str,
    spatial_edges: list[dict[str, Any]],
    global_ids: list[str],
) -> set[str]:
    ids = {region_id}
    for edge in spatial_edges:
        s = edge.get("source")
        t = edge.get("target")
        if s == region_id:
            ids.add(t)
        elif t == region_id:
            ids.add(s)
    for gid in global_ids:
        ids.add(gid)
    return ids


def _global_region_ids(regions: list[Region]) -> list[str]:
    """Only the real WorldGuard world region applies everywhere.

    Other ``type: global`` regions are hierarchy groups without own area; they
    affect regions only through the ``parent`` chain (see ``_effective_flag``).
    """
    return [r.id for r in regions if r.id == WORLD_GLOBAL_ID and r.type == "global"]


def _collect_flag_names(
    region_id: str,
    by_id: dict[str, Region],
    neighbor_ids: set[str],
) -> list[str]:
    names: set[str] = set()
    for rid in neighbor_ids | {region_id}:
        if rid not in by_id:
            continue
        r = by_id[rid]
        names.update(r.flags.keys())
        current = r.parent
        while current and current in by_id:
            names.update(by_id[current].flags.keys())
            current = by_id[current].parent
    return sorted(names)


def _decompose_volume_cells(
    subject: Region,
    candidates: list[Region],
    by_id: dict[str, Region] | None = None,
    candidate_ids: set[str] | None = None,
    on_progress: Callable[[float], None] | None = None,
) -> dict[frozenset[str], int]:
    """Partition subject volume by constant sets of covering region ids."""
    ids = candidate_ids
    if ids is None:
        ids = {c.id for c in candidates}
    lookup = by_id or {c.id: c for c in candidates}
    return _decompose_applicable_volumes(subject, ids, lookup, on_progress)


def _applicable_at_point(
    x: float,
    y: float,
    z: float,
    candidate_ids: set[str],
    by_id: dict[str, Region],
) -> list[str]:
    out: list[str] = []
    for rid in candidate_ids:
        if rid not in by_id:
            continue
        if _point_in_region(x, y, z, by_id[rid]):
            out.append(rid)
    return out


def _aggregate_volume_groups(
    groups: dict[frozenset[str], int],
    flag_name: str,
    subject_id: str,
    by_id: dict[str, Region],
    flag_type: str | None,
    spatial_edges: list[dict[str, Any]],
    global_ids: set[str],
    on_flag: Callable[[float], None] | None = None,
) -> list[CoverageRow]:
    if not groups:
        return []

    total = sum(groups.values())
    if total <= 0:
        return []

    buckets: dict[
        tuple[str, str | None, str | None, Kind, InheritType | None],
        tuple[Any, int],
    ] = {}
    keys = list(groups.items())
    for index, (applicable_fs, vol) in enumerate(keys):
        if index % 8 == 0:
            _yield_gil()
            if on_flag is not None and keys:
                on_flag(index / len(keys))
        applicable = list(applicable_fs)
        value, via, defined, kind, inherit = _query_flag_at_point(
            applicable,
            flag_name,
            by_id,
            flag_type,
            subject_id,
            spatial_edges,
            global_ids,
        )
        vkey = "__none__" if value is None else _stable_key(value)
        key = (vkey, via, defined, kind, inherit)
        prev = buckets.get(key)
        if prev:
            buckets[key] = (prev[0], prev[1] + vol)
        else:
            buckets[key] = (value, vol)

    rows: list[CoverageRow] = []
    for (_, via, defined, kind, inherit), (value, vol) in buckets.items():
        rows.append(
            CoverageRow(
                flag=flag_name,
                value=value,
                percent=100.0 * vol / total,
                via_region=via,
                defined_in=defined,
                kind=kind,
                inherit_type=inherit,
                blocks=vol,
            )
        )
    rows.sort(key=lambda r: (-r.percent, r.flag))
    return rows


def _values_equal_for_label(a: Any, b: Any) -> bool:
    return _stable_key(a) == _stable_key(b)


def _format_label_value(value: Any) -> str:
    text = str(value).lower() if isinstance(value, str) else str(value)
    return text[:28]


def _node_label(
    rows: list[CoverageRow],
    flag_name: str,
    region_id: str,
    by_id: dict[str, Region],
) -> str:
    if not rows:
        return ""
    meaningful = [r for r in rows if r.kind != "none" and r.value is not None]
    if not meaningful:
        return ""

    def caption(row: CoverageRow) -> str:
        v = row.value
        text = _format_label_value(v)
        if row.percent >= 99.95:
            return text
        pct = row.percent
        pct_text = "<1%" if pct < 1 else f"{int(round(pct))}%"
        return f"{pct_text} {text}"[:28]

    if len(meaningful) == 1:
        return caption(meaningful[0])

    eff_val, _ = _effective_flag(region_id, flag_name, by_id)
    if eff_val is not None:
        matching = [r for r in meaningful if _values_equal_for_label(r.value, eff_val)]
        if matching:
            best = max(matching, key=lambda r: r.percent)
            return caption(best)

    best = max(meaningful, key=lambda r: r.percent)
    return caption(best)


def compute_region_flag_coverage(
    region_id: str,
    regions: list[Region],
    spatial_edges: list[dict[str, Any]],
    flag_types: dict[str, str],
    on_progress: ProgressCb | None = None,
) -> list[dict[str, Any]]:
    by_id = {r.id: r for r in regions}
    subject = by_id.get(region_id)
    if subject is None:
        return []

    globals_ids = _global_region_ids(regions)
    global_set = set(globals_ids)
    neighbors = _neighbor_ids(region_id, spatial_edges, globals_ids)

    flag_names = _collect_flag_names(region_id, by_id, neighbors)
    result: list[dict[str, Any]] = []
    total_flags = len(flag_names) or 1
    if not flag_names:
        _report(on_progress, 100.0, result)
        return result

    decomp_progress = _ThrottledProgress(
        on_progress, result, 0.0, _DECOMP_PROGRESS_END,
    )

    def _on_decomp(frac: float) -> None:
        decomp_progress.report(frac)

    volume_groups = _decompose_applicable_volumes(
        subject, neighbors, by_id, on_progress=_on_decomp,
    )
    decomp_progress.report(1.0)

    flag_phase = _ThrottledProgress(
        on_progress, result, _DECOMP_PROGRESS_END, 100.0,
    )

    for index, flag_name in enumerate(flag_names):
        _yield_gil()

        def _on_flag(frac: float, flag_index: int = index) -> None:
            flag_phase.report((flag_index + frac) / total_flags)

        if flag_name in NON_SPATIAL_FLAGS:
            # passthrough follows the parent chain (like any flag) but is not
            # transferred to spatially nested / intersecting foreign regions.
            value, defined = _effective_flag(region_id, flag_name, by_id)
            if value is not None:
                vol = region_volume(subject) or sum(volume_groups.values())
                local = defined == region_id
                result.append(
                    CoverageRow(
                        flag=flag_name,
                        value=value,
                        percent=100.0,
                        via_region=region_id if local else subject.parent,
                        defined_in=defined,
                        kind="local" if local else "parent",
                        inherit_type=None if local else "inheritance",
                        blocks=vol,
                    ).to_dict()
                )
        else:
            rows = _aggregate_volume_groups(
                volume_groups,
                flag_name,
                region_id,
                by_id,
                flag_types.get(flag_name),
                spatial_edges,
                global_set,
                on_flag=_on_flag,
            )
            for row in rows:
                if row.kind == "none" or row.value is None and row.kind != "ambiguous":
                    continue  # flag not set by anyone for this part of the region
                result.append(row.to_dict())
        flag_phase.report((index + 1) / total_flags)

    _report(on_progress, 100.0, result)
    return result


def _container_index(spatial_edges: list[dict[str, Any]]) -> dict[str, set[str]]:
    """Inner region id -> ids of regions that spatially contain it."""
    out: dict[str, set[str]] = {}
    for edge in spatial_edges:
        if edge.get("relation") != "contains":
            continue
        inner = edge.get("source")
        outer = edge.get("target")
        if isinstance(inner, str) and isinstance(outer, str):
            out.setdefault(inner, set()).add(outer)
    return out


def _priority_of_winner(
    applicable: list[str],
    flag_name: str,
    by_id: dict[str, Region],
) -> int | None:
    minimum_priority = WG_GLOBAL_PRIORITY
    ignored: set[str] = set()
    found: int | None = None
    sorted_ids = sorted(applicable, key=lambda rid: _wg_priority(by_id[rid]), reverse=True)
    for region_id in sorted_ids:
        region = by_id[region_id]
        priority = _wg_priority(region)
        if priority < minimum_priority:
            break
        if region_id in ignored:
            continue
        value, _defined = _effective_flag(region_id, flag_name, by_id)
        if value is not None:
            minimum_priority = priority
            found = priority
        parent = region.parent
        while parent and parent in by_id:
            ignored.add(parent)
            parent = by_id[parent].parent
    return found


def _fast_uniform_rows(
    subject: Region,
    candidate_ids: set[str],
    flag_name: str,
    by_id: dict[str, Region],
    flag_type: str | None,
    global_ids: list[str],
    containers: dict[str, set[str]],
    spatial_edges: list[dict[str, Any]],
    extra_cover: set[str] | None = None,
) -> list[CoverageRow] | None:
    """One row when a single source covers the whole volume. None = split spatially."""
    cover: set[str] = set(global_ids)
    cover.add(subject.id)
    cover |= containers.get(subject.id, set())
    if extra_cover:
        cover |= extra_cover
        for extra_id in extra_cover:
            cover |= containers.get(extra_id, set())
    applicable = [rid for rid in cover if rid in by_id]
    value, via, defined, kind, inherit = _query_flag_at_point(
        applicable,
        flag_name,
        by_id,
        flag_type,
        subject.id,
        spatial_edges,
        set(global_ids),
    )
    winner_pri = _priority_of_winner(applicable, flag_name, by_id)
    partials = [rid for rid in candidate_ids if rid not in cover and rid in by_id]
    if value is None or winner_pri is None:
        for rid in partials:
            partial_value, _ = _effective_flag(rid, flag_name, by_id)
            if partial_value is not None:
                return None
        return []

    value_key = _stable_key(value)
    for rid in partials:
        region = by_id[rid]
        if _wg_priority(region) < winner_pri:
            continue
        partial_value, partial_defined = _effective_flag(rid, flag_name, by_id)
        if partial_value is None:
            continue
        if _wg_priority(region) > winner_pri or _stable_key(partial_value) != value_key:
            return None
        if (partial_defined or rid) != defined:
            return None
    vol = region_volume(subject) or 0
    return [
        CoverageRow(
            flag=flag_name,
            value=value,
            percent=100.0,
            via_region=via,
            defined_in=defined,
            kind=kind,
            inherit_type=inherit,
            blocks=vol,
        )
    ]


def compute_flag_scheme_coverage(
    flag_name: str,
    regions: list[Region],
    spatial_edges: list[dict[str, Any]],
    flag_types: dict[str, str],
) -> dict[str, Any]:
    by_id = {r.id: r for r in regions}
    globals_ids = _global_region_ids(regions)
    containers = _container_index(spatial_edges)
    flag_type = flag_types.get(flag_name)

    region_coverage: dict[str, Any] = {}
    for region in regions:
        _yield_gil()
        if not is_spatial(region):
            continue
        if flag_name in NON_SPATIAL_FLAGS:
            value, defined = _effective_flag(region.id, flag_name, by_id)
            if value is None:
                _yield_gil()
                continue
            local = defined == region.id
            label = str(value).lower() if isinstance(value, str) else str(value)
            vol = region_volume(region) or 0
            region_coverage[region.id] = FlagRegionCoverage(
                region_id=region.id,
                total_volume=vol,
                groups=[
                    CoverageRow(
                        flag=flag_name,
                        value=value,
                        percent=100.0,
                        via_region=region.id if local else region.parent,
                        defined_in=defined,
                        kind="local" if local else "parent",
                        inherit_type=None if local else "inheritance",
                        blocks=vol,
                    )
                ],
                label=label[:28],
            ).to_dict()
            _yield_gil()
            continue

        neighbors = _neighbor_ids(region.id, spatial_edges, globals_ids)
        fast_rows = _fast_uniform_rows(
            region,
            neighbors,
            flag_name,
            by_id,
            flag_type,
            globals_ids,
            containers,
            spatial_edges,
        )
        if fast_rows is not None:
            rows = fast_rows
            decomp_vol = 0
        else:
            groups = _decompose_applicable_volumes(region, neighbors, by_id)
            decomp_vol = sum(groups.values())
            rows = _aggregate_volume_groups(
                groups,
                flag_name,
                region.id,
                by_id,
                flag_type,
                spatial_edges,
                set(globals_ids),
            )
        label = _node_label(rows, flag_name, region.id, by_id)
        if not label:
            continue
        region_coverage[region.id] = FlagRegionCoverage(
            region_id=region.id,
            total_volume=region_volume(region) or decomp_vol,
            groups=rows,
            label=label,
        ).to_dict()

    intersects: list[dict[str, Any]] = []
    if flag_name not in NON_SPATIAL_FLAGS:
        seen: set[tuple[str, str]] = set()
        for edge in spatial_edges:
            _yield_gil()
            if edge.get("relation") != "intersects":
                continue
            a_id = edge["source"]
            b_id = edge["target"]
            key = tuple(sorted((a_id, b_id)))
            if key in seen:
                continue
            seen.add(key)
            a = by_id.get(a_id)
            b = by_id.get(b_id)
            if not a or not b or not is_spatial(a) or not is_spatial(b):
                continue
            ca = _build_cache(a)
            cb = _build_cache(b)
            if ca is None or cb is None:
                continue
            ok, inter_vol = _cached_intersect_volume(ca, cb)
            if not ok:
                continue
            a_total = region_volume(a) or 1
            b_total = region_volume(b) or 1
            a_pct = 100.0 * inter_vol / a_total
            b_pct = 100.0 * inter_vol / b_total
            neighbor_union = _neighbor_ids(a_id, spatial_edges, globals_ids) | _neighbor_ids(
                b_id, spatial_edges, globals_ids,
            )
            fast_rows = _fast_uniform_rows(
                a,
                neighbor_union,
                flag_name,
                by_id,
                flag_type,
                globals_ids,
                containers,
                spatial_edges,
                extra_cover={a_id, b_id},
            )
            if fast_rows is not None:
                rows = fast_rows
            else:
                overlap_groups = _intersection_volume_groups(
                    a, b, regions, spatial_edges, globals_ids, by_id,
                )
                rows = _aggregate_volume_groups(
                    overlap_groups,
                    flag_name,
                    a.id,
                    by_id,
                    flag_type,
                    spatial_edges,
                    set(globals_ids),
                )
            meaningful = [r for r in rows if r.value is not None and r.kind != "none"]
            if not meaningful:
                continue
            label, ambiguous = _intersect_label(rows)
            intersects.append(
                IntersectCoverage(
                    a_id=a_id,
                    b_id=b_id,
                    label=label,
                    ambiguous=ambiguous,
                    groups=rows,
                    a_percent=a_pct,
                    b_percent=b_pct,
                ).to_dict()
            )

    return {"flag": flag_name, "regions": region_coverage, "intersects": intersects}


def _intersect_label(rows: list[CoverageRow]) -> tuple[str, bool]:
    meaningful = [r for r in rows if r.value is not None and r.kind != "none"]
    if not meaningful:
        return "undefined", True
    if len(meaningful) == 1 and meaningful[0].percent >= 99.5:
        v = meaningful[0].value
        text = str(v).lower() if isinstance(v, str) else str(v)
        return text[:24], False
    if len(meaningful) > 1:
        return f"mixed:{len(meaningful)}", True
    return "undefined", True


def _intersection_volume_groups(
    a: Region,
    b: Region,
    regions: list[Region],
    spatial_edges: list[dict[str, Any]],
    global_ids: list[str],
    by_id: dict[str, Region],
) -> dict[frozenset[str], int]:
    """Partition A ∩ B by constant sets of covering region ids."""
    ya = _get_y_range(a)
    yb = _get_y_range(b)
    if ya is None or yb is None:
        return {}
    y0 = max(ya[0], yb[0])
    y1 = min(ya[1], yb[1])
    if y1 < y0:
        return {}

    if a.type == "cuboid" and b.type == "cuboid" and a.min and a.max and b.min and b.max:
        x0 = max(a.min.x, b.min.x)
        x1 = min(a.max.x, b.max.x)
        z0 = max(a.min.z, b.min.z)
        z1 = min(a.max.z, b.max.z)
        if x1 < x0 or y1 < y0 or z1 < z0:
            return {}
        stub = Region(
            id="__overlap__",
            type="cuboid",
            parent=None,
            priority=0,
            min=Vec3(x=x0, y=y0, z=z0),
            max=Vec3(x=x1, y=y1, z=z1),
        )
        neighbors: set[str] = set()
        for rid in (a.id, b.id):
            neighbors |= _neighbor_ids(rid, spatial_edges, global_ids)
        return _decompose_applicable_volumes(stub, neighbors, by_id)

    pa = _region_xz_polygon(a)
    pb = _region_xz_polygon(b)
    if pa is None or pb is None:
        return {}
    try:
        inter = pa.intersection(pb)
    except GEOSException:
        return {}
    if inter.is_empty or inter.area <= 0:
        return {}

    polys: list[Polygon] = []
    if inter.geom_type == "Polygon":
        polys = [inter]
    elif inter.geom_type == "MultiPolygon":
        polys = [g for g in inter.geoms if g.geom_type == "Polygon" and g.area > 0]
    elif inter.geom_type == "GeometryCollection":
        polys = [g for g in inter.geoms if g.geom_type == "Polygon" and g.area > 0]
    if not polys:
        return {}

    neighbors = set()
    for rid in (a.id, b.id):
        neighbors |= _neighbor_ids(rid, spatial_edges, global_ids)

    groups: dict[frozenset[str], int] = {}
    for poly in polys:
        coords = list(poly.exterior.coords)
        if len(coords) < 4:
            continue
        points = [Vec2(x=int(round(x)), z=int(round(z))) for x, z in coords[:-1]]
        if len(points) < 3:
            continue
        stub = Region(
            id="__overlap__",
            type="poly2d",
            parent=None,
            priority=0,
            min_y=y0,
            max_y=y1,
            points=points,
        )
        part = _decompose_applicable_volumes(stub, neighbors, by_id)
        for key, vol in part.items():
            groups[key] = groups.get(key, 0) + vol
    return groups
