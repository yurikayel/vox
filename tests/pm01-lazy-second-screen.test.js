/**
 * @file PM-01 passo 3 — carregamento sob demanda da pilha rara de assistentes guiados (`screens-guided`).
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeEl, installDom, unrefLongTimers } from "./helpers/cov-t5-dom.mjs";

unrefLongTimers();

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;

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

test("PM-01 passo 3: fachada screens-guided usa import() dinâmico sem imports estáticos da pilha rara", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-guided.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-guided-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-guided-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\/guided-setup\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/mobile-test-guide\.js["']/);
});

test("PM-01 passo 3: pilha rara de assistentes guiados fica fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-guided.js"), "fachada mínima segue no grafo de boot");
  assert.ok(!bootStatic.has("./js/app/screens-guided-view.js"), "view não entra no boot estático");
  assert.ok(!bootStatic.has("./js/render/guided-setup.js"), "render não entra no boot estático");
  assert.ok(!bootStatic.has("./js/app/mobile-test-guide.js"), "guia móvel não entra no boot estático");
});

test("PM-01 passo 3: pilha rara sob demanda não ocupa SHELL_ASSETS nem entra em UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  for (const rel of [
    "./js/app/screens-guided-view.js",
    "./js/render/guided-setup.js",
    "./js/app/mobile-test-guide.js",
  ]) {
    assert.ok(!shellSection.includes(`"${rel}"`), `${rel} deve ficar fora do precache SHELL_ASSETS`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
});

test("PM-01 passo 3: fachada carrega sob demanda rede, backup, carteira e guia móvel", async () => {
  localStorage.clear();
  globalThis.location = { hash: "#/", search: "", href: "https://vox.exemplo/", reload() {} };
  globalThis.window.location = globalThis.location;
  const facade = await import("../client/js/app/screens-guided.js");

  const next = facade.applyNetworkWizardChoices(
    { enabled: false, dailyCapMb: 50, wifiOnly: false, backgroundRelay: false },
    { enabled: "sim", cap: "120", wifiOnly: true, backgroundRelay: false },
  );
  assert.deepEqual(next, { enabled: true, dailyCapMb: 120, wifiOnly: true, backgroundRelay: false });

  const netDoc = installDom({ ids: { "form-network-wizard": makeEl() } });
  await facade.showNetworkWizard();
  assert.match(netDoc.main.innerHTML, /form-network-wizard/);

  const bkDoc = installDom({ ids: { "bk-pass": makeEl({ value: "abc" }), "bk-pass2": makeEl(), "bk-pass3": makeEl(), "form-backup-wizard": makeEl() } });
  await facade.showBackupWizard();
  assert.match(bkDoc.main.innerHTML, /form-backup-wizard/);

  const walDoc = installDom({ ids: { "wg-mode": makeEl(), "form-wallet-wizard": makeEl() } });
  await facade.showWalletWizard();
  assert.match(walDoc.main.innerHTML, /form-wallet-wizard/);

  const mobDoc = installDom({ ids: { "form-mobile-guide": makeEl(), "mg-preview": makeEl() } });
  const ctrl = await facade.showMobileTestGuide({ userAgent: "Mozilla/5.0 (Linux; Android 14)", onLine: true });
  assert.match(mobDoc.main.innerHTML, /form-mobile-guide/);
  assert.ok(Array.isArray(ctrl.getReport().steps));
});
