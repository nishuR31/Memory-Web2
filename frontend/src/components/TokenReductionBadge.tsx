import type { PipelineResult, SummaryResult } from '../types/benchmark';

interface TokenReductionBadgeProps {
  summary: SummaryResult | null;
  results: Record<string, PipelineResult>;
}

export default function TokenReductionBadge({ summary, results }: TokenReductionBadgeProps) {
  const basic = results['Vector-RAG']?.tokens_total ?? 0;
  const graph = results.GraphRAG?.tokens_total ?? 0;
  const reduction = basic > 0 ? Math.max(0, ((basic - graph) / basic) * 100) : summary?.deltas_vs_llm_only.tokens_reduction_pct ?? 0;

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Token Reduction vs Basic RAG</div>
      <div className="mt-1 text-2xl font-black text-emerald-800">{reduction.toFixed(1)}%</div>
      <div className="text-xs text-emerald-700">
        Basic RAG {basic.toLocaleString()} tokens · GraphRAG {graph.toLocaleString()} tokens
      </div>
    </section>
  );
}
