#!/usr/bin/env node
/**
 * @file PM-99 / PM-113 — teste E2E de navegador Chromium real na malha P2P e smokes de integridade.
 * Sobe servidor estático local de client/ e executa:
 *   1. PM-113 Smoke 1: Entrada, recarga e mesma chave;
 *   2. PM-113 Smoke 2: Feed e rota #/status sem erros com rede externa bloqueada;
 *   3. PM-99 Rodada WebSocket de sinalização P2P (dois navegadores);
 *   4. PM-99 Rodada Nostr de sinalização P2P (dois navegadores).
 */
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startEphemeralNostrRelay } from "./nostr-ephemeral-relay.mjs";
import {
  getFreePort,
  waitHealth,
  loadPlaywright,
  startStaticClientServer,
  createIsolatedPage,
  completeOnboarding,
  waitForMeshConnection,
  publishAndVerifySignedPost,
  smokeOnboardingReloadKey,
  smokeFeedAndStatusRoute,
} from "./e2e-lib.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Sobe o servidor de sinalização WebSocket local do relay.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
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

/**
 * Executa uma rodada de pareamento e troca de posts entre dois navegadores isolados.
 * @param {any} browser Instância do Chromium.
 * @param {string} baseUrl URL base do servidor estático.
 * @param {object} spec Parâmetros da rodada ({ label, expectedPath, signalingConfig, forbiddenPath }).
 * @returns {Promise<void>}
 */
async function runSignalingRound(browser, baseUrl, { label, expectedPath, signalingConfig, forbiddenPath }) {
  const peerA = await createIsolatedPage(browser, baseUrl, { signalingConfig });
  const peerB = await createIsolatedPage(browser, baseUrl, { signalingConfig });
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

/**
 * Constrói opções de inicialização do navegador headless.
 * @returns {object}
 */
function buildLaunchOptions() {
  const opts = {
    headless: true,
    args: ["--disable-features=WebRtcHideLocalIpsWithMdns", "--no-sandbox"],
  };
  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    opts.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
  }
  return opts;
}

/**
 * Executa os smokes rápidos do PM-113 no Chromium.
 * @param {any} browser Instância do Chromium.
 * @param {string} baseUrl URL base local.
 * @returns {Promise<void>}
 */
async function runPm113Smokes(browser, baseUrl) {
  console.log("--- PM-113 Smoke 1: Entrada, recarga e mesma chave ---");
  await smokeOnboardingReloadKey(browser, baseUrl);
  console.log("PASS [smoke 1] Entrada e recarga mantendo mesma chave.");

  console.log("--- PM-113 Smoke 2: Feed e #/status sem erros com rede externa bloqueada ---");
  await smokeFeedAndStatusRoute(browser, baseUrl);
  console.log("PASS [smoke 2] Feed e #/status sem erros com rede externa bloqueada.");
}

/**
 * Executa as rodadas de sinalização P2P na malha WebRTC (PM-99).
 * @param {any} browser Instância do Chromium.
 * @param {string} baseUrl URL base local.
 * @param {object} wsSrv Servidor WebSocket.
 * @param {object} nostrSrv Relay Nostr efêmero.
 * @returns {Promise<void>}
 */
async function runMeshRounds(browser, baseUrl, wsSrv, nostrSrv) {
  console.log("--- PM-99 Malha P2P: Rodada WebSocket ---");
  await runSignalingRound(browser, baseUrl, {
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

  console.log("--- PM-99 Malha P2P: Rodada Nostr ---");
  await runSignalingRound(browser, baseUrl, {
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
}

/**
 * Ponto de entrada do executável E2E.
 * @returns {Promise<void>}
 */
async function main() {
  const { chromium } = await loadPlaywright();
  const staticSrv = await startStaticClientServer();
  const wsSrv = await startWsSignalingServer();
  const nostrSrv = await startEphemeralNostrRelay();
  const browser = await chromium.launch(buildLaunchOptions());
  try {
    await runPm113Smokes(browser, staticSrv.baseUrl);
    await runMeshRounds(browser, staticSrv.baseUrl, wsSrv, nostrSrv);
    console.log("PM-99 + PM-113 E2E: smokes e duas rodadas Chromium passaram.");
  } finally {
    await browser.close();
    await Promise.allSettled([wsSrv.close(), nostrSrv.close(), staticSrv.close()]);
  }
}

await main();
