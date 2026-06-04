import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BrainCircuit } from 'lucide-react';
import ThemeControls from './components/ThemeControls';
import { useBenchmarkStream } from './hooks/useBenchmarkStream';
import { useRunHistory } from './hooks/useRunHistory';
import { useTheme } from './hooks/useTheme';
import type {
  BenchmarkReport,
  BenchmarkMode,
  DashboardView,
  Scenario,
  SummaryResult,
  SweepResponse,
} from './types/benchmark';
import { buildJudgeSnapshotText, downloadPngSnapshot, downloadTextSnapshot } from './utils/snapshot';
import { findLatestScenarioSummary, reduceSweepSummary } from './utils/sweep';

const BenchmarkWorkspace = lazy(() => import('./components/BenchmarkWorkspace'));
const HomePage = lazy(() => import('./components/HomePage'));

const buildApiCandidates = () => {
  const explicit = import.meta.env.VITE_API_URL?.trim();
  if (explicit) {
    return [explicit];
  }

  if (typeof window === 'undefined') {
    return ['http://localhost:8000', 'http://localhost:8001'];
  }

  const { protocol, hostname, origin } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return [
      `${protocol}//${hostname}:8000`,
      `${protocol}//${hostname}:8001`,
      `${protocol}//${hostname}:8002`,
    ];
  }

  return [origin];
};

const APP_NAME = 'GraphPulse Intelligence Studio';
const TOUR_STORAGE_KEY = 'graphpulse.tourDismissed.v1';

type PageMode = 'home' | 'benchmark';

