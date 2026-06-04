from pydantic import BaseModel
from typing import Optional, List, Dict, Any

class PipelineResult(BaseModel):
    pipeline: str
    answer: str
    tokens_input: int
    tokens_output: int
    tokens_total: int
    latency_ms: float
    cost_usd: float
    retrieval_context: Optional[Any] = None
    reasoning_path: Optional[Any] = None
    graph_nodes: Optional[List[Dict[str, Any]]] = None
    graph_edges: Optional[List[Dict[str, Any]]] = None

class BenchmarkRequest(BaseModel):
    query: str
    ground_truth: str
    model: str = "gpt-4o-mini"
