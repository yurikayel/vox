"""Harvest de imagens — **não** rodar Google automatizado em loop (CAPTCHA).

Workflow oficial: harvest manual (`HARVEST_MANUAL.md`, `open-next-google-query.ps1`).

Uso opcional (só após cookies gravados manualmente):
  python e2e/harvest_image_search.py --record-cookies
  python e2e/harvest_image_search.py --engine google --storage-state .../google-storage-state.json --only one-slug

Bing: ``--engine bing`` apenas teste; não substitui URLs Google do usuário.
"""

from __future__ import annotations

import argparse
import datetime as dt
import random
import re
import shutil
import urllib.request
from pathlib import Path
from urllib.parse import quote_plus, unquote

import yaml
from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import sync_playwright

_ROOT = Path(__file__).resolve().parents[1]
_OUT_ROOT = _ROOT / "docs" / "design" / "stitch-captures" / "google-images-harvest"
_DEFAULT_QUERY_FILE = _OUT_ROOT / "queries-from-transcript.yaml"

CONSENT_SELECTORS = (
    "button:has-text('Accept all')",
    "button:has-text('Aceitar tudo')",
    "button:has-text('Accept')",
    "#L2AGLb",
)

SKIP_SRC_RE = re.compile(
    r"google\.com/images/branding|gstatic\.com/images/branding|favicon|/icon",
    re.I,
)
NOISE_RE = re.compile(
    r"extrusora|bebedouro|lubing|maquinaria|chiclete|avi[cç]ola|industrial",
    re.I,
)

PLATFORM_ALIASES = {
    "roll20": ("roll20", "roll 20"),
    "foundry": ("foundry", "foundryvtt", "foundry vtt"),
    "owlbear": ("owlbear", "owlbear rodeo"),
    "minikraken": ("mini kraken", "minikraken", "erpg"),
}

VTT_TERMS = (
    "vtt",
    "virtual tabletop",
    "tabletop",
    "character sheet",
    "fog of war",
    "dynamic lighting",
    "token",
    "journal",
    "compendium",
    "initiative",
    "grid",
    "hexcrawl",
    "scene",
    "macro",
    "marketplace",
    "help center",
    "screenshot",
    "ui",
)

_GOOGLE_COLLECT_JS = """
() => {
  const skip = /google\\.com\\/images\\/branding|gstatic\\.com\\/images\\/branding|logo/i;
  const seen = new Set();
  const out = [];
  const add = (src, alt, pageUrl) => {
    if (!src || skip.test(src) || seen.has(src)) return;
    seen.add(src);
    out.push({ src, alt: alt || '', page_url: pageUrl || '' });
  };
  for (const a of document.querySelectorAll('a[href*="imgurl="]')) {
    try {
      const u = new URL(a.href, location.href);
      const imgurl = u.searchParams.get('imgurl');
      if (!imgurl) continue;
      add(decodeURIComponent(imgurl), a.querySelector('img')?.alt || '', u.searchParams.get('imgrefurl') || '');
    } catch (_) {}
  }
  for (const img of document.querySelectorAll('img[src], img[data-src]')) {
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    if (!src || (img.width && img.width < 48)) continue;
    add(src, img.alt || '', img.closest('a')?.href || '');
  }
  return out;
}
"""

_BING_COLLECT_JS = """
() => {
  const seen = new Set();
  const out = [];
  const push = (row) => {
    if (!row?.src || seen.has(row.src)) return;
    seen.add(row.src);
    out.push(row);
  };
  const parseM = (node) => {
    const raw = node.getAttribute('m') || node.getAttribute('data-m');
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      return { src: j.murl || j.turl || '', alt: j.t || '', page_url: j.purl || '' };
    } catch (_) {
      return null;
    }
  };
  document.querySelectorAll('a.iusc, a[data-m]').forEach((a) => push(parseM(a)));
  return out;
}
"""


