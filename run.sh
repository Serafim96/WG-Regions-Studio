#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

VENV_DIR="$(cd .. && pwd)/.venv"
if [ ! -f "$VENV_DIR/bin/activate" ]; then
  echo "Virtual environment not found. Run ./setup.sh first."
  exit 1
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

if [ ! -d frontend/node_modules ]; then
  echo "Frontend dependencies missing. Run ./setup.sh first."
  exit 1
fi

echo "Building frontend..."
(cd frontend && npm run build)

export MRV_OPEN_BROWSER="${MRV_OPEN_BROWSER:-1}"
exec python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
