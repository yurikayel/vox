/**
 * @file Alvos de toque de pelo menos 24 px (WCAG 2.5.8) nos controles que mediam 16 a 21 px de altura em Chromium a 320–390 px:
 * rodapé "feedback", dispensar tópico de boas-vindas, "ver mais" de membros, autor do post, link manual de contas, slider de
 * favoritos, campo de competências e `summary`. Lê as folhas na ordem do `index.html` e confere a altura mínima que vence.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
const html = fs.readFileSync(path.join(CLIENT, "index.html"), "utf8");
const SHEETS = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"]+)"/g)].map((m) => m[1]);
const MIN = 24;
const TARGETS = [
  ".app-footer-feedback",
  ".link-alt",
  ".btn-dismiss-welcome-topic",
  ".community-orkut-members-more",
  ".post-author",
  ".dungeon-range",
  '.aviso-skills input[type="text"]',
  "summary",
];

/** Valor final de `prop` para um seletor (sozinho ou em lista), na ordem de carga das folhas. */
function finalDecl(selector, prop) {
  let value = null;
  for (const href of SHEETS) {
    const css = fs.readFileSync(path.join(CLIENT, href), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1].split(",").map((s) => s.trim()).includes(selector)) continue;
      const decl = m[2].match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (decl) value = decl[1].trim();
    }
  }
  return value;
}

const px = (v) => (v?.endsWith("px") ? Number.parseFloat(v) : v?.endsWith("rem") ? Number.parseFloat(v) * 16 : Number.NaN);

test("o index.html liga as folhas lidas (style, agora e sv-agora)", () => {
  for (const sheet of ["css/style.css", "css/agora.css", "css/sv-agora.css"]) assert.ok(SHEETS.includes(sheet), `${sheet} fora do index.html`);
});

for (const selector of TARGETS) {
  test(`${selector}: altura mínima de ${MIN} px`, () => {
    const value = finalDecl(selector, "min-height");
    assert.ok(px(value) >= MIN, `${selector}: min-height ${value ?? "ausente"} (< ${MIN}px)`);
  });
}

test("o botão de dispensar também tem largura mínima de 24 px", () => {
  assert.ok(px(finalDecl(".btn-dismiss-welcome-topic", "min-width")) >= MIN);
});
