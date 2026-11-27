/**
 * @file PM-01 passo 7 — carregamento sob demanda das telas de rede (`screens-network`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as facade from "../client/js/app/screens-network.js";
import * as view from "../client/js/app/screens-network-view.js";
import * as identitySync from "../client/js/app/network-identity-sync.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const LAZY_ONLY_MODULES = [
  "./js/app/screens-network-view.js",
  "./js/app/network-screen-settings.js",
  "./js/app/network-screen-moderation.js",
  "./js/app/network-screen-steward.js",
  "./js/app/network-screen-linked.js",
  "./js/app/own-posts-ui.js",
  "./js/social-login.js",
  "./js/moderation-log.js",
  "./js/steward-wizard.js",
];

/**
 * Percorre o grafo de imports estáticos a partir de um arquivo de entrada.
 *
 * @param {string} entryAbs Caminho absoluto do arquivo inicial.
 * @returns {Set<string>} Caminhos relativos a `client/` no formato `./js/...`.
 */
function collectStaticGraph(entryAbs) {
  const seen = new Set();
  const stack = [entryAbs];
  while (stack.length > 0) {
    const file = stack.pop();
    if (seen.has(file) || !fs.existsSync(file)) continue;
    seen.add(file);
    for (const match of fs.readFileSync(file, "utf8").matchAll(STATIC_IMPORT_RE)) {
      const spec = match[1] || match[2];
      if (spec?.startsWith(".")) stack.push(path.resolve(path.dirname(file), spec));
    }
  }
  return new Set([...seen].map((abs) => "./" + path.relative(ROOT, abs).split(path.sep).join("/")));
}

test("PM-01 passo 7: fachada screens-network usa import() dinâmico sem imports estáticos da view", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-network.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-network-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-network-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/network-screen-[a-z]+\.js["']/);
});

test("PM-01 passo 7: telas de rede e dependências exclusivas ficam fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-network.js"), "fachada mínima segue no grafo de boot");
  assert.ok(bootStatic.has("./js/app/network-identity-sync.js"), "syncIdentity segue no boot");
  for (const rel of LAZY_ONLY_MODULES) {
    assert.ok(!bootStatic.has(rel), `${rel} não entra no boot estático`);
  }
});

test("PM-01 passo 7: módulos sob demanda ficam fora de SHELL_ASSETS e fora de UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  assert.ok(shellSection.includes('"./js/app/screens-network.js"'), "fachada continua no SHELL_ASSETS");
  assert.ok(shellSection.includes('"./js/app/network-identity-sync.js"'), "syncIdentity continua no SHELL_ASSETS");
  for (const rel of LAZY_ONLY_MODULES) {
    assert.ok(!shellSection.includes(`"${rel}"`), `${rel} deve ficar fora do precache SHELL_ASSETS`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
});

test("PM-01 passo 7: a fachada expõe as telas e syncIdentity; a view traz a implementação", () => {
  assert.equal(typeof facade.showNetworkSettings, "function");
  assert.equal(typeof facade.showStewardWizard, "function");
  assert.equal(typeof facade.showLinkedAccounts, "function");
  assert.equal(facade.syncIdentity, identitySync.syncIdentity);
  assert.equal(typeof view.showNetworkSettings, "function");
  assert.equal(typeof view.showStewardWizard, "function");
  assert.equal(typeof view.showLinkedAccounts, "function");
  assert.equal(typeof view.bindHtmlBackupButton, "function");
  assert.equal(typeof view.exportHtmlBackupNow, "function");
});
