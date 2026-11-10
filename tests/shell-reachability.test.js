/**
 * PM-04 + PM-02 — o que o Service Worker baixa na instalação.
 * - Todo módulo do precache (SHELL_ASSETS) tem de ser alcançável a partir de um ponto de entrada
 *   (os <script src> das páginas do cliente), seguindo os imports estáticos e dinâmicos.
 * - Todo módulo inalcançável tem de estar em UNPLUGGED_MODULES (fora do precache).
 * - O tamanho total do precache tem teto: peso só cresce de propósito.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");

/**
 * PM-02: teto do precache em bytes. Medido em 2026-11-09 depois do PM-04: 2.038.578 bytes em 182 arquivos, + ~2% de folga.
 * Meta do PM-01 (dieta do shell): baixar 20% disto. Subir o teto exige justificar no PR.
 * 2026-11-10 (PM-78): 2.081.292 bytes em 193 arquivos; a folga acabou com os 6 módulos do PM-69 e a caixa de
 * saída das DMs (+4,4 KB). Teto sobe só 0,2% acima do medido; a próxima adição precisa vir com corte (PM-01).
 * 2026-11-10 (PM-80): corte de 18,4 KB (o icon.svg embutia o mesmo PNG duas vezes, em href e xlink:href) pagou o
 * peer-sync.js; medido 2.070.279 bytes em 194 arquivos. O teto desce para 0,2% acima do medido (catraca).
 */
const SHELL_BUDGET_BYTES = 2_075_000;

function listFrom(name) {
  const m = sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(m, `${name} precisa existir no sw.js`);
  return m[1].split("\n").map((s) => s.trim().replace(/^['"]|['"],?$/g, "")).filter((s) => s && !s.startsWith("//"));
}

const toRel = (abs) => "./" + path.relative(root, abs).split(path.sep).join("/");

function entryPoints() {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith(".html")).map((f) => path.join(root, f));
  for (const extra of ["download/index.html", "embed/demo.html", "embed/frame-demo.html"]) {
    if (fs.existsSync(path.join(root, extra))) pages.push(path.join(root, extra));
  }
  const entries = [];
  for (const page of pages) {
    for (const m of fs.readFileSync(page, "utf8").matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) {
      if (!/^https?:/.test(m[1])) entries.push(path.resolve(path.dirname(page), m[1]));
    }
  }
  return entries;
}

const IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s*["']([^"']+)["']/g;

function reachable() {
  const seen = new Set();
  const stack = entryPoints();
  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(IMPORT_RE)) {
      const spec = m[1] || m[2] || m[3];
      if (spec.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map(toRel));
}

test("PM-04: todo módulo do precache é alcançável; todo inalcançável está em UNPLUGGED_MODULES", () => {
  const shell = new Set(listFrom("SHELL_ASSETS").filter((a) => a.endsWith(".js") && a.startsWith("./js/")));
  const unplugged = new Set(listFrom("UNPLUGGED_MODULES"));
  const live = reachable();
  const deadInShell = [...shell].filter((a) => !live.has(a));
  assert.deepEqual(deadInShell, [], "módulo sem importador no precache: mova para UNPLUGGED_MODULES (ou plugue)");
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
  const unlisted = walk(path.join(root, "js")).map(toRel).filter((r) => !live.has(r) && !unplugged.has(r));
  assert.deepEqual(unlisted, [], "módulo inalcançável fora da lista UNPLUGGED_MODULES");
  const pluggedButListed = [...unplugged].filter((r) => live.has(r));
  assert.deepEqual(pluggedButListed, [], "módulo já plugado: tire de UNPLUGGED_MODULES e ponha no SHELL_ASSETS");
});

test("PM-02: o precache cabe no orçamento de peso", () => {
  let total = 0;
  for (const asset of listFrom("SHELL_ASSETS")) {
    if (asset === "./") continue;
    total += fs.statSync(path.join(root, asset)).size;
  }
  assert.ok(total <= SHELL_BUDGET_BYTES, `precache com ${total} bytes passou do teto de ${SHELL_BUDGET_BYTES} (PM-02)`);
});
