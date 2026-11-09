#!/usr/bin/env python3
"""Derive transparent marks and PWA icons from official Vox logo JPGs in docs/."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
BRANDING = DOCS / "branding"
ICONS = ROOT / "client" / "icons"

TRANSPARENT_SRC = BRANDING / "vox-transparent.png"
WHITE_SRC = (
    BRANDING / "vox-white.png"
    if (BRANDING / "vox-white.png").is_file()
    else (BRANDING / "vox_logo_branco.jpg" if (BRANDING / "vox_logo_branco.jpg").is_file() else DOCS / "vox_logo_branco.jpg")
)


def _color_dist(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def _border_seeds(w: int, h: int) -> list[tuple[int, int]]:
    pts: list[tuple[int, int]] = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    for t in (w // 4, w // 2, (3 * w) // 4):
        pts.append((t, 0))
        pts.append((t, h - 1))
    for t in (h // 4, h // 2, (3 * h) // 4):
        pts.append((0, t))
        pts.append((w - 1, t))
    return pts


def _o_hole_seeds(px, w: int, h: int, bg: tuple[int, int, int], tolerance: float) -> list[tuple[int, int]]:
    """Seed flood at the interior of the yellow O when it still matches paper/navy."""
    sx = sy = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if r > 185 and g > 135 and b < 115 and r - b > 65:
                sx += x
                sy += y
                n += 1
    if n < 100:
        return []
    cx, cy = sx // n, sy // n
    seeds: list[tuple[int, int]] = []
    for dy in range(-220, 80):
        y = cy + dy
        if 0 <= y < h and _color_dist(px[cx, y][:3], bg) <= tolerance:
            seeds.append((cx, y))
            break
    for dx in (-40, 0, 40):
        x = cx + dx
        if 0 <= x < w and _color_dist(px[x, cy][:3], bg) <= tolerance:
            seeds.append((x, cy))
    return seeds


def clear_enclosed_background(
    rgba: Image.Image, bg: tuple[int, int, int], tolerance: float
) -> Image.Image:
    """Remove bg-colored islands enclosed by the mark (e.g. the hole inside the O)."""
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    visited = bytearray(w * h)

    for y0 in range(h):
        for x0 in range(w):
            if visited[y0 * w + x0]:
                continue
            r, g, b, a = px[x0, y0]
            if a == 0 or _color_dist((r, g, b), bg) > tolerance:
                continue
            component, touches_clear = _bg_component(px, (w, h), (x0, y0), bg, tolerance, visited)
            if not touches_clear:
                for x, y in component:
                    c = px[x, y]
                    px[x, y] = (c[0], c[1], c[2], 0)
    return out


def _bg_component(px, size, start, bg, tolerance, visited):
    """Flood-fill da ilha de cor de fundo que começa em `start`.

    Retorna (pixels da ilha, se ela encosta na borda ou em área transparente).
    Uma ilha que não encosta em nada transparente está cercada pela marca (o miolo do O).
    """
    w, h = size
    q: deque[tuple[int, int]] = deque([start])
    component: list[tuple[int, int]] = []
    touches_clear = False
    while q:
        x, y = q.popleft()
        if visited[y * w + x]:
            continue
        r, g, b, a = px[x, y]
        if a == 0:
            touches_clear = True
            continue
        if _color_dist((r, g, b), bg) > tolerance:
            continue
        visited[y * w + x] = 1
        component.append((x, y))
        touches_clear |= x in (0, w - 1) or y in (0, h - 1)
        touches_clear |= _queue_neighbors(px, size, (x, y), visited, q)
    return component, touches_clear


def _queue_neighbors(px, size, point, visited, q) -> bool:
    """Enfileira vizinhos não visitados; devolve True se algum vizinho é transparente."""
    w, h = size
    x, y = point
    saw_clear = False
    for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
        if not (0 <= nx < w and 0 <= ny < h):
            continue
        if px[nx, ny][3] == 0:
            saw_clear = True
        elif not visited[ny * w + nx]:
            q.append((nx, ny))
    return saw_clear


def flood_remove_bg(im: Image.Image, bg: tuple[int, int, int], tolerance: float) -> Image.Image:
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def seed(x: int, y: int) -> None:
        if 0 <= x < w and 0 <= y < h and _color_dist(px[x, y][:3], bg) <= tolerance:
            q.append((x, y))

    for x, y in _border_seeds(w, h):
        seed(x, y)
    for x, y in _o_hole_seeds(px, w, h, bg, tolerance):
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


def erode_bg_chroma_edge(
    rgba: Image.Image, bg: tuple[int, int, int], max_dist: float = 34.0, passes: int = 6
) -> Image.Image:
    """Peel background-colored edge pixels touching transparency."""
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    for _ in range(passes):
        peel: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0 or _color_dist((r, g, b), bg) > max_dist:
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


def _is_mark_chroma(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    if g > r + 18 and g > b + 18 and g > 70:
        return True
    if r > 175 and g > 130 and b < 120 and r - b > 70:
        return True
    if b > r + 15 and b > g + 5 and b > 90:
        return True
    return max(r, g, b) - min(r, g, b) > 40


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
                if a == 0 or _color_dist((r, g, b), bg) > max_dist or _is_mark_chroma((r, g, b)):
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


def fit_opaque_square(im: Image.Image, size: int) -> Image.Image:
    """Center-crop to square and resize — full paper/navy tile, no transparency cutout."""
    rgb = im.convert("RGB")
    w, h = rgb.size
    side = min(w, h)
    x0 = (w - side) // 2
    y0 = (h - side) // 2
    square = rgb.crop((x0, y0, x0 + side, y0 + side))
    return square.resize((size, size), Image.Resampling.LANCZOS)


def squircle_mask(size: int, corner_ratio: float = 0.22) -> Image.Image:
    """iOS-style squircle alpha mask (matches CSS border-radius ~22%)."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = max(1, int(size * corner_ratio))
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    return mask


