from __future__ import annotations

import argparse
import json
import uuid
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from config import settings

try:
    import chromadb
except Exception:  # pragma: no cover
    chromadb = None

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover
    SentenceTransformer = None


CHUNK_SIZE = 512
CHUNK_OVERLAP = 50


def split_words(text: str, chunk_size: int, overlap: int) -> list[str]:
    words = text.split()
    if not words:
        return []

    stride = max(1, chunk_size - overlap)
    chunks: list[str] = []
    for start in range(0, len(words), stride):
        end = min(len(words), start + chunk_size)
        part = " ".join(words[start:end]).strip()
        if part:
            chunks.append(part)
        if end >= len(words):
            break
    return chunks


def iter_text_files(root: Path):
    for path in root.rglob("*.txt"):
        if path.is_file():
            yield path


def build_chunks(input_dir: Path, chunk_size: int, overlap: int) -> list[dict]:
    chunks: list[dict] = []
    for path in iter_text_files(input_dir):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for idx, chunk in enumerate(split_words(text, chunk_size, overlap)):
            chunks.append(
                {
                    "id": str(uuid.uuid4()),
                    "source": str(path),
                    "chunk_index": idx,
                    "text": chunk,
                }
            )
    return chunks


def write_chunks_json(chunks: list[dict], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(chunks, indent=2), encoding="utf-8")


def write_chroma(chunks: list[dict], persist_dir: Path) -> None:
    if chromadb is None or SentenceTransformer is None:
        print("ChromaDB/sentence-transformers unavailable; skipping vector index build.")
        return

    model = SentenceTransformer("all-MiniLM-L6-v2")
    client = chromadb.PersistentClient(path=str(persist_dir))
    collection = client.get_or_create_collection("financial_docs")

    batch_size = 64
    for start in range(0, len(chunks), batch_size):
        batch = chunks[start : start + batch_size]
        documents = [item["text"] for item in batch]
        embeddings = model.encode(documents).tolist()
        ids = [item["id"] for item in batch]
        metadatas = [{"source": item["source"], "chunk_index": item["chunk_index"]} for item in batch]

        collection.upsert(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chunk corpus and build Chroma embeddings")
    parser.add_argument("--input", required=True, help="Input data directory")
    parser.add_argument("--output", default="./chroma_db", help="Chroma persist directory")
    parser.add_argument("--chunk-size", type=int, default=CHUNK_SIZE)
    parser.add_argument("--overlap", type=int, default=CHUNK_OVERLAP)
    args = parser.parse_args()

    input_dir = Path(args.input).resolve()
    chunks = build_chunks(input_dir, args.chunk_size, args.overlap)

    chunks_json = Path(__file__).resolve().parent / "chunks.json"
    write_chunks_json(chunks, chunks_json)
    print(f"Wrote {len(chunks)} chunks to {chunks_json}")

    persist_dir = Path(args.output).resolve()
    if str(persist_dir) == "./chroma_db":
        persist_dir = Path(settings.CHROMA_PERSIST_DIR).resolve()

    write_chroma(chunks, persist_dir)
    print(f"Vector index ready at {persist_dir}")


if __name__ == "__main__":
    main()
