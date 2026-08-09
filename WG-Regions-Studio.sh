#!/bin/bash
# macOS / Linux one-click launcher (on macOS, double-click WG-Regions-Studio.command).
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "=== WG Regions Studio ==="
echo

have_cmd() { command -v "$1" >/dev/null 2>&1; }

ensure_python() {
  if have_cmd python3 && python3 -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)'; then
    return 0
  fi
  echo "Python 3.11+ not found."
  if have_cmd brew; then
    echo "Installing Python via Homebrew..."
    brew install python@3.12
    # brew may leave python3 as older; prefer 3.12 if present
    if have_cmd python3.12; then
      return 0
    fi
  fi
  echo "ERROR: Install Python 3.11+ from https://www.python.org/downloads/ (or: brew install python@3.12)"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open "https://www.python.org/downloads/" 2>/dev/null || true
  fi
  exit 1
}

ensure_node() {
  if have_cmd node; then
    major="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [[ "$major" -ge 18 ]]; then
      return 0
    fi
    echo "Node.js $major is too old (need 18+)."
  else
    echo "Node.js not found."
  fi
  if have_cmd brew; then
    echo "Installing Node.js via Homebrew..."
    brew install node
    return 0
  fi
  echo "ERROR: Install Node.js 18+ from https://nodejs.org/ (or: brew install node)"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    open "https://nodejs.org/" 2>/dev/null || true
  fi
  exit 1
}

ensure_python
ensure_node

PY=python3
if have_cmd python3.12; then
  PY=python3.12
elif have_cmd python3.13; then
  PY=python3.13
elif have_cmd python3.11; then
  PY=python3.11
fi

echo "Checking project dependencies and starting..."
exec "$PY" "$ROOT/launch.py" "$@"
