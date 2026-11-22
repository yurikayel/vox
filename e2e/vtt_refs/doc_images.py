"""Extrai imagens embutidas em páginas de documentação oficial."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

from playwright.sync_api import sync_playwright

from e2e.vtt_refs.consent import dismiss_consent
from e2e.vtt_refs.image_quality import (
    content_hash,
    is_raster_acceptable,
    phash_dedupe_key,
    save_png,
)
from e2e.vtt_refs.manifest import filter_by_only, load_manifest
from e2e.vtt_refs.paths import V3_DIR

SCROLL_JS = """
async () => {
  const h = document.body.scrollHeight;
  for (let y = 0; y < h; y += 600) {
    window.scrollTo(0, y);
    await new Promise(r => setTimeout(r, 200));
  }
  window.scrollTo(0, 0);
}
"""


def _slug_from_url(url: str) -> str:
    path = urlparse(url).path.strip("/").replace("/", "-")
    return re.sub(r"[^a-z0-9\-]+", "-", path.lower())[:48] or "page"


def _collect_srcs(page, base_url: str) -> list[dict[str, str]]:
    return page.evaluate(
        """(base) => {
      const out = [];
      const push = (src, alt, tag) => {
        if (!src || src.startsWith('data:')) return;
        try { src = new URL(src, base).href; } catch (e) { return; }
        out.push({ src, alt: alt || '', tag });
      };
      document.querySelectorAll('img').forEach(el => {
        const src = el.currentSrc || el.src || el.getAttribute('data-src')
          || el.getAttribute('data-lazy-src');
        push(src, el.alt, 'img');
      });
      document.querySelectorAll('picture source[srcset]').forEach(el => {
        const part = (el.srcset || '').split(',')[0].trim().split(' ')[0];
        push(part, '', 'picture');
      });
      document.querySelectorAll('video').forEach(el => {
        if (el.poster) push(el.poster, '', 'video-poster');
        if (el.src) push(el.src, '', 'video');
      });
      return out;
    }""",
        base_url,
    )


def _screenshot_large_imgs(page, dest_dir: Path, slug: str, start_idx: int) -> list[dict[str, Any]]:
    """Fallback: captura elementos img visíveis grandes."""
    meta = page.evaluate(
        """() => {
      return [...document.querySelectorAll('img')].map((el, i) => ({
        i,
        w: el.naturalWidth || el.width,
        h: el.naturalHeight || el.height,
        alt: el.alt || '',
      })).filter(x => x.w >= 400 && x.h >= 300);
    }"""
    )
    items: list[dict[str, Any]] = []
    for j, row in enumerate(meta, start=start_idx):
        loc = page.locator("img").nth(row["i"])
        fname = f"{j:02d}-shot.png"
        path = dest_dir / fname
        try:
            loc.screenshot(path=str(path), timeout=15000)
        except Exception:
            continue
        data = path.read_bytes()
        from e2e.vtt_refs.image_quality import png_dimensions

        w, h = png_dimensions(data)
        items.append({
            "alt": row.get("alt", ""),
            "path_hint": fname,
            "width": w,
            "height": h,
            "data": data,
        })
    return items


def _fetch_bytes(page, url: str) -> bytes | None:
    try:
        resp = page.request.get(url, timeout=60000)
        if not resp.ok:
            return None
        return resp.body()
    except Exception:
        return None


def extract_page_images(
    page,
    entry: dict[str, Any],
    out_root: Path,
    *,
    wait_ms: int,
    seen_hashes: set[str],
    seen_phash: set[str],
) -> list[dict[str, Any]]:
    url = entry["url"]
    try:
        page.goto(url, wait_until="networkidle", timeout=90000)
    except Exception:
        page.goto(url, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(wait_ms)
    dismiss_consent(page)
    page.evaluate(SCROLL_JS)
    page.wait_for_timeout(800)
    dismiss_consent(page)

    platform = entry.get("platform", "unknown")
    feature_id = entry.get("feature_id", "unknown")
    slug = _slug_from_url(url)
    dest_dir = out_root / platform / feature_id / slug
    dest_dir.mkdir(parents=True, exist_ok=True)

    items: list[dict[str, Any]] = []
    for idx, row in enumerate(_collect_srcs(page, url), start=1):
        src = row["src"]
        data = _fetch_bytes(page, src)
        if not data:
            continue
        reject = is_raster_acceptable(data, src)
        if reject:
            continue
        c_hash = content_hash(data)
        p_hash = phash_dedupe_key(data)
        if c_hash in seen_hashes or p_hash in seen_phash:
            continue
        seen_hashes.add(c_hash)
        seen_phash.add(p_hash)

        fname = f"{idx:02d}.png"
        rel = f"{platform}/{feature_id}/{slug}/{fname}"
        save_png(data, dest_dir / fname)
        from e2e.vtt_refs.image_quality import png_dimensions

        w, h = png_dimensions(data)
        items.append({
            "id": f"{entry.get('id')}-{idx:02d}",
            "source": "doc",
            "platform": platform,
            "feature_id": feature_id,
            "manifest_id": entry.get("id"),
            "page_url": url,
            "image_url": src,
            "alt": row.get("alt", ""),
            "tag": row.get("tag", "img"),
            "path": rel.replace("\\", "/"),
            "width": w,
            "height": h,
            "content_hash": c_hash,
        })

    if len(items) < 2:
        shots = _screenshot_large_imgs(page, dest_dir, slug, len(items) + 1)
        for shot in shots:
            c_hash = content_hash(shot["data"])
            if c_hash in seen_hashes:
                continue
            seen_hashes.add(c_hash)
            rel = f"{platform}/{feature_id}/{slug}/{shot['path_hint']}"
            save_png(shot["data"], dest_dir / shot["path_hint"])
            items.append({
                "id": f"{entry.get('id')}-{shot['path_hint']}",
                "source": "doc-element",
                "platform": platform,
                "feature_id": feature_id,
                "manifest_id": entry.get("id"),
                "page_url": url,
                "image_url": url,
                "alt": shot.get("alt", ""),
                "tag": "element-shot",
                "path": rel,
                "width": shot["width"],
                "height": shot["height"],
                "content_hash": c_hash,
            })
    return items


def run_doc_extract(
    out_dir: Path,
    *,
    only: str | None = None,
    wait_ms: int = 3500,
    viewport: dict | None = None,
) -> list[dict[str, Any]]:
    _, entries = load_manifest()
    web = [e for e in entries if e.get("type") == "webpage"]
    web = filter_by_only(web, only)
    viewport = viewport or {"width": 1920, "height": 1080}
    all_items: list[dict[str, Any]] = []
    seen_hashes: set[str] = set()
    seen_phash: set[str] = set()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        context = browser.new_context(viewport=viewport)
        page = context.new_page()
        for entry in web:
            try:
                batch = extract_page_images(
                    page,
                    entry,
                    out_dir,
                    wait_ms=wait_ms,
                    seen_hashes=seen_hashes,
                    seen_phash=seen_phash,
                )
                all_items.extend(batch)
                print(f"OK doc {entry.get('id')}: {len(batch)} img")
            except Exception as exc:
                print(f"FAIL doc {entry.get('id')}: {exc}", file=sys.stderr)
        browser.close()
    return all_items