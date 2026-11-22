"""Monta stitch-boards por tela Vox."""

from __future__ import annotations

import math
from pathlib import Path

import yaml
from PIL import Image, ImageDraw, ImageFont

from e2e.vtt_refs.paths import BOARDS_DIR, ROOT, SOVEREIGN, V3_DIR

VOX_SCREENS = [
    ("01-hub", "hub_campaign", "Hub e campanha"),
    ("02-mesa-gm", "session_map_gm", "Mesa GM"),
    ("03-mesa-player", "session_map_player", "Mesa jogador"),
    ("04-toolbar", "toolbar_tactical", "Toolbar tática"),
    ("05-fog", "fog_visibility", "Fog e visão"),
    ("06-tokens", "tokens_layers", "Tokens e camadas"),
    ("07-cronica", "chat_roll_log", "Chat e crônica"),
    ("07b-dice", "dice_tray", "Bandeja de dados"),
    ("08-ficha", "character_sheet", "Ficha"),
    ("09-iniciativa", "initiative_combat", "Iniciativa"),
    ("10-journal", "journal_handouts", "Journal"),
    ("11-dock", "mobile_or_dock", "Mobile / dock"),
]

BOARD_W = 2560
CELL_W = 600
CELL_H = 450
COLS = 4


def _font(size: int = 16):
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _sovereign_snippet() -> str:
    if not SOVEREIGN.is_file():
        return "surface #111316 · primary #78d6cf"
    text = SOVEREIGN.read_text(encoding="utf-8")
    primary = "primary: '#78d6cf'" in text or "primary" in text
    return "Usar tokens sovereign-agora.md (surface escuro, primary teal, secondary gold)."


def build_board_screen(
    screen_id: str,
    title: str,
    picks: list[dict[str, str]],
    out_dir: Path,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for pick in picks:
        src = V3_DIR / pick["path"]
        dest = out_dir / Path(pick["path"]).name
        if src.is_file():
            dest.write_bytes(src.read_bytes())

    n = max(len(picks), 1)
    rows = math.ceil(n / COLS)
    canvas_h = max(rows * (CELL_H + 36) + 80, CELL_H + 80)
    canvas = Image.new("RGB", (BOARD_W, canvas_h), "#111316")
    draw = ImageDraw.Draw(canvas)
    font = _font(18)
    draw.text((20, 12), f"{title} — refs v3", fill="#78d6cf", font=font)

    for i, pick in enumerate(picks):
        col, row = i % COLS, i // COLS
        x = 20 + col * (CELL_W + 16)
        y = 56 + row * (CELL_H + 36)
        src = V3_DIR / pick["path"]
        if not src.is_file():
            continue
        with Image.open(src) as im:
            im = im.convert("RGB")
            im.thumbnail((CELL_W, CELL_H), Image.Resampling.LANCZOS)
            ox = x + (CELL_W - im.width) // 2
            oy = y + (CELL_H - im.height) // 2
            canvas.paste(im, (ox, oy))
        draw.text((x, y + CELL_H + 4), pick.get("platform", "")[:8], fill="#e2e2e6", font=_font(12))

    canvas.save(out_dir / "board.png", format="PNG", optimize=True)

    prompt = [
        f"# Stitch prompt — {title}",
        "",
        _sovereign_snippet(),
        "",
        "## Copiar",
    ]
    for pick in picks:
        prompt.append(f"- `{pick['path']}` ({pick.get('platform')}): {pick.get('note', '')}")
    prompt.extend([
        "",
        "## Evitar",
        "- Logos Roll20/Foundry/Owlbear/Kraken",
        "- Battle map art sem chrome de UI",
        "- Cores de marca concorrente",
    ])
    (out_dir / "PROMPT.md").write_text("\n".join(prompt) + "\n", encoding="utf-8")


def build_all_boards(selection: dict[str, list[dict[str, str]]], boards_root: Path) -> None:
    boards_root.mkdir(parents=True, exist_ok=True)
    for folder, fid, title in VOX_SCREENS:
        picks = selection.get(fid, [])
        if not picks and fid == "session_map_player":
            picks = selection.get("session_map_gm", [])[:3]
        build_board_screen(folder, title, picks, boards_root / folder)