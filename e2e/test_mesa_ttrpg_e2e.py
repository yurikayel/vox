"""E2E Playwright — Mesa Soberana / VTT (#/dungeon): UI E5, mapa, dados e campanha.

Herda o servidor estático e o Chromium de `test_vox_e2e.py`.
Execução: `npm run test:e2e` (filtra com `python -m unittest e2e.test_mesa_ttrpg_e2e`).
"""

import pathlib
import re
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _complete_onboarding, _goto_ready, _new_isolated_page


def _goto_mesa(page, base_url, table_id="vila-nova"):
    _goto_ready(page, f"{base_url}/#/dungeon/mesa/{table_id}")
    page.locator(".dungeon-sanctum[data-dungeon-screen='mesa']").wait_for(state="visible", timeout=15000)
    page.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=10000)


def _set_viewer_player(page):
    """Alterna até a etiqueta de jogador (default mesa sem prefs já é jogador)."""
    toggle = page.locator("button[data-dungeon='toggle-viewer-role']")
    for _ in range(4):
        if "Jogador" in toggle.inner_text():
            return
        toggle.click()
        page.wait_for_timeout(120)
    raise AssertionError("Não foi possível ativar visão de jogador")


def _set_viewer_gm(page):
    """Alterna até visão de mestre (prefs novas na mesa iniciam como jogador)."""
    toggle = page.locator("button[data-dungeon='toggle-viewer-role']")
    for _ in range(4):
        if "Mestre" in toggle.inner_text():
            return
        toggle.click()
        page.wait_for_timeout(120)
    raise AssertionError("Não foi possível ativar visão de mestre")


def _onboard_and_campaign(page, base_url, display_name, campaign_name="E2E Mesa Audit"):
    _goto_ready(page, f"{base_url}/#/")
    _complete_onboarding(page, display_name)
    page.goto(f"{base_url}/#/dungeon", wait_until="domcontentloaded")
    page.locator(".dungeon-sanctum[data-dungeon-screen='acampamento']").wait_for(state="visible", timeout=15000)
    name_input = page.locator("#dungeon-campaign-name")
    if name_input.is_visible():
        name_input.fill(campaign_name)
        page.locator("form[data-dungeon='create-campaign-form']").evaluate("f => f.requestSubmit()")
        page.wait_for_timeout(600)
    mesa_link = page.locator(".dungeon-topnav a[href^='#/dungeon/mesa/']").first
    href = mesa_link.get_attribute("href") or "#/dungeon/mesa/vila-nova"
    table_id = href.rstrip("/").split("/")[-1]
    return table_id


def _import_shared_handout_md(page, title="E2E Handout"):
    """Importa nota .md na campanha ativa (visibilidade compartilhada por padrão do reducer)."""
    body = f"# {title}\n\nTexto público do handout E2E.\n"
    page.locator("#dungeon-import-file").set_input_files(
        {"name": f"{title}.md", "mimeType": "text/markdown", "buffer": body.encode("utf-8")}
    )
    page.wait_for_timeout(800)


