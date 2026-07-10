"""Build hierarchical forest from region parent links."""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.models.region import Region


@dataclass
class TreeNode:
    id: str
    region: Region
    depth: int
    children: list[TreeNode] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "depth": self.depth,
            "children": [c.to_dict() for c in self.children],
        }


@dataclass
class Forest:
    roots: list[TreeNode]
    by_id: dict[str, TreeNode]

    def to_dict(self) -> dict:
        return {
            "roots": [r.to_dict() for r in self.roots],
        }


def build_forest(regions: list[Region]) -> Forest:
    """Build a forest of TreeNodes from flat region list."""
    by_region = {r.id: r for r in regions}
    children_map: dict[str, list[str]] = {r.id: [] for r in regions}

    for region in regions:
        if region.parent:
            children_map[region.parent].append(region.id)

    for child_ids in children_map.values():
        child_ids.sort()

    memo: dict[str, TreeNode] = {}

    def make_node(region_id: str, depth: int) -> TreeNode:
        if region_id in memo:
            return memo[region_id]
        region = by_region[region_id]
        node = TreeNode(
            id=region_id,
            region=region,
            depth=depth,
            children=[make_node(cid, depth + 1) for cid in children_map[region_id]],
        )
        memo[region_id] = node
        return node

    roots = [make_node(r.id, 0) for r in regions if not r.parent]
    roots.sort(key=lambda n: n.id)

    return Forest(roots=roots, by_id=memo)


def get_ancestor_chain(node_id: str, regions_by_id: dict[str, Region]) -> list[str]:
    """Return [node, parent, grandparent, ...] up to root."""
    chain = [node_id]
    current = regions_by_id.get(node_id)
    while current and current.parent:
        chain.append(current.parent)
        current = regions_by_id.get(current.parent)
    return chain
