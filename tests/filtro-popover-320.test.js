/**
 * @file Popover do filtro da Ágora dentro da tela no celular. A base ancorava o menu na borda esquerda do botão (157 px a
 * 320 px) e ele passava do viewport; ancorar na direita do botão estreito tirava o menu pela esquerda quando o botão cai
 * na 2ª linha (filtro ativo: de −11 a 181 px, e de −183 a 105 px com texto a 150%). A correção é só de celular
 * (`@media (max-width: 480px)`): a barra vira a âncora, o menu nasce na borda esquerda dela e tem teto de largura.
 * Medido em Chromium: 2–194 px (2–290 com texto a 150%) em 320, 360 e 390 px, com e sem filtro; em 1280 px igual à base.
 *
 * A cascata de `helpers/css-cascata.js` não lê `@media`, então o bloco de celular é lido aqui: o último valor de cada
 * propriedade entre as regras dos blocos que valem a 320 px (ancestral e seletor mais específico incluídos). Fora do
 * `@media` a cascata confere que o desktop não mudou.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildChain, cascade } from "./helpers/css-cascata.js";

const CLIENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client");
const html = fs.readFileSync(path.join(CLIENT, "index.html"), "utf8");
const SHEETS = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="(css\/[^"]+)"/g)].map((m) => m[1]);
const BAR = "html > body > div.app-layout.agora-ui > main > nav.sv-feedbar";
const MENU = `${BAR} > details.sv-filtro > div.sv-filtro-menu`;
const FILTRO = `${BAR} > details.sv-filtro`;

/** Texto entre as chaves que abrem em `from` (já na `{`). */
function braceBody(css, from) {
  let depth = 0;
  for (let i = from; i < css.length; i += 1) {
    depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
    if (depth === 0) return css.slice(from + 1, i);
  }
  return css.slice(from + 1);
}

/** Corpos dos `@media (max-width: Npx)` que valem a 320 px (N ≥ 320), em ordem de carga. */
function phoneMediaBodies() {
  const out = [];
  for (const href of SHEETS) {
    const css = fs.readFileSync(path.join(CLIENT, href), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/@media\s*\(\s*max-width\s*:\s*(\d+)px\s*\)\s*\{/g)) {
      if (Number(m[1]) >= 320) out.push(braceBody(css, m.index + m[0].length - 1));
    }
  }
  return out;
}

/** Último valor de `prop` entre as regras de celular cujo último pedaço do seletor é `last` (uma classe). */
function phoneDecl(last, prop) {
  let value = null;
  for (const body of phoneMediaBodies()) {
    for (const m of body.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const hit = m[1].split(",").some((s) => s.trim().split(/[\s>+~]+/).pop() === last);
      const decl = hit && m[2].match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (decl) value = decl[1].trim();
    }
  }
  return value;
}

const desktop = (path, prop) => cascade(buildChain(path), [prop])?.value ?? null;

test("o index.html liga as folhas lidas (style, agora e sv-agora)", () => {
  for (const sheet of ["css/style.css", "css/agora.css", "css/sv-agora.css"]) assert.ok(SHEETS.includes(sheet), `${sheet} fora do index.html`);
});

test("no celular a barra é a âncora do menu e o botão deixa de ser (o botão pode cair na 2ª linha)", () => {
  assert.equal(phoneDecl(".sv-feedbar", "position"), "relative");
  assert.equal(phoneDecl(".sv-filtro", "position"), "static");
});

test("no celular o menu nasce na borda esquerda da barra, sem âncora à direita, e tem teto de largura", () => {
  assert.equal(phoneDecl(".sv-filtro-menu", "inset-inline-start"), "0");
  assert.equal(phoneDecl(".sv-filtro-menu", "inset-inline-end"), null);
  assert.match(phoneDecl(".sv-filtro-menu", "max-width") ?? "", /^calc\(100vw\s*-\s*[\d.]+rem\)$/);
});

test("fora do celular nada muda: menu absoluto sob o botão relativo, sem âncora à direita nem teto", () => {
  assert.equal(desktop(MENU, "position"), "absolute");
  assert.equal(desktop(FILTRO, "position"), "relative");
  assert.equal(desktop(MENU, "inset-inline-end"), null);
  assert.equal(desktop(MENU, "inset-inline-start"), null);
  assert.equal(desktop(MENU, "max-width"), null);
  assert.equal(desktop(BAR, "position"), null);
});

test("o menu não cresce além do que o celular comporta (min-width de 12rem, não de 40rem)", () => {
  const w = desktop(MENU, "min-width");
  assert.ok(Number.parseFloat(w) <= 12 && /rem$/.test(w ?? ""), `min-width que vence: ${w}`);
});
