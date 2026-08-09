#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
chmod +x ./WG-Regions-Studio.sh 2>/dev/null || true
./WG-Regions-Studio.sh --setup-only
