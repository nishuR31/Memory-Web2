import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Activity,
  CheckCircle2,
  Database,
  Gauge,
  Home,
  Layers3,
  Maximize2,
  Minimize2,
  Network,
  PanelBottom,
  Play,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  BenchmarkReport,
  BenchmarkMode,
  DashboardView,
  EvaluationResult,
  PipelineResult,
  Scenario,
  SummaryResult,
  SweepResponse,
} from '../types/benchmark';
import type { ThemePreference } from '../hooks/useTheme';
import type { SweepPresentationSummary } from '../utils/sweep';
import { buildGraphRagTrendData } from '../utils/sweep';
import GraphVisualization from './GraphVisualization';
import GraphVizPanel from './GraphVizPanel';
import GoatDashboard from './GoatDashboard';
import RunHistoryTimeline from './RunHistoryTimeline';
import ScrollableRegion from './ScrollableRegion';
import ThemeControls from './ThemeControls';

interface BenchmarkWorkspaceProps {
  presentationMode: boolean;
  setPresentationMode: Dispatch<SetStateAction<boolean>>;
  scenarios: Scenario[];
  selectedScenarioId: string;
  onScenarioSelect: (id: string) => void;
  query: string;
  setQuery: (query: string) => void;
  modelOverride: string;
  setModelOverride: (model: string) => void;
  benchmarkMode: BenchmarkMode;
  setBenchmarkMode: (mode: BenchmarkMode) => void;
  dashboardView: DashboardView;
  setDashboardView: Dispatch<SetStateAction<DashboardView>>;
  isRunning: boolean;
  sweepIsRunning: boolean;
  onRunBenchmark: () => void;
  onRunSweep: () => void;
  errorMessage: string;
  summary: SummaryResult | null;
  results: Record<string, PipelineResult>;
  evaluations: Record<string, EvaluationResult>;
  normalizedPerformance: Array<{ pipeline: string; efficiency: number }>;
  judgeSnapshotText: string;
  snapshotNotice: string;
  onCopySnapshot: () => void;
  onDownloadSnapshot: () => void;
  onDownloadSnapshotPng: () => void;
  showTour: boolean;
  dismissTour: () => void;
  runHistory: import('../types/benchmark').RunHistoryEntry[];
  sweepResults: SweepResponse | null;
  sweepSummary: SweepPresentationSummary | null;
  sweepScenarioIds: string[];
  setSweepScenarioIds: Dispatch<SetStateAction<string[]>>;
  sweepRunsPerScenario: number;
  setSweepRunsPerScenario: (count: number) => void;
  onGoHome: () => void;
  themePreference: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
  benchmarkReport: BenchmarkReport | null;
}

const quickQueries = [
  {
    label: 'Hidden Ownership',
    value: 'Who is the ultimate beneficial owner of Meridian Holdings Ltd?',
  },
  {
    label: 'Shortest Laundering Chain',
    value: 'What is the shortest exposure chain between Jonathan Doe and Global Launderers LLC?',
  },
  {
    label: 'Shared Infrastructure',
    value: 'What links Horizon Group to sanctioned activities?',
  },
  {
    label: 'Sanctions Proximity',
    value: 'Does Vertex Capital have any indirect exposure to sanctioned entities?',
  },
] as const;

