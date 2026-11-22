"""Extrai buscas Google Images (udm=2) do transcript da sessão Stitch."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, unquote_plus, urlparse

import yaml

_URL_RE = re.compile(r"https://www\.google\.com/search[^\s\"\\]+")
def _platform(query: str) -> str:
    ql = query.lower()
    if "mini kraken" in ql or "minikraken" in ql:
        return "minikraken"
    if "owlbear" in ql:
        return "owlbear"
    if "foundry" in ql:
        return "foundry"
    if "roll20" in ql:
        return "roll20"
    return "unknown"


def _slug(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", query.lower()).strip("-")[:72]


def _ensure_udm2(url: str) -> str:
    if "udm=2" in url or "udm%3D2" in url:
        return url
    joiner = "&" if "?" in url else "?"
    return f"{url}{joiner}udm=2"


def _scan_text(text: str, by_q: dict[str, dict]) -> None:
    for match in _URL_RE.finditer(text):
        raw = match.group(0).rstrip(")").rstrip(">")
        if "udm=2" not in raw and "udm%3D2" not in raw:
            continue
        qvals = parse_qs(urlparse(raw).query).get("q", [])
        if not qvals:
            continue
        qnorm = unquote_plus(qvals[0]).lower().strip()
        row = {"q": qvals[0], "search_url": _ensure_udm2(raw)}
        prev = by_q.get(qnorm)
        if not prev or len(raw) > len(prev["search_url"]):
            by_q[qnorm] = row


def _scan_jsonl(path: Path, by_q: dict[str, dict], user_only: bool) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            if not user_only:
                _scan_text(line, by_q)
            continue
        if user_only and obj.get("role") != "user":
            continue
        msg = obj.get("message") or {}
        for part in msg.get("content") or []:
            if isinstance(part, dict) and part.get("type") == "text":
                _scan_text(part.get("text", ""), by_q)


def load_queries(transcript_dir: Path, user_only: bool = True) -> list[dict]:
    by_q: dict[str, dict] = {}
    main = transcript_dir / f"{transcript_dir.name}.jsonl"
    _scan_jsonl(main, by_q, user_only)
    for sub in transcript_dir.glob("subagents/*.jsonl"):
        _scan_jsonl(sub, by_q, user_only=True)
    rows = []
    for item in sorted(by_q.values(), key=lambda r: r["q"].lower()):
        rows.append(
            {
                "platform": _platform(item["q"]),
                "slug": _slug(item["q"]),
                "q": item["q"],
                "search_url": item["search_url"],
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse Google Image URLs from transcript.")
    parser.add_argument(
        "--transcript-dir",
        type=Path,
        default=Path(
            r"C:\Users\yurik\.cursor\projects\c-project-politica-vox"
            r"\agent-transcripts\fc2e308c-6d67-4817-abe6-7abf6d19990f"
        ),
    )
    parser.add_argument(
        "--include-assistant-urls",
        action="store_true",
        help="Also parse assistant/tool Google URLs (default: user messages only).",
    )
    harvest_root = (
        Path(__file__).resolve().parents[1]
        / "docs"
        / "design"
        / "stitch-captures"
        / "google-images-harvest"
    )
    parser.add_argument("--out", type=Path, default=harvest_root / "queries-from-transcript.yaml")
    parser.add_argument("--tsv-out", type=Path, default=harvest_root / "queries-all.tsv")
    args = parser.parse_args()
    rows = load_queries(args.transcript_dir, user_only=not args.include_assistant_urls)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        yaml.safe_dump(
            {
                "fetched_from": str(args.transcript_dir),
                "user_only": not args.include_assistant_urls,
                "count": len(rows),
                "queries": rows,
            },
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    tsv_lines = ["platform\tslug\tgoogle_url_full\tq"]
    for row in rows:
        tsv_lines.append(
            "\t".join(
                (
                    row["platform"],
                    row["slug"],
                    row["search_url"].replace("\t", " "),
                    row["q"].replace("\t", " "),
                )
            )
        )
    args.tsv_out.write_text("\n".join(tsv_lines) + "\n", encoding="utf-8")
    print(f"queries={len(rows)} -> {args.out} + {args.tsv_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())