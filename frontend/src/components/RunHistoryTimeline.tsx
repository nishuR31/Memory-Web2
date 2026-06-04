import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import type { RunHistoryEntry } from '../types/benchmark';

interface RunHistoryTimelineProps {
  runHistory: RunHistoryEntry[];
}

export default function RunHistoryTimeline({ runHistory }: RunHistoryTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...runHistory].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [runHistory]
  );

  if (sorted.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 shadow-sm shadow-black/5 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-black uppercase tracking-wider text-[var(--gp-text)]">Benchmark History</h3>
        <span className="text-[11px] font-semibold text-[var(--gp-text-subtle)]">Last {sorted.length} runs</span>
      </div>

      <div className="space-y-2">
        {sorted.map((entry) => {
          const expanded = expandedId === entry.id;
          return (
            <article key={entry.id} className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] p-3">
              <button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                className="grid w-full gap-2 text-left md:grid-cols-[160px_1fr_240px_auto] md:items-center"
              >
                <div className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--gp-text-muted)]">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(entry.timestamp).toLocaleString()}
                </div>
                <div className="text-xs text-[var(--gp-text-muted)]">
                  {entry.mode === 'single' ? (
                    <>
                      <span className="font-bold text-[var(--gp-text)]">{entry.scenarioId}</span> · {entry.scenarioCategory}
                    </>
                  ) : (
                    <>
                      <span className="font-bold text-[var(--gp-text)]">Sweep</span> · {entry.sweepScenarioCount} scenarios ·
                      {' '}RPS {entry.sweepRunsPerScenario}
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="rounded-full bg-[var(--gp-accent-soft)] px-2 py-0.5 font-bold text-[var(--gp-accent-strong)]">
                    {entry.winner}
                  </span>
                  <span className="rounded bg-[var(--gp-surface)] px-1.5 py-0.5 text-[var(--gp-text-muted)]">
                    T {entry.tokensReductionPct}%
                  </span>
                  <span className="rounded bg-[var(--gp-surface)] px-1.5 py-0.5 text-[var(--gp-text-muted)]">
                    L {entry.latencyReductionPct}%
                  </span>
                  <span className="rounded bg-[var(--gp-surface)] px-1.5 py-0.5 text-[var(--gp-text-muted)]">
                    C {entry.costReductionPct}%
                  </span>
                  <span className="rounded bg-[var(--gp-surface)] px-1.5 py-0.5 text-[var(--gp-text-muted)]">
                    J {entry.judgeImprovementPct}%
                  </span>
                </div>
                <div className="justify-self-end text-[var(--gp-text-subtle)]">
                  {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {expanded && entry.scenarioBreakdown && entry.scenarioBreakdown.length > 0 && (
                <div className="mt-3 rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface)] p-2">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--gp-text-subtle)]">
                    Scenario Drilldown
                  </div>
                  <div className="grid gap-1">
                    {entry.scenarioBreakdown.map((scenario) => (
                      <div key={scenario.scenarioId} className="text-xs text-[var(--gp-text-muted)]">
                        <span className="font-semibold text-[var(--gp-text)]">{scenario.scenarioId}</span> · {scenario.winner}
                        {' '}· T {scenario.tokensReductionPct}% · L {scenario.latencyReductionPct}% · C {scenario.costReductionPct}% · J {scenario.judgeImprovementPct}%
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
