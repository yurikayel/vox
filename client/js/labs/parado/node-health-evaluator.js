/**
 * @file Regras de classificação e escolha do melhor nó ativo (laboratório).
 * @module labs/parado/node-health-evaluator
 */

import { NODE_STATUS } from "./node-health-model.js";

/**
 * Limites de latência (ms) para healthy vs degraded.
 * @type {Readonly<{HEALTHY_MAX_MS: number, DEGRADED_MAX_MS: number}>}
 */
export const LATENCY_THRESHOLDS = Object.freeze({
  HEALTHY_MAX_MS: 300,
  DEGRADED_MAX_MS: 1200,
});

/**
 * Mapeia latência (e erro opcional) para {@link NODE_STATUS}.
 * @param {number|null|undefined} latencyMs Latência medida.
 * @param {unknown} [error=null] Falha de rede ou timeout.
 * @returns {string}
 */
export function classifyNodeStatus(latencyMs, error = null) {
  if (error || latencyMs == null || !Number.isFinite(latencyMs)) {
    return NODE_STATUS.OFFLINE;
  }
  if (latencyMs < LATENCY_THRESHOLDS.HEALTHY_MAX_MS) {
    return NODE_STATUS.HEALTHY;
  }
  if (latencyMs < LATENCY_THRESHOLDS.DEGRADED_MAX_MS) {
    return NODE_STATUS.DEGRADED;
  }
  return NODE_STATUS.OFFLINE;
}

/**
 * Escolhe o nó online de menor latência, ou null se nenhum.
 * @param {Array<{status?: string, latencyMs?: number}>} [records=[]] Registros candidatos.
 * @returns {object|null}
 */
export function selectBestHealthyNode(records = []) {
  if (!Array.isArray(records) || records.length === 0) return null;

  const viable = records
    .filter((r) => r && r.status !== NODE_STATUS.OFFLINE && Number.isFinite(r.latencyMs))
    .sort((a, b) => a.latencyMs - b.latencyMs);

  return viable.length > 0 ? viable[0] : null;
}