def fit_opaque_squircle(im: Image.Image, size: int, corner_ratio: float = 0.22) -> Image.Image:
    """Opaque logo tile clipped to squircle — official platform profile avatar."""
    square = fit_opaque_square(im, size)
    rgba = square.convert("RGBA")
    rgba.putalpha(squircle_mask(size, corner_ratio))
    return rgba


def _o_hole_center_alpha(rgba: Image.Image) -> tuple[int, int, int]:
    px = rgba.load()
    w, h = rgba.size
    sx = sy = n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r > 185 and g > 135 and b < 115 and r - b > 65:
                sx += x
                sy += y
                n += 1
    if not n:
        return w // 2, h // 2, px[w // 2, h // 2][3]
    cx, cy = sx // n, sy // n
    for dy in range(-220, 100):
        y = cy + dy
        if 0 <= y < h:
            return cx, y, px[cx, y][3]
    return cx, cy, px[cx, cy][3]


# UI uses opaque tiles in squircle; cutout marks are archive.
def build_transparent_mark(im: Image.Image, bg: tuple[int, int, int], tolerance: float, *, white_paper: bool) -> Image.Image:
    rgba = flood_remove_bg(im, bg, tolerance)
    rgba = clear_enclosed_background(rgba, bg, tolerance + 4)
    rgba = decontaminate_fringe(rgba, bg, strength=1.0)
    fringe = 34.0 if white_paper else 36.0
    rgba = trim_bg_fringe(rgba, bg, max_dist=fringe)
    if white_paper:
        rgba = erode_light_edge(rgba, floor=232, passes=8)
    else:
        rgba = erode_bg_chroma_edge(rgba, bg, max_dist=32.0, passes=6)
    return rgba


