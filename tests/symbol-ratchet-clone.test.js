/**
 * @file PM-116: a catraca por símbolo acha a base (`origin/develop`) também em clone de um ramo só e em clone raso, como
 * o checkout do nightly, e sai com 2 (nunca com falso verde) quando a base não pode ser obtida.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SCRIPT = path.resolve("scripts/symbol-ratchet.mjs");
const big = (name, n) => `function ${name}() {\n${"  work();\n".repeat(n)}}\n`;
const git = (cwd, ...args) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

/** Repositório de origem: `base` com 1 commit e `work` com 3 commits à frente (o último traz uma função grande demais). */
function origin() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-origin-"));
  const put = (rel, text) => {
    fs.mkdirSync(path.join(dir, "scripts"), { recursive: true });
    fs.writeFileSync(path.join(dir, "scripts", rel), text);
  };
  git(dir, "init", "-q", "-b", "base");
  put("a.mjs", "export const a = 1;\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "checkout", "-q", "-b", "work");
  const commits = [["b.mjs", "export const b = 1;\n"], ["c.mjs", "export const c = 1;\n"], ["grande.mjs", big("grande", 31)]];
  commits.forEach(([rel, text], i) => {
    put(rel, text);
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", `work ${i}`);
  });
  return dir;
}

function clone(src, ...flags) {
  const dst = fs.mkdtempSync(path.join(os.tmpdir(), "ratchet-clone-"));
  git(dst, "clone", "-q", "--single-branch", "--branch", "work", ...flags, pathToFileURL(src).href, ".");
  return dst;
}

const run = (dir) => spawnSync(process.execPath, [SCRIPT, "--base", "origin/base"], { encoding: "utf8", env: { ...process.env, SYMBOL_RATCHET_ROOT: dir } });
const cleanup = (...dirs) => dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

test("a) clone de um ramo só: busca a base uma vez e mede de verdade (função grande reprova, sem falso verde)", () => {
  const src = origin();
  const dst = clone(src);
  try {
    const r = run(dst);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /grande: lloc 33 > 30/);
    assert.match(r.stdout, /3 arquivo\(s\) medido\(s\) contra origin\/base/);
  } finally {
    cleanup(src, dst);
  }
});

test("b) clone raso (depth 1) de um ramo só: aprofunda até achar o ponto de partida e mede igual", () => {
  const src = origin();
  const dst = clone(src, "--depth=1");
  try {
    const r = run(dst);
    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stdout, /grande: lloc 33 > 30/);
    assert.match(r.stdout, /3 arquivo\(s\) medido\(s\) contra origin\/base/);
  } finally {
    cleanup(src, dst);
  }
});

test("c) sem rede (a origem some) e sem a base no clone: sai com 2 e diz que a base faltou, nunca 0", () => {
  const src = origin();
  const dst = clone(src, "--depth=1");
  try {
    git(dst, "remote", "set-url", "origin", pathToFileURL(path.join(src, "nao-existe")).href);
    const r = run(dst);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /a base origin\/base não está no clone e não foi possível buscá-la/);
    assert.match(r.stderr, /git fetch .*origin .*→ .*(nao-existe|does not appear to be a git repository|Could not read)/i, "o stderr do git entra na mensagem");
  } finally {
    cleanup(src, dst);
  }
});
