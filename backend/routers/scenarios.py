from fastapi import APIRouter
import json
from pathlib import Path
from fastapi import HTTPException

router = APIRouter()
SCENARIOS_PATH = Path(__file__).resolve().parent.parent / "scenarios.json"

@router.get("")
def get_scenarios():
    with SCENARIOS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)

@router.get("/{scenario_id}")
def get_scenario(scenario_id: str):
    with SCENARIOS_PATH.open("r", encoding="utf-8") as file:
        scenarios = json.load(file)
    for scenario in scenarios:
        if scenario["id"] == scenario_id:
            return scenario
    raise HTTPException(status_code=404, detail="Scenario not found")
