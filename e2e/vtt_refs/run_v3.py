#!/usr/bin/env python3
"""Orquestra pipeline VTT refs v3 (estratégia pragmática)."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

_E2E = Path(__file__).resolve().parents[1]
if str(_E2E.parent) not in sys.path:
    sys.path.insert(0, str(_E2E.parent))

from e2e.vtt_refs.boards import build_all_boards
from e2e.vtt_refs.contact_sheets import build_all_sheets
from e2e.vtt_refs.coverage import load_queries, write_coverage
from e2e.vtt_refs.doc_tiles import run_doc_tiles
from e2e.vtt_refs.manifest import load_manifest
from e2e.vtt_refs.package_zip import zip_dir
from e2e.vtt_refs.paths import BOARDS_DIR, CAPTURES, QUERIES_TSV, STAMP, V2_DIR, V3_DIR
from e2e.vtt_refs.selection import pick_selection, write_selection
from e2e.vtt_refs.v2_ingest import ingest_v2
from e2e.vtt_refs.verify import build_report, write_report
from e2e.vtt_refs.yt_frames import run_yt_extract

USER_STORE = Path(
    r"C:\Users\yurik\AppData\Local\Cursor\AgentStores"
    r"\cursor_agent_stores\u10032001\files"
)


def _write_inventory(items: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def _dedupe(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for row in items:
        key = row.get("content_hash") or row.get("path", "")
        if key in seen:
            continue
        seen.add(key)
        out.append(row)
    return out


def run_pipeline(
    *,
    only: str | None,
    skip_doc: bool,
    skip_yt: bool,
    skip_v2: bool,
    skip_boards: bool,
) -> int:
    defaults, _ = load_manifest()
    wait_ms = int(defaults.get("wait_ms") or 2000)
    viewport = defaults.get("viewport") or {"width": 1920, "height": 1080}

    V3_DIR.mkdir(parents=True, exist_ok=True)
    assets = V3_DIR / "assets"
    assets.mkdir(parents=True, exist_ok=True)

    inv_path = V3_DIR / "inventory.json"
    inventory: list[dict] = []
    if inv_path.is_file():
        inventory = json.loads(inv_path.read_text(encoding="utf-8"))

    if not skip_v2:
        v2_items = ingest_v2(assets)
        inventory.extend(v2_items)
        print(f"v2 ingest: {len(v2_items)} tiles", flush=True)

    if not skip_doc:
        doc_items = run_doc_tiles(assets, only=only, wait_ms=wait_ms)
        inventory.extend(doc_items)

    if not skip_yt:
        yt_items = run_yt_extract(assets, only=only, wait_ms=wait_ms, viewport=viewport)
        inventory.extend(yt_items)

    inventory = _dedupe(inventory)
    _write_inventory(inventory, V3_DIR / "inventory.json")
    build_all_sheets(inventory, V3_DIR / "_review")

    selection = pick_selection(inventory)
    write_selection(selection, V3_DIR / "selection.yaml")
    write_coverage(load_queries(QUERIES_TSV), selection, V3_DIR / "COVERAGE.md")

    if not skip_boards:
        build_all_boards(selection, BOARDS_DIR)

    zip_dir(V3_DIR, CAPTURES / f"vtt-references-v3-{STAMP}.zip")
    if BOARDS_DIR.is_dir():
        bz = CAPTURES / f"stitch-boards-{STAMP}.zip"
        zip_dir(BOARDS_DIR, bz)
        USER_STORE.mkdir(parents=True, exist_ok=True)
        shutil.copy2(bz, USER_STORE / bz.name)

    report = build_report(v2_dir=V2_DIR, v3_dir=V3_DIR, boards_dir=BOARDS_DIR, strict_v3=True)
    report["v3_ok"] = len(inventory) >= 80
    write_report(report, V3_DIR / "VERIFY.md")
    print(f"inventory total: {len(inventory)}", flush=True)
    return 0 if len(inventory) >= 40 else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default=None)
    parser.add_argument("--skip-doc", action="store_true")
    parser.add_argument("--skip-yt", action="store_true")
    parser.add_argument("--skip-v2", action="store_true")
    parser.add_argument("--skip-boards", action="store_true")
    parser.add_argument("--fresh", action="store_true", help="Apaga assets e inventário antes de rodar")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    if args.verify_only:
        report = build_report(v2_dir=V2_DIR, v3_dir=V3_DIR, boards_dir=BOARDS_DIR)
        write_report(report, V3_DIR / "VERIFY.md")
        return 0
    if args.fresh:
        shutil.rmtree(V3_DIR / "assets", ignore_errors=True)
        (V3_DIR / "inventory.json").unlink(missing_ok=True)
    return run_pipeline(
        only=args.only,
        skip_doc=args.skip_doc,
        skip_yt=args.skip_yt,
        skip_v2=args.skip_v2,
        skip_boards=args.skip_boards,
    )


if __name__ == "__main__":
    raise SystemExit(main())