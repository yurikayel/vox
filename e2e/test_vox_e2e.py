"""E2E em Chromium real (Playwright): entrada, rotas, assistentes e malha de dois navegadores.

Toda rede de fora é bloqueada (`_new_isolated_page`); só o servidor estático local e a sinalização local
respondem. Não roda no CI (pede Playwright para Python): `npm run test:e2e`, com `pip install playwright` e
`python -m playwright install chromium`.
"""

import functools
import http.server
import json
import os
import pathlib
import socket
import socketserver
import subprocess
import sys
import threading
import re
import time
import unittest
import urllib.request

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
CLIENT_DIR = ROOT / "client"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
    }

    def log_message(self, format, *args):
        return


class _QuietServer(socketserver.ThreadingTCPServer):
    def handle_error(self, request, client_address):
        """O Chromium fecha conexões no meio ao recarregar: não é falha do teste."""
        if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


def _start_static_server():
    handler = functools.partial(_QuietHandler, directory=str(CLIENT_DIR))
    httpd = _QuietServer(("127.0.0.1", 0), handler)
    httpd.daemon_threads = True
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, f"http://127.0.0.1:{port}"


def _free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _start_ws_signaling():
    port = _free_port()
    proc = subprocess.Popen(
        [sys.executable, "-u", "relay/signaling.py", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    deadline = time.time() + 10.0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1) as resp:
                if resp.status == 200:
                    return proc, f"ws://127.0.0.1:{port}"
        except Exception:
            time.sleep(0.15)
    proc.terminate()
    raise RuntimeError("Timeout aguardando relay/signaling.py")


def _new_isolated_page(browser, base_url, signaling_cfg=None, viewport=None):
    ctx = browser.new_context(
        service_workers="block",
        viewport=viewport or {"width": 1280, "height": 840},
    )
    cfg = signaling_cfg or {
        "signalingUrls": [],
        "nostrRelays": [],
        "nostrSignaling": {"enabled": False},
        "stun": [],
        "turn": [],
    }
    errors, external_hits = [], []

    def _route(route):
        url = route.request.url
        if url.endswith("/config/signaling.json"):
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(cfg))
        if url.endswith("/config/oauth.json"):
            return route.fulfill(status=200, content_type="application/json", body="{}")
        if url.startswith(base_url):
            return route.continue_()
        external_hits.append(url)
        return route.abort()

    ctx.route("**/*", _route)
    page = ctx.new_page()
    page.on("pageerror", lambda err: errors.append(str(err)))
    return ctx, page, errors, external_hits


def _close_ctx(ctx):
    try:
        ctx.unroute_all(behavior="ignoreErrors")
    except Exception:
        pass
    ctx.close()


_APP_READY_JS = "() => !!document.querySelector('#app-root')?.firstElementChild"


def _wait_app_ready(page):
    """Espera o primeiro render do shell (`#app-root` com conteúdo) após o boot a frio.

    O boot carrega centenas de módulos ES; sob carga ele dominava os timeouts de 15 s
    dos passos seguintes. Esta espera isola o boot numa condição real, sem alongar prazo.
    """
    page.wait_for_function(_APP_READY_JS, timeout=15000)


def _goto_ready(page, url):
    """`goto` seguido de `_wait_app_ready`: use antes da primeira interação numa página nova."""
    page.goto(url, wait_until="domcontentloaded")
    _wait_app_ready(page)


def _complete_onboarding(page, display_name, errors=None):
    enter_btn = page.locator("#btn-read-first-enter")
    try:
        enter_btn.wait_for(state="visible", timeout=15000)
    except Exception as exc:
        body = page.locator("#app-root").inner_html() if page.locator("#app-root").count() else page.content()[:400]
        raise RuntimeError(f"Onboarding não montou ({exc}); errors={errors}; html={body[:300]}") from exc
    enter_btn.click()
    name_in = page.locator("#oauth-custom-name-input")
    name_in.wait_for(state="visible", timeout=15000)
    name_in.fill(display_name)
    page.locator("#btn-oauth-save-name").click()
    age_box = page.locator("#pact-age-18")
    accept_btn = page.locator("#btn-pact-accept")
    age_box.wait_for(state="visible", timeout=15000)
    age_box.check()
    accept_btn.click()
    page.locator("#feed-inline-composer").wait_for(state="visible", timeout=15000)


class PlaywrightE2EHarness(unittest.TestCase):
    """Servidor estático + Chromium compartilhado para suítes E2E."""

    @classmethod
    def setUpClass(cls):
        cls.httpd, cls.base_url = _start_static_server()
        cls.pw = sync_playwright().start()
        exe = os.environ.get("CHROMIUM_EXECUTABLE_PATH")
        launch_kw = {
            "headless": True,
            "args": ["--disable-features=WebRtcHideLocalIpsWithMdns", "--no-sandbox"],
        }
        if exe:
            launch_kw["executable_path"] = exe
        cls.browser = cls.pw.chromium.launch(**launch_kw)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.httpd.shutdown()
        cls.httpd.server_close()


