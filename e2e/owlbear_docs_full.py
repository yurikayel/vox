#!/usr/bin/env python3
"""Baixa documentação Owlbear (sitemap) como Markdown em stitch-captures."""

from __future__ import annotations

import json
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

_ROOT = Path(__file__).resolve().parents[1]
OUT = _ROOT / "docs" / "design" / "stitch-captures"
SITEMAP = "https://docs.owlbear.rodeo/sitemap.xml"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120"
NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _slug(url: str) -> str:
    path = urlparse(url).path.strip("/").replace("/", "__")
    return re.sub(r"[^a-z0-9\-_]+", "-", path.lower())[:120] or "index"


def _fetch(url: str) -> str:
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def _html_to_md(url: str, html: str) -> tuple[str, str]:
    if "Cloudflare" in html and "security check" in html.lower():
        raise RuntimeError("Cloudflare challenge")
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or _slug(url)).strip() if soup.title else _slug(url)
    main = soup.find("main") or soup.find("article") or soup.find("div", class_=re.compile("doc"))
    body = main if main else soup.body
    if body is None:
        raise RuntimeError("empty page body")
    for tag in body.find_all(["script", "style", "nav"]):
        tag.decompose()
    text = body.get_text("\n", strip=True)
    md = f"# {title}\n\nFonte: {url}\n\n---\n\n{text}\n"
    return title, md


def _load_urls() -> list[str]:
    xml = _fetch(SITEMAP)
    root = ET.fromstring(xml)
    urls = [el.text.strip() for el in root.findall(".//sm:loc", NS) if el.text]
    if not urls:
        urls = re.findall(r"<loc>([^<]+)</loc>", xml)
    return sorted(set(urls))


def run(*, sleep_s: float = 0.15) -> list[dict]:
    OUT.mkdir(parents=True, exist_ok=True)
    urls = _load_urls()
    rows: list[dict] = []
    master: list[str] = [
        "# Owlbear Rodeo — documentação completa (mirror)",
        f"Fonte: {SITEMAP} · {len(urls)} páginas",
        "",
        "## Índice",
        "",
    ]

    for i, url in enumerate(urls, start=1):
        slug = _slug(url)
        out_name = f"owlbear-docs-full__{slug}.md"
        try:
            html = _fetch(url)
            title, md = _html_to_md(url, html)
            (OUT / out_name).write_text(md, encoding="utf-8")
            rows.append({"url": url, "file": out_name, "title": title, "chars": len(md)})
            master.append(f"- [{title}](./{out_name}) — `{url}`")
            print(f"OK [{i}/{len(urls)}] {slug}", flush=True)
        except Exception as exc:
            rows.append({"url": url, "file": None, "error": str(exc)})
            print(f"FAIL {url}: {exc}", file=sys.stderr, flush=True)
        time.sleep(sleep_s)

    (OUT / "OWLBEAR-DOCS-FULL.md").write_text("\n".join(master) + "\n", encoding="utf-8")
    (OUT / "owlbear-docs-full__INDEX.json").write_text(
        json.dumps(rows, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return rows


def main() -> int:
    rows = run()
    ok = sum(1 for r in rows if r.get("file"))
    print(f"OK {ok}/{len(rows)}", flush=True)
    return 0 if ok == len(rows) else 1


if __name__ == "__main__":
    raise SystemExit(main())