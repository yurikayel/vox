/**
 * @file Agenda local de contatos (V-DIS-12) com convergência multi-aparelho (PM-13).
 */

import { isDeviceTombstone, mergeContactLists } from "./shared/device-merge.js";

const STORAGE_KEY = "vox-contacts-v1";

/**
 * Lê a lista bruta de registros (ativos e tombstones) do `localStorage`; se falhar, devolve lista vazia.
 * @returns {object[]} Registros armazenados.
 */
function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Grava a lista de registros no `localStorage`; se falhar, segue sem gravar.
 * @param {object[]} list Registros de contatos.
 */
function saveRaw(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/**
 * Calcula timestamp monotônico local para garantir precedência de operações sequenciais no mesmo milissegundo.
 * @param {object[]} list Registros existentes.
 * @param {number} now Relógio atual em ms.
 * @returns {number} Timestamp estritamente maior que o maior registro existente.
 */
function nextLocalTs(list, now) {
  let maxTs = 0;
  for (const item of list) {
    const ts = Number(item?.editedAt ?? item?.deletedAt ?? item?.addedAt ?? 0) || 0;
    if (ts > maxTs) maxTs = ts;
  }
  const base = Number(now) || Date.now();
  return maxTs >= base ? maxTs + 1 : base;
}

/**
 * Lista os contatos ativos salvos ordenados do mais recente ao mais antigo.
 * @returns {{ routeId: string, label: string, addedAt: number }[]} Contatos armazenados.
 */
export function listContacts() {
  return loadRaw()
    .filter((c) => c && typeof c === "object" && c.routeId && !isDeviceTombstone(c))
    .sort((a, b) => (b.editedAt ?? b.addedAt ?? 0) - (a.editedAt ?? a.addedAt ?? 0));
}

/**
 * Exporta todos os registros da agenda (ativos e tombstones) para sincronização ou backup multi-aparelho.
 * @returns {object[]} Registros normalizados de contatos.
 */
export function exportContactRecords() {
  return mergeContactLists(loadRaw(), []);
}

/**
 * Adiciona ou atualiza um contato na agenda local.
 * @param {string} routeId Identificador de rota do contato.
 * @param {string} [label=""] Nome ou apelido local opcional.
 * @param {number} [now=Date.now()] Timestamp opcional em ms.
 * @returns {boolean} `true` se o contato foi gravado.
 */
export function addContact(routeId, label = "", now = Date.now()) {
  const id = String(routeId || "").trim();
  if (!id) return false;
  const raw = loadRaw();
  const ts = nextLocalTs(raw, now);
  const incoming = { routeId: id, label: String(label || "").trim(), addedAt: ts, editedAt: ts, deleted: false };
  saveRaw(mergeContactLists(raw, [incoming]));
  return true;
}

/**
 * Remove um contato da agenda local gravando tombstone datado para convergência multi-aparelho.
 * @param {string} routeId Identificador de rota a remover.
 * @param {number} [now=Date.now()] Timestamp opcional em ms.
 * @returns {void}
 */
export function removeContact(routeId, now = Date.now()) {
  const id = String(routeId || "").trim();
  if (!id) return;
  const raw = loadRaw();
  const ts = nextLocalTs(raw, now);
  saveRaw(mergeContactLists(raw, [{ routeId: id, deleted: true, deletedAt: ts, editedAt: ts }]));
}

/**
 * Mescla contatos vindos de outro aparelho ou backup de forma determinística, preservando remoções mais novas.
 * @param {Iterable<object>|null|undefined} remoteContacts Registros remotos de contatos.
 * @returns {{ routeId: string, label: string, addedAt: number }[]} Lista ativa após convergência.
 */
export function mergeRemoteContacts(remoteContacts) {
  saveRaw(mergeContactLists(loadRaw(), remoteContacts));
  return listContacts();
}

/**
 * Indica se a rota consta ativa na agenda local.
 * @param {string} routeId Identificador de rota.
 * @returns {boolean} `true` se o contato existir e não estiver removido.
 */
export function hasContact(routeId) {
  return listContacts().some((c) => c.routeId === routeId);
}

/**
 * Limpa a agenda de contatos no `localStorage` (uso exclusivo em testes).
 * @returns {void}
 */
export function __resetContactsForTests() {
  localStorage.removeItem(STORAGE_KEY);
}
