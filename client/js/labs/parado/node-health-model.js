/**
 * @file Modelo de telemetria de saúde de nós P2P (laboratório; não plugado no app).
 * @module labs/parado/node-health-model
 */

/**
 * Estados semafóricos de conectividade de um nó.
 * @type {Readonly<{HEALTHY: string, DEGRADED: string, OFFLINE: string}>}
 */
export const NODE_STATUS = Object.freeze({
  HEALTHY: "healthy",
  DEGRADED: "degraded",
  OFFLINE: "offline",
});

/**
 * Monta um registro normalizado a partir de campos parciais.
 * @param {object} [partial={}] Campos opcionais do registro.
 * @param {string} [partial.url] URL do nó.
 * @param {number} [partial.latencyMs] Latência medida em ms.
 * @param {string} [partial.status] Um de {@link NODE_STATUS}.
 * @param {number} [partial.timestamp] Epoch ms da medição.
 * @param {string|null} [partial.error] Código de falha, se houver.
 * @returns {{url: string, latencyMs: number|null, status: string, timestamp: number, error: string|null}}
 */
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

/**
 * Confere se o objeto tem forma mínima de registro de saúde.
 * @param {unknown} record Registro candidato.
 * @returns {boolean}
 */
export function validateNodeHealthRecord(record) {
  if (!record || typeof record !== "object") return false;
  if (typeof record.url !== "string" || !record.url) return false;
  if (!Object.values(NODE_STATUS).includes(record.status)) return false;
  if (typeof record.timestamp !== "number" || Number.isNaN(record.timestamp)) return false;
  return true;
}