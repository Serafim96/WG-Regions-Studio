"""In-memory session store for the loaded YAML/scheme state."""

from __future__ import annotations

from typing import Any


class SessionStore:
    """Holds the mutable per-process session (YAML content, regions, scheme)."""

    __slots__ = ("_data",)

    def __init__(self) -> None:
        self._data: dict[str, Any] = {
            "yaml_content": "",
            "source_path": "",
            "regions": [],
            "scheme": None,
        }

    def clear(self) -> None:
        self._data["yaml_content"] = ""
        self._data["source_path"] = ""
        self._data["regions"] = []
        self._data["scheme"] = None

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self._data[key] = value

    def as_dict(self) -> dict[str, Any]:
        """Mutable dict view used by tests that patch session keys directly."""
        return self._data


# Module singleton — also exposed as ``main._session`` (dict alias).
session_store = SessionStore()
