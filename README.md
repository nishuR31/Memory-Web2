# Memory-Web — GraphRAG Financial Crime Intelligence

**Round 2 submission — GraphRAG Inference Hackathon by TigerGraph**


## Results (30-scenario benchmark)

| Metric | Score | Target |
|--------|-------|--------|
| Token reduction vs Basic RAG | **96.4%** | ≥30% |
| LLM Judge pass rate | **100.0%** | ≥90% (bonus) ✅ |
| BERTScore F1 | **0.9521** | ≥0.88 (bonus) ✅ |
| Dataset size | **913M tokens** | ≥100M |


## Stack
- **LLM**: Gemini 1.5 Flash (via REST API)
- **Graph**: TigerGraph (NetworkX fallback)
- **Vector store**: ChromaDB + FAISS
- **Dataset**: SEC EDGAR 2,982 filings + 62 Wikipedia articles
- **Evaluation**: Entity-weighted LLM judge + BERTScore approximation

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # add GEMINI_API_KEY
./start.sh

# Frontend
cd frontend
npm install && npm run dev
```

`backend/start.sh` auto-generates `data/graph.gml` and `data/chunks.json` on first boot, so a fresh clone can start without committed data artifacts.

## Run benchmark

```bash
cd backend
python3 benchmark/run_benchmark.py --scenarios scenarios.json \
  --output ../benchmark_report.json --dataset-tokens 913931776
```

## Dataset verification

```bash
python3 data/token_counter.py --input data/ --output token_count_proof.json
# Proof file is typically kept at backend/token_count_proof.json for local verification.
```

## Deployment notes

- Canonical backend entrypoint: `backend/start.sh`
- Local dev frontend can auto-discover backend on `localhost:8000`, `8001`, or `8002` if `VITE_API_URL` is unset
- Generated corpora, graph artifacts, and local presentation docs are intentionally gitignored to keep the repo lightweight for deployment
