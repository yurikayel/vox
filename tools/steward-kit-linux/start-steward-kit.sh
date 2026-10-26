#!/usr/bin/env bash
# Vox Steward Kit — 1-clique (Linux / macOS)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
export VOX_RELAY_PORT="${VOX_RELAY_PORT:-8787}"
export VOX_CLIENT_PORT="${VOX_CLIENT_PORT:-8080}"
exec python3 "$ROOT/tools/steward-kit-windows/steward_launcher.py"
