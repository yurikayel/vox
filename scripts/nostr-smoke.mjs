#!/usr/bin/env node
/**
 * REV-19 — teste de fumaça dos relays Nostr para sinalização efêmera.
 * Para cada relay: abre um assinante, publica um evento efêmero (kind 25050, tag t=vox-smoke-<n>)
 * por outra conexão e mede se o relay aceitou (OK) e repassou ao assinante.
 *
 * Com --signaling, também testa a ida e volta da sinalização REV-09 (dois pares, sala de teste):
 * descoberta + identidade cifrada + offer/answer cifrados.
 *
 * Uso: node scripts/nostr-smoke.mjs [--json saida.json] [--timeout 8000] [--signaling] [wss://relay ...]
 * Sem relays na linha de comando, usa `nostrRelays` de client/config/signaling.json.
 * Requer Node ≥ 22 (WebSocket global). Eventos efêmeros não são guardados pelos relays (NIP-01).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { finalizeEvent, generateSecretKey, bytesToHex } from "../client/js/nostr-event.js";
import { createNostrTransport } from "../client/js/nostr-transport.js";

const SMOKE_KIND = 25050;

export function parseArgs(argv) {
  const opts = { json: "", timeout: 8000, relays: [], signaling: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") opts.json = argv[++i] || "";
    else if (a === "--timeout") opts.timeout = Number(argv[++i]) || opts.timeout;
    else if (a === "--signaling") opts.signaling = true;
    else if (/^wss?:\/\//.test(a)) opts.relays.push(a);
  }
  return opts;
}

export function loadConfiguredRelays(path = new URL("../client/config/signaling.json", import.meta.url)) {
  const cfg = JSON.parse(readFileSync(path, "utf8"));
  return (cfg.nostrRelays || []).filter((r) => /^wss?:\/\//.test(r));
}

function openSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("timeout ao conectar"));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("erro de conexão"));
    };
  });
}

function parseFrame(raw) {
  try {
    const msg = JSON.parse(String(raw));
    return Array.isArray(msg) ? msg : null;
  } catch {
    return null;
  }
}

function waitFor(ws, predicate, timeoutMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    ws.addEventListener("message", (ev) => {
      const msg = parseFrame(ev.data);
      if (msg && predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

/** Classifica a resposta OK/NOTICE do relay em um motivo curto. */
export function classifyRejection(message = "") {
  const m = String(message).toLowerCase();
  if (m.includes("auth")) return "auth";
  if (m.includes("pow") || m.includes("difficulty")) return "pow";
  if (m.includes("pay") || m.includes("paid")) return "pagamento";
  if (m.includes("rate")) return "limite de taxa";
  if (m.includes("block") || m.includes("restricted")) return "restrito";
  return m ? "rejeitado" : "";
}

async function publishAndListen(sub, pub, event, timeoutMs) {
  const subId = `vox-smoke-${Math.random().toString(36).slice(2, 8)}`;
  const tag = event.tags[0][1];
  sub.send(JSON.stringify(["REQ", subId, { kinds: [SMOKE_KIND], "#t": [tag], since: event.created_at - 5 }]));
  await waitFor(sub, (m) => m[0] === "EOSE" && m[1] === subId, Math.min(timeoutMs, 3000));
  const started = Date.now();
  const received = waitFor(sub, (m) => m[0] === "EVENT" && m[1] === subId && m[2]?.id === event.id, timeoutMs);
  const ok = waitFor(pub, (m) => (m[0] === "OK" && m[1] === event.id) || m[0] === "NOTICE", timeoutMs);
  pub.send(JSON.stringify(["EVENT", event]));
  const [okMsg, evMsg] = await Promise.all([ok, received]);
  sub.send(JSON.stringify(["CLOSE", subId]));
  return { okMsg, evMsg, latencyMs: evMsg ? Date.now() - started : null };
}

