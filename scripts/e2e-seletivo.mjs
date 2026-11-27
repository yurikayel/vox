#!/usr/bin/env node
/**
 * @file Filtro de caminho do job `e2e-seletivo` do PR: diz se o PR toca o que os E2E Python do Fairplay
 * (`e2e/test_fairplay_e2e.py`) e da Mesa em rede (`e2e/test_mesa_rede_e2e.py`) exercitam. Se tocar, o job roda os dois;
 * se não, pula. Os caminhos vêm de `rg` nos imports `/js/...` dos dois arquivos e nos módulos que eles carregam.
 *
 * Uso: `node scripts/e2e-seletivo.mjs [base]` (padrão `origin/develop`). Variáveis: `BASE_REF`, `GITHUB_OUTPUT`
 * (recebe `run=true|false`), `GITHUB_STEP_SUMMARY`. O que o CI roda está em docs/HARDENING.md.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Caminhos (regex, relativos à raiz, com `/`) cuja mudança dispara os dois E2E. */
export const E2E_PATHS = [
  /^client\/js\/dungeon\/vtt-fairplay-[^/]+\.js$/,
  /^client\/js\/dungeon\/vtt-sync-fairplay-guard\.js$/,
  /^client\/js\/dungeon\/dice-engine\.js$/,
  /^client\/js\/dungeon\/dungeon-state\.js$/,
  /^client\/js\/rpg-crypto-table\.js$/,
  /^client\/js\/dungeon\/vtt-(?:rtc-transport|rtc-auth|rede-escolha|signaling-client|sync|sync-codec|host-wire)\.js$/,
  /^client\/js\/dungeon\/dungeon-(?:sync-bridge|vtt-join)\.js$/,
  /^relay\/signaling\.py$/,
  /^e2e\/test_(?:fairplay|mesa_rede|mesa_sync|mesa_ttrpg|vox)_e2e\.py$/,
];

/**
 * Filtra os caminhos alterados que disparam os E2E do Fairplay e da Mesa em rede.
 * @param {string[]} changed Caminhos com `/` alterados no PR, relativos à raiz.
 * @returns {string[]} Os que casam com `E2E_PATHS`.
 */
export function touched(changed) {
  return changed.filter((file) => E2E_PATHS.some((re) => re.test(file)));
}

/**
 * Roda o git com os argumentos dados e devolve a saída padrão sem espaços nas pontas.
 * @param {string[]} args Argumentos do git.
 * @param {string} cwd Diretório de trabalho.
 * @returns {string}
 */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/** Ponto de entrada: lista o que o PR alterou desde a base e escreve `run=` para o job. */
function main() {
  const root = git(["rev-parse", "--show-toplevel"], process.cwd());
  const base = git(["merge-base", process.env.BASE_REF || process.argv[2] || "origin/develop", "HEAD"], root);
  const changed = git(["diff", "--name-only", "--no-renames", base, "HEAD"], root).split("\n").filter(Boolean);
  const hits = touched(changed);
  const run = hits.length > 0;
  const markdown = run
    ? `## E2E Fairplay e Mesa em rede: roda\n\nO PR toca:\n${hits.map((f) => `- \`${f}\``).join("\n")}\n`
    : "## E2E Fairplay e Mesa em rede: pulado\n\nO PR não toca os caminhos dos dois E2E.\n";
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  console.log(markdown);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
