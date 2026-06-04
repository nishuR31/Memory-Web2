# Backend (FastAPI)

## Environment Setup

Copy template and set values:

```bash
cp .env.example .env
```

Important variables:

- `GROQ_API_KEY`
- `CORS_ORIGINS`
- `TIGERGRAPH_*`

## Run locally

```bash
pip install -r requirements.txt
./start.sh
```

This starts `uvicorn main:app` on `0.0.0.0:${PORT:-8000}` and auto-generates `data/graph.gml` plus `data/chunks.json` if they are missing.

## Round 2 Pipeline (GraphRAG Hackathon)

```bash
# 1) Ingest SEC + Wikipedia corpora
python data/ingest_sec_edgar.py --output ./data/sec_edgar/ --years 2018 2024 --limit 200
python data/ingest_wikipedia.py --categories "Financial_crime,Money_laundering,Shell_company,Tax_haven,Sanctions" --output ./data/wikipedia/

# 2) Token proof with Gemini count_tokens
python data/token_counter.py --input ./data --model gemini-1.5-flash --output ../token_count_proof.json

# 3) Chunk + embed for Basic RAG
python data/chunk_and_embed.py --input ./data --output ./chroma_db

# 4) Run 30-scenario benchmark
python benchmark/run_benchmark.py --scenarios ../backend/scenarios.json --output ../benchmark_report.json --dataset-tokens 913931776
```

Added APIs:
- `POST /ingest`
- `GET /ingest/status`
- `POST /benchmark/full-run`
- `GET /benchmark/report`

## Deploy

From repo root, use:

```bash
bash backend/start.sh
```

Or from inside `backend/`:

```bash
./start.sh
```

Notes:

- `PORT` should be supplied by your host/platform if it differs from `8000`
- `backend/start.sh` is the only supported deployment entrypoint; local convenience runners are intentionally excluded from Git
