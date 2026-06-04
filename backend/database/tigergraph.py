"""
TigerGraph Client — Authentic Graph Traversal Layer
=====================================================
Execution hierarchy:
  1. Real TigerGraph via REST++ API  (preferred when available)
  2. NetworkX emulation              (automatic fallback)

All traversal functions preserve identical JSON contracts:
  { nodes: [...], edges: [...], path: [...], source: "TigerGraph"|"NetworkX" }

Phase 4 migration: shortest_path + ego_graph via REST++.
Dual-validation: TigerGraph result vs NetworkX result logged on mismatch.
"""
from __future__ import annotations

import logging
import time
import urllib.parse
from pathlib import Path

import networkx as nx
import requests

from config import settings

logger = logging.getLogger(__name__)

DATA_DIR    = Path(__file__).resolve().parent.parent / "data"
RESTPP_BASE = f"http://{settings.TIGERGRAPH_HOST}:9000"
GSQL_BASE   = f"http://{settings.TIGERGRAPH_HOST}:14240"
GRAPH       = settings.TIGERGRAPH_GRAPH
_AUTH       = (settings.TIGERGRAPH_USERNAME, settings.TIGERGRAPH_PASSWORD)

# Maximum hops for ego-graph traversal (keeps context compact)
_EGO_DEPTH  = 2
# Maximum neighbors returned per entity in ego-graph mode
_EGO_MAX_NEIGHBORS = 30
# Request timeout for REST++ calls (seconds)
_TIMEOUT    = 8


# ─────────────────────────────────────────────────────────────────────────────
# Startup connectivity probe
# ─────────────────────────────────────────────────────────────────────────────

def _probe_tigergraph() -> bool:
    """Return True if REST++ is reachable AND FinancialCrimeGraph schema exists."""
    try:
        r = requests.get(f"{RESTPP_BASE}/echo", timeout=3)
        if r.status_code != 200:
            return False
        # Confirm the graph schema has been loaded (Entity vertex exists)
        r2 = requests.get(
            f"{GSQL_BASE}/gsql/v1/schema/graphs/{GRAPH}",
            auth=_AUTH, timeout=5
        )
        if r2.status_code != 200:
            logger.warning(
                "[TigerGraph] REST++ reachable but graph '%s' not found. "
                "Run database/setup_tigergraph.py to create and load the graph.",
                GRAPH,
            )
            return False
        schema = r2.json().get("results", {})
        vertex_names = [v.get("Name") for v in schema.get("VertexTypes", [])]
        if "Entity" not in vertex_names:
            logger.warning("[TigerGraph] Graph '%s' found but Entity vertex missing.", GRAPH)
            return False
        return True
    except Exception as exc:
        logger.debug("[TigerGraph] Probe failed: %s", exc)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# REST++ helpers
# ─────────────────────────────────────────────────────────────────────────────

def _vertex_url(vid: str) -> str:
    return f"{RESTPP_BASE}/graph/{GRAPH}/vertices/Entity/{urllib.parse.quote(vid, safe='')}"


def _edges_url(vid: str, limit: int = _EGO_MAX_NEIGHBORS) -> str:
    return (
        f"{RESTPP_BASE}/graph/{GRAPH}/edges/Entity/"
        f"{urllib.parse.quote(vid, safe='')}/RELATIONSHIP"
        f"?limit={limit}"
    )


def _get_vertex(vid: str) -> dict | None:
    """Fetch a single vertex by ID. Returns attribute dict or None."""
    try:
        r = requests.get(_vertex_url(vid), auth=_AUTH, timeout=_TIMEOUT)
        results = r.json().get("results", [])
        return results[0] if results else None
    except Exception as exc:
        logger.debug("[TigerGraph] get_vertex(%s) failed: %s", vid, exc)
        return None


def _get_neighbors(vid: str) -> list[dict]:
    """
    Return adjacent vertices via RELATIONSHIP edges (both directions stored).
    Reverse edges are stored with REV_ prefix on relation — we strip it for display.
    """
    try:
        r = requests.get(_edges_url(vid), auth=_AUTH, timeout=_TIMEOUT)
        neighbors = []
        seen: set[str] = set()
        for e in r.json().get("results", []):
            nbid = e.get("to_id", "")
            if not nbid or nbid in seen:
                continue
            seen.add(nbid)
            raw_rel = e.get("attributes", {}).get("relation", "LINKED")
            # Strip reverse-edge prefix — display the canonical relation
            rel = raw_rel.removeprefix("REV_")
            neighbors.append({"to_id": nbid, "relation": rel})
        return neighbors
    except Exception as exc:
        logger.debug("[TigerGraph] get_neighbors(%s) failed: %s", vid, exc)
        return []


