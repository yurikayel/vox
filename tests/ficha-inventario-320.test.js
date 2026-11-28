/**
 * Guarda de cascata (sem navegador): a mochila 10×4 da ficha, a 320 px de tela, tem células de 24 px ou mais nos dois
 * eixos (WCAG 2.5.8) e a coluna da ficha não cresce com o conteúdo (sem rolagem horizontal).
 *
 * A conta lê as folhas na ordem em que a tela as carrega (`style.css`, `agora.css`, `dungeon-layout.css`, `sv-ficha.css`) e percorre a
 * cadeia de elementos que o código monta: moldura → `main` → grade da ficha → coluna → painel → mochila. Não há largura
 * medida nem constante: o padding, a borda, o gap, o número de colunas e a altura da linha vêm das regras que valem a 320 px.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCss } from "./helpers/css-contrato.js";

const VIEWPORT = 320;
const MIN_TARGET = 24;
const REM_PX = 16;
const SHEETS = ["style.css", "agora.css", "dungeon-layout.css", "sv-ficha.css"];
/** Cadeia do DOM da ficha, da moldura à mochila (origem: screen-sheet.js e screen-sheet-inventory.js). */
const CHAIN = [["dungeon-sanctum"], ["dungeon-main"], ["dungeon-sheet-layout"], ["dungeon-sheet-main"], ["dungeon-panel"], ["dungeon-backpack-grid"]];

/** Remove comentários e devolve as regras com o contexto de `@media` em que valem. */
function parseRules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [];
  const walk = (chunk, media) => {
    for (const m of chunk.matchAll(/(@media[^{]+)\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}|([^{}@]+)\{([^{}]*)\}/g)) {
      if (m[1]) walk(m[2], m[1]);
      else rules.push({ selectors: m[3].split(",").map((s) => s.trim()), body: m[4], media: media || "" });
    }
  };
  walk(text, "");
  return rules;
}

const WIDTH_COND = /\(\s*(?:(max|min)-width\s*:\s*([\d.]+)(px|em)|width\s*(<|>=)\s*([\d.]+)(em))\s*\)/g;

/** `@media` por largura vale pela largura (`max-width`/`min-width` em px ou em, e `width < Nem`/`width >= Nem`, com 1em = 16 px); qualquer outra condição não conta. */
function mediaApplies(media, width) {
  if (!media) return true;
  const conds = [...media.matchAll(WIDTH_COND)];
  const rest = media.replace(/@media|and/g, "").replace(WIDTH_COND, "").trim();
  if (!conds.length || rest) return false;
  return conds.every(([, kind, v, unit, op, rv]) => {
    if (op) return op === "<" ? width < Number(rv) * REM_PX : width >= Number(rv) * REM_PX;
    const px = Number(v) * (unit === "em" ? REM_PX : 1);
    return kind === "max" ? width <= px : width >= px;
  });
}

