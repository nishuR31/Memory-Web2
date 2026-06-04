import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import {
  BarChart2,
  Copy,
  Cpu,
  Database,
  Download,
  Gauge,
  Network,
  ShieldCheck,
  TrendingDown,
  Trophy,
  Zap,
} from 'lucide-react';
import type {
  BenchmarkReport,
  EvaluationResult,
  PipelineResult,
  SummaryResult,
} from '../types/benchmark';
import type { SweepPresentationSummary } from '../utils/sweep';
import ScrollableRegion from './ScrollableRegion';
import AccuracyPanel from './AccuracyPanel';
import BenchmarkTable from './BenchmarkTable';
import DatasetStats from './DatasetStats';
import TokenReductionBadge from './TokenReductionBadge';

const EfficiencyChart = lazy(() => import('./EfficiencyChart'));

type PipelineColor = 'gray' | 'blue' | 'green';

interface GoatDashboardProps {
  showSingleRunPanels: boolean;
  summary: SummaryResult | null;
  results: Record<string, PipelineResult>;
  evaluations: Record<string, EvaluationResult>;
  normalizedPerformance: Array<{ pipeline: string; efficiency: number }>;
  isRunning: boolean;
  judgeSnapshotText: string;
  snapshotNotice: string;
  onCopySnapshot: () => void;
  onDownloadSnapshot: () => void;
  onDownloadSnapshotPng: () => void;
  sweepSummary: SweepPresentationSummary | null;
  benchmarkReport?: BenchmarkReport | null;
}

