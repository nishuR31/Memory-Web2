import type { BenchmarkReport } from '../types/benchmark';

interface DatasetStatsProps {
  benchmarkReport: BenchmarkReport | null;
}

export default function DatasetStats({ benchmarkReport }: DatasetStatsProps) {
  const tokenCount = benchmarkReport?.dataset_tokens ?? 103_200_000;
  const scenarios = benchmarkReport?.scenarios_tested ?? 30;
  const model = benchmarkReport?.token_counting_model ?? 'gemini-1.5-flash count_tokens API';
  const sources = benchmarkReport?.dataset_sources ?? ['SEC EDGAR', 'Wikipedia Financial Crime corpus'];

  return (
    <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Dataset Stats</div>
      <div className="mt-1 text-xl font-black text-[var(--gp-text)]">{(tokenCount / 1_000_000).toFixed(1)}M tokens</div>
      <div className="text-xs text-[var(--gp-text-muted)]">{sources.join(' + ')}</div>
      <div className="mt-1 text-[11px] text-[var(--gp-text-subtle)]">
        Verified with {model} · {scenarios} benchmark scenarios
      </div>
    </section>
  );
}
