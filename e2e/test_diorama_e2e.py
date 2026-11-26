"""E2E Playwright — lente Diorama (flag `vox.lab.diorama`): Mestre + jogador com névoa.

Duas abas do mesmo contexto (BroadcastChannel). O clique no canvas WebGL2 é calculado no próprio
navegador com a mesma matriz da câmera da lente (o overlay não expõe suas matrizes); o controle
positivo (clicar o que está visível seleciona) prova que a conta acerta a tela. Sem WebGL2 no
Chromium da máquina, os testes de 3D ficam NOT RUN com o motivo. Sem esperas fixas.
Execução: `python -m unittest e2e.test_diorama_e2e -v` (ou `npm run test:e2e`).

O harness de FPS (`test_90_...`) só mede e imprime: nenhum número é afirmado (insumo do P7 humano).
"""

import pathlib
import sys
import unittest

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_mesa_sync_e2e import _add_token, _drag_cell, _generate_invite, _watch_errors
from test_mesa_ttrpg_e2e import _goto_mesa, _join_as_player, _onboard_and_campaign, _set_viewer_gm
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

WAIT_MS = 30000
GL_MS = 10000
FLAG_ON = "localStorage.setItem('vox.lab.diorama', '1')"
_SESSION = "(await import('/js/dungeon/dungeon-state.js')).getDungeonSession()"
LYRA = [2.5, 0.7, 3.5]
SENTINELA = [7.5, 0.7, 4.5]
LONGE = [9.5, 0.7, 6.5]
PORTA = [4.0, 1.0, 2.5]

# A CSP proíbe `eval`: a espera é um laço dentro da página, sem texto avaliado.
_GL_READY_JS = """async (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const gl = document.querySelector('canvas[data-diorama-gl]');
    if (gl && gl.style.pointerEvents === 'auto') return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}"""

_PROJECT_JS = """async ({ mode, p }) => {
  const cam = await import('/js/dungeon/diorama/diorama-camera.js');
  const gl = document.querySelector('canvas[data-diorama-gl]');
  gl.scrollIntoView({ block: 'center' });
  const r = gl.getBoundingClientRect();
  const m = cam.computeCameraMatrices(cam.createDioramaCamera({ mode }), gl.width / Math.max(1, gl.height)).viewProj;
  const v = [p[0], p[1], p[2], 1];
  const o = [0, 1, 2, 3].map((row) => v.reduce((acc, val, c) => acc + m[c * 4 + row] * val, 0));
  return { x: r.left + (o[0] / o[3] + 1) / 2 * r.width, y: r.top + (1 - o[1] / o[3]) / 2 * r.height };
}"""

_STATE_JS = """async () => {
  const st = %s;
  const scene = Object.values(st.campaignDoc.scenesById)[0];
  const door = scene.floors[0].doors.find((d) => d.doorId === 'door-cripta');
  return { selected: st.selectedTokenId || '', door: door && door.state, tokens: scene.tokens.map((t) => t.name) };
}""" % _SESSION

_PLAYER_VIEW_JS = """async () => {
  const st = %s;
  const scene = Object.values(st.campaignDoc.scenesById)[0];
  return { tokens: scene.tokens.map((t) => t.name), doors: scene.floors[0].doors.map((d) => d.doorId) };
}""" % _SESSION

_FPS_JS = """async () => {
  window.__fps = { deltas: [], stop: false };
  let last = performance.now();
  const tick = (now) => { window.__fps.deltas.push(now - last); last = now; if (!window.__fps.stop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}"""

_FPS_SUMMARY_JS = """async () => {
  window.__fps.stop = true;
  const d = [...window.__fps.deltas].slice(1).sort((x, y) => x - y);
  const total = d.reduce((a, v) => a + v, 0);
  const pick = (q) => d[Math.min(d.length - 1, Math.floor(d.length * q))];
  return { frames: d.length, fpsMean: +(d.length / (total / 1000)).toFixed(1), p50Ms: +pick(0.5).toFixed(1), p95Ms: +pick(0.95).toFixed(1), maxMs: +d[d.length - 1].toFixed(1) };
}"""


