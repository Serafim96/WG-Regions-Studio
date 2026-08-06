"""Windows Explorer–style natural sort for region ids (…_19 before …_189)."""

from __future__ import annotations

import re

_NAT_SPLIT = re.compile(r"(\d+)")


def natural_key(value: str) -> list[str | int]:
    parts: list[str | int] = []
    for token in _NAT_SPLIT.split(value):
        if not token:
            continue
        if token.isdigit():
            parts.append(int(token))
        else:
            parts.append(token.casefold())
    return parts


def natural_sort_strings(values: list[str]) -> list[str]:
    return sorted(values, key=natural_key)
