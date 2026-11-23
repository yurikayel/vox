/**
 * @file Estado em memória e assinantes de telemetria de nós (laboratório).
 * @module labs/parado/node-health-state
 */

const state = {
  records: new Map(),
  listeners: new Set(),
};

/**
 * Snapshot atual de todos os registros conhecidos.
 * @returns {object[]}
 */
export function getNodeHealthState() {
  return Array.from(state.records.values());
}

/**
 * Grava ou substitui um registro indexado por URL.
 * @param {object|null|undefined} record Registro com `url`.
 * @returns {void}
 */
export function updateNodeHealthRecord(record) {
  if (!record || !record.url) return;
  state.records.set(record.url, record);
  notifyListeners();
}

/**
 * Atualiza vários registros de uma vez.
 * @param {object[]} [records=[]] Lista de registros.
 * @returns {void}
 */
export function updateBatchNodeHealth(records = []) {
  if (!Array.isArray(records)) return;
  records.forEach((rec) => {
    if (rec && rec.url) state.records.set(rec.url, rec);
  });
  notifyListeners();
}

/**
 * Assina mudanças; o listener recebe o estado completo a cada atualização.
 * @param {(records: object[]) => void} listener Callback de notificação.
 * @returns {() => void} Função para cancelar a assinatura.
 */
export function subscribeNodeHealth(listener) {
  if (typeof listener !== "function") return () => {};
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

/**
 * Limpa todos os registros e notifica assinantes.
 * @returns {void}
 */
export function clearNodeHealthState() {
  state.records.clear();
  notifyListeners();
}

/**
 * Avisa os ouvintes com o estado atual; falha de um ouvinte não afeta os demais.
 *
 * @returns {void}
 */
function notifyListeners() {
  const current = getNodeHealthState();
  state.listeners.forEach((fn) => {
    try {
      fn(current);
    } catch {
      /* listener de UI não deve derrubar o estado */
    }
  });
}