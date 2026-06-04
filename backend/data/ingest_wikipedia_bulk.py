"""
Fast bulk Wikipedia ingestion using direct API calls.
Downloads ~2000 articles per category — much faster than the existing walker.
"""
from __future__ import annotations

import re
import time
from pathlib import Path

import requests

WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "Memory-Web AML GraphRAG Research/2.0"

CATEGORIES = [
    "Money laundering",
    "Financial crime",
    "Shell company",
    "Tax haven",
    "Offshore finance",
    "Anti-money laundering",
    "Financial regulation",
    "Banking regulation",
    "Corporate governance",
    "Organized crime",
    "Economic crime",
    "Corruption",
    "Bribery",
    "Tax evasion",
    "Fraud",
    "Securities fraud",
    "Ponzi scheme",
    "Cryptocurrency and crime",
    "Sanctions",
    "International sanctions",
    "Corporate law",
    "Mergers and acquisitions",
    "Private equity",
    "Hedge funds",
    "Investment banking",
    "Central banking",
    "Financial crisis",
    "Bank regulation",
    "Know your customer",
    "Financial intelligence",
    "Beneficial ownership",
    "Politically exposed person",
    "Trade-based money laundering",
    "Terrorist financing",
    "Asset forfeiture",
    "Financial Action Task Force",
    "Panama Papers",
    "Pandora Papers",
    "FinCEN files",
    "Cayman Islands",
    "British Virgin Islands",
    "Switzerland banking",
]


def _api_get(params: dict, retries: int = 5) -> dict:
    for attempt in range(retries):
        try:
            r = requests.get(WIKI_API, params=params, headers={"User-Agent": USER_AGENT}, timeout=20)
            if r.status_code == 429:
                wait = min(60, (attempt + 1) * 5)
                print(f"  Wikipedia rate limit hit; waiting {wait}s...")
                time.sleep(wait)
                continue
            r.raise_for_status()
            return r.json()
        except Exception as exc:
            if attempt == retries - 1:
                raise exc
            time.sleep((attempt + 1) * 2)
    return {}


def get_category_members(category: str, limit: int = 500) -> list[str]:
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": f"Category:{category}",
        "cmlimit": limit,
        "cmtype": "page",
        "format": "json",
    }
    try:
        data = _api_get(params)
        return [m["title"] for m in data.get("query", {}).get("categorymembers", [])]
    except Exception as e:
        print(f"  Category error {category}: {e}")
        return []


def get_article_text(title: str) -> str:
    params = {
        "action": "query",
        "titles": title,
        "prop": "extracts",
        "explaintext": True,
        "exsectionformat": "plain",
        "format": "json",
    }
    try:
        data = _api_get(params)
        pages = data.get("query", {}).get("pages", {})
        text = list(pages.values())[0].get("extract", "")
        return re.sub(r"\s+", " ", text).strip()
    except Exception:
        return ""


def main():
    output_dir = Path(__file__).parent / "wikipedia"
    output_dir.mkdir(parents=True, exist_ok=True)

    existing = {p.stem for p in output_dir.glob("*.txt")}
    print(f"Already have {len(existing)} Wikipedia articles.")

    all_titles: set[str] = set()
    for cat in CATEGORIES:
        members = get_category_members(cat, limit=500)
        all_titles.update(members)
        print(f"  {cat}: {len(members)} articles found")
        time.sleep(0.3)

    new_titles = [t for t in all_titles if re.sub(r"[^a-zA-Z0-9_.-]+", "_", t) not in existing]
    print(f"\nTotal unique articles to fetch: {len(new_titles)}")

    saved = 0
    for i, title in enumerate(new_titles):
        _ = i
        safe_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", title)
        out_path = output_dir / f"{safe_name}.txt"
        if out_path.exists():
            continue

        text = get_article_text(title)
        if len(text) < 500:
            continue

        out_path.write_text(text, encoding="utf-8")
        saved += 1

        if saved % 50 == 0:
            print(f"  Saved {saved} articles so far...")
        time.sleep(0.5)  # Respect rate limits

    print(f"\n✓ Done. Saved {saved} new articles.")
    print(f"Total articles: {len(list(output_dir.glob('*.txt')))}")


if __name__ == "__main__":
    main()
