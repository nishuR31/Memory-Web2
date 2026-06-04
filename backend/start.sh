#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

# Auto-generate graph + vector artifacts if missing.
if [ ! -f "data/graph.gml" ] || [ ! -f "data/chunks.json" ]; then
    echo "[setup] Generating graph and vector data..."
    "$PYTHON_BIN" generate_data.py
    echo "[setup] Data generation complete."
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8000}"

exec "$PYTHON_BIN" -m uvicorn main:app --host "$HOST" --port "$PORT"
