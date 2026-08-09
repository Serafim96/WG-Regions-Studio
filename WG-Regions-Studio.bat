@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo === WG Regions Studio ===
echo.

set "SETUP_ONLY=0"
echo.%*|findstr /I /C:"--setup-only" >nul && set "SETUP_ONLY=1"

REM Packaged release only: exe sitting next to this launcher (zip layout).
REM Do NOT prefer dist\… — that skips launch.py rebuilds during development.
if "%SETUP_ONLY%"=="0" if exist "%~dp0WG-Regions-Studio.exe" (
    echo Starting packaged WG-Regions-Studio.exe ...
    start "WG Regions Studio" /D "%~dp0" "%~dp0WG-Regions-Studio.exe"
    exit /b 0
)

call :ensure_python
if errorlevel 1 goto fail
call :ensure_node
if errorlevel 1 goto fail

echo Checking project dependencies and starting...
python "%~dp0launch.py" %*
set "ERR=%ERRORLEVEL%"
if not "%ERR%"=="0" goto fail
exit /b 0

:ensure_python
where python >nul 2>&1
if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)" 2>nul
    if not errorlevel 1 exit /b 0
)
echo Python 3.11+ not found. Trying winget...
where winget >nul 2>&1
if errorlevel 1 (
    echo ERROR: Install Python 3.11+ from https://www.python.org/downloads/
    echo Make sure "Add python.exe to PATH" is enabled, then run this file again.
    exit /b 1
)
winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo ERROR: winget could not install Python. Install manually from https://www.python.org/downloads/
    exit /b 1
)
where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python installed but not on PATH. Open a new terminal and run this file again.
    exit /b 1
)
exit /b 0

:ensure_node
where node >nul 2>&1
if not errorlevel 1 (
    for /f "tokens=1 delims=." %%A in ('node -v') do set "NVER=%%A"
    set "NVER=%NVER:v=%"
    if %NVER% GEQ 18 exit /b 0
)
echo Node.js 18+ not found. Trying winget...
where winget >nul 2>&1
if errorlevel 1 (
    echo ERROR: Install Node.js 18+ from https://nodejs.org/
    exit /b 1
)
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
    echo ERROR: winget could not install Node.js. Install manually from https://nodejs.org/
    exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js installed but not on PATH. Open a new terminal and run this file again.
    exit /b 1
)
exit /b 0

:fail
echo.
echo Launch failed.
pause
exit /b 1
