from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import sys
from statistics import fmean

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


from utils.gemini import count_tokens


TEXT_EXTENSIONS = {".txt", ".md", ".json", ".csv", ".xml", ".html"}


def iter_text_files(root: Path):
    for path in root.rglob("*"):
        if path.is_file() and path.suffix.lower() in TEXT_EXTENSIONS:
            yield path


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _calibrate_ratio(
    files: list[Path],
    model: str,
    sample_files: int,
    sample_chars: int,
) -> tuple[float, int]:
    ratios: list[float] = []
    sampled = 0

    for file_path in files:
        if sampled >= sample_files:
            break
        text = _read_text(file_path)
        if len(text) < 500:
            continue
        chunk = text[:sample_chars]
        tokens = count_tokens(chunk, model)
        if tokens <= 0:
            continue
        ratios.append(tokens / max(len(chunk), 1))
        sampled += 1

    if not ratios:
        return 0.26, 0
    return float(fmean(ratios)), sampled


def count_dir_tokens(
    source_dir: Path,
    model: str,
    sample_files: int,
    sample_chars: int,
    direct_count_max_chars: int,
) -> tuple[int, int, dict]:
    files = list(iter_text_files(source_dir))
    ratio, sampled_files = _calibrate_ratio(files, model, sample_files, sample_chars)

    file_count = 0
    token_count = 0
    direct_counted = 0
    estimated_counted = 0

    for index, file_path in enumerate(files, start=1):
        text = _read_text(file_path)
        if not text:
            continue

        char_len = len(text)
        try:
            if direct_count_max_chars > 0 and char_len <= direct_count_max_chars:
                tokens = count_tokens(text, model)
                direct_counted += 1
            else:
                tokens = int(char_len * ratio)
                estimated_counted += 1
        except Exception:
            tokens = int(char_len * ratio)
            estimated_counted += 1

        file_count += 1
        token_count += max(tokens, 0)

        if index % 200 == 0:
            print(f"[token_counter] {source_dir.name}: processed {index}/{len(files)} files...")

    meta = {
        "calibration_ratio_tokens_per_char": round(ratio, 6),
        "calibration_files_used": sampled_files,
        "direct_counted_files": direct_counted,
        "estimated_files": estimated_counted,
    }
    return file_count, token_count, meta


def infer_sources(base_input: Path) -> list[tuple[str, Path]]:
    sec = base_input / "sec_edgar"
    wiki = base_input / "wikipedia"
    if sec.exists() or wiki.exists():
        items = []
        if sec.exists():
            items.append(("sec_edgar", sec))
        if wiki.exists():
            items.append(("wikipedia", wiki))
        return items
    return [("all_data", base_input)]


def main() -> None:
    parser = argparse.ArgumentParser(description="Count dataset tokens using Gemini count_tokens")
    parser.add_argument("--input", required=True, help="Dataset root directory")
    parser.add_argument("--model", default="gemini-1.5-flash", help="Gemini model name")
    parser.add_argument("--output", default="token_count_proof.json", help="Path to output JSON proof")
    parser.add_argument("--sample-files", type=int, default=30, help="Gemini sample files for calibration")
    parser.add_argument("--sample-chars", type=int, default=40000, help="Characters per calibration sample")
    parser.add_argument(
        "--direct-count-max-chars",
        type=int,
        default=0,
        help="Files under this size are counted directly with Gemini",
    )
    args = parser.parse_args()

    input_path = Path(args.input).resolve()
    output_path = Path(args.output).resolve()

    sources = infer_sources(input_path)
    breakdown = {}
    total_files = 0
    total_tokens = 0

    for name, src in sources:
        files, tokens, meta = count_dir_tokens(
            src,
            args.model,
            sample_files=args.sample_files,
            sample_chars=args.sample_chars,
            direct_count_max_chars=args.direct_count_max_chars,
        )
        breakdown[name] = {
            "path": str(src),
            "file_count": files,
            "token_count": tokens,
            "method": "gemini_calibrated_estimate",
            "meta": meta,
        }
        total_files += files
        total_tokens += tokens

    report = {
        "model": args.model,
        "counted_at_utc": datetime.now(timezone.utc).isoformat(),
        "input_path": str(input_path),
        "total_files": total_files,
        "total_tokens": total_tokens,
        "breakdown": breakdown,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
