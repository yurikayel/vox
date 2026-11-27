/**
 * @file Contraste do texto sobre `--success` e `--danger` nos dois temas (WCAG AA, 4,5:1, mesma fórmula do
 * `sv-contraste-pares-on.test.js`). No tema escuro esses fundos são claros (`#69dba9`, `#ffb4ab`) e o texto fixo `#fff`
 * dava ~1,7:1 no selo "Ajudando a rede"/"Ajuda pausada", no botão de perigo ao passar o mouse e no aviso de erro.
 * O texto agora é `--on-accent`, que já troca por tema. Mede o seletor renderizado (cor e fundo resolvidos pela ordem
 * das folhas) e o HTML do selo, por cada caminho de tema: atributo `data-color-mode` e `@media (prefers-color-scheme)`.
 */
import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderNetworkHeader } from "../client/js/render/network-sections.js";

const CSS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/css");
const SHEETS = ["style.css", "agora.css"];
const readCss = (name) => fs.readFileSync(path.join(CSS_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const SELECTORS = {
  dark: { media: "prefers-color-scheme: dark", inMedia: ':root:not([data-color-mode="light"])', attr: '[data-color-mode="dark"]' },
  light: { media: "prefers-color-scheme: light", inMedia: ':root:not([data-color-mode="dark"])', attr: '[data-color-mode="light"]' },
};
const FILLED_SELECTORS = [".vox-toast.error", ".btn-danger:hover"];
const ROUTES = [
  ["dark", "attr"],
  ["dark", "media"],
  ["light", "attr"],
  ["light", "media"],
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

function addVars(body, into) {
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    const prop = decl.slice(0, colon).trim();
    if (colon > 0 && prop.startsWith("--")) into.set(prop, decl.slice(colon + 1).trim());
  }
}

/** Soma em `into` as variáveis de um bloco de folha que valem para o tema e o caminho pedidos. */
function addThemeBlock(blk, sel, route, into) {
  if (blk.selector === ":root" || (route !== "media" && blk.selector.includes(sel.attr))) return addVars(blk.body, into);
  if (route === "attr" || !blk.selector.startsWith("@media") || !blk.selector.includes(sel.media)) return;
  for (const inner of blocks(blk.body)) if (inner.selector === sel.inMedia) addVars(inner.body, into);
}

/** Variáveis de um tema pelo caminho pedido (`attr`, `media` ou `both`), na ordem em que as folhas carregam. */
function resolveTheme(theme, route) {
  const tokens = new Map();
  for (const file of SHEETS) for (const blk of blocks(readCss(file))) addThemeBlock(blk, SELECTORS[theme], route, tokens);
  return tokens;
}

function hexOf(tokens, raw, depth = 0) {
  if (!raw || depth > 10) return null;
  if (/^#[0-9a-f]{3}$/i.test(raw)) return `#${[...raw.slice(1)].map((c) => c + c).join("")}`.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  const ref = raw.match(/^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i);
  return ref ? hexOf(tokens, tokens.get(ref[1]), depth + 1) : null;
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

/** Valor de `prop` na última regra que cita o seletor (sozinho ou em lista), na ordem das folhas. */
function renderedDecl(selector, prop) {
  let value = null;
  for (const file of SHEETS) {
    for (const blk of blocks(readCss(file))) {
      const listed = blk.selector.split(",").map((s) => s.trim());
      const m = listed.includes(selector) && blk.body.match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (m) value = m[1].trim();
    }
  }
  return value;
}

/** Pares `[texto, fundo]` dos selos de estado da rede (estilo em linha) para os dois estados. */
function badgePairs() {
  const pairs = [];
  for (const enabled of [true, false]) {
    const html = renderNetworkHeader({ settings: { enabled }, metrics: {}, rtcStatus: {}, gatewayHealth: {} });
    const m = html.match(/<span class="pill" style="background:\s*([^;"]+);\s*color:\s*([^;"]+);?">/);
    assert.ok(m, `selo de estado da rede (enabled=${enabled}) não encontrado no HTML`);
    pairs.push({ enabled, bg: m[1].trim(), fg: m[2].trim() });
  }
  return pairs;
}

describe("contraste do texto sobre --success e --danger", () => {
  for (const [theme, route] of ROUTES) {
    const where = route === "attr" ? "atributo data-color-mode" : "@media prefers-color-scheme (automático)";
    it(`tema ${theme} (${where}): seletores de erro/perigo preenchidos`, () => {
      const tokens = resolveTheme(theme, route);
      for (const selector of FILLED_SELECTORS) {
        const fg = hexOf(tokens, renderedDecl(selector, "color"));
        const bg = hexOf(tokens, renderedDecl(selector, "background"));
        assertRatio(`${theme}/${route}: ${selector}`, fg, bg);
      }
    });
    it(`tema ${theme} (${where}): selo "Ajudando a rede" / "Ajuda pausada"`, () => {
      const tokens = resolveTheme(theme, route);
      for (const { enabled, bg, fg } of badgePairs()) {
        assertRatio(`${theme}/${route}: selo enabled=${enabled} (${fg} sobre ${bg})`, hexOf(tokens, fg), hexOf(tokens, bg));
      }
    });
  }
  it("o selo usa mesmo --success quando ajuda e --danger quando pausa (o teste não mede par trocado)", () => {
    const [on, off] = badgePairs();
    assert.equal(on.bg, "var(--success)");
    assert.equal(off.bg, "var(--danger)");
  });
  it("a fórmula mede o par ruim conhecido: #fff sobre o verde claro do tema escuro dá menos de 3:1", () => {
    assert.ok(contrast("#ffffff", "#69dba9") < 3);
    assert.ok(contrast("#00201e", "#69dba9") >= 4.5);
  });
});
