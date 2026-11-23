/**
 * @file Cobertura de `app/screens-status.js` (lote T1): painel #/status, cópia e zerar telemetria, cache do SW.
 */
import "./setup.js";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { installFakeDom } from "./helpers/cov-t1-dom.mjs";
import * as localAccount from "../client/js/identity/index.js";
import * as telemetry from "../client/js/signaling-telemetry.js";
import { showStatus } from "../client/js/app/screens-status.js";

const dom = installFakeDom();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realFetch = globalThis.fetch;

/** Troca `navigator` e `fetch` por falsos; o `afterEach` devolve os originais. */
function setEnv({ storage, clipboard } = {}) {
  Object.defineProperty(globalThis, "navigator", { value: { storage, clipboard }, configurable: true, writable: true });
  globalThis.fetch = async () => { throw new Error("offline"); };
  globalThis.caches = undefined;
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", realNavigator);
  globalThis.fetch = realFetch;
  delete globalThis.caches;
  dom.reset();
});

function addStatusEls() {
  return {
    cache: dom.add("status-sw-cache"),
    copy: dom.add("status-copy-signaling-btn"),
    reset: dom.add("status-reset-signaling-btn"),
    feedback: dom.add("status-signaling-feedback"),
    label: dom.add("status-storage-label"),
    bar: dom.add("status-storage-bar"),
  };
}

test("status — renderiza o painel com relay offline e sem estimativa de armazenamento", async () => {
  await localAccount.ensureLocalAccount();
  setEnv();
  const els = addStatusEls();
  await showStatus();
  assert.match(dom.main.innerHTML, /Offline/);
  assert.equal(els.label.textContent, "Estimativa indisponível");
});

test("status — hidrata o armazenamento com a estimativa do navegador", async () => {
  setEnv({ storage: { estimate: async () => ({ usage: 5 * 1024 * 1024, quota: 100 * 1024 * 1024 }) } });
  const els = addStatusEls();
  await showStatus();
  await new Promise((r) => setImmediate(r));
  assert.equal(els.label.textContent, "5.0 MB / 100.0 MB");
  assert.equal(els.bar.style.width, "5.0%");
});

test("status — estimativa que falha cai em 'indisponível'", async () => {
  setEnv({ storage: { estimate: async () => { throw new Error("x"); } } });
  const els = addStatusEls();
  await showStatus();
  await new Promise((r) => setImmediate(r));
  assert.equal(els.label.textContent, "Estimativa indisponível");
});

test("status — lista só os caches vox-pwa ou avisa quando não há nenhum", async () => {
  setEnv();
  const els = addStatusEls();
  globalThis.caches = { keys: async () => ["outro", "vox-pwa-v1", "vox-pwa-v2"] };
  await showStatus();
  assert.equal(els.cache.textContent, "vox-pwa-v1, vox-pwa-v2");
  globalThis.caches = { keys: async () => ["outro"] };
  await showStatus();
  assert.match(els.cache.textContent, /nenhum/);
});

test("status — caches.keys que falha marca o cache como indisponível", async () => {
  setEnv();
  const els = addStatusEls();
  globalThis.caches = { keys: async () => { throw new Error("x"); } };
  await showStatus();
  assert.match(els.cache.textContent, /indisponível neste contexto/);
});

test("status — copiar relatório usa a área de transferência e confirma", async () => {
  const copied = [];
  setEnv({ clipboard: { writeText: async (t) => { copied.push(t); } } });
  const els = addStatusEls();
  els.cache.textContent = "vox-pwa-v9";
  await showStatus();
  els.cache.textContent = "vox-pwa-v9";
  els.copy.onclick();
  await new Promise((r) => setImmediate(r));
  assert.equal(copied.length, 1);
  assert.match(copied[0], /vox-pwa-v9/);
  assert.match(els.feedback.textContent, /copiado/i);
});

test("status — copiar relatório sem permissão avisa que não deu", async () => {
  setEnv({ clipboard: { writeText: async () => { throw new Error("negado"); } } });
  const els = addStatusEls();
  await showStatus();
  await els.copy.onclick();
  assert.match(els.feedback.textContent, /Não foi possível copiar/);
});

test("status — zerar telemetria apaga o resumo e remonta a tela", async () => {
  setEnv();
  telemetry.recordSignalingDial("ws", { ok: true });
  assert.ok(telemetry.getSignalingTelemetrySummary().channels.ws.attempts > 0);
  const els = addStatusEls();
  await showStatus();
  dom.main.innerHTML = "";
  els.reset.onclick();
  assert.equal(telemetry.getSignalingTelemetrySummary().channels.ws.attempts, 0);
  await new Promise((r) => setTimeout(r, 20));
  assert.match(dom.main.innerHTML, /Offline/, "a tela foi montada de novo");
});
