"""Compute region metrics for the metrics panel."""

from __future__ import annotations

from collections import Counter

from backend.geometry.intersections import region_volume
from backend.models.region import Region
from backend.geometry.intersections import SpatialEdge


def compute_metrics(regions: list[Region], spatial_edges: list[SpatialEdge]) -> dict:
    type_counts = Counter(r.type for r in regions)

    intersection_counts: Counter[str] = Counter()
    for edge in spatial_edges:
        if edge.relation == "intersects":
            intersection_counts[edge.source] += 1
            intersection_counts[edge.target] += 1

    by_volume: list[dict] = []
    for region in regions:
        vol = region_volume(region)
        by_volume.append(
            {
                "id": region.id,
                "type": region.type,
                "volume": vol,
            }
        )
    by_volume.sort(key=lambda x: (x["volume"] is None, -(x["volume"] or 0)))

    by_points: list[dict] = []
    for region in regions:
        if region.type == "poly2d" and region.points:
            by_points.append({"id": region.id, "points": len(region.points)})
    by_points.sort(key=lambda x: -x["points"])

    by_intersections: list[dict] = [
        {"id": rid, "count": intersection_counts.get(rid, 0)} for rid in sorted(intersection_counts)
    ]
    by_intersections.sort(key=lambda x: -x["count"])

    return {
        "total": len(regions),
        "by_type": dict(type_counts),
        "by_volume": by_volume,
        "by_points": by_points,
        "by_intersections": by_intersections,
    }
