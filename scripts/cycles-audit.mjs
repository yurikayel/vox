#!/usr/bin/env node
/**
 * @file Catraca de ciclos de import do cliente — decisão em docs/adr/035-camadas-e-contextos.md.
 *
 * Acha os componentes fortemente conexos do grafo de imports de `client/js` (AST, via cycles-lib) e compara com
 * `scripts/cycles-debt.json`. Reprova ciclo novo ou componente que ganhou módulo. Componente que encolheu ou sumiu
 * também reprova até o baseline ser baixado (`--prune`), para a dívida só descer. `--list` imprime os componentes.
 *
 * Uso: `node scripts/cycles-audit.mjs [--list|--prune]` (chamado por `npm run audit:layers`).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildGraph, compareCycles, findCycles } from "./cycles-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const JS_ROOT = path.join(ROOT, "client", "js");
const DEBT_FILE = path.join(ROOT, "scripts", "cycles-debt.json");

/**
 * Lista recursivamente os módulos `.js` de um diretório.
 * @param {string} dir Diretório raiz da busca.
 * @returns {string[]}
 */
function listModules(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return listModules(full);
    return e.name.endsWith(".js") ? [full] : [];
  });
}

/**
 * Lê o código de todos os módulos do cliente, indexado pelo caminho relativo.
 * @returns {Object<string, string>}
 */
function loadSources() {
  const sources = {};
  for (const file of listModules(JS_ROOT)) {
    sources[path.relative(JS_ROOT, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
  }
  return sources;
}

/**
 * Descreve um ciclo de imports em uma linha.
 * @param {string[]} comp Módulos do componente fortemente conectado.
 * @returns {string}
 */
function describe(comp) {
  return `${comp.length} módulos: ${comp.join(", ")}`;
}

/**
 * Compara os ciclos atuais com a dívida registrada e reprova se surgir ciclo novo.
 */
function main() {
  const current = findCycles(buildGraph(loadSources()));
  if (process.argv.includes("--list")) {
    current.forEach((c) => console.log(describe(c)));
    return;
  }
  const baseline = JSON.parse(fs.readFileSync(DEBT_FILE, "utf8")).cycles;
  const { fresh, paid } = compareCycles(current, baseline);
  const modules = current.reduce((n, c) => n + c.length, 0);
  console.log(`Catraca de ciclos: ${current.length} componente(s), ${modules} módulo(s) em ciclo.`);
  if (process.argv.includes("--prune") && !fresh.length) {
    fs.writeFileSync(DEBT_FILE, `${JSON.stringify({ cycles: current }, null, 1)}\n`);
    console.log(`Baseline baixado para ${current.length} componente(s).`);
    return;
  }
  for (const c of fresh) console.error(`  NOVO/CRESCEU  ${describe(c)}`);
  for (const c of paid) console.error(`  PAGO  ${describe(c)}  (rode: node scripts/cycles-audit.mjs --prune)`);
  if (fresh.length || paid.length) {
    console.error("\nReprovado pela catraca de ciclos. Decisão: docs/adr/035-camadas-e-contextos.md");
    process.exit(1);
  }
}

main();
