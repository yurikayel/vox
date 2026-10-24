/**
 * Telemetria local de gateways (V-P02) — sem phone-home.
 */
const STORAGE_KEY = "vox-gateway-health";

/** @typedef {"all_ok"|"degraded"|"critical"} GatewayHealthState */

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
}
