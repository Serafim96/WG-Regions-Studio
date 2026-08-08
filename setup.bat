@echo off
setlocal
cd /d "%~dp0"

echo === WorldGuard Region Viewer — setup ===
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.11+ and add it to PATH.
    exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install Node.js 18+ and add it to PATH.
    exit /b 1
)

set "VENV_DIR=%~dp0..\.venv"
if not exist "%VENV_DIR%" (
    echo Creating virtual environment in ..\.venv ...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo ERROR: failed to create virtual environment.
        exit /b 1
    )
) else (
    echo Virtual environment already exists: ..\.venv
)

call "%VENV_DIR%\Scripts\activate.bat"

echo Installing Python packages...
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    exit /b 1
)

echo Installing and building frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    exit /b 1
)
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed.
    exit /b 1
)
cd ..

echo.
echo Setup complete. Double-click run.bat to start the app.
pause
