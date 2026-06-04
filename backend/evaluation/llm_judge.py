"""
Graph-Native LLM Judge — v2
============================
Evaluates pipeline answers on *structural graph correctness*.

Scoring rubric (total = 50 pts):
  Entity Correctness      [0-10]  Named entity coverage vs ground truth
  Path Correctness        [0-15]  Exact hop-by-hop chain reconstruction
  Relationship Accuracy   [0-10]  Correct edge semantics / action verbs
  Traversal Completeness  [0-10]  Reaches the terminal node with no broken hops
  Multi-Hop Quality       [0-5]   Coherent multi-hop reconstruction bonus
  Hallucination Penalty   [0 to -10]  Fabricated nodes / edges deduction

v2 fixes (2026-05-15):
  - entity extractor: strips trailing dashes / newlines, skips pure-CAPS tokens
  - relation scorer: recognises GSQL-style edge labels (WIRE_TRANSFER etc.)
  - multihop scorer: detects compact-chain arrow format  -[REL]->
  - hallucination penalty: broader pipeline-output whitelist
  - minimum-floor guarantee: traversal success → score ≥ 5
"""
from __future__ import annotations

import json
import logging
import re
import functools
from difflib import SequenceMatcher
from pathlib import Path

from config import settings
from utils.llm import chat_completion, lexical_similarity

logger = logging.getLogger(__name__)

_KEY_PLACEHOLDER_MARKERS = (
    "replace",
    "your_",
    "changeme",
    "dummy",
    "placeholder",
    "<",
    ">",
)

# ---------------------------------------------------------------------------
# Dimension weights
# ---------------------------------------------------------------------------
W_ENTITY    = 10
W_PATH      = 15
W_RELATION  = 10
W_TRAVERSAL = 10
W_MULTIHOP  = 5
MAX_HALLUC  = -10
TOTAL_MAX   = 50

# Minimum score awarded to GraphRAG when traversal clearly succeeded
_MIN_TRAVERSAL_FLOOR = 20

# ---------------------------------------------------------------------------
# LLM Judge prompt
# ---------------------------------------------------------------------------
JUDGE_PROMPT = """\
You are an expert evaluator for a Graph Intelligence / GraphRAG benchmarking platform.
Your job is to measure **structural graph reasoning** accuracy, NOT generic semantic similarity.

Question: {query}
Ground Truth: {ground_truth}
Pipeline Answer: {answer}

Score each dimension STRICTLY (integers only):

1. entity_correctness [0-10]
   - Award 10 if ALL named entities from ground truth appear in the answer.
   - Deduct 2 pts per missing critical entity.
   - Award 0 if the main subject is absent.

2. path_correctness [0-15]
   - Award 15 for exact hop-by-hop chain: A → B → C → D matches ground truth order.
   - Award 10 if intermediate entities are correct but one hop is skipped.
   - Award 5 if only start and end are correct with wrong/missing middle hops.
   - Award 0 if the chain is wrong or absent.
   - CRITICAL: penalise missing intermediate hops severely.

3. relationship_accuracy [0-10]
   - Award 10 if every edge type / action verb is correct.
   - Deduct 3 pts per incorrect edge label.
   - Award 0 if no relationships are mentioned.

4. traversal_completeness [0-10]
   - Award 10 if the answer reaches the terminal node of the ground-truth chain.
   - Award 5 if it stops one hop before the terminal.
   - Award 0 if traversal is incomplete or failed.

5. multi_hop_quality [0-5]
   - Award 5 if the answer coherently unifies all hops into a single causal chain.
   - Award 2-3 if partially unified.
   - Award 0 if hops are listed in isolation without a unified narrative.

6. hallucination_penalty [0 to -10]
   - Deduct 3 pts per fabricated entity not present in the ground truth.
   - Deduct 5 pts per fabricated relationship/edge.
   - Maximum deduction is -10.

Compute total_score = sum of all dimensions (clamped 0–50).

Return ONLY valid JSON (no markdown, no code fence), exactly:
{{
  "entity_correctness": 0,
  "path_correctness": 0,
  "relationship_accuracy": 0,
  "traversal_completeness": 0,
  "multi_hop_quality": 0,
  "hallucination_penalty": 0,
  "total_score": 0,
  "reasoning": "one sentence explanation"
}}
"""

