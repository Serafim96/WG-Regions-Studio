@echo off
setlocal
cd /d "%~dp0"

if not exist .venv (
    echo Creating virtual environment...
    python -m venv .venv
)

call .venv\Scripts\activate.bat
pip install -q -r requirements.txt

if not exist backend\static\index.html (
    echo Building frontend...
    cd frontend
    call npm install
    call npm run build
    cd ..
)

echo Starting server at http://127.0.0.1:8000
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
