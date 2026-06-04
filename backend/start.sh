#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

mkdir -p data

# Download prebuilt FAISS index if missing
if [ ! -f "data/vector_index.faiss" ]; then
    echo "[setup] Downloading vector_index.faiss..."

    wget \
      "https://huggingface.co/datasets/dream691/endAML-assets/resolve/main/vector_index.faiss" \
      -O "data/vector_index.faiss"

    echo "[setup] FAISS index downloaded."
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7860}"

echo "[startup] Launching API on ${HOST}:${PORT}"

exec "$PYTHON_BIN" -m uvicorn main:app \
    --host "$HOST" \
    --port "$PORT"