"""Lightweight similarity scoring used as a BERTScore proxy."""

import re
from collections import Counter


def _tokens(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9]+", text.lower())


def _safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator > 0 else 0.0


async def compute_bertscore(reference: str, hypothesis: str) -> dict:
    ref_tokens = _tokens(reference)
    hyp_tokens = _tokens(hypothesis)

    if not ref_tokens or not hyp_tokens:
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    ref_counter = Counter(ref_tokens)
    hyp_counter = Counter(hyp_tokens)

    overlap = sum(min(ref_counter[token], hyp_counter[token]) for token in ref_counter)

    precision = _safe_div(overlap, len(hyp_tokens))
    recall = _safe_div(overlap, len(ref_tokens))
    f1 = _safe_div(2 * precision * recall, precision + recall)

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
    }