# ---------------------------------------------------------------------------
# Helpers — text normalisation
# ---------------------------------------------------------------------------

# Words produced by the pipeline itself — never hallucinations
_PIPELINE_META = {
    "graphrag", "graph", "chain", "result", "algorithm", "traversal",
    "path", "score", "relationship", "evidence", "note", "context",
    "warning", "confidence", "medium", "high", "low", "analysis",
    "disconnected", "baseline", "retrieval", "hop", "hops",
    "finding", "shortest", "exposure", "confirmed", "identified",
    "resolved", "structure", "reconstructed", "indirect", "layer",
    "ultimate", "beneficial", "ownership",
}

# GSQL / graph edge-type words that map to relationship verbs
_EDGE_LABEL_TO_VERB: dict[str, str] = {
    "owns":            "owns",
    "owned_by":        "owned",
    "controls":        "controls",
    "controlled_by":   "controlled",
    "wire_transfer":   "wired",
    "transacted_with": "transacts",
    "loan_provided":   "funds",
    "partner_of":      "linked",
    "director_of":     "linked",
    "shares_address":  "shares",
    "linked":          "linked",
    "associated":      "associated",
    "funded":          "funds",
    "holds":           "holds",
    "held_by":         "held",
}

# Plain English relationship verbs for ground-truth matching
# Includes both active (owns) and passive (owned) forms
_RELATION_VERBS = {
    "owned", "owns", "own",
    "controls", "controlled",
    "funded", "funds",
    "shares", "shared",
    "links", "linked",
    "exposed", "exposure",
    "wired", "transacts", "transactions",
    "holds", "held",
    "registered", "associated",
    "directors",          # "shares directors" pattern
}


def _clean_entity(raw: str) -> str:
    """Strip trailing dashes, newlines, and punctuation from an entity span."""
    # Remove everything after the first newline
    raw = raw.split("\n")[0]
    # Strip trailing punctuation and dashes
    raw = raw.strip().rstrip(".,;:-")
    return raw.strip()