function LoadingPanel() {
  return (
    <div className="mx-auto flex min-h-[40vh] max-w-[1280px] items-center justify-center px-4 py-10 sm:px-6">
      <div className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-6 py-5 text-sm font-medium text-[var(--gp-text-muted)] shadow-sm">
        Loading workspace...
      </div>
    </div>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(() => buildApiCandidates()[0]);
  const [pageMode, setPageMode] = useState<PageMode>('home');
  const [dashboardView, setDashboardView] = useState<DashboardView>('overview');
  const [presentationMode, setPresentationMode] = useState(false);

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [query, setQuery] = useState('');

  const [showTour, setShowTour] = useState(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem(TOUR_STORAGE_KEY) !== 'true';
    } catch {
      return true;
    }
  });
  const [snapshotNotice, setSnapshotNotice] = useState('');

  const [benchmarkMode, setBenchmarkMode] = useState<BenchmarkMode>('single');
  const [benchmarkReport, setBenchmarkReport] = useState<BenchmarkReport | null>(null);
  const [sweepResults, setSweepResults] = useState<SweepResponse | null>(null);
  const [sweepIsRunning, setSweepIsRunning] = useState(false);
  const [sweepScenarioIds, setSweepScenarioIds] = useState<string[]>([]);
  const [sweepRunsPerScenario, setSweepRunsPerScenario] = useState(3);
  const [modelOverride, setModelOverride] = useState('');

  const {
    isRunning,
    errorMessage,
    results,
    evaluations,
    summary,
    runBenchmark,
    setErrorMessage,
  } = useBenchmarkStream({ apiUrl });

  const { runHistory, addSingleRun, addSweepRun } = useRunHistory();
  const { themePreference, setThemePreference, cycleTheme } = useTheme();

  const findScenarioByQuery = useCallback(
    (queryText: string, scenarioList?: Scenario[]) => {
      const source = scenarioList ?? scenarios;
      const normalized = queryText.trim().toLowerCase();
      if (!normalized) {
        return undefined;
      }
      return source.find((item) => item.query.trim().toLowerCase() === normalized);
    },
    [scenarios]
  );

  const handleScenarioSelect = useCallback((id: string, scenarioList?: Scenario[]) => {
    const source = scenarioList ?? scenarios;
    setSelectedScenarioId(id);
    const scenario = source.find((item) => item.id === id);
    if (scenario) {
      setQuery(scenario.query);
    }
  }, [scenarios]);

  const handleQueryChange = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      const matched = findScenarioByQuery(nextQuery);
      if (matched && matched.id !== selectedScenarioId) {
        setSelectedScenarioId(matched.id);
      }
    },
    [findScenarioByQuery, selectedScenarioId]
  );

  useEffect(() => {
    let isCancelled = false;

    const loadScenarios = async () => {
      const candidates = buildApiCandidates();
      let lastError: unknown = null;

      for (const candidate of candidates) {
        try {
          const response = await axios.get<Scenario[]>(`${candidate}/scenarios`);
          if (isCancelled) {
            return;
          }
          setApiUrl(candidate);
          setScenarios(response.data);
          if (response.data.length > 0) {
            const firstScenario = response.data[0];
            setSelectedScenarioId(firstScenario.id);
            setQuery(firstScenario.query);
            setSweepScenarioIds(response.data.map((scenario) => scenario.id));
          }
          return;
        } catch (error) {
          lastError = error;
        }
      }

      if (!isCancelled) {
        setErrorMessage('Could not load benchmark scenarios. Check backend connectivity.');
        console.error('Failed to fetch scenarios', lastError);
      }
    };

    loadScenarios();

    return () => {
      isCancelled = true;
    };
  }, [setErrorMessage]);

  useEffect(() => {
    let isCancelled = false;

    const loadReport = async () => {
      const candidates = buildApiCandidates();
      for (const candidate of candidates) {
        try {
          const response = await axios.get<BenchmarkReport>(`${candidate}/benchmark/report`);
          if (!isCancelled) {
            setApiUrl(candidate);
            setBenchmarkReport(response.data);
          }
          return;
        } catch {
          // Try next candidate.
        }
      }
      if (!isCancelled) {
        setBenchmarkReport(null);
      }
    };

    loadReport();
    return () => {
      isCancelled = true;
    };
  }, []);

  const runSingleBenchmark = useCallback(async () => {
    setDashboardView('overview');
    setErrorMessage('');
    setSweepResults(null);

    const scenario = findScenarioByQuery(query) ?? scenarios.find((item) => item.id === selectedScenarioId);
    if (!scenario) {
      setErrorMessage('Select a benchmark scenario before running.');
      return;
    }

    if (scenario.id !== selectedScenarioId) {
      setSelectedScenarioId(scenario.id);
    }

    await runBenchmark({
      query,
      groundTruth: scenario.ground_truth,
      model: modelOverride.trim() || undefined,
    });
  }, [findScenarioByQuery, modelOverride, query, runBenchmark, scenarios, selectedScenarioId, setErrorMessage]);

  const runSweepBenchmark = useCallback(async () => {
    setDashboardView('overview');
    setErrorMessage('');
    setSweepResults(null);

    if (sweepScenarioIds.length === 0) {
      setErrorMessage('Select at least one scenario for batch sweep.');
      return;
    }

    const boundedRuns = Math.max(1, Math.min(10, Math.floor(sweepRunsPerScenario || 1)));
    setSweepRunsPerScenario(boundedRuns);

    setSweepIsRunning(true);
    try {
      const response = await fetch(`${apiUrl}/benchmark/sweep`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_ids: sweepScenarioIds,
          runs_per_scenario: boundedRuns,
          model: modelOverride.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Sweep request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as SweepResponse;
      setSweepResults(payload);
      addSweepRun(payload, boundedRuns);
    } catch (error) {
      setErrorMessage('Batch benchmark sweep failed. Check backend logs and retry.');
      console.error('Sweep request failed', error);
    } finally {
      setSweepIsRunning(false);
    }
  }, [addSweepRun, apiUrl, modelOverride, setErrorMessage, sweepRunsPerScenario, sweepScenarioIds]);

  const normalizedPerformance = useMemo(() => {
    const pipelines = ['LLM-Only', 'Vector-RAG', 'GraphRAG'] as const;
    const available = pipelines.filter((pipeline) => results[pipeline] && evaluations[pipeline]);
    if (available.length === 0) {
      return [];
    }

    const minTokens = Math.min(...available.map((name) => results[name].tokens_total));
    const minLatency = Math.min(...available.map((name) => results[name].latency_ms));
    const maxCost = Math.max(...available.map((name) => results[name].cost_usd));
    const maxJudge = Math.max(...available.map((name) => evaluations[name].llm_judge.total_score));

    return available.map((name) => {
      const result = results[name];
      const evaluation = evaluations[name];
      return {
        pipeline: name,
        efficiency: Math.max(
          0,
          Math.min(
            100,
            ((minTokens / Math.max(result.tokens_total, 1)) * 100 * 0.1 +
              (minLatency / Math.max(result.latency_ms, 1)) * 100 * 0.1 +
              (maxCost <= 0 ? 100 : (1 - result.cost_usd / maxCost) * 100) * 0.1 +
              (evaluation.llm_judge.total_score / Math.max(maxJudge, 1)) * 100 * 0.7)
          )
        ),
      };
    });
  }, [evaluations, results]);

  const latestSweepSummary = useMemo(() => (sweepResults ? findLatestScenarioSummary(sweepResults) : null), [sweepResults]);
  const displaySummary: SummaryResult | null =
    isRunning || sweepIsRunning
      ? null
      : benchmarkMode === 'single'
      ? summary
      : latestSweepSummary;

  const judgeSnapshotText = useMemo(
    () =>
      buildJudgeSnapshotText({
        appName: APP_NAME,
        summary: displaySummary,
        results,
        evaluations,
        sweepResults,
      }),
    [displaySummary, evaluations, results, sweepResults]
  );

  const copyJudgeSnapshot = useCallback(async () => {
    if (!judgeSnapshotText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(judgeSnapshotText);
      setSnapshotNotice('Snapshot copied.');
      setTimeout(() => setSnapshotNotice(''), 1800);
    } catch {
      setSnapshotNotice('Clipboard blocked by browser.');
      setTimeout(() => setSnapshotNotice(''), 1800);
    }
  }, [judgeSnapshotText]);

  const downloadJudgeSnapshot = useCallback(() => {
    if (!judgeSnapshotText) {
      return;
    }
    downloadTextSnapshot(judgeSnapshotText);
    setSnapshotNotice('Snapshot downloaded.');
    setTimeout(() => setSnapshotNotice(''), 1800);
  }, [judgeSnapshotText]);

  const downloadJudgeSnapshotPng = useCallback(() => {
    if (!judgeSnapshotText) {
      return;
    }
    downloadPngSnapshot(judgeSnapshotText);
    setSnapshotNotice('PNG snapshot downloaded.');
    setTimeout(() => setSnapshotNotice(''), 1800);
  }, [judgeSnapshotText]);

  const dismissTour = useCallback(() => {
    setShowTour(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    } catch {
      // ignore storage failures
    }
  }, []);

  // Sync presentation mode to DOM so CSS [data-presentation='true'] selector works
  useEffect(() => {
    document.documentElement.dataset.presentation = presentationMode ? 'true' : 'false';
  }, [presentationMode]);

  const lastRecordedSummaryKeyRef = useRef('');
  useEffect(() => {
    const selectedScenario = scenarios.find((item) => item.id === selectedScenarioId);
    if (!selectedScenario || !summary) {
      return;
    }

    const summaryKey = [
      selectedScenarioId,
      summary.winner,
      summary.deltas_vs_llm_only.tokens_reduction_pct,
      summary.deltas_vs_llm_only.latency_reduction_pct,
      summary.deltas_vs_llm_only.cost_reduction_pct,
      summary.deltas_vs_llm_only.judge_improvement_pct,
    ].join('|');

    if (summaryKey === lastRecordedSummaryKeyRef.current) {
      return;
    }

    lastRecordedSummaryKeyRef.current = summaryKey;
    addSingleRun(selectedScenario, summary);
  }, [addSingleRun, scenarios, selectedScenarioId, summary]);

  const sweepSummary = useMemo(() => (sweepResults ? reduceSweepSummary(sweepResults) : null), [sweepResults]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputTarget =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if (isInputTarget) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === 'h') {
        event.preventDefault();
        setPageMode('home');
        return;
      }
      if (key === 'd') {
        event.preventDefault();
        setPageMode('benchmark');
        return;
      }
      if (key === 'm') {
        event.preventDefault();
        cycleTheme();
        return;
      }
      if (pageMode !== 'benchmark') {
        return;
      }
      if (key === 'r' && !isRunning && !sweepIsRunning) {
        event.preventDefault();
        if (benchmarkMode === 'single') {
          void runSingleBenchmark();
        } else {
          void runSweepBenchmark();
        }
      } else if (key === '1') {
        event.preventDefault();
        setDashboardView('overview');
      } else if (key === '2') {
        event.preventDefault();
        setDashboardView('evidence');
      } else if (key === '3' || key === 'g') {
        event.preventDefault();
        setDashboardView('graph');
      } else if (key === 'p') {
        event.preventDefault();
        setPresentationMode((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    benchmarkMode,
    cycleTheme,
    isRunning,
    pageMode,
    runSingleBenchmark,
    runSweepBenchmark,
    sweepIsRunning,
  ]);

  return (
    <div className="min-h-screen bg-[var(--gp-bg)] text-[var(--gp-text)]">
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-70">
        <div className="absolute -left-8 top-0 h-[290px] w-[290px] rounded-full bg-[var(--gp-accent-soft)]/40 blur-3xl"></div>
        <div className="absolute bottom-20 right-0 h-[300px] w-[300px] rounded-full bg-[var(--gp-info-soft)]/45 blur-3xl"></div>
      </div>

      <header className="sticky top-0 z-40 border-b border-[var(--gp-border)] bg-[color:color-mix(in_srgb,var(--gp-surface)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button onClick={() => setPageMode('home')} className="flex min-w-0 items-center gap-3 text-left" type="button">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)]">
              <BrainCircuit className="h-5 w-5 text-[var(--gp-accent-strong)]" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight text-[var(--gp-text)] sm:text-base">{APP_NAME}</div>
              <div className="truncate text-[10px] font-medium uppercase tracking-widest text-[var(--gp-text-subtle)] sm:text-[11px]">
                GraphRAG Benchmark Suite
              </div>
            </div>
          </button>

          <nav className="hidden items-center gap-2 sm:flex">
            <button
              onClick={() => setPageMode('home')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                pageMode === 'home'
                  ? 'bg-[var(--gp-text)] text-[var(--gp-surface)]'
                  : 'text-[var(--gp-text-muted)] hover:bg-[var(--gp-surface-muted)]'
              }`}
              type="button"
            >
              Home
            </button>
            <button
              onClick={() => setPageMode('benchmark')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                pageMode === 'benchmark'
                  ? 'bg-[var(--gp-accent)] text-white'
                  : 'text-[var(--gp-text-muted)] hover:bg-[var(--gp-accent-ghost)]'
              }`}
              type="button"
            >
              Live Dashboard
            </button>
          </nav>

          <div className="hidden md:block">
            <ThemeControls themePreference={themePreference} onThemeChange={setThemePreference} />
          </div>
        </div>
      </header>

      <Suspense fallback={<LoadingPanel />}>
        {pageMode === 'home' ? (
          <HomePage
            scenarios={scenarios}
            onOpenDashboard={() => setPageMode('benchmark')}
            onJumpToScenario={(scenarioId) => {
              handleScenarioSelect(scenarioId);
              setPageMode('benchmark');
            }}
          />
        ) : (
          <BenchmarkWorkspace
            presentationMode={presentationMode}
            setPresentationMode={setPresentationMode}
            scenarios={scenarios}
            selectedScenarioId={selectedScenarioId}
            onScenarioSelect={handleScenarioSelect}
            query={query}
            setQuery={handleQueryChange}
            modelOverride={modelOverride}
            setModelOverride={setModelOverride}
            benchmarkMode={benchmarkMode}
            setBenchmarkMode={setBenchmarkMode}
            dashboardView={dashboardView}
            setDashboardView={setDashboardView}
            isRunning={isRunning}
            sweepIsRunning={sweepIsRunning}
            onRunBenchmark={() => void runSingleBenchmark()}
            onRunSweep={() => void runSweepBenchmark()}
            errorMessage={errorMessage}
            summary={displaySummary}
            results={results}
            evaluations={evaluations}
            normalizedPerformance={normalizedPerformance}
            judgeSnapshotText={judgeSnapshotText}
            snapshotNotice={snapshotNotice}
            onCopySnapshot={() => void copyJudgeSnapshot()}
            onDownloadSnapshot={downloadJudgeSnapshot}
            onDownloadSnapshotPng={downloadJudgeSnapshotPng}
            showTour={showTour}
            dismissTour={dismissTour}
            runHistory={runHistory}
            sweepResults={sweepResults}
            sweepSummary={sweepSummary}
            sweepScenarioIds={sweepScenarioIds}
            setSweepScenarioIds={setSweepScenarioIds}
            sweepRunsPerScenario={sweepRunsPerScenario}
            setSweepRunsPerScenario={setSweepRunsPerScenario}
            onGoHome={() => setPageMode('home')}
            themePreference={themePreference}
            onThemeChange={setThemePreference}
            benchmarkReport={benchmarkReport}
          />
        )}
      </Suspense>
    </div>
  );
}