/** Seletor só com descendentes e classes: casa com a cadeia se cada composto é subconjunto das classes de algum ancestral, em ordem. */
function matchSpecificity(selector, chainIndex) {
  if (/[>+~:\[#*]/.test(selector)) return -1;
  const compounds = selector.split(/\s+/).map((c) => c.split(".").filter(Boolean));
  const last = compounds.pop();
  if (!last.every((c) => CHAIN[chainIndex].includes(c))) return -1;
  let at = chainIndex - 1;
  for (const comp of compounds.reverse()) {
    while (at >= 0 && !comp.every((c) => CHAIN[at].includes(c))) at -= 1;
    if (at < 0) return -1;
    at -= 1;
  }
  return selector.split(/[\s.]+/).filter(Boolean).length;
}

/** Declarações que valem para o elemento da cadeia: especificidade, depois ordem das folhas e das regras. */
function effective(rulesByOrder, chainIndex, width) {
  const hits = [];
  rulesByOrder.forEach((rule, order) => {
    if (!mediaApplies(rule.media, width)) return;
    for (const sel of rule.selectors) {
      const spec = matchSpecificity(sel, chainIndex);
      if (spec >= 0) hits.push({ spec, order, body: rule.body });
    }
  });
  return hits.sort((a, b) => a.spec - b.spec || a.order - b.order).flatMap((h) => h.body.split(";").map((d) => d.trim()).filter(Boolean));
}

function tokens() {
  const out = new Map();
  for (const m of readCss("style.css").matchAll(/(--space-[a-z]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

function toPx(value, vars = tokens()) {
  const v = String(value).trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (ref) {
    assert.ok(vars.has(ref[1]), `token ${ref[1]} sem definição`);
    return toPx(vars.get(ref[1]), vars);
  }
  const m = v.match(/^(-?[\d.]+)(px|rem)$/);
  assert.ok(m, `valor sem origem em px/rem/token: "${v}"`);
  return Number(m[1]) * (m[2] === "rem" ? REM_PX : 1);
}

/** Padding horizontal (esquerda + direita) e borda horizontal do elemento, pelas declarações na ordem em que valem. */
function horizontal(decls) {
  let pad = [0, 0];
  let border = 0;
  for (const d of decls) {
    const at = d.indexOf(":");
    const prop = d.slice(0, at).trim();
    const vals = d.slice(at + 1).trim().split(/\s+(?![^(]*\))/);
    if (prop === "padding") pad = [toPx(vals[3] ?? vals[1] ?? vals[0]), toPx(vals[1] ?? vals[0])];
    if (prop === "padding-inline") pad = [toPx(vals[0]), toPx(vals[1] ?? vals[0])];
    if (prop === "padding-left") pad[0] = toPx(vals[0]);
    if (prop === "padding-right") pad[1] = toPx(vals[0]);
    if (prop === "border") border = toPx(vals[0]) * 2;
  }
  return { pad: pad[0] + pad[1], border };
}

function lastValue(decls, prop) {
  const hit = decls.filter((d) => d.slice(0, d.indexOf(":")).trim() === prop).pop();
  return hit ? hit.slice(hit.indexOf(":") + 1).trim() : null;
}

/** Calcula a mochila a `width` px: largura da grade, da célula e altura da linha. */
function geometry(width) {
  const rules = SHEETS.flatMap((s) => parseRules(readCss(s)));
  const decls = CHAIN.map((_, i) => effective(rules, i, width));
  let avail = width;
  for (const i of [1, 4]) {
    const { pad, border } = horizontal(decls[i]);
    avail -= pad + border;
  }
  const grid = decls[5];
  const { pad, border } = horizontal(grid);
  const cols = Number(lastValue(grid, "grid-template-columns").match(/^repeat\(\s*(\d+)\s*,/)[1]);
  const gap = toPx(lastValue(grid, "gap"));
  const rowH = toPx(lastValue(grid, "grid-template-rows").match(/^repeat\(\s*\d+\s*,\s*([^)]+)\)$/)[1]);
  const gridW = avail;
  return { column: lastValue(decls[2], "grid-template-columns"), gridW, cell: (gridW - pad - border - (cols - 1) * gap) / cols, rowH, cols, gap };
}

test("a cadeia de classes da ficha, usada na conta, existe no código que monta a tela", () => {
  const sheet = readFileSync(new URL("../client/js/dungeon/screen-sheet.js", import.meta.url), "utf8");
  const inventory = readFileSync(new URL("../client/js/dungeon/screen-sheet-inventory.js", import.meta.url), "utf8");
  for (const cls of ["dungeon-sheet-layout", "dungeon-sheet-main"]) assert.ok(sheet.includes(`class="${cls}"`), cls);
  assert.ok(inventory.includes(`<section class="dungeon-panel"`) && inventory.includes(`class="dungeon-backpack-grid"`));
  assert.ok(readFileSync(new URL("../client/js/dungeon/screen-sheet-tabs.js", import.meta.url), "utf8").includes("dungeon-sheet-tab-panel"));
});

test("a 320 px a célula da mochila tem 24 px ou mais nos dois eixos (WCAG 2.5.8)", () => {
  const g = geometry(VIEWPORT);
  assert.ok(g.cell >= MIN_TARGET, `célula ${g.cell.toFixed(1)} px < ${MIN_TARGET} (grade ${g.gridW} px, ${g.cols} colunas, gap ${g.gap})`);
  assert.ok(g.rowH >= MIN_TARGET, `linha ${g.rowH} px < ${MIN_TARGET}`);
});

test("a coluna da ficha não cresce com o conteúdo: minmax(0, 1fr), sem rolagem horizontal", () => {
  const { column } = geometry(VIEWPORT);
  assert.match(column || "", /^minmax\(\s*0(px)?\s*,\s*1fr\s*\)$/, `coluna "${column}": o 1fr puro deixa as palavras dos itens alargarem a página`);
});
