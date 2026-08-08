#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== WG Regions Studio — setup ==="
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: Python 3 not found. Install Python 3.11+."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js not found. Install Node.js 18+."
  exit 1
fi

VENV_DIR="$(pwd)/.venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment in .venv ..."
  python3 -m venv "$VENV_DIR"
else
  echo "Virtual environment already exists: .venv"
fi

# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

echo "Installing Python packages..."
pip install -r requirements.txt

echo "Installing and building frontend..."
cd frontend
npm install
npm run build
cd ..

echo
echo "Setup complete. Run ./run.sh to start the app."