def _vertex_to_node(vid: str, attrs: dict) -> dict:
    return {
        "id":         vid,
        "type":       attrs.get("entity_type", "Entity"),
        "risk_score": attrs.get("risk_score", 0),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Real TigerGraph traversal: shortest path (BFS over REST++)
# ─────────────────────────────────────────────────────────────────────────────

def _tg_shortest_path(source: str, target: str) -> dict:
    """
    BFS over REST++ edge queries to find shortest path between two entities.

    Execution trace (visible in retrieval_context):
      - TigerGraph REST++ traversal
      - BFS over RELATIONSHIP edges
      - Reconstructed ordered path

    Returns { nodes, edges, path, source }
    """
    t0 = time.perf_counter()
    logger.info("[TigerGraph:BFS] Starting shortest-path: %s → %s", source, target)

    # ── BFS ────────────────────────────────────────────────────────────────
    visited: dict[str, str | None] = {source: None}   # vid → parent
    parent_edge: dict[str, str] = {}                   # vid → relation from parent
    queue: list[str] = [source]
    found = False
    hops = 0
    max_hops = 6  # safety limit to avoid expensive traversal

    while queue and hops <= max_hops:
        next_queue: list[str] = []
        for vid in queue:
            if vid == target:
                found = True
                break
            neighbors = _get_neighbors(vid)
            for nb in neighbors:
                nbid = nb["to_id"]
                if nbid not in visited:
                    visited[nbid] = vid
                    parent_edge[nbid] = nb["relation"]
                    next_queue.append(nbid)
                    if nbid == target:
                        found = True
                        break
            if found:
                break
        if found:
            break
        queue = next_queue
        hops += 1

    latency_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        "[TigerGraph:BFS] Completed in %.1fms, hops=%d, found=%s",
        latency_ms, hops, found,
    )

    if not found:
        return {"nodes": [], "edges": [], "path": [], "source": "TigerGraph", "hops": hops}

    # ── Reconstruct path ───────────────────────────────────────────────────
    path: list[str] = []
    cur = target
    while cur is not None:
        path.append(cur)
        cur = visited[cur]
    path.reverse()

    # ── Fetch vertex attributes for all path nodes ─────────────────────────
    nodes_data: list[dict] = []
    for vid in path:
        v = _get_vertex(vid)
        if v:
            nodes_data.append(_vertex_to_node(vid, v.get("attributes", {})))
        else:
            nodes_data.append({"id": vid, "type": "Entity", "risk_score": 0})

    # ── Build ordered edge list ─────────────────────────────────────────────
    edges_data: list[dict] = []
    for i in range(len(path) - 1):
        src, tgt = path[i], path[i + 1]
        rel = parent_edge.get(tgt, "LINKED")
        edges_data.append({"source": src, "target": tgt, "type": rel})

    return {
        "nodes":  nodes_data,
        "edges":  edges_data,
        "path":   path,
        "source": "TigerGraph",
        "hops":   len(path) - 1,
        "latency_ms": latency_ms,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Real TigerGraph traversal: ego-graph (BFS to depth N over REST++)
# ─────────────────────────────────────────────────────────────────────────────

def _tg_ego_graph(entities: list[str], depth: int = _EGO_DEPTH) -> dict:
    """
    Multi-hop neighborhood expansion via REST++ edge queries.

    Strategy:
    - BFS from each seed entity up to `depth` hops
    - Collect all visited vertices and edges
    - Limit to _EGO_MAX_NEIGHBORS per vertex (keeps context compact)

    Returns { nodes, edges, path, source }
    """
    t0 = time.perf_counter()
    logger.info("[TigerGraph:EGO] Starting ego-graph: seeds=%s depth=%d", entities, depth)

    visited_vids: set[str] = set()
    all_edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()

    for seed in entities:
        frontier: set[str] = {seed}
        visited_vids.add(seed)

        for _ in range(max(1, depth)):
            next_frontier: set[str] = set()
            for vid in frontier:
                neighbors = _get_neighbors(vid)
                for nb in neighbors:
                    nbid = nb["to_id"]
                    rel  = nb["relation"]
                    key  = (vid, nbid)
                    if key not in edge_set:
                        edge_set.add(key)
                        all_edges.append({"source": vid, "target": nbid, "type": rel})
                    if nbid not in visited_vids:
                        visited_vids.add(nbid)
                        next_frontier.add(nbid)
            frontier = next_frontier

    latency_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        "[TigerGraph:EGO] Done: %d vertices, %d edges, %.1fms",
        len(visited_vids), len(all_edges), latency_ms,
    )

    # Fetch vertex attributes (batch)
    nodes_data: list[dict] = []
    for vid in sorted(visited_vids):
        v = _get_vertex(vid)
        if v:
            nodes_data.append(_vertex_to_node(vid, v.get("attributes", {})))
        else:
            nodes_data.append({"id": vid, "type": "Entity", "risk_score": 0})

    # Ordered path = entity seeds first, then rest alphabetically
    path = list(entities) + [v for v in sorted(visited_vids) if v not in entities]

    return {
        "nodes":  nodes_data,
        "edges":  all_edges,
        "path":   path[:20],   # cap for compact serialization
        "source": "TigerGraph",
        "latency_ms": latency_ms,
    }


