@echo off
setlocal
cd /d "%~dp0.."

echo === WG Regions Studio — Windows release build ===
echo.

if not exist ".venv\Scripts\activate.bat" (
    echo ERROR: .venv not found. Run setup.bat first.
    exit /b 1
)

call ".venv\Scripts\activate.bat"

echo Installing build tools...
pip install -r packaging\requirements-build.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    exit /b 1
)

echo Generating icon...
python packaging\generate_icon.py
if errorlevel 1 (
    echo ERROR: icon generation failed.
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
echo   Zip:    release\WG-Regions-Studio-*-windows.zip
echo Double-click WG-Regions-Studio.exe inside the folder or unzipped archive.
