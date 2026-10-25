#!/usr/bin/env python3
"""Derive transparent marks and PWA icons from official Vox logo JPGs in docs/."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BRANDING = DOCS / "branding"
ICONS = ROOT / "client" / "icons"

WHITE_SRC = DOCS / "vox_logo_branco.jpg"
NAVY_SRC = DOCS / "vox_logo_azul.jpg"

BRAND_NAVY = (49, 35, 131)


def _color_dist(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def flood_remove_bg(im: Image.Image, bg: tuple[int, int, int], tolerance: float) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if _color_dist(px[x, y][:3], bg) <= tolerance:
            q.append((x, y))

    for x, y in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)):
        seed(x, y)

    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        rgb = px[x, y][:3]
        if _color_dist(rgb, bg) > tolerance:
            continue
        seen[i] = 1
        px[x, y] = (rgb[0], rgb[1], rgb[2], 0)
        if x:
            q.append((x - 1, y))
        if x + 1 < w:
            q.append((x + 1, y))
        if y:
            q.append((x, y - 1))
        if y + 1 < h:
            q.append((x, y + 1))

    return rgba


def erode_light_edge(rgba: Image.Image, floor: int = 236, passes: int = 6) -> Image.Image:
    """Peel near-white edge pixels touching transparency (anti-alias halo)."""
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    for _ in range(passes):
        peel: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or min(r, g, b) < floor:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        peel.append((x, y))
                        break
        if not peel:
            break
        for x, y in peel:
            c = px[x, y]
            px[x, y] = (c[0], c[1], c[2], 0)
    return out


def trim_bg_fringe(rgba: Image.Image, bg: tuple[int, int, int], max_dist: float = 42.0) -> Image.Image:
    """Clear semi-transparent pixels adjacent to transparency that still read as background."""
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    for _ in range(3):
        clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or _color_dist((r, g, b), bg) > max_dist:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                        clear.append((x, y))
                        break
        if not clear:
            break
        for x, y in clear:
            c = px[x, y]
            px[x, y] = (c[0], c[1], c[2], 0)
    return out


def decontaminate_fringe(rgba: Image.Image, bg: tuple[int, int, int], strength: float = 0.85) -> Image.Image:
    """Reduce light halos on semi-transparent edge pixels."""
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    bg_f = [float(c) for c in bg]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255:
                continue
            t = a / 255.0
            if t < 0.05:
                px[x, y] = (r, g, b, 0)
                continue
            # un-premultiply toward foreground estimate
            fr = max(0.0, min(255.0, (r - (1 - t) * bg_f[0]) / t))
            fg = max(0.0, min(255.0, (g - (1 - t) * bg_f[1]) / t))
            fb = max(0.0, min(255.0, (b - (1 - t) * bg_f[2]) / t))
            if _color_dist((int(fr), int(fg), int(fb)), bg) < 18:
                px[x, y] = (r, g, b, 0)
                continue
            nr = int(r * (1 - strength) + fr * strength)
            ng = int(g * (1 - strength) + fg * strength)
            nb = int(b * (1 - strength) + fb * strength)
            px[x, y] = (nr, ng, nb, a)
    return out


def crop_alpha_bbox(rgba: Image.Image) -> Image.Image:
    alpha = rgba.split()[3]
    box = alpha.getbbox()
    if not box:
        return rgba
    return rgba.crop(box)


def fit_mark(rgba: Image.Image, size: int, pad_ratio: float = 0.06, bg: tuple[int, int, int, int] | None = None) -> Image.Image:
    mark = crop_alpha_bbox(rgba)
    mw, mh = mark.size
    side = max(mw, mh)
    pad = max(1, int(side * pad_ratio))
    canvas = side + 2 * pad
    base = Image.new("RGBA", (canvas, canvas), bg if bg is not None else (0, 0, 0, 0))
    ox = (canvas - mw) // 2
    oy = (canvas - mh) // 2
    base.paste(mark, (ox, oy), mark)
    return base.resize((size, size), Image.Resampling.LANCZOS)


def write_png(path: Path, im: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, optimize=True)


def main() -> None:
    BRANDING.mkdir(parents=True, exist_ok=True)
    if not WHITE_SRC.is_file() or not NAVY_SRC.is_file():
        raise SystemExit(f"Missing sources: {WHITE_SRC} / {NAVY_SRC}")

    white_im = Image.open(WHITE_SRC)
    navy_im = Image.open(NAVY_SRC)

    mark_white = erode_light_edge(
        trim_bg_fringe(
            decontaminate_fringe(
                flood_remove_bg(white_im, (255, 255, 255), tolerance=22),
                (255, 255, 255),
                strength=1.0,
            ),
            (255, 255, 255),
        ),
        floor=234,
    )
    mark_navy = trim_bg_fringe(
        decontaminate_fringe(
            flood_remove_bg(navy_im, BRAND_NAVY, tolerance=28),
            BRAND_NAVY,
            strength=1.0,
        ),
        BRAND_NAVY,
    )

    write_png(BRANDING / "vox_logo_mark-transparent.png", mark_white)
    write_png(BRANDING / "vox_logo_mark-from-navy-transparent.png", mark_navy)

    opaque_bg = (*BRAND_NAVY, 255)
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png")):
        write_png(ICONS / name, fit_mark(mark_white, size, pad_ratio=0.07, bg=(0, 0, 0, 0)))

    write_png(ICONS / "icon-mark-1024.png", fit_mark(mark_white, 1024, pad_ratio=0.07))
    write_png(ICONS / "icon-mark.png", fit_mark(mark_white, 512, pad_ratio=0.07))
    write_png(ICONS / "icon-1024.png", fit_mark(mark_white, 1024, pad_ratio=0.07, bg=opaque_bg))
    write_png(ICONS / "favicon.png", fit_mark(mark_white, 32, pad_ratio=0.05, bg=(0, 0, 0, 0)))

    print("Wrote branding + client icons from official docs JPGs.")


if __name__ == "__main__":
    main()
