"""Ingesta PNG v2: cópia + fatia páginas-doc ilegíveis."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image

from e2e.vtt_refs.image_quality import content_hash, save_png
from e2e.vtt_refs.manifest import load_manifest
from e2e.vtt_refs.paths import V2_DIR

TILE_H = 1000
MIN_H_TO_SLICE = 1400


def _slice_png(data: bytes) -> list[tuple[bytes, int, int]]:
    with Image.open(BytesIO(data)) as im:
        if im.height < MIN_H_TO_SLICE:
            return [(data, im.width, im.height)]
        out: list[tuple[bytes, int, int]] = []
        for y in range(0, im.height, TILE_H):
            crop = im.crop((0, y, im.width, min(y + TILE_H, im.height)))
            buf = BytesIO()
            crop.save(buf, format="PNG", optimize=True)
            out.append((buf.getvalue(), crop.width, crop.height))
        return out


def ingest_v2(out_root: Path) -> list[dict[str, Any]]:
    _, entries = load_manifest()
    items: list[dict[str, Any]] = []
    for entry in entries:
        rel = entry.get("filename")
        if not rel:
            continue
        src = V2_DIR / rel
        if not src.is_file():
            continue
        data = src.read_bytes()
        platform = entry.get("platform", "unknown")
        fid = entry.get("feature_id", "unknown")
        stem = Path(rel).stem
        dest_dir = out_root / platform / fid / f"legacy-{stem}"
        chunks = _slice_png(data)
        for idx, (chunk, w, h) in enumerate(chunks, start=1):
            suffix = f"{idx:02d}" if len(chunks) > 1 else "01"
            fname = f"{suffix}.png"
            rel_out = f"{platform}/{fid}/legacy-{stem}/{fname}"
            save_png(chunk, dest_dir / fname)
            items.append({
                "id": f"v2-{entry.get('id')}-{suffix}",
                "source": "legacy-v2-slice" if len(chunks) > 1 else "legacy-v2",
                "platform": platform,
                "feature_id": fid,
                "manifest_id": entry.get("id"),
                "page_url": entry.get("url", ""),
                "path": rel_out,
                "width": w,
                "height": h,
                "content_hash": content_hash(chunk),
            })
    return items