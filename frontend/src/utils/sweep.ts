import type {
  EvaluationResult,
  PipelineResult,
  ScenarioSweepResult,
  SummaryResult,
  SweepResponse,
} from '../types/benchmark';

export interface PipelineAccumulator {
  runs: number;
  tokensTotal: number;
  latencyTotal: number;
  costTotal: number;
  judgeTotal: number;
  wins: number;
}

export interface SweepPresentationSummary {
  runCount: number;
  scenarioCount: number;
  pipeline: Record<
    string,
    {
      avgTokens: number;
      avgLatency: number;
      avgCost: number;
      avgJudge: number;
      winRate: number;
    }
  >;
}

function ensureAccumulator(map: Map<string, PipelineAccumulator>, pipeline: string): PipelineAccumulator {
  const existing = map.get(pipeline);
  if (existing) {
    return existing;
  }
  const created: PipelineAccumulator = {
    runs: 0,
    tokensTotal: 0,
    latencyTotal: 0,
    costTotal: 0,
    judgeTotal: 0,
    wins: 0,
  };
  map.set(pipeline, created);
  return created;
}

export function reduceSweepSummary(sweep: SweepResponse): SweepPresentationSummary {
  const acc = new Map<string, PipelineAccumulator>();
  let runCount = 0;

  for (const scenario of sweep.scenario_results) {
    for (const run of scenario.runs) {
      runCount += 1;
      for (const result of run.results) {
        const bucket = ensureAccumulator(acc, result.pipeline);
        bucket.runs += 1;
        bucket.tokensTotal += result.tokens_total;
        bucket.latencyTotal += result.latency_ms;
        bucket.costTotal += result.cost_usd;
      }
      for (const evaluation of run.evaluations) {
        const bucket = ensureAccumulator(acc, evaluation.pipeline);
        bucket.judgeTotal += evaluation.llm_judge.total_score;
      }
      const winner = run.summary.winner;
      if (winner) {
        const bucket = ensureAccumulator(acc, winner);
        bucket.wins += 1;
      }
    }
  }

  const pipelineSummary: SweepPresentationSummary['pipeline'] = {};

  for (const [pipeline, bucket] of acc.entries()) {
    const safeRuns = bucket.runs || 1;
    const safeBenchmarkRuns = runCount || 1;
    pipelineSummary[pipeline] = {
      avgTokens: bucket.tokensTotal / safeRuns,
      avgLatency: bucket.latencyTotal / safeRuns,
      avgCost: bucket.costTotal / safeRuns,
      avgJudge: bucket.judgeTotal / safeRuns,
      winRate: bucket.wins / safeBenchmarkRuns,
    };
  }

  return {
    runCount,
    scenarioCount: sweep.scenario_results.length,
    pipeline: pipelineSummary,
  };
}

export interface SweepTrendPoint {
  runLabel: string;
  judge: number;
  winRate: number;
}

export function buildGraphRagTrendData(sweep: SweepResponse): SweepTrendPoint[] {
  const points: SweepTrendPoint[] = [];

  for (const scenario of sweep.scenario_results) {
    let graphragWins = 0;

    scenario.runs.forEach((run, index) => {
      const graphEval = run.evaluations.find((entry) => entry.pipeline === 'GraphRAG');
      if (run.summary.winner === 'GraphRAG') {
        graphragWins += 1;
      }

      points.push({
        runLabel: `${scenario.scenario_id}-R${index + 1}`,
        judge: graphEval?.llm_judge.total_score ?? 0,
        winRate: graphragWins / (index + 1),
      });
    });
  }

  return points;
}

export function findLatestScenarioSummary(sweep: SweepResponse): SummaryResult | null {
  const lastScenario = sweep.scenario_results[sweep.scenario_results.length - 1];
  if (!lastScenario || lastScenario.runs.length === 0) {
    return null;
  }
  return lastScenario.runs[lastScenario.runs.length - 1].summary;
}

export function indexPipelineResults(results: PipelineResult[]): Record<string, PipelineResult> {
  const indexed: Record<string, PipelineResult> = {};
  for (const result of results) {
    indexed[result.pipeline] = result;
  }
  return indexed;
}

export function indexEvaluationResults(results: EvaluationResult[]): Record<string, EvaluationResult> {
  const indexed: Record<string, EvaluationResult> = {};
  for (const result of results) {
    indexed[result.pipeline] = result;
  }
  return indexed;
}

export function flattenScenarioRuns(scenarioResults: ScenarioSweepResult[]): Array<{
  scenarioId: string;
  runIndex: number;
  summary: SummaryResult;
}> {
  const flattened: Array<{ scenarioId: string; runIndex: number; summary: SummaryResult }> = [];

  for (const scenario of scenarioResults) {
    for (const run of scenario.runs) {
      flattened.push({
        scenarioId: scenario.scenario_id,
        runIndex: run.run_index,
        summary: run.summary,
      });
    }
  }

  return flattened;
}
