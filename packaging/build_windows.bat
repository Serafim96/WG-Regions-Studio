@echo off
setlocal
cd /d "%~dp0.."

REM Full Windows release pipeline. See docs/dev/BUILD_WINDOWS.md (workspace) /
REM AGENTS.md — this is the ONLY way to refresh dist\WG-Regions-Studio.exe for testing.
REM Usage: packaging\build_windows.bat [/force-deps]
REM Or:    set FORCE_DEPS=1 && packaging\build_windows.bat

echo === WG Regions Studio — Windows release build ===
echo.

if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: .venv not found. Run setup.bat first.
    exit /b 1
)

call ".venv\Scripts\activate.bat"

set "DO_FORCE_DEPS=0"
if /I "%FORCE_DEPS%"=="1" set "DO_FORCE_DEPS=1"
if /I "%~1"=="/force-deps" set "DO_FORCE_DEPS=1"

set "NEED_DEPS=0"
if "%DO_FORCE_DEPS%"=="1" (
    set "NEED_DEPS=1"
) else (
    python -c "import PyInstaller, PIL" 1>nul 2>nul
    if errorlevel 1 set "NEED_DEPS=1"
)

if "%NEED_DEPS%"=="1" (
    echo Installing build tools...
    pip install -r packaging\requirements-build.txt
    if errorlevel 1 (
        echo ERROR: pip install failed.
        exit /b 1
    )
) else (
    echo Build tools already in .venv — skipping pip. Use /force-deps to reinstall.
)

echo Syncing icon.ico / frontend asset from packaging\icon.png...
python packaging\generate_icon.py
if errorlevel 1 (
    echo ERROR: icon sync failed.
    exit /b 1
)

echo Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed.
    cd ..
    exit /b 1
)
cd ..

if not exist "backend\static\index.html" (
    echo ERROR: backend\static\index.html missing after frontend build.
    exit /b 1
)

echo Running PyInstaller...
pyinstaller packaging\WG-Regions-Studio.spec --noconfirm --clean --distpath dist --workpath build
if errorlevel 1 (
    echo ERROR: PyInstaller failed.
    exit /b 1
)

echo Creating zip...
python packaging\make_zip.py
if errorlevel 1 (
    echo ERROR: zip failed.
    exit /b 1
)

echo.
echo Done.
echo   Folder: dist\WG-Regions-Studio\
echo   Exe:    dist\WG-Regions-Studio\WG-Regions-Studio.exe
echo   Zip:    release\WG-Regions-Studio-*-windows.zip
echo Double-click WG-Regions-Studio.exe inside the folder ^(keep _internal beside it^).
