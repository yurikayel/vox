/**
 * @module vault-store
 * @file Onde o cofre cifrado mora: neste aparelho (`localStorage`) e nos servidores de memória escolhidos
 * (`/memory/vault/<endereço>`). Busca em todos os servidores em paralelo, prefere o registro mais novo e respeita
 * a marca de revogado; grava com a prova de dono (PM-94). Não abre nem cifra nada: isso é `vault-crypto.js`, e
 * quem decide o que gravar é `oauth-vault.js` (ADR-032 §6.3).
 */

import { getCentralMemoryUrls } from "./central-memory.js";
import { deriveVaultAddress, isRevokedRecord, legacyLookupKey } from "./vault-crypto.js";
import { LEGACY_VAULT_PREFIX } from "./vault-legacy.js";

/** Prefixo das chaves do cofre v2 no `localStorage`. */
export const VAULT_STORAGE_PREFIX = "vox-vault-v2:";

async function probeVaultUrl(baseUrl, lookupKey) {
  try {
    const res = await fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res) return { reachable: false, record: null };
    if (!res.ok) return { reachable: true, record: null };
    const data = await res.json();
    return { reachable: true, record: data?.record || null };
  } catch {
    return { reachable: false, record: null };
  }
}

async function fetchRemoteVaultStatus(lookupKey) {
  const settled = await Promise.all(getCentralMemoryUrls().map((u) => probeVaultUrl(u, lookupKey)));
  const reachable = settled.filter((r) => r.reachable).length;
  const records = settled.map((r) => r.record).filter(Boolean);
  if (records.some((r) => isRevokedRecord(r))) return { record: null, revoked: true, reachable };
  records.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
  return { record: records[0] || null, revoked: false, reachable };
}

/**
 * Busca o cofre remoto em todos os servidores configurados em paralelo (anti-rollback).
 * @param {string} lookupKey
 * @returns {Promise<object|null>}
 */
export async function fetchRemoteVaultRecord(lookupKey) {
  return (await fetchRemoteVaultStatus(lookupKey)).record;
}

const REMOTE_SAVE_TIMEOUT_MS = 4000;

