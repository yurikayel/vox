/**
 * @file Contraste do texto sobre cor cheia nos dois temas, com a mesma fórmula WCAG do `a11y-wcag-aa.test.js`.
 * No tema claro, `--sa-on-primary` e `--sa-on-secondary` ficavam com o valor do escuro (~2:1) e o botão primário da
 * mesa e a célula do jogador fixavam `#00201e`. Os pares `--sv-on-*` de `sv-tokens.css` corrigem, e os seletores que
 * falhavam apontam para eles. Mede o par e o seletor renderizado (cor e fundo resolvidos pela ordem das folhas), e
 * cada caminho de tema separado: atributo `data-color-mode` e `@media (prefers-color-scheme)` sem atributo.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/css");
const readCss = (name) => fs.readFileSync(path.join(CSS_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const SV_SHEETS = fs.readdirSync(CSS_DIR).filter((f) => /^sv-.*\.css$/.test(f)).sort();
const PAIRS = [
  ["--sv-on-primary", "--sa-primary"],
  ["--sv-on-civic", "--sa-secondary"],
];
const CONSUMERS = [".dungeon-btn-primary", ".dungeon-grid-cell.is-player", ".agora-dm-badge"];

/** Blocos `{ selector, body }` de um nível, com chaves casadas. */
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open < 0) break;
    let depth = 0;
    let close = open;
    for (; close < css.length; close += 1) {
      depth += css[close] === "{" ? 1 : css[close] === "}" ? -1 : 0;
      if (depth === 0) break;
    }
    out.push({ selector: css.slice(i, open).trim(), body: css.slice(open + 1, close) });
    i = close + 1;
  }
  return out;
}

/** Declarações `--x: valor` de um corpo de regra, somadas em `into`. */
function addVars(body, into) {
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    const prop = decl.slice(0, colon).trim();
    if (colon > 0 && prop.startsWith("--")) into.set(prop, decl.slice(colon + 1).trim());
  }
}

const SELECTORS = {
  dark: { media: "prefers-color-scheme: dark", inMedia: ':root:not([data-color-mode="light"])', attr: '[data-color-mode="dark"]' },
  light: { media: "prefers-color-scheme: light", inMedia: ':root:not([data-color-mode="dark"])', attr: '[data-color-mode="light"]' },
};

/** Variáveis de um tema pelo caminho pedido: `attr` (atributo), `media` (modo automático) ou `both`. */
function themeVars(css, theme, route, into) {
  const sel = SELECTORS[theme];
  for (const blk of blocks(css)) {
    if (blk.selector === ":root" || (route !== "media" && blk.selector.includes(sel.attr))) addVars(blk.body, into);
    else if (route !== "attr" && blk.selector.startsWith("@media") && blk.selector.includes(sel.media)) {
      for (const inner of blocks(blk.body)) if (inner.selector === sel.inMedia) addVars(inner.body, into);
    }
  }
}

function resolveTheme(theme, route = "both") {
  const tokens = new Map();
  for (const file of ["style.css", "agora.css", ...SV_SHEETS]) themeVars(readCss(file), theme, route, tokens);
  return tokens;
}

function hexOf(tokens, key, depth = 0) {
  const raw = key.startsWith("#") || key.startsWith("var(") ? key : tokens.get(key);
  if (!raw || depth > 10) return null;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i);
  return ref ? hexOf(tokens, ref[1], depth + 1) : null;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function assertRatio(label, fg, bg) {
  assert.ok(fg && bg, `${label}: cor não resolveu (texto ${fg}, fundo ${bg})`);
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= 4.5, `${label}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (< 4.5:1)`);
}

function assertPairs(theme, route) {
  const tokens = resolveTheme(theme, route);
  for (const [fgKey, bgKey] of PAIRS) assertRatio(`${theme}/${route}: ${fgKey} sobre ${bgKey}`, hexOf(tokens, fgKey), hexOf(tokens, bgKey));
}

/** Valor de `prop` na última regra que cita o seletor (sozinho ou em lista), na ordem em que as folhas carregam. */
function renderedDecl(selector, prop) {
  let value = null;
  for (const file of ["agora.css", ...SV_SHEETS]) {
    for (const blk of blocks(readCss(file))) {
      const listed = blk.selector.split(",").map((s) => s.trim());
      const m = listed.includes(selector) && blk.body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (m) value = m[1].trim();
    }
  }
  return value;
}

function assertConsumers(theme, route) {
  const tokens = resolveTheme(theme, route);
  for (const selector of CONSUMERS) {
    const fg = hexOf(tokens, renderedDecl(selector, "color") ?? "");
    const bg = hexOf(tokens, renderedDecl(selector, "background") ?? "");
    assertRatio(`${theme}/${route}: ${selector}`, fg, bg);
  }
}

describe("contraste do texto sobre cor cheia (pares --sv-on-* e seletores renderizados)", () => {
  for (const route of ["attr", "media"]) {
    it(`tema claro pelo caminho ${route === "attr" ? "do atributo data-color-mode" : "@media prefers-color-scheme (modo automático)"}`, () => {
      assertPairs("light", route);
      assertConsumers("light", route);
    });
  }
  it("tema escuro: pares e seletores seguem legíveis", () => {
    assertPairs("dark", "both");
    assertConsumers("dark", "both");
  });
  it("o index.html liga sv-tokens.css depois de agora.css, para a folha vencer a cascata", () => {
    const html = fs.readFileSync(path.join(CSS_DIR, "../index.html"), "utf8");
    const agora = html.indexOf('href="css/agora.css"');
    const tokens = html.indexOf('href="css/sv-tokens.css"');
    assert.ok(agora >= 0, "agora.css não está ligado no index.html");
    assert.ok(tokens > agora, "sv-tokens.css precisa vir depois de agora.css no index.html");
  });
  it("a fórmula mede o par conhecido ruim: texto escuro sobre botão escuro dá menos de 3:1", () => {
    assert.ok(contrast("#003734", "#006a65") < 3);
    assert.ok(contrast("#ffffff", "#006a65") >= 4.5);
  });
});
