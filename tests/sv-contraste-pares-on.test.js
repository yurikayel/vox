/**
 * @file Contraste dos pares "texto sobre cor" (`--sa-on-*` sobre `--sa-*`) nos dois temas, com a mesma fórmula WCAG do
 * `a11y-wcag-aa.test.js`. No tema claro, `--sa-on-primary`, `--sa-on-secondary` e `--sa-on-tertiary` não eram
 * redefinidos (ficavam com o valor do escuro, ~2:1 sobre botão primário e selos) e `--sa-error-container` não tinha
 * cor de texto. Resolve os temas a partir de `style.css`, `agora.css` e das folhas `sv-*.css`.
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
  ["--sv-on-ok", "--sa-tertiary"],
  ["--sv-on-error-container", "--sa-error-container"],
];

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

/** Variáveis de um tema: `:root`, o bloco de mídia do tema e o atributo `data-color-mode`, na ordem do CSS. */
function themeVars(css, theme, into) {
  const sel = SELECTORS[theme];
  for (const blk of blocks(css)) {
    if (blk.selector === ":root" || blk.selector.includes(sel.attr)) addVars(blk.body, into);
    else if (blk.selector.startsWith("@media") && blk.selector.includes(sel.media)) {
      for (const inner of blocks(blk.body)) if (inner.selector === sel.inMedia) addVars(inner.body, into);
    }
  }
}

function resolveTheme(theme) {
  const tokens = new Map();
  for (const file of ["style.css", "agora.css", ...SV_SHEETS]) themeVars(readCss(file), theme, tokens);
  return tokens;
}

function hexOf(tokens, key, depth = 0) {
  const raw = key.startsWith("#") || key.startsWith("var(") ? key : tokens.get(key);
  if (!raw || depth > 10) return null;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*\)$/i);
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

function assertPairs(theme) {
  const tokens = resolveTheme(theme);
  for (const [fgKey, bgKey] of PAIRS) {
    const fg = hexOf(tokens, fgKey);
    const bg = hexOf(tokens, bgKey);
    assert.ok(fg, `${theme}: ${fgKey} não resolveu para hex`);
    assert.ok(bg, `${theme}: ${bgKey} não resolveu para hex`);
    const ratio = contrast(fg, bg);
    assert.ok(ratio >= 4.5, `${theme}: ${fgKey} (${fg}) sobre ${bgKey} (${bg}) = ${ratio.toFixed(2)}:1 (< 4.5:1)`);
  }
}

/** Valor de `prop` na última regra de seletor exato, na ordem em que as folhas carregam. */
function renderedDecl(selector, prop) {
  let value = null;
  for (const file of ["agora.css", ...SV_SHEETS]) {
    for (const blk of blocks(readCss(file))) {
      const m = blk.selector === selector && blk.body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (m) value = m[1].trim();
    }
  }
  return value;
}

describe("contraste dos pares on-* sobre a cor cheia", () => {
  it("tema claro: botão primário, selos e fundo de erro têm texto legível (AA, 4,5:1)", () => assertPairs("light"));
  it("tema escuro: os mesmos pares seguem legíveis (AA, 4,5:1)", () => assertPairs("dark"));
  for (const theme of ["light", "dark"]) {
    it(`${theme}: o contador de mensagens renderizado (.agora-dm-badge) lê AA sobre o seu fundo`, () => {
      const tokens = resolveTheme(theme);
      const fg = hexOf(tokens, renderedDecl(".agora-dm-badge", "color"));
      const bg = hexOf(tokens, renderedDecl(".agora-dm-badge", "background"));
      assert.ok(fg && bg, `${theme}: cor do contador não resolveu`);
      const ratio = contrast(fg, bg);
      assert.ok(ratio >= 4.5, `${theme}: contador ${fg} sobre ${bg} = ${ratio.toFixed(2)}:1 (< 4.5:1)`);
    });
  }
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
