from __future__ import annotations

import re
import time
from dataclasses import dataclass
from typing import Any

import requests

from config import settings


@dataclass
class GeminiTextResult:
    text: str
    prompt_tokens: int
    completion_tokens: int
    model: str


GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"
FALLBACK_MODEL_CHAIN = [
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.5-flash",
]
PLACEHOLDER_KEY_MARKERS = (
    "replace_with_gemini_key",
    "your_gemini_key",
    "paste_your_key",
    "changeme",
    "dummy",
    "example",
    "<",
    ">",
)


def estimate_tokens(text: str) -> int:
    """Fast local token estimate: ~1.3 tokens per word."""
    words = re.findall(r"\S+", text)
    return max(1, int(len(words) * 1.3))


def _api_key() -> str:
    return settings.GEMINI_API_KEY or ""


def _api_key_configured(key: str) -> bool:
    if not key or not key.strip():
        return False
    normalized = key.strip().lower()
    return not any(marker in normalized for marker in PLACEHOLDER_KEY_MARKERS)


def gemini_available() -> bool:
    return _api_key_configured(_api_key())


def _is_auth_error(status_code: int, body: str) -> bool:
    if status_code not in {400, 401, 403}:
        return False
    lowered = body.lower()
    return (
        "api key not valid" in lowered
        or "invalid_argument" in lowered
        or "permission_denied" in lowered
        or "api_key_invalid" in lowered
    )


def _fallback_result(
    model: str,
    full_prompt: str,
    fallback_text: str,
) -> GeminiTextResult:
    prompt_tokens = estimate_tokens(full_prompt)
    completion_tokens = estimate_tokens(fallback_text)
    return GeminiTextResult(
        text=fallback_text,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        model=model,
    )


def _normalize_model_name(model: str) -> str:
    return model.replace("models/", "").strip()


def _candidate_models(model_name: str | None) -> list[str]:
    primary = _normalize_model_name(model_name or settings.GEMINI_MODEL)
    candidates = [primary]
    for model in FALLBACK_MODEL_CHAIN:
        normalized = _normalize_model_name(model)
        if normalized not in candidates:
            candidates.append(normalized)
    return candidates


def count_tokens(text: str, model_name: str | None = None) -> int:
    """Count tokens using Gemini REST API. Falls back to estimate on failure."""
    if not text:
        return 0
    if not gemini_available():
        return estimate_tokens(text)

    for model in _candidate_models(model_name):
        url = f"{GEMINI_API_BASE}/{model}:countTokens?key={_api_key()}"
        try:
            resp = requests.post(
                url,
                json={"contents": [{"parts": [{"text": text}]}]},
                timeout=10,
            )
            if resp.status_code == 404:
                continue
            if _is_auth_error(resp.status_code, resp.text):
                return estimate_tokens(text)
            resp.raise_for_status()
            return int(resp.json().get("totalTokens", 0))
        except Exception:
            continue
    return estimate_tokens(text)


def generate_text(
    prompt: str,
    *,
    system_instruction: str | None = None,
    model_name: str | None = None,
    temperature: float = 0.1,
    max_tokens: int = 1024,
    fallback_text: str = "Unable to generate response.",
) -> GeminiTextResult:
    """Generate text via Gemini REST API with retry. Falls back gracefully."""
    model = _normalize_model_name(model_name or settings.GEMINI_MODEL)
    full_prompt = (system_instruction or "") + "\n" + prompt

    if not gemini_available():
        return _fallback_result(model, full_prompt, fallback_text)

    # Build contents — system instruction goes as first turn if provided
    contents = []
    if system_instruction:
        contents.append({"role": "user", "parts": [{"text": system_instruction}]})
        contents.append({"role": "model", "parts": [{"text": "Understood."}]})
    contents.append({"role": "user", "parts": [{"text": prompt}]})

    payload = {
        "contents": contents,
        "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens},
    }

    for candidate_model in _candidate_models(model):
        url = f"{GEMINI_API_BASE}/{candidate_model}:generateContent?key={_api_key()}"
        for attempt in range(3):
            try:
                resp = requests.post(url, json=payload, timeout=30)
                if resp.status_code == 404:
                    break
                if _is_auth_error(resp.status_code, resp.text):
                    print("[Gemini] Invalid API key detected; using local fallback response.")
                    return _fallback_result(candidate_model, full_prompt, fallback_text)
                resp.raise_for_status()
                data = resp.json()

                # Extract text from response
                candidates = data.get("candidates", [])
                if not candidates:
                    raise ValueError("No candidates in Gemini response")

                parts = candidates[0].get("content", {}).get("parts", [])
                text = " ".join(p.get("text", "") for p in parts).strip()
                if not text:
                    text = fallback_text

                # Token usage from response metadata
                usage = data.get("usageMetadata", {})
                prompt_tokens = usage.get("promptTokenCount", estimate_tokens(full_prompt))
                completion_tokens = usage.get("candidatesTokenCount", estimate_tokens(text))

                return GeminiTextResult(
                    text=text,
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                    model=candidate_model,
                )

            except requests.exceptions.HTTPError as e:
                status_code = resp.status_code if "resp" in locals() else None
                if status_code == 429:
                    # Rate limited — wait and retry
                    wait = (attempt + 1) * 10
                    print(f"[Gemini] Rate limited, retrying in {wait}s...")
                    time.sleep(wait)
                    continue
                body = resp.text[:200] if "resp" in locals() else ""
                print(f"[Gemini] HTTP error on {candidate_model}: {e} — Response: {body}")
                break
            except Exception as e:
                print(f"[Gemini] Error on {candidate_model} attempt {attempt + 1}: {e}")
                if attempt < 2:
                    time.sleep(5)
                    continue
                break

    # Fell through all retries
    return _fallback_result(model, full_prompt, fallback_text)


def gemini_pricing_usd(prompt_tokens: int, completion_tokens: int) -> float:
    input_cost = (prompt_tokens * settings.GEMINI_INPUT_PRICE_PER_1M) / 1_000_000
    output_cost = (completion_tokens * settings.GEMINI_OUTPUT_PRICE_PER_1M) / 1_000_000
    return input_cost + output_cost


def parse_graph_context_payload(payload: Any) -> tuple[str, list[dict], list[dict], list[str]]:
    if not isinstance(payload, dict):
        return "", [], [], []
    context = str(payload.get("context", "") or "")
    nodes = payload.get("nodes") if isinstance(payload.get("nodes"), list) else []
    edges = payload.get("edges") if isinstance(payload.get("edges"), list) else []
    path = payload.get("path") if isinstance(payload.get("path"), list) else []
    return context, nodes, edges, path
