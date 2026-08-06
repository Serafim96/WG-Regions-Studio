#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

VENV_DIR="$(cd .. && pwd)/.venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment in ../.venv ..."
  python3 -m venv "$VENV_DIR"
fi
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"
pip install -q -r requirements.txt

if [ ! -f backend/static/index.html ]; then
  cd frontend && npm install && npm run build && cd ..
fi

export MRV_OPEN_BROWSER="${MRV_OPEN_BROWSER:-1}"
exec python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
