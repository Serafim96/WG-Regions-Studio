"""Apply the app icon to the Windows console window / taskbar button."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


APP_USER_MODEL_ID = "Serafim96.WGRegionsStudio"
CONSOLE_TITLE = "WG Regions Studio"
_CLASSIC_ENV = "MRV_CLASSIC_CONSOLE"


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


def ensure_classic_console() -> bool:
    """Relaunch once under conhost.exe and return True (caller should exit).

    Wrapping in conhost disables Windows Terminal delegation regardless of the
    system Default Terminal setting (including Explorer double-click handoff).
    Guarded by MRV_CLASSIC_CONSOLE to avoid an infinite relaunch loop.
    """
    if sys.platform != "win32":
        return False
    if os.environ.get(_CLASSIC_ENV) == "1":
        return False

    env = os.environ.copy()
    env[_CLASSIC_ENV] = "1"
    env.pop("WT_SESSION", None)
    env.pop("WT_PROFILE_ID", None)

    if getattr(sys, "frozen", False):
        cmd = ["conhost.exe", sys.executable, *sys.argv[1:]]
        cwd = str(Path(sys.executable).resolve().parent)
    else:
        cmd = ["conhost.exe", sys.executable, "-m", "backend", *sys.argv[1:]]
        cwd = str(Path(__file__).resolve().parents[1])

    try:
        subprocess.Popen(cmd, cwd=cwd, env=env, close_fds=False)
    except OSError:
        return False
    return True


def apply_windows_console_icon() -> None:
    """Set AppUserModelID, console title, WM_SETICON, and class icons for taskbar."""
    if sys.platform != "win32":
        return

    import ctypes
    from ctypes import wintypes

    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID(APP_USER_MODEL_ID)
    except Exception:
        pass

    try:
        ctypes.windll.kernel32.SetConsoleTitleW(CONSOLE_TITLE)
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
    GCLP_HICON = -14
    GCLP_HICONSM = -34

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

    set_class = getattr(user32, "SetClassLongPtrW", None) or getattr(user32, "SetClassLongW", None)
    if set_class is None:
        return
    set_class.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_void_p]
    set_class.restype = ctypes.c_void_p
    if h_big:
        set_class(hwnd, GCLP_HICON, h_big)
    if h_small:
        set_class(hwnd, GCLP_HICONSM, h_small)
    elif h_big:
        set_class(hwnd, GCLP_HICONSM, h_big)
