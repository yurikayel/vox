/**
 * @file Linha de rede em "Contas vinculadas" sem texto cortado a 320 px: com o botão "Conectar" na terceira coluna, a
 * coluna do texto ficava com 57 px e "Não conectado" (88 px) era cortado com reticências, sem alternativa. Nas telas
 * estreitas o botão desce para uma linha própria, e o subtítulo quebra em vez de cortar (medido em Chromium: sem corte a
 * 320, 360 e 390 px). Lê as folhas na ordem do `index.html` e confere o que vence.
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

/** Valor final de `prop` para um seletor (sozinho ou em lista), na ordem de carga; `inMedia` lê só dentro de `@media`. */
function finalDecl(selector, prop, { inMedia = false } = {}) {
  let value = null;
  for (const href of SHEETS) {
    const css = fs.readFileSync(path.join(CLIENT, href), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const scoped = inMedia ? [...css.matchAll(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)].map((m) => m[1]).join("\n") : css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, "");
    for (const m of scoped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!m[1].split(",").map((s) => s.trim()).includes(selector)) continue;
      const decl = m[2].match(new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`));
      if (decl) value = decl[1].trim();
    }
  }
  return value;
}

test("o subtítulo da conta quebra de linha em vez de cortar com reticências", () => {
  assert.equal(finalDecl(".link-sub", "white-space"), "normal");
  assert.equal(finalDecl(".link-sub", "text-overflow"), null);
  assert.equal(finalDecl(".link-sub", "overflow-wrap"), "break-word");
});

test("nas telas estreitas a linha com botão Conectar tem 2 colunas e o botão ocupa a linha de baixo", () => {
  const row = finalDecl(".link-row-main:has(.btn-link-connect)", "grid-template-columns", { inMedia: true });
  assert.equal(row, "32px minmax(0, 1fr)");
  assert.equal(finalDecl(".link-row-main .btn-link-connect", "grid-column", { inMedia: true }), "1 / -1");
});

test("fora das telas estreitas a linha segue com 3 colunas (texto, botão)", () => {
  assert.equal(finalDecl(".link-row-main:has(.btn-link-connect)", "grid-template-columns"), "32px minmax(0, 1fr) auto");
});
