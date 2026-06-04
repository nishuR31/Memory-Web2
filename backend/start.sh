#!/usr/bin/env bash
set -euxo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
    PYTHON_BIN="python"
fi

mkdir -p data

# Download FAISS index if missing
if [ ! -s "data/vector_index.faiss" ]; then
    echo "[setup] Downloading vector_index.faiss..."

    wget \
      "https://huggingface.co/datasets/dream691/endAML-assets/resolve/main/vector_index.faiss" \
      -O "data/vector_index.faiss"

    echo "[setup] FAISS index downloaded."
fi

HOST="0.0.0.0"
PORT="7860"

echo "[debug] Python: $PYTHON_BIN"
echo "[debug] Working directory: $(pwd)"

echo "[debug] Data directory contents:"
find data -maxdepth 2 -type f | sort || true

echo "[debug] FAISS:"
ls -lh data/vector_index.faiss || true

echo "[debug] chunks.json:"
ls -lh data/chunks.json || true

echo "[debug] graph.gml:"
ls -lh data/graph.gml || true

echo "[startup] Launching API on ${HOST}:${PORT}"

exec "$PYTHON_BIN" -m uvicorn main:app \
    --host "$HOST" \
    --port "$PORT" \
    --log-level debug
