# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller onedir spec for WG Regions Studio (Windows)."""

from __future__ import annotations

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

SPECDIR = Path(SPEC).resolve().parent
APP_ROOT = SPECDIR.parent
WORKSPACE = APP_ROOT.parent
ICON = SPECDIR / "icon.ico"
STATIC = APP_ROOT / "backend" / "static"
FLAGS = WORKSPACE / "all_flags.txt"

datas: list[tuple[str, str]] = []
binaries: list[tuple[str, str]] = []
hiddenimports: list[str] = [
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "backend",
    "backend.main",
]

if STATIC.exists():
    datas.append((str(STATIC), "backend/static"))
if FLAGS.exists():
    datas.append((str(FLAGS), "."))

for pkg in ("uvicorn", "fastapi", "starlette", "anyio", "shapely"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    # Skip test suites pulled in by collect_all (bloat + pytest dependency).
    hiddenimports += [h for h in pkg_hidden if ".tests" not in h and not h.endswith(".tests")]

hiddenimports += collect_submodules("backend")

a = Analysis(
    [str(APP_ROOT / "backend" / "__main__.py")],
    pathex=[str(APP_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "tkinter"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="WG-Regions-Studio",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(ICON) if ICON.exists() else None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="WG-Regions-Studio",
)
