"""Captura referências visuais Roll20 / Owlbear / Foundry / Mini Kraken para Stitch.

Uso:
  python e2e/capture_vtt_references.py
  python e2e/capture_vtt_references.py --manifest docs/design/stitch-captures/vtt-reference-manifest-v2.yaml
  python e2e/capture_vtt_references.py --only roll20-yt-tabletop
  python e2e/capture_vtt_references.py --output-dir vtt-references-full-2026-11-20

Requisitos: playwright (`pip install playwright` + `playwright install chromium`);
  YouTube: `yt-dlp` e `ffmpeg` no PATH (opcional — Playwright é o caminho primário em v2).
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

import yaml
from playwright.sync_api import sync_playwright

_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_MANIFEST = _ROOT / "docs" / "design" / "stitch-captures" / "vtt-reference-manifest-v2.yaml"

FEATURE_IDS = (
    "hub_campaign",
    "session_map_gm",
    "session_map_player",
    "toolbar_tactical",
    "fog_visibility",
    "tokens_layers",
    "chat_roll_log",
    "dice_tray",
    "character_sheet",
    "initiative_combat",
    "journal_handouts",
    "mobile_or_dock",
)

PLATFORMS = ("roll20", "owlbear", "foundry", "minikraken")

CONSENT_SELECTORS = (
    "button:has-text('Accept')",
    "button:has-text('Aceitar')",
    "button:has-text('Agree')",
    "button:has-text('I agree')",
    "button:has-text('Accept all')",
    "button:has-text('Aceitar tudo')",
    "button:has-text('Got it')",
    "#onetrust-accept-btn-handler",
)


def _youtube_id(url: str) -> str:
  match = re.search(r"(?:[?&]v=|youtu\.be/)([\w-]{6,})", url)
  if not match:
    raise ValueError(f"ID YouTube não encontrado em {url!r}")
  return match.group(1)


def _parse_ts(ts: str) -> float:
  """Converte 'MM:SS' ou 'H:MM:SS' em segundos."""
  parts = [int(p) for p in ts.strip().split(":")]
  if len(parts) == 2:
    return parts[0] * 60 + parts[1]
  if len(parts) == 3:
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  raise ValueError(f"timestamp inválido: {ts!r}")


def _expand_entries(entries: list[dict]) -> list[dict]:
  """Expande `youtube_ts_list` em múltiplas entradas com sufixo no filename."""
  expanded: list[dict] = []
  for entry in entries:
    ts_list = entry.get("youtube_ts_list")
    if not ts_list:
      expanded.append(dict(entry))
      continue
    base_name = entry["filename"]
    stem = base_name.rsplit(".", 1)[0]
    ext = base_name.rsplit(".", 1)[-1] if "." in base_name else "png"
    for idx, ts_item in enumerate(ts_list):
      if isinstance(ts_item, dict):
        ts = ts_item.get("ts") or ts_item.get("youtube_ts") or "00:05"
        slug = ts_item.get("slug") or chr(ord("a") + idx)
      else:
        ts = str(ts_item)
        slug = chr(ord("a") + idx)
      clone = dict(entry)
      clone["youtube_ts"] = ts
      clone.pop("youtube_ts_list", None)
      clone["id"] = f"{entry['id']}-{slug}"
      clone["filename"] = f"{stem}-{slug}.{ext}"
      expanded.append(clone)
  return expanded


def _png_dimensions(path: Path) -> tuple[int, int]:
  with path.open("rb") as handle:
    handle.seek(16)
    width = int.from_bytes(handle.read(4), "big")
    height = int.from_bytes(handle.read(4), "big")
  return width, height


def _quality_gate(path: Path, min_bytes: int, min_px: int) -> str | None:
  if not path.is_file():
    return "arquivo ausente"
  size = path.stat().st_size
  if size < min_bytes:
    return f"tamanho {size} < {min_bytes} bytes"
  try:
    w, h = _png_dimensions(path)
  except OSError as exc:
    return f"PNG inválido: {exc}"
  if min(w, h) < min_px:
    return f"dimensão {w}x{h} < {min_px}px"
  return None


def _dismiss_consent(page) -> None:
  for sel in CONSENT_SELECTORS:
    loc = page.locator(sel).first
    try:
      if loc.is_visible(timeout=800):
        loc.click()
        page.wait_for_timeout(400)
        return
    except Exception:
      continue


def _capture_webpage(page, entry: dict, out_path: Path, wait_ms: int) -> None:
  page.goto(entry["url"], wait_until="domcontentloaded", timeout=90000)
  page.wait_for_timeout(wait_ms)
  _dismiss_consent(page)
  page.wait_for_timeout(500)
  out_path.parent.mkdir(parents=True, exist_ok=True)
  page.evaluate("window.scrollTo(0, 0)")
  page.wait_for_timeout(300)
  page.screenshot(path=str(out_path), full_page=False)


def _ffmpeg_exe() -> str:
  found = shutil.which("ffmpeg")
  if found:
    return found
  try:
    import imageio_ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()
  except ImportError as exc:
    raise RuntimeError("ffmpeg não no PATH e imageio-ffmpeg não instalado") from exc


def _pick_downloaded_video(vid_dir: Path) -> Path:
  files = [p for p in vid_dir.iterdir() if p.is_file()]
  if not files:
    raise RuntimeError("yt-dlp não produziu arquivo")
  video_exts = {".mp4", ".webm", ".mkv", ".m4v", ".mov"}
  videos = [p for p in files if p.suffix.lower() in video_exts]
  if not videos:
    videos = [
        p for p in files
        if not re.search(r"f(140|139|251|250)\.", p.name, re.I)
        and p.suffix.lower() not in {".m4a", ".opus", ".mp3", ".webm"}
        or p.suffix.lower() in video_exts
    ]
  if not videos:
    videos = files
  return max(videos, key=lambda p: p.stat().st_size)


def _capture_youtube(entry: dict, out_path: Path, work: Path) -> None:
  if not shutil.which("yt-dlp"):
    raise RuntimeError("yt-dlp não encontrado no PATH")
  ffmpeg = _ffmpeg_exe()
  url = entry["url"]
  ts = _parse_ts(entry.get("youtube_ts", "00:05"))
  vid_dir = work / "yt_cache"
  vid_dir.mkdir(parents=True, exist_ok=True)
  template = str(vid_dir / "%(id)s.%(ext)s")
  ytdlp_cmd = [
      "yt-dlp",
      "--no-playlist",
      "--no-update",
      "-o",
      template,
      "-f",
      "bv*[ext=mp4]/bv*[ext=webm]/bv*+ba/b",
  ]
  node = shutil.which("node")
  if node:
    ytdlp_cmd.extend(["--js-runtimes", f"node:{node}"])
  ytdlp_cmd.append(url)
  dl = subprocess.run(
      ytdlp_cmd,
      capture_output=True,
      text=True,
      timeout=300,
      check=False,
  )
  if dl.returncode != 0:
    raise RuntimeError(dl.stderr or dl.stdout or "yt-dlp failed")
  video = _pick_downloaded_video(vid_dir)
  out_path.parent.mkdir(parents=True, exist_ok=True)
  ff = subprocess.run(
      [
          ffmpeg,
          "-y",
          "-ss",
          str(ts),
          "-i",
          str(video),
          "-vframes",
          "1",
          str(out_path),
      ],
      capture_output=True,
      text=True,
      timeout=120,
      check=False,
  )
  if ff.returncode != 0:
    raise RuntimeError(ff.stderr or "ffmpeg frame extract failed")


def _capture_youtube_playwright(page, entry: dict, out_path: Path, wait_ms: int) -> None:
  vid = _youtube_id(entry["url"])
  ts = int(_parse_ts(entry.get("youtube_ts", "00:05")))
  page.goto(f"https://www.youtube.com/watch?v={vid}&t={ts}s", wait_until="domcontentloaded", timeout=90000)
  page.wait_for_timeout(wait_ms)
  _dismiss_consent(page)
  play = page.locator(".ytp-play-button").first
  if play.is_visible(timeout=2000):
    play.click()
    page.wait_for_timeout(1500)
  page.wait_for_timeout(1000)
  out_path.parent.mkdir(parents=True, exist_ok=True)
  player = page.locator("#movie_player").first
  if player.is_visible(timeout=5000):
    player.screenshot(path=str(out_path))
    return
  page.screenshot(path=str(out_path), full_page=False)


def _write_sources(out_dir: Path, rows: list[dict], stamp: str, failed: list[str]) -> None:
  lines = [
      f"# VTT reference sources ({stamp})",
      "",
      "Uso interno Stitch / Mesa Soberana. Marcas e screenshots pertencem aos respectivos titulares.",
      "",
      "| Arquivo | Plataforma | feature_id | Feature | Zona | URL | Nota |",
      "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
  ]
  for r in rows:
    lines.append(
        f"| `{r['file']}` | {r['platform']} | {r.get('feature_id', '')} | {r['feature']} "
        f"| {r['mesa_zone']} | {r['url']} | {r['note']} |"
    )
  if failed:
    lines.extend(["", "## Falhas", ""])
    for f in failed:
      lines.append(f"- {f}")
  (out_dir / "SOURCES.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _is_bonus_capture(filename: str) -> bool:
  name = Path(filename).name
  head = name.split("-", 1)[0]
  return head.isdigit() and int(head) >= 13


def _write_matrix(out_dir: Path, rows: list[dict]) -> None:
  by_platform: dict[str, list[dict]] = {p: [] for p in PLATFORMS}
  for row in rows:
    plat = row.get("platform", "")
    if plat in by_platform:
      by_platform[plat].append(row)

  lines = [
      "# MATRIX feature × plataforma (v2)",
      "",
      "Células: `feature_id` → filename. Owlbear: `character_sheet` tipicamente N/A.",
      "",
      "| feature_id | Roll20 | Owlbear | Foundry | Mini Kraken |",
      "| :--- | :--- | :--- | :--- | :--- |",
  ]
  for fid in FEATURE_IDS:
    cells = []
    for plat in PLATFORMS:
      match = next((r for r in by_platform[plat] if r.get("feature_id") == fid), None)
      if match:
        cells.append(f"`{Path(match['file']).name}`")
      else:
        cells.append("—")
    lines.append(f"| `{fid}` | {' | '.join(cells)} |")
  lines.extend(["", "## Contagem por plataforma", ""])
  for plat in PLATFORMS:
    core = [r for r in by_platform[plat] if not _is_bonus_capture(r["file"])]
    bonus = [r for r in by_platform[plat] if _is_bonus_capture(r["file"])]
    extra = f" (+{len(bonus)} bonus)" if bonus else ""
    lines.append(f"- **{plat}:** {len(core)} core · {len(by_platform[plat])} total{extra}")
  for plat, title in (
      ("roll20", "Roll20 Help Center (mapa / tabletop)"),
      ("owlbear", "Owlbear Rodeo 2.0 (docs oficiais)"),
      ("foundry", "Foundry VTT (articles / KB)"),
  ):
    bonus_rows = [r for r in by_platform[plat] if _is_bonus_capture(r["file"])]
    if not bonus_rows:
      continue
    lines.extend(["", f"## Bonus — {title}", ""])
    for r in bonus_rows:
      lines.append(f"- `{Path(r['file']).name}` — {r.get('feature_id', '')} — {r['url']}")
  (out_dir / "MATRIX.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_readme(out_dir: Path, stamp: str, zip_name: str, full_bundle: bool) -> None:
  tag = "full v2" if full_bundle else stamp
  text = f"""# Referências VTT para Stitch ({tag})

