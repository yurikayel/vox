#!/usr/bin/env python3
"""Gera dossiê único Owlbear (/docs) com imagens locais para Stitch."""

from __future__ import annotations

import base64
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup, Tag

from owlbear_docs_full import OUT, UA, _fetch

ASSET_ROOT = OUT / "owlbear-stitch-dossier" / "assets"
DOSSIER = OUT / "OWLBEAR-STITCH-DOSSIER.md"
META = OUT / "owlbear-stitch-dossier" / "manifest.json"
ORIGIN = "https://docs.owlbear.rodeo"

DOC_SLUGS: list[tuple[str, list[str]]] = [
    ("getting-started", ["hub_campaign", "mobile_or_dock"]),
    ("rooms", ["hub_campaign"]),
    ("managing-assets", ["hub_campaign", "journal_handouts"]),
    ("scenes", ["session_map_gm", "session_map_player"]),
    ("aligning-a-map", ["toolbar_tactical", "session_map_gm"]),
    ("images", ["tokens_layers"]),
    ("drawing", ["toolbar_tactical"]),
    ("measure", ["toolbar_tactical"]),
    ("fog", ["fog_visibility"]),
    ("text", ["journal_handouts"]),
    ("permissions", ["session_map_player"]),
    ("casting", ["session_map_player", "mobile_or_dock"]),
    ("troubleshooting", []),
]

_SKIP_LINE = re.compile(r"^(On this page|​)$")


def _page_slug(path: str) -> str:
    tail = path.rstrip("/").split("/")[-1]
    return re.sub(r"[^a-z0-9\-]+", "-", tail.lower())


def _condense(text: str, *, limit: int = 300) -> str:
    flat = re.sub(r"\s+", " ", text.replace("\u200b", "")).strip()
    if len(flat) <= limit:
        return flat
    parts = re.split(r"(?<=[.!?])\s+", flat)
    out: list[str] = []
    size = 0
    for part in parts:
        if not part:
            continue
        next_size = size + len(part) + (1 if out else 0)
        if next_size > limit and out:
            break
        out.append(part)
        size = next_size
    return " ".join(out) if out else flat[: limit - 1] + "…"


def _download_bytes(url: str) -> bytes:
    if url.startswith("data:"):
        header, b64 = url.split(",", 1)
        return base64.b64decode(b64)
    req = Request(url, headers={"User-Agent": UA})
    with urlopen(req, timeout=60) as resp:
        return resp.read()


def _save_image(
    src: str,
    page_slug: str,
    cache: dict[str, str],
) -> str | None:
    if not src or src.startswith("data:image/svg"):
        return None
    abs_url = urljoin(ORIGIN + "/", src) if not src.startswith("data:") else src
    if abs_url in cache:
        return cache[abs_url]
    try:
        raw = _download_bytes(abs_url)
    except OSError:
        return None
    digest = hashlib.sha256(raw).hexdigest()[:16]
    name = Path(urlparse(src).path).name if not src.startswith("data:") else f"inline-{digest}.jpg"
    if "." not in name:
        name = f"{name}.jpg"
    dest_dir = ASSET_ROOT / page_slug
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / name
    if not dest.exists():
        dest.write_bytes(raw)
    rel = f"owlbear-stitch-dossier/assets/{page_slug}/{name}"
    cache[abs_url] = rel
    return rel


def _visible_paragraph_text(p: Tag) -> str:
    if p.find("img") and not p.get_text(strip=True):
        return ""
    return _condense(p.get_text(" ", strip=True))


def _is_nested(el: Tag, names: tuple[str, ...]) -> bool:
    parent = el.parent
    while parent and getattr(parent, "name", None):
        if parent.name in names and parent is not el:
            return True
        if parent.name in ("main", "article"):
            return False
        parent = parent.parent
    return False


def _walk_blocks(main: Tag) -> list[dict]:
    root = main.find("article") or main
    ordered = root.find_all(["h1", "h2", "h3", "p", "li", "img"])
    ordered.sort(key=lambda t: getattr(t, "sourceline", 0) or 0)
    blocks: list[dict] = []
    seen_img: set[str] = set()
    for el in ordered:
        if el.name in ("h1", "h2", "h3"):
            title = _condense(el.get_text(strip=True), limit=120)
            if title and not _SKIP_LINE.match(title):
                blocks.append({"type": "heading", "level": int(el.name[1]), "text": title})
        elif el.name == "p" and not _is_nested(el, ("p", "li")):
            text = _visible_paragraph_text(el)
            if text:
                blocks.append({"type": "para", "text": text})
            for im in el.find_all("img"):
                src = im.get("src", "")
                if src in seen_img:
                    continue
                seen_img.add(src)
                blocks.append(
                    {
                        "type": "img",
                        "src": src,
                        "alt": (im.get("alt") or "UI screenshot").strip(),
                    }
                )
        elif el.name == "li" and not _is_nested(el, ("li",)):
            text = _condense(el.get_text(" ", strip=True), limit=220)
            if text:
                blocks.append({"type": "bullet", "text": text})
        elif el.name == "img" and el.find_parent("p") is None:
            src = el.get("src", "")
            if src in seen_img:
                continue
            seen_img.add(src)
            blocks.append(
                {
                    "type": "img",
                    "src": src,
                    "alt": (el.get("alt") or "UI screenshot").strip(),
                }
            )
    return blocks


