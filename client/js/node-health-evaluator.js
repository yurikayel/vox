/**
 * Avaliador de Saúde de Nós (Fase Piloto 1-3-9 / A3 junior-domain)
 * Classificação objetiva de nós P2P e seleção do melhor candidato ativo.
 */

import { NODE_STATUS } from "./node-health-model.js";

export const LATENCY_THRESHOLDS = Object.freeze({
  HEALTHY_MAX_MS: 300,
  DEGRADED_MAX_MS: 1200,
});

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

export function selectBestHealthyNode(records = []) {
  if (!Array.isArray(records) || records.length === 0) return null;

  const viable = records
    .filter((r) => r && r.status !== NODE_STATUS.OFFLINE && Number.isFinite(r.latencyMs))
    .sort((a, b) => a.latencyMs - b.latencyMs);

  return viable.length > 0 ? viable[0] : null;
}
