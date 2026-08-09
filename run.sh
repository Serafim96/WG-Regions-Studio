#!/usr/bin/env bash
# Compat wrapper — prefer WG-Regions-Studio.sh / .command / .app
set -e
cd "$(dirname "$0")"
chmod +x ./WG-Regions-Studio.sh 2>/dev/null || true
exec ./WG-Regions-Studio.sh "$@"
