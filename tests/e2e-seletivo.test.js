/**
 * @file Filtro do job `e2e-seletivo` (`scripts/e2e-seletivo.mjs`): caminho do Fairplay ou da Mesa em rede dispara, outro
 * não; os caminhos listados existem no repositório; o script de ponta a ponta escreve `run=true|false`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { touched } from "../scripts/e2e-seletivo.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "e2e-seletivo.mjs");
const FAIRPLAY = "client/js/dungeon/vtt-fairplay-selo.js";
const REDE = "client/js/dungeon/vtt-rtc-transport.js";

test("e2e-seletivo: módulo do Fairplay, da Mesa em rede ou E2E deles dispara", () => {
  for (const file of [FAIRPLAY, REDE, "client/js/dungeon/vtt-sync-fairplay-guard.js", "client/js/dungeon/dice-engine.js", "relay/signaling.py", "e2e/test_fairplay_e2e.py", "e2e/test_mesa_rede_e2e.py"]) {
    assert.deepEqual(touched([file]), [file], file);
  }
});

test("e2e-seletivo: o que não é deles não dispara", () => {
  const other = ["client/js/dungeon/screen-sheet-tabs.js", "docs/HARDENING.md", "tests/e2e-seletivo.test.js", "e2e/test_diorama_e2e.py", "client/js/dungeon/vtt-fairplay-x.css"];
  assert.deepEqual(touched(other), []);
});

test("e2e-seletivo: só o caminho exato conta (sem sufixo, sem prefixo, sem subpasta)", () => {
  assert.deepEqual(touched(["x/relay/signaling.py", "relay/signaling.py.bak", "docs/client/js/dungeon/vtt-fairplay-selo.js", "client/js/dungeon/sub/vtt-fairplay-selo.js", "client/js/dungeon/vtt-fairplay-sub/x.js"]), []);
});

test("e2e-seletivo: devolve só os que casam, na ordem recebida", () => {
  assert.deepEqual(touched(["docs/x.md", REDE, "a.js", FAIRPLAY]), [REDE, FAIRPLAY]);
});

test("e2e-seletivo: os caminhos de exemplo existem no repositório (lista não ficou velha)", () => {
  for (const file of [FAIRPLAY, REDE, "client/js/dungeon/vtt-sync-fairplay-guard.js", "client/js/dungeon/dice-engine.js", "client/js/dungeon/dungeon-state.js", "client/js/rpg-crypto-table.js", "client/js/dungeon/vtt-rede-escolha.js", "client/js/dungeon/vtt-sync.js", "client/js/dungeon/vtt-host-wire.js", "client/js/dungeon/dungeon-sync-bridge.js", "client/js/dungeon/dungeon-vtt-join.js", "relay/signaling.py", "e2e/test_fairplay_e2e.py", "e2e/test_mesa_rede_e2e.py", "e2e/test_mesa_sync_e2e.py", "e2e/test_mesa_ttrpg_e2e.py", "e2e/test_vox_e2e.py"]) {
    assert.equal(fs.existsSync(path.join(ROOT, file)), true, file);
  }
});

function sh(cwd, ...args) {
  return execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
}

/** Repositório de mentira: base com dois arquivos, um commit de PR com `files`; devolve o `run=` escrito pelo script. */
function runCase(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-seletivo-fixture-"));
  sh(dir, "init", "-q", "-b", "main");
  for (const file of [FAIRPLAY, "docs/x.md"]) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), "base\n");
  }
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "base");
  const base = sh(dir, "rev-parse", "HEAD").trim();
  for (const file of files) fs.writeFileSync(path.join(dir, file), "pr\n");
  sh(dir, "add", "-A");
  sh(dir, "commit", "-q", "-m", "pr");
  const output = path.join(dir, "gh-output.txt");
  const env = { ...process.env, BASE_REF: base, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: "" };
  const run = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8", env });
  const written = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  fs.rmSync(dir, { recursive: true, force: true });
  return { status: run.status, written, stdout: run.stdout };
}

test("e2e-seletivo: PR que toca o caminho escreve run=true de ponta a ponta", () => {
  const r = runCase([FAIRPLAY]);
  assert.equal(r.status, 0);
  assert.equal(r.written, "run=true\n");
  assert.match(r.stdout, /roda/);
});

test("e2e-seletivo: PR que não toca escreve run=false de ponta a ponta", () => {
  const r = runCase(["docs/x.md"]);
  assert.equal(r.status, 0);
  assert.equal(r.written, "run=false\n");
  assert.match(r.stdout, /pulado/);
});
