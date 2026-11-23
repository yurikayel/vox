/**
 * @file PM-90 — revogação dos cofres v1.
 *
 * O formato v1 não protegia o cofre como prometido. Na abertura do app, cada cofre v1 que este aparelho
 * conhece é revogado: a cópia local sai e o servidor de memória escolhido recebe, no mesmo endereço,
 * uma marca `revoked` no lugar do conteúdo cifrado. Como o v1 não pode ser cifrado de novo sem a senha,
 * a pessoa recebe um aviso, uma vez, para criar a Senha Soberana de novo.
 */

import { legacyLookupKey } from "./vault-crypto.js";

/** Prefixo das cópias locais de cofres v1 no `localStorage` (o resto da chave é o endereço v1). */
export const LEGACY_VAULT_PREFIX = "vox-oauth-vault-v1:";
const NOTICE_KEY = "vox-vault-v1-revoked-notice";
const DONE_KEY = "vox-vault-v1-migrated-for";

/**
 * Marcador de cofre revogado.
 *
 * @returns {object}
 */
const revokedMarker = () => ({ v: 1, revoked: true, updatedAt: Date.now() });

/**
 * Endereços dos cofres v1 que este aparelho guarda.
 * @param {Storage} [storage] armazenamento a varrer (padrão: `localStorage`)
 * @returns {string[]} endereços v1, sem o prefixo
 */
export function listLegacyLookupKeys(storage = globalThis.localStorage) {
  const keys = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name?.startsWith(LEGACY_VAULT_PREFIX)) keys.push(name.slice(LEGACY_VAULT_PREFIX.length));
    }
  } catch {
    /* ignore */
  }
  return keys;
}

/**
 * Revoga os endereços v1 dados: apaga a cópia local e grava a marca `revoked` no servidor.
 * @param {string[]} lookupKeys endereços v1 (repetidos e vazios são ignorados)
 * @param {{ saveRemote?: (key: string, record: object) => unknown, storage?: Storage }} [opts] gravação remota e armazenamento local
 * @returns {number} quantos endereços distintos foram revogados
 */
export function revokeLegacyVaults(lookupKeys, { saveRemote, storage = globalThis.localStorage } = {}) {
  const unique = [...new Set(lookupKeys.filter(Boolean))];
  for (const key of unique) {
    try {
      storage.removeItem(LEGACY_VAULT_PREFIX + key);
    } catch {
      /* ignore */
    }
    saveRemote?.(key, revokedMarker());
  }
  return unique.length;
}

/**
 * Chaves de cofre legadas para quem entrou por provedor (Google ou Meta).
 *
 * @param {object} enrichment
 * @returns {Promise<object[]>}
 */
async function legacyKeysForLinkedLogin(enrichment) {
  const sub = String(enrichment?.oauthSub || "").trim();
  const provider = String(enrichment?.oauthProvider || "").trim();
  if (!sub || !["google", "meta"].includes(provider)) return [];
  return [await legacyLookupKey(sub, provider)];
}

/**
 * Lê o marcador de migração concluída, tolerando armazenamento indisponível.
 *
 * @param {Storage} storage
 * @returns {string|null}
 */
function readDoneMarker(storage) {
  try {
    return storage.getItem(DONE_KEY);
  } catch {
    return null;
  }
}

/**
 * Migração da abertura: revoga os v1 guardados no aparelho e o v1 do login social vinculado (a cópia
 * local pode faltar). `serverMarker` identifica os servidores de memória escolhidos: se mudarem, a
 * revogação roda de novo, para chegar também ao servidor novo.
 * @param {{ enrichment?: object, saveRemote?: (key: string, record: object) => unknown, serverMarker?: string, storage?: Storage }} [opts]
 *   enriquecimento do perfil (login vinculado), gravação remota, marca dos servidores escolhidos e armazenamento
 * @returns {Promise<number>} quantos cofres v1 locais foram revogados (0 quando não havia nada a fazer)
 */
export async function migrateLegacyVaults({ enrichment, saveRemote, serverMarker = "", storage = globalThis.localStorage } = {}) {
  const localKeys = listLegacyLookupKeys(storage);
  if (!localKeys.length && readDoneMarker(storage) === serverMarker) return 0;
  const keys = [...localKeys, ...(await legacyKeysForLinkedLogin(enrichment))];
  revokeLegacyVaults(keys, { saveRemote, storage });
  if (localKeys.length) markLegacyRevokedNotice(storage);
  try {
    storage.setItem(DONE_KEY, serverMarker);
  } catch {
    /* ignore */
  }
  return localKeys.length;
}

/**
 * Marca que a pessoa precisa ser avisada da revogação do v1.
 * @param {Storage} [storage] armazenamento (padrão: `localStorage`)
 * @returns {void}
 */
export function markLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    storage.setItem(NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * Lê e apaga o aviso pendente: devolve true uma vez depois da revogação, para o app avisar a pessoa.
 * @param {Storage} [storage] armazenamento (padrão: `localStorage`)
 * @returns {boolean}
 */
export function consumeLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    if (storage.getItem(NOTICE_KEY) !== "1") return false;
    storage.removeItem(NOTICE_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Apaga o aviso pendente sem mostrar (a pessoa já criou a Senha Soberana de novo).
 * @param {Storage} [storage] armazenamento (padrão: `localStorage`)
 * @returns {void}
 */
export function clearLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    storage.removeItem(NOTICE_KEY);
  } catch {
    /* ignore */
  }
}
