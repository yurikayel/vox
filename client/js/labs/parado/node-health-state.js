/**
 * Gerenciador de Estado de Saúde de Nós (Fase Piloto 1-3-9 / B2 junior-state)
 * Armazena e notifica atualizações de telemetria dos nós em memória.
 */

const state = {
  records: new Map(),
  listeners: new Set(),
};

export function getNodeHealthState() {
  return Array.from(state.records.values());
}

export function updateNodeHealthRecord(record) {
  if (!record || !record.url) return;
  state.records.set(record.url, record);
  notifyListeners();
}

export function updateBatchNodeHealth(records = []) {
  if (!Array.isArray(records)) return;
  records.forEach((rec) => {
    if (rec && rec.url) state.records.set(rec.url, rec);
  });
  notifyListeners();
}

export function subscribeNodeHealth(listener) {
  if (typeof listener !== "function") return () => {};
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

export function clearNodeHealthState() {
  state.records.clear();
  notifyListeners();
}

function notifyListeners() {
  const current = getNodeHealthState();
  state.listeners.forEach((fn) => {
    try {
      fn(current);
    } catch {}
  });
}
