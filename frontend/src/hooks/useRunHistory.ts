import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  RunHistoryEntry,
  Scenario,
  SummaryResult,
  SweepResponse,
} from '../types/benchmark';

const LEGACY_HISTORY_KEY = 'graphpulse.runHistory';
const RUN_HISTORY_KEY = 'graphpulse.runHistory.v2';
const SWEEP_HISTORY_KEY = 'graphpulse.sweepHistory.v1';
const MAX_RUN_HISTORY = 12;
const MAX_SWEEP_HISTORY = 6;

export interface SweepHistoryEntry {
  timestamp: string;
  sweep_id: string;
  scenario_count: number;
  runs_per_scenario: number;
  winner: string;
  graphrag_advantage: {
    tokens_reduction_pct: number;
    latency_reduction_pct: number;
    cost_reduction_pct: number;
    judge_improvement_pct: number;
  };
}

function makeHistoryId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function normalizeRunHistoryEntry(raw: unknown): RunHistoryEntry | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const source = raw as Record<string, unknown>;

  const timestamp = typeof source.timestamp === 'string' ? source.timestamp : new Date().toISOString();
  const mode = source.mode === 'sweep' ? 'sweep' : 'single';

  return {
    id: typeof source.id === 'string' ? source.id : makeHistoryId(mode),
    timestamp,
    mode,
    winner: typeof source.winner === 'string' && source.winner.trim().length > 0 ? source.winner : 'Unknown',
    tokensReductionPct: toNumber(source.tokensReductionPct),
    latencyReductionPct: toNumber(source.latencyReductionPct),
    costReductionPct: toNumber(source.costReductionPct),
    judgeImprovementPct: toNumber(source.judgeImprovementPct),
    scenarioId: typeof source.scenarioId === 'string' ? source.scenarioId : undefined,
    scenarioCategory: typeof source.scenarioCategory === 'string' ? source.scenarioCategory : undefined,
    sweepId: typeof source.sweepId === 'string' ? source.sweepId : undefined,
    sweepScenarioCount: toNumber(source.sweepScenarioCount) || undefined,
    sweepRunsPerScenario: toNumber(source.sweepRunsPerScenario) || undefined,
    scenarioBreakdown: Array.isArray(source.scenarioBreakdown)
      ? source.scenarioBreakdown
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const data = item as Record<string, unknown>;
            if (typeof data.scenarioId !== 'string' || typeof data.winner !== 'string') {
              return null;
            }
            return {
              scenarioId: data.scenarioId,
              winner: data.winner,
              tokensReductionPct: toNumber(data.tokensReductionPct),
              latencyReductionPct: toNumber(data.latencyReductionPct),
              costReductionPct: toNumber(data.costReductionPct),
              judgeImprovementPct: toNumber(data.judgeImprovementPct),
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null)
      : undefined,
  };
}

function readRunHistory(): RunHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawV2 = window.localStorage.getItem(RUN_HISTORY_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown[];
      if (Array.isArray(parsed)) {
        return parsed
          .map((entry) => normalizeRunHistoryEntry(entry))
          .filter((entry): entry is RunHistoryEntry => entry !== null)
          .slice(0, MAX_RUN_HISTORY);
      }
    }

    const rawLegacy = window.localStorage.getItem(LEGACY_HISTORY_KEY);
    if (!rawLegacy) {
      return [];
    }

    const parsedLegacy = JSON.parse(rawLegacy) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsedLegacy)) {
      return [];
    }

    return parsedLegacy
      .map((entry) => {
        const converted = normalizeRunHistoryEntry({
          ...entry,
          id: makeHistoryId('single'),
          mode: 'single',
        });
        return converted;
      })
      .filter((entry): entry is RunHistoryEntry => entry !== null)
      .slice(0, MAX_RUN_HISTORY);
  } catch {
    return [];
  }
}

function readSweepHistory(): SweepHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(SWEEP_HISTORY_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const item = entry as Record<string, unknown>;
        if (typeof item.sweep_id !== 'string') {
          return null;
        }
        return {
          timestamp: typeof item.timestamp === 'string' ? item.timestamp : new Date().toISOString(),
          sweep_id: item.sweep_id,
          scenario_count: toNumber(item.scenario_count),
          runs_per_scenario: toNumber(item.runs_per_scenario),
          winner: typeof item.winner === 'string' && item.winner.trim().length > 0 ? item.winner : 'Unknown',
          graphrag_advantage: {
            tokens_reduction_pct: toNumber(
              (item.graphrag_advantage as Record<string, unknown> | undefined)?.tokens_reduction_pct
            ),
            latency_reduction_pct: toNumber(
              (item.graphrag_advantage as Record<string, unknown> | undefined)?.latency_reduction_pct
            ),
            cost_reduction_pct: toNumber(
              (item.graphrag_advantage as Record<string, unknown> | undefined)?.cost_reduction_pct
            ),
            judge_improvement_pct: toNumber(
              (item.graphrag_advantage as Record<string, unknown> | undefined)?.judge_improvement_pct
            ),
          },
        } satisfies SweepHistoryEntry;
      })
      .filter((entry): entry is SweepHistoryEntry => entry !== null)
      .slice(0, MAX_SWEEP_HISTORY);
  } catch {
    return [];
  }
}

