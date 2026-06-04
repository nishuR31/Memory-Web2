import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RunHistoryTimeline from '../RunHistoryTimeline';

const history = [
  {
    id: 'entry_1',
    timestamp: new Date('2026-05-14T00:00:00Z').toISOString(),
    mode: 'sweep' as const,
    winner: 'GraphRAG',
    tokensReductionPct: 30,
    latencyReductionPct: 20,
    costReductionPct: 12,
    judgeImprovementPct: 7,
    sweepId: 'sweep_1',
    sweepScenarioCount: 2,
    sweepRunsPerScenario: 3,
    scenarioBreakdown: [
      {
        scenarioId: 'SCN-001',
        winner: 'GraphRAG',
        tokensReductionPct: 31,
        latencyReductionPct: 19,
        costReductionPct: 10,
        judgeImprovementPct: 6,
      },
    ],
  },
];

describe('RunHistoryTimeline', () => {
  it('renders history cards and supports scenario drilldown expansion', () => {
    render(<RunHistoryTimeline runHistory={history} />);

    expect(screen.getByText(/Benchmark History/i)).toBeInTheDocument();
    expect(screen.getByText(/Sweep/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByText(/Scenario Drilldown/i)).toBeInTheDocument();
    expect(screen.getByText(/SCN-001/i)).toBeInTheDocument();
  });
});
