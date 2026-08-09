"""Zip the PyInstaller onedir folder for GitHub Releases."""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[1]
DIST_DIR = APP_ROOT / "dist" / "WG-Regions-Studio"
OUT_DIR = APP_ROOT / "release"
VERSION_FILE = APP_ROOT / "backend" / "version.py"


def _read_version() -> str:
    text = VERSION_FILE.read_text(encoding="utf-8")
    m = re.search(r'^APP_VERSION\s*=\s*["\']([^"\']+)["\']', text, re.M)
    if not m:
        raise RuntimeError(f"APP_VERSION not found in {VERSION_FILE}")
    return m.group(1)


def main() -> int:
    if not DIST_DIR.is_dir():
        print(f"ERROR: missing {DIST_DIR}. Run PyInstaller first.", file=sys.stderr)
        return 1
    version = _read_version()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    zip_stem = OUT_DIR / f"WG-Regions-Studio-{version}-windows"
    zip_path = zip_stem.with_suffix(".zip")
    if zip_path.exists():
        zip_path.unlink()
    archive = shutil.make_archive(
        str(zip_stem),
        "zip",
        root_dir=DIST_DIR.parent,
        base_dir=DIST_DIR.name,
    )
    print(f"Wrote {archive}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
