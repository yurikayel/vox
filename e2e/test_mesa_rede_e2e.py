"""E2E Playwright — Mesa entre aparelhos pela rede (SUB-08): Mestre e jogador em DOIS contextos (sem `BroadcastChannel`).

Os dois contextos têm armazenamento separado, então a mesa só atravessa pelo transporte de rede: sinalização do relay
local em loopback (`relay/signaling.py`) e `RTCDataChannel` entre os dois Chromium. Flags de laboratório ligadas por
contexto (`vox.lab.mesa-rede`, `vox.lab.mesa-rede.url`, `vox.lab.fairplay`). App só local, sem tráfego externo.
Execução: `python -m unittest e2e.test_mesa_rede_e2e -v` (ou `npm run test:e2e`). Sem esperas fixas.
"""

import json
import pathlib
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_fairplay_e2e import _RECORD_JS, _SESSION, ROLL_ID, WAIT_MS, _admit_players, _wait_state
from test_mesa_sync_e2e import _add_token, _generate_invite, _watch_errors
from test_mesa_ttrpg_e2e import _goto_mesa, _join_as_player, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page, _start_ws_signaling

CONNECTED = "Conectado à Mesa pela rede"


def _flags_js(ws_url):
    """Script de inicialização do contexto: liga a Mesa em rede, aponta para o relay local e liga o Fairplay."""
    return (
        "localStorage.setItem('vox.lab.mesa-rede', '1');"
        f"localStorage.setItem('vox.lab.mesa-rede.url', {json.dumps(ws_url)});"
        "localStorage.setItem('vox.lab.fairplay', '1');"
    )


class MesaRedePlaywrightE2ETests(PlaywrightE2EHarness):
    """Mesa pela rede em dois navegadores isolados, com o Fairplay por cima."""

    def setUp(self):
        self.relay, ws_url = _start_ws_signaling()
        self.flags = _flags_js(ws_url)
        self.errors = []

    def tearDown(self):
        self.relay.terminate()
        self.relay.wait(timeout=5)

    def _open_pair(self, name):
        """Mestre com a mesa aberta e convite gerado; jogador em outro contexto entra pelo convite."""
        ctx_gm, gm, errors, _ = _new_isolated_page(self.browser, self.base_url)
        gm.add_init_script(self.flags)
        _watch_errors(gm, errors)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        ctx_pl, player, errors_pl, _ = _new_isolated_page(self.browser, self.base_url)
        player.add_init_script(self.flags)
        _watch_errors(player, errors_pl)
        _join_as_player(player, invite)
        self.errors = errors + errors_pl
        return ctx_gm, gm, ctx_pl, player

    def test_01_two_contexts_connect_and_gm_token_reaches_player_over_rtc(self):
        ctx_gm, gm, ctx_pl, player = self._open_pair("Rede Mesa")
        try:
            for page in (gm, player):
                expect(page.locator(".dungeon-vtt-connection")).to_contain_text(CONNECTED, timeout=WAIT_MS)
            _admit_players(gm, 1)
            _add_token(gm, "SinalPelaRede", "player")
            expect(player.locator(".dungeon-token-roster")).to_contain_text("SinalPelaRede", timeout=WAIT_MS)
            self.assertEqual(self.errors, [])
        finally:
            _close_ctx(ctx_gm)
            _close_ctx(ctx_pl)

    def test_02_fairplay_verified_roll_over_the_network(self):
        ctx_gm, gm, ctx_pl, player = self._open_pair("Rede Fairplay")
        try:
            _admit_players(gm, 1)
            for page in (gm, player):
                _wait_state(page, "keys", 2)
            player.evaluate(f"async () => {_SESSION}.fairplayDriver.openRoll({{ rollId: '{ROLL_ID}', sides: 20, formula: '1d20', phaseMs: 5000 }})")
            for page in (gm, player):
                _wait_state(page, "phase", [ROLL_ID, "done"])
            result = player.evaluate(_RECORD_JS, {"rollId": ROLL_ID, "offset": 0})
            for page in (gm, player):
                seal = page.locator(".dungeon-fairplay-seal.is-verified")
                expect(seal).to_contain_text("✓ Verificada", timeout=WAIT_MS)
                self.assertIn(f"= {result['value']}", page.locator(".dungeon-chronicle-list").filter(has=seal).inner_text())
            self.assertEqual(self.errors, [])
        finally:
            _close_ctx(ctx_gm)
            _close_ctx(ctx_pl)


if __name__ == "__main__":
    unittest.main()
