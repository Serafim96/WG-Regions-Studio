#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

if [ ! -f backend/static/index.html ]; then
  cd frontend && npm install && npm run build && cd ..
fi

exec python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
