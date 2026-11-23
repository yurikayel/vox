/** Agenda local de contatos (V-DIS-12). */

const STORAGE_KEY = "vox-contacts-v1";

/**
 * Lê a lista de contatos do `localStorage`; se falhar, devolve lista vazia.
 * @returns {object[]} Contatos.
 */
function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Grava a lista de contatos no `localStorage`; se falhar, segue sem gravar.
 * @param {object[]} list Contatos
 */
function saveRaw(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Lista os contatos salvos ordenados do mais recente ao mais antigo.
 * @returns {{ routeId: string, label: string, addedAt: number }[]} Contatos armazenados.
 */
export function listContacts() {
  return loadRaw().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

/**
 * Adiciona ou atualiza um contato na agenda local.
 * @param {string} routeId Identificador de rota do contato.
 * @param {string} [label=""] Nome ou apelido local opcional.
 * @returns {boolean} `true` se o contato foi gravado.
 */
export function addContact(routeId, label = "") {
  const id = String(routeId || "").trim();
  if (!id) return false;
  const list = loadRaw().filter((c) => c.routeId !== id);
  list.unshift({ routeId: id, label: String(label || "").trim(), addedAt: Date.now() });
  saveRaw(list);
  return true;
}

/**
 * Remove um contato da agenda local.
 * @param {string} routeId Identificador de rota a remover.
 * @returns {void}
 */
export function removeContact(routeId) {
  const id = String(routeId || "").trim();
  saveRaw(loadRaw().filter((c) => c.routeId !== id));
}

/**
 * Indica se a rota já consta na agenda local.
 * @param {string} routeId Identificador de rota.
 * @returns {boolean} `true` se o contato existir.
 */
export function hasContact(routeId) {
  return loadRaw().some((c) => c.routeId === routeId);
}

/**
 * Limpa a agenda de contatos no `localStorage` (uso exclusivo em testes).
 * @returns {void}
 */
export function __resetContactsForTests() {
  localStorage.removeItem(STORAGE_KEY);
}
