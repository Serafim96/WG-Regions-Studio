"""Every flag named by a cross-flag rule exists in the WorldGuard catalog."""

import json
from pathlib import Path

from backend.flags.catalog import parse_flags_file

APP_ROOT = Path(__file__).resolve().parents[2]
RULE_FLAGS = APP_ROOT / "frontend" / "src" / "utils" / "crossFlagRuleFlags.json"
FLAGS_PATH = APP_ROOT.parent / "all_flags.txt"


def test_cross_flag_rule_names_are_in_the_catalog():
    names = set(json.loads(RULE_FLAGS.read_text(encoding="utf-8")))
    catalog = {flag.name for flag in parse_flags_file(FLAGS_PATH)}
    missing = names - catalog
    assert not missing, f"rule flags missing from all_flags.txt: {sorted(missing)}"
