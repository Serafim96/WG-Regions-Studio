"""Apply the app icon to the Windows console window / taskbar button."""

from __future__ import annotations

import sys
from pathlib import Path


APP_USER_MODEL_ID = "Serafim96.WGRegionsStudio"


def _icon_candidates() -> list[Path]:
    paths: list[Path] = []
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS", ""))
        exe_dir = Path(sys.executable).resolve().parent
        paths.extend(
            [
                meipass / "icon.ico",
                exe_dir / "icon.ico",
                exe_dir / "_internal" / "icon.ico",
            ]
        )
    else:
        app_root = Path(__file__).resolve().parents[1]
        paths.append(app_root / "packaging" / "icon.ico")
    return paths


def resolve_icon_ico() -> Path | None:
    for path in _icon_candidates():
        if path.is_file():
            return path
    return None


def apply_windows_console_icon() -> None:
    """Set AppUserModelID + console WM_SETICON so the taskbar shows our .ico."""
    if sys.platform != "win32":
        return

    import ctypes
    from ctypes import wintypes

    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
    except Exception:
        pass

    hwnd = ctypes.windll.kernel32.GetConsoleWindow()
    if not hwnd:
        return

    ico = resolve_icon_ico()
    if ico is None:
        return

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    IMAGE_ICON = 1
    LR_LOADFROMFILE = 0x0010
    WM_SETICON = 0x0080
    ICON_SMALL = 0
    ICON_BIG = 1

    LoadImageW = user32.LoadImageW
    LoadImageW.argtypes = [
        wintypes.HINSTANCE,
        wintypes.LPCWSTR,
        wintypes.UINT,
        ctypes.c_int,
        ctypes.c_int,
        wintypes.UINT,
    ]
    LoadImageW.restype = wintypes.HANDLE

    path = str(ico)
    h_big = LoadImageW(None, path, IMAGE_ICON, 32, 32, LR_LOADFROMFILE)
    h_small = LoadImageW(None, path, IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
    if h_big:
        user32.SendMessageW(hwnd, WM_SETICON, ICON_BIG, h_big)
    if h_small:
        user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_small)
    elif h_big:
        user32.SendMessageW(hwnd, WM_SETICON, ICON_SMALL, h_big)
