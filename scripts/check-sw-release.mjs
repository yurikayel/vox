#!/usr/bin/env node
/**
 * @file Trava o Service Worker fora do corte de release: PR para `develop` que altera `client/sw.js` (`CACHE_NAME`,
 * `SHELL_ASSETS`, `UNPLUGGED_MODULES`) reprova. O arquivo só muda no PR de corte, que é o de branch `release/*` ou
 * `chore/release-*` ou o que também altera `docs/release-metadata.json` (o corte atualiza os dois juntos).
 *
 * Uso: `node scripts/check-sw-release.mjs [base]` (padrão `origin/develop`). Variáveis: `BASE_REF`, `HEAD_REF` (nome da
 * branch do PR), `GITHUB_STEP_SUMMARY`. O que o CI bloqueia está em docs/HARDENING.md.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SW_FILE = "client/sw.js";
const METADATA_FILE = "docs/release-metadata.json";
const RELEASE_BRANCH = /^(?:release\/|chore\/release-)/;

/**
 * Diz se o nome da branch do PR é de corte de release.
 * @param {string} headRef Nome da branch do PR (`release/…` ou `chore/release-…`).
 * @returns {boolean}
 */
export function isReleaseBranch(headRef) {
  return RELEASE_BRANCH.test(String(headRef || "").trim());
}

/**
 * Decide se o PR pode alterar o Service Worker.
 * @param {string[]} changed Caminhos com `/` alterados no PR, relativos à raiz.
 * @param {string} headRef Nome da branch do PR.
 * @returns {{ ok: boolean, headline: string }}
 */
export function verdict(changed, headRef) {
  if (!changed.includes(SW_FILE)) return { ok: true, headline: `\`${SW_FILE}\` não foi alterado.` };
  if (isReleaseBranch(headRef)) return { ok: true, headline: `\`${SW_FILE}\` alterado em branch de corte (\`${headRef}\`).` };
  if (changed.includes(METADATA_FILE)) return { ok: true, headline: `\`${SW_FILE}\` alterado junto de \`${METADATA_FILE}\` (PR de corte).` };
  return {
    ok: false,
    headline: `PR altera \`${SW_FILE}\` (CACHE_NAME, SHELL_ASSETS ou UNPLUGGED_MODULES) fora de um corte de release. `
      + `O arquivo só muda em branch \`release/*\` ou \`chore/release-*\`, ou no mesmo PR de \`${METADATA_FILE}\`.`,
  };
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

/**
 * Ponto de entrada: lista o que o PR alterou desde a base e aplica a regra.
 */
function main() {
  const root = git(["rev-parse", "--show-toplevel"], process.cwd());
  const base = git(["merge-base", process.env.BASE_REF || process.argv[2] || "origin/develop", "HEAD"], root);
  const changed = git(["diff", "--name-only", base, "HEAD"], root).split("\n").filter(Boolean);
  const result = verdict(changed, process.env.HEAD_REF || "");
  const markdown = `## Service Worker só no corte: ${result.ok ? "OK" : "FALHOU"}\n\n${result.headline}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  if (!result.ok) {
    console.log(`::error::${result.headline}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
