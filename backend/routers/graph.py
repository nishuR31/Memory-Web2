from fastapi import APIRouter

router = APIRouter()

@router.get("/traversal/{query_id}")
async def get_graph_traversal(query_id: str):
    # This would normally query TigerGraph for the specific traversal result
    # For now, returning a static structure representing the graph data
    return {
        "nodes": [
            {"id": "Meridian Holdings", "type": "Company", "risk_score": 85},
            {"id": "BVI Shell Alpha", "type": "Company", "risk_score": 60},
            {"id": "Viktor Kasarov", "type": "Person", "risk_score": 95}
        ],
        "edges": [
            {"source": "Meridian Holdings", "target": "BVI Shell Alpha", "type": "CONTROLS"},
            {"source": "BVI Shell Alpha", "target": "Viktor Kasarov", "type": "CONTROLS"}
        ]
    }
