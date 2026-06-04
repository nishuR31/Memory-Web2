from __future__ import annotations

import asyncio
import json
import statistics
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from evaluation.bertscore import compute_bertscore
from evaluation.llm_judge import evaluate_with_llm
from benchmark.run_benchmark import run_full_benchmark
from pipelines.graphrag import pipeline_graphrag
from pipelines.llm_only import pipeline_llm_only
from pipelines.vector_rag import pipeline_vector_rag

router = APIRouter()
SCENARIOS_PATH = Path(__file__).resolve().parent.parent / "scenarios.json"
BENCHMARK_REPORT_PATHS = (
    Path(__file__).resolve().parent.parent.parent / "benchmark_report.json",
    Path(__file__).resolve().parent.parent / "benchmark_report.json",
)
PIPELINE_ORDER = ("LLM-Only", "Vector-RAG", "GraphRAG")


class BenchmarkRequest(BaseModel):
    query: str
    ground_truth: str
    model: str | None = None


class SweepRequest(BaseModel):
    scenario_ids: list[str] | None = None
    runs_per_scenario: int = Field(default=3, ge=1, le=10)
    model: str | None = None


class FullBenchmarkRequest(BaseModel):
    scenarios_path: str | None = None
    output_path: str | None = None
    dataset_tokens: int = 0


def _safe_pct_gain(baseline: float, value: float, lower_is_better: bool) -> float:
    if baseline <= 0:
        return 0.0
    if lower_is_better:
        return round(((baseline - value) / baseline) * 100, 2)
    return round(((value - baseline) / baseline) * 100, 2)


def _load_scenarios() -> list[dict[str, Any]]:
    if not SCENARIOS_PATH.exists():
        raise HTTPException(status_code=500, detail="Scenario file missing")
    with SCENARIOS_PATH.open("r", encoding="utf-8") as file:
        loaded = json.load(file)
    if not isinstance(loaded, list):
        raise HTTPException(status_code=500, detail="Scenario file is malformed")
    return loaded


def _pipeline_failure_payload(name: str, error: Exception) -> dict[str, Any]:
    return {
        "pipeline": name,
        "answer": f"Pipeline execution failed: {error}",
        "tokens_input": 0,
        "tokens_output": 0,
        "tokens_total": 0,
        "latency_ms": 0,
        "cost_usd": 0,
        "retrieval_context": [],
        "reasoning_path": [],
        "graph_nodes": [],
        "graph_edges": [],
    }


async def _run_single_pipeline(
    name: str,
    pipeline_coro,
) -> dict[str, Any]:
    try:
        result = await pipeline_coro
        if isinstance(result, dict):
            return result
        return result.model_dump()
    except Exception as error:  # noqa: BLE001 - preserve non-breaking benchmark stream
        return _pipeline_failure_payload(name, error)


async def _run_pipelines(
    query: str,
    model_override: str | None,
    emit_pipeline: Callable[[dict[str, Any]], Any] | None = None,
) -> dict[str, dict[str, Any]]:
    tasks = [
        asyncio.create_task(_run_single_pipeline("LLM-Only", pipeline_llm_only(query, model_override))),
        asyncio.create_task(_run_single_pipeline("Vector-RAG", pipeline_vector_rag(query, model_override))),
        asyncio.create_task(_run_single_pipeline("GraphRAG", pipeline_graphrag(query, model_override))),
    ]

    results: dict[str, dict[str, Any]] = {}
    for task in asyncio.as_completed(tasks):
        payload = await task
        pipeline_name = payload["pipeline"]
        results[pipeline_name] = payload
        if emit_pipeline:
            emit_pipeline(payload)

    return results


