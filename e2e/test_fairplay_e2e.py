"""E2E Playwright — Subversus Fairplay (ADR-040): Mestre + 2 jogadores, flag `vox.lab.fairplay`.

Três abas do mesmo contexto (BroadcastChannel). A interface ainda não tem botão para abrir uma rolagem
Fairplay nem para registrar o resultado: os dois passos são dados pelo condutor da sessão
(`getDungeonSession().fairplayDriver.openRoll` e `syncPeer.dispatchOp`), e a verificação aparece na tela.
Execução: `python -m unittest e2e.test_fairplay_e2e -v` (ou `npm run test:e2e`). Sem esperas fixas.
"""

import pathlib
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_mesa_sync_e2e import _add_token, _generate_invite, _watch_errors
from test_mesa_ttrpg_e2e import _goto_mesa, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

ROLL_ID = "e2e-roll"
WAIT_MS = 30000
_SESSION = "(await import('/js/dungeon/dungeon-state.js')).getDungeonSession()"
FLAG_ON = "localStorage.setItem('vox.lab.fairplay', '1')"

_RECORD_JS = """async (rollId) => {
  const st = %s;
  const log = await import('/js/dungeon/vtt-fairplay-log.js');
  const verdict = await log.verifyFairplayRecord({ fairplay: st.fairplay }, rollId);
  const value = verdict.value ?? 1;
  const rollResult = { formula: '1d20', label: 'Fairplay', visibility: 'public', total: value,
    rolls: [{ sides: 20, value, kept: true }], fairplay: { rollId, value } };
  await st.syncPeer.dispatchOp({ type: 'ROLL_RECORDED', payload: { rollResult } });
  return value;
}""" % _SESSION


# A CSP da página proíbe `eval`/`new Function`: as condições são predicados nomeados, não texto.
_POLL_JS = """async ({ kind, arg, ms }) => {
  const m = await import('/js/dungeon/dungeon-state.js');
  const preds = {
    keys: (st, n) => Object.keys(st.fairplay?.keys || {}).length >= n,
    phase: (st, [rollId, phase]) => st.fairplay?.rolls?.[rollId]?.phase === phase,
  };
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (preds[kind](m.getDungeonSession(), arg)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}"""


def _wait_state(page, kind, arg):
    """Espera uma condição nomeada sobre o estado em memória da sessão; o teto é WAIT_MS (sem espera fixa)."""
    if not page.evaluate(_POLL_JS, {"kind": kind, "arg": arg, "ms": WAIT_MS}):
        raise AssertionError(f"condição não ocorreu em {WAIT_MS} ms: {kind} {arg}")


def _diagnosis(page):
    """Estado dos selos e da rolagem neste aparelho, para mensagem de falha com o erro observado."""
    return page.evaluate(f"async () => {{ const st = {_SESSION}; return JSON.stringify({{ seals: st.fairplaySeals, phase: st.fairplay?.rolls?.['{ROLL_ID}']?.phase, chronicle: st.chronicle?.length }}); }}")


class FairplayPlaywrightE2ETests(PlaywrightE2EHarness):
    """Rolagem verificável pela rede da mesa, com a flag de laboratório."""

    def _open_trio(self, name, flag):
        """Mestre com mesa aberta e dois jogadores já conectados; `flag` liga o Fairplay em todas as abas."""
        ctx, gm, errors, _ = _new_isolated_page(self.browser, self.base_url)
        if flag:
            ctx.add_init_script(FLAG_ON)
        _watch_errors(gm, errors)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        players = []
        for _ in range(2):
            page = ctx.new_page()
            _watch_errors(page, errors)
            page.goto(invite, wait_until="domcontentloaded")
            page.locator("#dungeon-vtt-canvas").wait_for(state="visible", timeout=15000)
            players.append(page)
        return ctx, gm, players, errors

    def _open_roll(self, opener):
        opener.evaluate(f"async () => {_SESSION}.fairplayDriver.openRoll({{ rollId: '{ROLL_ID}', sides: 20, formula: '1d20', phaseMs: 5000 }})")

    def test_01_player_opens_roll_and_three_tabs_show_same_verified_seal(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Selo", flag=True)
        try:
            for page in (gm, p1, p2):
                _wait_state(page, "keys", 3)
            self._open_roll(p1)
            for page in (gm, p1, p2):
                _wait_state(page, "phase", [ROLL_ID, "done"])
            value = p1.evaluate(_RECORD_JS, ROLL_ID)
            values = []
            for page in (gm, p1, p2):
                seal = page.locator(".dungeon-fairplay-seal.is-verified")
                try:
                    expect(seal).to_contain_text("✓ Verificada", timeout=WAIT_MS)
                except AssertionError as err:
                    raise AssertionError(f"sem selo verificado: {_diagnosis(page)}") from err
                values.append(page.locator(".dungeon-chronicle-list").filter(has=seal).inner_text())
            self.assertTrue(all(f"= {value}" in text for text in values), values)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02_flag_off_creates_no_fairplay_ops(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Off", flag=False)
        try:
            _add_token(gm, "SinalDeVida", "player")
            for page in (p1, p2):
                expect(page.locator(".dungeon-token-roster")).to_contain_text("SinalDeVida", timeout=WAIT_MS)
            for page in (gm, p1, p2):
                state = page.evaluate(f"async () => {{ const st = {_SESSION}; return {{ driver: Boolean(st.fairplayDriver), keys: Object.keys(st.fairplay?.keys || {{}}).length, rolls: Object.keys(st.fairplay?.rolls || {{}}).length }}; }}")
                self.assertEqual(state, {"driver": False, "keys": 0, "rolls": 0})
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_03_tab_closed_before_commit_ends_honestly_unverified(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Saiu", flag=True)
        try:
            for page in (gm, p1, p2):
                _wait_state(page, "keys", 3)
            p2.close()
            self._open_roll(p1)
            for page in (gm, p1):
                _wait_state(page, "phase", [ROLL_ID, "aborted"])
            p1.evaluate(_RECORD_JS, ROLL_ID)
            expect(gm.locator(".dungeon-fairplay-seal.is-unverified")).to_contain_text("faltaram compromissos", timeout=WAIT_MS)
            expect(gm.locator(".dungeon-fairplay-unclosed")).to_contain_text("Rolagens que não fecharam", timeout=WAIT_MS)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


if __name__ == "__main__":
    unittest.main()
