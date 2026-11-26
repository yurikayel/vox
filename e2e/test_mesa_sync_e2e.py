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

from test_mesa_ttrpg_e2e import _goto_mesa, _join_as_player, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

SYNC_TIMEOUT = 12000
_TABLE_NAMES_JS = """async () => {
  const m = await import('/js/dungeon/dungeon-state.js');
  const st = m.getDungeonSession();
  const scenes = Object.values(st.campaignDoc?.scenesById || {});
  const texts = [...(st.campaignDoc?.rolls || []), ...(st.campaignDoc?.chronicle || [])];
  return { tokens: scenes.flatMap((sc) => sc.tokens.map((t) => t.name)), texts: JSON.stringify(texts), err: st.rollError || '' };
}"""


def _generate_invite(page_gm, base_url, table_id):
    """Gera o convite P2P na tela do Mestre e devolve a URL absoluta."""
    _goto_ready(page_gm, f"{base_url}/#/dungeon/mestre/{table_id}")
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


def _player_memory(page):
    """Lê o estado em memória da aba do jogador: nomes de tokens, rolagens/crônica e último erro."""
    return page.evaluate(_TABLE_NAMES_JS)


def _watch_errors(page, errors):
    """Coleta `pageerror` e erros de `console` (ignora `net::ERR_*` de relays locais desligados)."""
    page.on("pageerror", lambda err: errors.append(str(err)))
    page.on(
        "console",
        lambda m: m.type == "error" and "net::ERR_" not in m.text and errors.append(m.text),
    )


def _drag_cell(page, src, dst):
    """Arrasta de uma célula (x, y) a outra no canvas, após resetar a câmera."""
    canvas = page.locator("#dungeon-vtt-canvas")
    canvas.scroll_into_view_if_needed()
    page.locator("button[data-dungeon='canvas-reset']").click()
    box = canvas.bounding_box()
    page.mouse.move(box["x"] + (src[0] + 0.5) * 64, box["y"] + (src[1] + 0.5) * 64)
    page.mouse.down()
    page.mouse.move(box["x"] + (dst[0] + 0.5) * 64, box["y"] + (dst[1] + 0.5) * 64, steps=12)
    page.mouse.up()


class MesaSyncPlaywrightE2ETests(PlaywrightE2EHarness):
    """Fluxos Mestre↔jogador da mesa Subversus."""

    def _open_pair(self, name):
        """Mestre com mesa aberta + segunda aba como jogador já conectada ao snapshot."""
        ctx, gm, errors, hits = _new_isolated_page(self.browser, self.base_url)
        _watch_errors(gm, errors)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        player = ctx.new_page()
        _watch_errors(player, errors)
        _join_as_player(player, invite)
        return ctx, gm, player, errors

    def test_01_gm_creates_campaign_and_opens_table(self):
        ctx, gm, errors, _ = _new_isolated_page(self.browser, self.base_url)
        _watch_errors(gm, errors)
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
        ctx, gm, player, errors = self._open_pair("Sync Join")
        try:
            expect(player.locator(".dungeon-sanctum")).to_have_class(re.compile(r"\bis-session-player\b"))
            _add_token(gm, "AlvoSincronizado", "player")
            expect(player.locator(".dungeon-token-roster")).to_contain_text("AlvoSincronizado", timeout=SYNC_TIMEOUT)
            self.assertIn("AlvoSincronizado", _player_memory(player)["tokens"])
            self.assertEqual(player.locator("form[data-dungeon='add-token-form']").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    @unittest.skip(
        "NOT RUN: a UI não permite dar a um jogador um token próprio (sem form de token para jogador "
        "e sem atribuir dono); tokens criados pelo Mestre pertencem à rota dele e canPlayerMoveToken "
        "exige ownerRouteId == ator."
    )
    def test_03_player_moves_own_token_and_gm_sees_it(self):
        """Cenário 3 — NOT RUN (ver `skip`); a recusa está coberta em test_03b."""

    def test_03b_player_cannot_move_token_owned_by_gm(self):
        ctx, gm, player, errors = self._open_pair("Sync Move")
        try:
            _add_token(gm, "PeaoDoMestre", "player")
            roster = player.locator(".dungeon-token-roster")
            expect(roster).to_contain_text("PeaoDoMestre (1,1)", timeout=SYNC_TIMEOUT)
            self.assertEqual(_player_memory(player)["err"], "")
            _drag_cell(gm, (1, 1), (4, 1))  # controle: o mesmo gesto, feito pelo Mestre, move o token
            expect(roster).to_contain_text("PeaoDoMestre (4,1)", timeout=SYNC_TIMEOUT)
            _drag_cell(player, (4, 1), (6, 1))
            player.wait_for_function(
                "async () => (await import('/js/dungeon/dungeon-state.js')).getDungeonSession().rollError.includes('recusada')"
            )
            expect(roster).to_contain_text("PeaoDoMestre (4,1)")
            expect(gm.locator(".dungeon-token-roster")).to_contain_text("PeaoDoMestre (4,1)")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_04_gm_layer_token_never_reaches_player(self):
        ctx, gm, player, errors = self._open_pair("Sync Spoiler")
        try:
            expect(gm.locator(".dungeon-token-roster")).to_contain_text("Sentinela da Cripta [GM]")
            _add_token(gm, "EmboscadaSecreta", "gm")
            _add_token(gm, "VigiaPublico", "player")
            roster = player.locator(".dungeon-token-roster")
            expect(roster).to_contain_text("VigiaPublico", timeout=SYNC_TIMEOUT)
            memory = _player_memory(player)["tokens"]
            self.assertIn("VigiaPublico", memory)
            for hidden in ("EmboscadaSecreta", "Sentinela da Cripta"):
                self.assertNotIn(hidden, memory)
                self.assertNotIn(hidden, player.content())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_05_public_roll_shows_in_both_chronicles(self):
        ctx, gm, player, errors = self._open_pair("Sync Roll")
        try:
            _submit_roll(gm, "/gmroll 1d20 # SegredoDoMestre")
            expect(gm.locator(".dungeon-chronicle-list")).to_contain_text("SegredoDoMestre", timeout=SYNC_TIMEOUT)
            _submit_roll(gm, "1d20+2 # RolagemPublica")
            expect(gm.locator(".dungeon-chronicle-list")).to_contain_text("RolagemPublica", timeout=SYNC_TIMEOUT)
            expect(player.locator(".dungeon-chronicle-list")).to_contain_text("RolagemPublica", timeout=SYNC_TIMEOUT)
            self.assertNotIn("SegredoDoMestre", player.locator(".dungeon-chronicle-list").inner_text())
            self.assertNotIn("SegredoDoMestre", _player_memory(player)["texts"])
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


if __name__ == "__main__":
    unittest.main()
