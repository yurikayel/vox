/**
 * PM-18 — Medição local de sinalização (WebSocket vs Nostr) e tempo até conectar.
 * Guarda apenas contadores agregados e durações no aparelho, sem telemetria central nem IDs de pares.
 */

/** Chave de armazenamento local dos contadores de sinalização (PM-18). @type {string} */
export const SIGNALING_TELEMETRY_KEY = "vox-signaling-telemetry-v1";
/** Caminhos de sinalização suportados na medição comparativa. @type {readonly ["ws", "nostr"]} */
export const SIGNALING_PATHS = Object.freeze(["ws", "nostr"]);
/** Limite de sessões retidas para média e mediana até o primeiro par conectar. @type {number} */
export const MAX_FIRST_PEER_SAMPLES = 30;
const PATH_LABELS = Object.freeze({ ws: "WebSocket", nostr: "Nostr" });

function nonNegInt(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function emptyBucket() {
  return { attempts: 0, ok: 0, fail: 0, connectTotalMs: 0, lastConnectMs: null };
}

function sanitizeBucket(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const last = src.lastConnectMs === null || src.lastConnectMs === undefined ? null : nonNegInt(src.lastConnectMs);
  return {
    attempts: nonNegInt(src.attempts),
    ok: nonNegInt(src.ok),
    fail: nonNegInt(src.fail),
    connectTotalMs: nonNegInt(src.connectTotalMs),
    lastConnectMs: last,
  };
}

function sanitizeGroup(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return { ws: sanitizeBucket(src.ws), nostr: sanitizeBucket(src.nostr) };
}

function defaultState() {
  return {
    channels: { ws: emptyBucket(), nostr: emptyBucket() },
    peers: { ws: emptyBucket(), nostr: emptyBucket() },
    firstPeerSamplesMs: [],
    updatedAt: 0,
  };
}

function loadState(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(SIGNALING_TELEMETRY_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const samples = Array.isArray(parsed?.firstPeerSamplesMs)
      ? parsed.firstPeerSamplesMs.map(nonNegInt).slice(-MAX_FIRST_PEER_SAMPLES)
      : [];
    return {
      channels: sanitizeGroup(parsed?.channels),
      peers: sanitizeGroup(parsed?.peers),
      firstPeerSamplesMs: samples,
      updatedAt: nonNegInt(parsed?.updatedAt),
    };
  } catch {
    return defaultState();
  }
}

function saveState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(SIGNALING_TELEMETRY_KEY, JSON.stringify(state));
  } catch {
    /* quota cheia ou contexto sem storage */
  }
}

function applyOutcome(group, path, { ok = false, durationMs = null } = {}) {
  if (!SIGNALING_PATHS.includes(path)) return false;
  const bucket = group[path];
  bucket.attempts += 1;
  if (ok) {
    bucket.ok += 1;
    if (durationMs !== null && durationMs !== undefined) {
      const ms = nonNegInt(durationMs);
      bucket.connectTotalMs += ms;
      bucket.lastConnectMs = ms;
    }
  } else {
    bucket.fail += 1;
  }
  return true;
}

/**
 * Registra tentativa de abertura de canal de sinalização (`ws` ou `nostr`).
 * @param {"ws"|"nostr"} path
 * @param {{ ok?: boolean, durationMs?: number|null }} [outcome]
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {boolean}
 */
export function recordSignalingDial(
  path,
  outcome = {},
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  const state = loadState(storage);
  if (!applyOutcome(state.channels, path, outcome)) return false;
  state.updatedAt = nonNegInt(now);
  saveState(state, storage);
  return true;
}

/**
 * Registra resultado de negociação WebRTC atribuída ao caminho `ws` ou `nostr`.
 * @param {"ws"|"nostr"} path
 * @param {{ ok?: boolean, durationMs?: number|null }} [outcome]
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {boolean}
 */
export function recordPeerPathOutcome(
  path,
  outcome = {},
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  const state = loadState(storage);
  if (!applyOutcome(state.peers, path, outcome)) return false;
  state.updatedAt = nonNegInt(now);
  saveState(state, storage);
  return true;
}

/**
 * Registra o tempo (ms) desde o início da malha até o primeiro par abrir canal de dados.
 * @param {number} durationMs
 * @param {Storage} [storage]
 * @param {number} [now]
 * @returns {boolean}
 */
