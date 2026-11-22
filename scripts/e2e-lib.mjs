/**
 * @file Biblioteca comum de testes E2E no Chromium (PM-113).
 * Extrai bootstrap de servidor HTTP estático, isolamento de contexto Playwright com
 * bloqueio de rede externa e mocks locais, além de helpers de onboarding e smokes.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "client");

/** Mapa MIME suportado pelo servidor estático local. @type {Record<string, string>} */
export const MIME = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
});

/** Configuração padrão de sinalização com rede externa desativada. */
export const DEFAULT_SIGNALING_CONFIG = Object.freeze({
  signalingUrls: [],
  nostrRelays: [],
  nostrSignaling: { enabled: false },
  stun: [],
  turn: [],
});

const RTC_PROBE_SCRIPT = `
(() => {
  const NativePc = window.RTCPeerConnection;
  if (!NativePc) return;
  window.__voxRtc = { pcs: [], events: [] };
  const log = (ev) => window.__voxRtc.events.push(\`\${Date.now() % 100000}:\${ev}\`);
  const trackDc = (dc, tag) => {
    dc.addEventListener("open", () => log(\`\${tag}:dc-open:\${dc.label}\`));
    dc.addEventListener("close", () => log(\`\${tag}:dc-close:\${dc.label}\`));
    dc.addEventListener("error", () => log(\`\${tag}:dc-err:\${dc.label}\`));
    dc.addEventListener("message", (e) => {
      if (String(dc.label) === "vox-peer-v0") {
        try { log(\`\${tag}:dc-rx:\${JSON.parse(e.data)?.type || "?"}\`); } catch {}
      }
    });
  };
  window.RTCPeerConnection = function PatchedPc(...args) {
    const pc = new NativePc(...args);
    const id = window.__voxRtc.pcs.length;
    const rec = { id, pc, dcs: [] };
    window.__voxRtc.pcs.push(rec);
    log(\`pc\${id}:new\`);
    pc.addEventListener("connectionstatechange", () => log(\`pc\${id}:conn=\${pc.connectionState}\`));
    pc.addEventListener("signalingstatechange", () => log(\`pc\${id}:sig=\${pc.signalingState}\`));
    pc.addEventListener("iceconnectionstatechange", () => log(\`pc\${id}:ice=\${pc.iceConnectionState}\`));
    const origCreateDc = pc.createDataChannel.bind(pc);
    pc.createDataChannel = (...dcArgs) => {
      const dc = origCreateDc(...dcArgs);
      rec.dcs.push(dc);
      trackDc(dc, \`pc\${id}:out\`);
      return dc;
    };
    pc.addEventListener("datachannel", (ev) => {
      rec.dcs.push(ev.channel);
      trackDc(ev.channel, \`pc\${id}:in\`);
    });
    return pc;
  };
  window.RTCPeerConnection.prototype = NativePc.prototype;
})();
`;

/**
 * Resolve com segurança o caminho de um arquivo estático sob o diretório do cliente.
 * @param {string} reqUrl URL da requisição HTTP recebida.
 * @param {string} [clientDir=CLIENT_DIR] Diretório raiz estático.
 * @returns {string|null} Caminho absoluto seguro ou null se inválido/fora da raiz.
 */
export function resolveClientPath(reqUrl, clientDir = CLIENT_DIR) {
  const cleanPath = decodeURIComponent(String(reqUrl || "/").split("?")[0]);
  const rel = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const full = path.resolve(clientDir, rel);
  return full.startsWith(clientDir) ? full : null;
}

/**
 * Classifica a URL de uma requisição Playwright para roteamento isolado.
 * @param {string} url URL da requisição interceptada.
 * @param {string} baseUrl URL base local permitida.
 * @returns {"signaling"|"oauth"|"local"|"external"} Categoria da rota.
 */