async function postVaultRecord(baseUrl, lookupKey, body) {
  try {
    const res = await fetch(`${baseUrl}/memory/vault/${lookupKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout?.(REMOTE_SAVE_TIMEOUT_MS),
    });
    return Boolean(res?.ok);
  } catch {
    return false;
  }
}

/**
 * Grava o cofre nos servidores de memória escolhidos. Cofre v2 vai com a prova do dono (PM-94).
 * @param {string} lookupKey endereço do cofre
 * @param {object} record cofre cifrado
 * @param {string|null} [ownerToken] prova do dono, derivada da senha (e e-mail)
 * @returns {Promise<number>} quantos servidores aceitaram (ADR-032: só assim o cofre conta como saída)
 */
export async function saveRemoteVaultRecord(lookupKey, record, ownerToken = null) {
  const body = JSON.stringify(ownerToken ? { lookupKey, record, ownerToken } : { lookupKey, record });
  const results = await Promise.all(getCentralMemoryUrls().map((url) => postVaultRecord(url, lookupKey, body)));
  return results.filter(Boolean).length;
}


function readLocalVaultRecord(lookupKey, prefix) {
  try {
    const rawLocal = localStorage.getItem(prefix + lookupKey);
    if (!rawLocal) return { record: null, revoked: false };
    const parsed = JSON.parse(rawLocal);
    return isRevokedRecord(parsed) ? { record: null, revoked: true } : { record: parsed, revoked: false };
  } catch {
    return { record: null, revoked: false };
  }
}

/**
 * Procura o cofre neste aparelho e, se não houver, nos servidores de memória.
 * @param {string} lookupKey endereço do cofre
 * @param {string} prefix prefixo no `localStorage` (v2 ou legado)
 * @returns {Promise<{ record: object|null, revoked: boolean, reachable: number }>} `reachable`: servidores que responderam
 */
export async function findVaultRecordWithStatus(lookupKey, prefix) {
  const local = readLocalVaultRecord(lookupKey, prefix);
  if (local.revoked) return { record: null, revoked: true, reachable: 1 };
  if (local.record) return { record: local.record, revoked: false, reachable: 1 };
  return fetchRemoteVaultStatus(lookupKey);
}

/**
 * O registro cifrado do cofre, ou null (sem cofre ou revogado).
 * @param {string} lookupKey endereço do cofre
 * @param {string} prefix prefixo no `localStorage`
 * @returns {Promise<object|null>}
 */
export async function findEncryptedVaultRecord(lookupKey, prefix) {
  return (await findVaultRecordWithStatus(lookupKey, prefix)).record;
}

/**
 * Grava o cofre neste aparelho e nos servidores de memória.
 * @param {string} address endereço do cofre
 * @param {object} record registro cifrado
 * @param {string} ownerToken prova de dono (PM-94)
 * @returns {Promise<number>} quantos servidores aceitaram
 */
export function persistVaultRecord(address, record, ownerToken) {
  try {
    localStorage.setItem(VAULT_STORAGE_PREFIX + address, JSON.stringify(record));
  } catch {
    /* ignore */
  }
  return saveRemoteVaultRecord(address, record, ownerToken);
}

/**
 * Apaga só a cópia deste aparelho de um cofre; os servidores não são tocados.
 * @param {string} address endereço do cofre
 * @returns {void}
 */
export function forgetLocalVaultRecord(address) {
  try { localStorage.removeItem(VAULT_STORAGE_PREFIX + address); } catch { /* ignore */ }
}

/**
 * Revoga um endereço de cofre: apaga a cópia local e grava a marca de revogado nos servidores.
 * @param {string} address endereço a revogar
 * @param {string} ownerToken prova de dono desse endereço
 * @returns {Promise<number>} quantos servidores aceitaram
 */
export function revokeVaultAddress(address, ownerToken) {
  forgetLocalVaultRecord(address);
  return saveRemoteVaultRecord(address, { v: 2, revoked: true, updatedAt: Date.now() }, ownerToken);
}

/**
 * Procura o cofre destas credenciais, na ordem: e-mail+senha (v2), só a senha (v2, para migrar) e v1 antigo.
 * Endereço revogado para a busca: o cofre mudou de endereço.
 * @param {string} clean senha já sem espaços nas pontas
 * @param {string|null} addressOverride endereço já conhecido (pula a derivação)
 * @param {string} [normEmail] e-mail normalizado, ou ""
 * @returns {Promise<{ record: object|null, legacyKey: string|null, legacyV2: { address: string }|null, reachable: number }>}
 */
export async function locatePassphraseRecord(clean, addressOverride, normEmail = "") {
  const primaryAddr = addressOverride || (await deriveVaultAddress(clean, normEmail));
  const primary = await findVaultRecordWithStatus(primaryAddr, VAULT_STORAGE_PREFIX);
  if (primary.record) return { record: primary.record, legacyKey: null, legacyV2: null, reachable: primary.reachable };
  if (primary.revoked) return { record: null, legacyKey: null, legacyV2: null, reachable: primary.reachable };
  let reachable = primary.reachable;
  if (normEmail && !addressOverride) {
    const passOnlyAddr = await deriveVaultAddress(clean, "");
    const passOnly = await findVaultRecordWithStatus(passOnlyAddr, VAULT_STORAGE_PREFIX);
    reachable = Math.max(reachable, passOnly.reachable);
    if (passOnly.record) return { record: passOnly.record, legacyKey: null, legacyV2: { address: passOnlyAddr }, reachable };
    if (passOnly.revoked) return { record: null, legacyKey: null, legacyV2: null, reachable };
  }
  const legacyKey = await legacyLookupKey(clean, "passphrase");
  const legacy = await findVaultRecordWithStatus(legacyKey, LEGACY_VAULT_PREFIX);
  return { record: legacy.record, legacyKey: legacy.record ? legacyKey : null, legacyV2: null, reachable: Math.max(reachable, legacy.reachable) };
}