def load_queries(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    return list(data.get("queries") or [])


def relevance_check(platform: str, query: str, alt: str, src: str) -> tuple[bool, str]:
    blob = f"{query} {alt} {src}".lower()
    if NOISE_RE.search(blob):
        return False, "noise_unrelated"
    for alias in PLATFORM_ALIASES.get(platform, ()):
        if alias in blob:
            return True, f"platform:{alias}"
    if any(term in blob for term in VTT_TERMS):
        return True, "vtt_ui_terms"
    if "battle map" in query.lower() and platform not in blob:
        return False, "battle_map_art_only"
    return False, "low_relevance"


def image_min_side(data: bytes) -> int:
    if data[:8] == b"\x89PNG\r\n\x1a\n" and len(data) > 24:
        width = int.from_bytes(data[16:20], "big")
        height = int.from_bytes(data[20:24], "big")
        return min(width, height)
    if data[:3] == b"\xff\xd8\xff":
        return 220
    return 200


def bing_url(query: str) -> str:
    return f"https://www.bing.com/images/search?q={quote_plus(query)}"


def dismiss_consent(page) -> None:
    for sel in CONSENT_SELECTORS:
        loc = page.locator(sel).first
        try:
            if loc.is_visible(timeout=500):
                loc.click()
                page.wait_for_timeout(300)
                return
        except Exception:
            continue


def scroll_results(page, rounds: int) -> None:
    for _ in range(rounds):
        page.mouse.wheel(0, 1200)
        page.wait_for_timeout(420)


def collect_entries(page, engine: str) -> list[dict]:
    script = _BING_COLLECT_JS if engine == "bing" else _GOOGLE_COLLECT_JS
    raw = page.evaluate(script)
    return [r for r in raw if not SKIP_SRC_RE.search(r.get("src", ""))]


def download_image(url: str, dest: Path, referer: str) -> tuple[Path | None, int]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
            ),
            "Referer": referer,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        if len(data) < 400:
            return None, 0
        side = image_min_side(data)
        if side and side < 200:
            return None, side
        ext = ".jpg" if data[:3] == b"\xff\xd8\xff" else ".webp" if data[:4] == b"RIFF" else ".png"
        out = dest.with_suffix(ext)
        out.write_bytes(data)
        return out, side
    except Exception:
        return None, 0


def detect_google_blocked(page) -> str | None:
    body = (page.inner_text("body") or "").lower()
    if "unusual traffic" in body or "not a robot" in body:
        return "captcha_unusual_traffic"
    if page.locator("form#captcha-form, #recaptcha, iframe[src*='recaptcha']").count() > 0:
        return "recaptcha_form"
    if "sorry" in (page.title() or "").lower():
        return "google_sorry_page"
    return None


