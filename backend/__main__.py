"""Allow ``python -m backend`` and PyInstaller entry point."""

from __future__ import annotations

import os


def main() -> None:
    os.environ.setdefault("MRV_OPEN_BROWSER", "1")
    from backend.win_console_icon import prepare_windows_console

    # Console parents: relaunch under classic conhost (interim console hidden).
    # Windowed frozen EXE: no relaunch — AllocConsole in ensure_console_stdio.
    # When started from launch.py already under conhost (MRV_CLASSIC_CONSOLE=1),
    # stay in that window so install + server share the branded console.
    if prepare_windows_console():
        raise SystemExit(0)

    import uvicorn

    from backend.main import app

    print("Starting WG Regions Studio, browser will open automatically...")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
