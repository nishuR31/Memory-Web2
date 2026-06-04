import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Prefer backend-local env file, and keep root env as compatibility fallback.
for env_path in (BACKEND_DIR / ".env", PROJECT_ROOT / ".env"):
    if env_path.exists():
        load_dotenv(env_path)


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

class Settings(BaseModel):
    TIGERGRAPH_HOST: str = os.getenv("TIGERGRAPH_HOST", "tigergraph")
    TIGERGRAPH_PORT: int = int(os.getenv("TIGERGRAPH_PORT", "443"))
    TIGERGRAPH_GRAPH: str = os.getenv("TIGERGRAPH_GRAPH", "FinancialCrimeGraph")
    TIGERGRAPH_USERNAME: str = os.getenv("TIGERGRAPH_USERNAME", "tigergraph")
    TIGERGRAPH_PASSWORD: str = os.getenv("TIGERGRAPH_PASSWORD", "tigergraph")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_INPUT_PRICE_PER_1M: float = float(os.getenv("GEMINI_INPUT_PRICE_PER_1M", "0.075"))
    GEMINI_OUTPUT_PRICE_PER_1M: float = float(os.getenv("GEMINI_OUTPUT_PRICE_PER_1M", "0.30"))
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    OPENAI_INFERENCE_MODEL: str = os.getenv("OPENAI_INFERENCE_MODEL", "llama-3.1-8b-instant")
    VECTOR_STORE_TYPE: str = os.getenv("VECTOR_STORE_TYPE", "chromadb")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8000"))
    BERTSCORE_MODEL: str = os.getenv("BERTSCORE_MODEL", "microsoft/deberta-xlarge-mnli")
    LLM_JUDGE_MODEL: str = os.getenv("LLM_JUDGE_MODEL", "llama-3.3-70b-versatile")
    CORS_ORIGINS: str = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:4173,http://127.0.0.1:4173",
    )
    LLM_ONLY_MODEL: str = os.getenv("LLM_ONLY_MODEL", "llama-3.3-70b-versatile")
    VECTOR_RAG_MODEL: str = os.getenv("VECTOR_RAG_MODEL", "llama-3.1-8b-instant")
    GRAPHRAG_MODEL: str = os.getenv("GRAPHRAG_MODEL", "llama-3.1-8b-instant")
    GRAPHRAG_USE_LLM: bool = _env_bool("GRAPHRAG_USE_LLM", False)
    HACKATHON_DEMO_MODE: bool = _env_bool("HACKATHON_DEMO_MODE", True)
    GRAPHRAG_URL: str = os.getenv("GRAPHRAG_URL", "http://localhost:8000")
    CHROMA_PERSIST_DIR: str = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db")
    DATASET_TOKEN_COUNT: int = int(os.getenv("DATASET_TOKEN_COUNT", "0"))
    DATASET_COUNT_MODEL: str = os.getenv("DATASET_COUNT_MODEL", "gemini-1.5-flash")

settings = Settings()

def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pricing = {
        "gpt-4o-mini": {"input": 0.150 / 1000000, "output": 0.600 / 1000000},
        "gpt-4o": {"input": 5.00 / 1000000, "output": 15.00 / 1000000},
        "llama-3.3-70b-versatile": {"input": 0.590 / 1000000, "output": 0.790 / 1000000},
        "llama-3.1-8b-instant": {"input": 0.050 / 1000000, "output": 0.080 / 1000000},
        "gemini-1.5-flash": {"input": 0.075 / 1000000, "output": 0.300 / 1000000},
    }
    rates = pricing.get(model, pricing["gpt-4o-mini"])
    return (prompt_tokens * rates["input"]) + (completion_tokens * rates["output"])
