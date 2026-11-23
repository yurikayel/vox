#!/usr/bin/env node
/**
 * @file S30 — fumaça offline no Chromium real: shell PWA via Service Worker, sem rede externa.
 * Sobe um servidor estático de `client/`, bloqueia tudo fora do loopback enquanto online,
 * espera o SW precachear, emula offline no navegador e recarrega (o servidor local fica inalcançável).
 * Confere entrada no app, classificação honesta de falha de rede e criação só com nome sem servidor.
 *
 * Variáveis de ambiente:
 * - `PLAYWRIGHT_CORE_PATH` — caminho para `playwright-core/index.mjs` (opcional).
 * - `CHROMIUM_EXECUTABLE_PATH` — Chrome/Chromium instalado (opcional; senão o do Playwright).
 *
 * Uso: `npm install --no-save playwright-core` e depois `node scripts/offline-e2e.mjs`
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "client");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

/**
 * Carrega o Playwright (por `PLAYWRIGHT_CORE_PATH` ou pelos pacotes instalados).
 * @returns {Promise<object>}
 */
async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_CORE_PATH;
  if (explicit) return import(pathToFileURL(explicit).href);
  try { return await import("playwright-core"); } catch { return import("playwright"); }
}

/**
 * Sobe um servidor estático local que serve `client/`.
 * @returns {Promise<{server: object, baseUrl: string}>}
 */
function startStaticServer() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(String(req.url || "/").split("?")[0]).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(CLIENT_DIR, rel);
    const ok = file.startsWith(CLIENT_DIR) && fs.existsSync(file) && fs.statSync(file).isFile();
    if (!ok) return void res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((d) => server.close(d)) });
    });
  });
}

/**
 * Falha o cenário com `FALHOU: msg` se a condição for falsa.
 * @param {boolean} cond Condição esperada.
 * @param {string} msg Mensagem do erro.
 */
function check(cond, msg) {
  if (!cond) throw new Error(`FALHOU: ${msg}`);
}

/** Contexto com Service Worker ativo; tráfego fora do servidor local é abortado e anotado. */
async function newSession(browser, baseUrl) {
  const context = await browser.newContext({ acceptDownloads: false });
  const seen = [];
  const errors = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    const allowed = url.startsWith(baseUrl);
    seen.push({ url, allowed, aborted: !allowed });
    if (url.endsWith("/config/signaling.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signalingUrls: [], nostrRelays: [], nostrSignaling: { enabled: false }, stun: [], turn: [] }) });
    }
    if (url.endsWith("/config/oauth.json")) return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    return allowed ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(String(e?.message || e)));
  page.on("dialog", (d) => void d.accept());
  return { context, page, seen, errors, baseUrl };
}

/**
 * Abre o app com rede, espera o service worker assumir e deixa o shell no cache.
 * @param {object} page Página do Playwright.
 * @param {string} baseUrl URL base do servidor local.
 * @returns {Promise<void>}
 */
async function installShellOnline(page, baseUrl) {
  await page.goto(`${baseUrl}/#/`, { waitUntil: "load" });
  await page.waitForFunction(() => "serviceWorker" in navigator, null, { timeout: 15000 });
  await page.waitForFunction(async () => {
    await navigator.serviceWorker.ready;
    return navigator.serviceWorker.controller !== null;
  }, null, { timeout: 90000 });
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = keys[0] ? await caches.open(keys[0]) : null;
    return cache ? (await cache.keys()).length : 0;
  });
  check(cached >= 20, `precache insuficiente (${cached} entradas)`);
}

/**
 * Garante que nenhum pedido externo teve sucesso.
 * @param {object} session Sessão simulada com os pedidos vistos.
 * @param {string} label Rótulo usado na mensagem de erro.
 */
function checkNoExternalSuccess(session, label) {
  const leaked = session.seen.filter((r) => !r.allowed && !r.aborted);
  check(leaked.length === 0, `${label}: pedido externo não abortado: ${leaked[0]?.url || "?"}`);
  const externalOk = session.seen.filter((r) => !r.allowed);
  check(externalOk.every((r) => r.aborted), `${label}: rede externa não foi bloqueada de forma honesta`);
}

/**
 * Cenário: recarregar o app sem rede e conferir que o shell abre.
 * @param {object} session Sessão do navegador.
 * @returns {Promise<void>}
 */
async function scenarioOfflineReload(session) {
  const { page } = session;
  await installShellOnline(page, session.baseUrl);
  checkNoExternalSuccess(session, "precache online");
  await session.context.setOffline(true);
  const res = await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  check(res?.ok() !== false, "recarga offline falhou (SW não serviu o shell)");
  await page.locator("#btn-read-first-enter").waitFor({ state: "visible", timeout: 20000 });
  const onLine = await page.evaluate(() => navigator.onLine);
  check(onLine === false, "navigator.onLine deveria ser false");
  const kind = await page.evaluate(async () => {
    const { classifyUploadError } = await import("/js/honest-errors.js");
    return classifyUploadError(new TypeError("Failed to fetch"));
  });
  check(kind === "offline", `erro de rede não classificado como offline (${kind})`);
  check(session.errors.length === 0, `erros de página: ${session.errors.join("; ")}`);
  console.log("PASS [offline reload] shell carregou só do cache do SW");
}

/**
 * Aceita o pacto de convivência (maioridade e aceite).
 * @param {object} page Página do Playwright.
 * @returns {Promise<void>}
 */
async function acceptPact(page) {
  await page.locator("#pact-age-18").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#pact-age-18").check();
  await page.locator("#btn-pact-accept").click();
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Cenário: criar a conta sem rede.
 * @param {object} session Sessão do navegador.
 * @returns {Promise<void>}
 */
async function scenarioOfflineOnboarding(session) {
  const { page } = session;
  if (!page.url().includes("#")) await page.goto(`${session.baseUrl}/#/`, { waitUntil: "domcontentloaded" });
  await page.locator("#btn-read-first-enter").click();
  await page.locator("#oauth-custom-name-input").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#oauth-custom-name-input").fill("Offline E2E");
  await page.locator("#btn-oauth-name-only").click();
  await acceptPact(page);
  const routeId = await page.evaluate(async () => (await import("/js/identity/index.js")).getCachedRouteIdSync());
  check(/^vx_/.test(routeId || ""), "conta só com nome offline não nasceu");
  const label = await page.waitForFunction(() => {
    const el = document.querySelector(".network-chip.offline") || document.querySelector(".agora-mesh-chip.is-offline");
    const txt = el?.getAttribute("aria-label") || el?.textContent?.trim() || "";
    return /offline/i.test(txt) ? txt : "";
  }, null, { timeout: 15000 }).then((h) => h.jsonValue());
  check(label, "chip de rede offline não apareceu no DOM");
  console.log(`PASS [offline onboarding] routeId=${String(routeId).slice(0, 10)}… chip offline visível`);
}

/**
 * Roda os cenários offline e sai com código 1 se algum falhar.
 * @returns {Promise<void>}
 */
async function main() {
  const { chromium } = await loadPlaywright();
  const srv = await startStaticServer();
  const launch = { headless: true, args: ["--no-sandbox"] };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(launch);
  const session = await newSession(browser, srv.baseUrl);
  try {
    await scenarioOfflineReload(session);
    await scenarioOfflineOnboarding(session);
    console.log("Offline E2E: todos os cenários passaram.");
  } finally {
    await session.context.close();
    await browser.close();
    await srv.close();
  }
}

await main();