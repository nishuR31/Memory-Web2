import { expect, test } from '@playwright/test';

const scenarios = [
  {
    id: 'SCN-001',
    category: 'hidden_ownership',
    query: 'Who is the ultimate beneficial owner of Meridian Holdings Ltd?',
    ground_truth: 'Meridian Holdings is linked to Viktor Kasarov via three hops.',
    expected_graphrag_advantage: 'Requires 3-hop reconstruction',
    tags: ['ownership', 'multi-hop'],
  },
  {
    id: 'SCN-002',
    category: 'sanctions_exposure',
    query: 'Does Vertex Capital have any indirect exposure to sanctioned entities?',
    ground_truth: 'Vertex Capital indirectly links to sanctioned Red Star Shipping.',
    expected_graphrag_advantage: 'Needs connected relationship path',
    tags: ['sanctions'],
  },
];

const runSsePayload = [
  {
    pipeline: 'LLM-Only',
    answer: 'Baseline answer without graph evidence.',
    tokens_input: 350,
    tokens_output: 120,
    tokens_total: 470,
    latency_ms: 880,
    cost_usd: 0.0021,
    retrieval_context: [],
    reasoning_path: [],
    graph_nodes: [],
    graph_edges: [],
  },
  {
    pipeline: 'Vector-RAG',
    answer: 'Vector retrieval returned partially disconnected chunks.',
    tokens_input: 310,
    tokens_output: 100,
    tokens_total: 410,
    latency_ms: 730,
    cost_usd: 0.0017,
    retrieval_context: ['Chunk 1 evidence', 'Chunk 2 evidence'],
    reasoning_path: [],
    graph_nodes: [],
    graph_edges: [],
  },
  {
    pipeline: 'GraphRAG',
    answer: 'Graph traversal reconstructed the full multi-hop chain.',
    tokens_input: 220,
    tokens_output: 90,
    tokens_total: 310,
    latency_ms: 490,
    cost_usd: 0.0011,
    retrieval_context: ['NodeA -[OWNS]-> NodeB', 'NodeB -[OWNS]-> NodeC'],
    reasoning_path: ['NodeA', 'NodeB', 'NodeC'],
    graph_nodes: [
      { id: 'NodeA', type: 'Person', risk_score: 92 },
      { id: 'NodeB', type: 'Company', risk_score: 74 },
      { id: 'NodeC', type: 'Company', risk_score: 86 },
    ],
    graph_edges: [
      { source: 'NodeA', target: 'NodeB', type: 'OWNS' },
      { source: 'NodeB', target: 'NodeC', type: 'OWNS' },
    ],
  },
  {
    type: 'evaluation',
    pipeline: 'LLM-Only',
    bert_score: { precision: 0.7, recall: 0.62, f1: 0.65 },
    llm_judge: { total_score: 31, reasoning: 'Missing linkage depth.' },
    token_reduction_pct: 0,
  },
  {
    type: 'evaluation',
    pipeline: 'Vector-RAG',
    bert_score: { precision: 0.73, recall: 0.68, f1: 0.7 },
    llm_judge: { total_score: 36, reasoning: 'Partial evidence chain.' },
    token_reduction_pct: 12,
  },
  {
    type: 'evaluation',
    pipeline: 'GraphRAG',
    bert_score: { precision: 0.84, recall: 0.81, f1: 0.82 },
    llm_judge: { total_score: 45, reasoning: 'Strong path correctness and evidence quality.' },
    token_reduction_pct: 34,
  },
  {
    type: 'summary',
    winner: 'GraphRAG',
    wins: {
      tokens_total: true,
      latency_ms: true,
      cost_usd: true,
      judge_score: true,
    },
    deltas_vs_llm_only: {
      tokens_reduction_pct: 34,
      latency_reduction_pct: 44,
      cost_reduction_pct: 47,
      judge_improvement_pct: 45,
    },
  },
];