# ─────────────────────────────────────────────────────────────────────────────
# NetworkX fallback helpers
# ─────────────────────────────────────────────────────────────────────────────

def _build_graph_payload(nx_graph: nx.DiGraph, node_set: set[str]) -> dict:
    subgraph = nx_graph.subgraph(node_set)
    nodes_data = [
        {
            "id":         n,
            "type":       nx_graph.nodes[n].get("type", "Entity"),
            "risk_score": nx_graph.nodes[n].get("risk_score", 0),
        }
        for n in subgraph.nodes
    ]
    edges_data = [
        {
            "source": u,
            "target": v,
            "type":   d.get("relation", "LINKED"),
        }
        for u, v, d in subgraph.edges(data=True)
    ]
    return {"nodes": nodes_data, "edges": edges_data}


def _nx_shortest_path(nx_graph: nx.DiGraph, source: str, target: str) -> dict:
    try:
        nx_undirected = nx_graph.to_undirected()
        path = nx.shortest_path(nx_undirected, source=source, target=target)
        payload = _build_graph_payload(nx_graph, set(path))
        payload["path"] = path
        payload["source"] = "NetworkX"
        return payload
    except (nx.NetworkXNoPath, nx.NodeNotFound):
        return {"nodes": [], "edges": [], "path": [], "source": "NetworkX"}


def _nx_ego_graph(nx_graph: nx.DiGraph, entities: list[str], depth: int) -> dict:
    nx_undirected = nx_graph.to_undirected()
    subgraph_nodes: set[str] = set()
    for entity in entities:
        if entity in nx_graph:
            lengths = nx.single_source_shortest_path_length(
                nx_undirected, source=entity, cutoff=max(1, depth)
            )
            subgraph_nodes.update(lengths.keys())
    payload = _build_graph_payload(nx_graph, subgraph_nodes)
    payload["path"] = list(entities) + [n for n in subgraph_nodes if n not in entities]
    payload["source"] = "NetworkX"
    return payload


# ─────────────────────────────────────────────────────────────────────────────
# Dual-backend validation (Phase D)
# ─────────────────────────────────────────────────────────────────────────────

def _validate_dual(tg_result: dict, nx_result: dict, op: str) -> None:
    """Log a warning if TigerGraph and NetworkX disagree on key path facts."""
    tg_path = set(tg_result.get("path", []))
    nx_path = set(nx_result.get("path", []))
    if not tg_path or not nx_path:
        return

    # Check that all key nodes from NetworkX appear in TigerGraph result
    missing_in_tg = nx_path - tg_path
    extra_in_tg   = tg_path - nx_path

    if missing_in_tg or extra_in_tg:
        logger.warning(
            "[TigerGraph:VALIDATE][%s] Path mismatch — "
            "missing_in_TG=%s  extra_in_TG=%s",
            op, missing_in_tg, extra_in_tg,
        )
    else:
        logger.info("[TigerGraph:VALIDATE][%s] Path agreement ✓", op)