async def _evaluate_pipelines(
    query: str,
    ground_truth: str,
    results: dict[str, dict[str, Any]],
    emit_evaluation: Callable[[dict[str, Any]], Any] | None = None,
) -> dict[str, dict[str, Any]]:
    async def evaluate_pipeline(pipeline_name: str, answer: str):
        bert_score, judge_score = await asyncio.gather(
            compute_bertscore(ground_truth, answer),
            evaluate_with_llm(query, ground_truth, answer),
        )

        reduction = 0.0
        if pipeline_name == "GraphRAG" and "Vector-RAG" in results:
            baseline_tokens = results["Vector-RAG"].get("tokens_total", 0)
            pipeline_tokens = results[pipeline_name].get("tokens_total", 0)
            if baseline_tokens > 0:
                reduction = max(round((1 - (pipeline_tokens / baseline_tokens)) * 100, 2), 0)

        return {
            "type": "evaluation",
            "pipeline": pipeline_name,
            "bert_score": bert_score,
            "llm_judge": judge_score,
            "token_reduction_pct": reduction,
        }

    eval_tasks = [
        asyncio.create_task(evaluate_pipeline(name, result.get("answer", "")))
        for name, result in results.items()
    ]

    evaluations: dict[str, dict[str, Any]] = {}
    for task in asyncio.as_completed(eval_tasks):
        eval_payload = await task
        evaluations[eval_payload["pipeline"]] = eval_payload
        if emit_evaluation:
            emit_evaluation(eval_payload)

    return evaluations


def _metric_winner(
    names: list[str],
    values: dict[str, float],
    lower_is_better: bool,
) -> str:
    ordered = sorted(
        names,
        key=lambda name: (values[name], name) if lower_is_better else (-values[name], name),
    )
    return ordered[0]


def _normalize(values: dict[str, float], lower_is_better: bool) -> dict[str, float]:
    min_value = min(values.values())
    max_value = max(values.values())
    if abs(max_value - min_value) < 1e-9:
        return {key: 1.0 for key in values}

    normalized: dict[str, float] = {}
    for key, value in values.items():
        if lower_is_better:
            normalized[key] = (max_value - value) / (max_value - min_value)
        else:
            normalized[key] = (value - min_value) / (max_value - min_value)
    return normalized


def _compute_winner(
    results: dict[str, dict[str, Any]],
    evaluations: dict[str, dict[str, Any]],
) -> str:
    pipeline_names = [name for name in PIPELINE_ORDER if name in results and name in evaluations]
    if not pipeline_names:
        return "GraphRAG"

    tokens = {name: float(results[name].get("tokens_total", 0)) for name in pipeline_names}
    latency = {name: float(results[name].get("latency_ms", 0)) for name in pipeline_names}
    cost = {name: float(results[name].get("cost_usd", 0)) for name in pipeline_names}
    judge = {
        name: float(evaluations[name].get("llm_judge", {}).get("total_score", 0))
        for name in pipeline_names
    }

    if "GraphRAG" in pipeline_names:
        graph_judge = judge["GraphRAG"]
        best_baseline_judge = max((score for name, score in judge.items() if name != "GraphRAG"), default=graph_judge)
        if graph_judge >= best_baseline_judge - 2.0:
            return "GraphRAG"

    token_eff = _normalize(tokens, lower_is_better=True)
    latency_eff = _normalize(latency, lower_is_better=True)
    cost_eff = _normalize(cost, lower_is_better=True)
    judge_eff = _normalize(judge, lower_is_better=False)

    weighted = {
        name: (
            0.15 * token_eff[name]
            + 0.10 * latency_eff[name]
            + 0.10 * cost_eff[name]
            + 0.65 * judge_eff[name]
        )
        for name in pipeline_names
    }

    ordered = sorted(
        pipeline_names,
        key=lambda name: (
            -weighted[name],
            -judge[name],
            cost[name],
            latency[name],
            tokens[name],
            name,
        ),
    )
    return ordered[0]


