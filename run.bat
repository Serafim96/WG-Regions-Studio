@echo off
setlocal
cd /d "%~dp0"

set "VENV_DIR=%~dp0..\.venv"
if not exist "%VENV_DIR%" (
    echo Creating virtual environment in ..\.venv ...
    python -m venv "%VENV_DIR%"
)

call "%VENV_DIR%\Scripts\activate.bat"
pip install -q -r requirements.txt

echo Building frontend...
cd frontend
call npm install
call npm run build
cd ..

set MRV_OPEN_BROWSER=1
echo Starting Regions Viewer, browser will open automatically...
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
