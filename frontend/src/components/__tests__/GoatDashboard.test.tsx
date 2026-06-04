import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GoatDashboard from '../GoatDashboard';
import type { SummaryResult } from '../../types/benchmark';

const baseProps = {
  showSingleRunPanels: true,
  results: {},
  evaluations: {},
  normalizedPerformance: [],
  isRunning: false,
  judgeSnapshotText: '',
  snapshotNotice: '',
  onCopySnapshot: () => {},
  onDownloadSnapshot: () => {},
  onDownloadSnapshotPng: () => {},
  sweepSummary: null,
};

const vectorWinnerSummary: SummaryResult = {
  type: 'summary',
  winner: 'Vector-RAG',
  wins: {
    tokens_total: false,
    latency_ms: false,
    cost_usd: false,
    judge_score: true,
  },
  deltas_vs_llm_only: {
    tokens_reduction_pct: 10,
    latency_reduction_pct: 8,
    cost_reduction_pct: 6,
    judge_improvement_pct: 5,
  },
};

describe('GoatDashboard winner visibility', () => {
  it('does not show any winner badge before summary exists', () => {
    render(<GoatDashboard {...baseProps} summary={null} />);

    expect(screen.queryByText('Winner')).not.toBeInTheDocument();
  });

  it('shows pipeline winner badge only on the actual winning pipeline', () => {
    render(<GoatDashboard {...baseProps} summary={vectorWinnerSummary} />);

    const vectorCard = screen.getByRole('heading', { name: 'Pipeline 2: Vector RAG' }).closest('article');
    const graphCard = screen.getByRole('heading', { name: 'Pipeline 3: GraphRAG' }).closest('article');

    expect(vectorCard).toBeTruthy();
    expect(graphCard).toBeTruthy();

    expect(within(vectorCard as HTMLElement).getByText('Winner')).toBeInTheDocument();
    expect(within(graphCard as HTMLElement).queryByText('Winner')).not.toBeInTheDocument();
  });
});