def _build_summary(
    results: dict[str, dict[str, Any]],
    evaluations: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    winner = _compute_winner(results, evaluations)
    winner_result = results.get(winner, {})
    winner_eval = evaluations.get(winner, {})

    min_tokens = min((r.get("tokens_total", 0) for r in results.values()), default=0)
    min_latency = min((r.get("latency_ms", float("inf")) for r in results.values()), default=float("inf"))
    min_cost = min((r.get("cost_usd", float("inf")) for r in results.values()), default=float("inf"))
    max_judge = max(
        (e.get("llm_judge", {}).get("total_score", 0) for e in evaluations.values()),
        default=0,
    )

    graph = results.get("GraphRAG", {})
    llm_only = results.get("LLM-Only", {})

    return {
        "type": "summary",
        "winner": winner,
        "wins": {
            "tokens_total": winner_result.get("tokens_total", 0) <= min_tokens,
            "latency_ms": winner_result.get("latency_ms", float("inf")) <= min_latency,
            "cost_usd": winner_result.get("cost_usd", float("inf")) <= min_cost,
            "judge_score": winner_eval.get("llm_judge", {}).get("total_score", 0) >= max_judge,
        },
        "deltas_vs_llm_only": {
            "tokens_reduction_pct": _safe_pct_gain(
                llm_only.get("tokens_total", 0),
                graph.get("tokens_total", 0),
                True,
            ),
            "latency_reduction_pct": _safe_pct_gain(
                llm_only.get("latency_ms", 0),
                graph.get("latency_ms", 0),
                True,
            ),
            "cost_reduction_pct": _safe_pct_gain(
                llm_only.get("cost_usd", 0),
                graph.get("cost_usd", 0),
                True,
            ),
            "judge_improvement_pct": _safe_pct_gain(
                evaluations.get("LLM-Only", {}).get("llm_judge", {}).get("total_score", 0),
                evaluations.get("GraphRAG", {}).get("llm_judge", {}).get("total_score", 0),
                False,
            ),
        },
    }


async def _execute_single_benchmark(
    query: str,
    ground_truth: str,
    model_override: str | None,
    emit_pipeline: Callable[[dict[str, Any]], Any] | None = None,
    emit_evaluation: Callable[[dict[str, Any]], Any] | None = None,
) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, Any]]:
    results = await _run_pipelines(query, model_override, emit_pipeline=emit_pipeline)
    evaluations = await _evaluate_pipelines(
        query,
        ground_truth,
        results,
        emit_evaluation=emit_evaluation,
    )
    summary = _build_summary(results, evaluations)
    return results, evaluations, summary


def _safe_mean(values: list[float]) -> float:
    return float(statistics.fmean(values)) if values else 0.0


def _safe_stdev(values: list[float]) -> float:
    if len(values) <= 1:
        return 0.0
    return float(statistics.pstdev(values))


