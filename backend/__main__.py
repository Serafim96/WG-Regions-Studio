"""Allow ``python -m backend`` and PyInstaller entry point."""

from __future__ import annotations

import os


def main() -> None:
    os.environ.setdefault("MRV_OPEN_BROWSER", "1")
    from backend.win_console_icon import apply_windows_console_icon

    apply_windows_console_icon()

    import uvicorn

    from backend.main import app

    print("Starting WG Regions Studio, browser will open automatically...")
    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="info")


if __name__ == "__main__":
    main()