export function recordFirstPeerLatency(
  durationMs,
  storage = globalThis.localStorage,
  now = Date.now(),
) {
  if (!Number.isFinite(Number(durationMs)) || Number(durationMs) < 0) return false;
  const state = loadState(storage);
  state.firstPeerSamplesMs = [...state.firstPeerSamplesMs, nonNegInt(durationMs)].slice(-MAX_FIRST_PEER_SAMPLES);
  state.updatedAt = nonNegInt(now);
  saveState(state, storage);
  return true;
}

function summarizeBucket(b) {
  const successRatePct = b.attempts > 0 ? Math.round((b.ok / b.attempts) * 100) : null;
  const avgConnectMs = b.ok > 0 && b.connectTotalMs > 0 ? Math.round(b.connectTotalMs / b.ok) : null;
  return {
    attempts: b.attempts,
    ok: b.ok,
    fail: b.fail,
    successRatePct,
    avgConnectMs,
    lastConnectMs: b.lastConnectMs,
  };
}

function summarizeLatencies(samples) {
  if (!samples.length) return { samples: [], count: 0, lastMs: null, avgMs: null, medianMs: null };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = samples.reduce((acc, n) => acc + n, 0);
  const mid = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return {
    samples: [...samples],
    count: samples.length,
    lastMs: samples[samples.length - 1],
    avgMs: Math.round(sum / samples.length),
    medianMs,
  };
}

/**
 * Retorna resumo local consolidado de sinalização e tempo até conectar.
 * @param {Storage} [storage]
 * @returns {{ channels: Record<"ws"|"nostr", object>, peers: Record<"ws"|"nostr", object>, firstPeer: object, updatedAt: number }}
 */
export function getSignalingTelemetrySummary(storage = globalThis.localStorage) {
  const state = loadState(storage);
  return {
    channels: { ws: summarizeBucket(state.channels.ws), nostr: summarizeBucket(state.channels.nostr) },
    peers: { ws: summarizeBucket(state.peers.ws), nostr: summarizeBucket(state.peers.nostr) },
    firstPeer: summarizeLatencies(state.firstPeerSamplesMs),
    updatedAt: state.updatedAt,
  };
}

function formatBucketLine(kind, path, b) {
  const rate = b.successRatePct === null ? "—" : `${b.successRatePct}%`;
  const avg = b.avgConnectMs === null ? "—" : `${b.avgConnectMs}ms`;
  return `- ${kind} ${PATH_LABELS[path]}: tentativas=${b.attempts}, sucessos=${b.ok}, falhas=${b.fail}, taxa=${rate}, media=${avg}`;
}

/**
 * Formata resumo texto sem dados pessoais para colar na retrospectiva do piloto.
 * @param {ReturnType<typeof getSignalingTelemetrySummary>} summary
 * @param {{ swVersion?: string }} [opts]
 * @returns {string}
 */
export function formatSignalingReport(summary, { swVersion = "" } = {}) {
  const s = summary || getSignalingTelemetrySummary(null);
  const fp = s.firstPeer || { count: 0, lastMs: null, avgMs: null, medianMs: null };
  const fpText = fp.count > 0 ? `amostras=${fp.count}, ultimo=${fp.lastMs}ms, media=${fp.avgMs}ms, mediana=${fp.medianMs}ms` : "sem amostras";
  const head = swVersion ? `Sinalização Vox (PM-18 · ${String(swVersion).slice(0, 80)})` : "Sinalização Vox (PM-18)";
  return [
    head,
    formatBucketLine("Canal", "ws", s.channels.ws),
    formatBucketLine("Canal", "nostr", s.channels.nostr),
    formatBucketLine("Pares WebRTC", "ws", s.peers.ws),
    formatBucketLine("Pares WebRTC", "nostr", s.peers.nostr),
    `- Primeiro par conectado: ${fpText}`,
  ].join("\n");
}

/**
 * Zera apenas os contadores locais de sinalização.
 * @param {Storage} [storage]
 */
export function resetSignalingTelemetry(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(SIGNALING_TELEMETRY_KEY);
  } catch {
    /* sem storage */
  }
}
