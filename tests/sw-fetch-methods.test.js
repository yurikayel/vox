/**
 * Service Worker — só GET passa pelo cache.
 * Roda o `client/sw.js` de verdade numa sandbox `node:vm` com `self`, `caches` e `fetch` falsos e confere o que o
 * listener de `fetch` faz com cada método: POST/PUT/DELETE/HEAD não são interceptados (vão direto à rede pelo
 * navegador); GET do mesmo domínio continua no caminho do cache.
 */
import "./setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ORIGIN = "https://vox.test";
const source = fs.readFileSync(new URL("../client/sw.js", import.meta.url), "utf8");

/** Carrega o sw.js numa sandbox e devolve o listener de `fetch` e o registro de chamadas a `caches`. */
function loadServiceWorker() {
  const listeners = {};
  const cacheCalls = [];
  const cache = { put: (req) => { cacheCalls.push(["put", req.method]); return Promise.resolve(); } };
  const sandbox = {
    URL,
    console,
    self: { location: { origin: ORIGIN }, addEventListener: (type, fn) => { listeners[type] = fn; } },
    caches: {
      match: (req) => { cacheCalls.push(["match", req.method]); return Promise.resolve(undefined); },
      open: () => Promise.resolve(cache),
    },
    fetch: () => Promise.resolve({ status: 200, clone() { return this; } }),
  };
  vm.runInNewContext(source, sandbox, { filename: "sw.js" });
  return { onFetch: listeners.fetch, cacheCalls };
}

/** Despacha um evento de fetch falso e diz se o SW chamou `respondWith`. */
async function dispatch(onFetch, method, path) {
  let responded = null;
  onFetch({ request: { method, url: ORIGIN + path }, respondWith: (p) => { responded = p; } });
  if (responded) await responded;
  return responded !== null;
}

test("POST, PUT, DELETE e HEAD do mesmo domínio não passam pelo SW nem pelo cache", async () => {
  const { onFetch, cacheCalls } = loadServiceWorker();
  for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
    assert.equal(await dispatch(onFetch, method, "/oauth/exchange"), false, `${method} não deveria ser interceptado`);
    assert.equal(await dispatch(onFetch, method, "/config/signaling.json"), false, `${method} em signaling.json`);
  }
  assert.deepEqual(cacheCalls, [], "nenhum método além de GET toca o Cache API");
});

test("GET do mesmo domínio continua no caminho do cache; flags.json e outro domínio seguem fora", async () => {
  const { onFetch, cacheCalls } = loadServiceWorker();
  assert.equal(await dispatch(onFetch, "GET", "/index.html"), true);
  assert.deepEqual(cacheCalls[0], ["match", "GET"]);
  assert.equal(await dispatch(onFetch, "GET", "/config/flags.json"), false, "kill-switch sempre vai à rede (LAN-08)");
  let crossOrigin = null;
  onFetch({ request: { method: "GET", url: "https://outro.test/x.js" }, respondWith: (p) => { crossOrigin = p; } });
  assert.equal(crossOrigin, null);
});
