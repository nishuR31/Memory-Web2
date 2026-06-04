import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRunHistory } from '../useRunHistory';
import type { Scenario, SummaryResult, SweepResponse } from '../../types/benchmark';

const scenario: Scenario = {
  id: 'SCN-001',
  category: 'hidden_ownership',
  query: 'Q',
  ground_truth: 'G',
  expected_graphrag_advantage: 'A',
  tags: ['ownership'],
};

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
    tokens_reduction_pct: 30,
    latency_reduction_pct: 22,
    cost_reduction_pct: 12,
    judge_improvement_pct: 8,
  },
};

const sweepPayload: SweepResponse = {
  sweep_id: 'sweep_abc123',
  scenario_results: [
    {
      scenario_id: 'SCN-001',
      category: 'hidden_ownership',
      query: 'Q',
      pipeline_aggregates: [],
      runs: [
        {
          run_index: 1,
          results: [],
          evaluations: [],
          summary,
        },
      ],
    },
  ],
  pipeline_aggregates: [
    {
      pipeline: 'GraphRAG',
      avg_tokens_total: 70,
      stdev_tokens_total: 2,
      avg_latency_ms: 90,
      stdev_latency_ms: 5,
      avg_cost_usd: 0.0009,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 44,
      stdev_judge_score: 1,
      win_rate: 1,
    },
  ],
  leaderboard: [
    {
      pipeline: 'GraphRAG',
      rank: 1,
      rank_score: 0.91,
      avg_tokens_total: 70,
      stdev_tokens_total: 2,
      avg_latency_ms: 90,
      stdev_latency_ms: 5,
      avg_cost_usd: 0.0009,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 44,
      stdev_judge_score: 1,
      win_rate: 1,
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
      tokens_reduction_pct: 32,
      latency_reduction_pct: 18,
      cost_reduction_pct: 11,
      judge_improvement_pct: 9,
    },
    vs_vector_rag: {
      tokens_reduction_pct: 19,
      latency_reduction_pct: 12,
      cost_reduction_pct: 7,
      judge_improvement_pct: 6,
    },
  },
};

describe('useRunHistory', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('loads legacy run history and migrates single runs', () => {
    window.localStorage.setItem(
      'graphpulse.runHistory',
      JSON.stringify([
        {
          timestamp: new Date().toISOString(),
          scenarioId: 'SCN-001',
          scenarioCategory: 'hidden_ownership',
          winner: 'GraphRAG',
          tokensReductionPct: 20,
          latencyReductionPct: 15,
          costReductionPct: 10,
          judgeImprovementPct: 6,
        },
      ])
    );

    const { result } = renderHook(() => useRunHistory());
    expect(result.current.runHistory).toHaveLength(1);
    expect(result.current.runHistory[0].mode).toBe('single');
    expect(result.current.runHistory[0].scenarioId).toBe('SCN-001');
  });

  it('persists single run and sweep entries', () => {
    const { result } = renderHook(() => useRunHistory());

    act(() => {
      result.current.addSingleRun(scenario, summary);
    });

    expect(result.current.runHistory).toHaveLength(1);
    expect(result.current.runHistory[0].mode).toBe('single');

    act(() => {
      result.current.addSweepRun(sweepPayload, 3);
    });

    expect(result.current.runHistory).toHaveLength(2);
    expect(result.current.runHistory[0].mode).toBe('sweep');
    expect(result.current.sweepHistory).toHaveLength(1);

    const storedRuns = window.localStorage.getItem('graphpulse.runHistory.v2');
    const storedSweep = window.localStorage.getItem('graphpulse.sweepHistory.v1');
    expect(storedRuns).toContain('sweep_abc123');
    expect(storedSweep).toContain('sweep_abc123');
  });
});