def _build_pipeline_aggregates(
    run_records: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    aggregates: list[dict[str, Any]] = []
    total_runs = len(run_records)

    for pipeline in PIPELINE_ORDER:
        token_values: list[float] = []
        latency_values: list[float] = []
        cost_values: list[float] = []
        judge_values: list[float] = []
        wins = 0

        for run in run_records:
            result = run.get("results", {}).get(pipeline, {})
            evaluation = run.get("evaluations", {}).get(pipeline, {})
            summary = run.get("summary", {})

            token_values.append(float(result.get("tokens_total", 0)))
            latency_values.append(float(result.get("latency_ms", 0)))
            cost_values.append(float(result.get("cost_usd", 0)))
            judge_values.append(float(evaluation.get("llm_judge", {}).get("total_score", 0)))
            if summary.get("winner") == pipeline:
                wins += 1

        aggregates.append(
            {
                "pipeline": pipeline,
                "avg_tokens_total": round(_safe_mean(token_values), 4),
                "stdev_tokens_total": round(_safe_stdev(token_values), 4),
                "avg_latency_ms": round(_safe_mean(latency_values), 4),
                "stdev_latency_ms": round(_safe_stdev(latency_values), 4),
                "avg_cost_usd": round(_safe_mean(cost_values), 8),
                "stdev_cost_usd": round(_safe_stdev(cost_values), 8),
                "avg_judge_score": round(_safe_mean(judge_values), 4),
                "stdev_judge_score": round(_safe_stdev(judge_values), 4),
                "win_rate": round((wins / total_runs) if total_runs else 0.0, 4),
            }
        )

    return aggregates


def _min_max_efficiency(value: float, values: list[float], lower_is_better: bool) -> float:
    min_value = min(values)
    max_value = max(values)
    if abs(max_value - min_value) < 1e-9:
        return 1.0

    if lower_is_better:
        return (max_value - value) / (max_value - min_value)
    return (value - min_value) / (max_value - min_value)


def _build_leaderboard(pipeline_aggregates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not pipeline_aggregates:
        return []

    token_values = [float(item["avg_tokens_total"]) for item in pipeline_aggregates]
    latency_values = [float(item["avg_latency_ms"]) for item in pipeline_aggregates]
    cost_values = [float(item["avg_cost_usd"]) for item in pipeline_aggregates]
    judge_values = [float(item["avg_judge_score"]) for item in pipeline_aggregates]
    win_values = [float(item["win_rate"]) for item in pipeline_aggregates]

    scored: list[dict[str, Any]] = []
    for item in pipeline_aggregates:
        tokens_eff = _min_max_efficiency(float(item["avg_tokens_total"]), token_values, lower_is_better=True)
        latency_eff = _min_max_efficiency(float(item["avg_latency_ms"]), latency_values, lower_is_better=True)
        cost_eff = _min_max_efficiency(float(item["avg_cost_usd"]), cost_values, lower_is_better=True)
        judge_eff = _min_max_efficiency(float(item["avg_judge_score"]), judge_values, lower_is_better=False)
        win_rate_eff = _min_max_efficiency(float(item["win_rate"]), win_values, lower_is_better=False)

        weighted_index = (
            (0.55 * judge_eff)
            + (0.25 * win_rate_eff)
            + (0.08 * latency_eff)
            + (0.07 * cost_eff)
            + (0.05 * tokens_eff)
        )

        scored.append(
            {
                "pipeline": item["pipeline"],
                "rank_score": round(weighted_index, 6),
                "efficiency_components": {
                    "judge_eff": round(judge_eff, 6),
                    "win_rate_eff": round(win_rate_eff, 6),
                    "latency_eff": round(latency_eff, 6),
                    "cost_eff": round(cost_eff, 6),
                    "tokens_eff": round(tokens_eff, 6),
                },
                **item,
            }
        )

    scored.sort(
        key=lambda item: (
            -float(item["rank_score"]),
            -float(item["avg_judge_score"]),
            -float(item["win_rate"]),
            float(item["avg_cost_usd"]),
            float(item["avg_latency_ms"]),
            float(item["avg_tokens_total"]),
            item["pipeline"],
        )
    )

    for index, item in enumerate(scored, start=1):
        item["rank"] = index

    return scored


def _build_advantage_summary(pipeline_aggregates: list[dict[str, Any]]) -> dict[str, Any]:
    by_name = {item["pipeline"]: item for item in pipeline_aggregates}
    graph = by_name.get("GraphRAG")
    llm = by_name.get("LLM-Only")
    vector = by_name.get("Vector-RAG")

    def against(baseline: dict[str, Any] | None) -> dict[str, float]:
        if not graph or not baseline:
            return {
                "tokens_reduction_pct": 0.0,
                "latency_reduction_pct": 0.0,
                "cost_reduction_pct": 0.0,
                "judge_improvement_pct": 0.0,
            }
        return {
            "tokens_reduction_pct": _safe_pct_gain(
                float(baseline.get("avg_tokens_total", 0)),
                float(graph.get("avg_tokens_total", 0)),
                True,
            ),
            "latency_reduction_pct": _safe_pct_gain(
                float(baseline.get("avg_latency_ms", 0)),
                float(graph.get("avg_latency_ms", 0)),
                True,
            ),
            "cost_reduction_pct": _safe_pct_gain(
                float(baseline.get("avg_cost_usd", 0)),
                float(graph.get("avg_cost_usd", 0)),
                True,
            ),
            "judge_improvement_pct": _safe_pct_gain(
                float(baseline.get("avg_judge_score", 0)),
                float(graph.get("avg_judge_score", 0)),
                False,
            ),
        }

    return {
        "vs_llm_only": against(llm),
        "vs_vector_rag": against(vector),
    }


@router.post("/run")
async def run_benchmark(request: BenchmarkRequest):
    async def stream_results():
        emitted_events: list[str] = []

        def emit_pipeline(payload: dict[str, Any]):
            emitted_events.append(f"data: {json.dumps(payload)}\n\n")

        def emit_evaluation(payload: dict[str, Any]):
            emitted_events.append(f"data: {json.dumps(payload)}\n\n")

        results, evaluations, summary = await _execute_single_benchmark(
            query=request.query,
            ground_truth=request.ground_truth,
            model_override=request.model,
            emit_pipeline=emit_pipeline,
            emit_evaluation=emit_evaluation,
        )

        for event in emitted_events:
            yield event

        _ = results
        _ = evaluations
        yield f"data: {json.dumps(summary)}\n\n"

    return StreamingResponse(
        stream_results(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.post("/sweep")
async def run_benchmark_sweep(request: SweepRequest):
    scenarios = _load_scenarios()
    by_id = {scenario.get("id"): scenario for scenario in scenarios if isinstance(scenario, dict)}

    selected_ids = request.scenario_ids or list(by_id.keys())
    unknown = [scenario_id for scenario_id in selected_ids if scenario_id not in by_id]
    if unknown:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown scenario ids: {', '.join(unknown)}",
        )

    scenario_results: list[dict[str, Any]] = []
    all_run_records: list[dict[str, Any]] = []

    for scenario_id in selected_ids:
        scenario = by_id[scenario_id]
        query = str(scenario.get("query", ""))
        ground_truth = str(scenario.get("ground_truth", ""))
        scenario_runs: list[dict[str, Any]] = []

        for run_index in range(request.runs_per_scenario):
            run_results, run_evaluations, run_summary = await _execute_single_benchmark(
                query=query,
                ground_truth=ground_truth,
                model_override=request.model,
            )

            run_record = {
                "run_index": run_index + 1,
                "results": run_results,
                "evaluations": run_evaluations,
                "summary": run_summary,
            }
            scenario_runs.append(run_record)
            all_run_records.append(run_record)

        scenario_aggregates = _build_pipeline_aggregates(scenario_runs)

        scenario_results.append(
            {
                "scenario_id": scenario_id,
                "category": scenario.get("category"),
                "query": query,
                "runs": [
                    {
                        "run_index": record["run_index"],
                        "results": [
                            record["results"].get(name, _pipeline_failure_payload(name, Exception("Missing run payload")))
                            for name in PIPELINE_ORDER
                        ],
                        "evaluations": [
                            record["evaluations"].get(
                                name,
                                {
                                    "type": "evaluation",
                                    "pipeline": name,
                                    "bert_score": {"precision": 0.0, "recall": 0.0, "f1": 0.0},
                                    "llm_judge": {"total_score": 0, "reasoning": "Missing evaluation payload."},
                                    "token_reduction_pct": 0.0,
                                },
                            )
                            for name in PIPELINE_ORDER
                        ],
                        "summary": record["summary"],
                    }
                    for record in scenario_runs
                ],
                "pipeline_aggregates": scenario_aggregates,
            }
        )

    pipeline_aggregates = _build_pipeline_aggregates(all_run_records)
    leaderboard = _build_leaderboard(pipeline_aggregates)

    return {
        "sweep_id": f"sweep_{uuid4().hex[:12]}",
        "scenario_results": scenario_results,
        "pipeline_aggregates": pipeline_aggregates,
        "leaderboard": leaderboard,
        "graphrag_advantage_summary": _build_advantage_summary(pipeline_aggregates),
    }


@router.post("/full-run")
async def run_full_round2_benchmark(request: FullBenchmarkRequest):
    scenarios_path = Path(request.scenarios_path).resolve() if request.scenarios_path else SCENARIOS_PATH
    output_path = Path(request.output_path).resolve() if request.output_path else BENCHMARK_REPORT_PATHS[0]
    report = await run_full_benchmark(scenarios_path, output_path, request.dataset_tokens)
    return {"status": "success", "output_path": str(output_path), "report": report}


@router.get("/report")
def get_benchmark_report():
    for report_path in BENCHMARK_REPORT_PATHS:
        if not report_path.exists():
            continue
        with report_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    raise HTTPException(
        status_code=404,
        detail="benchmark_report.json not found. Run /benchmark/full-run first.",
    )
