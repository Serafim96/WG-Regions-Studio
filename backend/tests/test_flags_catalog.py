"""Tests for WorldGuard flags catalog parsing, jar merge, and custom flags."""

from pathlib import Path

import pytest

from backend.flags.catalog import (
    add_custom_flag,
    delete_custom_flag,
    delete_all_custom_flags,
    extract_flag_names_from_jar,
    load_builtin_flags,
    load_flags_catalog,
    parse_flags_file,
    replace_custom_flags,
)

APP_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = APP_ROOT.parent
FLAGS_PATH = WORKSPACE_ROOT / "all_flags.txt"
WG_JAR_PATH = WORKSPACE_ROOT / "worldguard-bukkit-7.0.17.jar"

EXPECTED_DOCS = [
    "passthrough",
    "nonplayer-protection-domains",
    "build",
    "interact",
    "block-break",
    "block-place",
    "use",
    "damage-animals",
    "chest-access",
    "ride",
    "pvp",
    "sleep",
    "respawn-anchors",
    "tnt",
    "vehicle-place",
    "vehicle-destroy",
    "lighter",
    "block-trampling",
    "frosted-ice-form",
    "item-frame-rotation",
    "firework-damage",
    "use-anvil",
    "use-dripleaf",
    "creeper-explosion",
    "enderdragon-block-damage",
    "ghast-fireball",
    "other-explosion",
    "fire-spread",
    "enderman-grief",
    "snowman-trails",
    "ravager-grief",
    "mob-damage",
    "mob-spawning",
    "deny-spawn",
    "entity-painting-destroy",
    "entity-item-frame-destroy",
    "wither-damage",
    "lava-fire",
    "lightning",
    "water-flow",
    "lava-flow",
    "snow-fall",
    "snow-melt",
    "ice-form",
    "ice-melt",
    "frosted-ice-melt",
    "mushroom-growth",
    "leaf-decay",
    "grass-growth",
    "mycelium-spread",
    "vine-growth",
    "rock-growth",
    "sculk-growth",
    "crop-growth",
    "soil-dry",
    "coral-fade",
    "copper-fade",
    "entry",
    "exit",
    "exit-via-teleport",
    "exit-override",
    "entry-deny-message",
    "exit-deny-message",
    "notify-enter",
    "notify-leave",
    "greeting",
    "greeting-title",
    "farewell",
    "farewell-title",
    "enderpearl",
    "chorus-fruit-teleport",
    "teleport",
    "spawn",
    "teleport-message",
    "item-pickup",
    "item-drop",
    "exp-drops",
    "deny-message",
    "invincible",
    "fall-damage",
    "game-mode",
    "time-lock",
    "weather-lock",
    "natural-health-regen",
    "natural-hunger-drain",
    "heal-delay",
    "heal-amount",
    "heal-min-health",
    "heal-max-health",
    "feed-delay",
    "feed-amount",
    "feed-min-hunger",
    "feed-max-hunger",
    "blocked-cmds",
    "allowed-cmds",
    "pistons",
    "send-chat",
    "receive-chat",
    "potion-splash",
]


def test_parse_flags_file_matches_docs_list():
    flags = parse_flags_file(FLAGS_PATH)
    names = [f.name for f in flags]
    assert names == EXPECTED_DOCS
    assert all(f.builtin for f in flags)
    # Section headers must not become flags
    assert "Protection-Related" not in names
    assert "Movement" not in names
    passthrough = next(f for f in flags if f.name == "passthrough")
    assert "passthrough build" in passthrough.description
    assert next(f for f in flags if f.name == "pvp").flag_type == "state"


def test_load_flags_catalog_merges_jar_extras():
    catalog = load_flags_catalog(FLAGS_PATH, jar_path=WG_JAR_PATH)
    names = {f.name for f in catalog}
    assert "wind-charge-burst" in names
    assert "breeze-charge-explosion" in names
    assert "moisture-change" in names
    assert all(f.builtin for f in catalog)


def test_extract_flag_names_from_jar():
    if not WG_JAR_PATH.is_file():
        return
    names = extract_flag_names_from_jar(WG_JAR_PATH)
    assert "pvp" in names
    assert "wind-charge-burst" in names
    assert "moisture-change" in names


def test_custom_flags_add_and_delete(tmp_path: Path):
    custom_path = tmp_path / "custom_flags.json"
    builtins = {f.name for f in load_builtin_flags(FLAGS_PATH, jar_path=WG_JAR_PATH)}

    info = add_custom_flag(
        custom_path,
        name="my-plugin-flag",
        flag_type="string",
        description="Custom desc",
        builtin_names=builtins,
    )
    assert info.builtin is False
    assert info.name == "my-plugin-flag"

    merged = load_flags_catalog(
        FLAGS_PATH,
        jar_path=WG_JAR_PATH,
        custom_path=custom_path,
    )
    custom = next(f for f in merged if f.name == "my-plugin-flag")
    assert custom.builtin is False
    assert custom.description == "Custom desc"

    with pytest.raises(ValueError, match="Standard flag"):
        add_custom_flag(
            custom_path,
            name="pvp",
            flag_type="state",
            description="nope",
            builtin_names=builtins,
        )

    with pytest.raises(ValueError, match="cannot be deleted"):
        delete_custom_flag(custom_path, "pvp", builtins)

    delete_custom_flag(custom_path, "my-plugin-flag", builtins)
    merged2 = load_flags_catalog(
        FLAGS_PATH,
        jar_path=WG_JAR_PATH,
        custom_path=custom_path,
    )
    assert all(f.name != "my-plugin-flag" for f in merged2)


def test_custom_flags_replace_and_delete_all(tmp_path: Path):
    custom_path = tmp_path / "custom_flags.json"
    builtins = {f.name for f in load_builtin_flags(FLAGS_PATH, jar_path=WG_JAR_PATH)}
    flags = replace_custom_flags(
        custom_path,
        [
            {"name": "plugin-enabled", "type": "boolean", "description": "Enabled"},
            {"name": "plugin-tags", "type": "set of strings", "description": "Tags"},
        ],
        builtins,
    )
    assert [flag.name for flag in flags] == ["plugin-enabled", "plugin-tags"]
    assert delete_all_custom_flags(custom_path) == ["plugin-enabled", "plugin-tags"]
    assert load_flags_catalog(FLAGS_PATH, jar_path=WG_JAR_PATH, custom_path=custom_path)[-1].builtin

    with pytest.raises(ValueError, match="Unsupported flag type"):
        replace_custom_flags(
            custom_path,
            [{"name": "bad", "type": "made-up", "description": ""}],
            builtins,
        )
