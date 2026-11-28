"""E2E Playwright — painéis em meia tela do HUD com conteúdo alto (SUB-06, pendência 2, spec hud-jogo-v0).

Mede no navegador, em 1280x840 e 390x844, que o painel aberto com conteúdo longo cabe na viewport, rola por dentro,
não cobre a barra de painéis, não mexe no mapa e mantém foco no corpo e Esc para fechar. Servidor estático local,
sem tráfego externo. Execução: `python -m unittest e2e.test_hud_painel_e2e`.
"""

import pathlib
import sys

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_mesa_ttrpg_e2e import _goto_mesa, _onboard_and_campaign
from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _new_isolated_page

_LONG_CONTENT = "() => { document.querySelector('.dungeon-hud-panel-content').innerHTML = Array.from({length: 120}, (_, i) => `<p>Linha ${i}</p>`).join(''); }"
_RECT = "(sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return {top: b.top, bottom: b.bottom, height: b.height}; }"
_DOC_RECT = "(sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return {top: b.top + scrollY, height: b.height, width: b.width}; }"
_SCROLL = "() => { const p = document.querySelector('#dungeon-hud-panel'); return {over: p.scrollHeight > p.clientHeight, overflowY: getComputedStyle(p).overflowY, vh: innerHeight}; }"


_BAR_AO_TOPO_ESTAVEL = """async (btnSel) => {
  const bar = document.querySelector('.dungeon-hud-panel-bar');
  const btn = document.querySelector(btnSel);
  bar.scrollIntoView({block: 'start'});
  scrollBy(0, bar.getBoundingClientRect().top - 8);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  const key = () => `${document.documentElement.scrollHeight}|${Math.round(bar.getBoundingClientRect().top)}|${Math.round(scrollY)}`;
  const recebeClique = () => {
    const r = btn.getBoundingClientRect();
    const alvo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return alvo === btn || btn.contains(alvo);
  };
  let last = key();
  let calmos = 0;
  for (let i = 0; i < 300 && !(calmos >= 12 && recebeClique()); i++) {
    await frame();
    const now = key();
    calmos = now === last ? calmos + 1 : 0;
    last = now;
  }
  return calmos >= 12 && recebeClique();
}"""
_BTN_CRONICA = "button[data-hud-op='panel-open'][data-panel-id='chronicle']"


class HudPainelAltoE2ETests(PlaywrightE2EHarness):
    """Painel alto: cabe, rola por dentro, não cobre a barra nem empurra o mapa.

    No celular (390 px) o painel é uma folha fixa de até 75% da altura (spec hud-jogo-v0, D6a): ela só deixa a barra
    à vista quando a barra está acima dela. Se a barra não está inteira na viewport, o clique do Playwright rola a
    página e a centraliza (a 390 px ela fica sob a folha); por isso o teste leva a barra a 8 px do topo, inteira à
    vista, e espera a condição de o botão receber o clique (altura, rolagem e posição estáveis por 12 quadros e
    `elementFromPoint` no botão) antes de abrir o painel.
    """

    def _check(self, width, height):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url, viewport={"width": width, "height": height})
        try:
            table_id = _onboard_and_campaign(page, self.base_url, "Painel Alto")
            _goto_mesa(page, self.base_url, table_id)
            self.assertTrue(page.evaluate(_BAR_AO_TOPO_ESTAVEL, _BTN_CRONICA), "a página assenta com o botão da barra recebendo o clique")
            canvas_before = page.evaluate(_DOC_RECT, "#dungeon-vtt-canvas")
            page.locator(_BTN_CRONICA).first.click()
            page.locator("#dungeon-hud-panel").wait_for(state="visible")
            page.evaluate(_LONG_CONTENT)
            panel = page.evaluate(_RECT, "#dungeon-hud-panel")
            scroll = page.evaluate(_SCROLL)
            bar = page.evaluate(_RECT, ".dungeon-hud-panel-bar")
            self.assertLessEqual(panel["height"], scroll["vh"], "o painel cabe na viewport")
            self.assertTrue(scroll["over"] and scroll["overflowY"] in ("auto", "scroll"), "o painel rola por dentro")
            self.assertTrue(panel["bottom"] <= bar["top"] or panel["top"] >= bar["bottom"], "o painel não cobre a barra de painéis")
            self.assertEqual(page.evaluate(_DOC_RECT, "#dungeon-vtt-canvas"), canvas_before, "o mapa não se mexe nem muda de tamanho")
            expect(page.locator("#dungeon-hud-panel [data-hud-panel-body]")).to_be_focused()
            page.keyboard.press("Escape")
            expect(page.locator("#dungeon-hud-panel")).to_have_count(0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_30_painel_alto_em_1280x840(self):
        self._check(1280, 840)

    def test_31_painel_alto_em_390x844(self):
        self._check(390, 844)
