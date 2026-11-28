/**
 * @file Contraste do texto sobre cor cheia nos dois temas, com a mesma fórmula WCAG do `a11y-wcag-aa.test.js`.
 * No tema claro, `--sa-on-primary` e `--sa-on-secondary` ficavam com o valor do escuro (~2:1) e o botão primário da
 * mesa e a célula do jogador fixavam `#00201e`. Os pares `--sv-on-*` de `sv-tokens.css` corrigem, e os seletores que
 * falhavam apontam para eles. Mede o par e cada seletor pela cascata de `helpers/css-cascata.js` (ancestral, classe de
 * variante, `@media` e especificidade), um teste por seletor, em quatro ambientes: atributo `data-color-mode` claro e
 * escuro, e modo automático claro e escuro. O escuro pelo atributo com o sistema claro cai no bloco que `style.css`
 * aninha em `@media (prefers-color-scheme: light)`. O chevron das sanfonas (`::before` de `.sv-camp-details > summary`) é
 * medido contra os fundos em que a sanfona aparece, no mínimo de 3:1 (WCAG 1.4.11, componente gráfico). As folhas `sv-*.css` não redeclaram nenhum `--sa-*`.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildChain, cascade, themeTokens } from "./helpers/css-cascata.js";
import { assertRatio, contrast, hexOf, readSheet, SV_SHEETS } from "./helpers/css-tema.js";

const PAIRS = [
  ["--sv-on-primary", "--sa-primary"],
  ["--sv-on-civic", "--sa-secondary"],
  ["--sv-on-primary-container", "--sa-primary-container"],
  ["--sv-on-error-container", "--sa-error-container"],
];
const CONSUMERS = [
  [".dungeon-btn-primary", "button.dungeon-btn-primary"],
  [".dungeon-grid-cell.is-player", "div.dungeon-grid-cell.is-player"],
  [".agora-dm-badge", "span.agora-dm-badge"],
];
const ENVS = [
  ["tema claro pelo atributo data-color-mode (sistema escuro)", { scheme: "dark", mode: "light" }],
  ["tema claro pelo modo automático (@media claro)", { scheme: "light" }],
  ["tema escuro pelo atributo data-color-mode (sistema claro: bloco aninhado em @media claro)", { scheme: "light", mode: "dark" }],
  ["tema escuro pelo modo automático (@media escuro)", { scheme: "dark" }],
];

function assertPairs(env) {
  const tokens = themeTokens(env);
  for (const [fgKey, bgKey] of PAIRS) assertRatio(`${JSON.stringify(env)}: ${fgKey} sobre ${bgKey}`, hexOf(tokens, fgKey), hexOf(tokens, bgKey));
}

const rootOf = (env) => (env.mode ? `html[data-color-mode="${env.mode}"]` : "html");
const consumerChain = (env, path) => buildChain(`${rootOf(env)} > body > ${path}`);

function assertConsumer(env, selector, path) {
  const tokens = themeTokens(env);
  const chain = consumerChain(env, path);
  const fg = hexOf(tokens, cascade(chain, ["color"], undefined, env)?.value ?? "");
  const bg = hexOf(tokens, cascade(chain, ["background", "background-color"], undefined, env)?.value ?? "");
  assertRatio(`${JSON.stringify(env)}: ${selector}`, fg, bg);
}

const SANCTUM = "div.dungeon-sanctum";
const PANEL = "div.dungeon-sanctum > div.dungeon-panel";
const CHEVRON = "details.sv-camp-details > summary::before";
const CHEVRON_BACKGROUNDS = [[SANCTUM, ".dungeon-sanctum"], [PANEL, ".dungeon-panel"]];
const NON_TEXT_MIN = 3;

/** Cor da borda do chevron das sanfonas (a mesma nas duas arestas) contra os fundos em que a sanfona aparece: 3:1 (WCAG 1.4.11). */
function assertChevron(env) {
  const tokens = themeTokens(env);
  const chevron = consumerChain(env, `${PANEL} > ${CHEVRON}`);
  const edges = ["border-right", "border-bottom"].map((prop) => (cascade(chevron, [prop, `${prop}-color`], undefined, env)?.value ?? "").match(/var\([^)]*\)|#[0-9a-f]{6}/i)?.[0] ?? "");
  for (const [i, edge] of edges.entries()) {
    for (const [path, nome] of CHEVRON_BACKGROUNDS) {
      const bg = hexOf(tokens, cascade(consumerChain(env, path), ["background", "background-color"], undefined, env)?.value ?? "");
      assertRatio(`${JSON.stringify(env)}: chevron (${i ? "baixo" : "direita"}) sobre ${nome}`, hexOf(tokens, edge), bg, NON_TEXT_MIN);
    }
  }
}

describe("contraste do texto sobre cor cheia (pares --sv-on-* e seletores na cascata)", () => {
  for (const [nome, env] of ENVS) {
    it(`pares --sv-on-*: ${nome}`, () => assertPairs(env));
    for (const [selector, path] of CONSUMERS) it(`${selector}: ${nome}`, () => assertConsumer(env, selector, path));
    it(`chevron das sanfonas ≥ 3:1: ${nome}`, () => assertChevron(env));
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
    const vencedora = cascade(buildChain("html > body > button.dungeon-btn.dungeon-btn-primary"), ["color"]);
    assert.equal(vencedora.value, "var(--sv-on-primary)", "o texto do botão primário vem do par --sv-on-primary");
  });
  it("escuro pelo atributo com o sistema claro: avisos no amarelo do escuro e legíveis sobre a superfície escura", () => {
    const tokens = themeTokens({ scheme: "light", mode: "dark" });
    assert.equal(hexOf(tokens, "--warning"), "#f5c400", "--warning não ficou com o valor claro (#7a5c00)");
    assert.equal(hexOf(tokens, "--amber"), "#f5c400");
    assertRatio("escuro/atributo: --warning sobre --surface-1", hexOf(tokens, "--warning"), hexOf(tokens, "--surface-1"));
  });
  it("o chevron das sanfonas é medido: marcador fraco (cinza claro sobre claro) reprova abaixo de 3:1", () => {
    assert.ok(contrast("#cccccc", "#ffffff") < NON_TEXT_MIN);
    assert.ok(contrast("#1a1c1f", "#ffffff") >= NON_TEXT_MIN);
  });
  it("a fórmula mede o par conhecido ruim: texto escuro sobre botão escuro dá menos de 3:1", () => {
    assert.ok(contrast("#003734", "#006a65") < 3);
    assert.ok(contrast("#ffffff", "#006a65") >= 4.5);
  });
});