class MesaTTRPGPlaywrightE2ETests(PlaywrightE2EHarness):
    """Fluxos de UI do laboratório AI Social Dungeon / Mesa Soberana."""

    def test_07_mesa_e5_player_chrome_drawer_and_styles(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa Player E2E", errors)
            _goto_mesa(page, self.base_url)
            self.assertTrue(page.locator("link#dungeon-layout-stylesheet").count() > 0)
            _set_viewer_player(page)
            sanctum = page.locator(".dungeon-sanctum")
            expect(sanctum).to_have_class(re.compile(r"\bis-session-player\b"))
            expect(sanctum).to_have_attribute("data-dungeon-ui-mode", "player_session")
            self.assertEqual(page.locator(".dungeon-topnav a[href^='#/dungeon/mestre/']").count(), 0)
            self.assertEqual(page.locator(".dungeon-mobile-dock a[href^='#/dungeon/mestre/']").count(), 0)
            page.locator(".dungeon-map-hero").wait_for(state="visible", timeout=5000)
            page.locator(".dungeon-z3-drawer").wait_for(state="visible", timeout=5000)
            self.assertTrue(page.locator("#dungeon-roll-input").is_visible())
            self.assertTrue(page.locator(".dungeon-dice-tray").is_visible())
            self.assertEqual(page.locator("form[data-dungeon='add-token-form']").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_08_mesa_gm_canvas_zoom_and_formula_roll(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa GM E2E", errors)
            _goto_mesa(page, self.base_url)
            _set_viewer_gm(page)
            expect(page.locator(".dungeon-sanctum")).to_have_class(re.compile(r"\bis-session-gm\b"))
            page.locator("button[data-dungeon='canvas-zoom-in']").click()
            page.locator("button[data-dungeon='canvas-reset']").click()
            canvas = page.locator("#dungeon-vtt-canvas")
            canvas.scroll_into_view_if_needed()
            box = canvas.bounding_box()
            assert box is not None
            before = page.locator(".dungeon-token-roster").inner_text()
            page.mouse.move(box["x"] + 2.5 * 64, box["y"] + 3.5 * 64)
            page.mouse.down()
            page.mouse.move(box["x"] + 5.5 * 64, box["y"] + 3.5 * 64, steps=12)
            page.mouse.up()
            page.wait_for_timeout(200)
            after = page.locator(".dungeon-token-roster").inner_text()
            self.assertIn("Lyra (", after)
            self.assertNotEqual(before, after)
            page.locator("button[data-dungeon='calendar-round']").click()
            expect(page.locator(".dungeon-clock-readout")).to_contain_text("08:00:06")
            page.locator("#dungeon-roll-input").fill("1d20+1 # e2e")
            page.locator("form[data-dungeon='roll-formula-form']").evaluate("f => f.requestSubmit()")
            status = page.locator(".dungeon-dice-tray .dungeon-inline-status")
            status.wait_for(state="visible", timeout=8000)
            self.assertIn("=", status.inner_text())
            page.locator("#dungeon-action-input").fill("Exploro o corredor com tocha")
            page.locator("button[data-dungeon='submit-action']").click()
            self.assertIn("Exploro", page.locator(".dungeon-chronicle-list").inner_text())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_09_mesa_camp_calendar_and_four_routes(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa Camp E2E", errors)
            page.goto(f"{self.base_url}/#/dungeon", wait_until="domcontentloaded")
            page.locator(".dungeon-sanctum[data-dungeon-screen='acampamento']").wait_for(
                state="visible", timeout=10000
            )
            name_input = page.locator("#dungeon-campaign-name")
            if name_input.is_visible():
                name_input.fill("E2E Campanha Mesa")
                page.locator("form[data-dungeon='create-campaign-form']").evaluate("f => f.requestSubmit()")
                page.wait_for_timeout(400)
            cal_btn = page.locator("button[data-dungeon='calendar-round']")
            if cal_btn.is_visible():
                cal_btn.click()
                page.wait_for_timeout(200)
            for tab_sel in [
                ".dungeon-topnav a[href='#/dungeon']",
                ".dungeon-topnav a[href^='#/dungeon/mesa/']",
                ".dungeon-topnav a[href^='#/dungeon/ficha/']",
                ".dungeon-topnav a[href^='#/dungeon/mestre/']",
            ]:
                page.locator(tab_sel).click()
                page.locator(".dungeon-main").wait_for(state="visible", timeout=10000)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_10_mesa_mobile_player_dock_no_mestre(self):
        ctx, page, errors, _ = _new_isolated_page(
            self.browser, self.base_url, viewport={"width": 390, "height": 844}
        )
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa Mobile E2E")
            _goto_mesa(page, self.base_url)
            _set_viewer_player(page)
            dock = page.locator(".dungeon-mobile-dock")
            dock.wait_for(state="visible", timeout=10000)
            self.assertEqual(dock.locator("a[href^='#/dungeon/mestre/']").count(), 0)
            dice_panel = page.locator("details.dungeon-drawer-segment").nth(1)
            dice_panel.evaluate("el => { el.open = true; }")
            page.locator("#dungeon-roll-input").wait_for(state="visible", timeout=8000)
            overflow = page.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            self.assertLessEqual(overflow, 4)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_11_mesa_ficha_grimorio_and_levelup(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa Grimório E2E", errors)
            page.goto(f"{self.base_url}/#/dungeon/ficha/lyra", wait_until="domcontentloaded")
            page.locator(".dungeon-sanctum[data-dungeon-screen='ficha']").wait_for(
                state="visible", timeout=10000
            )
            self.assertIn("Lyra", page.locator(".dungeon-sheet-hero h1").inner_text())
            page.locator("button[data-dungeon='spend-10']").click()
            # A Crônica @tag mora na aba "Sobre"; as abas são rádios estilizados.
            page.locator("label[for='sheet-tab-about']").click()
            page.locator("button[data-dungeon='confirm-lore']").first.click()
            self.assertIn("Fato Confirmado", page.locator(".dungeon-lore-grid").inner_text())
            level_btn = page.locator("button[data-dungeon='level-up-open']")
            level_btn.wait_for(state="visible", timeout=5000)
            level_btn.click()
            wizard = page.locator("section[aria-label='Assistente de nível']")
            wizard.wait_for(state="visible", timeout=5000)
            self.assertIn("Subir de Nível", wizard.inner_text())
            page.locator("button[data-dungeon='select-levelup-preset'][data-preset='tormenta20']").click()
            page.locator("button[data-dungeon='level-up']").click()
            expect(page.locator(".dungeon-sheet-hero")).to_contain_text("Nível 2")
            page.locator("label[for='sheet-tab-items']").click()
            page.locator("#dungeon-item-label").fill("Tocha de Alquimia")
            page.locator("form[data-dungeon='add-item-form']").evaluate("f => f.requestSubmit()")
            expect(page.locator("section[aria-label='Inventário da ficha']")).to_contain_text("Tocha de Alquimia")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_12_mestre_generate_invite_href(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            table_id = _onboard_and_campaign(page, self.base_url, "Mesa Invite E2E")
            page.goto(f"{self.base_url}/#/dungeon/mestre/{table_id}", wait_until="domcontentloaded")
            page.locator(".dungeon-sanctum[data-dungeon-screen='mestre']").wait_for(state="visible", timeout=10000)
            page.locator("button[data-dungeon='generate-invite']").click()
            page.wait_for_timeout(500)
            pre = page.locator("pre.dungeon-prompt-preview").filter(has_text="#/dungeon/entrar/")
            pre.wait_for(state="visible", timeout=8000)
            invite = pre.inner_text().strip()
            self.assertIn("#/dungeon/entrar/", invite)
            self.assertIn("#k=", invite)
            self.assertIn("gm=", invite)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_13_p2p_join_two_contexts_same_origin(self):
        """Join P2P na mesma origem (BroadcastChannel exige mesmo browser context)."""
        ctx_gm, page_gm, errors_gm, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            table_id = _onboard_and_campaign(page_gm, self.base_url, "Mesa Join GM")
            page_gm.goto(f"{self.base_url}/#/dungeon/mestre/{table_id}", wait_until="domcontentloaded")
            page_gm.locator("button[data-dungeon='generate-invite']").click()
            page_gm.wait_for_timeout(400)
            invite = (
                page_gm.locator("pre.dungeon-prompt-preview")
                .filter(has_text="#/dungeon/entrar/")
                .inner_text()
                .strip()
            )
            self.assertIn("#/dungeon/entrar/", invite)
            page_gm.goto(f"{self.base_url}/#/dungeon/mesa/{table_id}", wait_until="domcontentloaded")
            page_gm.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=10000)
            page_pl = ctx_gm.new_page()
            join_url = invite if invite.startswith("http") else f"{self.base_url}{invite}"
            _goto_ready(page_pl, join_url)
            page_pl.locator(".dungeon-sanctum[data-dungeon-screen='mesa']").wait_for(state="visible", timeout=15000)
            expect(page_pl.locator(".dungeon-sanctum")).to_have_class(re.compile(r"\bis-session-player\b"))
            self.assertEqual(page_pl.locator(".dungeon-topnav a[href^='#/dungeon/mestre/']").count(), 0)
            self.assertEqual(page_pl.locator("form[data-dungeon='add-token-form']").count(), 0)
            page_gm.locator("#dungeon-roll-input").wait_for(state="visible", timeout=8000)
            page_gm.locator("#dungeon-roll-input").fill("1d20+2 # SyncAoVivo")
            page_gm.locator("form[data-dungeon='roll-formula-form']").evaluate("f => f.requestSubmit()")
            expect(page_pl.locator(".dungeon-chronicle-list")).to_contain_text("SyncAoVivo", timeout=12000)
            self.assertEqual(errors_gm, [])
        finally:
            _close_ctx(ctx_gm)

    def test_14_player_handouts_drawer_shared_note(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            _onboard_and_campaign(page, self.base_url, "Mesa Handout E2E", "E2E Handout Camp")
            _import_shared_handout_md(page, "Mapa do porão")
            _goto_mesa(page, self.base_url)
            _set_viewer_player(page)
            handouts = page.locator("details.dungeon-drawer-handouts, details.dungeon-drawer-segment").filter(
                has_text="Handouts"
            )
            handouts.evaluate("el => { el.open = true; }")
            stack = page.locator(".dungeon-handout-stack")
            stack.wait_for(state="visible", timeout=8000)
            self.assertIn("Mapa do porão", stack.inner_text())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_15_join_broadcast_channel_unavailable_message(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.add_init_script("delete globalThis.BroadcastChannel;")
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Mesa BC Fail E2E", errors)
            page.goto(
                f"{self.base_url}/#/dungeon/entrar/mesa-bc?gm=vx_gm#k=deadbeefdeadbeefdeadbeefdeadbeef",
                wait_until="domcontentloaded",
            )
            page.locator(".dungeon-sanctum[data-dungeon-screen='mesa']").wait_for(state="visible", timeout=15000)
            alert = page.locator(".dungeon-alert-warn")
            alert.wait_for(state="visible", timeout=8000)
            text = alert.inner_text()
            self.assertIn("BroadcastChannel", text)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


if __name__ == "__main__":
    unittest.main()