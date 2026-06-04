from __future__ import annotations

import time

from pipelines.base import PipelineResult
from pipelines.pipeline2_basic_rag import run_basic_rag


async def pipeline_vector_rag(query: str, model: str | None, top_k: int = 10) -> PipelineResult:
    _ = model
    start = time.perf_counter()
    result = await run_basic_rag(query, top_k=top_k)
    latency_ms = (time.perf_counter() - start) * 1000

    return PipelineResult(
        pipeline="Vector-RAG",
        answer=result["answer"],
        tokens_input=int(result["prompt_tokens"]),
        tokens_output=int(result["completion_tokens"]),
        tokens_total=int(result["total_tokens"]),
        latency_ms=latency_ms,
        cost_usd=float(result["cost_usd"]),
        retrieval_context=result.get("retrieval_context", []),
        reasoning_path=None,
    )