Pacote mood board: **Roll20**, **Owlbear Rodeo**, **Foundry VTT**, **Mini Kraken**.

## Como usar no Stitch

1. Anexe este ZIP junto com `dungeon-ui-{stamp}.zip` (capturas do Vox).
2. Consulte `MATRIX.md` para feature_id × plataforma.
3. Copiar **padrão de interação**, não cores/logos das marcas. Tokens Vox: [sovereign-agora.md](../sovereign-agora.md).

## Conteúdo

- `roll20/` … sessão YouTube Crash Course / overview
- `owlbear/` … mapa, fog, dice, trackers
- `foundry/` … cenas, combat, player guide
- `minikraken/` … docs ERPG com UI embutida

Proveniência: [SOURCES.md](./SOURCES.md). Catálogo: [vtt-youtube-catalog.md](./vtt-youtube-catalog.md).

Regenerar:
`python e2e/capture_vtt_references.py --manifest docs/design/stitch-captures/vtt-reference-manifest-v2.yaml`

Arquivo: `{zip_name}`
"""
  (out_dir / "README.md").write_text(text, encoding="utf-8")


def _bundle_name(manifest_path: Path, stamp: str, output_dir: str | None) -> tuple[str, bool]:
  full = "v2" in manifest_path.name or (output_dir and "full" in output_dir)
  if output_dir:
    folder = output_dir
  elif full:
    folder = f"vtt-references-full-{stamp}"
  else:
    folder = f"vtt-references-{stamp}"
  zip_name = f"{folder}.zip"
  return folder, full


def main() -> int:
  parser = argparse.ArgumentParser()
  parser.add_argument("--manifest", type=Path, default=_DEFAULT_MANIFEST)
  parser.add_argument("--output-dir", type=str, default=None, help="Nome da pasta em stitch-captures/")
  parser.add_argument("--only", type=str, default=None, help="Filtrar ids por prefixo")
  parser.add_argument(
      "--skip-quality-gate",
      action="store_true",
      help="Não rejeitar PNGs pequenos (debug)",
  )
  args = parser.parse_args()
  manifest_path = args.manifest.resolve()
  data = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
  defaults = data.get("defaults") or {}
  viewport = defaults.get("viewport") or {"width": 1920, "height": 1080}
  wait_ms = int(defaults.get("wait_ms") or 3500)
  yt_pw_first = bool(defaults.get("youtube_playwright_first", True))
  min_bytes = int(defaults.get("min_png_bytes") or 40960)
  min_px = int(defaults.get("min_png_px") or 400)
  all_entries = _expand_entries(data.get("entries") or [])
  entries = all_entries
  if args.only:
    entries = [e for e in all_entries if e.get("id", "").startswith(args.only)]

  stamp = dt.date.today().isoformat()
  capture_root = _ROOT / "docs" / "design" / "stitch-captures"
  folder_name, full_bundle = _bundle_name(manifest_path, stamp, args.output_dir)
  out_dir = capture_root / folder_name
  out_dir.mkdir(parents=True, exist_ok=True)
  if args.only:
    for entry in entries:
      target = out_dir / entry["filename"]
      target.unlink(missing_ok=True)
  else:
    for old in out_dir.glob("**/*"):
      if old.is_file() and old.suffix.lower() == ".png":
        old.unlink()

  failed: list[str] = []
  review: list[str] = []
  source_rows: list[dict] = []
  web_entries = [e for e in entries if e.get("type") == "webpage"]
  yt_entries = [e for e in entries if e.get("type") == "youtube"]

  def _record(entry: dict, rel: str, note: str) -> None:
    source_rows.append({
        "file": rel,
        "platform": entry["platform"],
        "feature_id": entry.get("feature_id", ""),
        "feature": entry.get("feature", ""),
        "mesa_zone": entry.get("mesa_zone", ""),
        "url": entry["url"],
        "note": note,
    })

  def _after_capture(entry: dict, out_path: Path, rel: str, note: str) -> bool:
    if args.skip_quality_gate:
      _record(entry, rel, note)
      return True
    reason = _quality_gate(out_path, min_bytes, min_px)
    if reason:
      review.append(f"{entry['id']} ({rel}): {reason}")
      out_path.unlink(missing_ok=True)
      return False
    _record(entry, rel, note)
    return True

  with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    context = browser.new_context(viewport=viewport, user_agent=user_agent)
    page = context.new_page()
    for entry in web_entries:
      rel = entry["filename"]
      out_path = out_dir / rel
      try:
        _capture_webpage(page, entry, out_path, wait_ms)
        if _after_capture(entry, out_path, rel, "screenshot página pública"):
          print(f"OK web {rel}")
        else:
          print(f"REVIEW web {rel}")
      except Exception as exc:
        failed.append(f"{entry['id']}: {exc}")
        print(f"FAIL web {entry['id']}: {exc}", file=sys.stderr)

  with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    context = browser.new_context(viewport=viewport, user_agent=user_agent)
    page = context.new_page()
    for entry in yt_entries:
      rel = entry["filename"]
      out_path = out_dir / rel
      ts = entry.get("youtube_ts", "")
      captured = False
      if yt_pw_first:
        try:
          _capture_youtube_playwright(page, entry, out_path, wait_ms)
          note = f"player YouTube @{ts} (Playwright)"
          if _after_capture(entry, out_path, rel, note):
            print(f"OK yt-playwright {rel}")
            captured = True
        except Exception as exc:
          print(f"WARN yt-playwright {entry['id']}: {exc}", file=sys.stderr)
      if not captured:
        with tempfile.TemporaryDirectory() as tmp:
          try:
            _capture_youtube(entry, out_path, Path(tmp))
            note = f"frame vídeo yt-dlp @{ts}"
            if _after_capture(entry, out_path, rel, note):
              print(f"OK yt-dlp {rel}")
              captured = True
          except Exception as exc:
            print(f"WARN yt-dlp {entry['id']}: {exc}", file=sys.stderr)
      if not captured:
        try:
          _capture_youtube_playwright(page, entry, out_path, wait_ms)
          note = f"player YouTube @{ts} (fallback)"
          if _after_capture(entry, out_path, rel, note):
            print(f"OK yt-fallback {rel}")
          else:
            failed.append(f"{entry['id']}: quality gate")
        except Exception as exc:
          failed.append(f"{entry['id']}: {exc}")
          print(f"FAIL yt {entry['id']}: {exc}", file=sys.stderr)
    context.close()
    browser.close()

  if args.only:
    by_file = {r["file"]: r for r in source_rows}
    for entry in all_entries:
      rel = entry["filename"]
      png = out_dir / rel
      if not png.is_file() or rel in by_file:
        continue
      by_file[rel] = {
          "file": rel,
          "platform": entry["platform"],
          "feature_id": entry.get("feature_id", ""),
          "feature": entry.get("feature", ""),
          "mesa_zone": entry.get("mesa_zone", ""),
          "url": entry["url"],
          "note": "captura anterior (--only merge)",
      }
    source_rows = sorted(by_file.values(), key=lambda r: r["file"])

  _write_sources(out_dir, source_rows, stamp, failed)
  _write_matrix(out_dir, source_rows)
  zip_name = f"{folder_name}.zip"
  _write_readme(out_dir, stamp, zip_name, full_bundle)
  if failed:
    (out_dir / "_FAILED.md").write_text("\n".join(failed) + "\n", encoding="utf-8")
  if review:
    (out_dir / "_REVIEW.md").write_text("\n".join(review) + "\n", encoding="utf-8")

  zip_path = capture_root / zip_name
  if zip_path.exists():
    zip_path.unlink()
  with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
    for f in sorted(out_dir.iterdir()):
      if f.is_file():
        zf.write(f, arcname=f"{out_dir.name}/{f.name}")
    for sub in PLATFORMS:
      subdir = out_dir / sub
      if subdir.is_dir():
        for f in sorted(subdir.iterdir()):
          if f.is_file():
            zf.write(f, arcname=f"{out_dir.name}/{sub}/{f.name}")

  png_count = len(list(out_dir.glob("**/*.png")))
  print(f"OK: {out_dir}")
  print(f"ZIP: {zip_path}")
  print(f"PNGs: {png_count} (failed: {len(failed)}, review: {len(review)})")
  min_expected = 40 if full_bundle else 16
  return 0 if png_count >= min_expected else 1


if __name__ == "__main__":
  sys.exit(main())