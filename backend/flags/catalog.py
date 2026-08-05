"""Parse all_flags.txt into a flag catalog; merge jar extras and user customs."""

from __future__ import annotations

import json
import re
import zipfile
from dataclasses import dataclass
from pathlib import Path

CUSTOM_FLAG_TYPES = (
    "state",
    "boolean",
    "string",
    "integer",
    "double",
    "location",
    "gamemode",
    "weather",
    "set of strings",
    "set of entity types",
)

# Flags present in WorldGuard 7.0.11+ Flags.class but not yet in the docs dump
# (all_flags.txt / enginehub flag listing). Kept as a fallback when the jar is absent.
_JAR_EXTRA_FALLBACK: list[tuple[str, str, str]] = [
    (
        "wind-charge-burst",
        "state",
        "Whether player wind charges can burst (interaction/knockback).",
    ),
    (
        "breeze-charge-explosion",
        "state",
        "Whether breeze wind charges can explode.",
    ),
    (
        "moisture-change",
        "state",
        "Whether farmland moisture level can change.",
    ),
]


@dataclass
class FlagInfo:
    name: str
    flag_type: str
    description: str
    builtin: bool = True

    def to_dict(self) -> dict[str, str | bool]:
        return {
            "name": self.name,
            "type": self.flag_type,
            "description": self.description,
            "builtin": self.builtin,
        }


def parse_flags_file(path: Path | str) -> list[FlagInfo]:
    """Parse tab-separated all_flags.txt with multiline quoted descriptions."""
    text = Path(path).read_text(encoding="utf-8")
    flags: list[FlagInfo] = []
    i = 0
    lines = text.splitlines()

    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue

        parts = line.split("\t", 2)
        if len(parts) < 2:
            i += 1
            continue

        name, flag_type = parts[0].strip(), parts[1].strip()
        # Section headers have an empty type (e.g. "Protection-Related", "Movement").
        if not name or not flag_type or name.endswith("-Related"):
            i += 1
            continue

        description = ""
        if len(parts) == 3:
            desc_part = parts[2]
            if desc_part.startswith('"'):
                # Same-line quoted description: "...."
                if len(desc_part) > 1 and desc_part.endswith('"'):
                    description = desc_part[1:-1].replace('""', '"')
                else:
                    # Multiline: keep reading until a line that ends with closing quote.
                    desc_lines = [desc_part]
                    while True:
                        i += 1
                        if i >= len(lines):
                            break
                        desc_lines.append(lines[i])
                        if lines[i].endswith('"'):
                            break
                    full = "\n".join(desc_lines)
                    if full.startswith('"') and full.endswith('"'):
                        full = full[1:-1]
                    description = full.replace('""', '"')
            else:
                description = desc_part

        flags.append(
            FlagInfo(name=name, flag_type=flag_type, description=description, builtin=True)
        )
        i += 1

    return flags


def extract_flag_names_from_jar(jar_path: Path | str) -> set[str]:
    """Best-effort extraction of flag name strings from WorldGuard Flags.class."""
    path = Path(jar_path)
    if not path.is_file():
        return set()
    try:
        with zipfile.ZipFile(path) as zf:
            data = zf.read("com/sk89q/worldguard/protection/flags/Flags.class")
    except (KeyError, OSError, zipfile.BadZipFile):
        return set()

    noise = {
        "this",
        "register",
        "flag",
        "add",
        "cfg",
        "accept",
        "replace",
        "iterator",
        "next",
        "lizer",
        "append",
        "serialize",
        "metafactory",
    }
    names: set[str] = set()
    for match in re.findall(rb"[\x20-\x7e]{3,80}", data):
        text = match.decode("ascii")
        if text in noise:
            continue
        if re.fullmatch(r"[a-z][a-z0-9\-]{1,40}", text):
            names.add(text)
    return names


def load_builtin_flags(
    path: Path | str,
    jar_path: Path | str | None = None,
) -> list[FlagInfo]:
    """Load immutable standard flags from docs dump (+ optional jar extras)."""
    flags = parse_flags_file(path)
    by_name = {f.name: f for f in flags}

    jar_names = extract_flag_names_from_jar(jar_path) if jar_path else set()
    extras: list[tuple[str, str, str]] = list(_JAR_EXTRA_FALLBACK)
    fallback_names = {n for n, _, _ in extras}
    for name in sorted(jar_names):
        if name not in by_name and name not in fallback_names:
            extras.append((name, "state", ""))

    for name, flag_type, description in extras:
        if name not in by_name:
            info = FlagInfo(
                name=name,
                flag_type=flag_type,
                description=description,
                builtin=True,
            )
            flags.append(info)
            by_name[name] = info

    return flags


