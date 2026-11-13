#!/usr/bin/env node
/**
 * @file PM-99 — teste E2E de dois navegadores Chromium reais na malha P2P.
 * Sobe um servidor estático local de `client/` e executa duas rodadas isoladas:
 *   1. Sinalização via WebSocket (`relay/signaling.py`);
 *   2. Sinalização via relay Nostr efêmero local (`scripts/nostr-ephemeral-relay.mjs`).
 * Em cada rodada, dois contextos Chromium isolados completam a entrada, abrem
 * WebRTC `vox-peer-v0` entre si e trocam um post assinado no feed.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startEphemeralNostrRelay } from "./nostr-ephemeral-relay.mjs";

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
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff2": "font/woff2",
};

async function loadPlaywright() {
  const explicit = process.env.PLAYWRIGHT_CORE_PATH;
  if (explicit) return import(pathToFileURL(explicit).href);
  try { return await import("playwright-core"); } catch {}
  return import("playwright");
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function resolveClientPath(reqUrl) {
  const cleanPath = decodeURIComponent(String(reqUrl || "/").split("?")[0]);
  const rel = cleanPath === "/" ? "index.html" : cleanPath.replace(/^\/+/, "");
  const full = path.resolve(CLIENT_DIR, rel);
  return full.startsWith(CLIENT_DIR) ? full : null;
}

function startStaticClientServer() {
  const server = http.createServer((req, res) => {
    const file = resolveClientPath(req.url);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}

async function waitHealth(url, timeoutMs = 10000) {
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

async function startWsSignalingServer() {
  const port = await getFreePort();
  const py = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
  const child = spawn(py, ["-u", "relay/signaling.py", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr.on("data", (d) => process.stderr.write(`[signaling.py] ${d}`));
  await waitHealth(`http://127.0.0.1:${port}/health`);
  return {
    url: `ws://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => {
      const killTimer = setTimeout(() => { try { child.kill("SIGKILL"); } catch {} resolve(); }, 500);
      child.once("exit", () => { clearTimeout(killTimer); resolve(); });
      try { child.kill("SIGTERM"); } catch { clearTimeout(killTimer); resolve(); }
    }),
  };
}

function installRtcProbe(page) {
  return page.addInitScript(() => {
    const NativePc = window.RTCPeerConnection;
    if (!NativePc) return;
    window.__voxRtc = { pcs: [], events: [] };
    const log = (ev) => window.__voxRtc.events.push(`${Date.now() % 100000}:${ev}`);
    const trackDc = (dc, tag) => {
      dc.addEventListener("open", () => log(`${tag}:dc-open:${dc.label}`));
      dc.addEventListener("close", () => log(`${tag}:dc-close:${dc.label}`));
      dc.addEventListener("error", () => log(`${tag}:dc-err:${dc.label}`));
      dc.addEventListener("message", (e) => {
        if (String(dc.label) === "vox-peer-v0") {
          try { log(`${tag}:dc-rx:${JSON.parse(e.data)?.type || "?"}`); } catch {}
        }
      });
    };
    window.RTCPeerConnection = function PatchedPc(...args) {
      const pc = new NativePc(...args);
      const id = window.__voxRtc.pcs.length;
      const rec = { id, pc, dcs: [] };
      window.__voxRtc.pcs.push(rec);
      log(`pc${id}:new`);
      pc.addEventListener("connectionstatechange", () => log(`pc${id}:conn=${pc.connectionState}`));
      pc.addEventListener("signalingstatechange", () => log(`pc${id}:sig=${pc.signalingState}`));
      pc.addEventListener("iceconnectionstatechange", () => log(`pc${id}:ice=${pc.iceConnectionState}`));
      const origCreateDc = pc.createDataChannel.bind(pc);
      pc.createDataChannel = (...dcArgs) => {
        const dc = origCreateDc(...dcArgs);
        rec.dcs.push(dc);
        trackDc(dc, `pc${id}:out`);
        return dc;
      };
      pc.addEventListener("datachannel", (ev) => {
        rec.dcs.push(ev.channel);
        trackDc(ev.channel, `pc${id}:in`);
      });
      return pc;
    };
    window.RTCPeerConnection.prototype = NativePc.prototype;
  });
}

async function createPeerPage(browser, baseUrl, signalingConfig) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const errors = [];
  const debug = [];
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.endsWith("/config/signaling.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(signalingConfig) });
    }
    if (url.endsWith("/config/oauth.json")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    if (url.startsWith(baseUrl)) return route.continue();
    debug.push(`abort:${url}`);
    return route.abort();
  });
  const page = await context.newPage();
  await installRtcProbe(page);
  page.on("pageerror", (err) => errors.push(String(err?.message || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") debug.push(`[${msg.type()}] ${msg.text()}`);
  });
  await page.goto(`${baseUrl}/#/`, { waitUntil: "domcontentloaded" });
  return { context, page, errors, debug };
}

async function completeOnboarding(page, displayName) {
  await page.locator("#btn-read-first-enter").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#btn-read-first-enter").click();
  await page.locator("#oauth-custom-name-input").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#oauth-custom-name-input").fill(displayName);
  await page.locator("#btn-oauth-save-name").click();
  await page.locator("#pact-age-18").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("#pact-age-18").check();
  await page.locator("#btn-pact-accept").click();
  const closeConnect = page.locator("#btn-post-pact-connect-close");
  await closeConnect.waitFor({ state: "visible", timeout: 5000 }).then(() => closeConnect.click()).catch(() => {});
  await page.locator("#feed-inline-composer").waitFor({ state: "visible", timeout: 15000 });
}

async function waitForMeshConnection(peer, expectedPath, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await peer.page.evaluate(() => ({
      raw: localStorage.getItem("vox-signaling-telemetry-v1"),
      hasOpenDc: Boolean(window.__voxRtc?.pcs?.some((r) => r.dcs.some((d) => d.label === "vox-peer-v0" && d.readyState === "open"))),
    }));
    const data = state.raw ? JSON.parse(state.raw) : null;
    const chOk = Number(data?.channels?.[expectedPath]?.ok || 0);
    const peerOk = Number(data?.peers?.[expectedPath]?.ok || 0);
    if (chOk >= 1 && peerOk >= 1 && (data?.firstPeerSamplesMs?.length || 0) >= 1 && state.hasOpenDc) {
      return data;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  const latest = await peer.page.evaluate(() => localStorage.getItem("vox-signaling-telemetry-v1"));
  const snap = await snapshotPage(peer.page, peer.debug);
  throw new Error(`Timeout aguardando WebRTC via ${expectedPath} (telemetry=${latest}, snap=${JSON.stringify(snap)})`);
}

function readLocalPostsFromPage(page) {
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

async function snapshotPage(page, debug = []) {
  const idb = await readLocalPostsFromPage(page);
  const dom = await page.evaluate(() => ({
    hash: location.hash,
    hasWallet: Boolean(localStorage.getItem("vox-wallet-jwk")),
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

async function publishAndVerifySignedPost(peerA, peerB, marker) {
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

async function runSignalingRound(browser, baseUrl, { label, expectedPath, signalingConfig, forbiddenPath }) {
  const peerA = await createPeerPage(browser, baseUrl, signalingConfig);
  const peerB = await createPeerPage(browser, baseUrl, signalingConfig);
  try {
    await completeOnboarding(peerA.page, `Alice ${label}`);
    await completeOnboarding(peerB.page, `Bruno ${label}`);
    const telA = await waitForMeshConnection(peerA, expectedPath);
    const telB = await waitForMeshConnection(peerB, expectedPath);
    if (forbiddenPath && (telA?.peers?.[forbiddenPath]?.ok || telB?.peers?.[forbiddenPath]?.ok)) {
      throw new Error(`Caminho proibido "${forbiddenPath}" conectou na rodada ${label}`);
    }
    const marker = `vox-mesh-${expectedPath}-${Date.now()}`;
    await publishAndVerifySignedPost(peerA, peerB, marker);
    const pageErrors = [...peerA.errors, ...peerB.errors].filter((e) => !e.startsWith("[warning]"));
    if (pageErrors.length > 0) {
      throw new Error(`Erros de página na rodada ${label}: ${pageErrors.join(" | ")}`);
    }
    console.log(
      `PASS [${label}] ${expectedPath} peers.ok=(${telA.peers[expectedPath].ok}, ${telB.peers[expectedPath].ok}) ` +
      `firstPeerMs=(${telA.firstPeerSamplesMs[0]}, ${telB.firstPeerSamplesMs[0]}) marker=${marker}`
    );
  } finally {
    await peerA.context.close();
    await peerB.context.close();
  }
}

async function main() {
  const { chromium } = await loadPlaywright();
  const staticSrv = await startStaticClientServer();
  const wsSrv = await startWsSignalingServer();
  const nostrSrv = await startEphemeralNostrRelay();
  const launchOpts = {
    headless: true,
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--no-sandbox"],
  };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) launchOpts.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  const browser = await chromium.launch(launchOpts);
  try {
    await runSignalingRound(browser, staticSrv.baseUrl, {
      label: "WebSocket",
      expectedPath: "ws",
      forbiddenPath: "nostr",
      signalingConfig: {
        signalingUrls: [wsSrv.url],
        nostrRelays: [],
        nostrSignaling: { enabled: false },
        stun: [],
        turn: [],
      },
    });
    await runSignalingRound(browser, staticSrv.baseUrl, {
      label: "Nostr",
      expectedPath: "nostr",
      forbiddenPath: "ws",
      signalingConfig: {
        signalingUrls: ["ws://127.0.0.1:1"],
        nostrRelays: [nostrSrv.url],
        nostrSignaling: { enabled: true, room: "vox-ci-mesh-e2e" },
        stun: [],
        turn: [],
      },
    });
    console.log("PM-99 E2E: duas rodadas Chromium (WebSocket e Nostr) passaram.");
  } finally {
    await browser.close();
    await Promise.allSettled([wsSrv.close(), nostrSrv.close(), staticSrv.close()]);
  }
}

await main();
