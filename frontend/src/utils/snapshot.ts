import type { EvaluationResult, PipelineResult, SummaryResult, SweepResponse } from '../types/benchmark';

export const DEFAULT_SNAPSHOT_TITLE = 'GraphPulse Intelligence Studio - Judge Snapshot';

interface SnapshotInput {
  appName: string;
  summary: SummaryResult | null;
  results: Record<string, PipelineResult>;
  evaluations: Record<string, EvaluationResult>;
  sweepResults: SweepResponse | null;
}

export function buildJudgeSnapshotText({
  appName,
  summary,
  results,
  evaluations,
  sweepResults,
}: SnapshotInput): string {
  if (!summary) {
    return '';
  }

  const llm = results['LLM-Only'];
  const vector = results['Vector-RAG'];
  const graph = results.GraphRAG;
  const llmEval = evaluations['LLM-Only'];
  const vectorEval = evaluations['Vector-RAG'];
  const graphEval = evaluations.GraphRAG;

  const lines = [
    `Product: ${appName}`,
    `Winner: ${summary.winner}`,
    '',
    'Pipeline Metrics:',
    `LLM-Only -> tokens: ${llm?.tokens_total ?? '-'}, latency: ${llm ? llm.latency_ms.toFixed(2) : '-'}ms, cost: $${llm ? llm.cost_usd.toFixed(6) : '-'}, judge: ${llmEval?.llm_judge.total_score ?? '-'}/50`,
    `Vector-RAG -> tokens: ${vector?.tokens_total ?? '-'}, latency: ${vector ? vector.latency_ms.toFixed(2) : '-'}ms, cost: $${vector ? vector.cost_usd.toFixed(6) : '-'}, judge: ${vectorEval?.llm_judge.total_score ?? '-'}/50`,
    `GraphRAG -> tokens: ${graph?.tokens_total ?? '-'}, latency: ${graph ? graph.latency_ms.toFixed(2) : '-'}ms, cost: $${graph ? graph.cost_usd.toFixed(6) : '-'}, judge: ${graphEval?.llm_judge.total_score ?? '-'}/50`,
    '',
    'GraphRAG vs LLM-Only:',
    `Token Reduction: ${summary.deltas_vs_llm_only.tokens_reduction_pct}%`,
    `Latency Reduction: ${summary.deltas_vs_llm_only.latency_reduction_pct}%`,
    `Cost Reduction: ${summary.deltas_vs_llm_only.cost_reduction_pct}%`,
    `Judge Gain: ${summary.deltas_vs_llm_only.judge_improvement_pct}%`,
  ];

  if (sweepResults) {
    lines.push('', 'Batch Sweep Summary:');
    lines.push(`Sweep ID: ${sweepResults.sweep_id}`);
    lines.push(`Scenarios: ${sweepResults.scenario_results.length}`);
    lines.push(
      `Leaderboard: ${sweepResults.leaderboard
        .map((entry) => `#${entry.rank} ${entry.pipeline}`)
        .join(' | ')}`
    );

    const graphAgg = sweepResults.pipeline_aggregates.find((item) => item.pipeline === 'GraphRAG');
    if (graphAgg) {
      lines.push(
        `GraphRAG Aggregate -> win rate: ${(graphAgg.win_rate * 100).toFixed(1)}%, avg judge: ${graphAgg.avg_judge_score.toFixed(2)}, avg cost: $${graphAgg.avg_cost_usd.toFixed(6)}`
      );
    }
  }

  lines.push('', 'Watermark: GraphPulse v2 Benchmark Intelligence');
  return lines.join('\n');
}

export function downloadTextSnapshot(text: string, filename = 'judge-snapshot.txt'): void {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function buildSnapshotCanvas(text: string, title = DEFAULT_SNAPSHOT_TITLE): HTMLCanvasElement {
  const lines = text.split('\n');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas context unavailable');
  }

  const width = 1280;
  const lineHeight = 30;
  const padding = 52;
  const headerHeight = 96;
  const footerHeight = 60;
  const height = Math.max(580, headerHeight + footerHeight + padding * 2 + lines.length * lineHeight);

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#eef6f1';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#12412b';
  ctx.fillRect(0, 0, width, headerHeight);

  ctx.fillStyle = '#e8fff3';
  ctx.font = 'bold 34px Manrope, sans-serif';
  ctx.fillText(title, padding, 58);

  ctx.fillStyle = '#16252f';
  ctx.font = '20px "IBM Plex Mono", monospace';
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, headerHeight + padding + index * lineHeight);
  });

  ctx.fillStyle = '#0f766e';
  ctx.font = 'bold 18px Manrope, sans-serif';
  ctx.fillText('GraphPulse Intelligence Studio · Watermark v2', padding, height - 24);

  return canvas;
}

export function downloadPngSnapshot(text: string, filename = 'judge-snapshot.png'): void {
  const canvas = buildSnapshotCanvas(text);
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}
