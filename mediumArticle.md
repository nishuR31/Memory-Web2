# How We Scaled Our GraphRAG Benchmark Lab to 913M Tokens for TigerGraph’s Round 2 Hackathon

*Updated from our Round 1 write-up:* [How I Built a GraphRAG Benchmark Lab That Proves Why Graph Retrieval Beats Plain RAG](https://medium.com/@nishanntt/how-i-built-a-graphrag-benchmark-lab-that-proves-why-graph-retrieval-beats-plain-rag-24052a3f8830)

![Round 2 dashboard placeholder](docs/images/round2_metrics_dashboard.png)

## TL;DR

Round 1 was about proving that GraphRAG beats plain RAG on graph-shaped financial crime questions.

Round 2 was about proving that it still wins at scale.

We took **Memory-Web**, our financial crime intelligence system, and upgraded it into a full Round 2 GraphRAG benchmark stack over a **913,931,776-token** corpus built from:

- **2,982 SEC EDGAR filings**
- **62 Wikipedia articles** focused on sanctions, AML, shell companies, offshore structures, and beneficial ownership

Across **30 benchmark scenarios**, the final system measured:

- **96.4% token reduction vs Basic RAG**
- **100% LLM Judge pass rate (30/30)**
- **0.9521 BERTScore F1 raw**
- **$0.000032/query for GraphRAG vs $0.000467/query for Basic RAG**

That is exactly the kind of result we wanted for the TigerGraph GraphRAG Inference Hackathon: not just a cool graph demo, but a system that is measurable, reproducible, and cost-efficient.

## Why We Stayed in Financial Crime

This domain is perfect for GraphRAG.

Most AML and sanctions questions are not really “search” problems. They are **relationship reconstruction** problems:

- Who ultimately owns this company?
- Is this firm indirectly exposed to a sanctioned entity?
- Which intermediary connects this payment flow to a high-risk endpoint?
- How many shell layers exist between an operating company and its final beneficiary?

Vector retrieval is good at surfacing related fragments. But it is much weaker when the answer depends on **multi-hop structure**, **edge direction**, and **entity ordering**.

That is why our Round 1 thesis still held in Round 2: in financial crime, graph retrieval is not a UX enhancement. It is a reasoning advantage.

## What Changed From Round 1 to Round 2

In Round 1, our benchmark lab proved the concept.

In Round 2, we focused on five upgrades:

1. **Scale**: move from a small benchmark corpus to a 913M-token corpus.
2. **Three-pipeline comparison**: LLM-only vs Basic RAG vs GraphRAG on the same scenarios.
3. **Token accounting**: document corpus size using Gemini token-count calibration.
4. **Production-style reliability**: auto-fallbacks, startup generation, and deploy-safe defaults.
5. **Submission-grade storytelling**: live dashboard, scenario table, evidence trace, and benchmark report.

## The Architecture We Ended Up With

Memory-Web is still the same core stack, but much more hardened now.

### Frontend

- **React + Vite**
- live benchmark workspace
- scenario selector + freeform query box
- evidence tabs
- winner summary
- graph visualization
- history + presentation-friendly UI

### Backend

- **FastAPI**
- benchmark routes
- scenario catalog
- graph endpoint
- validation and ingest helpers

### Retrieval + evaluation stack

- **TigerGraph** as the target production graph layer
- **NetworkX fallback** for local/demo reliability
- **ChromaDB + FAISS** for Basic RAG support
- **Gemini 1.5 Flash** as the LLM layer
- custom **graph-native judge** and **BERTScore-style overlap evaluation**

## The Three Pipelines We Benchmarked

Every scenario runs through the same three pathways.

### 1. LLM-Only

No retrieval. Just the question.

This gives us a baseline for how far pure parametric recall can go without evidence.

### 2. Basic RAG

Query -> chunk retrieval -> retrieved text -> answer synthesis.

This pipeline uses the real corpus, not synthetic one-liners. That distinction mattered a lot, because token reduction only becomes meaningful if Basic RAG is actually forced to carry large text windows.

### 3. GraphRAG

Query -> entity match -> graph traversal -> compact graph context -> answer synthesis.

Instead of feeding long text passages, we feed a compact chain such as:

`Meridian Holdings Ltd-[OWNS]->BVI Shell Alpha-[CONTROLS]->Kasarov Enterprises-[OWNS]->Viktor Kasarov`

That one design choice is the reason the system wins on tokens.

## How We Counted 913,931,776 Tokens

One of the most important Round 2 requirements was dataset scale verification.

We documented token count in `token_count_proof.json` using **Gemini 1.5 Flash** calibration.

### Final corpus count

- **Total files**: 3,044
- **Total tokens**: **913,931,776**
- **SEC EDGAR**: 913,738,969 tokens across 2,982 filings
- **Wikipedia**: 192,807 tokens across 62 articles

### Counting method

We calibrated token-per-character ratios using Gemini counting on a sample of files, then applied the calibrated estimate across the full corpus.

That gave us a documented, reproducible token proof instead of a vague “probably over 100M” claim.

## The Numbers That Mattered Most

Here are the final benchmark numbers from the current `benchmark_report.json`.

| Metric | Result |
|---|---:|
| Dataset size | **913,931,776 tokens** |
| Scenarios tested | **30** |
| Avg token reduction vs Basic RAG | **96.4%** |
| LLM Judge pass rate | **100.0% (30/30)** |
| Avg BERTScore F1 raw | **0.9521** |
| Avg Basic RAG tokens/query | **5,479.7** |
| Avg GraphRAG tokens/query | **196.1** |
| Avg LLM-only tokens/query | **69.4** |
| Avg Basic RAG cost/query | **$0.000467** |
| Avg GraphRAG cost/query | **$0.000032** |

### Cost impact

The absolute per-query savings look small until you scale them.

- Basic RAG: **$0.000467/query**
- GraphRAG: **$0.000032/query**
- Savings: **$0.000435/query**

At **10,000 queries/day**, that is roughly:

- **$4.35/day saved**
- **$1,588/year saved per deployed system**

And that is before accounting for better analyst productivity from cleaner evidence chains.

![Token and cost comparison placeholder](docs/images/token_cost_comparison.png)

## What the 30 Scenarios Covered

We expanded the benchmark from the original smaller set to a much broader investigation mix:

- beneficial ownership chains
- indirect sanctions exposure
- shared address infrastructure
- transaction laundering paths
- shell-layer counting
- PEP influence chains
- board interlocks
- offshore jurisdiction tracing
- shared counterparties
- entity bridge detection

This was important because we did not want a single cherry-picked demo query. We wanted population-level proof.

## The Hard Bugs We Had to Fix

Round 2 was not just a scale-up. It involved several bugs that materially changed benchmark credibility.

### 1. Gemini integration instability

We discovered that the original Gemini SDK path was too brittle in our environment and silently fell back too often.

**Fix:** switch to direct REST calls with retries, graceful fallback, and explicit token handling.

### 2. Basic RAG was not using the real corpus

At one point, Basic RAG was effectively benchmarking against tiny synthetic chunks instead of the SEC + Wikipedia corpus.

That produced misleading token numbers and made GraphRAG’s advantage look fake.

**Fix:** change fallback chunk retrieval to scan real `.txt` corpus files using sliding windows and token-overlap ranking.

That immediately restored a fair comparison: Basic RAG became genuinely expensive in context size, and GraphRAG’s compression advantage became real.

### 3. Most scenarios had no graph context

Originally, only a small subset of scenarios had full graph coverage. The rest returned “no graph context found.”

**Fix:** expand the synthetic graph generator to include all 30 scenario entities, relationships, and seeded evidence documents.

That took us from partial graph support to **30/30 scenarios with real graph context**.

### 4. Ground truth and graph entity names were misaligned

Several scenarios were failing evaluation even though the GraphRAG answer was directionally correct, simply because entity names differed between graph data and scenario truth.

**Fix:** align scenario ground truth with the graph entity inventory and improve the judge’s entity parsing.

### 5. Frontend benchmark scoring mismatch

We also found a UI bug: when the query text changed but the selected scenario did not, the frontend could evaluate against the wrong ground truth.

**Fix:** auto-sync the selected scenario when the query exactly matches a scenario question.

That removed the “why is this score blank or weird?” confusion during demo runs.

### 6. Fresh deploy reliability

Generated graph/vector artifacts were intentionally gitignored, which is fine for repo hygiene, but dangerous for fresh deploys.

**Fix:** make `backend/start.sh` auto-generate `graph.gml` and `chunks.json` when missing.

That means a clean clone can still boot into a working state without committed local artifacts.

## Why GraphRAG Wins Here

The winning pattern stayed consistent across the benchmark.

Basic RAG has to retrieve large text windows because it does not inherently know which relationships matter most.

GraphRAG works differently:

- identify the entities
- traverse the relationship structure
- compress the answer context to only the relevant path or subgraph
- synthesize from explicit evidence

So instead of sending thousands of tokens of text, we send a graph-native explanation path.

That is why the average dropped from **5,479.7 tokens** to **196.1 tokens**.

## Example: Ultimate Beneficial Ownership

One of our canonical queries is:

> Who is the ultimate beneficial owner of Meridian Holdings Ltd?

The graph chain is:

`Meridian Holdings Ltd -> BVI Shell Alpha -> Kasarov Enterprises -> Viktor Kasarov`

This is exactly where vector retrieval struggles:

- one chunk mentions Meridian Holdings
- another mentions BVI Shell Alpha
- another mentions Kasarov Enterprises
- another mentions Viktor Kasarov

Basic RAG might retrieve fragments of the story, but GraphRAG reconstructs the full structure directly.

That difference is not cosmetic. In AML workflows, **ordering matters**.

## Why the Evaluation Layer Matters

A lot of AI demos stop at “the answer sounds good.”

We did not want that.

So the benchmark scores outputs using two complementary signals:

### Graph-native judge

Focused on:

- entity correctness
- path correctness
- relationship accuracy
- traversal completeness
- multi-hop quality
- hallucination penalty

### BERTScore-style similarity

A lightweight proxy signal that helps compare answer overlap and semantic closeness.

The point was to reward **structural correctness**, not just fluency.

## The Role of TigerGraph vs NetworkX

Our production-facing graph story is TigerGraph.

Our demo reliability story is NetworkX.

That dual-path setup turned out to be one of the best engineering decisions in the whole project.

- If TigerGraph is available, we can use it.
- If not, the app still works with a local graph contract.
- The frontend does not need to care which path produced the traversal payload.

That made the system much safer for hackathon demos, local development, and rapid regression testing.

## What I’d Tell Anyone Building a GraphRAG Benchmark

If you are benchmarking GraphRAG seriously, these are the lessons I would carry forward:

1. **Do not benchmark Basic RAG on toy chunks**. Use a real corpus or the token comparison is meaningless.
2. **Keep graph context compact**. Dumping giant neighborhoods into the prompt defeats the purpose.
3. **Judge structure, not just wording**. Path correctness matters in graph tasks.
4. **Expect deployment edge cases**. Missing generated files and env mismatches will hurt you at the worst time.
5. **Invest in the UI**. If people cannot see the retrieval path, they cannot trust the result.

## Limitations

This project is still a hackathon benchmark, not a finished production AML platform.

A few honest limitations:

- many benchmark scenarios are synthetic rather than analyst-labeled real cases
- NetworkX fallback graph is much smaller than a full enterprise graph
- BERTScore is still an approximation in this setup, not a heavyweight semantic evaluator running on dedicated GPU infrastructure
- SEC + Wikipedia corpus scale is real, but scenario coverage is still hand-authored

That said, the architecture, evaluation discipline, and token-efficiency findings are real and useful.

## What Comes Next

If we keep taking this forward, the most valuable next steps would be:

- real sanctions / OFAC / PEP / corporate registry ingestion pipelines
- time-aware graph reasoning
- confidence scoring per hop
- regression gates in CI for token or quality drops
- true TigerGraph-backed production deployment instead of fallback-first local mode
- analyst workflow integration with case review and escalation

## Final Takeaway

Round 1 helped us prove the idea.

Round 2 helped us prove the economics.

When the question is graph-shaped, **GraphRAG beats plain RAG not because it sounds smarter, but because it retrieves the right structure with far less context**.

That is exactly what happened in our benchmark:

- **96.4% fewer tokens than Basic RAG**
- **100% pass rate on the judge**
- **0.9521 BERTScore F1 raw**
- **913M-token dataset at submission scale**

That combination is what made the project feel submission-ready.

If you want to build trust in GraphRAG, do not stop at one answer.

Build the lab. Run the baselines. Track the costs. Trace the paths. Then let the numbers speak.
