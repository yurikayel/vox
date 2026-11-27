"""Captura screenshots das telas #/dungeon para handoff de design (desktop + mobile).

Uso (servidor em client/ na porta 8080):
  python e2e/capture_dungeon_ui.py
  python e2e/capture_dungeon_ui.py --base-url http://127.0.0.1:8080

Saída: docs/design/stitch-captures/dungeon-ui-<data>/ + .zip no mesmo nível.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import zipfile
from pathlib import Path

from playwright.sync_api import sync_playwright

_E2E_DIR = Path(__file__).resolve().parent
_ROOT = _E2E_DIR.parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_vox_e2e import _complete_onboarding, _new_isolated_page  # noqa: E402

COLOR_MODE_KEY = "vox-color-mode"


def _new_page(browser, base_url, viewport, color_mode: str):
  """Contexto isolado com tema fixo antes do boot do PWA."""
  ctx = browser.new_context(
      service_workers="block",
      viewport=viewport,
      color_scheme=color_mode,
  )
  cfg = {
      "signalingUrls": [],
      "nostrRelays": [],
      "nostrSignaling": {"enabled": False},
      "stun": [],
      "turn": [],
  }
  errors, external_hits = [], []

  def _route(route):
      url = route.request.url
      if url.startswith(base_url):
          route.continue_()
          return
      external_hits.append(url)
      route.abort()

  ctx.route("**/*", _route)
  ctx.add_init_script(
      f"localStorage.setItem('{COLOR_MODE_KEY}', '{color_mode}');"
  )
  page = ctx.new_page()
  page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
  page.on("console", lambda msg: errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)
  return ctx, page, errors


def _apply_color_mode_dom(page, color_mode: str):
  page.evaluate(
      """(mode) => {
    const root = document.documentElement;
    localStorage.setItem('vox-color-mode', mode);
    root.setAttribute('data-color-mode', mode);
    root.style.colorScheme = mode;
  }""",
      color_mode,
  )
  page.wait_for_timeout(150)


def _set_viewer_gm(page):
  toggle = page.locator("button[data-dungeon='toggle-viewer-role']")
  for _ in range(4):
      if "Mestre" in toggle.inner_text():
          return
      toggle.click()
      page.wait_for_timeout(120)
  raise RuntimeError("visão Mestre não ativou")


def _set_viewer_player(page):
  toggle = page.locator("button[data-dungeon='toggle-viewer-role']")
  for _ in range(4):
      if "Jogador" in toggle.inner_text():
          return
      toggle.click()
      page.wait_for_timeout(120)
  raise RuntimeError("visão Jogador não ativou")


def _dismiss_banners(page):
  btn = page.locator("#accountExitBanner button:has-text('Agora não')")
  if btn.count() and btn.first.is_visible():
      btn.first.click()
      page.wait_for_timeout(200)


def _wait_dungeon(page, screen: str, timeout=20000):
  page.locator(f".dungeon-sanctum[data-dungeon-screen='{screen}']").wait_for(
      state="visible", timeout=timeout
  )
  page.wait_for_timeout(400)


def _shot(page, path: Path):
  path.parent.mkdir(parents=True, exist_ok=True)
  page.screenshot(path=str(path), full_page=True)


def _capture_set(
    browser,
    base_url: str,
    out_dir: Path,
    viewport: dict,
    viewport_tag: str,
    color_mode: str,
):
  ctx, page, errors = _new_page(browser, base_url, viewport, color_mode)
  suffix = f"{viewport_tag}-{color_mode}"
  try:
      page.goto(f"{base_url}/#/", wait_until="domcontentloaded")
      _apply_color_mode_dom(page, color_mode)
      _complete_onboarding(page, "Captura Design")
      _dismiss_banners(page)
      _apply_color_mode_dom(page, color_mode)

      page.goto(f"{base_url}/#/dungeon", wait_until="domcontentloaded")
      _wait_dungeon(page, "acampamento")
      _dismiss_banners(page)
      _shot(page, out_dir / f"01-acampamento-{suffix}.png")

      page.goto(f"{base_url}/#/dungeon/ficha/lyra", wait_until="domcontentloaded")
      _wait_dungeon(page, "ficha")
      _dismiss_banners(page)
      _shot(page, out_dir / f"02-grimorio-ficha-lyra-{suffix}.png")

      page.goto(f"{base_url}/#/dungeon/mesa/vila-nova", wait_until="domcontentloaded")
      _wait_dungeon(page, "mesa")
      page.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=15000)
      _dismiss_banners(page)
      _set_viewer_gm(page)
      page.wait_for_timeout(300)
      _shot(page, out_dir / f"03-mesa-gm-vila-nova-{suffix}.png")

      _set_viewer_player(page)
      page.wait_for_timeout(300)
      _shot(page, out_dir / f"04-mesa-jogador-vila-nova-{suffix}.png")

      page.goto(f"{base_url}/#/dungeon/mestre/vila-nova", wait_until="domcontentloaded")
      _wait_dungeon(page, "mestre")
      _dismiss_banners(page)
      _shot(page, out_dir / f"05-escudo-mestre-vila-nova-{suffix}.png")

      page.goto(f"{base_url}/#/dungeon/mesa/floresta-de-vidro", wait_until="domcontentloaded")
      _wait_dungeon(page, "mesa")
      page.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=15000)
      _dismiss_banners(page)
      _shot(page, out_dir / f"06-mesa-floresta-de-vidro-{suffix}.png")

      if errors:
          (out_dir / f"_console-errors-{suffix}.txt").write_text(
              "\n".join(errors), encoding="utf-8"
          )
  finally:
      ctx.close()


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--base-url", default="http://127.0.0.1:8080")
  parser.add_argument(
      "--themes",
      default="dark,light",
      help="Temas separados por vírgula (vox-color-mode): dark, light",
  )
  args = parser.parse_args()
  themes = [t.strip() for t in args.themes.split(",") if t.strip() in ("dark", "light")]
  if not themes:
      themes = ["dark", "light"]

  stamp = dt.date.today().isoformat()
  capture_root = _ROOT / "docs" / "design" / "stitch-captures"
  out_dir = capture_root / f"dungeon-ui-{stamp}"
  out_dir.mkdir(parents=True, exist_ok=True)
  for stale in out_dir.glob("*.png"):
      stale.unlink()

  readme = f"""Dungeon UI — capturas para o design ({stamp})
