import type { GraphEdge, GraphNode } from '../types/benchmark';
import GraphVisualization from './GraphVisualization';

interface GraphVizPanelProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  title?: string;
  height?: string;
}

export default function GraphVizPanel({
  nodes,
  edges,
  title = 'TigerGraph Traversed Subgraph',
  height = '420px',
}: GraphVizPanelProps) {
  if (!nodes.length) {
    return (
      <section className="rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)] p-4 text-sm text-[var(--gp-text-muted)]">
        No graph traversal yet. Run a scenario to render the multi-hop subgraph.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--gp-border)] bg-[var(--gp-surface)]">
      <div className="border-b border-[var(--gp-border)] px-4 py-3">
        <div className="text-sm font-black text-[var(--gp-text)]">{title}</div>
        <div className="text-xs text-[var(--gp-text-muted)]">
          {nodes.length} nodes · {edges.length} edges
        </div>
      </div>
      <div style={{ height }}>
        <GraphVisualization nodes={nodes} edges={edges} />
      </div>
    </section>
  );
}
