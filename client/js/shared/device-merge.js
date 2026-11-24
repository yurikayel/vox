/**
 * @file Convergência determinística multi-aparelho (PM-13) sobre `shared/reduce-lww`.
 *
 * Implementa merge comutativo, associativo e idempotente para registros de dispositivo,
 * agenda de contatos, comunidades seguidas e listas locais, preservando remoções
 * datadas (tombstones) mais novas.
 * @module shared/device-merge
 */

import { reduceLwwByAuthor } from "./reduce-lww.js";

/**
 * Indica se o valor é um objeto simples (não nulo e não array).
 * @param {unknown} value Valor a testar.
 * @returns {boolean} `true` quando é objeto simples.
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Converte um valor em timestamp numérico finito, retornando `0` para valores inválidos.
 * @param {unknown} value Valor bruto.
 * @returns {number} Timestamp finito ou `0`.
 */
function toFiniteTs(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Indica se um registro representa remoção (tombstone).
 * @param {object|null|undefined} record Registro a inspecionar.
 * @returns {boolean} `true` quando `deleted`, `removed` ou `deletedAt > 0`.
 */
export function isDeviceTombstone(record) {
  if (!isPlainObject(record)) return false;
  return record.deleted === true || record.removed === true || toFiniteTs(record.deletedAt) > 0;
}

/**
 * Extrai o timestamp efetivo de um registro (`editedAt ?? deletedAt ?? updatedAt ?? ts ?? addedAt ?? 0`).
 * @param {object} record Registro válido.
 * @returns {number} Timestamp efetivo.
 */
function recordTimestamp(record) {
  const raw = record.editedAt ?? record.deletedAt ?? record.updatedAt ?? record.ts ?? record.addedAt ?? 0;
  return toFiniteTs(raw);
}

/**
 * Serializa um valor de forma determinística ordenando chaves de objetos.
 * @param {unknown} value Valor a serializar.
 * @returns {string} Representação JSON canônica.
 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Constrói chave de desempate determinística para delegar ao comparador `sig` de `reduce-lww`.
 * @param {object} record Registro válido.
 * @returns {string} Chave de desempate total.
 */
function buildTieBreaker(record) {
  const sig = String(record.sig ?? "");
  const tomb = isDeviceTombstone(record) ? "1" : "0";
  const id = String(record.id ?? record.routeId ?? record.communityId ?? "");
  return `${sig}\0${tomb}\0${id}\0${canonicalJson(record)}`;
}

/**
 * Empacota itens válidos de duas coleções no formato aceito por `reduceLwwByAuthor`.
 * @template T
 * @param {Iterable<T>|null|undefined} local Coleção local.
 * @param {Iterable<T>|null|undefined} remote Coleção remota.
 * @param {(record: T) => string} keyFn Extrator de chave lógica.
 * @returns {Array<{ key: string, editedAt: number, sig: string, record: T }>} Envelopes prontos para redução.
 */
function collectEnvelopes(local, remote, keyFn) {
  const envelopes = [];
  for (const source of [local, remote]) {
    if (!source || typeof source[Symbol.iterator] !== "function") continue;
    for (const record of source) {
      if (!isPlainObject(record)) continue;
      const key = String(keyFn(record) ?? "").trim();
      if (!key) continue;
      envelopes.push({ key, editedAt: recordTimestamp(record), sig: buildTieBreaker(record), record });
    }
  }
  return envelopes;
}

/**
 * Compara duas strings em ordem de código UTF-16 (independente de locale).
 * @param {string} a Primeira string.
 * @param {string} b Segunda string.
 * @returns {number} `-1`, `0` ou `1`.
 */
function compareCodeUnits(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/**
 * Mescla coleções de registros multi-aparelho de forma comutativa, associativa e idempotente.
 * Usa `reduceLwwByAuthor` (`editedAt ?? ts ?? 0` + desempate determinístico por `sig`/`id`),
 * preservando tombstones datados mais novos.
 *
 * @template T
 * @param {Iterable<T>|null|undefined} local Registros locais.
 * @param {Iterable<T>|null|undefined} remote Registros remotos.
 * @param {(record: T) => string} [keyFn] Extrator da chave do registro (padrão: `record.id`).
 * @returns {T[]} Registros convergidos em ordem determinística por chave.
 */
export function mergeDeviceRecords(local, remote, keyFn = (r) => r?.id ?? "") {
  const envelopes = collectEnvelopes(local, remote, keyFn);
  const winners = reduceLwwByAuthor(envelopes, (env) => env.key);
  return Array.from(winners.keys())
    .sort(compareCodeUnits)
    .map((key) => winners.get(key).record);
}

/**
 * Normaliza uma entrada de contato para formato canônico com suporte a tombstone.
 * @param {unknown} raw Entrada bruta de contato.
 * @returns {object|null} Registro normalizado ou `null` se inválido.
 */
function normalizeContactRecord(raw) {
  if (!isPlainObject(raw)) return null;
  const routeId = String(raw.routeId ?? "").trim();
  if (!routeId) return null;
  const deleted = isDeviceTombstone(raw);
  const ts = recordTimestamp(raw);
  const base = deleted
    ? { routeId, label: "", addedAt: toFiniteTs(raw.addedAt), editedAt: ts, deleted: true, deletedAt: toFiniteTs(raw.deletedAt) || ts }
    : { routeId, label: String(raw.label ?? "").trim(), addedAt: toFiniteTs(raw.addedAt) || ts, editedAt: ts, deleted: false };
  if (raw.sig != null && String(raw.sig) !== "") base.sig = String(raw.sig);
  return base;
}

/**
 * Normaliza uma lista de entradas usando o normalizador informado.
 * @param {Iterable<unknown>|null|undefined} list Coleção de entrada.
 * @param {(item: unknown) => object|null} normalizeFn Função normalizadora.
 * @returns {object[]} Lista filtrada e normalizada.
 */
function normalizeList(list, normalizeFn) {
  if (!list || typeof list[Symbol.iterator] !== "function") return [];
  const out = [];
  for (const item of list) {
    const norm = normalizeFn(item);
    if (norm) out.push(norm);
  }
  return out;
}

/**
 * Mescla agendas de contatos de dois aparelhos com convergência determinística,
 * preservando tombstones datados mais novos e descartando entradas inválidas.
 *
 * @param {Iterable<object>|null|undefined} localContacts Contatos locais.
 * @param {Iterable<object>|null|undefined} remoteContacts Contatos remotos.
 * @returns {object[]} Agenda convergida (incluindo tombstones para propagação).
 */
export function mergeContactLists(localContacts, remoteContacts) {
  const local = normalizeList(localContacts, normalizeContactRecord);
  const remote = normalizeList(remoteContacts, normalizeContactRecord);
  return mergeDeviceRecords(local, remote, (c) => c.routeId);
}

/**
 * Normaliza uma entrada de comunidade seguida (objeto ou identificador em texto).
 * @param {unknown} raw Entrada bruta.
 * @returns {object|null} Registro normalizado ou `null` se inválido.
 */
function normalizeCommunityRecord(raw) {
  if (typeof raw === "string") {
    const communityId = raw.trim();
    return communityId ? { communityId, editedAt: 0, deleted: false } : null;
  }
  if (!isPlainObject(raw)) return null;
  const communityId = String(raw.communityId ?? raw.id ?? "").trim();
  if (!communityId) return null;
  const deleted = isDeviceTombstone(raw);
  const ts = recordTimestamp(raw);
  const base = deleted
    ? { communityId, editedAt: ts, deleted: true, deletedAt: toFiniteTs(raw.deletedAt) || ts }
    : { communityId, editedAt: ts, deleted: false };
  if (raw.sig != null && String(raw.sig) !== "") base.sig = String(raw.sig);
  return base;
}

/**
 * Mescla listas de comunidades seguidas de dois aparelhos com convergência determinística,
 * preservando desinscrições (tombstones) datadas mais novas.
 *
 * @param {Iterable<object|string>|null|undefined} localList Comunidades seguidas localmente.
 * @param {Iterable<object|string>|null|undefined} remoteList Comunidades seguidas remotamente.
 * @returns {object[]} Lista convergida de comunidades (incluindo tombstones).
 */
export function mergeFollowedCommunities(localList, remoteList) {
  const local = normalizeList(localList, normalizeCommunityRecord);
  const remote = normalizeList(remoteList, normalizeCommunityRecord);
  return mergeDeviceRecords(local, remote, (c) => c.communityId);
}

/**
 * Normaliza a lista de itens internos de uma lista local (trim, dedup e ordenação determinística).
 * @param {unknown} items Itens brutos.
 * @returns {string[]} Itens únicos ordenados.
 */
function normalizeListItems(items) {
  if (!Array.isArray(items)) return [];
  const unique = new Set();
  for (const item of items) {
    if (typeof item !== "string" && typeof item !== "number") continue;
    const clean = String(item).trim();
    if (clean) unique.add(clean);
  }
  return Array.from(unique).sort(compareCodeUnits);
}

/**
 * Normaliza uma entrada de lista local nomeada com suporte a tombstone.
 * @param {unknown} raw Entrada bruta.
 * @returns {object|null} Registro normalizado ou `null` se inválido.
 */
function normalizeLocalListRecord(raw) {
  if (!isPlainObject(raw)) return null;
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const deleted = isDeviceTombstone(raw);
  const ts = recordTimestamp(raw);
  const base = deleted
    ? { id, name: "", items: [], editedAt: ts, deleted: true, deletedAt: toFiniteTs(raw.deletedAt) || ts }
    : { id, name: String(raw.name ?? "").trim(), items: normalizeListItems(raw.items), editedAt: ts, deleted: false };
  if (raw.sig != null && String(raw.sig) !== "") base.sig = String(raw.sig);
  return base;
}

/**
 * Mescla listas locais de dois aparelhos com convergência determinística,
 * preservando remoções (tombstones) datadas mais novas.
 *
 * @param {Iterable<object>|null|undefined} localLists Listas locais.
 * @param {Iterable<object>|null|undefined} remoteLists Listas remotas.
 * @returns {object[]} Listas convergidas (incluindo tombstones).
 */
export function mergeLocalLists(localLists, remoteLists) {
  const local = normalizeList(localLists, normalizeLocalListRecord);
  const remote = normalizeList(remoteLists, normalizeLocalListRecord);
  return mergeDeviceRecords(local, remote, (l) => l.id);
}