export async function probeRelay(url, { timeout = 8000 } = {}) {
  const result = { relay: url, connected: false, accepted: false, relayed: false, latencyMs: null, reason: "" };
  const pending = [openSocket(url, timeout), openSocket(url, timeout)];
  let sub;
  let pub;
  try {
    [sub, pub] = await Promise.all(pending);
    result.connected = true;
    const event = await finalizeEvent(
      { kind: SMOKE_KIND, tags: [["t", `vox-smoke-${bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(4)))}`]], content: "vox smoke test (REV-19)" },
      generateSecretKey()
    );
    const { okMsg, evMsg, latencyMs } = await publishAndListen(sub, pub, event, timeout);
    result.accepted = okMsg?.[0] === "OK" && okMsg[2] === true;
    result.relayed = Boolean(evMsg);
    result.latencyMs = latencyMs;
    if (!result.accepted) result.reason = classifyRejection(okMsg?.[3] || okMsg?.[1] || "") || "sem resposta OK";
  } catch (err) {
    result.reason = err.message;
  } finally {
    // Fecha também o socket que abriu quando o outro falhou (senão o processo não termina).
    for (const p of pending) p.then((ws) => ws.close(), () => {});
  }
  return result;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return true;
    await sleep(100);
  }
  return check();
}

/** REV-09: dois transportes reais numa sala de teste trocam identidade e offer/answer cifrados. */
export async function probeSignalingRoundTrip(relays, { timeout = 15000 } = {}) {
  const room = `vox-smoke-${bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(4)))}`;
  const got = { a: [], b: [] };
  const mk = (peerId, address, sink) =>
    createNostrTransport({ relays, room, maxRelays: relays.length, peerId, getIdentity: () => ({ address }), onMessage: (m) => sink.push(m) });
  const A = mk("smoke_a", "vx_smoke_a", got.a);
  const B = mk("smoke_b", "vx_smoke_b", got.b);
  const started = Date.now();
  try {
    A.start();
    await sleep(1500);
    B.start();
    const discovered = await waitUntil(() => got.a.some((m) => m.type === "peer-joined") && got.b.some((m) => m.type === "peer-joined"), timeout);
    if (discovered) A.send({ type: "offer", to: "smoke_b", sdp: { type: "offer", sdp: "v=0 smoke" } });
    const offered = discovered && (await waitUntil(() => got.b.some((m) => m.type === "offer"), timeout));
    if (offered) B.send({ type: "answer", to: "smoke_a", sdp: { type: "answer", sdp: "v=0 smoke" } });
    const answered = offered && (await waitUntil(() => got.a.some((m) => m.type === "answer"), timeout));
    return { room, discovered, offered, answered, ms: Date.now() - started };
  } finally {
    A.stop();
    B.stop();
  }
}

export function summarize(results) {
  const ok = results.filter((r) => r.accepted && r.relayed).length;
  const lines = [
    `## Teste de fumaça Nostr (REV-19) — ${new Date().toISOString()}`,
    "",
    `**${ok}/${results.length}** relays aceitaram e repassaram o evento efêmero (kind ${SMOKE_KIND}).`,
    "",
    "| Relay | Conectou | Aceitou | Repassou | Latência | Motivo |",
    "|---|---|---|---|---|---|",
    ...results.map((r) =>
      `| ${r.relay} | ${r.connected ? "sim" : "não"} | ${r.accepted ? "sim" : "não"} | ${r.relayed ? "sim" : "não"} | ${r.latencyMs ?? "—"} ms | ${r.reason || ""} |`
    ),
  ];
  return { ok, total: results.length, markdown: lines.join("\n") };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const relays = opts.relays.length ? opts.relays : loadConfiguredRelays();
  const results = await Promise.all(relays.map((r) => probeRelay(r, { timeout: opts.timeout })));
  const summary = summarize(results);
  if (opts.signaling) {
    const healthy = results.filter((r) => r.accepted && r.relayed).map((r) => r.relay).slice(0, 3);
    summary.signaling = healthy.length ? await probeSignalingRoundTrip(healthy) : { discovered: false, offered: false, answered: false };
    const s = summary.signaling;
    summary.markdown += `

**Sinalização REV-09** (${healthy.length} relays): descoberta ${s.discovered ? "ok" : "falhou"} · offer ${s.offered ? "ok" : "falhou"} · answer ${s.answered ? "ok" : "falhou"}${s.ms ? ` · ${s.ms} ms` : ""}`;
  }
  console.log(summary.markdown);
  if (opts.json) writeFileSync(opts.json, JSON.stringify({ at: new Date().toISOString(), ...summary, results }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.markdown}\n`, { flag: "a" });
  process.exitCode = summary.ok > 0 && (!opts.signaling || summary.signaling?.answered) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