export function useRunHistory() {
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>(() => readRunHistory());
  const [sweepHistory, setSweepHistory] = useState<SweepHistoryEntry[]>(() => readSweepHistory());

  useEffect(() => {
    try {
      window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runHistory));
    } catch {
      // ignore storage write failures
    }
  }, [runHistory]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SWEEP_HISTORY_KEY, JSON.stringify(sweepHistory));
    } catch {
      // ignore storage write failures
    }
  }, [sweepHistory]);

  const addSingleRun = useCallback((scenario: Scenario, summary: SummaryResult) => {
    const entry: RunHistoryEntry = {
      id: makeHistoryId('single'),
      timestamp: new Date().toISOString(),
      mode: 'single',
      scenarioId: scenario.id,
      scenarioCategory: scenario.category,
      winner: summary.winner,
      tokensReductionPct: summary.deltas_vs_llm_only.tokens_reduction_pct,
      latencyReductionPct: summary.deltas_vs_llm_only.latency_reduction_pct,
      costReductionPct: summary.deltas_vs_llm_only.cost_reduction_pct,
      judgeImprovementPct: summary.deltas_vs_llm_only.judge_improvement_pct,
    };

    setRunHistory((prev) => [entry, ...prev].slice(0, MAX_RUN_HISTORY));
  }, []);

  const addSweepRun = useCallback((sweep: SweepResponse, runsPerScenario: number) => {
    const top = sweep.leaderboard[0];
    const advantage = sweep.graphrag_advantage_summary.vs_llm_only;

    const historyEntry: RunHistoryEntry = {
      id: makeHistoryId('sweep'),
      timestamp: new Date().toISOString(),
      mode: 'sweep',
      winner: top?.pipeline ?? 'Unknown',
      tokensReductionPct: advantage.tokens_reduction_pct,
      latencyReductionPct: advantage.latency_reduction_pct,
      costReductionPct: advantage.cost_reduction_pct,
      judgeImprovementPct: advantage.judge_improvement_pct,
      sweepId: sweep.sweep_id,
      sweepScenarioCount: sweep.scenario_results.length,
      sweepRunsPerScenario: runsPerScenario,
      scenarioBreakdown: sweep.scenario_results.map((scenario) => {
        const latest = scenario.runs[scenario.runs.length - 1]?.summary;
        return {
          scenarioId: scenario.scenario_id,
          winner: latest?.winner ?? top?.pipeline ?? 'Unknown',
          tokensReductionPct: latest?.deltas_vs_llm_only.tokens_reduction_pct ?? 0,
          latencyReductionPct: latest?.deltas_vs_llm_only.latency_reduction_pct ?? 0,
          costReductionPct: latest?.deltas_vs_llm_only.cost_reduction_pct ?? 0,
          judgeImprovementPct: latest?.deltas_vs_llm_only.judge_improvement_pct ?? 0,
        };
      }),
    };

    setRunHistory((prev) => [historyEntry, ...prev].slice(0, MAX_RUN_HISTORY));

    const sweepEntry: SweepHistoryEntry = {
      timestamp: historyEntry.timestamp,
      sweep_id: sweep.sweep_id,
      scenario_count: sweep.scenario_results.length,
      runs_per_scenario: runsPerScenario,
      winner: historyEntry.winner,
      graphrag_advantage: {
        tokens_reduction_pct: advantage.tokens_reduction_pct,
        latency_reduction_pct: advantage.latency_reduction_pct,
        cost_reduction_pct: advantage.cost_reduction_pct,
        judge_improvement_pct: advantage.judge_improvement_pct,
      },
    };

    setSweepHistory((prev) => [sweepEntry, ...prev].slice(0, MAX_SWEEP_HISTORY));
  }, []);

  return useMemo(
    () => ({
      runHistory,
      sweepHistory,
      addSingleRun,
      addSweepRun,
    }),
    [addSingleRun, addSweepRun, runHistory, sweepHistory]
  );
}
