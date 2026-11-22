"""Captura docs em tiles de viewport (legível, sem depender de URLs de img)."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import re

from playwright.sync_api import sync_playwright

from e2e.vtt_refs.consent import dismiss_consent
from e2e.vtt_refs.image_quality import content_hash, png_dimensions, save_png
from e2e.vtt_refs.manifest import filter_by_only, load_manifest

MAX_TILES = 4
VIEWPORT_H = 1080


def _slug(url: str) -> str:
    path = urlparse(url).path.strip("/").replace("/", "-")
    return re.sub(r"[^a-z0-9\-]+", "-", path.lower())[:48] or "page"


def capture_doc_tiles(
    page,
    entry: dict[str, Any],
    out_root: Path,
    *,
    wait_ms: int,
) -> list[dict[str, Any]]:
    url = entry["url"]
    platform = entry.get("platform", "unknown")
    fid = entry.get("feature_id", "unknown")
    slug = _slug(url)
    dest = out_root / platform / fid / slug
    dest.mkdir(parents=True, exist_ok=True)

    page.goto(url, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(min(wait_ms, 2500))
    dismiss_consent(page)
    doc_h = page.evaluate("() => Math.min(document.body.scrollHeight, 12000)")
    scrolls = [0]
    step = int(VIEWPORT_H * 0.85)
    y = step
    while y < doc_h and len(scrolls) < MAX_TILES:
        scrolls.append(y)
        y += step

    items: list[dict[str, Any]] = []
    for i, scroll_y in enumerate(scrolls, start=1):
        page.evaluate(f"window.scrollTo(0, {scroll_y})")
        page.wait_for_timeout(400)
        fname = f"tile-{i:02d}.png"
        out = dest / fname
        page.screenshot(path=str(out), full_page=False)
        data = out.read_bytes()
        w, h = png_dimensions(data)
        rel = f"{platform}/{fid}/{slug}/{fname}"
        items.append({
            "id": f"{entry.get('id')}-tile-{i:02d}",
            "source": "doc-tile",
            "platform": platform,
            "feature_id": fid,
            "manifest_id": entry.get("id"),
            "page_url": url,
            "path": rel,
            "scroll_y": scroll_y,
            "width": w,
            "height": h,
            "content_hash": content_hash(data),
        })
    return items


def run_doc_tiles(
    out_dir: Path,
    *,
    only: str | None = None,
    wait_ms: int = 2000,
) -> list[dict[str, Any]]:
    _, entries = load_manifest()
    pages = [e for e in entries if e.get("type") == "webpage"]
    pages = filter_by_only(pages, only)
    all_items: list[dict[str, Any]] = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_context(viewport={"width": 1440, "height": VIEWPORT_H}).new_page()
        for entry in pages:
            try:
                batch = capture_doc_tiles(page, entry, out_dir, wait_ms=wait_ms)
                all_items.extend(batch)
                print(f"OK tiles {entry.get('id')}: {len(batch)}", flush=True)
            except Exception as exc:
                print(f"FAIL tiles {entry.get('id')}: {exc}", file=sys.stderr, flush=True)
        browser.close()
    return all_items