/**
 * Vermelho na base (PM-111): regras puras do script e um repositório git de mentira que roda o script de ponta a
 * ponta. O fixture tem uma função com defeito na base e dois PRs: um com teste que pega o defeito por asserção e
 * outro com teste que só chama uma função nova (inconclusivo, tem de reprovar em PR `fix:`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { failureOutcome } from "../scripts/red-on-base-reporter.mjs";
import { parseLabels, pickTests, prKind, pythonOutcome, summaryMarkdown, verdict } from "../scripts/red-on-base.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "red-on-base.mjs");

test("red-on-base: tipo do PR sai do título e do rótulo", () => {
  assert.equal(prKind("fix: corrige a fila", []), "fix");
  assert.equal(prKind("fix(relay)!: corrige", []), "fix");
  assert.equal(prKind("feat: novo", []), "info");
  assert.equal(prKind("docs: fix de link", []), "info");
  assert.equal(prKind("fix: ci", ["red-on-base:skip"]), "skip");
});

test("red-on-base: rótulos chegam como JSON do GitHub ou lista", () => {
  assert.deepEqual(parseLabels('["a","red-on-base:skip"]'), ["a", "red-on-base:skip"]);
  assert.deepEqual(parseLabels("a, b"), ["a", "b"]);
  assert.deepEqual(parseLabels(undefined), []);
});

test("red-on-base: só testes da raiz de tests/ e do relay entram", () => {
  const picked = pickTests(["tests/a.test.js", "tests/helpers/x.test.js", "tests/setup.js", "relay/test_b.py", "relay/server.py"]);
  assert.deepEqual(picked, { js: ["tests/a.test.js"], py: ["relay/test_b.py"] });
});

test("red-on-base: só a asserção prova; pai de subteste não conta", () => {
  assert.equal(failureOutcome({ cause: { code: "ERR_ASSERTION" } }), "assert");
  assert.equal(failureOutcome({ cause: new TypeError("x is not a function") }), "other");
  assert.equal(failureOutcome({ failureType: "subtestsFailed" }), null);
});

test("red-on-base: unittest separa falha de erro", () => {
  assert.equal(pythonOutcome("f", "Ran 3 tests\nFAILED (failures=1, errors=2)").outcome, "assert");
  assert.equal(pythonOutcome("f", "Ran 1 test\nFAILED (errors=1)").outcome, "other");
  assert.equal(pythonOutcome("f", "Ran 2 tests\nOK").outcome, "pass");
  assert.equal(pythonOutcome("f", "ModuleNotFoundError").outcome, "other");
});

test("red-on-base: veredito exige vermelho por asserção só em fix", () => {
  const red = [{ outcome: "assert" }];
  const inconclusive = [{ outcome: "other" }, { outcome: "pass" }];
  assert.equal(verdict("fix", red, 1).ok, true);
  assert.equal(verdict("fix", inconclusive, 1).ok, false);
  assert.equal(verdict("fix", [], 0).ok, false);
  assert.equal(verdict("info", inconclusive, 1).ok, true);
  assert.equal(verdict("skip", [], 0).ok, true);
});

test("red-on-base: resumo escapa barra, contrabarra e quebra de linha da tabela", () => {
  const md = summaryMarkdown({ ok: false, headline: "h" }, [{ file: "tests/a.test.js", name: "n|m", outcome: "other", message: "a\\|b\nc" }]);
  assert.match(md, /FALHOU/);
  assert.ok(md.includes("| n\\|m |"), md);
  assert.ok(md.includes("| a\\\\\\|b c |"), md);
});

function sh(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

/** Repositório com `soma` errada na base; devolve o diretório e o SHA da base. */
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "red-on-base-fixture-"));
  sh(dir, "init", "-q", "-b", "main");
  write(dir, "client/soma.js", "export const soma = (a, b) => a - b;\n");
  write(dir, "tests/vazio.test.js", 'import test from "node:test";\ntest("ok", () => {});\n');
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "base");
  return { dir, base: sh(dir, "rev-parse", "HEAD").trim() };
}

function runScript(dir, base, title) {
  const env = { ...process.env, BASE_REF: base, PR_TITLE: title, PR_LABELS: "", GITHUB_STEP_SUMMARY: "" };
  return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", env });
}

test("red-on-base: PR fix com teste que pega o defeito passa", () => {
  const { dir, base } = fixtureRepo();
  write(dir, "client/soma.js", "export const soma = (a, b) => a + b;\n");
  write(dir, "tests/soma.test.js", 'import test from "node:test";\nimport assert from "node:assert/strict";\n'
    + 'import { soma } from "../client/soma.js";\ntest("soma", () => assert.equal(soma(2, 2), 4));\n');
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "fix");
  const run = runScript(dir, base, "fix: soma");
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /vermelho \(asserção\)/);
  assert.equal(sh(dir, "worktree", "list").trim().split("\n").length, 1, "worktree temporário removido");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("red-on-base: PR fix com teste que só chama função nova reprova", () => {
  const { dir, base } = fixtureRepo();
  write(dir, "client/soma.js", "export const soma = (a, b) => a + b;\nexport const dobro = (a) => soma(a, a);\n");
  write(dir, "tests/dobro.test.js", 'import test from "node:test";\nimport assert from "node:assert/strict";\n'
    + 'import { dobro } from "../client/soma.js";\ntest("dobro", () => assert.equal(dobro(2), 4));\n');
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "fix");
  const fix = runScript(dir, base, "fix: soma");
  assert.equal(fix.status, 1, fix.stdout + fix.stderr);
  assert.match(fix.stdout, /inconclusivo/);
  assert.equal(runScript(dir, base, "feat: dobro").status, 0, "em feat só informa");
  fs.rmSync(dir, { recursive: true, force: true });
});
