@echo off
setlocal
cd /d "%~dp0"

set "VENV_DIR=%~dp0..\.venv"
if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo Virtual environment not found. Run setup.bat first.
    pause
    exit /b 1
)

call "%VENV_DIR%\Scripts\activate.bat"

if not exist "frontend\node_modules\" (
    echo Frontend dependencies missing. Run setup.bat first.
    pause
    exit /b 1
)

echo Building frontend...
cd frontend
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed.
    cd ..
    pause
    exit /b 1
)
cd ..

set MRV_OPEN_BROWSER=1
echo Starting Regions Viewer, browser will open automatically...
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
