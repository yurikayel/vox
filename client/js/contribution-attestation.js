/** ADR-001: export opt-in de métricas locais assinadas — sem gossip nem upload. */

import * as localAccount from "./identity/index.js";
import * as peers from "./peers.js";

/**
 * Operação `ATTESTATION_TYPE` do módulo.
 * @type {*}
 */
export const ATTESTATION_TYPE = "contribution-attestation";
/**
 * Operação `SCHEMA_VERSION` do módulo.
 * @type {*}
 */
export const SCHEMA_VERSION = 0;
/**
 * Operação `EXPORT_COOLDOWN_MS` do módulo.
 * @type {*}
 */
export const EXPORT_COOLDOWN_MS = 60_000;
const LAST_EXPORT_KEY = "vox-contribution-attestation-last-export";

/**
 * Operação `getExportCooldownRemainingMs` do módulo.
 * @param {*} [now] Parâmetro `now`.
 * @returns {*} Resultado da operação.
 */
export function getExportCooldownRemainingMs(now = Date.now()) {
  try {
    const last = Number(localStorage.getItem(LAST_EXPORT_KEY) || 0);
    const wait = EXPORT_COOLDOWN_MS - (now - last);
    return wait > 0 ? wait : 0;
  } catch {
    return 0;
  }
}

/**
 * Operação `markExportDone` do módulo.
 * @param {*} [now] Parâmetro `now`.
 */
export function markExportDone(now = Date.now()) {
  localStorage.setItem(LAST_EXPORT_KEY, String(now));
}

/**
 * Operação `buildAttestationDraft` do módulo.
 * @returns {*} Resultado da operação.
 */
export function buildAttestationDraft() {
  return {
    type: ATTESTATION_TYPE,
    schemaVersion: SCHEMA_VERSION,
    metrics: peers.getPeerMetrics(),
    dailyUsage: peers.getDailyUsage(),
  };
}

/**
 * Operação `buildSignedContributionAttestation` do módulo.
 * @returns {*} Resultado da operação.
 */
export async function buildSignedContributionAttestation() {
  const retryAfterMs = getExportCooldownRemainingMs();
  if (retryAfterMs > 0) {
    return { ok: false, reason: "rate-limit", retryAfterMs };
  }
  const signed = await localAccount.signPayload(buildAttestationDraft());
  markExportDone();
  return { ok: true, signed };
}

/**
 * Operação `validateContributionAttestation` do módulo.
 * @param {*} [item] Parâmetro `item`.
 * @returns {*} Resultado da operação.
 */
export function validateContributionAttestation(item) {
  if (!item || item.type !== ATTESTATION_TYPE) return { ok: false, reason: "type" };
  if (item.schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: "schema" };
  if (!item.metrics || typeof item.metrics !== "object") return { ok: false, reason: "metrics" };
  return { ok: true };
}

/**
 * Operação `attestationDownloadFilename` do módulo.
 * @param {*} [routeId] Parâmetro `routeId`.
 * @param {*} [ts] Parâmetro `ts`.
 * @returns {*} Resultado da operação.
 */
export function attestationDownloadFilename(routeId, ts = Date.now()) {
  const slug = String(routeId || "local").replace(/[^\w-]/g, "").slice(0, 24);
  return `vox-comprovante-contribuicao-${slug}-${ts}.json`;
}
