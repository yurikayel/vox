/**
 * @file Cobertura T7 dos scripts clássicos de boot (`boot-color-mode`, `boot-short-url`, `boot-sw`).
 * Cada script roda em um contexto `vm` isolado com `window`/`document`/`navigator` falsos; o `filename`
 * aponta para o arquivo real para que o V8 atribua as linhas executadas a ele.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

/**
 * Executa um script de boot em contexto isolado.
 * @param {string} file Nome do arquivo em `client/js`.
 * @param {object} sandbox Globais expostos ao script.
 * @returns {void}
 */
function runBoot(file, sandbox) {
  const path = fileURLToPath(new URL(`../client/js/${file}`, import.meta.url));
  const script = new vm.Script(fs.readFileSync(path, "utf8"), { filename: path });
  script.runInContext(vm.createContext(sandbox));
}

/**
 * Cria um `documentElement` falso que registra atributos e `style`.
 * @returns {{ attrs: Record<string, string>, style: object, setAttribute: Function }}
 */
function fakeRoot() {
  const attrs = {};
  return { attrs, style: {}, setAttribute: (k, v) => { attrs[k] = v; } };
}

test("boot-color-mode - aplica light/dark salvo no <html>", () => {
  for (const mode of ["light", "dark"]) {
    const root = fakeRoot();
    runBoot("boot-color-mode.js", {
      localStorage: { getItem: (k) => (k === "vox-color-mode" ? mode : null) },
      document: { documentElement: root },
    });
    assert.equal(root.attrs["data-color-mode"], mode);
    assert.equal(root.style.colorScheme, mode);
  }
});

test("boot-color-mode - valor desconhecido ou storage quebrado não altera o <html>", () => {
  const root = fakeRoot();
  runBoot("boot-color-mode.js", { localStorage: { getItem: () => "sepia" }, document: { documentElement: root } });
  assert.deepEqual(root.attrs, {});
  const throwing = { getItem: () => { throw new Error("bloqueado"); } };
  assert.doesNotThrow(() => runBoot("boot-color-mode.js", { localStorage: throwing, document: { documentElement: root } }));
  assert.deepEqual(root.attrs, {});
});

test("boot-short-url - ?h=slug vira #/h/slug e subdomínio vira slug", () => {
  const loc = { search: "?h=@Maria", hash: "", hostname: "vox.example" };
  runBoot("boot-short-url.js", { window: { location: loc }, URLSearchParams });
  assert.equal(loc.hash, "#/h/maria");
  const sub = { search: "", hash: "#/", hostname: "Ana.comunidade.org" };
  runBoot("boot-short-url.js", { window: { location: sub }, URLSearchParams });
  assert.equal(sub.hash, "#/h/ana");
});

test("boot-short-url - plataforma de hospedagem e hash existente ficam intactos", () => {
  const host = { search: "", hash: "", hostname: "app.pages.dev" };
  runBoot("boot-short-url.js", { window: { location: host }, URLSearchParams });
  assert.equal(host.hash, "");
  const kept = { search: "?h=maria", hash: "#/feed", hostname: "x.comunidade.org" };
  runBoot("boot-short-url.js", { window: { location: kept }, URLSearchParams });
  assert.equal(kept.hash, "#/feed");
});

test("boot-sw - registra ./sw.js no load e só avisa quando falha", async () => {
  const listeners = {};
  const calls = [];
  const warns = [];
  runBoot("boot-sw.js", {
    navigator: { serviceWorker: { register: (u) => { calls.push(u); return Promise.reject(new Error("falhou")); } } },
    window: { addEventListener: (ev, fn) => { listeners[ev] = fn; } },
    console: { warn: (...a) => warns.push(a) },
  });
  assert.deepEqual(calls, []);
  listeners.load();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ["./sw.js"]);
  assert.equal(warns.length, 1);
  assert.match(String(warns[0][0]), /boot-sw/);
});

test("boot-sw - sem serviceWorker não registra listener", () => {
  let added = 0;
  runBoot("boot-sw.js", { navigator: {}, window: { addEventListener: () => { added += 1; } } });
  assert.equal(added, 0);
});