export default function BenchmarkWorkspace({
  presentationMode,
  setPresentationMode,
  scenarios,
  selectedScenarioId,
  onScenarioSelect,
  query,
  setQuery,
  modelOverride,
  setModelOverride,
  benchmarkMode,
  setBenchmarkMode,
  dashboardView,
  setDashboardView,
  isRunning,
  sweepIsRunning,
  onRunBenchmark,
  onRunSweep,
  errorMessage,
  summary,
  results,
  evaluations,
  normalizedPerformance,
  judgeSnapshotText,
  snapshotNotice,
  onCopySnapshot,
  onDownloadSnapshot,
  onDownloadSnapshotPng,
  showTour,
  dismissTour,
  runHistory,
  sweepResults,
  sweepSummary,
  sweepScenarioIds,
  setSweepScenarioIds,
  sweepRunsPerScenario,
  setSweepRunsPerScenario,
  onGoHome,
  themePreference,
  onThemeChange,
  benchmarkReport,
}: BenchmarkWorkspaceProps) {
  const graphResult = results.GraphRAG;
  const reasoningPath = graphResult?.reasoning_path ?? [];
  const selectedScenario = scenarios.find((item) => item.id === selectedScenarioId);

  const trendData = sweepResults ? buildGraphRagTrendData(sweepResults) : [];
  const graphNodeCount = graphResult?.graph_nodes?.length ?? 0;
  const graphCanvasHeight =
    presentationMode
      ? graphNodeCount > 8
        ? '660px'
        : '640px'
      : graphNodeCount > 8
        ? '560px'
        : '520px';
  const graphRenderKey = graphResult
    ? [
        graphResult.pipeline,
        graphResult.answer,
        (graphResult.reasoning_path ?? []).join('|'),
        (graphResult.graph_nodes ?? []).map((node) => `${node.id}:${node.type}`).join('|'),
        (graphResult.graph_edges ?? []).map((edge) => `${edge.source}->${edge.target}:${edge.type}`).join('|'),
      ].join('::')
    : 'empty-graph';

  const toggleSweepScenario = (scenarioId: string) => {
    setSweepScenarioIds((prev) =>
      prev.includes(scenarioId) ? prev.filter((item) => item !== scenarioId) : [...prev, scenarioId]
    );
  };

  return (
    <main
      className={`mx-auto flex max-w-[1280px] flex-col px-4 py-6 sm:px-6 sm:py-8 ${
        presentationMode ? 'gap-4 pb-8' : 'gap-6 pb-[calc(env(safe-area-inset-bottom)+8.5rem)] md:pb-8'
      }`}
    >
      <section
        className={`rounded-3xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md sm:p-6 ${
          presentationMode ? 'ring-2 ring-[var(--gp-accent-soft)]' : ''
        }`}
      >
        <div className="mb-4 flex flex-wrap gap-2">
          <ModeTab
            label="Single Run"
            isActive={benchmarkMode === 'single'}
            onClick={() => setBenchmarkMode('single')}
          />
          <ModeTab
            label="Batch Sweep"
            isActive={benchmarkMode === 'sweep'}
            onClick={() => setBenchmarkMode('sweep')}
          />
        </div>

        {benchmarkMode === 'single' ? (
          <div className="grid gap-4 lg:grid-cols-12 lg:items-end">
            <div className="lg:col-span-9">
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
                Benchmark Scenario
              </label>
              <div className="grid gap-3 sm:grid-cols-[260px_1fr]">
                <select
                  className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-3 py-3 text-sm font-medium outline-none focus:border-[var(--gp-accent)]"
                  value={selectedScenarioId}
                  onChange={(event) => onScenarioSelect(event.target.value)}
                >
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.id} · {scenario.category}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-3 py-3 text-sm outline-none focus:border-[var(--gp-accent)]"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {quickQueries.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setQuery(item.value)}
                    className="rounded-full border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] px-3 py-1.5 text-xs font-semibold text-[var(--gp-text-muted)] transition-all duration-200 hover:-translate-y-px hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]"
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              <button
                onClick={onRunBenchmark}
                disabled={isRunning || !query.trim()}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                  isRunning || !query.trim()
                    ? 'cursor-not-allowed bg-[var(--gp-border)] text-[var(--gp-text-subtle)]'
                    : 'bg-[var(--gp-accent)] text-white hover:brightness-110'
                }`}
                type="button"
              >
                {isRunning ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Running Pipelines...' : 'Run Benchmark'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
                Batch Scenario Selection
              </label>
              <div className="flex flex-wrap gap-2">
                {scenarios.map((scenario) => {
                  const active = sweepScenarioIds.includes(scenario.id);
                  return (
                    <button
                      key={scenario.id}
                      type="button"
                      onClick={() => toggleSweepScenario(scenario.id)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-[var(--gp-accent)] bg-[var(--gp-accent-soft)] text-[var(--gp-accent-strong)]'
                          : 'border-[var(--gp-border)] bg-[var(--gp-surface-muted)] text-[var(--gp-text-muted)] hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]'
                      }`}
                    >
                      {scenario.id}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Runs Per Scenario</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={sweepRunsPerScenario}
                  onChange={(event) => setSweepRunsPerScenario(Number(event.target.value))}
                  className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--gp-accent)]"
                />
              </label>
              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">
                  Optional Model Override
                </span>
                <input
                  type="text"
                  value={modelOverride}
                  onChange={(event) => setModelOverride(event.target.value)}
                  placeholder="Leave blank to use backend defaults"
                  className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--gp-accent)]"
                />
              </label>
            </div>

            <button
              onClick={onRunSweep}
              disabled={sweepIsRunning || sweepScenarioIds.length === 0}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold transition-all duration-200 ${
                sweepIsRunning || sweepScenarioIds.length === 0
                  ? 'cursor-not-allowed bg-[var(--gp-border)] text-[var(--gp-text-subtle)]'
                  : 'bg-[var(--gp-accent)] text-white hover:brightness-110'
              }`}
              type="button"
            >
              {sweepIsRunning ? <Activity className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {sweepIsRunning ? 'Running Sweep...' : 'Run Batch Benchmark'}
            </button>
          </div>
        )}

        {(isRunning || sweepIsRunning) && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-[var(--gp-accent-strong)]">
            <StatusPill text="Computing graph traversal" />
            <StatusPill text="Retrieving vector evidence" />
            <StatusPill text="Scoring judge metrics" />
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 rounded-xl border border-[var(--gp-danger-soft)] bg-[var(--gp-danger-ghost)] px-4 py-3 text-sm text-[var(--gp-danger-strong)]">
            {errorMessage}
          </div>
        )}

        {selectedScenario && benchmarkMode === 'single' && (
          <div className="mt-4 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[var(--gp-surface)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--gp-text-muted)]">
                {selectedScenario.id}
              </span>
              <span className="text-xs font-semibold text-[var(--gp-text-muted)]">{selectedScenario.category}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--gp-text-muted)]">
              Why GraphRAG should win: {selectedScenario.expected_graphrag_advantage}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedScenario.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-[var(--gp-border)] bg-[var(--gp-surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gp-text-muted)]"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <DashboardTab
            label="Overview"
            icon={<Gauge className="h-3.5 w-3.5" />}
            isActive={dashboardView === 'overview'}
            onClick={() => setDashboardView('overview')}
          />
          <DashboardTab
            label="Evidence"
            icon={<Layers3 className="h-3.5 w-3.5" />}
            isActive={dashboardView === 'evidence'}
            onClick={() => setDashboardView('evidence')}
          />
          <DashboardTab
            label="Graph"
            icon={<Network className="h-3.5 w-3.5" />}
            isActive={dashboardView === 'graph'}
            onClick={() => setDashboardView('graph')}
          />

          <button
            onClick={() => setPresentationMode((prev) => !prev)}
            className={`ml-auto hidden rounded-full px-3 py-2 text-xs font-bold uppercase tracking-wider transition md:inline-flex ${
              presentationMode
                ? 'bg-[var(--gp-accent)] text-white'
                : 'border border-[var(--gp-border)] bg-[var(--gp-surface)] text-[var(--gp-text-muted)] hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]'
            }`}
            type="button"
          >
            {presentationMode ? (
              <span className="inline-flex items-center gap-1">
                <Minimize2 className="h-3.5 w-3.5" /> Exit Stage
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Maximize2 className="h-3.5 w-3.5" /> Stage Mode
              </span>
            )}
          </button>
        </div>
      </section>

      {showTour && !presentationMode && (
        <section className="rounded-2xl border border-[var(--gp-info-soft)] bg-[var(--gp-info-ghost)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-[var(--gp-text)]">Quick Tour</h3>
              <p className="mt-1 text-xs leading-relaxed text-[var(--gp-text-muted)]">
                `R` to run benchmark, `1/2/3` to switch sections, `P` for stage mode, `M` for theme cycle. Use
                Batch Sweep for leaderboard storytelling.
              </p>
            </div>
            <button
              onClick={dismissTour}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface)] px-2 py-1 text-xs font-semibold text-[var(--gp-text-muted)] hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]"
              type="button"
            >
              <X className="h-3.5 w-3.5" /> Dismiss
            </button>
          </div>
        </section>
      )}

      {presentationMode && (
        <section className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-5 py-3 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          <div className="flex items-center gap-2 text-sm font-bold text-[var(--gp-accent-strong)]">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--gp-accent)]" />
            Stage Mode — presentation optimised. Simplified layout active.
          </div>
          <button
            onClick={() => setPresentationMode(false)}
            className="rounded-lg border border-[var(--gp-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--gp-accent-strong)] hover:bg-[var(--gp-accent)] hover:text-white transition"
            type="button"
          >
            Exit Stage
          </button>
        </section>
      )}

      {dashboardView === 'overview' && (
        <>
          <GoatDashboard
            showSingleRunPanels={benchmarkMode === 'single'}
            summary={summary}
            results={results}
            evaluations={evaluations}
            normalizedPerformance={normalizedPerformance}
            isRunning={isRunning}
            judgeSnapshotText={judgeSnapshotText}
            snapshotNotice={snapshotNotice}
            onCopySnapshot={onCopySnapshot}
            onDownloadSnapshot={onDownloadSnapshot}
            onDownloadSnapshotPng={onDownloadSnapshotPng}
            sweepSummary={sweepSummary}
            benchmarkReport={benchmarkReport}
          />

          <RunHistoryTimeline runHistory={runHistory} />

          {sweepResults && (
            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-[var(--gp-text)]">Sweep Leaderboard</h3>
                  <span className="rounded-full bg-[var(--gp-accent-soft)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gp-accent-strong)]">
                    {sweepResults.sweep_id}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="text-[var(--gp-text-subtle)]">
                      <tr>
                        <th className="px-2 py-2">Rank</th>
                        <th className="px-2 py-2">Pipeline</th>
                        <th className="px-2 py-2">Score</th>
                        <th className="px-2 py-2">Win Rate</th>
                        <th className="px-2 py-2">Avg Judge</th>
                        <th className="px-2 py-2">Avg Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sweepResults.leaderboard.map((row) => (
                        <tr key={row.pipeline} className="border-t border-[var(--gp-border)]">
                          <td className="px-2 py-2 font-bold text-[var(--gp-text)]">#{row.rank}</td>
                          <td className="px-2 py-2 text-[var(--gp-text)]">{row.pipeline}</td>
                          <td className="px-2 py-2 text-[var(--gp-text-muted)]">{row.rank_score.toFixed(4)}</td>
                          <td className="px-2 py-2 text-[var(--gp-text-muted)]">{(row.win_rate * 100).toFixed(1)}%</td>
                          <td className="px-2 py-2 text-[var(--gp-text-muted)]">{row.avg_judge_score.toFixed(2)}</td>
                          <td className="px-2 py-2 text-[var(--gp-text-muted)]">${row.avg_cost_usd.toFixed(6)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
                <h3 className="mb-2 text-sm font-black text-[var(--gp-text)]">GraphRAG Trend + Win-Rate Band</h3>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData}>
                      <CartesianGrid stroke="var(--gp-chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="runLabel" stroke="var(--gp-chart-axis)" fontSize={11} />
                      <YAxis yAxisId="judge" stroke="var(--gp-chart-axis)" domain={[0, 50]} fontSize={11} />
                      <YAxis yAxisId="win" orientation="right" stroke="var(--gp-chart-axis)" domain={[0, 1]} fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--gp-chart-tooltip-bg)',
                          border: '1px solid var(--gp-chart-tooltip-border)',
                          borderRadius: 10,
                          color: 'var(--gp-chart-tooltip-text)',
                        }}
                      />
                      <Legend />
                      <Line yAxisId="judge" type="monotone" dataKey="judge" name="GraphRAG Judge" stroke="var(--gp-accent)" strokeWidth={2.5} dot={false} />
                      <Line yAxisId="win" type="monotone" dataKey="winRate" name="GraphRAG Win Rate" stroke="var(--gp-info)" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
                <h3 className="mb-2 text-sm font-black text-[var(--gp-text)]">Pipeline Win-Rate Bands</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={sweepResults.pipeline_aggregates.map((item) => ({
                        pipeline: item.pipeline,
                        winRatePct: item.win_rate * 100,
                        judge: item.avg_judge_score,
                      }))}
                    >
                      <CartesianGrid stroke="var(--gp-chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="pipeline" stroke="var(--gp-chart-axis)" fontSize={11} />
                      <YAxis stroke="var(--gp-chart-axis)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--gp-chart-tooltip-bg)',
                          border: '1px solid var(--gp-chart-tooltip-border)',
                          borderRadius: 10,
                          color: 'var(--gp-chart-tooltip-text)',
                        }}
                      />
                      <Area type="monotone" dataKey="winRatePct" name="Win Rate %" stroke="var(--gp-info)" fill="var(--gp-info-soft)" fillOpacity={0.65} />
                      <Area type="monotone" dataKey="judge" name="Avg Judge" stroke="var(--gp-accent)" fill="var(--gp-accent-soft)" fillOpacity={0.35} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
                <h3 className="mb-2 text-sm font-black text-[var(--gp-text)]">Run-to-Run Variance</h3>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sweepResults.pipeline_aggregates}>
                      <CartesianGrid stroke="var(--gp-chart-grid)" strokeDasharray="3 3" />
                      <XAxis dataKey="pipeline" stroke="var(--gp-chart-axis)" fontSize={11} />
                      <YAxis stroke="var(--gp-chart-axis)" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'var(--gp-chart-tooltip-bg)',
                          border: '1px solid var(--gp-chart-tooltip-border)',
                          borderRadius: 10,
                          color: 'var(--gp-chart-tooltip-text)',
                        }}
                      />
                      <Legend />
                      <Bar dataKey="stdev_latency_ms" name="Latency σ" fill="var(--gp-info)" />
                      <Bar dataKey="stdev_tokens_total" name="Tokens σ" fill="var(--gp-accent)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </section>
          )}
        </>
      )}

      {dashboardView === 'evidence' && benchmarkMode === 'sweep' && (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-6 text-sm text-[var(--gp-text-muted)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          Evidence view is available for single-run inspection. In batch sweep mode, use Overview for leaderboard and
          aggregate trends.
        </section>
      )}

      {dashboardView === 'evidence' && benchmarkMode === 'single' && (results['Vector-RAG'] || graphResult) && (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--gp-text)]">
              <Database className="h-4 w-4 text-[var(--gp-info)]" /> Vector RAG Evidence Trace
            </h3>
            <ScrollableRegion className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {(results['Vector-RAG']?.retrieval_context?.length ?? 0) > 0 ? (
                results['Vector-RAG']?.retrieval_context?.map((chunk, index) => (
                  <div
                    key={`${index}-${chunk.slice(0, 20)}`}
                    className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3 text-xs leading-relaxed text-[var(--gp-text-muted)]"
                  >
                    <div className="mb-1 font-bold text-[var(--gp-text-subtle)]">Chunk {index + 1}</div>
                    <div className="break-words">{chunk.replace(/\[Score: .*?\]\s*/, '')}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3 text-xs text-[var(--gp-text-subtle)]">
                  No vector evidence chunks were returned for this run.
                </div>
              )}
            </ScrollableRegion>
          </div>

          <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--gp-text)]">
              <Network className="h-4 w-4 text-[var(--gp-accent)]" /> GraphRAG Traversal Trace
            </h3>
            <ScrollableRegion className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {(graphResult?.retrieval_context?.length ?? 0) > 0 ? (
                graphResult?.retrieval_context?.map((trace, index) => (
                  <div
                    key={`${index}-${trace.slice(0, 20)}`}
                    className="rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] p-3 text-xs text-[var(--gp-accent-strong)]"
                  >
                    <div className="break-words">{trace}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] p-3 text-xs text-[var(--gp-accent-strong)]">
                  No graph trace payload was returned, but the benchmark answer is still available below.
                </div>
              )}
            </ScrollableRegion>
            {reasoningPath.length > 0 && (
              <div className="mt-4 rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--gp-accent-strong)]">Pathway</div>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs font-semibold text-[var(--gp-text)]">
                  {reasoningPath.map((node, index) => (
                    <span key={`${node}-${index}`} className="contents">
                      <span className="rounded-lg bg-[var(--gp-surface)] px-2 py-1">{node}</span>
                      {index < reasoningPath.length - 1 && <span>→</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {dashboardView === 'evidence' && benchmarkMode === 'single' && !results['Vector-RAG'] && !graphResult && (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-6 text-sm text-[var(--gp-text-muted)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          Run a scenario to view vector retrieval chunks and GraphRAG traversal evidence.
        </section>
      )}

      {dashboardView === 'graph' && benchmarkMode === 'sweep' && (
        <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-6 text-sm text-[var(--gp-text-muted)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          Graph view is available for single-run traversal visualization. In batch sweep mode, use Overview for
          scenario-level comparative analytics.
        </section>
      )}

      {dashboardView === 'graph' && benchmarkMode === 'single' && graphResult?.graph_nodes && graphResult.graph_nodes.length > 0 && (
        <section className="space-y-4">
          <GraphVizPanel nodes={graphResult.graph_nodes} edges={graphResult.graph_edges ?? []} height={graphCanvasHeight} />
          <section className="overflow-hidden rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          {/* Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--gp-border)] px-5 py-3.5">
            <h3 className="flex items-center gap-2 text-sm font-black tracking-wide text-[var(--gp-text)]">
              <Network className="h-4 w-4 text-[var(--gp-accent)]" />
              Graph Reasoning Visualization
            </h3>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--gp-accent-soft)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--gp-accent-strong)]">
                {(graphResult.graph_edges ?? []).length}-hop traversal
              </span>
              <span className="rounded-full border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--gp-accent-strong)] animate-pulse">
                ● Live
              </span>
            </div>
          </div>

          {/* Canvas — tuned for denser visual occupancy in single-run graph view */}
          <div
            className="relative"
            style={{ height: graphCanvasHeight }}
          >
            {isRunning ? (
              /* Loading skeleton — prevents blank canvas flash */
              <div className="flex h-full flex-col items-center justify-center gap-4" style={{ background: 'var(--gp-graph-bg)' }}>
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 animate-ping rounded-full bg-[var(--gp-accent)]" />
                  <span className="text-sm font-semibold text-[var(--gp-accent-strong)]">Computing traversal path…</span>
                </div>
                <div className="flex items-center gap-2">
                  {[0,1,2,3].map((i) => (
                    <div
                      key={i}
                      className="h-8 w-8 animate-pulse rounded-full border-2 border-[var(--gp-accent-soft)] bg-[var(--gp-surface-muted)]"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </div>
              </div>
            ) : (
              /*
               * Key includes node count + edge count so React remounts the
               * component (restarting animation) on every new benchmark run.
               */
              <GraphVisualization
                key={graphRenderKey}
                nodes={graphResult.graph_nodes}
                edges={graphResult.graph_edges ?? []}
              />
            )}
          </div>

          {/* Answer strip below canvas */}
          {graphResult.answer && !graphResult.answer.startsWith('FINDING: No') && (
            <div className="border-t border-[var(--gp-border)] px-5 py-3.5">
              <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[var(--gp-accent-strong)]">
                Investigative Finding
              </div>
              <p className="font-mono text-xs leading-relaxed text-[var(--gp-text)] whitespace-pre-wrap">
                {graphResult.answer}
              </p>
            </div>
          )}
        </section>
        </section>
      )}

      {dashboardView === 'graph' && benchmarkMode === 'single' && (
        !graphResult?.graph_nodes || graphResult.graph_nodes.length === 0
      ) && (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--gp-border)] bg-[var(--gp-surface)] p-10 text-center shadow-sm shadow-black/5 transition-all duration-200 hover:shadow-md">
          <Network className="h-10 w-10 text-[var(--gp-border)]" />
          <div>
            <p className="text-sm font-bold text-[var(--gp-text-muted)]">No graph data yet</p>
            <p className="mt-1 text-xs text-[var(--gp-text-subtle)]">
              Run a benchmark scenario to render the live graph reasoning visualization.
            </p>
          </div>
        </section>
      )}

      {!presentationMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 space-y-2 px-3 py-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
          {summary && (
            <div className="pointer-events-auto rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-3 py-2 text-[11px] font-semibold text-[var(--gp-accent-strong)] shadow-sm shadow-black/5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {summary.winner}
                </span>
                <span>T {summary.deltas_vs_llm_only.tokens_reduction_pct}%</span>
                <span>L {summary.deltas_vs_llm_only.latency_reduction_pct}%</span>
                <span>C {summary.deltas_vs_llm_only.cost_reduction_pct}%</span>
              </div>
            </div>
          )}
          <div className="pointer-events-auto rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-2 shadow-lg shadow-black/10">
            <div className="mx-auto grid grid-cols-4 gap-2">
              <button
                onClick={onGoHome}
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] px-2 py-2 text-xs font-semibold text-[var(--gp-text-muted)]"
                type="button"
              >
                <Home className="h-3.5 w-3.5" /> Home
              </button>
              <button
                onClick={benchmarkMode === 'single' ? onRunBenchmark : onRunSweep}
                disabled={benchmarkMode === 'single' ? isRunning || !query.trim() : sweepIsRunning || sweepScenarioIds.length === 0}
                className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-bold ${
                  (benchmarkMode === 'single' ? isRunning || !query.trim() : sweepIsRunning || sweepScenarioIds.length === 0)
                    ? 'bg-[var(--gp-border)] text-[var(--gp-text-subtle)]'
                    : 'bg-[var(--gp-accent)] text-white'
                }`}
                type="button"
              >
                <Play className="h-3.5 w-3.5" /> Run
              </button>
              <button
                onClick={() =>
                  setDashboardView((prev) =>
                    prev === 'overview' ? 'evidence' : prev === 'evidence' ? 'graph' : 'overview'
                  )
                }
                className="inline-flex items-center justify-center gap-1 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] px-2 py-2 text-xs font-semibold text-[var(--gp-text-muted)]"
                type="button"
              >
                <PanelBottom className="h-3.5 w-3.5" /> View
              </button>
              <div className="inline-flex items-center justify-center">
                <ThemeControls compact themePreference={themePreference} onThemeChange={onThemeChange} />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-2.5 py-1 text-[var(--gp-accent-strong)]">
      {text}
    </span>
  );
}

function DashboardTab({
  label,
  icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
        isActive
          ? 'bg-[var(--gp-accent)] text-white'
          : 'border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] text-[var(--gp-text-muted)] hover:-translate-y-px hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]'
      }`}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function ModeTab({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
        isActive
          ? 'bg-[var(--gp-accent)] text-white'
          : 'border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] text-[var(--gp-text-muted)] hover:-translate-y-px hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]'
      }`}
      type="button"
    >
      {label}
    </button>
  );
}
