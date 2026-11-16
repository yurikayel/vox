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
import time
import unittest
import urllib.request

from playwright.sync_api import sync_playwright

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


class VoxPlaywrightE2ETests(unittest.TestCase):
    """Cobre fluxos críticos do PWA Vox em Chromium headless real."""

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

    def test_01_onboarding_inline_post_and_idb_reload(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
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
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
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
            page_a.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            page_b.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
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
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
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
