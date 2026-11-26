"""E2E Playwright — Assistente de criar ficha (SUB-05, docs/specs/assistente-ficha-v0.md §8, teste 13).

Prova no navegador o que o `node:test` não alcança: recarregar a página (F5) no meio do Guiado descarta o rascunho e
não deixa ficha nem estado parcial. Herda o servidor estático e o Chromium de `test_vox_e2e.py`.
Execução: `python -m unittest e2e.test_ficha_assistente_e2e`.
"""

import pathlib
import sys

from playwright.sync_api import expect

_E2E_DIR = pathlib.Path(__file__).resolve().parent
if str(_E2E_DIR) not in sys.path:
    sys.path.insert(0, str(_E2E_DIR))

from test_vox_e2e import PlaywrightE2EHarness, _close_ctx, _complete_onboarding, _new_isolated_page


def _goto_ficha(page, base_url):
    page.goto(f"{base_url}/#/dungeon/ficha/lyra", wait_until="domcontentloaded")
    page.locator(".dungeon-sanctum[data-dungeon-screen='ficha']").wait_for(state="visible", timeout=15000)


class FichaAssistentePlaywrightE2ETests(PlaywrightE2EHarness):
    """Assistente de criar ficha: abandono por recarregamento e criação pelo Rápido."""

    def test_20_f5_no_meio_do_guiado_descarta_o_rascunho(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Assistente F5", errors)
            _goto_ficha(page, self.base_url)
            page.locator("button[data-dungeon='wizard-open']").click()
            page.locator("button[data-dungeon='wizard-mode'][data-mode='guided']").click()
            page.locator("[data-dungeon-wizard] input[name='sheetName']").fill("Rascunho F5")
            page.locator("button[data-dungeon='wizard-step'][data-dir='next']").click()
            expect(page.locator("[data-dungeon-wizard] h3")).to_contain_text("Passo 2 de 7")
            page.reload(wait_until="domcontentloaded")
            _goto_ficha(page, self.base_url)
            self.assertEqual(page.locator("[data-dungeon-wizard]").count(), 0)
            self.assertNotIn("Rascunho F5", page.locator(".dungeon-sanctum").inner_text())
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)

    def test_21_rapido_cria_a_ficha_so_com_o_nome(self):
        ctx, page, errors, _ = _new_isolated_page(self.browser, self.base_url)
        try:
            page.goto(f"{self.base_url}/#/", wait_until="domcontentloaded")
            _complete_onboarding(page, "Assistente Rapido", errors)
            _goto_ficha(page, self.base_url)
            page.locator("button[data-dungeon='wizard-open']").click()
            page.locator("button[data-dungeon='wizard-mode'][data-mode='quick']").click()
            page.locator("[data-dungeon-wizard] input[name='sheetName']").fill("Bram Rapido")
            page.locator("button[data-dungeon='wizard-step'][data-dir='finish']").click()
            expect(page.locator(".dungeon-sanctum")).to_contain_text("Bram Rapido")
            self.assertEqual(page.locator("[data-dungeon-wizard]").count(), 0)
            self.assertEqual(errors, [])
        finally:
            _close_ctx(ctx)