class VoxPlaywrightE2ETests(PlaywrightE2EHarness):
    """Cobre fluxos críticos do PWA Vox em Chromium headless real."""

    def test_01_onboarding_inline_post_and_idb_reload(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            _goto_ready(page, f"{self.base_url}/#/")
            _complete_onboarding(page, "Alice E2E")
            page.locator("#feed-inline-composer .inline-composer-collapsed").click()
            marker = f"E2E-Post-{int(time.time())}"
            page.locator("#inline-topic-body").fill(f"Mutirão na praça {marker} #bairro")
            page.locator("#btn-inline-submit").click()
            mesh_btn = page.locator("#btn-permanence-mesh")
            if mesh_btn.is_visible():
                mesh_btn.click()
            page.locator("article", has_text=marker).wait_for(state="visible", timeout=15000)
            page.reload(wait_until="domcontentloaded")
            page.locator("article", has_text=marker).wait_for(state="visible", timeout=15000)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02_civic_routes_drawer_search_and_theme(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            _goto_ready(page, f"{self.base_url}/#/")
            _complete_onboarding(page, "Bruno Rotas", errors)
            page.locator("#agora-identity-toggle").click()
            page.locator("#agora-identity-drawer").wait_for(state="visible", timeout=5000)
            page.locator("#agora-drawer-close").click()
            page.locator("#theme-mode-toggle").click()
            routes = [
                ("#/communities", "h1, h2"),
                ("#/c/demo-feira-local", "h1, h2"),
                ("#/people", "h1, h2"),
                ("#/dm", "h1, h2"),
                ("#/voxpedia", ".voxpedia-hero"),
                ("#/status", "h1, h2"),
                ("#/settings/network", "h1, h2"),
                ("#/wallet", "h1, h2"),
                ("#/labs/mofn", "h1, h2"),
                ("#/rota-inexistente-e2e", "h1, h2"),
            ]
            for route_hash, sel in routes:
                page.goto(f"{self.base_url}/{route_hash}", wait_until="domcontentloaded")
                page.locator(sel).first.wait_for(state="visible", timeout=10000)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def _roll_until_at_least(self, page, minimum, tries=80):
        for _ in range(tries):
            page.locator("button[data-dungeon='roll-d20']:not([data-hud-shortcut])").click()
            text = page.locator(".dungeon-dice-tray").inner_text()
            match = re.search(r"d20 = (\d+)", text)
            if match and int(match.group(1)) >= minimum:
                return int(match.group(1))
        self.fail(f"d20 não chegou a {minimum} em {tries} rolagens")

    def _run_dungeon_camp_and_table(self, page):
        page.locator("#voxpedia-tecnico summary", has_text="Testes e release").click()
        page.locator("#voxpedia-tecnico summary", has_text="Docs no repositório").click()
        page.locator("a[href='#/dungeon']").click()
        page.locator(".dungeon-sanctum").wait_for(state="visible", timeout=10000)
        self.assertEqual(page.locator("#app-sidebar").count(), 0)
        self.assertIn("DEMONSTRAÇÃO", page.locator(".dungeon-fiction-badge").inner_text())
        self.assertIn("esta mesa é uma demonstração", page.locator(".dungeon-demo-note").inner_text())
        page.locator("#dungeon-fav-slider").fill("80")
        page.locator("#dungeon-fav-slider").dispatch_event("input")
        self.assertIn("80%", page.locator(".dungeon-slider-labels").inner_text())
        page.locator("button[data-dungeon='failover']").click()
        self.assertIn("Falha simulada", page.locator(".dungeon-inline-status").inner_text())
        page.locator(".dungeon-topnav a[href^='#/dungeon/mesa/']").click()
        page.locator("button[data-dungeon='chip']").first.click()
        page.locator("button[data-dungeon='submit-action']").click()
        chronicle = page.locator(".dungeon-chronicle-list").inner_text()
        self.assertIn("Roteiro", chronicle)
        self.assertNotIn("IA Local", chronicle)
        self.assertNotIn("Sabiá", chronicle)
        self._roll_until_at_least(page, 15)
        # A mini-grade 5×5 fica num <details> fechado desde o redesenho da Mesa: abrir antes de clicar no altar.
        page.locator("details[data-dungeon-details='legacy-grid'] > summary").click()
        page.locator("button[data-dungeon='grid-cell'][data-x='3'][data-y='1']").click()
        page.locator(".dungeon-unlocked-banner").wait_for(state="visible", timeout=10000)
        self.assertIn("Aberto com 3 de 5 partes", page.locator(".dungeon-unlocked-banner").inner_text())

    def test_03_ai_social_dungeon_honest_demo_screens_and_exit(self):
        ctx, page, errors, external = _new_isolated_page(self.browser, self.base_url)
        try:
            _goto_ready(page, f"{self.base_url}/#/")
            _complete_onboarding(page, "Lyra E2E", errors)
            page.goto(f"{self.base_url}/#/voxpedia", wait_until="domcontentloaded")
            self._run_dungeon_camp_and_table(page)
            external.clear()
            page.goto(f"{self.base_url}/#/dungeon/mesa/floresta-de-vidro", wait_until="domcontentloaded")
            # Mudar só o hash não recarrega a página: esperar a rota remontar em vez de ler o título da mesa anterior.
            expect(page.locator(".dungeon-scene-caption h1")).to_contain_text("Floresta de Vidro", timeout=10000)
            page.locator(".dungeon-topnav a[href^='#/dungeon/ficha/']").click()
            page.locator("button[data-dungeon='spend-10']").click()
            page.locator("label[for='sheet-tab-about']").click()
            # O teste de gasto além do saldo mora em "Para conferir: como a ficha é guardada", um <details> fechado por padrão.
            page.locator("details[data-dungeon-details='sheet-audit'] > summary").click()
            page.locator("button[data-dungeon='test-overdraft']").click()
            self.assertIn("gasto além do saldo", page.locator(".dungeon-alert-warn").inner_text())
            page.locator("button[data-dungeon='confirm-lore']").first.click()
            self.assertIn("Fato Confirmado", page.locator(".dungeon-lore-grid").inner_text())
            page.locator(".dungeon-topnav a[href^='#/dungeon/mestre/']").click()
            page.locator(".dungeon-sanctum[data-dungeon-screen='mestre']").wait_for(state="visible", timeout=10000)
            dm = page.locator(".dungeon-main").inner_text()
            self.assertIn("Roteiro fixo, sem IA", dm)
            self.assertEqual(page.locator("button[data-dungeon='brain-maritaca']").count(), 0)
            page.locator("button[data-dungeon='inspect-role'][data-role='STAGE1_LORE_RAG']").click()
            self.assertTrue(page.locator("button[data-dungeon='unlock-vault']").is_disabled())
            self.assertEqual(external, [])
            page.locator("a.dungeon-exit-link").click()
            page.locator("#app-sidebar").wait_for(state="visible", timeout=10000)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_04_mobile_viewport_dungeon_dock_and_overflow(self):
        ctx, page, errors, _ = _new_isolated_page(
            self.browser, self.base_url, viewport={"width": 390, "height": 844}
        )
        try:
            _goto_ready(page, f"{self.base_url}/#/")
            _complete_onboarding(page, "Mobile E2E")
            page.goto(f"{self.base_url}/#/dungeon", wait_until="domcontentloaded")
            page.locator(".dungeon-mobile-dock").wait_for(state="visible", timeout=10000)
            self.assertFalse(page.locator(".dungeon-topnav").is_visible())
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            self.assertLessEqual(overflow, 1)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_05_two_peers_webrtc_mesh_post_sync(self):
        proc, ws_url = _start_ws_signaling()
        cfg = {
            "signalingUrls": [ws_url],
            "nostrRelays": [],
            "nostrSignaling": {"enabled": False},
            "stun": [],
            "turn": [],
        }
        ctx_a, page_a, err_a, _ = _new_isolated_page(self.browser, self.base_url, cfg)
        ctx_b, page_b, err_b, _ = _new_isolated_page(self.browser, self.base_url, cfg)
        try:
            _goto_ready(page_a, f"{self.base_url}/#/")
            _goto_ready(page_b, f"{self.base_url}/#/")
            _complete_onboarding(page_a, "Peer Alice")
            _complete_onboarding(page_b, "Peer Bruno")
            page_a.wait_for_function(
                "JSON.parse(localStorage.getItem('vox-signaling-telemetry-v1') || '{}')?.peers?.ws?.ok >= 1",
                timeout=20000,
            )
            marker = f"p2p-pw-{int(time.time())}"
            page_a.locator("#feed-inline-composer .inline-composer-collapsed").click()
            page_a.locator("#inline-topic-body").fill(f"Sincronia real {marker} #e2e")
            page_a.locator("#btn-inline-submit").click()
            mesh_btn = page_a.locator("#btn-permanence-mesh")
            if mesh_btn.is_visible():
                mesh_btn.click()
            page_b.locator("article", has_text=marker).wait_for(state="visible", timeout=20000)
            self.assertEqual(err_a + err_b, [])
        finally:
            _close_ctx(ctx_a)
            _close_ctx(ctx_b)
            proc.terminate()
            proc.wait(timeout=5)

    def test_06_stepped_wizards_and_open_frames_lab(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            _goto_ready(page, f"{self.base_url}/#/")
            _complete_onboarding(page, "Clara Assistentes", errors)
            for route_hash, sel in [
                ("#/compose/proposal", "#prop-title"),
                ("#/compose/community", "#comm-title"),
                ("#/settings/network/guia", ".compose-step"),
                ("#/backup", "[data-step-required]"),
                ("#/wallet/guia", "#wg-mode"),
                ("#/labs/frames", "#labs-frame-host iframe"),
            ]:
                page.evaluate("(h) => { location.hash = h; }", route_hash)
                page.locator(sel).first.wait_for(state="visible", timeout=10000)
            unexpected = [e for e in errors if "Service worker is disabled" not in e]
            self.assertEqual(unexpected, [])
        finally:
            _close_ctx(ctx)
