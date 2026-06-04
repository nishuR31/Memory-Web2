from __future__ import annotations

import time

from utils.gemini import generate_text, gemini_pricing_usd


async def run_llm_only(query: str) -> dict:
    prompt = (
        "You are a financial crime analyst. Answer the following question using only your "
        "training knowledge.\n\n"
        f"Question: {query}\n\n"
        "Provide a clear, factual answer."
    )

    start = time.time()
    result = generate_text(
        prompt,
        system_instruction="Financial-crime analysis baseline mode. No retrieval context.",
        fallback_text=(
            "Baseline answer unavailable from live model. "
            "No retrieval context was used in this pipeline."
        ),
    )
    latency = round(time.time() - start, 3)

    return {
        "pipeline": "LLM-Only",
        "answer": result.text,
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": result.completion_tokens,
        "total_tokens": result.prompt_tokens + result.completion_tokens,
        "tokens_total": result.prompt_tokens + result.completion_tokens,
        "latency_seconds": latency,
        "latency_ms": round(latency * 1000, 1),
        "cost_usd": round(gemini_pricing_usd(result.prompt_tokens, result.completion_tokens), 6),
    }
