/**
 * @file PM-90 — revogação dos cofres v1.
 *
 * O formato v1 não protegia o cofre como prometido. Na abertura do app, cada cofre v1 que este aparelho
 * conhece é revogado: a cópia local sai e o servidor de memória escolhido recebe, no mesmo endereço,
 * uma marca `revoked` no lugar do conteúdo cifrado. Como o v1 não pode ser cifrado de novo sem a senha,
 * a pessoa recebe um aviso, uma vez, para criar a Senha Soberana de novo.
 */

import { legacyLookupKey } from "./vault-crypto.js";

export const LEGACY_VAULT_PREFIX = "vox-oauth-vault-v1:";
const NOTICE_KEY = "vox-vault-v1-revoked-notice";
const DONE_KEY = "vox-vault-v1-migrated-for";

const revokedMarker = () => ({ v: 1, revoked: true, updatedAt: Date.now() });

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

/** Revoga os endereços v1 dados: apaga a cópia local e grava a marca no servidor. Devolve quantos. */
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

async function legacyKeysForLinkedLogin(enrichment) {
  const sub = String(enrichment?.oauthSub || "").trim();
  const provider = String(enrichment?.oauthProvider || "").trim();
  if (!sub || !["google", "meta"].includes(provider)) return [];
  return [await legacyLookupKey(sub, provider)];
}

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

export function markLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    storage.setItem(NOTICE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Devolve true uma vez depois da revogação, para o app avisar a pessoa. */
export function consumeLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    if (storage.getItem(NOTICE_KEY) !== "1") return false;
    storage.removeItem(NOTICE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearLegacyRevokedNotice(storage = globalThis.localStorage) {
  try {
    storage.removeItem(NOTICE_KEY);
  } catch {
    /* ignore */
  }
}
