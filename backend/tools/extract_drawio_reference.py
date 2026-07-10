"""One-time extractor: draw.io mxGraph → reference_spatial_edges.json."""

from __future__ import annotations

import html
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path

REGION_LABEL_RE = re.compile(r"(\d+);\s*([a-zA-Z0-9_-]+)")


def _clean_label(value: str) -> str:
    text = html.unescape(value)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def _extract_region_name(value: str) -> str | None:
    cleaned = _clean_label(value)
    match = REGION_LABEL_RE.search(cleaned)
    if match:
        return match.group(2)
    return None


def _parse_style(style: str) -> dict[str, str]:
    result: dict[str, str] = {}
    for part in style.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            result[k] = v
    return result


def extract_spatial_edges(drawio_path: Path) -> dict:
    tree = ET.parse(drawio_path)
    root = tree.getroot()

    id_to_region: dict[str, str] = {}
    intersects: list[list[str]] = []
    contains: list[list[str]] = []
    skipped_legend = 0

    for cell in root.iter("mxCell"):
        cell_id = cell.get("id", "")
        value = cell.get("value", "") or ""

        if cell.get("vertex") == "1" and value:
            name = _extract_region_name(value)
            if name:
                id_to_region[cell_id] = name

        if cell.get("edge") != "1":
            continue

        style = _parse_style(cell.get("style", ""))
        if style.get("locked") == "1":
            skipped_legend += 1
            continue

        source_id = cell.get("source")
        target_id = cell.get("target")
        if not source_id or not target_id:
            continue

        source_name = id_to_region.get(source_id)
        target_name = id_to_region.get(target_id)
        if not source_name or not target_name:
            continue

        if style.get("endArrow") == "doubleBlock":
            contains.append([source_name, target_name])
        elif style.get("dashed") == "1" and style.get("endArrow") in (None, "none"):
            a, b = sorted([source_name, target_name])
            pair = [a, b]
            if pair not in intersects:
                intersects.append(pair)

    return {
        "schemaVersion": 1,
        "source": drawio_path.name,
        "extractedAt": date.today().isoformat(),
        "disclaimer": "Неполный ручной эталон; пропуски ожидаемы",
        "intersects": intersects,
        "contains": contains,
        "stats": {
            "intersects": len(intersects),
            "contains": len(contains),
            "skippedLegendEdges": skipped_legend,
        },
    }


def validate_against_regions(
    data: dict, regions_yml: Path
) -> dict:
    """Split extracted pairs into confirmed, stale names, and geometry false positives."""
    import sys

    project_root = Path(__file__).resolve().parents[2]
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    from backend.geometry.intersections import regions_intersect
    from backend.parser.wg_parser import parse_regions_yaml

    content = regions_yml.read_text(encoding="utf-8")
    by_id = {r.id: r for r in parse_regions_yaml(content)}

    confirmed: list[list[str]] = []
    stale_pairs: list[list[str]] = []
    false_positives: list[list[str]] = []

    for pair in data.get("intersects", []):
        a, b = pair
        if a not in by_id or b not in by_id:
            stale_pairs.append(pair)
            continue
        if regions_intersect(by_id[a], by_id[b]):
            confirmed.append(pair)
        else:
            false_positives.append(pair)

    data["intersects"] = confirmed
    data["excluded"] = {
        "staleRegionPairs": stale_pairs,
        "geometryFalsePositives": false_positives,
    }
    data["stats"]["intersectsConfirmed"] = len(confirmed)
    data["stats"]["staleRegionPairs"] = len(stale_pairs)
    data["stats"]["geometryFalsePositives"] = len(false_positives)
    return data


def main() -> None:
    project_root = Path(__file__).resolve().parents[2]
    drawio = project_root / "Приватные регионы иерархия"
    regions_yml = project_root / "regions.yml"
    out = project_root / "data" / "reference_spatial_edges.json"

    if not drawio.exists():
        print(f"Draw.io file not found: {drawio}", file=sys.stderr)
        sys.exit(1)

    out.parent.mkdir(parents=True, exist_ok=True)
    data = extract_spatial_edges(drawio)
    if regions_yml.exists():
        data = validate_against_regions(data, regions_yml)
    out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out} — {data['stats']}")


if __name__ == "__main__":
    main()
