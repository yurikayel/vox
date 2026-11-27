/**
 * @file Popover do filtro da Ágora dentro da tela no celular: `.sv-filtro-menu` é absoluto e, sem âncora à direita, nascia na
 * borda esquerda do botão (157 px a 320 px) e passava do viewport (direita em 349 px). Âncora à direita do botão e teto de
 * largura mantêm o menu dentro de 320, 360 e 390 px (medido em Chromium: 34–226 px nas três larguras). Lê as folhas na
 * ordem do `index.html` e confere os valores que vencem.
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

test("o menu do filtro é absoluto dentro do `.sv-filtro` relativo", () => {
  assert.equal(finalDecl(".sv-filtro-menu", "position"), "absolute");
  assert.equal(finalDecl(".sv-filtro", "position"), "relative");
});

test("o menu ancora na borda direita do botão (cresce para dentro da tela)", () => {
  assert.equal(finalDecl(".sv-filtro-menu", "inset-inline-end"), "0");
  assert.equal(finalDecl(".sv-filtro-menu", "inset-inline-start") ?? finalDecl(".sv-filtro-menu", "left"), null);
});

test("a largura do menu tem teto relativo ao viewport", () => {
  assert.match(finalDecl(".sv-filtro-menu", "max-width") ?? "", /^calc\(100vw\s*-\s*[\d.]+rem\)$/);
});
