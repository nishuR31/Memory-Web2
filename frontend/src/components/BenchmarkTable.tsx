import { useMemo, useState } from 'react';
import type { BenchmarkReport } from '../types/benchmark';

type SortKey = 'scenario_id' | 'token_reduction_vs_basic_rag' | 'judge' | 'bertscore';

interface BenchmarkTableProps {
  benchmarkReport: BenchmarkReport | null;
}

export default function BenchmarkTable({ benchmarkReport }: BenchmarkTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('scenario_id');

  const rows = useMemo(() => {
    const data = benchmarkReport?.results ?? [];
    const cloned = [...data];
    cloned.sort((a, b) => {
      if (sortKey === 'scenario_id') {
        return a.scenario_id.localeCompare(b.scenario_id);
      }
      if (sortKey === 'token_reduction_vs_basic_rag') {
        return b.token_reduction_vs_basic_rag - a.token_reduction_vs_basic_rag;
      }
      if (sortKey === 'judge') {
        return (b.accuracy.llm_judge.score ?? 0) - (a.accuracy.llm_judge.score ?? 0);
      }
      return (b.accuracy.bertscore.f1_raw ?? 0) - (a.accuracy.bertscore.f1_raw ?? 0);
    });
    return cloned;
  }, [benchmarkReport?.results, sortKey]);

  return (
    <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-[var(--gp-text)]">30-Scenario Benchmark Table</div>
          <div className="text-xs text-[var(--gp-text-muted)]">Sortable report from benchmark_report.json</div>
        </div>
        <select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="rounded-lg border border-[var(--gp-border)] bg-[var(--gp-surface)] px-2 py-1 text-xs"
        >
          <option value="scenario_id">Sort: Scenario</option>
          <option value="token_reduction_vs_basic_rag">Sort: Token Reduction</option>
          <option value="judge">Sort: Judge Score</option>
          <option value="bertscore">Sort: BERTScore</option>
        </select>
      </div>

      <div className="max-h-[340px] overflow-auto">
        <table className="w-full min-w-[680px] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--gp-border)] text-[var(--gp-text-subtle)]">
              <th className="px-2 py-2">Scenario</th>
              <th className="px-2 py-2">Token Reduction</th>
              <th className="px-2 py-2">Judge</th>
              <th className="px-2 py-2">BERTScore Raw</th>
              <th className="px-2 py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.scenario_id} className="border-b border-[var(--gp-border)]/60">
                <td className="px-2 py-2 font-semibold text-[var(--gp-text)]">{row.scenario_id}</td>
                <td className="px-2 py-2 text-emerald-700">{row.token_reduction_vs_basic_rag.toFixed(1)}%</td>
                <td className="px-2 py-2">{row.accuracy.llm_judge.score.toFixed(3)}</td>
                <td className="px-2 py-2">{row.accuracy.bertscore.f1_raw.toFixed(3)}</td>
                <td className="px-2 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      row.accuracy.llm_judge.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {row.accuracy.llm_judge.verdict}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-[var(--gp-text-muted)]">
                  Run `backend/benchmark/run_benchmark.py` to populate this table.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
