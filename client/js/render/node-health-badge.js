/**
 * Componente Visual de Indicador de Saúde de Nós (Fase Piloto 1-3-9 / B1 junior-components)
 * Renderiza selos semafóricos e listas táteis de telemetria de nós.
 */

import { escapeHtml } from "./util.js";
import { getNodeHealthLabelPtBr, getNodeHealthAriaLabel, formatLatency } from "../node-health-ux.js";
import { NODE_STATUS } from "../node-health-model.js";

export function renderNodeHealthBadgeHtml(record) {
  if (!record || !record.url) {
    return `<span class="node-health-badge status-offline" aria-label="Nó desconhecido">Offline</span>`;
  }

  const ariaLabel = escapeHtml(getNodeHealthAriaLabel(record));
  const label = escapeHtml(getNodeHealthLabelPtBr(record.status));
  const latency = escapeHtml(formatLatency(record.latencyMs));
  const statusClass = `status-${record.status || NODE_STATUS.OFFLINE}`;

  return `<span class="node-health-badge ${statusClass}" aria-label="${ariaLabel}" title="${ariaLabel}"><span class="badge-dot"></span><span class="badge-label">${label}</span><span class="badge-latency">${latency}</span></span>`;
}

export function renderNodeHealthListHtml(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return `<div class="node-health-empty meta">Nenhum nó monitorado no momento.</div>`;
  }

  const rows = records.map((rec) => {
    const url = escapeHtml(rec.url || "—");
    const badge = renderNodeHealthBadgeHtml(rec);
    return `<li class="node-health-item" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;"><code>${url}</code>${badge}</li>`;
  });

  return `<ul class="node-health-list" style="list-style:none; padding:0; margin:0.5rem 0;">${rows.join("")}</ul>`;
}
