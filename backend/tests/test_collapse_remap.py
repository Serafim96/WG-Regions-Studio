"""Tests for collapse edge remapping logic (frontend mirror)."""

from backend.geometry.intersections import SpatialEdge


EDGE_STRENGTH = {"contains": 2, "intersects": 1}


def remap_spatial_edges(
    edges: list[SpatialEdge],
    hidden: set[str],
    visible_ancestor: dict[str, str],
) -> list[SpatialEdge]:
    """When nodes are hidden, remap edges to nearest visible ancestors."""
    result: dict[tuple[str, str, str], SpatialEdge] = {}

    for edge in edges:
        src = visible_ancestor.get(edge.source, edge.source)
        tgt = visible_ancestor.get(edge.target, edge.target)
        if src in hidden or tgt in hidden or src == tgt:
            continue

        if edge.relation == "contains":
            key = (edge.source, edge.target, "contains")
            out = SpatialEdge(source=edge.source, target=edge.target, relation="contains")
            # remap directionally
            out_src = visible_ancestor.get(edge.source, edge.source)
            out_tgt = visible_ancestor.get(edge.target, edge.target)
            out = SpatialEdge(source=out_src, target=out_tgt, relation="contains")
            k = (out.source, out.target, out.relation)
        else:
            a, b = sorted((src, tgt))
            out = SpatialEdge(source=a, target=b, relation="intersects")
            k = (out.source, out.target, out.relation)

        existing = result.get(k)
        if existing:
            if EDGE_STRENGTH[out.relation] > EDGE_STRENGTH[existing.relation]:
                result[k] = out
        else:
            result[k] = out

    return list(result.values())


def test_remap_child_intersection_to_parent():
    edges = [SpatialEdge("child_a", "other", "intersects")]
    hidden = {"child_a"}
    ancestors = {"child_a": "parent"}
    remapped = remap_spatial_edges(edges, hidden, ancestors)
    assert len(remapped) == 1
    assert remapped[0].source == "other" or remapped[0].target == "other"
    pair = {remapped[0].source, remapped[0].target}
    assert pair == {"parent", "other"}
