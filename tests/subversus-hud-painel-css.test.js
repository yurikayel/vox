/**
 * @file Contrato do CSS dos painéis do HUD (SUB-06, pendência 2): painel com teto de altura, rolagem própria e ancorado na
 * doca, sem tela cheia fixa. A medição no navegador está em `e2e/test_hud_painel_e2e.py`.
 */
import "./setup.js";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { renderMapHud } from "../client/js/dungeon/screen-map-hud.js";

const css = fs.readFileSync(new URL("../client/css/agora.css", import.meta.url), "utf8");
const rule = (selector, from = 0) => {
  const at = css.indexOf(`${selector} {`, from);
  return at === -1 ? "" : css.slice(at, css.indexOf("}", at));
};
const mobileAt = () => css.indexOf("@media (max-width: 1023.98px)", css.indexOf(".dungeon-hud-panel-head {"));

test("painel do HUD no desktop: abre para cima da doca, com teto de altura e rolagem própria", () => {
  const panel = rule(".dungeon-hud-panel");
  assert.match(panel, /position: absolute/);
  assert.match(panel, /bottom: 100%/);
  assert.match(panel, /max-height: min\(60vh, 520px\)/);
  assert.match(panel, /overflow-y: auto/);
  assert.doesNotMatch(panel, /top: 0/);
  assert.match(rule(".dungeon-hud-dock"), /position: relative/);
});

test("painel do HUD no celular: folha presa ao rodapé com teto de altura, não tela cheia", () => {
  const mobile = rule(".dungeon-hud-panel", mobileAt());
  assert.match(mobile, /position: fixed/);
  assert.match(mobile, /max-height: 75dvh/);
  assert.doesNotMatch(mobile, /inset: 0/);
});

test("renderMapHud: painel, estado, atalhos e barra de painéis ficam juntos dentro da doca", () => {
  const sheet = { character_id: "a", attributes_lww: {}, inventory_orset: {} };
  const html = renderMapHud({ sheet, hudPanel: "sheet", viewerRole: "player" }, { tokens: [] });
  assert.match(html, /^<div class="dungeon-hud-dock"><section id="dungeon-hud-panel"/);
  assert.ok(html.endsWith("</nav></div>"));
  assert.ok(html.indexOf('class="dungeon-hud-panel-bar') > html.indexOf('id="dungeon-hud-panel"'));
});