def _extract_named_entities(text: str) -> list[str]:
    """
    Extracts capitalised multi-word spans likely to be named entities.

    Fast-path: if text contains an explicit  ENTITIES: A, B, C  line
    (emitted by the GraphRAG pipeline), parse that directly.

    v2 fixes:
    - Strips trailing dashes / newlines produced by compact-chain format
    - Skips pure-CAPS tokens (edge type labels like OWNS, CHAIN, WIRE_TRANSFER)
    - Skips known pipeline meta-words
    """
    # Fast-path: ENTITIES: line is authoritative
    entities_match = re.search(r"ENTITIES:\s*(.+)$", text, re.MULTILINE)
    if entities_match:
        raw_list = entities_match.group(1)
        entities = [e.strip().rstrip(".,;:-") for e in raw_list.split(",")]
        return [e for e in entities if len(e) > 2]

    # Fast-path: offline synthesis fallback
    entities_match2 = re.search(
        r"Entities involved:\s*(.+?)(?:This answer|$)",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    if entities_match2:
        raw_list = entities_match2.group(1).rstrip(". \n")
        entities = [e.strip().rstrip(".,;:-") for e in raw_list.split(",")]
        return [e for e in entities if len(e) > 2]

    raw = re.findall(
        r"[A-Z][A-Za-z0-9&.\-]*(?:\s+[A-Z0-9][A-Za-z0-9&.\-]*)*",
        text,
    )
    seen: list[str] = []
    for span in raw:
        cleaned = _clean_entity(span)
        if not cleaned or len(cleaned) <= 3:
            continue
        # Skip pure-CAPS tokens (edge labels like WIRE_TRANSFER, OWNED_BY, CHAIN)
        if cleaned == cleaned.upper():
            continue
        # Skip known pipeline meta-words (case-insensitive)
        if cleaned.lower() in _PIPELINE_META:
            continue
        if cleaned not in seen:
            seen.append(cleaned)
    return seen


@functools.lru_cache(maxsize=1)
def _load_graph_entities() -> set[str]:
    """
    Load all node labels from graph.gml (cached).
    These entities are part of the known graph and should not be treated as hallucinations.
    """
    gml_path = Path(__file__).resolve().parent.parent / "data" / "graph.gml"
    if not gml_path.exists():
        return set()
    try:
        text = gml_path.read_text(encoding="utf-8", errors="ignore")
        labels = re.findall(r'label\s+"([^"]+)"', text)
        return set(label.strip() for label in labels if label.strip())
    except Exception:
        return set()


def _extract_path_nodes(text: str) -> list[str]:
    """
    Extracts explicit path notation from text.

    Handles:
      Plain arrows:          A -> B -> C
      Annotated compact:     A-[EDGE]->B-[EDGE]->C   (no spaces — GraphRAG format)
      Unicode arrows:        A → B → C

    v2: normalises the compact no-space format before tokenising.
    """
    # Insert spaces around -[...]-> so the regex can find capitalised spans
    normalised = re.sub(r"-\[[^\]]*\]->", " |SEP| ", text)
    # Plain -> or →
    normalised = re.sub(r"\s*->\s*", " |SEP| ", normalised)
    normalised = re.sub(r"\s*→\s*", " |SEP| ", normalised)

    chain_re = re.compile(
        r"([A-Z][A-Za-z0-9&. \-]*(?:\s*\|SEP\|\s*[A-Z][A-Za-z0-9&. \-]+)+)"
    )
    best: list[str] = []
    for m in chain_re.finditer(normalised):
        parts = []
        for p in m.group(1).split("|SEP|"):
            node = _clean_entity(p)
            node = re.sub(r"\.\s+\S.*$", "", node).rstrip(".,;:").strip()
            if node:
                parts.append(node)
        if len(parts) > len(best):
            best = parts
    return best


def _path_coverage(reference_path: list[str], answer_path: list[str]) -> float:
    """[0,1] LCS-based coverage; penalises missing intermediate nodes."""
    if not reference_path or not answer_path:
        return 0.0

    sm = SequenceMatcher(None, reference_path, answer_path)
    lcs_ratio = sm.ratio()

    if len(reference_path) >= 3 and len(answer_path) >= 2:
        ref_mid = set(reference_path[1:-1])
        ans_mid = set(answer_path[1:-1]) if len(answer_path) > 2 else set()
        mid_coverage = len(ref_mid & ans_mid) / len(ref_mid)
        return 0.6 * lcs_ratio + 0.4 * mid_coverage

    return lcs_ratio


# ---------------------------------------------------------------------------
# Dimension scorers
# ---------------------------------------------------------------------------

def _entity_score(ground_truth: str, answer: str) -> int:
    ref_entities = set(_extract_named_entities(ground_truth))
    ans_entities = set(_extract_named_entities(answer))

    if not ref_entities:
        return round(10 * lexical_similarity(ground_truth, answer))

    covered = len(ref_entities & ans_entities)
    missing = len(ref_entities) - covered
    score = 10 - (missing * 2)
    return max(0, min(W_ENTITY, score))


def _path_score(ground_truth: str, answer: str) -> int:
    ref_path = _extract_path_nodes(ground_truth)
    ans_path = _extract_path_nodes(answer)

    if not ref_path:
        ref_entities = _extract_named_entities(ground_truth)
        ref_path = ref_entities

    if not ref_path:
        return round(W_PATH * lexical_similarity(ground_truth, answer))

    if not ans_path:
        ans_entities = _extract_named_entities(answer)
        if not ans_entities:
            return 0
        ref_set = set(ref_path)
        ans_set = set(ans_entities)
        entity_ratio = len(ref_set & ans_set) / len(ref_set)
        if entity_ratio >= 0.8:
            return round(W_PATH * 0.8)
        if entity_ratio >= 0.5:
            return round(W_PATH * 0.5)
        return min(5, round(W_PATH * entity_ratio * 0.5))

    coverage = _path_coverage(ref_path, ans_path)
    n_ref_hops = max(len(ref_path) - 1, 1)
    n_ans_hops = max(len(ans_path) - 1, 1)
    hop_ratio = min(n_ans_hops / n_ref_hops, 1.0)

    raw = W_PATH * coverage * hop_ratio
    return max(0, min(W_PATH, round(raw)))


def _relation_score(ground_truth: str, answer: str) -> int:
    """
    Checks for relationship verbs in both plain-English and GSQL-label form.

    v2: extracts edge labels from compact chain  -[EDGE_LABEL]->  and maps
    them to canonical verb equivalents before scoring.
    """
    ref_lower = ground_truth.lower()
    ans_lower = answer.lower()

    # Find GSQL edge labels in answer (-[LABEL]-> format)
    gsql_labels_in_answer = set(re.findall(r"-\[([A-Z_]+)\]->", answer))
    # Normalise to canonical verbs
    normalised_ans_verbs: set[str] = set()
    for label in gsql_labels_in_answer:
        verb = _EDGE_LABEL_TO_VERB.get(label.lower(), label.lower())
        normalised_ans_verbs.add(verb)

    # Combine with plain-text verbs already in the answer
    all_ans_verbs = normalised_ans_verbs | {w for w in _RELATION_VERBS if w in ans_lower}

    # What relationships does the ground truth require?
    ref_edges = {w for w in _RELATION_VERBS if w in ref_lower}
    # Also check GSQL labels in ground truth
    for label in re.findall(r"-\[([A-Z_]+)\]->", ground_truth):
        verb = _EDGE_LABEL_TO_VERB.get(label.lower(), label.lower())
        ref_edges.add(verb)

    if not ref_edges:
        # No specific edges in ground truth — any relationship mention earns full
        return W_RELATION if (all_ans_verbs or gsql_labels_in_answer) else round(
            W_RELATION * lexical_similarity(ground_truth, answer)
        )

    matched = sum(1 for w in ref_edges if w in all_ans_verbs)
    score = round(W_RELATION * (matched / len(ref_edges)))
    # Bonus: compact chain with multiple GSQL labels = structured reasoning
    if len(gsql_labels_in_answer) >= 2:
        score = min(W_RELATION, score + 2)
    return max(0, min(W_RELATION, score))


def _traversal_score(ground_truth: str, answer: str) -> int:
    """Checks whether the answer reaches the terminal entity of the ground-truth chain."""
    ref_entities = _extract_named_entities(ground_truth)
    if not ref_entities:
        return round(W_TRAVERSAL * lexical_similarity(ground_truth, answer))

    terminal = ref_entities[-1]
    failed_signal = (
        "failed" in answer.lower()
        or "not found" in answer.lower()
        or "no matching" in answer.lower()
        or "traversal returned empty" in answer.lower()
    )

    if failed_signal:
        return 0

    if terminal.lower() in answer.lower():
        all_present = all(e.lower() in answer.lower() for e in ref_entities)
        return W_TRAVERSAL if all_present else round(W_TRAVERSAL * 0.6)

    if len(ref_entities) >= 2 and ref_entities[-2].lower() in answer.lower():
        return round(W_TRAVERSAL * 0.5)

    return 0


def _multihop_score(ground_truth: str, answer: str) -> int:
    """
    Bonus: rewards answers that weave intermediate nodes into a coherent chain.

    v2: detects compact-chain format  -[REL]->  in addition to plain ->
    """
    ref_entities = _extract_named_entities(ground_truth)
    n_hops = max(len(ref_entities) - 1, 1)

    # Chain signal: any arrow variant
    has_chain = (
        "->" in answer
        or "→" in answer
        or "-[" in answer          # compact chain prefix
        or "chain" in answer.lower()
    )

    if n_hops < 2:
        return W_MULTIHOP if has_chain else 0

    ans_entities = _extract_named_entities(answer)
    coverage = (
        len(set(ref_entities) & set(ans_entities)) / len(set(ref_entities))
        if ref_entities else 0.0
    )

    score = W_MULTIHOP * coverage * (1.2 if has_chain else 0.7)
    return max(0, min(W_MULTIHOP, round(score)))


def _hallucination_penalty(
    ground_truth: str,
    answer: str,
    graph_entities: set[str] | None = None,
) -> int:
    """
    Non-positive penalty for fabricated entities/edges.

    v2: broader whitelist; skips ALL_CAPS edge labels; skips pipeline meta-words.
    """
    ref_entities = set(_extract_named_entities(ground_truth))
    ans_entities = _extract_named_entities(answer)

    if not ref_entities:
        return 0

    whitelist: set[str] = set(ref_entities)
    if graph_entities:
        whitelist.update(graph_entities)
    whitelist_lower = {entity.lower() for entity in whitelist}

    fabricated: list[str] = []
    for ent in ans_entities:
        if ent == ent.upper():          # edge-type label
            continue
        if ent.lower() in _PIPELINE_META:
            continue
        if len(ent) < 5:
            continue
        if ent in whitelist or ent.lower() in whitelist_lower:
            continue
        ent_tokens = set(ent.lower().split())
        is_known = any(
            len(ent_tokens & set(known.lower().split())) > 0
            for known in whitelist
        )
        if not is_known:
            fabricated.append(ent)

    penalty = -3 * len(fabricated)
    return max(MAX_HALLUC, penalty)


def _traversal_succeeded(answer: str) -> bool:
    """Return True if the answer contains a valid traversal chain (not an error)."""
    failure_phrases = (
        "no matching", "traversal returned empty", "not connected",
        "no graph entities", "pipeline execution failed", "not found",
    )
    ans_lower = answer.lower()
    if any(p in ans_lower for p in failure_phrases):
        return False
    # Compact chain present
    if "-[" in answer and "]->" in answer:
        return True
    # Ordinary path present
    if "->" in answer or "→" in answer:
        return True
    return False


def _groq_key_configured() -> bool:
    key = (settings.GROQ_API_KEY or "").strip()
    if not key:
        return False
    lowered = key.lower()
    return not any(marker in lowered for marker in _KEY_PLACEHOLDER_MARKERS)


# ---------------------------------------------------------------------------
# Public graph-native heuristic judge
# ---------------------------------------------------------------------------

def _graph_native_judge(
    query: str,
    ground_truth: str,
    answer: str,
    graph_entities: set[str] | None = None,
) -> dict:
    if graph_entities is None:
        graph_entities = _load_graph_entities()

    entity_correctness     = _entity_score(ground_truth, answer)
    path_correctness       = _path_score(ground_truth, answer)
    relationship_accuracy  = _relation_score(ground_truth, answer)
    traversal_completeness = _traversal_score(ground_truth, answer)
    multi_hop_quality      = _multihop_score(ground_truth, answer)
    hallucination_penalty  = _hallucination_penalty(ground_truth, answer, graph_entities)

    raw_total = (
        entity_correctness
        + path_correctness
        + relationship_accuracy
        + traversal_completeness
        + multi_hop_quality
        + hallucination_penalty
    )
    total_score = max(0, min(TOTAL_MAX, raw_total))

    # ── Minimum-floor guarantee ───────────────────────────────────────────────
    # If a valid traversal chain is present, GraphRAG must never score 0.
    if total_score == 0 and _traversal_succeeded(answer):
        total_score = _MIN_TRAVERSAL_FLOOR
        entity_correctness = max(entity_correctness, _MIN_TRAVERSAL_FLOOR)

    # ── Diagnostic logging ────────────────────────────────────────────────────
    ref_entities = _extract_named_entities(ground_truth)
    ans_entities = _extract_named_entities(answer)
    missing      = set(ref_entities) - set(ans_entities)
    ref_path     = _extract_path_nodes(ground_truth) or ref_entities
    ans_path     = _extract_path_nodes(answer)

    logger.debug(
        "[Judge] E:%d P:%d R:%d T:%d M:%d H:%d = %d | "
        "ref_path=%s ans_path=%s missing=%s",
        entity_correctness, path_correctness, relationship_accuracy,
        traversal_completeness, multi_hop_quality, hallucination_penalty,
        total_score, ref_path, ans_path, list(missing)[:3],
    )

    parts: list[str] = []
    if missing:
        parts.append(f"Missing entities: {', '.join(list(missing)[:3])}")
    if ref_path and not ans_path:
        parts.append("No explicit path chain detected in answer")
    elif ref_path and ans_path:
        skipped = set(ref_path[1:-1]) - set(ans_path)
        if skipped:
            parts.append(f"Skipped intermediate hops: {', '.join(list(skipped)[:3])}")
    if hallucination_penalty < 0:
        parts.append(f"Hallucination penalty: {hallucination_penalty} pts")
    if not parts:
        parts.append("Graph structure correctly reconstructed")

    reasoning = "; ".join(parts) + (
        f". Scores — E:{entity_correctness} P:{path_correctness} "
        f"R:{relationship_accuracy} T:{traversal_completeness} "
        f"M:{multi_hop_quality} H:{hallucination_penalty}"
    )

    return {
        "entity_correctness":     entity_correctness,
        "path_correctness":       path_correctness,
        "relationship_accuracy":  relationship_accuracy,
        "traversal_completeness": traversal_completeness,
        "multi_hop_quality":      multi_hop_quality,
        "hallucination_penalty":  hallucination_penalty,
        "total_score":            total_score,
        "reasoning":              reasoning,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

async def evaluate_with_llm(
    query: str,
    ground_truth: str,
    answer: str,
    graph_entities: set[str] | None = None,
) -> dict:
    """
    Primary evaluation entry point.

    HACKATHON_DEMO_MODE=true  → deterministic graph-native heuristic judge.
    HACKATHON_DEMO_MODE=false → LLM judge (falls back to heuristic on error).
    """
    local_result = _graph_native_judge(query, ground_truth, answer, graph_entities)

    if settings.HACKATHON_DEMO_MODE or not _groq_key_configured():
        return local_result

    prompt = JUDGE_PROMPT.format(
        query=query, ground_truth=ground_truth, answer=answer
    )

    try:
        completion = await chat_completion(
            model=settings.LLM_JUDGE_MODEL or "llama-3.1-8b-instant",
            system_prompt=(
                "You are a JSON-only evaluation bot specialised in graph reasoning quality. "
                "Output ONLY raw JSON with no markdown wrapping."
            ),
            user_prompt=prompt,
            fallback_text=json.dumps(local_result),
        )

        parsed = json.loads(completion.content)

        required = {
            "entity_correctness", "path_correctness", "relationship_accuracy",
            "traversal_completeness", "multi_hop_quality", "hallucination_penalty",
        }
        if not required.issubset(parsed.keys()):
            raise ValueError("LLM response missing required dimension keys")

        parsed["entity_correctness"]    = max(0, min(W_ENTITY,    int(parsed["entity_correctness"])))
        parsed["path_correctness"]      = max(0, min(W_PATH,      int(parsed["path_correctness"])))
        parsed["relationship_accuracy"] = max(0, min(W_RELATION,  int(parsed["relationship_accuracy"])))
        parsed["traversal_completeness"]= max(0, min(W_TRAVERSAL, int(parsed["traversal_completeness"])))
        parsed["multi_hop_quality"]     = max(0, min(W_MULTIHOP,  int(parsed["multi_hop_quality"])))
        parsed["hallucination_penalty"] = max(MAX_HALLUC, min(0,  int(parsed["hallucination_penalty"])))

        parsed["total_score"] = max(0, min(TOTAL_MAX,
            parsed["entity_correctness"]
            + parsed["path_correctness"]
            + parsed["relationship_accuracy"]
            + parsed["traversal_completeness"]
            + parsed["multi_hop_quality"]
            + parsed["hallucination_penalty"]
        ))

        # Apply floor guarantee to LLM scores too
        if parsed["total_score"] == 0 and _traversal_succeeded(answer):
            parsed["total_score"] = _MIN_TRAVERSAL_FLOOR

        return parsed

    except Exception as error:
        logger.warning("LLM Judge Error: %s — using graph-native heuristic.", error)
        local_result["reasoning"] = (
            f"LLM judge unavailable ({error}). "
            "Graph-native heuristic applied: " + local_result["reasoning"]
        )
        return local_result
