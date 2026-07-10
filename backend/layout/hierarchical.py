"""Hierarchical tree layout for graph nodes."""

from __future__ import annotations

from backend.tree.builder import Forest, TreeNode

H_SPACING = 180
V_SPACING = 120


def _layout_subtree(node: TreeNode, x: float, y: float, positions: dict[str, dict[str, float]]) -> float:
    """Place node and children; return total width used."""
    if not node.children:
        positions[node.id] = {"x": x, "y": y}
        return 1.0

    child_widths: list[float] = []
    child_x = x
    for child in node.children:
        w = _layout_subtree(child, child_x, y + V_SPACING, positions)
        child_widths.append(w)
        child_x += w * H_SPACING

    total_w = sum(child_widths) if child_widths else 1.0
    center_x = x + (total_w * H_SPACING - H_SPACING) / 2
    positions[node.id] = {"x": center_x, "y": y}
    return total_w


def compute_layout(forest: Forest) -> dict[str, dict[str, float]]:
    """Assign x/y positions for all nodes in the forest."""
    positions: dict[str, dict[str, float]] = {}
    x_offset = 0.0
    for root in forest.roots:
        w = _layout_subtree(root, x_offset, 0.0, positions)
        x_offset += w * H_SPACING + H_SPACING
    return positions
