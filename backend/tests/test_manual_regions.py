"""Tests for manual region deletion."""

from backend.manual_regions import collect_descendant_ids, delete_manual_region
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


def test_delete_manual_detach_reparents_children():
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


def test_delete_manual_cascade_removes_subtree():
    regions = [
        _region("root"),
        _region("temp", "root", is_manual=True),
        _region("child", "temp", is_manual=True),
        _region("other", "root"),
    ]
    result = delete_manual_region(regions, "temp", "cascade")
    assert [region.id for region in result] == ["root", "other"]


def test_delete_manual_rejects_non_manual():
    regions = [_region("yaml_only")]
    try:
        delete_manual_region(regions, "yaml_only", "detach")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "not manual" in str(exc)
