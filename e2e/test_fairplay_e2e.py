"""E2E Playwright — Subversus Fairplay (ADR-040): Mestre + 2 jogadores, flag `vox.lab.fairplay`.

Três abas do mesmo contexto (BroadcastChannel). A interface ainda não tem botão para abrir uma rolagem
Fairplay nem para registrar o resultado: os dois passos são dados pelo condutor da sessão
(`getDungeonSession().fairplayDriver.openRoll` e `syncPeer.dispatchOp`), e a verificação aparece na tela.
Execução: `python -m unittest e2e.test_fairplay_e2e -v` (ou `npm run test:e2e`). Sem esperas fixas.
"""

import os
import pathlib
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_mesa_sync_e2e import _add_token, _generate_invite, _watch_errors
from test_mesa_ttrpg_e2e import _goto_mesa, _join_as_player, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

ROLL_ID = "e2e-roll"
WAIT_MS = int(os.environ.get("VOX_E2E_WAIT_MS", "30000"))
_SESSION = "(await import('/js/dungeon/dungeon-state.js')).getDungeonSession()"
FLAG_ON = "localStorage.setItem('vox.lab.fairplay', '1')"

_RECORD_JS = """async ({ rollId, offset }) => {
  const st = %s;
  const log = await import('/js/dungeon/vtt-fairplay-log.js');
  const verdict = await log.verifyFairplayRecord({ fairplay: st.fairplay }, rollId);
  const truth = verdict.value ?? 1;
  const value = offset ? (truth + offset - 1) %% 20 + 1 : truth;
  const rollResult = { formula: '1d20', label: 'Fairplay', visibility: 'public', total: value,
    rolls: [{ sides: 20, value, kept: true }], fairplay: { rollId, value } };
  await st.syncPeer.dispatchOp({ type: 'ROLL_RECORDED', payload: { rollResult } });
  return { truth, value };
}""" % _SESSION


_ROLL_INFO_JS = """async (rollId) => {
  const st = %s;
  const roll = st.fairplay?.rolls?.[rollId] || {};
  return { me: st.vttKeypair?.routeId, driver: Boolean(st.fairplayDriver), phase: roll.phase,
    commits: Object.keys(roll.commits || {}).sort(), participants: [...(roll.participants || [])].sort(),
    openedCount: roll.openedCount, keys: Object.keys(st.fairplay?.keys || {}).sort() };
}""" % _SESSION


def _roll_info(page):
    """Instantâneo da rolagem e da identidade neste aparelho, lido do estado em memória."""
    return page.evaluate(_ROLL_INFO_JS, ROLL_ID)


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


_ADMIT_JS = """async ({ want, ms }) => {
  const m = await import('/js/dungeon/dungeon-state.js');
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const st = m.getDungeonSession();
    for (const id of st.syncPeer.getPendingFairplayPeers()) await st.syncPeer.approveFairplayPeer(id);
    if (Object.keys(st.fairplay?.admitted || {}).length >= want) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}"""


def _admit_players(gm, count):
    """Aprova pelo Mestre os pares pendentes (com a flag ligada, quem entra espera a aprovação) até `count` admitidos."""
    if not gm.evaluate(_ADMIT_JS, {"want": count, "ms": WAIT_MS}):
        raise AssertionError(f"admissão não ocorreu em {WAIT_MS} ms: {count} jogadores")


def _drop_shared_flag(pages):
    """Desliga a flag só para quem entrar depois.

    As abas do contexto dividem o `localStorage`, então uma aba "sem flag" só existe se a chave for removida
    antes de ela entrar. As abas já ligadas mantêm o campo `fairplayLabEnabled` do próprio estado (o selo e
    o condutor já estão montados).
    """
    for page in pages:
        page.evaluate(f"async () => {{ {_SESSION}.fairplayLabEnabled = true; localStorage.removeItem('vox.lab.fairplay'); }}")


def _diagnosis(page):
    """Estado dos selos e da rolagem neste aparelho, para mensagem de falha com o erro observado."""
    return page.evaluate(f"async () => {{ const st = {_SESSION}; return JSON.stringify({{ seals: st.fairplaySeals, phase: st.fairplay?.rolls?.['{ROLL_ID}']?.phase, chronicle: st.chronicle?.length }}); }}")


