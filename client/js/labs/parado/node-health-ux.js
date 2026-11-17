/**
 * Helpers de UX e Acessibilidade de Nós (Fase Piloto 1-3-9 / B3 junior-ux)
 * Textos descritivos, rótulos ARIA e formatação amigável para leigos.
 */

import { NODE_STATUS } from "./node-health-model.js";

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

export function getNodeHealthAriaLabel(record) {
  if (!record || !record.url) return "Status de nó desconhecido";
  const label = getNodeHealthLabelPtBr(record.status);
  const latency = Number.isFinite(record.latencyMs) ? ` (${record.latencyMs}ms)` : "";
  return `Nó ${record.url}: ${label}${latency}`;
}

export function formatLatency(latencyMs) {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return "--";
  return `${Math.round(latencyMs)}ms`;
}
