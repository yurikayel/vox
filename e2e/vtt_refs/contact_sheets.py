"""Contact sheets por feature_id para revisão."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from e2e.vtt_refs.paths import ROOT, V3_DIR

THUMB_W = 400
THUMB_H = 300
COLS = 4


def _load_font(size: int = 14):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def build_contact_sheet(
    items: list[dict],
    out_path: Path,
    *,
    title: str,
) -> None:
    if not items:
        return
    rows = math.ceil(len(items) / COLS)
    canvas = Image.new("RGB", (COLS * THUMB_W, rows * (THUMB_H + 28) + 40), "#1a1c1f")
    draw = ImageDraw.Draw(canvas)
    font = _load_font()
    draw.text((12, 8), title, fill="#e2e2e6", font=font)
    for i, item in enumerate(items):
        col, row = i % COLS, i // COLS
        x, y = col * THUMB_W, 40 + row * (THUMB_H + 28)
        img_path = V3_DIR / item["path"]
        if not img_path.is_file():
            continue
        with Image.open(img_path) as im:
            im = im.convert("RGB")
            im.thumbnail((THUMB_W - 8, THUMB_H - 8), Image.Resampling.LANCZOS)
            ox = x + (THUMB_W - im.width) // 2
            oy = y + (THUMB_H - im.height) // 2
            canvas.paste(im, (ox, oy))
        label = f"{i + 1}:{item.get('platform','?')[:3]}"
        draw.text((x + 4, y + THUMB_H + 4), label, fill="#78d6cf", font=font)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, format="PNG", optimize=True)


def build_all_sheets(inventory: list[dict], review_dir: Path) -> None:
    by_feature: dict[str, list[dict]] = {}
    for row in inventory:
        fid = row.get("feature_id", "unknown")
        by_feature.setdefault(fid, []).append(row)
    for fid, rows in sorted(by_feature.items()):
        rows.sort(key=lambda r: r.get("width", 0) * r.get("height", 0), reverse=True)
        build_contact_sheet(rows[:24], review_dir / f"{fid}-contact.png", title=fid)