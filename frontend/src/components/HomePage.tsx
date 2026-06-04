import { ArrowRight, Network, Radar, Sparkles, Trophy, Zap } from 'lucide-react';
import type { Scenario } from '../types/benchmark';

interface HomePageProps {
  scenarios: Scenario[];
  onOpenDashboard: () => void;
  onJumpToScenario: (scenarioId: string) => void;
}

const highlights = [
  {
    title: 'Graph-Native Reasoning',
    text: 'Shortest-path and multi-hop traversal logic explain exactly why two entities are connected.',
    icon: <Network className="h-5 w-5 text-[var(--gp-accent)]" />,
  },
  {
    title: 'Token Efficiency',
    text: 'Dense edge serialization avoids noisy paragraph stuffing and reduces prompt payload size.',
    icon: <Zap className="h-5 w-5 text-[var(--gp-warning)]" />,
  },
  {
    title: 'Audit-Ready Trace',
    text: 'Every answer is paired with explicit evidence chain and traversal path for compliance review.',
    icon: <Radar className="h-5 w-5 text-[var(--gp-info)]" />,
  },
];

export default function HomePage({ scenarios, onOpenDashboard, onJumpToScenario }: HomePageProps) {
  return (
    <main className="mx-auto flex max-w-[1280px] flex-col gap-10 px-4 py-10 sm:px-6 lg:py-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-center">
        <div className="lg:col-span-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--gp-accent-soft)] bg-[var(--gp-accent-ghost)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--gp-accent-strong)]">
            <Sparkles className="h-3.5 w-3.5" /> Built for Financial Crime Investigations
          </div>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight text-[var(--gp-text)] sm:text-5xl">
            Prove GraphRAG performance with transparent, reproducible benchmark evidence.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--gp-text-muted)] sm:text-lg">
            Compare LLM-only, Vector RAG, and GraphRAG on the same scenario. Track token usage, latency, cost,
            and judge score in one controlled environment.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={onOpenDashboard}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--gp-accent)] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110"
              type="button"
            >
              Open Live Dashboard <ArrowRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                if (scenarios.length > 0) {
                  onJumpToScenario(scenarios[0].id);
                } else {
                  onOpenDashboard();
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface)] px-5 py-3 text-sm font-semibold text-[var(--gp-text-muted)] transition hover:border-[var(--gp-accent)] hover:text-[var(--gp-accent-strong)]"
              type="button"
            >
              Jump to Scenario Run
            </button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-3xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-5 shadow-xl shadow-black/5">
            <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--gp-text-subtle)]">
              <Trophy className="h-4 w-4 text-[var(--gp-warning)]" /> Success Criteria
            </div>
            <div className="space-y-3">
              <HomeMetric label="Lower Tokens" value="Prompt Compression" />
              <HomeMetric label="Lower Latency" value="Graph-Native Traversal" />
              <HomeMetric label="Lower Cost" value="Minimal Inference Overhead" />
              <HomeMetric label="Higher Judge Score" value="Path + Relation Correctness" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {highlights.map((item) => (
          <article key={item.title} className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-5 shadow-sm shadow-black/5">
            <div className="mb-3 inline-flex rounded-lg bg-[var(--gp-surface-muted)] p-2">{item.icon}</div>
            <h3 className="text-base font-bold text-[var(--gp-text)]">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--gp-text-muted)]">{item.text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

function HomeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--gp-border)] bg-[var(--gp-surface-muted)] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--gp-text-subtle)]">{label}</div>
      <div className="text-sm font-bold text-[var(--gp-text)]">{value}</div>
    </div>
  );
}
