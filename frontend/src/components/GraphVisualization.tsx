/**
 * GraphVisualization — Cinematic Graph Traversal Renderer
 *
 * Design goals (Phase A/B/C/D):
 *  A. Active path visually dominates — inactive nodes fade to near-invisible
 *  B. Linear hierarchical layout — no grid, left→right chain for ≤8 nodes
 *  C. Cinematic traversal — edge animates FIRST, then destination node activates
 *  D. Fully hardened — deduplication, empty states, disconnected graph fallback
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphEdge, GraphNode } from '../types/benchmark';

export type { GraphEdge, GraphNode };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Horizontal spacing between node columns (linear layout) */
const H_GAP = 210;
/** Vertical spacing between nodes in the same column (multi-row fallback) */
const V_GAP = 140;
/** Max nodes per column before wrapping to a second row */
const MAX_PER_ROW = 7;
/** ms between each traversal step (edge reveal → node activate) */
const STEP_INTERVAL_MS = 750;
/** Delay from edge reveal to node glow activation (ms) */
const NODE_ACTIVATE_DELAY = 350;

// ---------------------------------------------------------------------------
// CSS variable reader
// ---------------------------------------------------------------------------

interface GraphTokens {
  canvasBg: string;
  grid: string;
  labelBg: string;
  nodeBg: string;
  nodeText: string;
  nodeMuted: string;
  edgeIdle: string;
  edgeActive: string;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function readGraphTokens(): GraphTokens {
  return {
    canvasBg:  cssVar('--gp-graph-bg',        '#050505'),
    grid:      cssVar('--gp-graph-grid',       '#1f2937'),
    labelBg:   cssVar('--gp-graph-label-bg',   '#1f2937'),
    nodeBg:    cssVar('--gp-graph-node-bg',    '#111113'),
    nodeText:  cssVar('--gp-graph-node-text',  '#e5e7eb'),
    nodeMuted: cssVar('--gp-graph-node-muted', '#9ca3af'),
    edgeIdle:  cssVar('--gp-graph-edge-idle',  '#4b5563'),
    edgeActive:cssVar('--gp-graph-edge-active','#22c55e'),
  };
}

// ---------------------------------------------------------------------------
// Type colour map
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  Person:      '#16a34a',
  Company:     '#2563eb',
  Corporation: '#2563eb',
  Trust:       '#d97706',
  Account:     '#d97706',
  Address:     '#7c3aed',
  Shell:       '#dc2626',
};

function nodeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#2563eb';
}

// ---------------------------------------------------------------------------
// Deduplication helpers
// ---------------------------------------------------------------------------