export default function GoatDashboard({
  showSingleRunPanels,
  summary,
  results,
  evaluations,
  normalizedPerformance,
  isRunning,
  judgeSnapshotText,
  snapshotNotice,
  onCopySnapshot,
  onDownloadSnapshot,
  onDownloadSnapshotPng,
  sweepSummary,
  benchmarkReport,
}: GoatDashboardProps) {
  const graphAggregate = sweepSummary?.pipeline.GraphRAG;
  const investigationInsight = useMemo(
    () => buildInvestigationInsight(results, evaluations),
    [results, evaluations]
  );

  return (
    <>
      <section className="grid gap-3 lg:grid-cols-3">
        <DatasetStats benchmarkReport={benchmarkReport ?? null} />
        <TokenReductionBadge summary={summary} results={results} />
        <AccuracyPanel graphEvaluation={evaluations.GraphRAG} benchmarkReport={benchmarkReport ?? null} />
      </section>

      <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-4 py-3 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Latest Run</div>
            {summary ? (
              <div className="mt-1 text-sm text-[var(--gp-text)]">
                Winner <span className="font-bold">{summary.winner}</span> · T {summary.deltas_vs_llm_only.tokens_reduction_pct}% · L{' '}
                {summary.deltas_vs_llm_only.latency_reduction_pct}% · C {summary.deltas_vs_llm_only.cost_reduction_pct}% · J{' '}
                {summary.deltas_vs_llm_only.judge_improvement_pct}%
              </div>
            ) : (
              <div className="mt-1 text-sm text-[var(--gp-text-muted)]">Run a scenario to populate latest KPI strip.</div>
            )}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Sweep Aggregate</div>
            {graphAggregate ? (
              <div className="mt-1 text-sm text-[var(--gp-text)]">
                GraphRAG Win Rate {(graphAggregate.winRate * 100).toFixed(1)}% · Avg Judge {graphAggregate.avgJudge.toFixed(2)} · Avg
                Cost ${graphAggregate.avgCost.toFixed(6)}
              </div>
            ) : (
              <div className="mt-1 text-sm text-[var(--gp-text-muted)]">Run a sweep to populate aggregate KPI strip.</div>
            )}
          </div>
        </div>
      </section>

      {(summary || normalizedPerformance.length > 0) && (
        <section className="rounded-3xl border border-[var(--gp-accent-soft)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-black text-[var(--gp-text)]">
                <Trophy className="h-5 w-5 text-[var(--gp-warning)]" /> GraphRAG Intelligence Dashboard
              </h2>
              <p className="text-sm text-[var(--gp-text-muted)]">One-glance proof of pipeline quality and efficiency.</p>
            </div>
            {summary && (
              <div className="rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-4 py-2">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-accent-strong)]">Winner</div>
                <div className="text-xl font-black text-[var(--gp-accent-strong)]">{summary.winner}</div>
              </div>
            )}
          </div>

          {summary && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <GoatMetric label="Token Reduction" value={`${summary.deltas_vs_llm_only.tokens_reduction_pct}%`} isWinning={summary.wins.tokens_total} />
              <GoatMetric label="Latency Reduction" value={`${summary.deltas_vs_llm_only.latency_reduction_pct}%`} isWinning={summary.wins.latency_ms} />
              <GoatMetric label="Cost Reduction" value={`${summary.deltas_vs_llm_only.cost_reduction_pct}%`} isWinning={summary.wins.cost_usd} />
              <GoatMetric label="Judge Gain" value={`${summary.deltas_vs_llm_only.judge_improvement_pct}%`} isWinning={summary.wins.judge_score} />
            </div>
          )}

          {normalizedPerformance.length > 0 && (
            <div className="mt-5 h-[240px] rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[var(--gp-text-muted)]">
                <Gauge className="h-4 w-4" /> Normalized Efficiency Index
              </div>
              <Suspense
                fallback={<div className="flex h-full items-center justify-center text-sm text-[var(--gp-text-subtle)]">Loading chart...</div>}
              >
                <EfficiencyChart data={normalizedPerformance} />
              </Suspense>
            </div>
          )}

          {/* Phase D: Token Efficiency Proof */}
          {results && Object.keys(results).length > 0 && (
            <TokenEfficiencyProof results={results} />
          )}
        </section>
      )}

      {!summary && normalizedPerformance.length === 0 && !isRunning && (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 text-sm text-[var(--gp-text-muted)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          Overview is ready. Run a benchmark to populate winner KPIs, chart trends, and judge snapshot exports.
        </section>
      )}

      {summary && (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[var(--gp-text)]">Judge Snapshot</h3>
              <p className="text-xs text-[var(--gp-text-muted)]">One-click export summary for judges and reviewers.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton icon={<Copy className="h-3.5 w-3.5" />} label="Copy" onClick={onCopySnapshot} />
              <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="TXT" onClick={onDownloadSnapshot} />
              <ActionButton icon={<Download className="h-3.5 w-3.5" />} label="PNG" onClick={onDownloadSnapshotPng} />
            </div>
          </div>
          {snapshotNotice && <div className="mt-2 text-xs font-semibold text-[var(--gp-accent-strong)]">{snapshotNotice}</div>}
          <ScrollableRegion className="mt-3 max-h-52 overflow-auto rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3 text-[11px] leading-relaxed text-[var(--gp-text-muted)] whitespace-pre-wrap break-words">
            {judgeSnapshotText}
          </ScrollableRegion>
        </section>
      )}

      {showSingleRunPanels ? (
        <>
          <section className="grid gap-4 lg:grid-cols-3">
            <PipelineCard
              title="Pipeline 1: LLM-Only"
              icon={<Cpu className="h-5 w-5" />}
              color="gray"
              result={results['LLM-Only']}
              evaluation={evaluations['LLM-Only']}
              isLoading={isRunning && !results['LLM-Only']}
              isWinner={summary?.winner === 'LLM-Only'}
            />
            <PipelineCard
              title="Pipeline 2: Vector RAG"
              icon={<Database className="h-5 w-5" />}
              color="blue"
              result={results['Vector-RAG']}
              evaluation={evaluations['Vector-RAG']}
              isLoading={isRunning && !results['Vector-RAG']}
              isWinner={summary?.winner === 'Vector-RAG'}
            />
            <PipelineCard
              title="Pipeline 3: GraphRAG"
              icon={<Network className="h-5 w-5" />}
              color="green"
              result={results.GraphRAG}
              evaluation={evaluations.GraphRAG}
              isLoading={isRunning && !results.GraphRAG}
              isWinner={summary?.winner === 'GraphRAG'}
            />
          </section>

          {summary && evaluations.GraphRAG && (
            <section className="rounded-2xl border border-[var(--gp-accent-soft)] bg-[var(--gp-surface)] p-5 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-black text-[var(--gp-text)]">
                  <Zap className="h-5 w-5 text-[var(--gp-accent)]" />{' '}
                  {summary.winner === 'GraphRAG' ? 'Investigation Analysis: Why GraphRAG Won' : 'Investigation Analysis'}
                </h3>
                <span className="rounded-full border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-accent-strong)]">
                  Winner: {summary.winner}
                </span>
              </div>

              {summary.winner === 'GraphRAG' ? (
                <div className="grid gap-3 lg:grid-cols-3">
                  <InsightBlock title="Why Vector-RAG Failed" tone="danger" text={investigationInsight.vectorFailure} />
                  <InsightBlock title="Why GraphRAG Succeeded" tone="success" text={investigationInsight.graphSuccess} />
                  <InsightBlock title="Disconnected Evidence Signal" tone="neutral" text={investigationInsight.connectivityGap} />
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <InsightBlock
                    title="Outcome Check"
                    tone="neutral"
                    text={`This run did not crown GraphRAG. Winner: ${summary.winner}. Review trace quality and judge rationale below before drawing benchmark conclusions.`}
                  />
                  <InsightBlock
                    title="Graph Chain Snapshot"
                    tone="success"
                    text={investigationInsight.graphSuccess}
                  />
                </div>
              )}

              <div className="mt-3 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--gp-text-subtle)]">Judge Rationale</div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--gp-text-muted)]">
                  {evaluations.GraphRAG.llm_judge.reasoning}
                </p>
              </div>
            </section>
          )}

          {/* Token + Cost comparison table */}
          {Object.keys(results).length > 1 && (
            <TokenCostTable results={results} />
          )}

          <BenchmarkTable benchmarkReport={benchmarkReport ?? null} />
        </>
      ) : (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 text-sm text-[var(--gp-text-muted)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          Batch sweep mode focuses on leaderboard and aggregate analytics. Switch to single-run mode for per-pipeline
          answer cards and judge reasoning panels.
        </section>
      )}
    </>
  );
}

