/**
 * Telemetria local de gateways e origem de leitura (V-P02 / T5) — sem phone-home.
 */
const STORAGE_KEY = "vox-gateway-health";
const READ_ORIGIN_KEY = "vox-read-origin";
const READ_ORIGIN_MAX = 50;
const READ_ORIGIN_TTL_MS = 24 * 60 * 60 * 1000;
export const READ_ORIGIN_MIN_SAMPLE = 5;

/** @typedef {"all_ok"|"degraded"|"critical"} GatewayHealthState */
/** @typedef {"mesh"|"relay"|"gateway"|"cache_idb"} ReadOrigin */

const READ_ORIGINS = new Set(["mesh", "relay", "gateway", "cache_idb"]);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { gateways: {}, lastReserveAt: 0 };
    const parsed = JSON.parse(raw);
    return {
      gateways: parsed.gateways && typeof parsed.gateways === "object" ? parsed.gateways : {},
      lastReserveAt: Number(parsed.lastReserveAt) || 0,
    };
  } catch {
    return { gateways: {}, lastReserveAt: 0 };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function loadReadOriginState() {
  try {
    const raw = localStorage.getItem(READ_ORIGIN_KEY);
    if (!raw) return { communities: {} };
    const parsed = JSON.parse(raw);
    const communities =
      parsed.communities && typeof parsed.communities === "object" ? parsed.communities : {};
    return { communities };
  } catch {
    return { communities: {} };
  }
}

function saveReadOriginState(state) {
  try {
    localStorage.setItem(READ_ORIGIN_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
}

function pruneReadSamples(samples, now = Date.now()) {
  const cutoff = now - READ_ORIGIN_TTL_MS;
  return samples.filter((s) => s.at >= cutoff).slice(-READ_ORIGIN_MAX);
}

/**
 * @param {string} label
 * @param {boolean} ok
 */
export function recordGatewayAttempt(label, ok) {
  if (!label) return;
  const state = loadState();
  const prev = state.gateways[label] || { ok: 0, fail: 0 };
  if (ok) prev.ok += 1;
  else prev.fail += 1;
  state.gateways[label] = prev;
  if (!ok) state.lastReserveAt = Date.now();
  saveState(state);
}

/**
 * @param {ReadOrigin} origin
 * @param {string} communityId
 */
export function recordReadOrigin(origin, communityId = "") {
  if (!READ_ORIGINS.has(origin)) return;
  const comm = String(communityId || "").trim();
  if (!comm) return;
  const state = loadReadOriginState();
  const prev = Array.isArray(state.communities[comm]) ? state.communities[comm] : [];
  const now = Date.now();
  state.communities[comm] = pruneReadSamples([...prev, { origin, at: now }], now);
  saveReadOriginState(state);
}

/** @returns {GatewayHealthState} */
export function getGatewayHealthState() {
  const state = loadState();
  const entries = Object.values(state.gateways);
  if (!entries.length) return "all_ok";
  const anyOk = entries.some((e) => e.ok > 0);
  const allFail = entries.length > 0 && entries.every((e) => e.ok === 0 && e.fail > 0);
  if (allFail) return "critical";
  if (!anyOk || entries.some((e) => e.fail > e.ok)) return "degraded";
  return "all_ok";
}

export function getGatewayHealthSummary() {
  const state = loadState();
  return {
    state: getGatewayHealthState(),
    gateways: { ...state.gateways },
    lastReserveAt: state.lastReserveAt,
  };
}

/**
 * Agregado local por comunidade (malha + relay + cache_idb).
 * @param {string} communityId
 */
export function getReadOriginAggregate(communityId = "") {
  const empty = {
    total: 0,
    localCount: 0,
    localReadPct: null,
    sufficient: false,
    counts: { mesh: 0, relay: 0, gateway: 0, cache_idb: 0 },
  };
  const comm = String(communityId || "").trim();
  if (!comm) return empty;

  const state = loadReadOriginState();
  const rawSamples = Array.isArray(state.communities[comm]) ? state.communities[comm] : [];
  const samples = pruneReadSamples(rawSamples);
  const counts = { mesh: 0, relay: 0, gateway: 0, cache_idb: 0 };
  for (const s of samples) {
    if (Object.hasOwn(counts, s.origin)) counts[s.origin] += 1;
  }
  const total = samples.length;
  const localCount = counts.mesh + counts.relay + counts.cache_idb;
  const sufficient = total >= READ_ORIGIN_MIN_SAMPLE;
  let localReadPct = null;
  if (sufficient && total > 0) {
    const rawPct = Math.round((localCount / total) * 100);
    localReadPct = Math.round(rawPct / 5) * 5;
  }
  return { total, localCount, localReadPct, sufficient, counts };
}

export function formatGatewayHealthPill(state) {
  if (state === "critical") {
    return { text: "Leitura reserva (gateways)", className: "gateway-pill-critical" };
  }
  if (state === "degraded") {
    return { text: "Leitura reserva ocasional", className: "gateway-pill-degraded" };
  }
  return null;
}

export function exportGatewayDiagnostic() {
  const s = getGatewayHealthSummary();
  return JSON.stringify(
    {
      type: "vox-gateway-diagnostic",
      schemaVersion: 0,
      at: new Date().toISOString(),
      state: s.state,
      gateways: s.gateways,
    },
    null,
    2,
  );
}

export function __resetGatewayHealthForTests() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(READ_ORIGIN_KEY);
}
