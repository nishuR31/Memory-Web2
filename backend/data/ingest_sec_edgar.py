from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from typing import Any

import requests

SEC_SEARCH_URL = "https://efts.sec.gov/LATEST/search-index"
SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives"
DEFAULT_FORMS = ["10-K", "10-Q", "8-K"]


def clean_text(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def search_filings(
    query: str,
    start_date: str,
    end_date: str,
    forms: list[str],
    page_size: int,
    user_agent: str,
) -> list[dict[str, Any]]:
    headers = {"User-Agent": user_agent, "Accept": "application/json"}
    payload = {
        "q": query,
        "dateRange": "custom",
        "startdt": start_date,
        "enddt": end_date,
        "forms": forms,
        "category": "custom",
        "from": 0,
        "size": page_size,
        "sort": [{"filedAt": {"order": "desc"}}],
    }

    response = requests.post(SEC_SEARCH_URL, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    result = response.json()
    return list(result.get("hits", {}).get("hits", []))


def _build_master_index_urls(years: tuple[int, int]) -> list[tuple[int, int, str]]:
    urls: list[tuple[int, int, str]] = []
    for year in range(years[0], years[1] + 1):
        for qtr in range(1, 5):
            urls.append((year, qtr, f"{SEC_ARCHIVES_BASE}/edgar/full-index/{year}/QTR{qtr}/master.idx"))
    return urls


def _fallback_master_index_hits(
    years: tuple[int, int],
    forms: list[str],
    limit: int,
    user_agent: str,
) -> list[dict[str, Any]]:
    print("[SEC] Falling back to master.idx crawl due search-index access limits.")
    form_set = {f.upper() for f in forms}
    headers = {"User-Agent": user_agent, "Accept": "text/plain"}
    hits: list[dict[str, Any]] = []

    for year, qtr, url in _build_master_index_urls(years):
        try:
            resp = requests.get(url, headers=headers, timeout=45)
            if resp.status_code != 200:
                continue
            content = resp.text
        except Exception:
            continue

        started = False
        for line in content.splitlines():
            if not started:
                if line.startswith("CIK|Company Name|Form Type|Date Filed|Filename"):
                    started = True
                continue

            parts = line.split("|")
            if len(parts) != 5:
                continue
            cik, company, form_type, filed_at, filename = parts
            normalized_form = form_type.strip().upper()
            if normalized_form not in form_set:
                continue

            filing_url = f"{SEC_ARCHIVES_BASE}/{filename.strip()}"
            accession = filename.strip().split("/")[-1]

            hits.append(
                {
                    "_id": accession,
                    "_source": {
                        "accessionNo": accession,
                        "cik": cik.strip(),
                        "formType": normalized_form,
                        "displayNames": company.strip(),
                        "filedAt": filed_at.strip(),
                        "linkToTxt": filing_url,
                        "year": year,
                        "quarter": qtr,
                    },
                }
            )
            if len(hits) >= limit:
                return hits

    return hits


def resolve_filing_url(hit: dict[str, Any]) -> str | None:
    source = hit.get("_source", {})
    links = [
        source.get("linkToTxt"),
        source.get("linkToFilingDetails"),
        source.get("display_names"),
        source.get("adsh"),
    ]

    for candidate in links:
        if isinstance(candidate, str) and candidate.startswith("http"):
            return candidate

    if isinstance(source.get("accessionNo"), str) and isinstance(source.get("cik"), str):
        cik = source["cik"].lstrip("0")
        accession = source["accessionNo"].replace("-", "")
        return f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{source['accessionNo']}.txt"

    return None


def ingest(
    output_dir: Path,
    years: tuple[int, int],
    query: str,
    forms: list[str],
    limit: int,
    user_agent: str,
) -> dict[str, Any]:
    start_date = f"{years[0]}-01-01"
    end_date = f"{years[1]}-12-31"

    output_dir.mkdir(parents=True, exist_ok=True)
    try:
        hits = search_filings(query, start_date, end_date, forms, max(limit, 25), user_agent)
    except requests.HTTPError as error:
        status = error.response.status_code if error.response is not None else "unknown"
        print(f"[SEC] search-index failed with status {status}.")
        hits = _fallback_master_index_hits(years, forms, limit=max(limit, 25), user_agent=user_agent)

    downloaded = 0
    skipped = 0
    records = []

    headers = {"User-Agent": user_agent}

    for idx, hit in enumerate(hits[:limit], start=1):
        filing_url = resolve_filing_url(hit)
        if not filing_url:
            skipped += 1
            continue

        try:
            response = requests.get(filing_url, headers=headers, timeout=45)
            if response.status_code != 200:
                skipped += 1
                continue

            raw = response.text
            cleaned = clean_text(raw)
            if len(cleaned) < 1000:
                skipped += 1
                continue

            source = hit.get("_source", {})
            accession = str(source.get("accessionNo") or hit.get("_id") or f"filing-{idx}")
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", accession)

            text_path = output_dir / f"{safe_name}.txt"
            meta_path = output_dir / f"{safe_name}.meta.json"

            text_path.write_text(cleaned, encoding="utf-8")
            meta = {
                "accession": accession,
                "form": source.get("formType"),
                "company": source.get("displayNames") or source.get("display_names"),
                "filed_at": source.get("filedAt"),
                "source_url": filing_url,
            }
            meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

            downloaded += 1
            records.append(meta)
            time.sleep(0.15)
        except Exception:
            skipped += 1

    summary = {
        "query": query,
        "forms": forms,
        "years": {"start": years[0], "end": years[1]},
        "requested": limit,
        "downloaded": downloaded,
        "skipped": skipped,
        "output_dir": str(output_dir),
    }

    (output_dir / "ingest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    (output_dir / "filings_manifest.json").write_text(json.dumps(records, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Download SEC EDGAR filings for AML GraphRAG corpus")
    parser.add_argument("--output", required=True, help="Output directory for SEC filings")
    parser.add_argument("--years", nargs=2, type=int, default=[2018, 2024], help="Start and end year")
    parser.add_argument("--query", default='"money laundering" OR sanctions OR shell company', help="Search query")
    parser.add_argument("--forms", default=",".join(DEFAULT_FORMS), help="Comma separated forms")
    parser.add_argument("--limit", type=int, default=200, help="Max filings to download")
    parser.add_argument(
        "--user-agent",
        default="Memory-Web Research contact@example.com",
        help="SEC required User-Agent with contact details",
    )

    args = parser.parse_args()
    forms = [f.strip() for f in args.forms.split(",") if f.strip()]

    summary = ingest(
        output_dir=Path(args.output).resolve(),
        years=(args.years[0], args.years[1]),
        query=args.query,
        forms=forms,
        limit=args.limit,
        user_agent=args.user_agent,
    )

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
