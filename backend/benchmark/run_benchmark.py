from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from evaluation.bertscore_eval import evaluate_bertscore
from evaluation.llm_as_judge import llm_judge
from pipelines.pipeline1_llm_only import run_llm_only
from pipelines.pipeline2_basic_rag import run_basic_rag
from pipelines.pipeline3_graphrag import run_graphrag


async def run_full_benchmark(scenarios_path: Path, output_path: Path, dataset_tokens: int | None = None) -> dict:
    scenarios = json.loads(scenarios_path.read_text(encoding="utf-8"))

    results = []
    reductions = []
    judge_passes = 0
    f1_values = []

    for scenario in scenarios:
        query = scenario["query"]
        ground_truth = scenario["ground_truth"]

        p1 = await run_llm_only(query)
        p2 = await run_basic_rag(query)
        p3 = await run_graphrag(query)

        judge_p3 = llm_judge(query, ground_truth, p3["answer"])
        bert_p3 = evaluate_bertscore([p3["answer"]], [ground_truth])

        p2_total = max(float(p2.get("total_tokens", 0)), 1.0)
        p3_total = float(p3.get("total_tokens", 0))
        token_reduction = ((p2_total - p3_total) / p2_total) * 100

        reductions.append(token_reduction)
        if judge_p3.get("passed"):
            judge_passes += 1
        f1_values.append(float(bert_p3.get("f1_raw", 0.0)))

        item = {
            "scenario_id": scenario["id"],
            "query": query,
            "pipelines": {"llm_only": p1, "basic_rag": p2, "graphrag": p3},
            "accuracy": {"llm_judge": judge_p3, "bertscore": bert_p3},
            "token_reduction_vs_basic_rag": round(token_reduction, 1),
        }
        results.append(item)
        print(f"✓ {scenario['id']} — Token reduction: {token_reduction:.1f}%")

    avg_reduction = sum(reductions) / max(len(reductions), 1)
    pass_rate = judge_passes / max(len(results), 1)
    avg_f1 = sum(f1_values) / max(len(f1_values), 1)

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "dataset_tokens": dataset_tokens if dataset_tokens is not None else 0,
        "dataset_sources": [
            "SEC EDGAR 10-K/10-Q/8-K filings (2018-2024)",
            "Wikipedia Financial Crime corpus",
        ],
        "token_counting_model": "gemini-1.5-flash count_tokens API",
        "scenarios_tested": len(results),
        "aggregate": {
            "avg_token_reduction_vs_basic_rag": round(avg_reduction, 1),
            "llm_judge_pass_rate": round(pass_rate * 100, 1),
            "avg_bertscore_f1_raw": round(avg_f1, 4),
            "bonus_judge_achieved": pass_rate >= 0.90,
            "bonus_bertscore_achieved": avg_f1 >= 0.88,
        },
        "results": results,
    }

    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("\n🏆 SUMMARY:")
    print(f"   Token reduction: {avg_reduction:.1f}%")
    print(f"   LLM Judge pass rate: {pass_rate * 100:.1f}%")
    print(f"   BERTScore F1 (raw): {avg_f1:.4f}")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Run 30-scenario benchmark across 3 pipelines")
    parser.add_argument("--scenarios", default="../scenarios.json", help="Path to scenarios JSON")
    parser.add_argument("--output", default="../benchmark_report.json", help="Output benchmark report path")
    parser.add_argument("--dataset-tokens", type=int, default=0, help="Total verified dataset token count")
    args = parser.parse_args()

    def resolve_input_path(raw_path: str) -> Path:
        candidate = Path(raw_path)
        if candidate.is_absolute():
            return candidate

        cwd_candidate = (Path.cwd() / candidate).resolve()
        if cwd_candidate.exists():
            return cwd_candidate

        backend_candidate = (BACKEND_DIR / candidate).resolve()
        if backend_candidate.exists():
            return backend_candidate

        return (Path(__file__).resolve().parent / candidate).resolve()

    def resolve_output_path(raw_path: str) -> Path:
        candidate = Path(raw_path)
        if candidate.is_absolute():
            return candidate
        return (Path.cwd() / candidate).resolve()

    scenarios_path = resolve_input_path(args.scenarios)
    output_path = resolve_output_path(args.output)

    asyncio.run(run_full_benchmark(scenarios_path, output_path, args.dataset_tokens))


if __name__ == "__main__":
    main()
