/**
 * @file Contraste do texto sobre cor cheia nos dois temas, com a mesma fórmula WCAG do `a11y-wcag-aa.test.js`.
 * No tema claro, `--sa-on-primary` e `--sa-on-secondary` ficavam com o valor do escuro (~2:1) e o botão primário da
 * mesa e a célula do jogador fixavam `#00201e`. Os pares `--sv-on-*` de `sv-tokens.css` corrigem, e os seletores que
 * falhavam apontam para eles. Mede o par e cada seletor renderizado (cor e fundo que vencem por especificidade e ordem
 * das folhas), um teste por seletor, e cada caminho de tema separado: atributo `data-color-mode` e
 * `@media (prefers-color-scheme)` sem atributo. As folhas `sv-*.css` não redeclaram nenhum `--sa-*`.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { assertRatio, contrast, hexOf, readSheet, renderedDecl, resolveTheme, SV_SHEETS } from "./helpers/css-tema.js";

const PAIRS = [
  ["--sv-on-primary", "--sa-primary"],
  ["--sv-on-civic", "--sa-secondary"],
  ["--sv-on-primary-container", "--sa-primary-container"],
  ["--sv-on-error-container", "--sa-error-container"],
];
const CONSUMERS = [".dungeon-btn-primary", ".dungeon-grid-cell.is-player", ".agora-dm-badge"];
const ROUTES = [
  ["light", "attr", "tema claro pelo atributo data-color-mode"],
  ["light", "media", "tema claro pelo @media prefers-color-scheme (modo automático)"],
  ["dark", "both", "tema escuro"],
];

function assertPairs(theme, route) {
  const tokens = resolveTheme(theme, route);
  for (const [fgKey, bgKey] of PAIRS) assertRatio(`${theme}/${route}: ${fgKey} sobre ${bgKey}`, hexOf(tokens, fgKey), hexOf(tokens, bgKey));
}

function assertConsumer(theme, route, selector) {
  const tokens = resolveTheme(theme, route);
  const fg = hexOf(tokens, renderedDecl(selector, "color") ?? "");
  const bg = hexOf(tokens, renderedDecl(selector, "background") ?? "");
  assertRatio(`${theme}/${route}: ${selector}`, fg, bg);
}

describe("contraste do texto sobre cor cheia (pares --sv-on-* e seletores renderizados)", () => {
  for (const [theme, route, nome] of ROUTES) {
    it(`pares --sv-on-*: ${nome}`, () => assertPairs(theme, route));
    for (const selector of CONSUMERS) it(`${selector}: ${nome}`, () => assertConsumer(theme, route, selector));
  }
  it("o index.html liga sv-tokens.css depois de agora.css, para a folha vencer a cascata", () => {
    const html = fs.readFileSync(new URL("../client/index.html", import.meta.url), "utf8");
    const agora = html.indexOf('href="css/agora.css"');
    const tokens = html.indexOf('href="css/sv-tokens.css"');
    assert.ok(agora >= 0, "agora.css não está ligado no index.html");
    assert.ok(tokens > agora, "sv-tokens.css precisa vir depois de agora.css no index.html");
  });
  it("nenhuma folha sv-*.css redeclara um token --sa-* (só --sv-*: o tema vem de agora.css)", () => {
    for (const file of SV_SHEETS) {
      const redeclarados = readSheet(file).match(/(?:^|[;{\s])--sa-[\w-]+\s*:/g) || [];
      assert.deepEqual(redeclarados, [], `${file} redeclara ${redeclarados.join(" ")}`);
    }
  });
  it("vence a regra de maior especificidade, não só a que casa o seletor inteiro (`.a.b` ganha de `.b`)", () => {
    // O botão primário de `agora.css` é `.dungeon-btn-primary`; uma regra `.dungeon-btn.dungeon-btn-primary` vence dela.
    const corpo = renderedDecl(".dungeon-btn-primary", "color");
    assert.equal(corpo, "var(--sv-on-primary)", "o texto do botão primário vem do par --sv-on-primary");
  });
  it("a fórmula mede o par conhecido ruim: texto escuro sobre botão escuro dá menos de 3:1", () => {
    assert.ok(contrast("#003734", "#006a65") < 3);
    assert.ok(contrast("#ffffff", "#006a65") >= 4.5);
  });
});
