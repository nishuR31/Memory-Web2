from __future__ import annotations

import re
from typing import Any

try:
    from transformers import pipeline
except Exception:  # pragma: no cover
    pipeline = None


_judge = None


def _bootstrap() -> Any:
    global _judge
    if _judge is not None:
        return _judge
    if pipeline is None:
        return None
    try:
        _judge = pipeline("zero-shot-classification", model="cross-encoder/nli-deberta-v3-base")
        return _judge
    except Exception:
        return None


def _fallback_verdict(ground_truth: str, answer: str) -> dict:
    no_context_phrases = [
        "no graph context found",
        "no graph traversal path",
        "no data available",
        "unable to perform an analysis",
        "no information available",
    ]
    answer_lower = answer.lower()
    if any(phrase in answer_lower for phrase in no_context_phrases):
        return {"passed": False, "score": 0.0, "verdict": "FAIL", "model": "enhanced_fallback"}

    gt_words = {w.lower() for w in ground_truth.split() if len(w) > 3}
    ans_words = {w.lower() for w in answer.split() if len(w) > 3}
    gt_entities = set(re.findall(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*", ground_truth))
    ans_entities = set(re.findall(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*", answer))

    word_overlap = len(gt_words & ans_words) / max(len(gt_words), 1)
    entity_overlap = len(gt_entities & ans_entities) / max(len(gt_entities), 1)

    score = (word_overlap * 0.2) + (entity_overlap * 0.8)
    passed = score >= 0.30
    return {
        "passed": passed,
        "score": round(score, 4),
        "verdict": "PASS" if passed else "FAIL",
        "model": "enhanced_fallback",
    }


def llm_judge(question: str, ground_truth: str, answer: str) -> dict:
    judge = _bootstrap()
    if judge is None:
        return _fallback_verdict(ground_truth, answer)

    prompt = f"Question: {question}\nExpected: {ground_truth}\nActual: {answer}"

    try:
        result = judge(
            prompt,
            candidate_labels=["correct", "incorrect"],
            hypothesis_template="The answer is {}.",
            multi_label=False,
        )
        labels = result.get("labels", [])
        scores = result.get("scores", [])
        top_label = labels[0] if labels else "incorrect"
        top_score = float(scores[0]) if scores else 0.0
        passed = top_label == "correct"
        return {
            "passed": passed,
            "score": round(top_score, 4),
            "verdict": "PASS" if passed else "FAIL",
            "model": "cross-encoder/nli-deberta-v3-base",
        }
    except Exception:
        return _fallback_verdict(ground_truth, answer)
