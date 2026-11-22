"""Baixa imagens listadas em JSON (saída do browser evaluate / harvest parcial)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from harvest_image_search import (  # noqa: E402
    _OUT_ROOT,
    download_image,
    relevance_check,
    write_query_manifest,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--meta", type=Path, required=True, help="JSON with platform, slug, google_search_url, items[]")
    args = parser.parse_args()
    meta = json.loads(args.meta.read_text(encoding="utf-8"))
    out_dir = _OUT_ROOT / meta["platform"] / meta["slug"]
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for item in meta.get("items", []):
        if len(saved) >= meta.get("max_count", 18):
            break
        ok, note = relevance_check(
            meta["platform"], meta.get("query", ""), item.get("alt", ""), item.get("src", "")
        )
        if not ok:
            continue
        dest = out_dir / f"{len(saved) + 1:02d}.png"
        stored, side = download_image(item["src"], dest, meta["google_search_url"])
        if not stored:
            continue
        saved.append(
            {
                "file": stored.name,
                "image_url": item["src"],
                "image_source_page": item.get("page_url", ""),
                "google_search_url": meta["google_search_url"],
                "relevance_note": note,
                "min_side_px": side,
            }
        )
    result = {
        "platform": meta["platform"],
        "slug": meta["slug"],
        "query": meta.get("query", ""),
        "source": "google-images",
        "search_engine": "google",
        "google_search_url": meta["google_search_url"],
        "search_url": meta["google_search_url"],
        "fetched_at": meta.get("fetched_at"),
        "status": "ok" if len(saved) >= meta.get("min_count", 12) else ("partial" if saved else "empty"),
        "block_reason": None,
        "images": saved,
        "count": len(saved),
    }
    write_query_manifest(out_dir, result)
    print(f"saved={len(saved)} -> {out_dir}")
    return 0 if saved else 1


if __name__ == "__main__":
    raise SystemExit(main())