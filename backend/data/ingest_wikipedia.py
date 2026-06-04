from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


import wikipediaapi


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def category_title(raw: str) -> str:
    if raw.lower().startswith("category:"):
        return raw
    return f"Category:{raw.replace(' ', '_')}"


def walk_category(
    wiki: wikipediaapi.Wikipedia,
    cat_name: str,
    depth: int,
    max_pages: int,
    seen: set[str],
) -> list[wikipediaapi.WikipediaPage]:
    category = wiki.page(category_title(cat_name))
    if not category.exists():
        return []

    results: list[wikipediaapi.WikipediaPage] = []

    def _walk(page: wikipediaapi.WikipediaPage, level: int) -> None:
        if len(results) >= max_pages:
            return
        if level > depth:
            return

        for member in page.categorymembers.values():
            if len(results) >= max_pages:
                return
            if member.ns == wikipediaapi.Namespace.CATEGORY and level < depth:
                _walk(member, level + 1)
            elif member.ns == wikipediaapi.Namespace.MAIN:
                if member.title in seen:
                    continue
                seen.add(member.title)
                results.append(member)

    _walk(category, 0)
    return results


def ingest(categories: list[str], output_dir: Path, depth: int, max_pages: int) -> dict:
    wiki = wikipediaapi.Wikipedia(
        user_agent="Memory-Web AML GraphRAG Research",
        language="en",
        extract_format=wikipediaapi.ExtractFormat.WIKI,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    manifest = []

    for cat in categories:
        pages = walk_category(wiki, cat, depth=depth, max_pages=max_pages, seen=seen)
        cat_saved = 0
        for page in pages:
            full = wiki.page(page.title)
            if not full.exists():
                continue
            text = clean_text(full.text)
            if len(text) < 500:
                continue
            safe_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", page.title)
            text_path = output_dir / f"{safe_name}.txt"
            text_path.write_text(text, encoding="utf-8")
            manifest.append({
                "title": page.title,
                "category": cat,
                "url": full.fullurl,
                "chars": len(text),
                "path": str(text_path),
            })
            cat_saved += 1

        print(f"{cat}: saved {cat_saved} pages")

    summary = {
        "categories": categories,
        "depth": depth,
        "max_pages_per_category": max_pages,
        "pages_saved": len(manifest),
        "output_dir": str(output_dir),
    }
    (output_dir / "wiki_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    (output_dir / "ingest_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest Wikipedia financial crime corpus")
    parser.add_argument(
        "--categories",
        required=True,
        help="Comma-separated categories (e.g. Financial_crime,Money_laundering,Shell_company)",
    )
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--depth", type=int, default=1, help="Category traversal depth")
    parser.add_argument("--max-pages", type=int, default=500, help="Max pages per category")
    args = parser.parse_args()

    categories = [c.strip().replace("_", " ") for c in args.categories.split(",") if c.strip()]
    summary = ingest(categories, Path(args.output).resolve(), args.depth, args.max_pages)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