def _stitch_hint(features: list[str]) -> str:
    hints = {
        "hub_campaign": "onboarding de sala, convites e biblioteca no dock",
        "session_map_gm": "layout GM: cena ativa, grelha, painel lateral",
        "session_map_player": "projeção limpa; esconder ferramentas GM",
        "toolbar_tactical": "toolbar flutuante, modos de desenho/medida",
        "fog_visibility": "fog, preview jogador, fill/cut",
        "tokens_layers": "tokens, imagens e tipos de asset",
        "mobile_or_dock": "dock inferior, responsivo, casting",
        "journal_handouts": "texto no mapa, handouts",
    }
    parts = [hints[f] for f in features if f in hints]
    return "; ".join(parts) if parts else "referência de padrão visual Owlbear"


def _render_page(slug: str, features: list[str], cache: dict[str, str]) -> tuple[str, dict]:
    url = f"{ORIGIN}/docs/{slug}/"
    html = _fetch(url)
    soup = BeautifulSoup(html, "html.parser")
    main = soup.find("main") or soup.find("article")
    if main is None:
        raise RuntimeError(f"no main: {url}")
    title = soup.find("h1")
    page_title = _condense(title.get_text(strip=True), limit=80) if title else slug
    lines = [
        f"### {page_title}",
        "",
        f"- **Fonte:** `{url}`",
    ]
    if features:
        lines.append(f"- **Mesa Vox (`feature_id`):** {', '.join(f'`{f}`' for f in features)}")
        lines.append(f"- **Stitch:** {_stitch_hint(features)}")

    blocks = _walk_blocks(main)
    blocks = [b for b in blocks if not (b.get("type") == "heading" and b.get("level") == 1)]
    lede = next((b["text"] for b in blocks if b["type"] == "para"), "")
    if lede:
        lines.extend(["", f"**Resumo:** {lede}", ""])
    start = 0
    while start < len(blocks):
        b = blocks[start]
        if b["type"] == "para" and b["text"] == lede:
            start += 1
            continue
        break

    images = 0
    in_list = False
    for b in blocks[start:]:
        if b["type"] == "heading" and b["level"] >= 2:
            if in_list:
                lines.append("")
                in_list = False
            if b["text"].lower() == page_title.lower():
                continue
            hashes = "#" * min(b["level"] + 2, 5)
            lines.extend(["", f"{hashes} {b['text']}", ""])
        elif b["type"] == "para":
            lines.append(b["text"])
            lines.append("")
        elif b["type"] == "bullet":
            if not in_list:
                in_list = True
            lines.append(f"- {b['text']}")
        elif b["type"] == "img":
            rel = _save_image(b["src"], slug, cache)
            if rel:
                cap = b["alt"] or "Owlbear UI"
                lines.extend(["", f"![{cap}]({rel})", f"*Figura:* {cap}", ""])
                images += 1
    return "\n".join(lines).strip() + "\n", {"slug": slug, "url": url, "images": images}


def build(*, sleep_s: float = 0.12) -> Path:
    ASSET_ROOT.mkdir(parents=True, exist_ok=True)
    cache: dict[str, str] = {}
    header = [
        "# Owlbear Rodeo — dossiê Stitch (produto)",
        "",
        "> **Status:** pesquisa (referência de mercado para design) · **Revisado:** 2026-11-20",
        "> **Uso:** anexar este ficheiro + pasta `owlbear-stitch-dossier/assets/` no Stitch ao redesenhar a Mesa Vox.",
        f"> **Escopo:** guias oficiais `/docs/*` (UI jogador/GM). API de extensões: {ORIGIN}/extensions/.",
        f"> **Gerado:** `python e2e/owlbear_stitch_dossier.py` · origem {ORIGIN}",
        "",
        "## Leitura rápida (para o modelo)",
        "",
        "| Ideia Owlbear | Implicação para Mesa Vox |",
        "| :--- | :--- |",
        "| Cena = canvas infinito com grelha | Mapa herói full-bleed; trocar cena ≈ trocar mesa física |",
        "| Asset Manager no **dock** lateral | Hub de salas, cenas, mapas e tokens num painel compacto |",
        "| Ferramentas na **toolbar** (medir, desenhar, fog) | Z4 tática flutuante; modos vs ações separados no fog |",
        "| Fog com preview GM / jogador | Z4 visibility: GM vê através; jogador só vê áreas reveladas |",
        "| Mapas reutilizáveis fora da cena | Biblioteca de assets desacoplada da cena ativa |",
        "| Casting / permissões por sala | Entrada jogador simples; ocultar chrome de GM na projeção |",
        "",
        "## Guias (texto condensado + figuras da documentação)",
        "",
    ]
    body: list[str] = []
    manifest: list[dict] = []
    total_img = 0

    for slug, features in DOC_SLUGS:
        try:
            section, meta = _render_page(slug, features, cache)
            body.append(section)
            manifest.append(meta)
            total_img += meta["images"]
            print(f"OK {slug} ({meta['images']} img)", flush=True)
        except Exception as exc:
            print(f"FAIL {slug}: {exc}", file=sys.stderr, flush=True)
            manifest.append({"slug": slug, "error": str(exc)})
        time.sleep(sleep_s)

    footer = [
        "",
        "## Apêndice — extensões",
        "",
        "Owlbear expõe SDK de extensões (ferramentas custom, initiative tracker, manifest). "
        "Não é referência visual primária para o Stitch da Mesa Vox; ver "
        f"{ORIGIN}/extensions/ (mirror em texto: `python e2e/owlbear_docs_full.py`).",
        "",
        f"---\n\n**Totais:** {len(DOC_SLUGS)} guias · {total_img} figuras · {len(cache)} bytes únicos em assets.",
    ]
    DOSSIER.write_text("\n".join(header + body + footer) + "\n", encoding="utf-8")
    META.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return DOSSIER


def main() -> int:
    path = build()
    print(path, flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())