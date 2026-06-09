#!/bin/bash
# Restore mortgage calculator to the Logan1 snapshot.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/versions/Logan1"
if [[ ! -d "$SRC" ]]; then
  echo "Logan1 snapshot not found at $SRC"
  exit 1
fi
rsync -a --exclude 'versions' "$SRC/" "$ROOT/"
echo "Reverted to Logan1. Restart: cd $ROOT && python3 server.py"