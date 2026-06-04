from fastapi import APIRouter
import faiss
import json
from pathlib import Path

router = APIRouter()
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

@router.get("/validate")
async def validate_faiss():
    try:
        # 1. Verify Index
        vector_index = faiss.read_index(str(DATA_DIR / "vector_index.faiss"))
        ntotal = vector_index.ntotal
        
        # 2. Verify Chunks
        with (DATA_DIR / "chunks.json").open("r", encoding="utf-8") as file:
            chunks = json.load(file)
            
        chunk_count = len(chunks)
        
        # 3. Verify specific entities exist in chunks
        entities_to_check = ["Meridian Holdings", "Vertex Capital", "Phantom Logistics", "Horizon Group"]
        entities_found = {}
        for entity in entities_to_check:
            found = False
            for chunk in chunks:
                if entity.lower() in chunk["text"].lower():
                    found = True
                    break
            entities_found[entity] = found

        return {
            "status": "success",
            "faiss_indexed_vectors": ntotal,
            "json_chunks_count": chunk_count,
            "dimensions": vector_index.d,
            "entities_present": entities_found,
            "is_healthy": ntotal == chunk_count and ntotal > 100
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }
