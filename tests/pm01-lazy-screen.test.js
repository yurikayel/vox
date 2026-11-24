/**
 * @file PM-01 — carregamento sob demanda da pilha rara de devolução/recuperação por guardiões.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeEl, installDom, waitFor } from "./helpers/cov-t5-dom.mjs";

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

test("PM-01: fachada screens-guardian-return usa import() dinâmico sem imports estáticos da pilha rara", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-guardian-return.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-guardian-return-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-guardian-return-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/guardian-return-flow\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\/guardian-return\.js["']/);
});

test("PM-01: pilha rara de devolução por guardiões fica fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-guardian-return.js"), "fachada mínima segue no grafo de boot");
  assert.ok(!bootStatic.has("./js/app/screens-guardian-return-view.js"), "view não entra no boot estático");
  assert.ok(!bootStatic.has("./js/app/guardian-return-flow.js"), "flow não entra no boot estático");
  assert.ok(!bootStatic.has("./js/render/guardian-return.js"), "render não entra no boot estático");
});

test("PM-01: pilha rara sob demanda não ocupa precache em SHELL_ASSETS nem entra em UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  for (const rel of [
    "./js/app/screens-guardian-return-view.js",
    "./js/app/guardian-return-flow.js",
    "./js/render/guardian-return.js",
  ]) {
    assert.ok(!shellSection.includes(`"${rel}"`), `${rel} deve ficar fora do precache SHELL_ASSETS`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
});

test("PM-01: fachada exporta showGuardianReturn e showGuardianRecover assíncronos", async () => {
  const facade = await import("../client/js/app/screens-guardian-return.js");
  assert.equal(typeof facade.showGuardianReturn, "function");
  assert.equal(typeof facade.showGuardianRecover, "function");
});

test("PM-01: view sob demanda mostra erro quando devolução falha sem confirmação", async () => {
  const { setup, makeDeps, deliverToGuardians, onDevice } = await import("./guardians-harness.js");
  const guardiansFlow = await import("../client/js/app/guardians-flow.js");
  const ret = await import("../client/js/identity/guardian-return.js");
  const localAccount = await import("../client/js/identity/index.js");
  const facade = await import("../client/js/app/screens-guardian-return.js");
  const { owner, ids } = await setup(3);
  const sent = [];
  await guardiansFlow.sendGuardianShares({ guardians: ids, m: 2 }, makeDeps(owner, sent));
  await deliverToGuardians(owner, sent);
  const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const request = ret.buildRequest({ owner, publicJwk: await crypto.subtle.exportKey("jwk", keys.publicKey) });
  const query = new URLSearchParams({ o: request.o, k: request.k, t: String(request.t), n: request.n });
  const box = makeEl({ checked: false });
  const btn = makeEl();
  const err = makeEl({ hidden: true });
  await localAccount.switchActiveAccount(ids[0]);
  installDom({ ids: { "guardian-return-confirm": box, "btn-guardian-return": btn, "guardian-return-error": err } });
  await onDevice(ids[0], () => facade.showGuardianReturn(query));
  await onDevice(ids[0], () => btn.fire("click"));
  await waitFor(() => !err.hidden);
  assert.match(err.textContent, /Não deu para devolver/);
});
