from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"


class IngestRequest(BaseModel):
    source: Literal["sec_edgar", "wikipedia", "all"] = "all"
    sec_year_start: int = 2018
    sec_year_end: int = 2024
    sec_limit: int = Field(default=200, ge=1, le=10000)
    wiki_categories: str = "Financial_crime,Money_laundering,Shell_company,Tax_haven,Sanctions"
    wiki_depth: int = Field(default=1, ge=0, le=3)
    wiki_max_pages: int = Field(default=500, ge=10, le=10000)


def _run_command(cmd: list[str]) -> dict:
    proc = subprocess.run(cmd, cwd=str(BACKEND_DIR), capture_output=True, text=True)
    return {
        "command": " ".join(cmd),
        "return_code": proc.returncode,
        "stdout": proc.stdout[-4000:],
        "stderr": proc.stderr[-4000:],
    }


@router.post("")
async def run_ingestion(request: IngestRequest):
    sec_dir = DATA_DIR / "sec_edgar"
    wiki_dir = DATA_DIR / "wikipedia"

    commands: list[list[str]] = []
    if request.source in {"sec_edgar", "all"}:
        commands.append(
            [
                "python",
                "data/ingest_sec_edgar.py",
                "--output",
                str(sec_dir),
                "--years",
                str(request.sec_year_start),
                str(request.sec_year_end),
                "--limit",
                str(request.sec_limit),
            ]
        )
    if request.source in {"wikipedia", "all"}:
        commands.append(
            [
                "python",
                "data/ingest_wikipedia.py",
                "--categories",
                request.wiki_categories,
                "--output",
                str(wiki_dir),
                "--depth",
                str(request.wiki_depth),
                "--max-pages",
                str(request.wiki_max_pages),
            ]
        )

    if not commands:
        raise HTTPException(status_code=400, detail="No ingestion sources selected")

    loop = asyncio.get_running_loop()
    executions = [await loop.run_in_executor(None, _run_command, cmd) for cmd in commands]

    failed = [item for item in executions if item["return_code"] != 0]
    return {
        "status": "failed" if failed else "success",
        "executions": executions,
    }


@router.get("/status")
def ingestion_status():
    sec_dir = DATA_DIR / "sec_edgar"
    wiki_dir = DATA_DIR / "wikipedia"

    def count_text_files(path: Path) -> int:
        if not path.exists():
            return 0
        return sum(1 for _ in path.rglob("*.txt"))

    return {
        "sec_edgar_files": count_text_files(sec_dir),
        "wikipedia_files": count_text_files(wiki_dir),
        "sec_summary_exists": (sec_dir / "ingest_summary.json").exists(),
        "wiki_summary_exists": (wiki_dir / "ingest_summary.json").exists(),
    }