def _open_diorama(page, mode):
    """Liga a lente no modo pedido; devolve False (NOT RUN) quando o Chromium não entrega WebGL2."""
    page.locator(f"button[data-dungeon='diorama-mode'][data-mode='{mode}']").click()
    return page.evaluate(_GL_READY_JS, GL_MS)


def _screen_of(page, point, mode="iso"):
    return page.evaluate(_PROJECT_JS, {"mode": mode, "p": point})


def _click_world(page, point):
    pos = _screen_of(page, point)
    page.mouse.click(pos["x"], pos["y"])


def _state(page):
    return page.evaluate(_STATE_JS)


def _wait_selected(page, want):
    """Espera `selectedTokenId` pelo estado em memória (teto WAIT_MS, sem espera fixa)."""
    js = """async ({ ms, want }) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (((%s).selectedTokenId || '') === want) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}""" % _SESSION
    return page.evaluate(js, {"ms": WAIT_MS, "want": want})


class DioramaPlaywrightE2ETests(PlaywrightE2EHarness):
    """Lente Diorama com Mestre e jogador sob névoa."""

    def _reveal_around_lyra(self, gm):
        gm.locator("button[data-dungeon='toggle-fog']").click()
        gm.locator("button[data-dungeon='select-tool'][data-tool='fog-reveal']").click()
        canvas = gm.locator("#dungeon-vtt-canvas")
        canvas.scroll_into_view_if_needed()
        gm.locator("button[data-dungeon='canvas-reset']").click()
        box = canvas.bounding_box()
        gm.mouse.move(box["x"] + 68, box["y"] + 132)
        gm.mouse.down()
        gm.mouse.move(box["x"] + 190, box["y"] + 254, steps=8)
        gm.mouse.up()
        gm.locator("button[data-dungeon='select-tool'][data-tool='select']").click()

    def _open_pair(self, name):
        """Mestre com névoa só em volta da Lyra, token público `Longe` fora dela e jogador conectado."""
        ctx, gm, errors, _ = _new_isolated_page(self.browser, self.base_url)
        ctx.add_init_script(FLAG_ON)
        _watch_errors(gm, errors)
        table_id = _onboard_and_campaign(gm, self.base_url, name)
        invite = _generate_invite(gm, self.base_url, table_id)
        _goto_mesa(gm, self.base_url, table_id)
        _set_viewer_gm(gm)
        self._reveal_around_lyra(gm)
        _add_token(gm, "Longe", "player")
        _drag_cell(gm, (1, 1), (9, 6))
        player = ctx.new_page()
        _watch_errors(player, errors)
        _join_as_player(player, invite)
        expect(player.locator(".dungeon-token-roster")).to_contain_text("Lyra", timeout=WAIT_MS)
        return ctx, gm, player, errors

    def _enter_3d(self, *pages):
        for page in pages:
            if not _open_diorama(page, "iso"):
                self.skipTest("NOT RUN: Chromium sem WebGL2 (a lente cai para o mapa 2D)")

    def test_01_gm_sees_and_clicks_everything_in_the_diorama(self):
        ctx, gm, player, errors = self._open_pair("Diorama Mestre")
        try:
            self._enter_3d(gm, player)
            _click_world(gm, LYRA)
            self.assertTrue(_wait_selected(gm, _token_id(gm, "Lyra")), "controle positivo: Lyra selecionada")
            _click_world(gm, LONGE)
            self.assertTrue(_wait_selected(gm, _token_id(gm, "Longe")), "Mestre alcança token na névoa")
            _click_world(gm, SENTINELA)
            self.assertTrue(_wait_selected(gm, _token_id(gm, "Sentinela da Cripta")), "Mestre alcança camada GM")
            _click_world(gm, PORTA)
            expect_door = gm.evaluate(_DOOR_WAIT_JS, {"ms": WAIT_MS, "from": "closed"})
            self.assertTrue(expect_door, "Mestre abre a porta pelo 3D")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_02_player_cannot_click_tokens_or_doors_outside_revealed_area(self):
        ctx, gm, player, errors = self._open_pair("Diorama Jogador")
        try:
            self._enter_3d(gm, player)
            _click_world(player, LYRA)
            lyra = _token_id(player, "Lyra")
            self.assertTrue(_wait_selected(player, lyra), "controle positivo: Lyra revelada")
            for point in (LONGE, SENTINELA):
                _click_world(player, point)  # o clique é tratado de forma síncrona na página
                self.assertEqual(_state(player)["selected"], lyra, f"clique em {point} não seleciona nada novo")
            door_before = _state(player)["door"]
            _click_world(player, PORTA)
            self.assertEqual(_state(player)["door"], door_before, "porta fora da névoa não muda")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_03_gestures_do_not_break_the_lens(self):
        ctx, gm, player, errors = self._open_pair("Diorama Gestos")
        try:
            self._enter_3d(gm)
            gl = gm.locator("canvas[data-diorama-gl]")
            box = gl.bounding_box()
            cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
            selected_before = _state(gm)["selected"]
            gm.mouse.move(cx, cy)
            gm.mouse.down()
            gm.mouse.move(cx + 120, cy + 40, steps=10)
            gm.mouse.up()
            gm.mouse.wheel(0, -300)
            gl.focus()
            for key in ("ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"):
                gm.keyboard.press(key)
            self.assertTrue(gm.evaluate(_GL_READY_JS, GL_MS), "a lente segue ativa após os gestos")
            self.assertEqual(_state(gm)["selected"], selected_before, "arrastar a câmera não muda a seleção")
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_04_player_state_carries_no_token_or_door_inside_fog(self):
        """Zero-Spoiler no sync: o estado do jogador não recebe o token nem a porta fora da área revelada."""
        ctx, gm, player, errors = self._open_pair("Diorama Estado")
        try:
            info = player.evaluate(_PLAYER_VIEW_JS)
            self.assertNotIn("Longe", info["tokens"], "token fora da névoa não deveria chegar ao jogador")
            self.assertNotIn("door-cripta", info["doors"], "porta fora da névoa não deveria chegar ao jogador")
        finally:
            _close_ctx(ctx)

    def test_90_fps_harness_measures_and_prints_only(self):
        """Mede quadros durante um giro de câmera e imprime; sem afirmar número (P7 humano compara depois)."""
        ctx, gm, player, errors = self._open_pair("Diorama FPS")
        try:
            for mode in ("iso", "3d"):
                if not _open_diorama(gm, mode):
                    self.skipTest("NOT RUN: Chromium sem WebGL2")
                print(f"FPS[{mode}]", _measure_orbit(gm))
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)


_DOOR_WAIT_JS = """async ({ ms, from }) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const st = %s;
    const scene = Object.values(st.campaignDoc.scenesById)[0];
    const door = scene.floors[0].doors.find((d) => d.doorId === 'door-cripta');
    if (door && door.state !== from) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}""" % _SESSION


def _token_id(page, name):
    return page.evaluate(
        "async (n) => { const st = %s; return Object.values(st.campaignDoc.scenesById)[0].tokens.find((t) => t.name === n).tokenId; }" % _SESSION,
        name,
    )


def _measure_orbit(page):
    """Giro de câmera com o mouse e resumo dos intervalos entre quadros (ms): n, fps médio, p95, máximo."""
    page.evaluate(_FPS_JS)
    box = page.locator("canvas[data-diorama-gl]").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 200, cy + 60, steps=90)
    page.mouse.move(cx - 200, cy - 60, steps=90)
    page.mouse.up()
    return page.evaluate(_FPS_SUMMARY_JS)




if __name__ == "__main__":
    unittest.main()
