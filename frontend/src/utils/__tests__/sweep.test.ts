import { describe, expect, it } from 'vitest';
import { reduceSweepSummary } from '../sweep';
import type { LlmJudgeScore, SweepResponse } from '../../types/benchmark';

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

const summary = {
  type: 'summary' as const,
  winner: 'GraphRAG',
  wins: {
    tokens_total: true,
    latency_ms: true,
    cost_usd: true,
    judge_score: true,
  },
  deltas_vs_llm_only: {
    tokens_reduction_pct: 25,
    latency_reduction_pct: 20,
    cost_reduction_pct: 12,
    judge_improvement_pct: 9,
  },
};

const payload: SweepResponse = {
  sweep_id: 'sweep_x',
  scenario_results: [
    {
      scenario_id: 'SCN-001',
      category: 'a',
      query: 'q1',
      pipeline_aggregates: [],
      runs: [
        {
          run_index: 1,
          results: [
            { pipeline: 'LLM-Only', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 100, latency_ms: 120, cost_usd: 1, retrieval_context: [] },
            { pipeline: 'GraphRAG', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 70, latency_ms: 90, cost_usd: 0.6, retrieval_context: [] },
          ],
          evaluations: [
            { pipeline: 'LLM-Only', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(32), token_reduction_pct: 0 },
            { pipeline: 'GraphRAG', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(45), token_reduction_pct: 30 },
          ],
          summary,
        },
        {
          run_index: 2,
          results: [
            { pipeline: 'LLM-Only', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 98, latency_ms: 118, cost_usd: 0.98, retrieval_context: [] },
            { pipeline: 'GraphRAG', answer: '', tokens_input: 0, tokens_output: 0, tokens_total: 72, latency_ms: 95, cost_usd: 0.62, retrieval_context: [] },
          ],
          evaluations: [
            { pipeline: 'LLM-Only', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(31), token_reduction_pct: 0 },
            { pipeline: 'GraphRAG', bert_score: { precision: 0, recall: 0, f1: 0 }, llm_judge: mkJudge(46), token_reduction_pct: 28 },
          ],
          summary,
        },
      ],
    },
  ],
  pipeline_aggregates: [],
  leaderboard: [],
  graphrag_advantage_summary: {
    vs_llm_only: {
      tokens_reduction_pct: 25,
      latency_reduction_pct: 20,
      cost_reduction_pct: 12,
      judge_improvement_pct: 9,
    },
    vs_vector_rag: {
      tokens_reduction_pct: 10,
      latency_reduction_pct: 8,
      cost_reduction_pct: 4,
      judge_improvement_pct: 3,
    },
  },
};

describe('reduceSweepSummary', () => {
  it('computes averages and win rates across runs', () => {
    const reduced = reduceSweepSummary(payload);

    expect(reduced.runCount).toBe(2);
    expect(reduced.scenarioCount).toBe(1);
    expect(reduced.pipeline.GraphRAG.avgTokens).toBe(71);
    expect(reduced.pipeline.GraphRAG.avgLatency).toBe(92.5);
    expect(reduced.pipeline.GraphRAG.avgJudge).toBe(45.5);
    expect(reduced.pipeline.GraphRAG.winRate).toBe(1);
    expect(reduced.pipeline['LLM-Only'].avgCost).toBeCloseTo(0.99, 6);
  });
});
