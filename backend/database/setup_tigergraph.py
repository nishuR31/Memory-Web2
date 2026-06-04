"""
TigerGraph Schema Setup & Data Loader
======================================
Run once to:
1. Create schema  (Entity vertex + RELATIONSHIP directed edge + FinancialCrimeGraph)
2. Load all GML nodes → Entity vertices via REST++ upsert
3. Load all GML edges → RELATIONSHIP edges via REST++ upsert

Safe to re-run (upserts are idempotent).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import requests

RESTPP_BASE = "http://127.0.0.1:9000"
GSQL_BASE   = "http://127.0.0.1:14240"
GRAPH       = "FinancialCrimeGraph"
AUTH        = ("tigergraph", "tigergraph")
DATA_DIR    = Path(__file__).resolve().parent.parent / "data"


# ── helpers ──────────────────────────────────────────────────────────────────

def gsql(stmt: str, label: str = "") -> str:
    """Submit a single GSQL DDL statement. Returns response text."""
    r = requests.post(
        f"{GSQL_BASE}/gsql/v1/statements",
        auth=AUTH,
        headers={"Content-Type": "text/plain"},
        data=stmt,
        timeout=60,
    )
    text = r.text.strip()
    tag = f"[{label}] " if label else ""
    print(f"{tag}{r.status_code}: {text[:120]}")
    return text


def restpp(method: str, path: str, payload: dict | list | None = None) -> dict:
    """Execute a REST++ API call."""
    url = f"{RESTPP_BASE}{path}"
    if method == "GET":
        r = requests.get(url, auth=AUTH, timeout=30)
    else:
        r = requests.post(
            url,
            auth=AUTH,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=60,
        )
    return r.json()


def check_echo() -> bool:
    try:
        r = requests.get(f"{RESTPP_BASE}/echo", auth=AUTH, timeout=5)
        return r.status_code == 200
    except Exception:
        return False


# ── schema creation ───────────────────────────────────────────────────────────

def create_schema() -> None:
    print("\n=== STEP 1: Schema Creation ===")

    # Check if already exists
    try:
        r = requests.get(
            f"{GSQL_BASE}/gsql/v1/schema/graphs/{GRAPH}",
            auth=AUTH, timeout=10
        )
        if r.status_code == 200:
            print(f"Graph '{GRAPH}' already exists — skipping schema creation.")
            return
    except Exception:
        pass

    gsql("CREATE VERTEX Entity (PRIMARY_ID id STRING, entity_type STRING, risk_score INT)",
         "CREATE VERTEX")
    time.sleep(0.5)

    gsql(
        "CREATE DIRECTED EDGE RELATIONSHIP (FROM Entity, TO Entity, relation STRING)",
        "CREATE EDGE",
    )
    time.sleep(0.5)

    gsql(f"CREATE GRAPH {GRAPH} (Entity, RELATIONSHIP)", "CREATE GRAPH")
    time.sleep(2)  # graph creation takes a moment
    print("Schema creation complete.")


# ── data loading ──────────────────────────────────────────────────────────────

def _gml_nodes_edges() -> tuple[list[dict], list[dict]]:
    """Parse the GML file into node/edge dicts."""
    import networkx as nx
    g = nx.read_gml(DATA_DIR / "graph.gml")
    nodes = []
    for n, d in g.nodes(data=True):
        nodes.append({
            "id": n,
            "entity_type": d.get("type", "Entity"),
            "risk_score": int(d.get("risk_score", 0)),
        })
    edges = []
    for u, v, d in g.edges(data=True):
        edges.append({
            "source": u,
            "target": v,
            "relation": d.get("relation", "LINKED"),
        })
    return nodes, edges


def load_vertices(nodes: list[dict]) -> None:
    print(f"\n=== STEP 2: Loading {len(nodes)} vertices ===")
    # REST++ upsert — batch of 100
    batch_size = 100
    ok = 0
    for i in range(0, len(nodes), batch_size):
        batch = nodes[i:i + batch_size]
        payload = {
            "vertices": {
                "Entity": {
                    n["id"]: {
                        "entity_type": {"value": n["entity_type"]},
                        "risk_score":  {"value": n["risk_score"]},
                    }
                    for n in batch
                }
            }
        }
        result = restpp("POST", f"/graph/{GRAPH}", payload)
        accepted = result.get("results", [{}])
        ok += sum(r.get("accepted_vertices", 0) for r in accepted if isinstance(r, dict))
    print(f"Vertices upserted: {ok}/{len(nodes)}")


def load_edges(edges: list[dict]) -> None:
    print(f"\n=== STEP 3: Loading {len(edges)} edges ===")
    batch_size = 200
    ok = 0
    for i in range(0, len(edges), batch_size):
        batch = edges[i:i + batch_size]
        edges_payload: dict = {"edges": {"Entity": {}}}
        for e in batch:
            src = e["source"]
            tgt = e["target"]
            rel = e["relation"]
            if src not in edges_payload["edges"]["Entity"]:
                edges_payload["edges"]["Entity"][src] = {"RELATIONSHIP": {}}
            if "RELATIONSHIP" not in edges_payload["edges"]["Entity"][src]:
                edges_payload["edges"]["Entity"][src]["RELATIONSHIP"] = {}
            edges_payload["edges"]["Entity"][src]["RELATIONSHIP"][tgt] = {
                "Entity": {"relation": {"value": rel}}
            }
        result = restpp("POST", f"/graph/{GRAPH}", edges_payload)
        accepted = result.get("results", [{}])
        ok += sum(r.get("accepted_edges", 0) for r in accepted if isinstance(r, dict))
    print(f"Edges upserted: {ok}/{len(edges)}")


def verify_load() -> None:
    print("\n=== STEP 4: Verification ===")
    # Count vertices
    r = requests.get(
        f"{RESTPP_BASE}/graph/{GRAPH}/vertices/Entity?limit=1&count_only=true",
        auth=AUTH, timeout=10
    )
    print("Vertex count response:", r.text[:200])

    # Spot check a known node
    import urllib.parse
    node_id = urllib.parse.quote("Meridian Holdings Ltd")
    r2 = requests.get(
        f"{RESTPP_BASE}/graph/{GRAPH}/vertices/Entity/{node_id}",
        auth=AUTH, timeout=10
    )
    print("Spot-check 'Meridian Holdings Ltd':", r2.text[:200])


# ── main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("TigerGraph Setup & Loader")
    print("=" * 50)

    if not check_echo():
        print("ERROR: TigerGraph REST++ not reachable at port 9000. Is Docker running?")
        sys.exit(1)
    print("✓ TigerGraph REST++ reachable")

    create_schema()
    nodes, edges = _gml_nodes_edges()
    print(f"\nLoaded GML: {len(nodes)} nodes, {len(edges)} edges")

    load_vertices(nodes)
    load_edges(edges)
    verify_load()

    print("\n✓ Setup complete — TigerGraph is loaded and ready.")
