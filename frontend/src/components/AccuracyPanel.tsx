import type { BenchmarkReport, EvaluationResult } from '../types/benchmark';

interface AccuracyPanelProps {
  graphEvaluation?: EvaluationResult;
  benchmarkReport: BenchmarkReport | null;
}

export default function AccuracyPanel({ graphEvaluation, benchmarkReport }: AccuracyPanelProps) {
  const judgeScore = graphEvaluation?.llm_judge.total_score ?? 0;
  const liveBert = graphEvaluation?.bert_score.f1 ?? 0;

  const judgePassRate = benchmarkReport?.aggregate.llm_judge_pass_rate ?? 0;
  const avgRaw = benchmarkReport?.aggregate.avg_bertscore_f1_raw ?? 0;
  const rescaled = Math.max(0, (avgRaw - 0.85) / 0.15);

  return (
    <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">Accuracy Panel</div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-3 py-2">
          <div className="text-xs font-semibold text-[var(--gp-accent-strong)]">LLM-as-a-Judge</div>
          <div className="text-lg font-black text-[var(--gp-accent-strong)]">{judgePassRate.toFixed(1)}% PASS</div>
          <div className="text-[11px] text-[var(--gp-text-muted)]">Live score: {judgeScore}/50</div>
        </div>
        <div className="rounded-xl border border-[var(--gp-info-soft)] bg-[var(--gp-info-ghost)] px-3 py-2">
          <div className="text-xs font-semibold text-[var(--gp-info)]">BERTScore</div>
          <div className="text-lg font-black text-[var(--gp-info)]">{avgRaw.toFixed(3)} raw</div>
          <div className="text-[11px] text-[var(--gp-text-muted)]">{rescaled.toFixed(3)} rescaled · live {liveBert.toFixed(3)}</div>
        </div>
      </div>
    </section>
  );
}
