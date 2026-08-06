"""Tests for region deletion and clearing temporary regions."""

from backend.manual_regions import (
    clear_manual_regions,
    collect_descendant_ids,
    delete_manual_region,
)
from backend.models.region import Region


def _region(
    region_id: str,
    parent: str | None = None,
    *,
    is_manual: bool = False,
) -> Region:
    return Region(
        id=region_id,
        type="manual" if is_manual else "cuboid",
        parent=parent,
        priority=0,
        is_manual=is_manual,
    )


def test_collect_descendant_ids():
    regions = [
        _region("root"),
        _region("a", "root", is_manual=True),
        _region("b", "a", is_manual=True),
        _region("c", "a"),
    ]
    assert collect_descendant_ids(regions, "a") == {"b", "c"}


def test_delete_detach_reparents_children():
    regions = [
        _region("root"),
        _region("temp", "root", is_manual=True),
        _region("child", "temp"),
    ]
    result = delete_manual_region(regions, "temp", "detach")
    ids = {region.id: region.parent for region in result}
    assert "temp" not in ids
    assert ids["child"] == "root"
    assert len(result) == 2


def test_delete_orphan_clears_parent():
    regions = [
        _region("root"),
        _region("mid", "root"),
        _region("child", "mid"),
    ]
    result = delete_manual_region(regions, "mid", "orphan")
    ids = {region.id: region.parent for region in result}
    assert "mid" not in ids
    assert ids["child"] is None


def test_delete_cascade_removes_subtree():
    regions = [
        _region("root"),
        _region("temp", "root", is_manual=True),
        _region("child", "temp", is_manual=True),
        _region("other", "root"),
    ]
    result = delete_manual_region(regions, "temp", "cascade")
    assert [region.id for region in result] == ["root", "other"]


def test_delete_allows_non_manual():
    regions = [
        _region("root"),
        _region("yaml_only", "root"),
        _region("kid", "yaml_only"),
    ]
    result = delete_manual_region(regions, "yaml_only", "detach")
    ids = {region.id: region.parent for region in result}
    assert "yaml_only" not in ids
    assert ids["kid"] == "root"


def test_delete_missing_region_raises():
    regions = [_region("root")]
    try:
        delete_manual_region(regions, "missing", "detach")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "not found" in str(exc)


def test_clear_manual_regions_relinks_children():
    regions = [
        _region("root"),
        _region("temp", "root", is_manual=True),
        _region("nested", "temp", is_manual=True),
        _region("keep", "nested"),
        _region("other", "root"),
    ]
    result = clear_manual_regions(regions)
    ids = {region.id: region.parent for region in result}
    assert set(ids) == {"root", "keep", "other"}
    assert ids["keep"] == "root"
