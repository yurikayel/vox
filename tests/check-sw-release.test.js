/**
 * @file Trava do Service Worker fora do corte (`scripts/check-sw-release.mjs`): regras puras e um repositório git de
 * mentira que roda o script de ponta a ponta. Casos: sem `sw.js` passa; `sw.js` em `feat/*` reprova; `release/*` passa;
 * `sw.js` com `docs/release-metadata.json` passa; caminhos parecidos não contam.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isReleaseBranch, verdict } from "../scripts/check-sw-release.mjs";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "check-sw-release.mjs");
const SW = "client/sw.js";
const META = "docs/release-metadata.json";

test("check-sw-release: só branch release/* ou chore/release-* é de corte", () => {
  assert.equal(isReleaseBranch("release/v7.175"), true);
  assert.equal(isReleaseBranch("chore/release-v7.175"), true);
  assert.equal(isReleaseBranch("feat/release-notes"), false);
  assert.equal(isReleaseBranch("fix/release"), false);
  assert.equal(isReleaseBranch("releases/x"), false);
  assert.equal(isReleaseBranch(""), false);
  assert.equal(isReleaseBranch(undefined), false);
});

test("check-sw-release: sem alterar sw.js o PR passa", () => {
  assert.equal(verdict(["client/js/a.js", "docs/x.md"], "feat/x").ok, true);
  assert.equal(verdict([], "feat/x").ok, true);
});

test("check-sw-release: sw.js fora de corte reprova", () => {
  const result = verdict([SW, "client/js/a.js"], "feat/x");
  assert.equal(result.ok, false);
  assert.match(result.headline, /UNPLUGGED_MODULES/);
  assert.equal(verdict([SW], "").ok, false);
});

test("check-sw-release: sw.js em branch de corte ou junto do metadata passa", () => {
  assert.equal(verdict([SW], "release/v7.175").ok, true);
  assert.equal(verdict([SW], "chore/release-v7.175").ok, true);
  assert.equal(verdict([SW, META], "feat/x").ok, true);
});

test("check-sw-release: só o caminho exato do sw.js e do metadata conta", () => {
  assert.equal(verdict(["client/sw.js.map", "docs/client/sw.js", "client/js/sw.js"], "feat/x").ok, true);
  assert.equal(verdict([SW, "docs/release-metadata.json.bak", "x/docs/release-metadata.json"], "feat/x").ok, false);
  assert.equal(verdict([META], "feat/x").ok, true);
});

function sh(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
}

function write(dir, file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
}

/** Repositório com `client/sw.js` e o metadata na base; devolve o diretório e o SHA da base. */
function fixtureRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "check-sw-fixture-"));
  sh(dir, "init", "-q", "-b", "main");
  write(dir, SW, 'const CACHE_NAME = "v1";\n');
  write(dir, META, '{"cache_name":"v1"}\n');
  write(dir, "client/js/a.js", "export const a = 1;\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "base");
  return { dir, base: sh(dir, "rev-parse", "HEAD").trim() };
}

function commit(dir, files) {
  for (const [file, text] of Object.entries(files)) write(dir, file, text);
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "pr");
}

function runScript(dir, base, headRef) {
  const env = { ...process.env, BASE_REF: base, HEAD_REF: headRef, GITHUB_STEP_SUMMARY: "" };
  return spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", env });
}

/** Cria o fixture, aplica as mudanças do PR e roda o script com o nome da branch dado. */
function runCase(files, headRef) {
  const { dir, base } = fixtureRepo();
  commit(dir, files);
  const run = runScript(dir, base, headRef);
  fs.rmSync(dir, { recursive: true, force: true });
  return run;
}

test("check-sw-release: PR sem sw.js passa de ponta a ponta", () => {
  const run = runCase({ "client/js/a.js": "export const a = 2;\n" }, "feat/x");
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(run.stdout, /OK/);
});

test("check-sw-release: sw.js em feat/* reprova de ponta a ponta", () => {
  const run = runCase({ [SW]: 'const CACHE_NAME = "v2";\n' }, "feat/x");
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(run.stdout, /::error::/);
});

test("check-sw-release: sw.js em release/* passa de ponta a ponta", () => {
  const run = runCase({ [SW]: 'const CACHE_NAME = "v2";\n' }, "release/v2");
  assert.equal(run.status, 0, run.stdout + run.stderr);
});

test("check-sw-release: sw.js junto de release-metadata passa de ponta a ponta", () => {
  const run = runCase({ [SW]: 'const CACHE_NAME = "v2";\n', [META]: '{"cache_name":"v2"}\n' }, "feat/x");
  assert.equal(run.status, 0, run.stdout + run.stderr);
});