# ─────────────────────────────────────────────────────────────────────────────
# Main client class
# ─────────────────────────────────────────────────────────────────────────────

class TigerGraphClient:
    """
    Unified graph traversal client.

    • Prefers live TigerGraph REST++ traversal when available.
    • Falls back automatically to NetworkX on any failure.
    • All public methods return identical JSON contracts regardless of backend.
    """

    def __init__(self) -> None:
        # ── Startup diagnostics ────────────────────────────────────────────
        print("[TigerGraph] Running startup connectivity probe…")
        self.use_tigergraph = _probe_tigergraph()

        if self.use_tigergraph:
            print(
                f"[TigerGraph] ✓ LIVE  — REST++ at {RESTPP_BASE}, graph '{GRAPH}'"
            )
        else:
            print(
                "[TigerGraph] ✗ OFFLINE — falling back to NetworkX emulation. "
                "Run `python database/setup_tigergraph.py` to enable real traversal."
            )

        # ── Load NetworkX as fallback (always, for validation + fallback) ──
        self.nx_graph: nx.DiGraph
        try:
            self.nx_graph = nx.read_gml(DATA_DIR / "graph.gml")
            print(
                f"[TigerGraph] NetworkX graph loaded: "
                f"{self.nx_graph.number_of_nodes()} nodes, "
                f"{self.nx_graph.number_of_edges()} edges"
            )
        except Exception as exc:
            logger.warning("[TigerGraph] GML load failed: %s", exc)
            self.nx_graph = nx.DiGraph()

    # ── Public API ───────────────────────────────────────────────────────────

    def list_entities(self) -> list[str]:
        """Return all entity IDs in the graph (used for entity extraction)."""
        return list(self.nx_graph.nodes())

    def get_shortest_path(self, source: str, target: str) -> dict:
        """
        Shortest path between two entities.

        Execution order:
          1. TigerGraph BFS via REST++  (if available)
          2. NetworkX fallback          (on failure or unavailability)

        Returns { nodes, edges, path, source, hops }
        """
        # Always compute NetworkX result for dual-validation logging
        nx_result = _nx_shortest_path(self.nx_graph, source, target)

        if not self.use_tigergraph:
            return nx_result

        try:
            tg_result = _tg_shortest_path(source, target)

            if not tg_result.get("nodes"):
                # TigerGraph returned empty — could be disconnected subgraph
                logger.warning(
                    "[TigerGraph] Empty shortest-path result for %s→%s. "
                    "Falling back to NetworkX.",
                    source, target,
                )
                return nx_result

            # Dual-backend validation log
            _validate_dual(tg_result, nx_result, f"shortest_path({source}→{target})")
            return tg_result

        except Exception as exc:
            logger.error(
                "[TigerGraph] shortest_path(%s→%s) failed: %s — using NetworkX fallback.",
                source, target, exc,
            )
            return nx_result

    def get_ego_graph(self, entities: list[str], depth: int = _EGO_DEPTH) -> dict:
        """
        Multi-hop neighborhood expansion from a list of seed entities.

        Execution order:
          1. TigerGraph BFS via REST++  (if available)
          2. NetworkX fallback          (on failure or unavailability)

        Returns { nodes, edges, path, source }
        """
        nx_result = _nx_ego_graph(self.nx_graph, entities, depth)

        if not self.use_tigergraph:
            return nx_result

        try:
            tg_result = _tg_ego_graph(entities, depth)

            if not tg_result.get("nodes"):
                logger.warning(
                    "[TigerGraph] Empty ego-graph result for %s. "
                    "Falling back to NetworkX.",
                    entities,
                )
                return nx_result

            _validate_dual(tg_result, nx_result, f"ego_graph({entities})")
            return tg_result

        except Exception as exc:
            logger.error(
                "[TigerGraph] ego_graph(%s) failed: %s — using NetworkX fallback.",
                entities, exc,
            )
            return nx_result

    @property
    def backend_label(self) -> str:
        return "TigerGraph REST++" if self.use_tigergraph else "NetworkX"


# ── Global singleton ──────────────────────────────────────────────────────────
tg_client = TigerGraphClient()
