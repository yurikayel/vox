/**
 * @file Textos de UI e acessibilidade para telemetria de nós (laboratório).
 * @module labs/parado/node-health-ux
 */

import { NODE_STATUS } from "./node-health-model.js";

/**
 * Rótulo em português para o estado semafórico.
 * @param {string} status Valor de {@link NODE_STATUS}.
 * @returns {string}
 */
export function getNodeHealthLabelPtBr(status) {
  switch (status) {
    case NODE_STATUS.HEALTHY:
      return "Ótima conexão";
    case NODE_STATUS.DEGRADED:
      return "Conexão lenta";
    case NODE_STATUS.OFFLINE:
    default:
      return "Indisponível";
  }
}

/**
 * Rótulo ARIA legível para leitores de tela.
 * @param {{url?: string, status?: string, latencyMs?: number}|null|undefined} record Registro de nó.
 * @returns {string}
 */
export function getNodeHealthAriaLabel(record) {
  if (!record || !record.url) return "Status de nó desconhecido";
  const label = getNodeHealthLabelPtBr(record.status);
  const latency = Number.isFinite(record.latencyMs) ? ` (${record.latencyMs}ms)` : "";
  return `Nó ${record.url}: ${label}${latency}`;
}

/**
 * Latência formatada para exibição; valores inválidos viram `--`.
 * @param {number} latencyMs Latência em ms.
 * @returns {string}
 */
export function formatLatency(latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return "--";
  return `${Math.round(latencyMs)}ms`;
}