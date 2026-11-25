/**
 * @file Cobertura T7 de `central-memory.js`: sugestão de servidor, empurrar eventos, URLs candidatas, ciclo de
 * sincronização e laço periódico, com `fetch` falso e sem rede.
 */
import "./setup.js";
import test, { beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import * as cm from "../client/js/central-memory.js";
import * as choice from "../client/js/memory-server-choice.js";
import { waitUntil } from "./helpers/wait-until.js";

const realFetch = globalThis.fetch;
const realWindow = globalThis.window;
const realConfirm = globalThis.confirm;
let calls;
let handler;

beforeEach(() => {
  localStorage.clear();
  calls = [];
  handler = () => ({ status: "ok", revision: 3, updatedAt: 99, upToDate: true, counts: { posts: 0 } });
  globalThis.fetch = async (url, init) => {
    calls.push([String(url), init?.body ? JSON.parse(init.body) : null]);
    const out = handler(String(url), init);
    if (out === null) return { ok: false, status: 500, text: async () => "erro" };
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  };
  cm.resetCentralMemoryCursor();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.window = realWindow;
  globalThis.confirm = realConfirm;
  cm.setCentralMemoryAutoPush(false);
  mock.timers.reset();
});

test("registerDiscoveredMemoryUrl - vira só sugestão; getDiscoveredPublicMemoryUrl exige https escolhido", () => {
  assert.equal(cm.registerDiscoveredMemoryUrl("https://memoria.exemplo.org/", "par"), "https://memoria.exemplo.org");
  assert.equal(choice.getMemorySuggestion().url, "https://memoria.exemplo.org");
  assert.equal(cm.getDiscoveredPublicMemoryUrl(), "");
  choice.chooseMemoryServer("http://192.168.0.5:3920");
  assert.equal(cm.getDiscoveredPublicMemoryUrl(), "");
  choice.chooseMemoryServer("https://memoria.exemplo.org");
  assert.equal(cm.getDiscoveredPublicMemoryUrl(), "https://memoria.exemplo.org");
});

test("getCentralMemoryUrls - servidor escolhido vem primeiro, sem barras finais nem repetição", () => {
  choice.chooseMemoryServer("https://escolhido.example/");
  const urls = cm.getCentralMemoryUrls();
  assert.equal(urls[0], "https://escolhido.example");
  assert.equal(new Set(urls).size, urls.length);
  assert.ok(urls.every((u) => !u.endsWith("/")));
});

test("captureMemoryUrlFromLocation - lê ?memory= da busca ou do hash e ignora o resto", () => {
  globalThis.window = { location: { search: "?memory=https://busca.example", hash: "" } };
  assert.equal(cm.captureMemoryUrlFromLocation(), "https://busca.example");
  globalThis.window = { location: { search: "", hash: "#/feed?relay=https://hash.example" } };
  assert.equal(cm.captureMemoryUrlFromLocation(), "https://hash.example");
  globalThis.window = { location: { search: "", hash: "#/feed" } };
  assert.equal(cm.captureMemoryUrlFromLocation(), "");
  globalThis.window = { location: null };
  assert.equal(cm.captureMemoryUrlFromLocation(), "");
});

test("pushEventToCentralMemory - envia o evento ao primeiro servidor que responde e lembra dele", async () => {
  assert.equal(await cm.pushEventToCentralMemory(null), null);
  choice.chooseMemoryServer("https://primeiro.example");
  let n = 0;
  handler = () => (n++ === 0 ? null : { status: "saved" });
  const res = await cm.pushEventToCentralMemory({ type: "POST", id: "p1" });
  assert.deepEqual(res, { status: "saved" });
  assert.equal(calls[0][0], "https://primeiro.example/memory/ingest");
  assert.notEqual(calls[1][0], calls[0][0]);
  assert.deepEqual(calls[0][1], { type: "POST", id: "p1" });
});

test("pushEventToCentralMemory - todos os servidores falhando devolve null", async () => {
  handler = () => null;
  assert.equal(await cm.pushEventToCentralMemory({ type: "POST" }), null);
  assert.ok(calls.length >= 1);
});

test("notifyCentralMemory - só empurra com envio automático ligado e separa o blob de mídia", async () => {
  cm.notifyCentralMemory({ type: "POST", id: "p0" });
  assert.equal(calls.length, 0);
  cm.setCentralMemoryAutoPush(true);
  cm.notifyCentralMemory(null);
  cm.notifyCentralMemory({ type: "POST", id: "p1", mediaBlob: { hash: "h1", data: "AAAA" } });
  await waitUntil(()=> calls.some((c) => c[1]?.type === "MEDIA_BLOB"));
  const bodies = calls.map((c) => c[1]);
  assert.ok(bodies.some((b) => b.id === "p1"));
  assert.ok(bodies.some((b) => b.type === "MEDIA_BLOB" && b.blob.hash === "h1"));
  assert.equal(cm.isHydratingFromCentralMemory(), false);
});

test("syncWithCentralMemory - servidor em dia não hidrata; falha devolve ok=false; reentrada é pulada", async () => {
  const seen = [];
  const res = await cm.syncWithCentralMemory({ onHydrated: (i) => seen.push(i) });
  assert.deepEqual([res.ok, res.hydratedCount, res.revision], [true, 0, 3]);
  assert.deepEqual(seen, []);
  assert.ok(calls.some(([u]) => u.endsWith("/memory/sync")));
  const [a, b] = await Promise.all([cm.syncWithCentralMemory(), cm.syncWithCentralMemory()]);
  assert.equal([a, b].filter((r) => r.skipped).length, 1);
  handler = () => ({ status: "erro" });
  assert.deepEqual(await cm.syncWithCentralMemory(), { ok: false, hydratedCount: 0 });
});

test("syncWithCentralMemory - hidrata posts do servidor, avisa o callback e registra o túnel anunciado", async () => {
  handler = () => ({
    status: "ok",
    revision: 8,
    updatedAt: 500,
    tunnelUrl: "https://tunel.example",
    posts: [{ id: "post-t7-1", type: "topic", title: "Do servidor", body: "oi", communityId: "c1", author: "vx_remoto_abc", ts: Date.now() }],
    blobs: [],
    tombstones: [],
    profiles: [],
  });
  const seen = [];
  const res = await cm.syncWithCentralMemory({ onHydrated: (i) => seen.push(i) });
  assert.equal(res.ok, true);
  assert.equal(res.revision, 8);
  assert.ok(res.hydratedCount >= 0);
  assert.equal(choice.getMemorySuggestion()?.url, "https://tunel.example");
  if (res.hydratedCount > 0) assert.deepEqual(seen, [{ hydratedCount: res.hydratedCount, revision: 8 }]);
});

test("startCentralMemoryLoop - sincroniza já e a cada intervalo, pergunta da sugestão e para ao desligar", async () => {
  mock.timers.enable({ apis: ["setInterval"] });
  const listeners = [];
  const savedDoc = globalThis.document;
  globalThis.document = { visibilityState: "hidden", addEventListener: (ev, fn) => listeners.push([ev, fn]) };
  globalThis.confirm = () => true;
  choice.suggestMemoryServer("https://sugerido.example", "link");
  try {
    const stop = cm.startCentralMemoryLoop({ intervalMs: 1000 });
    await new Promise((r) => setImmediate(r));
    assert.equal(choice.getChosenMemoryServer(), "https://sugerido.example");
    const afterFirst = calls.filter(([u]) => u.endsWith("/memory/sync")).length;
    assert.ok(afterFirst >= 1);
    mock.timers.tick(1000);
    await new Promise((r) => setImmediate(r));
    assert.ok(calls.filter(([u]) => u.endsWith("/memory/sync")).length > afterFirst);
    assert.equal(listeners[0][0], "visibilitychange");
    globalThis.document.visibilityState = "visible";
    listeners[0][1]();
    await new Promise((r) => setTimeout(r, 30));
    stop();
    const n = calls.length;
    mock.timers.tick(5000);
    await new Promise((r) => setImmediate(r));
    assert.equal(calls.length, n);
  } finally {
    if (savedDoc === undefined) delete globalThis.document;
    else globalThis.document = savedDoc;
  }
});