def existing_images(out_dir: Path) -> int:
    if not out_dir.is_dir():
        return 0
    return sum(1 for p in out_dir.iterdir() if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"})


def active_url(entry: dict, engine: str) -> str:
    if engine == "google":
        return entry["search_url"]
    return bing_url(entry["q"])


def harvest_on_page(page, entry: dict, out_dir: Path, engine: str, opts: argparse.Namespace) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    search_url = active_url(entry, engine)
    result = {
        "platform": entry["platform"],
        "slug": entry["slug"],
        "query": entry["q"],
        "source": "google-images" if engine == "google" else "bing-images-fallback",
        "search_engine": engine,
        "google_search_url": entry["search_url"],
        "search_url": search_url,
        "fetched_at": dt.date.today().isoformat(),
        "status": "ok",
        "block_reason": None,
        "images": [],
    }
    page.goto(search_url, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_timeout(1400)
    dismiss_consent(page)
    if engine == "google" and detect_google_blocked(page):
        result["status"] = "blocked"
        result["block_reason"] = detect_google_blocked(page) or "captcha"
        write_query_manifest(out_dir, result)
        return result
    scroll_results(page, 7)
    ranked = []
    for item in collect_entries(page, engine):
        ok, note = relevance_check(entry["platform"], entry["q"], item.get("alt", ""), item.get("src", ""))
        if ok:
            ranked.append((item, note))
    saved = 0
    for item, note in ranked:
        if saved >= opts.max_per_query:
            break
        dest = out_dir / f"{saved + 1:02d}.png"
        stored, side = download_image(item["src"], dest, search_url)
        if not stored:
            continue
        saved += 1
        result["images"].append(
            {
                "file": stored.name,
                "image_url": item["src"],
                "image_source_page": item.get("page_url") or "",
                "google_search_url": entry["search_url"],
                "relevance_note": note,
                "min_side_px": side,
            }
        )
    if saved < opts.min_per_query:
        result["status"] = "partial" if saved else "empty"
    write_query_manifest(out_dir, result)
    return result


def harvest_one(page, entry: dict, out_dir: Path, opts: argparse.Namespace) -> dict:
    if opts.engine == "bing":
        return harvest_on_page(page, entry, out_dir, "bing", opts)
    prior = existing_images(out_dir)
    if opts.skip_existing and prior >= opts.min_per_query:
        return {
            "platform": entry["platform"],
            "slug": entry["slug"],
            "query": entry["q"],
            "google_search_url": entry["search_url"],
            "status": "skipped",
            "images": [],
            "count": prior,
        }
    if opts.force:
        for img in out_dir.glob("*"):
            if img.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                img.unlink(missing_ok=True)
    primary = harvest_on_page(page, entry, out_dir, "google", opts)
    if primary["status"] != "blocked" or not opts.fallback_bing_on_blocked:
        return primary
    return harvest_on_page(page, entry, out_dir, "bing", opts)


def write_query_manifest(out_dir: Path, result: dict) -> None:
    (out_dir / "MANIFEST.yaml").write_text(
        yaml.safe_dump(result, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def write_root_files(out_root: Path, results: list[dict], query_total: int) -> None:
    stats = {"attempted": len(results), "ok": 0, "blocked": 0, "partial": 0, "images": 0}
    by_platform: dict[str, dict] = {}
    for row in results:
        plat = row.get("platform", "unknown")
        bucket = by_platform.setdefault(plat, {"queries": 0, "images": 0, "blocked": 0, "ok": 0})
        bucket["queries"] += 1
        count = row.get("count", len(row.get("images", [])))
        bucket["images"] += count
        stats["images"] += count
        if row.get("status") == "blocked":
            stats["blocked"] += 1
            bucket["blocked"] += 1
        elif row.get("status") in {"ok", "skipped"} and count >= 12:
            stats["ok"] += 1
            bucket["ok"] += 1
        elif row.get("status") == "partial":
            stats["partial"] += 1
    root = {
        "fetched_at": dt.date.today().isoformat(),
        "transcript_queries_distinct": query_total,
        "queries_attempted": stats["attempted"],
        "google_ok": stats["ok"],
        "google_blocked": stats["blocked"],
        "total_images_saved": stats["images"],
        "by_platform": by_platform,
        "queries": results,
    }
    (out_root / "MANIFEST.yaml").write_text(
        yaml.safe_dump(root, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
    )


def pick_targets(queries: list[dict], only_slugs: set[str] | None) -> list[dict]:
    if not only_slugs:
        return queries
    return [q for q in queries if q["slug"] in only_slugs or any(s in q["slug"] for s in only_slugs)]


def run_harvest(opts: argparse.Namespace) -> list[dict]:
    query_path = Path(opts.urls_file)
    queries = load_queries(query_path)
    targets = pick_targets(queries, set(opts.only_slugs) if opts.only_slugs else None)
    _OUT_ROOT.mkdir(parents=True, exist_ok=True)
    results: list[dict] = []
    with sync_playwright() as pw:
        launch_kwargs: dict = {"headless": not opts.headed}
        if opts.headed:
            launch_kwargs["channel"] = "chrome"
        browser = pw.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        page.goto("https://www.google.com/", wait_until="domcontentloaded", timeout=60000)
        dismiss_consent(page)
        for entry in targets:
            out_dir = _OUT_ROOT / entry["platform"] / entry["slug"]
            print(f"google {entry['platform']}/{entry['slug']}", flush=True)
            try:
                results.append(harvest_one(page, entry, out_dir, opts))
            except PlaywrightError as exc:
                results.append(
                    {
                        "platform": entry["platform"],
                        "slug": entry["slug"],
                        "google_search_url": entry["search_url"],
                        "status": "error",
                        "block_reason": str(exc)[:180],
                        "images": [],
                    }
                )
            try:
                page.wait_for_timeout(random.randint(2200, 3800))
            except PlaywrightError:
                break
        browser.close()
    write_root_files(_OUT_ROOT, results, len(queries))
    return results


def record_google_cookies(out_path: Path) -> int:
    """Abre Chrome headed; usuário passa CAPTCHA; Enter grava storage state."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome", headless=False)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        page.goto("https://www.google.com/", wait_until="domcontentloaded")
        print("Resolva consent/CAPTCHA no Chrome, depois Enter aqui.", flush=True)
        input()
        context.storage_state(path=str(out_path))
        browser.close()
    print(f"storage_state -> {out_path}")
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Harvest image search for Stitch.")
    parser.add_argument("--record-cookies", action="store_true", help="Grava storage state (one-shot, guiado).")
    parser.add_argument(
        "--storage-state",
        type=Path,
        default=_OUT_ROOT / ".auth" / "google-storage-state.json",
    )
    parser.add_argument("--engine", choices=("google", "bing"), default="google")
    parser.add_argument("--urls-file", type=Path, default=_DEFAULT_QUERY_FILE)
    parser.add_argument("--only", action="append", metavar="SLUG", dest="only_slugs")
    parser.add_argument("--max-per-query", type=int, default=18)
    parser.add_argument("--min-per-query", type=int, default=12)
    parser.add_argument("--headed", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--fallback-bing-on-blocked", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    opts = build_arg_parser().parse_args(argv)
    if opts.record_cookies:
        return record_google_cookies(opts.storage_state)
    if opts.engine == "bing":
        opts.fallback_bing_on_blocked = False
    results = run_harvest(opts)
    blocked = sum(1 for r in results if r.get("status") == "blocked")
    images = sum(len(r.get("images", [])) for r in results)
    print(f"attempted={len(results)} blocked={blocked} images={images}")
    return 0 if images > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())