class FairplayPlaywrightE2ETests(PlaywrightE2EHarness):
    """Rolagem verificável pela rede da mesa, com a flag de laboratório."""

    def _open_trio(self, name, flags=(True, True, True)):
        """Mestre com mesa aberta e dois jogadores já conectados; `flags` liga o Fairplay por aba (Mestre, J1, J2).

        Uma aba sem flag depois de abas com flag usa `_drop_shared_flag` (o `localStorage` é compartilhado).
        """
        ctx, gm, errors, _ = _new_isolated_page(self.browser, self.base_url)
        if flags[0]:
            gm.add_init_script(FLAG_ON)
        _watch_errors(gm, errors)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        players = []
        for i, flag in enumerate(flags[1:], start=1):
            if not flag and any(flags[:i]):
                _drop_shared_flag([gm, *players])
            page = ctx.new_page()
            if flag:
                page.add_init_script(FLAG_ON)
            _watch_errors(page, errors)
            _join_as_player(page, invite)
            players.append(page)
            if flag:
                _admit_players(gm, sum(1 for f in flags[1:i + 1] if f))
        return ctx, gm, players, errors

    def _open_roll(self, opener):
        opener.evaluate(f"async () => {_SESSION}.fairplayDriver.openRoll({{ rollId: '{ROLL_ID}', sides: 20, formula: '1d20', phaseMs: 5000 }})")

    def _run_verified_roll(self, gm, p1, p2):
        """Abre a rolagem pelo J1 e espera as 3 abas chegarem a `done`."""
        for page in (gm, p1, p2):
            _wait_state(page, "keys", 3)
        self._open_roll(p1)
        for page in (gm, p1, p2):
            _wait_state(page, "phase", [ROLL_ID, "done"])

    def _expect_seal(self, page, css, text):
        seal = page.locator(f".dungeon-fairplay-seal.{css}")
        try:
            expect(seal).to_contain_text(text, timeout=WAIT_MS)
        except AssertionError as err:
            raise AssertionError(f"sem selo {css}: {_diagnosis(page)}") from err
        return seal

    def test_01_player_opens_roll_and_three_tabs_show_same_verified_seal(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Selo")
        try:
            self._run_verified_roll(gm, p1, p2)
            result = p1.evaluate(_RECORD_JS, {"rollId": ROLL_ID, "offset": 0})
            values = []
            for page in (gm, p1, p2):
                seal = self._expect_seal(page, "is-verified", "✓ Verificada")
                values.append(page.locator(".dungeon-chronicle-list").filter(has=seal).inner_text())
            self.assertTrue(all(f"= {result['value']}" in text for text in values), values)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_01b_wrong_recorded_value_is_not_verified_on_any_tab(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Forjado")
        try:
            self._run_verified_roll(gm, p1, p2)
            result = p1.evaluate(_RECORD_JS, {"rollId": ROLL_ID, "offset": 7})
            self.assertNotEqual(result["value"], result["truth"])
            for page in (gm, p1, p2):
                self._expect_seal(page, "is-unverified", "não confere")
                self.assertEqual(page.locator(".dungeon-fairplay-seal.is-verified").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02_flag_off_creates_no_fairplay_ops(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Off", flags=(False, False, False))
        try:
            _add_token(gm, "SinalDeVida", "player")
            for page in (p1, p2):
                expect(page.locator(".dungeon-token-roster")).to_contain_text("SinalDeVida", timeout=WAIT_MS)
            for page in (gm, p1, p2):
                info = _roll_info(page)
                self.assertEqual((info["driver"], info["keys"], info["phase"]), (False, [], None))
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02b_tab_without_flag_stays_out_of_a_roll_opened_by_flagged_tabs(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Misto", flags=(True, True, False))
        try:
            for page in (gm, p1):
                _wait_state(page, "keys", 2)
            self._open_roll(p1)
            for page in (gm, p1):
                _wait_state(page, "phase", [ROLL_ID, "done"])
            p1.evaluate(_RECORD_JS, {"rollId": ROLL_ID, "offset": 0})
            for page in (gm, p1):
                self._expect_seal(page, "is-verified", "✓ Verificada")
            expect(p2.locator(".dungeon-chronicle-list")).to_contain_text("Fairplay", timeout=WAIT_MS)
            info = _roll_info(p2)
            roll_peers = _roll_info(p1)["participants"]
            self.assertEqual((info["driver"], info["me"] in roll_peers, info["me"] in _roll_info(p1)["commits"]), (False, False, False))
            self.assertEqual(p2.locator(".dungeon-fairplay-seal").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_03_tab_closed_before_commit_ends_honestly_unverified(self):
        ctx, gm, (p1, p2), errors = self._open_trio("Fairplay Saiu")
        try:
            for page in (gm, p1, p2):
                _wait_state(page, "keys", 3)
            gone = _roll_info(p2)["me"]
            p2.close()
            self._open_roll(p1)
            for page in (gm, p1):
                _wait_state(page, "phase", [ROLL_ID, "aborted"])
            alive = sorted([_roll_info(gm)["me"], _roll_info(p1)["me"]])
            info = _roll_info(gm)
            self.assertEqual(info["commits"], alive, "só os dois vivos se comprometeram")
            self.assertEqual((info["openedCount"], gone in info["participants"], gone in info["commits"]), (3, True, False))
            p1.evaluate(_RECORD_JS, {"rollId": ROLL_ID, "offset": 0})
            expect(gm.locator(".dungeon-fairplay-seal.is-unverified")).to_contain_text("faltaram compromissos", timeout=WAIT_MS)
            expect(gm.locator(".dungeon-fairplay-unclosed")).to_contain_text("Rolagens que não fecharam", timeout=WAIT_MS)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


if __name__ == "__main__":
    unittest.main()