export function classifyRequestUrl(url, baseUrl) {
  if (typeof url !== "string") return "external";
  if (url.endsWith("/config/signaling.json")) return "signaling";
  if (url.endsWith("/config/oauth.json")) return "oauth";
  if (baseUrl && url.startsWith(baseUrl)) return "local";
  return "external";
}

/**
 * Obtém uma porta TCP livre em 127.0.0.1.
 * @returns {Promise<number>} Número da porta livre.
 */
export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/**
 * Serve um arquivo estático para uma resposta HTTP.
 * @param {import("node:http").IncomingMessage} req Requisição.
 * @param {import("node:http").ServerResponse} res Resposta.
 * @param {string} clientDir Diretório base estático.
 * @returns {void}
 */
function serveStaticFile(req, res, clientDir) {
  const file = resolveClientPath(req.url, clientDir);
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

/**
 * Inicia servidor HTTP estático local servindo a pasta client/.
 * @param {object} [options] Opções de inicialização.
 * @param {string} [options.clientDir] Diretório base alternativo.
 * @returns {Promise<{ baseUrl: string, port: number, close: () => Promise<void> }>}
 */
export function startStaticClientServer({ clientDir = CLIENT_DIR } = {}) {
  const server = http.createServer((req, res) => serveStaticFile(req, res, clientDir));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        port,
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/**
 * Aguarda um endpoint responder HTTP 200 até o tempo limite.
 * @param {string} url URL do endpoint de health.
 * @param {number} [timeoutMs=10000] Tempo limite em milissegundos.
 * @returns {Promise<void>}
 */
export async function waitHealth(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout aguardando ${url}`);
}

/**
 * Carrega a biblioteca Playwright via módulo explícito, playwright-core ou playwright.
 * @returns {Promise<any>} Módulo Playwright carregado.
 */
export async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_CORE_PATH;
  if (explicit) return import(pathToFileURL(explicit).href);
  try { return await import("playwright-core"); } catch {}
  return import("playwright");
}

/**
 * Injeta o script espião de conexões WebRTC na página.
 * @param {any} page Página Playwright.
 * @returns {Promise<void>}
 */
export function installRtcProbe(page) {
  return page.addInitScript(RTC_PROBE_SCRIPT);
}

/**
 * Configura interceptação de rotas bloqueando rede externa.
 * @param {any} context Contexto do navegador.
 * @param {string} baseUrl URL base local permitida.
 * @param {object} signalingConfig Configuração de sinalização mockada.
 * @param {string[]} debug Coletor de logs de debug.
 * @param {string[]} externalHits Coletor de requisições externas bloqueadas.
 * @returns {Promise<void>}
 */
function setupRouteHandler(context, baseUrl, signalingConfig, debug, externalHits) {
  return context.route("**/*", (route) => {
    const url = route.request().url();
    const kind = classifyRequestUrl(url, baseUrl);
    if (kind === "signaling") {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signalingConfig) });
    }
    if (kind === "oauth") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (kind === "local") return route.continue();
    externalHits.push(url);
    debug.push(`abort:${url}`);
    return route.abort();
  });
}

/**
 * Conecta escutas de erros e mensagens da página.
 * @param {any} page Página do navegador.
 * @param {string[]} errors Coletor de erros da página.
 * @param {string[]} debug Coletor de logs.
 * @returns {void}
 */
function attachPageListeners(page, errors, debug) {
  page.on("pageerror", (err) => errors.push(String(err?.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      debug.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
}

/**
 * Cria página Chromium isolada com rede externa bloqueada e service workers desligados.
 * @param {any} browser Instância do navegador Chromium.
 * @param {string} baseUrl URL do servidor estático local.
 * @param {object} [options] Opções de configuração.
 * @param {object} [options.signalingConfig] Configuração para /config/signaling.json.
 * @param {boolean} [options.installProbe] Se deve injetar probe WebRTC.
 * @param {string|null} [options.initialHash] Hash inicial para navegação.
 * @returns {Promise<{ context: any, page: any, errors: string[], debug: string[], externalHits: string[] }>}
 */
export async function createIsolatedPage(browser, baseUrl, options = {}) {
  const { signalingConfig = DEFAULT_SIGNALING_CONFIG, installProbe = true, initialHash = "/#/" } = options;
  const context = await browser.newContext({ serviceWorkers: "block" });
  const errors = [];
  const debug = [];
  const externalHits = [];
  const externalResponses = [];
  await setupRouteHandler(context, baseUrl, signalingConfig, debug, externalHits);
  const page = await context.newPage();
  page.on("response", (res) => {
    if (classifyRequestUrl(res.url(), baseUrl) === "external") externalResponses.push(res.url());
  });
  if (installProbe) await installRtcProbe(page);
  attachPageListeners(page, errors, debug);
  if (initialHash !== null) {
    await page.goto(`${baseUrl}${initialHash}`, { waitUntil: "domcontentloaded" });
  }
  return { context, page, errors, debug, externalHits, externalResponses };
}

/**
 * Completa o fluxo de entrada/onboarding do Vox até o compositor do feed.
 * @param {any} page Página do Playwright.
 * @param {string} displayName Nome de exibição a preencher.
 * @returns {Promise<void>}
 */
export async function completeOnboarding(page, displayName) {
  await page.locator("#btn-read-first-enter").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#btn-read-first-enter").click();
  await page.locator("#oauth-custom-name-input").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#oauth-custom-name-input").fill(displayName);
  await page.locator("#btn-oauth-save-name").click();
  await page.locator("#pact-age-18").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#pact-age-18").check();
  await page.locator("#btn-pact-accept").click();
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Lê a identidade local e JWKs gravadas no localStorage da página.
 * @param {any} page Página do Playwright.
 * @returns {Promise<{ account: string|null, wallet: string|null, displayName: string|null }>}
 */
export async function readStoredIdentity(page) {
  return page.evaluate(() => ({
    account: localStorage.getItem("vox-local-account-v1"),
    wallet: localStorage.getItem("vox-wallet-jwk"),
    displayName: localStorage.getItem("vox-display-name"),
  }));
}

/**
 * Publica post inline com confirmação na UI.
 * @param {any} page Página do Playwright.
 * @param {string} text Conteúdo do post.
 * @returns {Promise<void>}
 */
export async function publishInlinePost(page, text) {
  await page.locator("#feed-inline-composer .inline-composer-collapsed").click();
  await page.locator("#inline-topic-body").fill(text);
  await page.locator("#btn-inline-submit").click();
  const meshBtn = page.locator("#btn-permanence-mesh");
  await meshBtn.waitFor({ state: "visible", timeout: 5000 }).then(() => meshBtn.click()).catch(() => {});
  await page.locator("article", { hasText: text }).waitFor({ state: "visible", timeout: 15000 });
}

/**
 * Lê posts locais salvos no IndexedDB vox-cache-db.
 * @param {any} page Página do Playwright.
 * @returns {Promise<{ count: number, posts: Array<{ id: string, type: string, body: string }> }>}
 */
export function readLocalPostsFromPage(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open("vox-cache-db");
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("local-posts")) return resolve({ count: -1, posts: [] });
      const tx = db.transaction("local-posts", "readonly");
      const getAll = tx.objectStore("local-posts").getAll();
      getAll.onsuccess = () => {
        const list = getAll.result || [];
        resolve({ count: list.length, posts: list.map((p) => ({ id: p.id, type: p.type, body: (p.body || "").slice(0, 40) })) });
      };
      getAll.onerror = () => resolve({ count: -2, posts: [] });
    };
    req.onerror = () => resolve({ count: -3, posts: [] });
  }));
}

/**
 * Captura snapshot diagnóstico da página e estado WebRTC/IndexedDB.
 * @param {any} page Página do Playwright.
 * @param {string[]} [debug=[]] Histórico de mensagens de depuração.
 * @returns {Promise<object>} Objeto com diagnóstico DOM, WebRTC e storage.
 */
export async function snapshotPage(page, debug = []) {
  const idb = await readLocalPostsFromPage(page);
  const dom = await page.evaluate(() => ({
    hash: location.hash,
    hasWallet: Boolean(localStorage.getItem("vox-wallet-jwk")),
    hasAccount: Boolean(localStorage.getItem("vox-local-account-v1")),
    articles: [...document.querySelectorAll("article")].map((a) => a.innerText.slice(0, 60)),
    rtc: window.__voxRtc ? {
      pcs: window.__voxRtc.pcs.map((r) => ({
        id: r.id,
        conn: r.pc.connectionState,
        sig: r.pc.signalingState,
        ice: r.pc.iceConnectionState,
        dcs: r.dcs.map((d) => `${d.label}:${d.readyState}`),
      })),
      events: window.__voxRtc.events.slice(-25),
    } : null,
  }));
  return { ...dom, postCount: idb.count, posts: idb.posts, debug: debug.slice(-10) };
}

/**
 * Verifica se os contadores de telemetria satisfazem a conexão.
 * @param {object} data Objeto de telemetria parseado.
 * @param {string} expectedPath Identificador do canal esperado.
 * @returns {boolean}
 */
function hasTelemetrySuccess(data, expectedPath) {
  const ch = (data.channels && data.channels[expectedPath]) || null;
  const pr = (data.peers && data.peers[expectedPath]) || null;
  const samples = data.firstPeerSamplesMs;
  const hasSample = Array.isArray(samples) && samples.length >= 1;
  return Boolean(ch && ch.ok >= 1 && pr && pr.ok >= 1 && hasSample);
}

/**
 * Avalia se o par alcançou telemetria de conexão ativa e canal aberto.
 * @param {object} state Estado bruto ({ raw, hasOpenDc }).
 * @param {string} expectedPath Identificador do canal esperado.
 * @returns {object|null} Dados de telemetria se conectado, null caso contrário.
 */
function isMeshConnected(state, expectedPath) {
  if (!state || !state.hasOpenDc || !state.raw) return null;
  try {
    const data = JSON.parse(state.raw);
    if (data && hasTelemetrySuccess(data, expectedPath)) return data;
  } catch {}
  return null;
}

/**
 * Aguarda conexão WebRTC ativa pela telemetria e canal de dados aberto.
 * @param {object} peer Registro da página isolada ({ page, debug }).
 * @param {string} expectedPath Identificador do canal esperado ("ws" ou "nostr").
 * @param {number} [timeoutMs=20000] Tempo limite em ms.
 * @returns {Promise<object>} Dados de telemetria da sinalização.
 */
export async function waitForMeshConnection(peer, expectedPath, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await peer.page.evaluate(() => ({
      raw: localStorage.getItem("vox-signaling-telemetry-v1"),
      hasOpenDc: Boolean(window.__voxRtc?.pcs?.some((r) => r.dcs.some((d) => d.label === "vox-peer-v0" && d.readyState === "open"))),
    }));
    const connected = isMeshConnected(state, expectedPath);
    if (connected) return connected;
    await new Promise((r) => setTimeout(r, 150));
  }
  const latest = await peer.page.evaluate(() => localStorage.getItem("vox-signaling-telemetry-v1"));
  const snap = await snapshotPage(peer.page, peer.debug);
  throw new Error(`Timeout aguardando WebRTC via ${expectedPath} (telemetry=${latest}, snap=${JSON.stringify(snap)})`);
}

/**
 * Publica post no par A e valida propagação gossip até o par B.
 * @param {object} peerA Par emissor.
 * @param {object} peerB Par receptor.
 * @param {string} marker Identificador único do post.
 * @returns {Promise<void>}
 */
export async function publishAndVerifySignedPost(peerA, peerB, marker) {
  await peerA.page.locator("#feed-inline-composer .inline-composer-collapsed").click();
  await peerA.page.locator("#inline-topic-body").fill(`Teste P2P ${marker} #e2e`);
  await peerA.page.locator("#btn-inline-submit").click();
  const meshOnlyBtn = peerA.page.locator("#btn-permanence-mesh");
  await meshOnlyBtn.waitFor({ state: "visible", timeout: 5000 }).then(() => meshOnlyBtn.click()).catch(() => {});
  await peerA.page.locator("article", { hasText: marker }).waitFor({ state: "visible", timeout: 15000 }).catch(async (err) => {
    throw new Error(`${err.message}\nPeerA snapshot: ${JSON.stringify(await snapshotPage(peerA.page, peerA.debug))}`);
  });
  await peerB.page.locator("article", { hasText: marker }).waitFor({ state: "visible", timeout: 20000 }).catch(async (err) => {
    const snapA = await snapshotPage(peerA.page, peerA.debug);
    const snapB = await snapshotPage(peerB.page, peerB.debug);
    throw new Error(`${err.message}\nPeerA: ${JSON.stringify(snapA)}\nPeerB: ${JSON.stringify(snapB)}`);
  });
}

/**
 * Smoke PM-113 (1): entrada, post no feed, recarga de página e preservação da mesma chave.
 * @param {any} browser Instância do navegador Chromium.
 * @param {string} baseUrl URL do servidor estático local.
 * @returns {Promise<{ success: boolean, account: string|null }>}
 */
export async function smokeOnboardingReloadKey(browser, baseUrl) {
  const peer = await createIsolatedPage(browser, baseUrl);
  try {
    await completeOnboarding(peer.page, "Smoke Alice");
    const marker = `vox-smoke-reload-${Date.now()}`;
    await publishInlinePost(peer.page, marker);
    const keyBefore = await readStoredIdentity(peer.page);
    if (!keyBefore.account) throw new Error("Identidade não gravada após onboarding");
    await peer.page.reload({ waitUntil: "domcontentloaded" });
    await peer.page.locator("article", { hasText: marker }).waitFor({ state: "visible", timeout: 15000 });
    const keyAfter = await readStoredIdentity(peer.page);
    if (keyBefore.account !== keyAfter.account) {
      throw new Error(`Chave alterada após recarga: antes=${keyBefore.account} depois=${keyAfter.account}`);
    }
    const criticalErrors = peer.errors.filter((e) => !e.includes("[warning]"));
    if (criticalErrors.length > 0) throw new Error(`Erros de console no smoke 1: ${criticalErrors.join(" | ")}`);
    if (peer.externalResponses.length > 0) throw new Error(`Vazamento de requisições externas: ${peer.externalResponses.join(", ")}`);
    return { success: true, account: keyAfter.account };
  } finally {
    await peer.context.close();
  }
}

/**
 * Smoke PM-113 (2): feed e rota #/status carregam sem erros com rede externa bloqueada.
 * @param {any} browser Instância do navegador Chromium.
 * @param {string} baseUrl URL do servidor estático local.
 * @returns {Promise<{ success: boolean }>}
 */
export async function smokeFeedAndStatusRoute(browser, baseUrl) {
  const peer = await createIsolatedPage(browser, baseUrl);
  try {
    await completeOnboarding(peer.page, "Smoke Status");
    await peer.page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 10000 });
    await peer.page.goto(`${baseUrl}/#/status`, { waitUntil: "domcontentloaded" });
    await peer.page.locator("h1, h2, #status, main").first().waitFor({ state: "visible", timeout: 15000 });
    const criticalErrors = peer.errors.filter((e) => !e.includes("[warning]"));
    if (criticalErrors.length > 0) throw new Error(`Erros de console no smoke 2: ${criticalErrors.join(" | ")}`);
    if (peer.externalResponses.length > 0) throw new Error(`Vazamento de requisições externas: ${peer.externalResponses.join(", ")}`);
    return { success: true };
  } finally {
    await peer.context.close();
  }
}