const sweepPayload = {
  sweep_id: 'sweep_demo_001',
  scenario_results: scenarios.map((scenario) => ({
    scenario_id: scenario.id,
    category: scenario.category,
    query: scenario.query,
    pipeline_aggregates: [
      {
        pipeline: 'LLM-Only',
        avg_tokens_total: 468,
        stdev_tokens_total: 12,
        avg_latency_ms: 880,
        stdev_latency_ms: 29,
        avg_cost_usd: 0.0021,
        stdev_cost_usd: 0.0001,
        avg_judge_score: 31,
        stdev_judge_score: 0.7,
        win_rate: 0,
      },
      {
        pipeline: 'Vector-RAG',
        avg_tokens_total: 412,
        stdev_tokens_total: 8,
        avg_latency_ms: 742,
        stdev_latency_ms: 33,
        avg_cost_usd: 0.0018,
        stdev_cost_usd: 0.0001,
        avg_judge_score: 36,
        stdev_judge_score: 0.8,
        win_rate: 0,
      },
      {
        pipeline: 'GraphRAG',
        avg_tokens_total: 309,
        stdev_tokens_total: 7,
        avg_latency_ms: 496,
        stdev_latency_ms: 22,
        avg_cost_usd: 0.0011,
        stdev_cost_usd: 0.0001,
        avg_judge_score: 45,
        stdev_judge_score: 0.6,
        win_rate: 1,
      },
    ],
    runs: [
      {
        run_index: 1,
        results: runSsePayload.filter((item) => !('type' in item)),
        evaluations: runSsePayload.filter((item) => 'type' in item && item.type === 'evaluation'),
        summary: runSsePayload.find((item) => 'type' in item && item.type === 'summary'),
      },
    ],
  })),
  pipeline_aggregates: [
    {
      pipeline: 'LLM-Only',
      avg_tokens_total: 468,
      stdev_tokens_total: 12,
      avg_latency_ms: 880,
      stdev_latency_ms: 29,
      avg_cost_usd: 0.0021,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 31,
      stdev_judge_score: 0.7,
      win_rate: 0,
    },
    {
      pipeline: 'Vector-RAG',
      avg_tokens_total: 412,
      stdev_tokens_total: 8,
      avg_latency_ms: 742,
      stdev_latency_ms: 33,
      avg_cost_usd: 0.0018,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 36,
      stdev_judge_score: 0.8,
      win_rate: 0,
    },
    {
      pipeline: 'GraphRAG',
      avg_tokens_total: 309,
      stdev_tokens_total: 7,
      avg_latency_ms: 496,
      stdev_latency_ms: 22,
      avg_cost_usd: 0.0011,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 45,
      stdev_judge_score: 0.6,
      win_rate: 1,
    },
  ],
  leaderboard: [
    {
      rank: 1,
      pipeline: 'GraphRAG',
      rank_score: 0.98,
      avg_tokens_total: 309,
      stdev_tokens_total: 7,
      avg_latency_ms: 496,
      stdev_latency_ms: 22,
      avg_cost_usd: 0.0011,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 45,
      stdev_judge_score: 0.6,
      win_rate: 1,
      efficiency_components: {
        judge_eff: 1,
        win_rate_eff: 1,
        latency_eff: 1,
        cost_eff: 1,
        tokens_eff: 1,
      },
    },
    {
      rank: 2,
      pipeline: 'Vector-RAG',
      rank_score: 0.41,
      avg_tokens_total: 412,
      stdev_tokens_total: 8,
      avg_latency_ms: 742,
      stdev_latency_ms: 33,
      avg_cost_usd: 0.0018,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 36,
      stdev_judge_score: 0.8,
      win_rate: 0,
      efficiency_components: {
        judge_eff: 0.38,
        win_rate_eff: 0,
        latency_eff: 0.25,
        cost_eff: 0.25,
        tokens_eff: 0.22,
      },
    },
    {
      rank: 3,
      pipeline: 'LLM-Only',
      rank_score: 0,
      avg_tokens_total: 468,
      stdev_tokens_total: 12,
      avg_latency_ms: 880,
      stdev_latency_ms: 29,
      avg_cost_usd: 0.0021,
      stdev_cost_usd: 0.0001,
      avg_judge_score: 31,
      stdev_judge_score: 0.7,
      win_rate: 0,
      efficiency_components: {
        judge_eff: 0,
        win_rate_eff: 0,
        latency_eff: 0,
        cost_eff: 0,
        tokens_eff: 0,
      },
    },
  ],
  graphrag_advantage_summary: {
    vs_llm_only: {
      tokens_reduction_pct: 34,
      latency_reduction_pct: 44,
      cost_reduction_pct: 47,
      judge_improvement_pct: 45,
    },
    vs_vector_rag: {
      tokens_reduction_pct: 25,
      latency_reduction_pct: 33,
      cost_reduction_pct: 39,
      judge_improvement_pct: 25,
    },
  },
};

function toSse(events: object[]) {
  return `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')}`;
}

async function mockApi(page: import('@playwright/test').Page) {
  await page.route('**/scenarios', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(scenarios),
    });
  });

  await page.route('**/benchmark/run', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: toSse(runSsePayload as object[]),
      headers: {
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });

  await page.route('**/benchmark/sweep', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(sweepPayload),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('single-run flow renders summary and winner', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Open Live Dashboard/i }).click();

  await page.getByRole('button', { name: /Run Benchmark/i }).click();

  await expect(page.getByText('GraphRAG Intelligence Dashboard')).toBeVisible();
  await expect(page.getByText(/Winner/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pipeline 3: GraphRAG' })).toBeVisible();
});

test('sweep flow renders leaderboard and aggregate charts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Open Live Dashboard/i }).click();

  await page.getByRole('button', { name: /Batch Sweep/i }).click();
  await page.getByRole('button', { name: /Run Batch Benchmark/i }).click();

  await expect(page.getByText('Sweep Leaderboard')).toBeVisible();
  await expect(page.getByText('Run-to-Run Variance')).toBeVisible();
  await expect(page.getByText('GraphRAG Trend + Win-Rate Band')).toBeVisible();
});

test('dark mode persists after reload (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop-only header controls for this assertion path.');

  await page.goto('/');
  await page.getByRole('button', { name: /Dark/i }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('scroll regression and mobile rail interaction', async ({ page, isMobile }) => {
  await page.addInitScript(() => {
    const rows = Array.from({ length: 12 }, (_, index) => ({
      id: `seed_${index}`,
      timestamp: new Date(Date.now() - index * 30_000).toISOString(),
      mode: 'single',
      winner: 'GraphRAG',
      tokensReductionPct: 22,
      latencyReductionPct: 18,
      costReductionPct: 11,
      judgeImprovementPct: 7,
      scenarioId: 'SCN-001',
      scenarioCategory: 'hidden_ownership',
    }));
    window.localStorage.setItem('graphpulse.runHistory.v2', JSON.stringify(rows));
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Open Live Dashboard/i }).click();
  await page.getByRole('button', { name: /Run Benchmark/i }).click();
  await expect(page.getByText('GraphRAG Intelligence Dashboard')).toBeVisible();

  const scrollBottom = await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
    return window.scrollY;
  });
  expect(scrollBottom).toBeGreaterThan(0);

  const scrollTop = await page.evaluate(() => {
    window.scrollTo(0, 0);
    return window.scrollY;
  });
  expect(scrollTop).toBe(0);

  if (isMobile) {
    await page.getByRole('button', { name: 'View', exact: true }).click();
    await expect(page.getByText('Vector RAG Evidence Trace')).toBeVisible();
  }
});