def load_custom_flags(path: Path | str) -> list[FlagInfo]:
    """Load user-added catalog entries from JSON."""
    file_path = Path(path)
    if not file_path.is_file():
        return []
    try:
        raw = json.loads(file_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, list):
        return []
    flags: list[FlagInfo] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).strip()
        flag_type = str(item.get("type", "")).strip() or "string"
        description = str(item.get("description", "")).strip()
        if not name:
            continue
        flags.append(
            FlagInfo(
                name=name,
                flag_type=flag_type,
                description=description,
                builtin=False,
            )
        )
    return flags


def save_custom_flags(path: Path | str, flags: list[FlagInfo]) -> None:
    file_path = Path(path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    payload = [
        {
            "name": f.name,
            "type": f.flag_type,
            "description": f.description,
        }
        for f in flags
        if not f.builtin
    ]
    file_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _validate_custom_flag(
    *,
    name: str,
    flag_type: str,
    description: str,
    builtin_names: set[str],
    existing_names: set[str],
) -> FlagInfo:
    cleaned = name.strip()
    cleaned_type = flag_type.strip() or "string"
    if not cleaned:
        raise ValueError("Flag name is required")
    if cleaned in builtin_names:
        raise ValueError(f"Standard flag «{cleaned}» cannot be modified")
    if cleaned in existing_names:
        raise ValueError(f"Custom flag «{cleaned}» already exists")
    if cleaned_type not in CUSTOM_FLAG_TYPES:
        raise ValueError(f"Unsupported flag type «{cleaned_type}»")
    return FlagInfo(
        name=cleaned,
        flag_type=cleaned_type,
        description=description.strip(),
        builtin=False,
    )


def load_flags_catalog(
    path: Path | str,
    jar_path: Path | str | None = None,
    custom_path: Path | str | None = None,
) -> list[FlagInfo]:
    """Merged catalog: builtin first (docs order + jar), then custom (A–Z)."""
    flags = load_builtin_flags(path, jar_path=jar_path)
    by_name = {f.name: f for f in flags}
    if custom_path:
        for custom in load_custom_flags(custom_path):
            if custom.name in by_name:
                # Never override a standard flag.
                continue
            flags.append(custom)
            by_name[custom.name] = custom
    # Keep builtins in source order; sort only the custom tail for stable UX.
    builtins = [f for f in flags if f.builtin]
    customs = sorted([f for f in flags if not f.builtin], key=lambda f: f.name)
    return builtins + customs


def add_custom_flag(
    custom_path: Path | str,
    *,
    name: str,
    flag_type: str,
    description: str,
    builtin_names: set[str],
) -> FlagInfo:
    existing = load_custom_flags(custom_path)
    info = _validate_custom_flag(
        name=name,
        flag_type=flag_type,
        description=description,
        builtin_names=builtin_names,
        existing_names={f.name for f in existing},
    )
    existing.append(info)
    existing.sort(key=lambda f: f.name)
    save_custom_flags(custom_path, existing)
    return info


def delete_custom_flag(
    custom_path: Path | str,
    name: str,
    builtin_names: set[str],
) -> None:
    cleaned = name.strip()
    if cleaned in builtin_names:
        raise ValueError(f"Standard flag «{cleaned}» cannot be deleted")
    existing = load_custom_flags(custom_path)
    next_flags = [f for f in existing if f.name != cleaned]
    if len(next_flags) == len(existing):
        raise KeyError(f"Custom flag «{cleaned}» not found")
    save_custom_flags(custom_path, next_flags)


def replace_custom_flags(
    custom_path: Path | str,
    items: list[dict[str, object]],
    builtin_names: set[str],
) -> list[FlagInfo]:
    """Validate and replace the complete user custom flag catalog."""
    flags: list[FlagInfo] = []
    names: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Every custom flag must be an object")
        info = _validate_custom_flag(
            name=str(item.get("name", "")),
            flag_type=str(item.get("type", "string")),
            description=str(item.get("description", "")),
            builtin_names=builtin_names,
            existing_names=names,
        )
        flags.append(info)
        names.add(info.name)
    flags.sort(key=lambda f: f.name)
    save_custom_flags(custom_path, flags)
    return flags


def delete_all_custom_flags(path: Path | str) -> list[str]:
    """Clear custom catalog entries and return the deleted names."""
    existing = load_custom_flags(path)
    save_custom_flags(path, [])
    return [f.name for f in existing]


# Backwards-compatible alias used by older imports/tests.
def load_flags_catalog_sorted(
    path: Path | str,
    jar_path: Path | str | None = None,
) -> list[FlagInfo]:
    return sorted(load_builtin_flags(path, jar_path=jar_path), key=lambda f: f.name)
