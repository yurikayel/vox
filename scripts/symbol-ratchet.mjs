#!/usr/bin/env node
/**
 * @file Catraca por símbolo (PM-116, docs/HARDENING.md): para cada arquivo `.js`/`.mjs` que mudou em relação à base,
 * mede as funções de produção, os testes e o módulo pela árvore sintática e reprova o símbolo que piorou em relação à
 * base, ou o símbolo novo que passa do máximo. Não usa arquivo de baseline: a base é o próprio Git (`git show`).
 * Um arquivo renomeado ou movido conta como novo e é julgado pelo máximo.
 *
 * Uso: `npm run audit:symbols` (base `origin/develop`) · `node scripts/symbol-ratchet.mjs --base <ref> [--json]`.
 * Sai com 1 se houver violação.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyFile, compareSymbols, measureSource } from "./symbol-metrics-lib.mjs";

/** Raiz do repositório; `SYMBOL_RATCHET_ROOT` aponta outra (usado pelo teste, que roda num repositório temporário). */
const ROOT = process.env.SYMBOL_RATCHET_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function git(...args) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
}

/**
 * Lê as opções da linha de comando.
 * @param {string[]} argv Argumentos depois do nome do script.
 * @returns {{ base: string, json: boolean }}
 */
function parseArgs(argv) {
  const at = argv.indexOf("--base");
  const base = at >= 0 ? argv[at + 1] : "origin/develop";
  if (!/^\w[\w./~^-]*$/.test(base ?? "")) throw new Error(`ref inválida para --base: ${base}`);
  return { base, json: argv.includes("--json") };
}

/**
 * Arquivos alterados (commitados, no índice ou no disco) e novos sem rastreio, desde o ponto de partida da base.
 * @param {string} mergeBase Commit de partida.
 * @returns {string[]} Caminhos relativos à raiz, com barras normais.
 */
function changedFiles(mergeBase) {
  const tracked = git("diff", "--name-only", "--no-renames", "--diff-filter=ACM", mergeBase).split("\n");
  const untracked = git("ls-files", "--others", "--exclude-standard").split("\n");
  return [...new Set([...tracked, ...untracked])].filter(Boolean).filter((f) => classifyFile(f));
}

function sourceAtBase(mergeBase, rel) {
  try {
    return git("show", `${mergeBase}:${rel}`);
  } catch {
    return null;
  }
}

/**
 * Compara um arquivo com a sua versão na base.
 * @param {string} mergeBase Commit de partida.
 * @param {string} rel Caminho do arquivo.
 * @returns {string[]} Violações do arquivo.
 */
function auditFile(mergeBase, rel) {
  const kind = classifyFile(rel);
  try {
    const before = sourceAtBase(mergeBase, rel);
    const baseMap = before === null ? new Map() : measureSource(before, kind);
    return compareSymbols(baseMap, measureSource(fs.readFileSync(path.join(ROOT, rel), "utf8"), kind), kind);
  } catch (err) {
    return [`não foi possível medir: ${err.message}`];
  }
}

function main() {
  const { base, json } = parseArgs(process.argv.slice(2));
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const files = changedFiles(mergeBase);
  const report = Object.fromEntries(files.map((f) => [f, auditFile(mergeBase, f)]).filter(([, v]) => v.length));
  const total = Object.values(report).reduce((n, v) => n + v.length, 0);
  if (json) console.log(JSON.stringify({ base, mergeBase, files: files.length, violations: report }, null, 2));
  else {
    for (const [file, problems] of Object.entries(report)) console.log(`${file}\n${problems.map((p) => `  ${p}`).join("\n")}`);
    console.log(`Catraca por símbolo: ${files.length} arquivo(s) medido(s) contra ${base}, ${total} violação(ões).`);
  }
  process.exit(total ? 1 : 0);
}

try {
  main();
} catch (err) {
  console.error(`symbol-ratchet: ${err.message}`);
  process.exit(2);
}
