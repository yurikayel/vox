"""Filtro e deduplicação de imagens para refs v3."""

from __future__ import annotations

import hashlib
import re
from io import BytesIO
from pathlib import Path

from PIL import Image

MIN_SIDE_PX = 480
SKIP_NAME = re.compile(
    r"(logo|avatar|favicon|icon-|sprite|emoji|badge|spinner|loading|placeholder)",
    re.I,
)


def png_dimensions(data: bytes) -> tuple[int, int]:
    with Image.open(BytesIO(data)) as im:
        return im.size


def is_raster_acceptable(data: bytes, url: str, min_side: int = MIN_SIDE_PX) -> str | None:
    if url.lower().endswith(".svg") or "image/svg" in url.lower():
        return "svg"
    if SKIP_NAME.search(url):
        return "name_noise"
    try:
        w, h = png_dimensions(data)
    except OSError:
        return "not_image"
    if min(w, h) < min_side:
        return f"small_{w}x{h}"
    ratio = max(w, h) / max(min(w, h), 1)
    if ratio > 8 and min(w, h) < 600:
        return "banner_ratio"
    return None


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:16]


def phash_dedupe_key(data: bytes) -> str:
    """Hash perceptual grosseiro (8×8) para dedupe."""
    with Image.open(BytesIO(data)) as im:
        gray = im.convert("L").resize((8, 8), Image.Resampling.LANCZOS)
        pixels = list(gray.getdata())
        avg = sum(pixels) / len(pixels)
        bits = "".join("1" if p >= avg else "0" for p in pixels)
        return bits


def save_png(data: bytes, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)