Base: {args.base_url}

Arquivos (cada tela × viewport × tema):
  01-acampamento-*          #/dungeon (Z5)
  02-grimorio-ficha-lyra-*  #/dungeon/ficha/lyra
  03-mesa-gm-*              #/dungeon/mesa/vila-nova (visão Mestre)
  04-mesa-jogador-*         #/dungeon/mesa/vila-nova (visão Jogador)
  05-escudo-mestre-*        #/dungeon/mestre/vila-nova (Z4)
  06-mesa-floresta-*        #/dungeon/mesa/floresta-de-vidro

Sufixo final: desktop-1440x900-<dark|light> ou mobile-390x844-<dark|light>
Chave tema: localStorage `vox-color-mode` + data-color-mode no <html>
Refs: docs/specs/mesa-ui-brainstorm-v0.md · docs/design/sovereign-agora.md
"""
  (out_dir / "README.txt").write_text(readme, encoding="utf-8")

  viewports = (
      ("desktop-1440x900", {"width": 1440, "height": 900}),
      ("mobile-390x844", {"width": 390, "height": 844}),
  )

  with sync_playwright() as pw:
      browser = pw.chromium.launch(
          headless=True,
          args=["--disable-features=WebRtcHideLocalIpsWithMdns", "--no-sandbox"],
      )
      try:
          base = args.base_url.rstrip("/")
          for theme in themes:
              for vp_tag, vp in viewports:
                  _capture_set(browser, base, out_dir, vp, vp_tag, theme)
      finally:
          browser.close()

  zip_path = capture_root / f"dungeon-ui-{stamp}.zip"
  if zip_path.exists():
      zip_path.unlink()
  with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
      for f in sorted(out_dir.iterdir()):
          if f.is_file():
              zf.write(f, arcname=f"{out_dir.name}/{f.name}")

  png_count = len(list(out_dir.glob("*.png")))
  print(f"OK: {out_dir}")
  print(f"ZIP: {zip_path}")
  print(f"PNGs: {png_count} (themes: {','.join(themes)})")


if __name__ == "__main__":
  main()