function ActionButton({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--gp-text-muted)] transition-all duration-200 hover:-translate-y-px hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]"
      type="button"
    >
      {icon} {label}
    </button>
  );
}

interface GoatMetricProps {
  label: string;
  value: string;
  isWinning: boolean;
}

function GoatMetric({ label, value, isWinning }: GoatMetricProps) {
  return (
    <div
      className={`rounded-xl border p-3 transition-colors duration-200 ${
        isWinning
          ? 'border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)]'
          : 'border-[var(--gp-border)] bg-[var(--gp-surface-muted)]'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">{label}</div>
      <div className={`mt-1 text-lg font-black ${isWinning ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
        {value}
      </div>
    </div>
  );
}

interface InvestigationInsight {
  vectorFailure: string;
  graphSuccess: string;
  connectivityGap: string;
  hopCountLabel: string;
}

function buildInvestigationInsight(
  results: Record<string, PipelineResult>,
  evaluations: Record<string, EvaluationResult>
): InvestigationInsight {
  const vectorResult = results['Vector-RAG'];
  const graphResult = results.GraphRAG;
  const vectorJudge = evaluations['Vector-RAG']?.llm_judge;
  const graphJudge = evaluations.GraphRAG?.llm_judge;

  const path = graphResult?.reasoning_path ?? [];
  const hops = graphResult?.graph_edges?.length ?? Math.max(path.length - 1, 0);
  const vectorContext = vectorResult?.retrieval_context ?? [];
  const vectorEvidenceText = vectorContext.join(' ').toLowerCase();

  const missingIntermediates =
    path.length > 2
      ? path.slice(1, -1).filter((entity) => {
          return !vectorEvidenceText.includes(entity.toLowerCase());
        })
      : [];

  const pathPreview = path.length > 0 ? path.join(' → ') : '';
  const vectorFailure =
    missingIntermediates.length > 0
      ? `Vector-RAG retrieved semantically similar records, but key intermediaries were missing from linked evidence (${missingIntermediates.join(', ')}), so the ownership chain stayed disconnected.`
      : 'Vector-RAG surfaced locally relevant chunks, but semantic retrieval alone did not reliably reconnect cross-document intermediary entities into one end-to-end path.';

  const graphSuccess =
    hops > 0
      ? `GraphRAG traversal reconstructed the exact ${hops}-hop relationship chain${pathPreview ? ` (${pathPreview})` : ''}, preserving entity order across fragmented documents.`
      : 'GraphRAG used explicit entity-relation traversal to keep evidence connected instead of relying only on semantic similarity.';

  const connectivityGap =
    graphJudge && vectorJudge
      ? `Judge deltas show the break clearly: path correctness ${graphJudge.path_correctness}/15 vs ${vectorJudge.path_correctness}/15, and traversal completeness ${graphJudge.traversal_completeness}/10 vs ${vectorJudge.traversal_completeness}/10.`
      : `GraphRAG retained a connected path across ${Math.max(hops, 1)} step${hops === 1 ? '' : 's'}, while Vector-RAG returned ${vectorContext.length || 0} isolated evidence chunk${vectorContext.length === 1 ? '' : 's'} without guaranteed chain continuity.`;

  return {
    vectorFailure,
    graphSuccess,
    connectivityGap,
    hopCountLabel: hops > 0 ? `${hops}-hop reconstruction` : 'graph-linked evidence',
  };
}

function InsightBlock({
  title,
  text,
  tone,
}: {
  title: string;
  text: string;
  tone: 'danger' | 'success' | 'neutral';
}) {
  const toneClass: Record<'danger' | 'success' | 'neutral', string> = {
    danger: 'border-[var(--gp-danger-soft)] bg-[var(--gp-danger-ghost)] text-[var(--gp-danger-strong)]',
    success: 'border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] text-[var(--gp-accent-strong)]',
    neutral: 'border-[var(--gp-border)] bg-[var(--gp-surface-muted)] text-[var(--gp-text-muted)]',
  };

  return (
    <article className={`rounded-xl border p-3 ${toneClass[tone]}`}>
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider">{title}</div>
      <p className="text-xs leading-relaxed">{text}</p>
    </article>
  );
}

interface PipelineCardProps {
  title: string;
  icon: ReactNode;
  color: PipelineColor;
  result?: PipelineResult;
  evaluation?: EvaluationResult;
  isLoading: boolean;
  isWinner?: boolean;
}

function PipelineCard({ title, icon, color, result, evaluation, isLoading, isWinner = false }: PipelineCardProps) {
  const colorClasses: Record<PipelineColor, string> = {
    gray: 'border-[var(--gp-border)] bg-[var(--gp-surface)]',
    blue: 'border-[var(--gp-info-soft)] bg-[var(--gp-info-ghost)]',
    green: 'border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)]',
  };

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-md ${colorClasses[color]} ${isWinner ? 'ring-2 ring-[var(--gp-accent-soft)]' : ''}`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-[var(--gp-surface)] p-2 text-[var(--gp-text-muted)] shadow-sm">{icon}</span>
          <h3 className="text-sm font-bold text-[var(--gp-text)]">{title}</h3>
        </div>
        {isWinner && (
          <span className="rounded-full bg-[var(--gp-accent)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Winner
          </span>
        )}
      </div>

      <div className="min-h-[130px]">
        {isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-4 rounded bg-[var(--gp-border)]"></div>
            <div className="h-4 w-5/6 rounded bg-[var(--gp-border)]"></div>
            <div className="h-4 w-4/6 rounded bg-[var(--gp-border)]"></div>
          </div>
        ) : result ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--gp-text-muted)]">{result.answer}</p>
        ) : (
          <p className="text-sm italic text-[var(--gp-text-subtle)]">Awaiting execution...</p>
        )}
      </div>

      {result && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <MetricBox label="Latency" value={`${result.latency_ms.toFixed(0)} ms`} />
          <MetricBox
            label="Tokens"
            value={result.tokens_total.toString()}
            highlight={evaluation && evaluation.token_reduction_pct > 0 ? `${evaluation.token_reduction_pct}% less` : undefined}
          />
          <MetricBox label="Cost" value={`$${result.cost_usd.toFixed(6)}`} />
          <MetricBox
            label="Judge Score"
            value={evaluation ? `${evaluation.llm_judge.total_score} / 50` : '-'}
            isScore
            scoreColor={color}
          />
        </div>
      )}

      {evaluation && (
        <ScoreBreakdown judge={evaluation.llm_judge} color={color} />
      )}
    </article>
  );
}

interface MetricBoxProps {
  label: string;
  value: string;
  highlight?: string;
  isScore?: boolean;
  scoreColor?: PipelineColor;
}

function MetricBox({ label, value, highlight, isScore = false, scoreColor = 'gray' }: MetricBoxProps) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        isScore
          ? scoreColor === 'green'
            ? 'border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)]'
            : 'border-[var(--gp-border)] bg-[var(--gp-surface)]'
          : 'border-[var(--gp-border)] bg-[var(--gp-surface)]'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--gp-text-subtle)]">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <div className={`text-base font-black ${isScore && scoreColor === 'green' ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text)]'}`}>
          {value}
        </div>
        {highlight && (
          <span className="rounded bg-[var(--gp-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--gp-accent-strong)]">
            {highlight}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Graph-native score breakdown panel
// ---------------------------------------------------------------------------

interface ScoreBreakdownProps {
  judge: import('../types/benchmark').LlmJudgeScore;
  color: PipelineColor;
}

const SCORE_DIMS: Array<{
  key: keyof import('../types/benchmark').LlmJudgeScore;
  label: string;
  max: number;
  penalty?: boolean;
}> = [
  { key: 'entity_correctness',    label: 'Entity Score',       max: 10 },
  { key: 'path_correctness',      label: 'Path Score',         max: 15 },
  { key: 'relationship_accuracy', label: 'Relationship Score', max: 10 },
  { key: 'traversal_completeness',label: 'Traversal Score',    max: 10 },
  { key: 'multi_hop_quality',     label: 'Multi-Hop Quality',  max: 5  },
  { key: 'hallucination_penalty', label: 'Hallucination',      max: 10, penalty: true },
];

function ScoreBreakdown({ judge, color }: ScoreBreakdownProps) {
  const accentTrack = color === 'green'
    ? 'bg-[var(--gp-accent)]'
    : color === 'blue'
      ? 'bg-[var(--gp-info)]'
      : 'bg-[var(--gp-text-muted)]';

  return (
    <div className="mt-4 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
        <ShieldCheck className="h-3.5 w-3.5" />
        Graph-Native Score Breakdown
      </div>
      <div className="space-y-2">
        {SCORE_DIMS.map(({ key, label, max, penalty }) => {
          const raw = typeof judge[key] === 'number' ? (judge[key] as number) : 0;
          const value = penalty ? Math.abs(raw) : raw;
          const pct   = Math.min(100, Math.round((value / max) * 100));
          const isPenalty = penalty && raw < 0;

          return (
            <div key={key}>
              <div className="mb-0.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-[var(--gp-text-muted)]">{label}</span>
                <span className={`text-[10px] font-black tabular-nums ${
                  isPenalty
                    ? 'text-[var(--gp-danger-strong,#ef4444)]'
                    : color === 'green'
                      ? 'text-[var(--gp-accent-strong)]'
                      : 'text-[var(--gp-text)]'
                }`}>
                  {isPenalty ? `${raw}` : `${raw}/${max}`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--gp-border)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isPenalty ? 'bg-[var(--gp-danger-strong,#ef4444)]' : accentTrack
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token Efficiency Proof (Phase D)
// ---------------------------------------------------------------------------

const PIPELINE_DISPLAY_ORDER = ['LLM-Only', 'Vector-RAG', 'GraphRAG'] as const;

const PIPELINE_BAR_COLOR: Record<string, string> = {
  'LLM-Only':  'bg-[var(--gp-text-muted)]',
  'Vector-RAG':'bg-[var(--gp-info)]',
  'GraphRAG':  'bg-[var(--gp-accent)]',
};

interface TokenEfficiencyProofProps {
  results: Record<string, PipelineResult>;
}

function TokenEfficiencyProof({ results }: TokenEfficiencyProofProps) {
  const available = PIPELINE_DISPLAY_ORDER.filter((p) => p in results);
  if (available.length < 2) return null;

  const maxTokens = Math.max(...available.map((p) => results[p].tokens_total), 1);
  const maxCost   = Math.max(...available.map((p) => results[p].cost_usd), 1e-9);

  const graphTokens = results['GraphRAG']?.tokens_total ?? 0;
  const llmTokens   = results['LLM-Only']?.tokens_total ?? 0;
  const vecTokens   = results['Vector-RAG']?.tokens_total ?? 0;
  const baselineTokens = Math.max(llmTokens, vecTokens, 1);
  const tokenSaving = graphTokens > 0
    ? Math.round(Math.max(0, (1 - graphTokens / baselineTokens) * 100))
    : 0;

  const graphCost   = results['GraphRAG']?.cost_usd ?? 0;
  const baselineCost = Math.max(results['LLM-Only']?.cost_usd ?? 0, results['Vector-RAG']?.cost_usd ?? 0, 1e-9);
  const costSaving  = graphCost < baselineCost
    ? Math.round((1 - graphCost / baselineCost) * 100)
    : 0;

  return (
    <div className="mt-5 rounded-2xl border border-[var(--gp-accent-soft)] bg-[var(--gp-surface-muted)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[var(--gp-accent-strong)]">
          <TrendingDown className="h-4 w-4" />
          Token Efficiency Proof
        </div>
        <div className="flex flex-wrap gap-2">
          {tokenSaving > 0 && (
            <span className="rounded-full bg-[var(--gp-accent)] px-2.5 py-1 text-[10px] font-black text-white">
              {tokenSaving}% fewer tokens
            </span>
          )}
          {costSaving > 0 && (
            <span className="rounded-full border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-2.5 py-1 text-[10px] font-black text-[var(--gp-accent-strong)]">
              {costSaving}% lower cost
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Token bar chart */}
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
            <BarChart2 className="h-3 w-3" /> Total Tokens
          </div>
          <div className="space-y-2">
            {available.map((p) => {
              const val = results[p].tokens_total;
              const pct = Math.round((val / maxTokens) * 100);
              const isGraph = p === 'GraphRAG';
              return (
                <div key={p}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={`text-[10px] font-semibold ${isGraph ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                      {p}
                    </span>
                    <span className={`text-[10px] font-black tabular-nums ${isGraph ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                      {val.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gp-border)]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${PIPELINE_BAR_COLOR[p] ?? 'bg-[var(--gp-text-muted)]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost bar chart */}
        <div>
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
            <BarChart2 className="h-3 w-3" /> Cost (USD)
          </div>
          <div className="space-y-2">
            {available.map((p) => {
              const val = results[p].cost_usd;
              const pct = Math.round((val / maxCost) * 100);
              const isGraph = p === 'GraphRAG';
              return (
                <div key={p}>
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className={`text-[10px] font-semibold ${isGraph ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                      {p}
                    </span>
                    <span className={`text-[10px] font-black tabular-nums ${isGraph ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                      ${val.toFixed(6)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gp-border)]">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${PIPELINE_BAR_COLOR[p] ?? 'bg-[var(--gp-text-muted)]'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[10px] italic text-[var(--gp-text-subtle)]">
        GraphRAG uses only the active traversal path as context — no chunk inflation, no token waste.
        Better reasoning, smaller context.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Token + Cost comparison table (Phase D)
// ---------------------------------------------------------------------------

interface TokenCostTableProps {
  results: Record<string, PipelineResult>;
}

function TokenCostTable({ results }: TokenCostTableProps) {
  const available = PIPELINE_DISPLAY_ORDER.filter((p) => p in results);
  if (available.length < 2) return null;

  const graphTokens  = results['GraphRAG']?.tokens_total ?? 0;
  const graphLatency = results['GraphRAG']?.latency_ms ?? 0;

  return (
    <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black text-[var(--gp-text)]">
        <TrendingDown className="h-4 w-4 text-[var(--gp-accent)]" />
        Pipeline Efficiency Comparison
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--gp-border)]">
              <th className="pb-2 pr-4 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Pipeline</th>
              <th className="pb-2 pr-4 text-right text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Tokens</th>
              <th className="pb-2 pr-4 text-right text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">vs GraphRAG</th>
              <th className="pb-2 pr-4 text-right text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Latency</th>
              <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Cost</th>
            </tr>
          </thead>
          <tbody>
            {available.map((p) => {
              const r = results[p];
              const isGraph = p === 'GraphRAG';
              const tokenDelta = !isGraph && graphTokens > 0
                ? Math.round(((r.tokens_total - graphTokens) / Math.max(graphTokens, 1)) * 100)
                : null;
              const latencyDelta = !isGraph && graphLatency > 0
                ? Math.round(((r.latency_ms - graphLatency) / Math.max(graphLatency, 1)) * 100)
                : null;

              return (
                <tr
                  key={p}
                  className={`border-b border-[var(--gp-border)] ${isGraph ? 'bg-[var(--gp-accent-ghost)]' : ''}`}
                >
                  <td className={`py-2.5 pr-4 font-bold ${isGraph ? 'text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text)]'}`}>
                    {p}{isGraph && ' ★'}
                  </td>
                  <td className={`py-2.5 pr-4 text-right tabular-nums ${isGraph ? 'font-black text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                    {r.tokens_total.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4 text-right tabular-nums">
                    {tokenDelta !== null ? (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        tokenDelta > 0
                          ? 'bg-[var(--gp-danger-ghost,#fef2f2)] text-[var(--gp-danger-strong,#ef4444)]'
                          : 'bg-[var(--gp-accent-ghost)] text-[var(--gp-accent-strong)]'
                      }`}>
                        {tokenDelta > 0 ? `+${tokenDelta}%` : `${tokenDelta}%`}
                      </span>
                    ) : (
                      <span className="text-[10px] text-[var(--gp-accent-strong)]">baseline</span>
                    )}
                  </td>
                  <td className={`py-2.5 pr-4 text-right tabular-nums ${isGraph ? 'font-black text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                    {r.latency_ms.toFixed(0)}ms
                    {latencyDelta !== null && (
                      <span className={`ml-1 text-[9px] font-bold ${latencyDelta > 0 ? 'text-[var(--gp-danger-strong,#ef4444)]' : 'text-[var(--gp-accent-strong)]'}`}>
                        ({latencyDelta > 0 ? '+' : ''}{latencyDelta}%)
                      </span>
                    )}
                  </td>
                  <td className={`py-2.5 text-right tabular-nums ${isGraph ? 'font-black text-[var(--gp-accent-strong)]' : 'text-[var(--gp-text-muted)]'}`}>
                    ${r.cost_usd.toFixed(6)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
