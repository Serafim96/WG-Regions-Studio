"""Update docs/dev/REFERENCE_DIFF.md with algorithm-only spatial pairs."""

from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> int:
    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from backend.geometry.intersections import compute_spatial_edges
    from backend.parser.wg_parser import parse_regions_yaml

    regions_yml = project_root / "regions.yml"
    reference_json = project_root / "data" / "reference_spatial_edges.json"
    diff_md = project_root / "docs" / "dev" / "REFERENCE_DIFF.md"

    content = regions_yml.read_text(encoding="utf-8")
    regions = parse_regions_yaml(content)
    computed = compute_spatial_edges(regions)

    ref = json.loads(reference_json.read_text(encoding="utf-8"))
    ref_intersects = {tuple(sorted(p)) for p in ref.get("intersects", [])}
    ref_contains = {tuple(p) for p in ref.get("contains", [])}

    lines = [
        "| region_a | region_b | тип | в эталоне | в алгоритме | примечание |",
        "|----------|----------|-----|-----------|-------------|------------|",
    ]

    for pair in ref.get("excluded", {}).get("geometryFalsePositives", []):
        a, b = pair
        lines.append(f"| {a} | {b} | intersect | да (draw.io) | нет | geometry false positive |")

    for edge in computed:
        if edge.relation == "intersects":
            key = tuple(sorted((edge.source, edge.target)))
            if key not in ref_intersects:
                a, b = key
                lines.append(f"| {a} | {b} | intersect | нет | да | ожидаемо — пропуск в draw.io |")
        else:
            key = (edge.source, edge.target)
            if key not in ref_contains:
                lines.append(
                    f"| {edge.source} | {edge.target} | contains | нет | да | ожидаемо — пропуск в draw.io |"
                )

    diff_md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    algo_only = sum(1 for line in lines if "пропуск в draw.io" in line)
    print(f"Wrote {diff_md} — {algo_only} algorithm-only pairs")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
