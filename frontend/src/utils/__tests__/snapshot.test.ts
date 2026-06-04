import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildJudgeSnapshotText,
  buildSnapshotCanvas,
  DEFAULT_SNAPSHOT_TITLE,
} from '../snapshot';
import type { LlmJudgeScore, SummaryResult, SweepResponse } from '../../types/benchmark';

const mkJudge = (totalScore: number): LlmJudgeScore => ({
  total_score: totalScore,
  reasoning: '',
  entity_correctness: 0,
  path_correctness: 0,
  relationship_accuracy: 0,
  traversal_completeness: 0,
  multi_hop_quality: 0,
  hallucination_penalty: 0,
});

const summary: SummaryResult = {
  type: 'summary',
  winner: 'GraphRAG',
  wins: {
    tokens_total: true,
    latency_ms: true,
    cost_usd: true,
    judge_score: true,
  },
  deltas_vs_llm_only: {
    tokens_reduction_pct: 21,
    latency_reduction_pct: 11,
    cost_reduction_pct: 9,
    judge_improvement_pct: 6,
  },
};

const sweep: SweepResponse = {
  sweep_id: 'sweep_test',
  scenario_results: [
    {
      scenario_id: 'SCN-001',
      category: 'cat',
      query: 'q',
      runs: [],
      pipeline_aggregates: [],
    },
  ],
  pipeline_aggregates: [
    {
      pipeline: 'GraphRAG',
      avg_tokens_total: 70,
      stdev_tokens_total: 2,
      avg_latency_ms: 100,
      stdev_latency_ms: 5,
      avg_cost_usd: 0.001,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 44,
      stdev_judge_score: 1,
      win_rate: 0.8,
    },
  ],
  leaderboard: [
    {
      pipeline: 'GraphRAG',
      rank: 1,
      rank_score: 0.9,
      avg_tokens_total: 70,
      stdev_tokens_total: 2,
      avg_latency_ms: 100,
      stdev_latency_ms: 5,
      avg_cost_usd: 0.001,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 44,
      stdev_judge_score: 1,
      win_rate: 0.8,
      efficiency_components: {
        judge_eff: 1,
        win_rate_eff: 1,
        latency_eff: 1,
        cost_eff: 1,
        tokens_eff: 1,
      },
    },
  ],
  graphrag_advantage_summary: {
    vs_llm_only: {
      tokens_reduction_pct: 21,
      latency_reduction_pct: 11,
      cost_reduction_pct: 9,
      judge_improvement_pct: 6,
    },
    vs_vector_rag: {
      tokens_reduction_pct: 10,
      latency_reduction_pct: 5,
      cost_reduction_pct: 3,
      judge_improvement_pct: 2,
    },
  },
};

describe('snapshot utilities', () => {
  beforeEach(() => {
    const mockContext = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => mockContext as unknown as CanvasRenderingContext2D);
  });

  it('builds snapshot text with watermark and sweep summary', () => {
    const text = buildJudgeSnapshotText({
      appName: 'GraphPulse Intelligence Studio',
      summary,
      results: {
        'LLM-Only': { pipeline: 'LLM-Only', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 100, latency_ms: 100, cost_usd: 1 },
        'Vector-RAG': { pipeline: 'Vector-RAG', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 90, latency_ms: 95, cost_usd: 0.8 },
        GraphRAG: { pipeline: 'GraphRAG', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 70, latency_ms: 80, cost_usd: 0.6 },
      },
      evaluations: {
        'LLM-Only': { pipeline: 'LLM-Only', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(30), token_reduction_pct: 0 },
        'Vector-RAG': { pipeline: 'Vector-RAG', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(35), token_reduction_pct: 0 },
        GraphRAG: { pipeline: 'GraphRAG', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(42), token_reduction_pct: 30 },
      },
      sweepResults: sweep,
    });

    expect(text).toContain('Batch Sweep Summary');
    expect(text).toContain('Watermark: GraphPulse v2 Benchmark Intelligence');
    expect(text).toContain('Leaderboard: #1 GraphRAG');
  });

  it('creates a canvas with expected dimensions', () => {
    const canvas = buildSnapshotCanvas('Line 1\nLine 2', DEFAULT_SNAPSHOT_TITLE);
    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBeGreaterThanOrEqual(580);
  });
});