function dedupeNodes(nodes: GraphNode[]): GraphNode[] {
  const seen = new Set<string>();
  return nodes.filter((n) => {
    if (seen.has(n.id)) return false;
    seen.add(n.id);
    return true;
  });
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.source}→${e.target}`;
    const rev = `${e.target}→${e.source}`;
    if (seen.has(key) || seen.has(rev)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Layout: left-to-right linear chain (best for 3–8 node investigations)
// Falls back to wrapped grid for larger graphs.
// ---------------------------------------------------------------------------

function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): Record<string, { x: number; y: number }> {
  if (nodes.length === 0) return {};

  // Build ordered sequence from edges (path ordering)
  const ordered: string[] = [];
  const edgeMap = new Map<string, string[]>();
  for (const e of edges) {
    if (!edgeMap.has(e.source)) edgeMap.set(e.source, []);
    edgeMap.get(e.source)!.push(e.target);
  }

  // Find likely root: node that appears as source but not as target
  const targets = new Set(edges.map((e) => e.target));
  const sources = edges.map((e) => e.source);
  const root = sources.find((s) => !targets.has(s)) ?? nodes[0]?.id;

  // BFS from root to get ordering
  if (root && edges.length > 0) {
    const visited = new Set<string>();
    const queue = [root];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      if (visited.has(curr)) continue;
      visited.add(curr);
      ordered.push(curr);
      for (const next of edgeMap.get(curr) ?? []) {
        if (!visited.has(next)) queue.push(next);
      }
    }
    // append any isolated nodes not reached
    for (const n of nodes) {
      if (!visited.has(n.id)) ordered.push(n.id);
    }
  } else {
    for (const n of nodes) ordered.push(n.id);
  }

  const positions: Record<string, { x: number; y: number }> = {};

  if (ordered.length <= MAX_PER_ROW) {
    // Pure horizontal chain — most cinematic for investigations
    const totalW = (ordered.length - 1) * H_GAP;
    ordered.forEach((id, i) => {
      positions[id] = { x: i * H_GAP - totalW / 2, y: 0 };
    });
  } else {
    // Two-row staggered layout for larger graphs
    ordered.forEach((id, i) => {
      const col = i % MAX_PER_ROW;
      const row = Math.floor(i / MAX_PER_ROW);
      const totalW = (Math.min(ordered.length, MAX_PER_ROW) - 1) * H_GAP;
      positions[id] = {
        x: col * H_GAP - totalW / 2 + (row % 2 === 1 ? H_GAP / 2 : 0),
        y: row * V_GAP,
      };
    });
  }

  return positions;
}

// ---------------------------------------------------------------------------
// Empty / failure state overlay
// ---------------------------------------------------------------------------

function EmptyGraphState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-[var(--gp-border)] text-[var(--gp-text-subtle)]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      </div>
      <p className="max-w-[200px] text-xs text-[var(--gp-text-subtle)]">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface GraphVisualizationProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export default function GraphVisualization({ nodes: rawNodes, edges: rawEdges }: GraphVisualizationProps) {
  // ── Deduplicate inputs ──────────────────────────────────────────────────
  const nodes = useMemo(() => dedupeNodes(rawNodes ?? []), [rawNodes]);
  const edges = useMemo(() => dedupeEdges(rawEdges ?? []), [rawEdges]);

  // ── Traversal animation state ───────────────────────────────────────────
  // edgeStep: how many edges have been REVEALED (animated)
  // nodeStep: how many nodes have been FULLY ACTIVATED (glowing)
  const [edgeStep, setEdgeStep] = useState(0);
  const [nodeStep, setNodeStep] = useState(0);
  const [tokens, setTokens] = useState<GraphTokens>(() => readGraphTokens());
  const nodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset and re-animate whenever edges change
  useEffect(() => {
    if (edges.length === 0) return;

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setEdgeStep(step);

      // Activate the destination node with a small delay after edge reveal
      nodeTimerRef.current = setTimeout(() => {
        setNodeStep(step);
      }, NODE_ACTIVATE_DELAY);

      if (step >= edges.length) clearInterval(interval);
    }, STEP_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (nodeTimerRef.current) clearTimeout(nodeTimerRef.current);
    };
  }, [edges]);

  // ── Theme sync ─────────────────────────────────────────────────────────
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTokens(readGraphTokens());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // ── Layout positions ───────────────────────────────────────────────────
  const positions = useMemo(() => computeLayout(nodes, edges), [nodes, edges]);
  const fitViewOptions = useMemo(() => {
    const count = nodes.length;
    const padding =
      count <= 3 ? 0.12 :
      count <= 6 ? 0.16 :
      count <= 10 ? 0.2 : 0.24;
    const maxZoom =
      count <= 3 ? 1.24 :
      count <= 6 ? 1.12 :
      count <= 10 ? 1.02 : 0.95;

    return { padding, minZoom: 0.42, maxZoom };
  }, [nodes.length]);

  // ── Build ReactFlow nodes ──────────────────────────────────────────────
  const flowNodes = useMemo((): Node[] => {
    // Build edge-order: which step activates each node
    const nodeActivationStep: Record<string, number> = {};
    // Source of first edge activates at step 1
    if (edges.length > 0) {
      nodeActivationStep[edges[0].source] = 0; // visible from start
    }
    edges.forEach((edge, idx) => {
      if (nodeActivationStep[edge.target] === undefined) {
        nodeActivationStep[edge.target] = idx + 1;
      }
    });

    return nodes.map((node) => {
      const activationStep = nodeActivationStep[node.id] ?? 0;
      const isActive = nodeStep >= activationStep;
      const isSource = edges.length > 0 && edges[0].source === node.id;
      const isTarget = edges.length > 0 && edges[edges.length - 1].target === node.id;
      const isFinalTarget = isTarget && nodeStep >= edges.length;

      const color = nodeColor(node.type ?? 'Company');
      const pos = positions[node.id] ?? { x: 0, y: 0 };

      return {
        id: node.id,
        position: pos,
        style: { border: 'none', background: 'transparent', padding: 0 },
        data: {
          label: (
            <div
              className={`relative flex min-w-[160px] max-w-[200px] flex-col items-center rounded-xl border-2 px-3 py-3 transition-all duration-500 ${
                isActive
                  ? 'scale-100 opacity-100'
                  : 'scale-90 opacity-[0.08] grayscale'
              }`}
              style={{
                borderColor: isActive ? color : tokens.edgeIdle,
                backgroundColor: isActive
                  ? `${tokens.nodeBg}F2`
                  : `${tokens.nodeBg}33`,
                boxShadow: isFinalTarget
                  ? `0 0 28px 6px ${color}55, 0 0 8px 2px ${color}88`
                  : isActive
                  ? `0 0 16px 3px ${color}33`
                  : 'none',
              }}
            >
              {/* Type badge */}
              <div
                className="mb-1 rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest"
                style={{ backgroundColor: `${color}22`, color }}
              >
                {node.type ?? 'Entity'}
              </div>

              {/* Node ID / name */}
              <div
                className="text-center text-[11px] font-bold leading-tight"
                style={{ color: isActive ? tokens.nodeText : tokens.nodeMuted }}
              >
                {node.id}
              </div>

              {/* Risk score — only show on active nodes */}
              {isActive && node.risk_score !== undefined && (
                <div
                  className="mt-1.5 flex items-center gap-1 text-[9px]"
                  style={{ color: tokens.nodeMuted }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  Risk {node.risk_score}
                </div>
              )}

              {/* Final target crown marker */}
              {isFinalTarget && (
                <div
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[8px] font-black uppercase tracking-wide text-white"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                >
                  ★ target
                </div>
              )}

              {/* Source origin marker */}
              {isSource && isActive && !isFinalTarget && (
                <div
                  className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-1.5 py-px text-[8px] font-black uppercase tracking-wide"
                  style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}` }}
                >
                  origin
                </div>
              )}
            </div>
          ),
        },
      };
    });
  }, [nodes, edges, positions, nodeStep, tokens]);

  // ── Build ReactFlow edges ──────────────────────────────────────────────
  const flowEdges = useMemo((): Edge[] => {
    return edges.map((edge, index) => {
      const isTraversed = index < edgeStep;
      const isCurrentlyAnimating = index === edgeStep - 1;

      return {
        id: `${edge.source}→${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        animated: isTraversed,
        label: edge.type ?? '',
        labelStyle: {
          fill: isTraversed ? tokens.edgeActive : tokens.nodeMuted,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase' as const,
          opacity: isTraversed ? 1 : 0.3,
          transition: 'opacity 0.4s ease',
        },
        labelBgStyle: {
          fill: tokens.labelBg,
          opacity: isTraversed ? 0.9 : 0.3,
        },
        style: {
          stroke: isTraversed ? tokens.edgeActive : tokens.edgeIdle,
          strokeWidth: isTraversed ? (isCurrentlyAnimating ? 4 : 2.5) : 1.5,
          opacity: isTraversed ? 1 : 0.15,
          filter: isTraversed
            ? `drop-shadow(0 0 ${isCurrentlyAnimating ? '10px' : '4px'} ${tokens.edgeActive}88)`
            : 'none',
          transition: 'stroke 0.3s ease, stroke-width 0.3s ease, opacity 0.4s ease, filter 0.3s ease',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: isTraversed ? 16 : 12,
          height: isTraversed ? 16 : 12,
          color: isTraversed ? tokens.edgeActive : tokens.edgeIdle,
        },
      };
    });
  }, [edgeStep, edges, tokens]);

  // ── Chain legend strip ─────────────────────────────────────────────────
  const chainNodes = useMemo(() => {
    if (edges.length === 0) return nodes.map((n) => n.id);
    const ordered: string[] = [];
    const visited = new Set<string>();
    // Follow edge order
    if (edges.length > 0) {
      ordered.push(edges[0].source);
      visited.add(edges[0].source);
    }
    for (const e of edges) {
      if (!visited.has(e.target)) {
        ordered.push(e.target);
        visited.add(e.target);
      }
    }
    return ordered;
  }, [nodes, edges]);

  // ── Empty / error guards ───────────────────────────────────────────────
  const colorMode = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: tokens.canvasBg }}>
        <EmptyGraphState message="No graph entities found. Run a benchmark to populate the graph." />
      </div>
    );
  }

  if (nodes.length === 1 && edges.length === 0) {
    return (
      <div className="flex h-full items-center justify-center" style={{ background: tokens.canvasBg }}>
        <EmptyGraphState message={`Single entity: ${nodes[0].id}. No traversal path available.`} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Chain legend strip at top */}
      {chainNodes.length >= 2 && (
        <div
          className="absolute left-3 right-3 top-3 z-10 flex items-center gap-1 overflow-x-auto rounded-lg border px-2 py-1.5 backdrop-blur-sm"
          style={{
            background: `${tokens.nodeBg}CC`,
            borderColor: `${tokens.edgeIdle}55`,
          }}
        >
          {chainNodes.map((id, i) => {
            const activated = nodeStep > i || (i === 0 && edges.length > 0);
            return (
              <div key={id} className="flex shrink-0 items-center gap-1">
                <span
                  className="truncate rounded px-1.5 py-0.5 text-[9px] font-bold transition-all duration-500"
                  style={{
                    maxWidth: 120,
                    color: activated ? tokens.nodeText : tokens.nodeMuted,
                    backgroundColor: activated ? `${tokens.edgeActive}22` : 'transparent',
                    opacity: activated ? 1 : 0.4,
                  }}
                >
                  {id}
                </span>
                {i < chainNodes.length - 1 && (
                  <span
                    className="shrink-0 text-[10px] transition-all duration-300"
                    style={{
                      color: edgeStep > i ? tokens.edgeActive : tokens.edgeIdle,
                      opacity: edgeStep > i ? 1 : 0.3,
                    }}
                  >
                    →
                  </span>
                )}
              </div>
            );
          })}
          <div className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest"
            style={{ color: tokens.nodeMuted }}>
            {edgeStep}/{edges.length} hops
          </div>
        </div>
      )}

      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        fitView
        fitViewOptions={fitViewOptions}
        style={{ background: tokens.canvasBg }}
        colorMode={colorMode}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background color={tokens.grid} gap={20} size={0.5} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
