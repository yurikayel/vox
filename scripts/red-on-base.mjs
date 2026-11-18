#!/usr/bin/env node
/**
 * @file Vermelho na base (PM-111): o teste novo de um PR prova o defeito que diz corrigir?
 *
 * Monta o código da base do PR num diretório temporário (`git worktree`), põe por cima a pasta `tests/` do PR e os
 * `relay/test_*.py` alterados, e roda só os testes novos ou alterados. Em PR `fix:` ao menos um precisa falhar por
 * asserção na base (`AssertionError`); falha por import, sintaxe ou função que não existe na base é inconclusiva,
 * porque o teste pode só estar chamando código novo. Em qualquer outro PR o resultado só informa. O rótulo
 * `red-on-base:skip` pula a exigência (PR `fix:` de CI ou documentação, sem defeito de código para provar).
 *
 * Uso: `node scripts/red-on-base.mjs [base]` (padrão `origin/develop`). Variáveis: `BASE_REF`, `PR_TITLE`,
 * `PR_LABELS` (JSON ou lista separada por vírgula), `PYTHON`, `GITHUB_STEP_SUMMARY`. Plano: docs/TESTES.md §3.4.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPORTER = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), "red-on-base-reporter.mjs"));
const SKIP_LABEL = "red-on-base:skip";
const JS_TEST = /^tests\/[^/]+\.test\.js$/;
const PY_TEST = /^relay\/test_[^/]+\.py$/;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

/**
 * Tipo do PR para a regra: `fix` exige vermelho na base, `skip` pula pelo rótulo, `info` só informa.
 * @param {string} title título do PR (Conventional Commits).
 * @param {string[]} labels rótulos do PR.
 * @returns {"fix" | "skip" | "info"}
 */
export function prKind(title, labels) {
  if (labels.includes(SKIP_LABEL)) return "skip";
  return /^fix(\([^)]*\))?!?:/i.test(title.trim()) ? "fix" : "info";
}

/**
 * Lê os rótulos de `PR_LABELS`, que chega como JSON do GitHub (`["a","b"]`) ou como lista separada por vírgula.
 * @param {string | undefined} raw valor da variável.
 * @returns {string[]}
 */
export function parseLabels(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

/**
 * Separa, dos arquivos adicionados ou alterados no PR, os testes JS (`tests/*.test.js`) e Python (`relay/test_*.py`).
 * @param {string[]} files caminhos com `/`, relativos à raiz.
 * @returns {{ js: string[], py: string[] }}
 */
export function pickTests(files) {
  return { js: files.filter((f) => JS_TEST.test(f)), py: files.filter((f) => PY_TEST.test(f)) };
}

/**
 * Lê o resumo do `unittest` (stderr) de um arquivo: falha por asserção prova, erro é inconclusivo.
 * @param {string} file arquivo de teste.
 * @param {string} output saída do `unittest`.
 * @returns {{ file: string, name: string, outcome: "assert" | "other" | "pass", message: string }}
 */
export function pythonOutcome(file, output) {
  const failed = /FAILED \(([^)]*)\)/.exec(output)?.[1] ?? "";
  const count = (key) => Number(new RegExp(`${key}=(\\d+)`).exec(failed)?.[1] ?? 0);
  const ran = /Ran (\d+) test/.test(output);
  let outcome = "pass";
  if (count("failures") > 0) outcome = "assert";
  else if (count("errors") > 0 || !ran) outcome = "other";
  return { file, name: "(arquivo inteiro)", outcome, message: failed };
}

/**
 * Decide se o PR passa: `fix` precisa de teste alterado e de ao menos uma falha por asserção na base.
 * @param {"fix" | "skip" | "info"} kind tipo do PR.
 * @param {{ outcome: string }[]} results desfecho de cada teste rodado na base.
 * @param {number} testCount quantos arquivos de teste o PR adicionou ou alterou.
 * @returns {{ ok: boolean, headline: string }}
 */
