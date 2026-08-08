"""Dataclasses for WorldGuard region data."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional


@dataclass
class Vec3:
    x: int
    y: int
    z: int

    def to_dict(self) -> dict[str, int]:
        return {"x": self.x, "y": self.y, "z": self.z}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Vec3:
        return cls(x=int(data["x"]), y=int(data["y"]), z=int(data["z"]))


@dataclass
class Vec2:
    x: int
    z: int

    def to_dict(self) -> dict[str, int]:
        return {"x": self.x, "z": self.z}

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Vec2:
        return cls(x=int(data["x"]), z=int(data["z"]))


RegionType = Literal["cuboid", "poly2d", "global", "manual"]


@dataclass
class Region:
    """Single WorldGuard region or a manual draft node."""

    id: str
    type: RegionType
    parent: Optional[str]
    priority: int
    flags: dict[str, Any] = field(default_factory=dict)
    owners: dict[str, Any] = field(default_factory=dict)
    members: dict[str, Any] = field(default_factory=dict)
    min: Optional[Vec3] = None
    max: Optional[Vec3] = None
    min_y: Optional[int] = None
    max_y: Optional[int] = None
    points: Optional[list[Vec2]] = None
    is_manual: bool = False

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.id,
            "type": self.type,
            "parent": self.parent,
            "priority": self.priority,
            "flags": self.flags,
            "owners": self.owners,
            "members": self.members,
            "is_manual": self.is_manual,
        }
        if self.min is not None:
            data["min"] = self.min.to_dict()
        if self.max is not None:
            data["max"] = self.max.to_dict()
        if self.min_y is not None:
            data["min_y"] = self.min_y
        if self.max_y is not None:
            data["max_y"] = self.max_y
        if self.points is not None:
            data["points"] = [p.to_dict() for p in self.points]
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> Region:
        return cls(
            id=data["id"],
            type=data["type"],
            parent=data.get("parent"),
            priority=int(data.get("priority", 0)),
            flags=data.get("flags", {}),
            owners=data.get("owners", {}),
            members=data.get("members", {}),
            min=Vec3.from_dict(data["min"]) if data.get("min") else None,
            max=Vec3.from_dict(data["max"]) if data.get("max") else None,
            min_y=int(data["min_y"]) if data.get("min_y") is not None else None,
            max_y=int(data["max_y"]) if data.get("max_y") is not None else None,
            points=[Vec2.from_dict(p) for p in data["points"]] if data.get("points") else None,
            is_manual=bool(data.get("is_manual", False)),
        )
