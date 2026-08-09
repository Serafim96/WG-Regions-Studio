"""One-click bootstrap: ensure project deps, then start WG Regions Studio.

Used by WG-Regions-Studio.bat / .command / .sh (and setup wrappers).
System Python 3.11+ and Node.js 18+ must already be on PATH (wrappers may
install them via winget/brew before calling this script).
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV_DIR = ROOT / ".venv"
REQUIREMENTS = ROOT / "requirements.txt"
FRONTEND = ROOT / "frontend"
STATIC_INDEX = ROOT / "backend" / "static" / "index.html"


def _venv_python() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "python.exe"
    return VENV_DIR / "bin" / "python"


def _venv_pip() -> Path:
    if os.name == "nt":
        return VENV_DIR / "Scripts" / "pip.exe"
    return VENV_DIR / "bin" / "pip"


def _run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=str(cwd or ROOT), check=True)


def _python_ok(exe: str) -> bool:
    try:
        out = subprocess.check_output(
            [exe, "-c", "import sys; print(f'{sys.version_info[0]}.{sys.version_info[1]}')"],
            text=True,
        ).strip()
        major, minor = (int(x) for x in out.split(".", 1))
        return (major, minor) >= (3, 11)
    except (OSError, subprocess.CalledProcessError, ValueError):
        return False


def _node_major() -> int | None:
    node = shutil.which("node")
    if not node:
        return None
    try:
        out = subprocess.check_output([node, "-v"], text=True).strip().lstrip("v")
        return int(out.split(".", 1)[0])
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None


def check_system_tools() -> None:
    if not _python_ok(sys.executable):
        raise SystemExit(
            "ERROR: Need Python 3.11+. "
            "Install from https://www.python.org/downloads/ then run this launcher again."
        )
    major = _node_major()
    if major is None:
        raise SystemExit(
            "ERROR: Node.js not found. "
            "Install Node.js 18+ from https://nodejs.org/ then run this launcher again."
        )
    if major < 18:
        raise SystemExit(f"ERROR: Node.js {major} is too old; need 18+.")


def ensure_venv() -> None:
    py = _venv_python()
    if py.is_file():
        return
    print("Creating virtual environment in .venv ...", flush=True)
    venv.create(VENV_DIR, with_pip=True)
    if not _venv_python().is_file():
        raise SystemExit("ERROR: failed to create virtual environment.")


def ensure_python_packages() -> None:
    ensure_venv()
    py = _venv_python()
    probe = [
        str(py),
        "-c",
        "import fastapi, uvicorn, yaml, shapely, httpx, multipart",
    ]
    try:
        subprocess.run(probe, cwd=str(ROOT), check=True, capture_output=True)
        return
    except (OSError, subprocess.CalledProcessError):
        pass
    print("Installing Python packages...", flush=True)
    _run([str(_venv_pip()), "install", "-r", str(REQUIREMENTS)])


def _frontend_needs_install() -> bool:
    return not (FRONTEND / "node_modules").is_dir()


def _frontend_needs_build() -> bool:
    if not STATIC_INDEX.is_file():
        return True
    pkg = FRONTEND / "package.json"
    if pkg.is_file() and pkg.stat().st_mtime > STATIC_INDEX.stat().st_mtime:
        return True
    src = FRONTEND / "src"
    if src.is_dir():
        newest = max((p.stat().st_mtime for p in src.rglob("*") if p.is_file()), default=0.0)
        if newest > STATIC_INDEX.stat().st_mtime:
            return True
    return False


def ensure_frontend(*, force_build: bool = False) -> None:
    npm = shutil.which("npm")
    if not npm:
        raise SystemExit("ERROR: npm not found (install Node.js 18+).")
    if _frontend_needs_install():
        print("Installing frontend dependencies...", flush=True)
        _run([npm, "install"], cwd=FRONTEND)
    if force_build or _frontend_needs_build():
        print("Building frontend...", flush=True)
        _run([npm, "run", "build"], cwd=FRONTEND)
    else:
        print("Frontend build is up to date.", flush=True)
    if not STATIC_INDEX.is_file():
        raise SystemExit("ERROR: frontend build missing.")


def start_app() -> None:
    py = _venv_python()
    if not py.is_file():
        raise SystemExit("ERROR: venv python missing.")
    env = os.environ.copy()
    env.setdefault("MRV_OPEN_BROWSER", "1")
    print("Starting WG Regions Studio, browser will open automatically...", flush=True)
    cmd = [str(py), "-m", "backend"]
    if os.name == "nt":
        # execve is unreliable on Windows; keep the launcher process as parent.
        raise SystemExit(subprocess.call(cmd, cwd=str(ROOT), env=env))
    os.execve(str(py), cmd, env)


def bootstrap(*, setup_only: bool, force_build: bool) -> None:
    print("=== WG Regions Studio ===", flush=True)
    check_system_tools()
    ensure_python_packages()
    ensure_frontend(force_build=force_build)
    if setup_only:
        print("Setup complete.", flush=True)
        return
    start_app()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Ensure deps and launch WG Regions Studio")
    parser.add_argument(
        "--setup-only",
        action="store_true",
        help="Install/build only; do not start the server",
    )
    parser.add_argument(
        "--force-build",
        action="store_true",
        help="Always rebuild the frontend",
    )
    args = parser.parse_args(argv)
    try:
        bootstrap(setup_only=args.setup_only, force_build=args.force_build)
    except subprocess.CalledProcessError as exc:
        raise SystemExit(f"ERROR: command failed with exit code {exc.returncode}") from exc


if __name__ == "__main__":
    main()
