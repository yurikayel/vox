"""E2E Playwright — Subversus: sincronização P2P Mestre↔jogador e Zero-Spoiler (#/dungeon/mesa).

Duas abas do mesmo contexto (BroadcastChannel exige mesma origem e mesmo browser context).
Execução: `python -m unittest e2e.test_mesa_sync_e2e -v` (ou `npm run test:e2e`).
"""

import pathlib
import re
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_mesa_ttrpg_e2e import _goto_mesa, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

SYNC_TIMEOUT = 12000


def _generate_invite(page_gm, base_url, table_id):
    """Gera o convite P2P na tela do Mestre e devolve a URL absoluta."""
    page_gm.goto(f"{base_url}/#/dungeon/mestre/{table_id}", wait_until="domcontentloaded")
    page_gm.locator("button[data-dungeon='generate-invite']").click()
    pre = page_gm.locator("pre.dungeon-prompt-preview").filter(has_text="#/dungeon/entrar/")
    pre.wait_for(state="visible", timeout=8000)
    invite = pre.inner_text().strip()
    return invite if invite.startswith("http") else f"{base_url}{invite}"


def _add_token(page_gm, name, layer):
    """Adiciona token pelo formulário do Mestre (camada `player` ou `gm`)."""
    page_gm.locator("#dungeon-token-name").fill(name)
    page_gm.locator("#dungeon-token-layer").select_option(layer)
    page_gm.locator("form[data-dungeon='add-token-form']").evaluate("f => f.requestSubmit()")
    expect(page_gm.locator(".dungeon-token-roster")).to_contain_text(name)


def _submit_roll(page, formula):
    page.locator("#dungeon-roll-input").fill(formula)
    page.locator("form[data-dungeon='roll-formula-form']").evaluate("f => f.requestSubmit()")


class MesaSyncPlaywrightE2ETests(PlaywrightE2EHarness):
    """Fluxos Mestre↔jogador da mesa Subversus."""

    def _open_pair(self, name):
        """Mestre com mesa aberta + segunda aba como jogador já conectada ao snapshot."""
        ctx, gm, errors, hits = _new_isolated_page(self.browser, self.base_url)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        player = ctx.new_page()
        player.on("pageerror", lambda err: errors.append(str(err)))
        player.goto(invite, wait_until="domcontentloaded")
        player.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=15000)
        return ctx, gm, player, errors, hits

    def test_01_gm_creates_campaign_and_opens_table(self):
        ctx, gm, errors, hits = _new_isolated_page(self.browser, self.base_url)
        try:
            table_id = _onboard_and_campaign(gm, self.base_url, "Sync GM", "E2E Sync Camp")
            self.assertTrue(table_id)
            _goto_mesa(gm, self.base_url, table_id)
            _set_viewer_gm(gm)
            expect(gm.locator(".dungeon-sanctum")).to_have_class(re.compile(r"\bis-session-gm\b"))
            expect(gm.locator(".dungeon-token-roster")).to_contain_text("Lyra")
            self.assertEqual(gm.locator("form[data-dungeon='add-token-form']").count(), 1)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02_player_tab_joins_and_receives_snapshot(self):
        ctx, gm, player, errors, hits = self._open_pair("Sync Join")
        try:
            expect(player.locator(".dungeon-sanctum")).to_have_class(re.compile(r"\bis-session-player\b"))
            expect(player.locator(".dungeon-token-roster")).to_contain_text("Lyra", timeout=SYNC_TIMEOUT)
            self.assertEqual(player.locator("form[data-dungeon='add-token-form']").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    @unittest.skip(
        "NOT RUN: a UI não permite dar a um jogador um token próprio (sem form de token para jogador "
        "e sem atribuir dono); Lyra pertence à rota do Mestre e canPlayerMoveToken exige ownerRouteId == ator."
    )
    def test_03_player_moves_own_token_and_gm_sees_it(self):
        """Cenário 3 — NOT RUN (ver `skip`); a recusa está coberta em test_03b."""

    def test_03b_player_cannot_move_token_owned_by_gm(self):
        ctx, gm, player, errors, hits = self._open_pair("Sync Move")
        try:
            roster = player.locator(".dungeon-token-roster")
            expect(roster).to_contain_text("Lyra (2,3)", timeout=SYNC_TIMEOUT)
            canvas = player.locator("#dungeon-vtt-canvas")
            canvas.scroll_into_view_if_needed()
            player.locator("button[data-dungeon='canvas-reset']").click()
            box = canvas.bounding_box()
            player.mouse.move(box["x"] + 2.5 * 64, box["y"] + 3.5 * 64)
            player.mouse.down()
            player.mouse.move(box["x"] + 5.5 * 64, box["y"] + 3.5 * 64, steps=12)
            player.mouse.up()
            expect(roster.locator("[data-dungeon='select-token']").first).to_have_attribute("aria-pressed", "true")
            player.wait_for_timeout(1200)
            expect(roster).to_contain_text("Lyra (2,3)")
            expect(gm.locator(".dungeon-token-roster")).to_contain_text("Lyra (2,3)")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_04_gm_layer_token_never_reaches_player(self):
        ctx, gm, player, errors, hits = self._open_pair("Sync Spoiler")
        try:
            _add_token(gm, "EmboscadaSecreta", "gm")
            _add_token(gm, "VigiaPublico", "player")
            expect(gm.locator(".dungeon-token-roster")).to_contain_text("EmboscadaSecreta [GM]")
            roster = player.locator(".dungeon-token-roster")
            expect(roster).to_contain_text("VigiaPublico", timeout=SYNC_TIMEOUT)
            self.assertNotIn("EmboscadaSecreta", roster.inner_text())
            self.assertNotIn("Sentinela", roster.inner_text())
            self.assertNotIn("EmboscadaSecreta", player.content())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_05_public_roll_shows_in_both_chronicles(self):
        ctx, gm, player, errors, hits = self._open_pair("Sync Roll")
        try:
            expect(player.locator(".dungeon-token-roster")).to_contain_text("Lyra", timeout=SYNC_TIMEOUT)
            _submit_roll(gm, "1d20+2 # RolagemPublica")
            expect(gm.locator(".dungeon-chronicle-list")).to_contain_text("RolagemPublica", timeout=SYNC_TIMEOUT)
            expect(player.locator(".dungeon-chronicle-list")).to_contain_text("RolagemPublica", timeout=SYNC_TIMEOUT)
            self.assertNotIn("[Mestre]", player.locator(".dungeon-chronicle-list").inner_text())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


if __name__ == "__main__":
    unittest.main()
