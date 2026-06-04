import asyncio
import traceback
from pipelines.llm_only import pipeline_llm_only
from pipelines.vector_rag import pipeline_vector_rag
from pipelines.graphrag import pipeline_graphrag

async def test():
    query = "What is the shortest exposure chain between Jonathan Doe and Global Launderers LLC?"
    model = "gpt-4o-mini"
    
    print("Testing LLM-Only...")
    try:
        r1 = await pipeline_llm_only(query, model)
        print("LLM-Only Success:", r1.answer)
    except Exception as e:
        print("LLM-Only FAILED:")
        traceback.print_exc()

    print("\nTesting Vector RAG...")
    try:
        r2 = await pipeline_vector_rag(query, model)
        print("Vector RAG Success:", r2.answer)
    except Exception as e:
        print("Vector RAG FAILED:")
        traceback.print_exc()
        
    print("\nTesting GraphRAG...")
    try:
        r3 = await pipeline_graphrag(query, model)
        print("GraphRAG Success:", r3.answer)
    except Exception as e:
        print("GraphRAG FAILED:")
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
