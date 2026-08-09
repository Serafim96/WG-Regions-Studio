"""Deterministic synthetic WorldGuard-like region datasets for benchmarks/stress tests."""

from __future__ import annotations

from backend.models.region import Region, Vec3


def make_synthetic_regions(count: int = 1500, seed_spacing: int = 16) -> list[Region]:
    """Build ~count cuboids on a grid with controlled overlaps + light hierarchy.

    Layout: ceil(sqrt(count-1)) grid of cuboids sized 20×256×20, stepped by
    ``seed_spacing`` (default 16 → AABB overlap on XZ). Every 10th region
    parents the previous sibling for hierarchy edges / flag inheritance.
    """
    if count < 2:
        raise ValueError("count must be >= 2 (global + at least one cuboid)")

    regions: list[Region] = [
        Region(id="__global__", type="global", parent=None, priority=0),
    ]
    cuboid_n = count - 1
    cols = int(cuboid_n**0.5 + 0.999)
    size = 20

    for i in range(cuboid_n):
        row, col = divmod(i, cols)
        x0 = col * seed_spacing
        z0 = row * seed_spacing
        rid = f"syn_{i:04d}"
        parent = None
        if i > 0 and i % 10 == 0:
            parent = f"syn_{i - 1:04d}"
        flags: dict = {}
        if i % 7 == 0:
            flags["pvp"] = "deny" if i % 14 == 0 else "allow"
        if i % 11 == 0:
            flags["build"] = "deny"
        if i % 13 == 0:
            flags["greeting"] = f"hello-{i}"
        regions.append(
            Region(
                id=rid,
                type="cuboid",
                parent=parent,
                priority=i % 5,
                flags=flags,
                min=Vec3(x=x0, y=0, z=z0),
                max=Vec3(x=x0 + size - 1, y=255, z=z0 + size - 1),
            )
        )
    return regions


def synthetic_regions_yaml(count: int = 1500) -> str:
    """Minimal YAML text matching parse_regions_yaml expectations."""
    regions = make_synthetic_regions(count)
    lines = ["regions:"]
    for r in regions:
        lines.append(f"  {r.id}:")
        lines.append(f"    type: {r.type}")
        lines.append(f"    priority: {r.priority}")
        if r.parent:
            lines.append(f"    parent: {r.parent}")
        if r.flags:
            lines.append("    flags:")
            for k, v in r.flags.items():
                lines.append(f"      {k}: {v}")
        if r.min and r.max:
            lines.append(
                f"    min: {{x: {r.min.x}, y: {r.min.y}, z: {r.min.z}}}"
            )
            lines.append(
                f"    max: {{x: {r.max.x}, y: {r.max.y}, z: {r.max.z}}}"
            )
    return "\n".join(lines) + "\n"
