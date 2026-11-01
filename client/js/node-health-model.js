/**
 * Modelo de Telemetria de Saúde de Nós (Fase Piloto 1-3-9 / A1 junior-models)
 * Estrutura e validação de registros de ping e disponibilidade de nós P2P.
 */

export const NODE_STATUS = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  OFFLINE: "offline",
});

export function createNodeHealthRecord(partial = {}) {
  const url = typeof partial.url === "string" ? partial.url.trim() : "";
  const latencyMs = Number.isFinite(partial.latencyMs) ? Math.max(0, Math.round(partial.latencyMs)) : null;
  const status = Object.values(NODE_STATUS).includes(partial.status)
    ? partial.status
    : NODE_STATUS.OFFLINE;
  const timestamp = Number.isFinite(partial.timestamp) ? partial.timestamp : Date.now();
  const error = partial.error ? String(partial.error) : null;

  return {
    url,
    latencyMs,
    status,
    timestamp,
    error,
  };
}

export function validateNodeHealthRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (typeof record.url !== "string" || !record.url) return false;
  if (!Object.values(NODE_STATUS).includes(record.status)) return false;
  if (typeof record.timestamp !== "number" || Number.isNaN(record.timestamp)) return false;
  return true;
}
