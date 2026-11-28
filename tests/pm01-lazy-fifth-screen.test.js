/**
 * @file PM-01 passo 6 — carregamento sob demanda da tela rara `#/status` (`screens-status`).
 */
import "./setup.js";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installFakeDom } from "./helpers/cov-t1-dom.mjs";
import * as localAccount from "../client/js/identity/index.js";
import * as signalingTelemetry from "../client/js/signaling-telemetry.js";
import * as availabilityMetrics from "../client/js/availability-metrics.js";
import { buildStatusDiagnosticReport, showStatus } from "../client/js/app/screens-status.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client");
const STATIC_IMPORT_RE = /(?:import|export)\s[^'"`]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g;
const LAZY_ONLY_MODULES = ["./js/app/screens-status-view.js", "./js/app/screens-voxpedia.js", "./js/app/screens-ajuda-teste.js"];

const dom = installFakeDom();
const realNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const realFetch = globalThis.fetch;

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

/**
 * Configura stubs de `navigator`, `fetch` e `caches` para a tela `#/status`.
 *
 * @param {object} [opts={}]
 */
function setStatusEnv({ storage, clipboard, caches } = {}) {
  Object.defineProperty(globalThis, "navigator", { value: { storage, clipboard }, configurable: true, writable: true });
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  globalThis.caches = caches;
}

/**
 * Registra no DOM falso os elementos interativos do painel `#/status`.
 *
 * @param {boolean} [withFeedback=true] Se cria os elementos de feedback de cópia.
 * @returns {object}
 */
function registerStatusElements(withFeedback = true) {
  return {
    cache: dom.add("status-sw-cache"),
    copySignaling: dom.add("status-copy-signaling-btn"),
    resetSignaling: dom.add("status-reset-signaling-btn"),
    signalingFeedback: withFeedback ? dom.add("status-signaling-feedback") : null,
    copyAvailability: dom.add("status-copy-availability-btn"),
    resetAvailability: dom.add("status-reset-availability-btn"),
    availabilityFeedback: withFeedback ? dom.add("status-availability-feedback") : null,
    label: dom.add("status-storage-label"),
    bar: dom.add("status-storage-bar"),
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", realNavigator);
  globalThis.fetch = realFetch;
  delete globalThis.caches;
  signalingTelemetry.resetSignalingTelemetry();
  availabilityMetrics.resetAvailabilityObservations();
  dom.reset();
});

test("PM-01 passo 6: fachada screens-status usa import() dinâmico sem imports estáticos da view", () => {
  const facadeSrc = fs.readFileSync(path.join(ROOT, "js/app/screens-status.js"), "utf8");
  assert.match(facadeSrc, /import\(\s*["']\.\/screens-status-view\.js["']\s*\)/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\/screens-status-view\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\/status\.js["']/);
  assert.doesNotMatch(facadeSrc, /from\s+["']\.\.\/render\.js["']/);
});

test("PM-01 passo 6: screens-status-view fica fora do grafo estático de boot", () => {
  const bootStatic = collectStaticGraph(path.join(ROOT, "js/app.js"));
  assert.ok(bootStatic.has("./js/app/screens-status.js"), "fachada mínima segue no grafo de boot");
  for (const rel of LAZY_ONLY_MODULES) {
    assert.ok(!bootStatic.has(rel), `${rel} não entra no boot estático`);
  }
});

test("PM-01 passo 6: módulos sob demanda ficam no precache (rota offline, F27) e fora de UNPLUGGED_MODULES", () => {
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const shellSection = sw.split("const SHELL_ASSETS")[1].split("const UNPLUGGED_MODULES")[0];
  const unpluggedSection = sw.split("const UNPLUGGED_MODULES")[1].split("];")[0];
  assert.ok(shellSection.includes('"./js/app/screens-status.js"'), "fachada continua no SHELL_ASSETS");
  for (const rel of LAZY_ONLY_MODULES) {
    assert.ok(shellSection.includes(`"${rel}"`), `${rel} fica no precache SHELL_ASSETS: sem ele #/status não abre offline`);
    assert.ok(!unpluggedSection.includes(`"${rel}"`), `${rel} é alcançável sob demanda, não UNPLUGGED`);
  }
  // A fachada `screens-status.js` e a tela de status importam `availability-metrics` de forma estática: offline, sem ele no precache, a tela não abre.
  assert.ok(shellSection.includes('"./js/availability-metrics.js"'), "availability-metrics é importado de forma estática pelo shell: fica no precache");
});

test("PM-01 passo 6: buildStatusDiagnosticReport permanece síncrono com defaults e opções", () => {
  const defaultReport = buildStatusDiagnosticReport();
  assert.match(defaultReport, /PM-75/);
  const customReport = buildStatusDiagnosticReport({ swVersion: "vox-pwa-v7.170-pm01-lazy-fifth-screen" });
  assert.match(customReport, /vox-pwa-v7\.170-pm01-lazy-fifth-screen/);
});

test("PM-01 passo 6: showStatus carrega view sob demanda, hidrata storage/cache e aciona copiar/zerar", async () => {
  await localAccount.ensureLocalAccount();
  const copied = [];
  setStatusEnv({
    storage: { estimate: async () => ({ usage: 2 * 1024 * 1024, quota: 20 * 1024 * 1024 }) },
    clipboard: { writeText: async (text) => { copied.push(text); } },
    caches: { keys: async () => ["outro", "vox-pwa-v7.170-pm01-lazy-fifth-screen"] },
  });
  const els = registerStatusElements(true);
  await showStatus();
  await new Promise((r) => setImmediate(r));
  assert.match(dom.main.innerHTML, /Offline/);
  assert.equal(els.label.textContent, "2.0 MB / 20.0 MB");
  assert.equal(els.cache.textContent, "vox-pwa-v7.170-pm01-lazy-fifth-screen");
  await els.copySignaling.onclick();
  await els.copyAvailability.onclick();
  assert.equal(copied.length, 2);
  assert.match(els.signalingFeedback.textContent, /copiado/i);
  assert.match(els.availabilityFeedback.textContent, /copiadas/i);
  signalingTelemetry.recordSignalingDial("ws", { ok: true });
  els.resetSignaling.onclick();
  assert.equal(signalingTelemetry.getSignalingTelemetrySummary().channels.ws.attempts, 0);
  els.resetAvailability.onclick();
});

test("PM-01 passo 6: trata falhas de storage, caches, clipboard e DOM parcial sem exceção", async () => {
  await localAccount.ensureLocalAccount();
  setStatusEnv({
    storage: { estimate: async () => { throw new Error("quota"); } },
    clipboard: { writeText: async () => { throw new Error("negado"); } },
    caches: { keys: async () => { throw new Error("blocked"); } },
  });
  const els = registerStatusElements(true);
  await showStatus();
  await new Promise((r) => setImmediate(r));
  assert.equal(els.label.textContent, "Estimativa indisponível");
  assert.match(els.cache.textContent, /indisponível/i);
  await els.copySignaling.onclick();
  await els.copyAvailability.onclick();
  assert.match(els.signalingFeedback.textContent, /Não foi possível copiar/);
  assert.match(els.availabilityFeedback.textContent, /Não foi possível copiar/);
  dom.reset();
  setStatusEnv({
    clipboard: { writeText: async () => {} },
    caches: { keys: async () => ["outro"] },
  });
  const partial = registerStatusElements(false);
  await showStatus();
  assert.match(partial.cache.textContent, /nenhum/);
  await partial.copySignaling.onclick();
  setStatusEnv({ clipboard: { writeText: async () => { throw new Error("negado"); } } });
  await partial.copyAvailability.onclick();
  dom.reset();
  setStatusEnv();
  await showStatus();
});
