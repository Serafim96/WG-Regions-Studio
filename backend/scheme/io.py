"""Save and load .mrv.json scheme files."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.geometry.intersections import SpatialEdge
from backend.layout.hierarchical import compute_layout
from backend.metrics.compute import compute_metrics
from backend.models.region import Region
from backend.tree.builder import Forest, build_forest

SCHEMA_VERSION = 1


def source_hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]


def build_scheme(
    regions: list[Region],
    spatial_edges: list[SpatialEdge],
    yaml_content: str,
    source_path: str = "",
) -> dict[str, Any]:
    forest = build_forest(regions)
    layout = compute_layout(forest)
    metrics = compute_metrics(regions, spatial_edges)

    hierarchy_edges = [
        {"source": r.parent, "target": r.id, "relation": "parent"}
        for r in regions
        if r.parent
    ]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "sourceHash": source_hash(yaml_content),
        "sourcePath": source_path,
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "regions": [r.to_dict() for r in regions],
        "forest": forest.to_dict(),
        "hierarchyEdges": hierarchy_edges,
        "spatialEdges": [
            {
                "source": e.source,
                "target": e.target,
                "relation": e.relation,
                **(
                    {
                        "overlapBlocks": (
                            e.overlap_blocks if e.overlap_blocks is not None else 0
                        )
                    }
                    if e.relation == "intersects"
                    else {}
                ),
            }
            for e in spatial_edges
        ],
        "layout": layout,
        "metrics": metrics,
    }


def scheme_to_json(scheme: dict[str, Any]) -> str:
    return json.dumps(scheme, ensure_ascii=False, indent=2)


def save_scheme(scheme: dict[str, Any], path: Path | str) -> None:
    Path(path).write_text(scheme_to_json(scheme), encoding="utf-8")


def load_scheme(path: Path | str) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported schema version: {data.get('schemaVersion')}")
    return data


def regions_from_scheme(scheme: dict[str, Any]) -> list[Region]:
    return [Region.from_dict(r) for r in scheme["regions"]]
