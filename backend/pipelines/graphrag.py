from __future__ import annotations

import time

from pipelines.base import PipelineResult
from pipelines.pipeline3_graphrag import run_graphrag


async def pipeline_graphrag(query: str, model: str | None) -> PipelineResult:
    _ = model
    start = time.perf_counter()
    result = await run_graphrag(query)
    latency_ms = (time.perf_counter() - start) * 1000

    retrieval_context = []
    graph_context = result.get("graph_context")
    if graph_context:
        retrieval_context.append(f"Graph context: {graph_context}")

    return PipelineResult(
        pipeline="GraphRAG",
        answer=result["answer"],
        tokens_input=int(result["prompt_tokens"]),
        tokens_output=int(result["completion_tokens"]),
        tokens_total=int(result["total_tokens"]),
        latency_ms=latency_ms,
        cost_usd=float(result["cost_usd"]),
        retrieval_context=retrieval_context,
        reasoning_path=result.get("reasoning_path", []),
        graph_nodes=result.get("graph_nodes", []),
        graph_edges=result.get("graph_edges", []),
    )
