#!/bin/bash
# Double-clickable macOS launcher (opens Terminal).
cd "$(dirname "$0")"
chmod +x ./WG-Regions-Studio.sh 2>/dev/null || true
./WG-Regions-Studio.sh "$@"
status=$?
if [[ $status -ne 0 ]]; then
  echo
  echo "Launch failed (exit $status). Press Enter to close."
  read -r _
fi
exit "$status"