export function verdict(kind, results, testCount) {
  if (kind === "skip") return { ok: true, headline: `Pulado pelo rótulo \`${SKIP_LABEL}\`.` };
  if (kind === "info") return { ok: true, headline: "Só informa (PR não é `fix:`): os testes não foram rodados contra a base." };
  const red = results.filter((r) => r.outcome === "assert").length;
  if (testCount === 0) return { ok: false, headline: "PR `fix:` sem teste novo ou alterado: nada prova o defeito." };
  if (red > 0) return { ok: true, headline: `${red} teste(s) falham por asserção na base: o defeito está provado.` };
  return {
    ok: false,
    headline: "Nenhum teste novo ou alterado falha por asserção na base: o teste não prova o defeito "
      + "(falha por import, tipo ou função ausente é inconclusiva).",
  };
}

/**
 * Monta o resumo em Markdown para o `$GITHUB_STEP_SUMMARY`.
 * @param {{ ok: boolean, headline: string }} result veredito.
 * @param {{ file: string, name: string, outcome: string, message: string }[]} results desfechos.
 * @returns {string}
 */
export function summaryMarkdown(result, results) {
  const label = { assert: "vermelho (asserção)", other: "inconclusivo", pass: "verde" };
  const cell = (text) => String(text).replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
  const rows = results.map((r) => `| \`${cell(r.file)}\` | ${cell(r.name)} | ${label[r.outcome]} | ${cell(r.message)} |`);
  const table = rows.length ? ["", "| Arquivo | Teste | Na base | Mensagem |", "|---|---|---|---|", ...rows] : [];
  return [`## Vermelho na base (PM-111): ${result.ok ? "OK" : "FALHOU"}`, "", result.headline, ...table, ""].join("\n");
}

function prepareBase(baseSha, root, pyFiles) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "red-on-base-"));
  git(["worktree", "add", "--detach", dir, baseSha], root);
  fs.rmSync(path.join(dir, "tests"), { recursive: true, force: true });
  fs.cpSync(path.join(root, "tests"), path.join(dir, "tests"), { recursive: true });
  for (const f of pyFiles) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  const modules = path.join(root, "node_modules");
  if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(dir, "node_modules"), "junction");
  return dir;
}

function removeBase(dir, root) {
  const modules = path.join(dir, "node_modules");
  if (fs.existsSync(modules)) fs.unlinkSync(modules);
  git(["worktree", "remove", "--force", dir], root);
}

function runJs(dir, files) {
  if (!files.length) return [];
  // Rodando dentro de outro `node --test`, NODE_TEST_CONTEXT faria o filho ignorar o reporter.
  const { NODE_TEST_CONTEXT: _ignored, ...env } = process.env;
  const run = spawnSync(process.execPath, ["--test", `--test-reporter=${REPORTER.href}`, ...files], {
    cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env,
  });
  return run.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l))
    .map((r) => ({ ...r, file: path.relative(dir, r.file).replace(/\\/g, "/") || r.file }));
}

function runPy(dir, files) {
  const python = process.env.PYTHON || "python";
  return files.map((f) => {
    const run = spawnSync(python, ["-m", "unittest", "discover", "-s", "relay", "-p", path.basename(f)], {
      cwd: dir, encoding: "utf8",
    });
    return pythonOutcome(f, `${run.stdout}\n${run.stderr}`);
  });
}

function runOnBase(baseSha, root, tests) {
  if (!tests.js.length && !tests.py.length) return [];
  const dir = prepareBase(baseSha, root, tests.py);
  try {
    return [...runJs(dir, tests.js), ...runPy(dir, tests.py)];
  } finally {
    removeBase(dir, root);
  }
}

function main() {
  const root = git(["rev-parse", "--show-toplevel"], process.cwd());
  const baseSha = git(["merge-base", process.env.BASE_REF || process.argv[2] || "origin/develop", "HEAD"], root);
  const changed = git(["diff", "--name-only", "--diff-filter=AM", baseSha, "HEAD"], root).split("\n").filter(Boolean);
  const tests = pickTests(changed);
  const kind = prKind(process.env.PR_TITLE || "", parseLabels(process.env.PR_LABELS));
  const results = kind === "fix" ? runOnBase(baseSha, root, tests) : [];
  const result = verdict(kind, results, tests.js.length + tests.py.length);
  const markdown = summaryMarkdown(result, results);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
