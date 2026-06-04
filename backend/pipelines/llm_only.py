from __future__ import annotations

import time

from pipelines.base import PipelineResult
from pipelines.pipeline1_llm_only import run_llm_only


async def pipeline_llm_only(query: str, model: str | None) -> PipelineResult:
    _ = model
    start = time.perf_counter()
    result = await run_llm_only(query)
    latency_ms = (time.perf_counter() - start) * 1000

    return PipelineResult(
        pipeline="LLM-Only",
        answer=result["answer"],
        tokens_input=int(result["prompt_tokens"]),
        tokens_output=int(result["completion_tokens"]),
        tokens_total=int(result["total_tokens"]),
        latency_ms=latency_ms,
        cost_usd=float(result["cost_usd"]),
        retrieval_context=None,
        reasoning_path=None,
    )
