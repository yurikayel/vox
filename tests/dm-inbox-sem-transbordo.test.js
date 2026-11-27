/**
 * @file Caixa de DM sem transbordo no celular: `.dm-inbox-item` é filho flex de `.dm-inbox-row` dentro de uma lista com
 * `overflow: hidden`. Sem `min-width: 0` no item, a prévia em uma linha (`white-space: nowrap`) fixa o tamanho mínimo do
 * item em ~1700 px e o conteúdo some cortado (medido em Chromium a 320 px). Lê as folhas na ordem em que o `index.html`
 * as liga e confere o valor que vence para `min-width` e que a prévia continua com reticências.
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

/** Valor final de `prop` para um seletor simples (sozinho ou em lista), na ordem de carga das folhas. */
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

test("o index.html liga as folhas do app (a leitura da cascata tem o que ler)", () => {
  assert.ok(SHEETS.includes("css/style.css") && SHEETS.includes("css/sv-agora.css"), `folhas lidas: ${SHEETS.join(", ")}`);
});

test("o item da caixa de DM encolhe (min-width: 0) em vez de seguir a prévia em uma linha", () => {
  assert.equal(finalDecl(".dm-inbox-item", "min-width"), "0");
});

test("a prévia da DM continua em uma linha com reticências (o corte é o desenho, não um acidente)", () => {
  assert.equal(finalDecl(".dm-inbox-preview", "white-space"), "nowrap");
  assert.equal(finalDecl(".dm-inbox-preview", "text-overflow"), "ellipsis");
});