def make_white_squircle_icon(mark_rgba: Image.Image, size: int, corner_ratio: float = 0.22, pad_ratio: float = 0.10) -> Image.Image:
    mark = crop_alpha_bbox(mark_rgba)
    mw, mh = mark.size
    side = max(mw, mh)
    pad = max(1, int(side * pad_ratio))
    canvas = side + 2 * pad

    base = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)
    r = int(canvas * corner_ratio)
    draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=r, fill=(255, 255, 255, 255))
    base.paste(mark, ((canvas - mw) // 2, (canvas - mh) // 2), mark)
    return base.resize((size, size), Image.Resampling.LANCZOS)


def write_ico(path: Path, im: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    im.save(path, format="ICO", sizes=sizes)


def tint_mark(rgba: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    """Monochrome silhouette: keeps alpha (shape), replaces RGB with one color."""
    alpha = rgba.convert("RGBA").split()[3]
    solid = Image.new("RGBA", rgba.size, (*color, 255))
    solid.putalpha(alpha)
    return solid


def write_black_mark(mark_rgba: Image.Image, size: int = 128) -> None:
    """Black alpha mark for CTAs on bright fills (EXPLODE! amarelo)."""
    write_png(ICONS / f"icon-mark-black-{size}.png", fit_mark(tint_mark(mark_rgba, (0, 0, 0)), size, pad_ratio=0.02))


def main() -> None:
    BRANDING.mkdir(parents=True, exist_ok=True)
    if not WHITE_SRC.is_file() and not TRANSPARENT_SRC.is_file():
        raise SystemExit(f"Missing branding source in {BRANDING}")

    if TRANSPARENT_SRC.is_file():
        mark_white = Image.open(TRANSPARENT_SRC).convert("RGBA")
        write_png(BRANDING / "vox_logo_mark-transparent.png", mark_white)
    else:
        white_im = Image.open(WHITE_SRC)
        mark_white = build_transparent_mark(white_im, (255, 255, 255), tolerance=24, white_paper=True)
        write_png(BRANDING / "vox_logo_mark-transparent.png", mark_white)

    if WHITE_SRC.is_file():
        white_im = Image.open(WHITE_SRC)
    else:
        white_im = fit_mark(mark_white, 2048, pad_ratio=0.10, bg=(255, 255, 255, 255))

    # 1. Favicons e Marcas: PNG sem fundo (100% transparente)
    write_png(ICONS / "favicon.png", fit_mark(mark_white, 32, pad_ratio=0.03, bg=(0, 0, 0, 0)))
    write_png(ICONS / "favicon-32.png", fit_mark(mark_white, 32, pad_ratio=0.03, bg=(0, 0, 0, 0)))
    write_png(ICONS / "favicon-16.png", fit_mark(mark_white, 16, pad_ratio=0.02, bg=(0, 0, 0, 0)))
    write_png(ICONS / "icon-mark-1024.png", fit_mark(mark_white, 1024, pad_ratio=0.06, bg=(0, 0, 0, 0)))
    write_png(ICONS / "icon-mark.png", fit_mark(mark_white, 512, pad_ratio=0.06, bg=(0, 0, 0, 0)))
    write_black_mark(mark_white)

    # 2. PWA e UI Web: Fundo branco normalizado
    write_png(ICONS / "icon-white-192.png", fit_opaque_square(white_im, 192))
    write_png(ICONS / "icon-white-512.png", fit_opaque_square(white_im, 512))
    write_png(ICONS / "icon-192.png", fit_opaque_square(white_im, 192))
    write_png(ICONS / "icon-512.png", fit_opaque_square(white_im, 512))
    write_png(ICONS / "icon-1024.png", fit_opaque_square(white_im, 1024))
    write_png(ICONS / "profile-vox-official-512.png", fit_opaque_squircle(white_im, 512))

    # 3. Windows Desktop .ICO: Fundo branco normalizado
    ico_master = make_white_squircle_icon(mark_white, 256)
    write_ico(ROOT / "tools" / "desktop-seeder-windows" / "vox.ico", ico_master)
    write_ico(ROOT / "tools" / "steward-kit-windows" / "vox.ico", ico_master)

    # 4. Android Launcher: Fundo branco normalizado
    android_res = ROOT / "android" / "res"
    android_sizes = {
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }
    for folder, sz in android_sizes.items():
        icon_img = make_white_squircle_icon(mark_white, sz)
        write_png(android_res / folder / "ic_launcher.png", icon_img)

    print("Wrote all normalized white-background brand icons + transparent favicons.")


if __name__ == "__main__":
    main()
