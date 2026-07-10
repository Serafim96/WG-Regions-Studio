"""Parse all_flags.txt into a flag catalog."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass
class FlagInfo:
    name: str
    flag_type: str
    description: str

    def to_dict(self) -> dict[str, str]:
        return {
            "name": self.name,
            "type": self.flag_type,
            "description": self.description,
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
        if not name or name.endswith("-Related"):
            i += 1
            continue

        description = ""
        if len(parts) == 3:
            desc_part = parts[2]
            if desc_part.startswith('"'):
                desc_lines = [desc_part]
                while not desc_lines[-1].endswith('"') or desc_lines[-1].count('"') < 2:
                    i += 1
                    if i >= len(lines):
                        break
                    desc_lines.append(lines[i])
                full = "\n".join(desc_lines)
                description = full.strip('"').replace('""', '"')
            else:
                description = desc_part

        flags.append(FlagInfo(name=name, flag_type=flag_type, description=description))
        i += 1

    return flags
