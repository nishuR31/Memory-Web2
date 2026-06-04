import faiss
import json
import numpy as np
from sentence_transformers import SentenceTransformer

# 1. Load data
print("Loading FAISS index...")
vector_index = faiss.read_index("data/vector_index.faiss")
print(f"FAISS Total Indexed Vectors: {vector_index.ntotal}")

with open("data/chunks.json", "r") as f:
    chunks = json.load(f)
print(f"Chunks JSON Count: {len(chunks)}")

embedder = SentenceTransformer("all-MiniLM-L6-v2")

def test_retrieval(query):
    print(f"\n--- QUERY: {query} ---")
    query_embedding = embedder.encode([query])
    distances, indices = vector_index.search(np.array(query_embedding, dtype=np.float32), 3)
    
    for i, idx in enumerate(indices[0]):
        if idx != -1 and idx < len(chunks):
            # FAISS FlatL2 distance. L2 distance for normalized vectors is bounded.
            # all-MiniLM-L6-v2 output is NOT L2 normalized by default unless specified!
            # If not normalized, L2 distance can be anything.
            score = float(distances[0][i])
            print(f"Match {i+1} [Dist: {score:.4f}] Chunk ID: {chunks[idx].get('id')} -> {chunks[idx]['text']}")

test_retrieval("Who controls Meridian Holdings?")
test_retrieval("What is the shortest exposure chain between Vertex Capital and any sanctioned entity?")
test_retrieval("Trace the ownership chain of Vanguard Tech.")
