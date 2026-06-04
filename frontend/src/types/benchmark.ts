export interface Scenario {
  id: string;
  category: string;
  query: string;
  ground_truth: string;
  expected_graphrag_advantage: string;
  tags: string[];
}

export interface GraphNode {
  id: string;
  type: string;
  risk_score: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  weight?: number | string;
}

export interface PipelineResult {
  pipeline: string;
  answer: string;
  tokens_input: number;
  tokens_output: number;
  tokens_total: number;
  latency_ms: number;
  cost_usd: number;
  retrieval_context?: string[];
  reasoning_path?: string[];
  graph_nodes?: GraphNode[];
  graph_edges?: GraphEdge[];
}

export interface LlmJudgeScore {
  total_score: number;
  reasoning: string;
  entity_correctness: number;
  path_correctness: number;
  relationship_accuracy: number;
  traversal_completeness: number;
  multi_hop_quality: number;
  hallucination_penalty: number;
}

export interface EvaluationResult {
  type?: 'evaluation';
  pipeline: string;
  bert_score: { precision: number; recall: number; f1: number };
  llm_judge: LlmJudgeScore;
  token_reduction_pct: number;
}

export interface SummaryResult {
  type: 'summary';
  winner: string;
  wins: {
    tokens_total: boolean;
    latency_ms: boolean;
    cost_usd: boolean;
    judge_score: boolean;
  };
  deltas_vs_llm_only: {
    tokens_reduction_pct: number;
    latency_reduction_pct: number;
    cost_reduction_pct: number;
    judge_improvement_pct: number;
  };
}

export type StreamEvent = PipelineResult | EvaluationResult | SummaryResult;

export interface PipelineAggregate {
  pipeline: string;
  avg_tokens_total: number;
  stdev_tokens_total: number;
  avg_latency_ms: number;
  stdev_latency_ms: number;
  avg_cost_usd: number;
  stdev_cost_usd: number;
  avg_judge_score: number;
  stdev_judge_score: number;
  win_rate: number;
}

export interface LeaderboardEntry extends PipelineAggregate {
  rank: number;
  rank_score: number;
  efficiency_components: {
    judge_eff: number;
    win_rate_eff: number;
    latency_eff: number;
    cost_eff: number;
    tokens_eff: number;
  };
}

export interface AdvantageDelta {
  tokens_reduction_pct: number;
  latency_reduction_pct: number;
  cost_reduction_pct: number;
  judge_improvement_pct: number;
}

export interface ScenarioSweepRun {
  run_index: number;
  results: PipelineResult[];
  evaluations: EvaluationResult[];
  summary: SummaryResult;
}

export interface ScenarioSweepResult {
  scenario_id: string;
  category: string;
  query: string;
  runs: ScenarioSweepRun[];
  pipeline_aggregates: PipelineAggregate[];
}

export interface SweepResponse {
  sweep_id: string;
  scenario_results: ScenarioSweepResult[];
  pipeline_aggregates: PipelineAggregate[];
  leaderboard: LeaderboardEntry[];
  graphrag_advantage_summary: {
    vs_llm_only: AdvantageDelta;
    vs_vector_rag: AdvantageDelta;
  };
}

export type BenchmarkMode = 'single' | 'sweep';

export interface RunHistoryEntry {
  id: string;
  timestamp: string;
  mode: BenchmarkMode;
  winner: string;
  tokensReductionPct: number;
  latencyReductionPct: number;
  costReductionPct: number;
  judgeImprovementPct: number;
  scenarioId?: string;
  scenarioCategory?: string;
  sweepId?: string;
  sweepScenarioCount?: number;
  sweepRunsPerScenario?: number;
  scenarioBreakdown?: Array<{
    scenarioId: string;
    winner: string;
    tokensReductionPct: number;
    latencyReductionPct: number;
    costReductionPct: number;
    judgeImprovementPct: number;
  }>;
}

export type DashboardView = 'overview' | 'evidence' | 'graph';

export interface BenchmarkReportAggregate {
  avg_token_reduction_vs_basic_rag: number;
  llm_judge_pass_rate: number;
  avg_bertscore_f1_raw: number;
  bonus_judge_achieved: boolean;
  bonus_bertscore_achieved: boolean;
}

export interface BenchmarkReportScenarioResult {
  scenario_id: string;
  query: string;
  token_reduction_vs_basic_rag: number;
  accuracy: {
    llm_judge: {
      passed: boolean;
      score: number;
      verdict: 'PASS' | 'FAIL' | string;
    };
    bertscore: {
      f1_raw: number;
      f1_rescaled: number;
      passes_raw: boolean;
      passes_rescaled: boolean;
    };
  };
}

export interface BenchmarkReport {
  generated_at_utc: string;
  dataset_tokens: number;
  dataset_sources: string[];
  token_counting_model: string;
  scenarios_tested: number;
  aggregate: BenchmarkReportAggregate;
  results: BenchmarkReportScenarioResult[];
}
