/**
 * @file Testes do mutador AST mínimo para Tier A (PM-112).
 *
 * Cobre descoberta via AST (`espree`, sem regex), parse de diff/flags,
 * execução real em `os.tmpdir()` com mutantes mortos e sobreviventes,
 * restauração íntegra byte-a-byte e modo `--base` em repositório git temporário.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  aggregateReports,
  applyMutant,
  discoverMutants,
  formatTextReport,
  isTierAFile,
  loadTierAPatterns,
  parseArgs,
  parseChangedLines,
  resolveTestsForFile,
  runFileMutation,
} from "../scripts/mutate-tier-a.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "mutate-tier-a.mjs");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function writeFile(baseDir, relPath, content) {
  const full = path.join(baseDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf8");
  return full;
}

function gitIn(cwd, ...args) {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  });
}

test("PM-112 AST: descobre operadores binários, lógicos, if e booleanos sem tocar comentários/strings", () => {
  const sample = [
    '// comentario com === && true if (a < b)',
    'export const NOTE = "a === b && c > d || false";',
    "export function check(a, b, flag) {",
    "  if (a === b && flag == true) return a < b;",
    "  return a >= b || false;",
    "}",
  ].join("\n");
  const mutants = discoverMutants(sample);
  assert.ok(mutants.every((m) => m.line >= 4), "ignora comentários (L1) e strings literais (L2)");
  const pairs = mutants.map((m) => `${m.kind}:${m.original}->${m.replacement}`);
  assert.ok(pairs.includes("if-condition:a === b && flag == true->!(a === b && flag == true)"));
  assert.ok(pairs.includes("binary:===->!=="));
  assert.ok(pairs.includes("logical:&&->||"));
  assert.ok(pairs.includes("binary:==->!="));
  assert.ok(pairs.includes("boolean-literal:true->false"));
  assert.ok(pairs.includes("binary:<-> <=".replace(" ", "")));
  assert.ok(pairs.includes("binary:>=-> >".replace(" ", "")));
  assert.ok(pairs.includes("logical:||->&&"));
  assert.ok(pairs.includes("boolean-literal:false->true"));
});

test("PM-112 AST: aplica mutante com exatidão, respeita filtro de linhas/max e rejeita offset inválido", () => {
  const src = "export const ok = (x) => x > 10 && x !== 20;\n";
  const all = discoverMutants(src);
  assert.equal(all.length, 3);
  assert.equal(discoverMutants(src, { max: 2 }).length, 2);
  assert.equal(discoverMutants(src, { lines: new Set([99]) }).length, 0);
  const mutated = applyMutant(src, all[0]);
  assert.equal(mutated, "export const ok = (x) => x > 10 || x !== 20;\n");
  assert.throws(() => applyMutant("outro codigo", all[0]), /Offset inconsistente/);
});

test("PM-112 CLI/diff: parseArgs, Tier A, parseChangedLines e resolveTestsForFile", () => {
  const opts = parseArgs(["--file", "a.js", "--test", "t1.js", "--test", "t2.js", "--max", "5", "--json"]);
  assert.deepEqual(opts, { file: "a.js", tests: ["t1.js", "t2.js"], base: null, max: 5, timeoutMs: 10_000, json: true, help: false });
  const patterns = loadTierAPatterns(ROOT);
  assert.equal(isTierAFile("client/js/sig-format.js", patterns), true);
  assert.equal(isTierAFile("client/js/identity/keys.js", patterns), true);
  assert.equal(isTierAFile("client/js/render/feed.js", patterns), false);
  const diff = [
    "+++ b/client/js/sig-format.js",
    "@@ -27,1 +27,2 @@",
    "+const x = 1;",
    "+const y = 2;",
  ].join("\n");
  assert.deepEqual([...parseChangedLines(diff).get("client/js/sig-format.js")], [27, 28]);
  assert.ok(resolveTestsForFile("client/js/sig-format.js", ROOT).includes("tests/sig-format.test.js"));
});

test("PM-112 execução real em tmpdir: mata mutante coberto, reporta sobrevivente e preserva hash do arquivo", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm112-unit-"));
  try {
    const modSrc = [
      "export function canSign(age, verified) {",
      "  if (age >= 18) return verified === true;",
      "  return false;",
      "}",
      "",
    ].join("\n");
    const testSrc = [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { canSign } from "./mod.mjs";',
      'test("adulto verificado assina", () => {',
      "  assert.equal(canSign(25, true), true);",
      "  assert.equal(canSign(25, false), false);",
      "  assert.equal(canSign(10, true), false);",
      "});",
      "",
    ].join("\n");
    const modPath = writeFile(tmpDir, "mod.mjs", modSrc);
    writeFile(tmpDir, "mod.test.mjs", testSrc);
    const beforeHash = sha256(fs.readFileSync(modPath));

    const report = runFileMutation({ file: "mod.mjs", tests: ["mod.test.mjs"], cwd: tmpDir });
    const afterBuf = fs.readFileSync(modPath);
    assert.equal(sha256(afterBuf), beforeHash, "arquivo original permanece byte-a-byte idêntico");
    assert.equal(afterBuf.toString("utf8"), modSrc);
    assert.ok(report.killed >= 3, `esperado >= 3 mortos, obtido ${report.killed}`);
    assert.equal(report.survived, 1, "limite age >= 18 -> age > 18 sobrevive porque o teste só testa 25 e 10");
    assert.equal(report.survivors[0].line, 2);
    assert.equal(report.survivors[0].original, ">=");
    assert.equal(report.survivors[0].replacement, ">");

    const summary = aggregateReports("file", [report]);
    const text = formatTextReport(summary);
    assert.match(text, /Sobreviventes:/);
    assert.match(text, /mod\.mjs:2 \[binary\] >= -> >/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("PM-112 CLI --json e --base: executa apenas linhas alteradas em módulo Tier A num repo git temporário", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vox-pm112-diff-"));
  try {
    gitIn(dir, "init", "-q", "-b", "main");
    writeFile(dir, "package.json", '{"type":"module"}\n');
    writeFile(dir, ".github/CODEOWNERS", "/client/js/sig-format.js @owner\n");
    writeFile(dir, "client/js/sig-format.js", [
      "export function keep(a) { return a === 1; }",
      "export function changed(n) { return n >= 10; }",
      "",
    ].join("\n"));
    writeFile(dir, "tests/sig-format.test.js", [
      'import test from "node:test";',
      'import assert from "node:assert/strict";',
      'import { keep, changed } from "../client/js/sig-format.js";',
      'test("cobre changed", () => {',
      "  assert.equal(keep(1), true);",
      "  assert.equal(changed(10), true);",
      "  assert.equal(changed(9), false);",
      "});",
      "",
    ].join("\n"));
    gitIn(dir, "add", "-A");
    gitIn(dir, "commit", "-q", "-m", "base");
    const baseSha = gitIn(dir, "rev-parse", "HEAD").trim();

    writeFile(dir, "client/js/sig-format.js", [
      "export function keep(a) { return a === 1; }",
      "export function changed(n) { return n >= 10 && n < 100; }",
      "",
    ].join("\n"));
    const run = spawnSync(process.execPath, [SCRIPT, "--base", baseSha, "--json"], { cwd: dir, encoding: "utf8" });
    assert.equal(run.status, 0, run.stdout + run.stderr);
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.mode, "diff");
    assert.equal(parsed.total, 3, "muta apenas a linha 2 alterada (>=, &&, <), ignorando linha 1");
    assert.ok(parsed.killed >= 2);
    assert.equal(parsed.survived, 1, "n < 100 -> n <= 100 sobrevive sem teste de fronteira 100");
    assert.equal(parsed.survivors[0].location, "client/js/sig-format.js:2");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
