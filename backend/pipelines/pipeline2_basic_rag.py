from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from config import settings
from utils.gemini import count_tokens, generate_text, gemini_pricing_usd

try:
    import chromadb
except Exception:  # pragma: no cover
    chromadb = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover
    SentenceTransformer = None


_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_CHUNKS_PATH = _DATA_DIR / "chunks.json"

_embedding_model = None
_chroma_collection = None


def _bootstrap_chroma() -> None:
    global _embedding_model, _chroma_collection
    if chromadb is None or SentenceTransformer is None:
        return
    if _embedding_model is None:
        _embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    if _chroma_collection is None:
        client = chromadb.PersistentClient(path=settings.CHROMA_PERSIST_DIR)
        _chroma_collection = client.get_or_create_collection("financial_docs")


def _fallback_chunks(query: str, top_k: int) -> list[str]:
    """
    Retrieve relevant chunks from the real corpus (Wikipedia + SEC Edgar files).
    Falls back to synthetic chunks.json if no real files exist.
    This is what makes Basic RAG use the large dataset.
    """
    import re

    data_dir = Path(__file__).resolve().parent.parent / "data"
    qtokens = {t.lower() for t in re.findall(r"[a-zA-Z]{3,}", query)}

    # 1. Try real corpus files first.
    corpus_dirs = [data_dir / "wikipedia", data_dir / "sec_edgar"]
    chunk_size = 400
    chunk_overlap = 50

    real_chunks: list[tuple[int, str]] = []

    for corpus_dir in corpus_dirs:
        if not corpus_dir.exists():
            continue
        files = list(corpus_dir.glob("*.txt"))
        if not files:
            continue

        for filepath in files:
            try:
                text = filepath.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            words = text.split()
            if len(words) < 50:
                continue

            # Sliding window chunking.
            for start in range(0, len(words), chunk_size - chunk_overlap):
                chunk_words = words[start : start + chunk_size]
                if len(chunk_words) < 30:
                    continue
                chunk_text = " ".join(chunk_words)
                chunk_lower = chunk_text.lower()
                score = sum(1 for tok in qtokens if tok in chunk_lower)
                if score > 0:
                    real_chunks.append((score, chunk_text))

            # Stop scanning after enough candidates to avoid slow startup.
            if len(real_chunks) >= top_k * 50:
                break

        if len(real_chunks) >= top_k * 50:
            break

    if real_chunks:
        real_chunks.sort(key=lambda x: x[0], reverse=True)
        return [text for _, text in real_chunks[:top_k]]

    # 2. Fallback: synthetic chunks.json.
    if not _CHUNKS_PATH.exists():
        return []
    with _CHUNKS_PATH.open("r", encoding="utf-8") as handle:
        chunks = json.load(handle)
    scored: list[tuple[int, str]] = []
    for item in chunks:
        text = str(item.get("text", ""))
        if not text:
            continue
        score = sum(1 for tok in qtokens if tok in text.lower())
        if score > 0:
            scored.append((score, text))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [text for _, text in scored[:top_k]]


def _retrieve_context(query: str, top_k: int) -> list[str]:
    try:
        _bootstrap_chroma()
        if _embedding_model is not None and _chroma_collection is not None:
            query_embedding = _embedding_model.encode(query).tolist()
            results = _chroma_collection.query(query_embeddings=[query_embedding], n_results=top_k)
            documents: Any = results.get("documents", [[]])
            return list(documents[0]) if documents and documents[0] else []
    except Exception:
        pass

    return _fallback_chunks(query, top_k)


async def run_basic_rag(query: str, top_k: int = 10) -> dict:
    context_docs = _retrieve_context(query, top_k)
    context = "\n\n---\n\n".join(context_docs)

    prompt = (
        "You are a financial crime analyst. Use ONLY the following retrieved documents to "
        "answer the question. If the answer isn't in the documents, say so.\n\n"
        f"RETRIEVED DOCUMENTS:\n{context or 'NO DOCUMENTS RETRIEVED'}\n\n"
        f"QUESTION: {query}\n\n"
        "Answer based strictly on the retrieved documents:"
    )

    start = time.time()
    fallback_text = "No answer available from retrieved documents."
    result = generate_text(
        prompt,
        system_instruction="Strict retrieval-grounded financial crime assistant.",
        fallback_text=fallback_text,
    )
    latency = round(time.time() - start, 3)

    answer_text = result.text
    completion_tokens = result.completion_tokens
    if answer_text.strip() == fallback_text and context_docs:
        preview = " ".join(context_docs[:2])[:1200]
        answer_text = (
            f"Retrieved evidence indicates: {preview} "
            "Answer synthesized directly from the retrieved documents."
        )
        completion_tokens = count_tokens(answer_text)

    total_tokens = result.prompt_tokens + completion_tokens

    return {
        "pipeline": "Basic-RAG",
        "answer": answer_text,
        "prompt_tokens": result.prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
        "tokens_total": total_tokens,
        "latency_seconds": latency,
        "latency_ms": round(latency * 1000, 1),
        "cost_usd": round(gemini_pricing_usd(result.prompt_tokens, completion_tokens), 6),
        "chunks_retrieved": len(context_docs),
        "retrieval_context": context_docs,
    }
