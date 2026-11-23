/** @file Segredos das contas vinculadas (App Password, webhook): em memória e, se houver chave do aparelho, cifrados. */

import { openSealed, sealJsonStrict } from "./identity/keys.js";

const SECRETS_KEY = "vox-linked-secrets";
const SECRET_FIELDS = ["appPassword", "webhook"];
const PUBLIC_FIELDS = ["handle", "enabled", "verified", "via", "did", "accountId", "displayName", "linkedAt", "updatedAt"];
const memory = new Map();

/**
 * Metadados de um vínculo, por lista branca: nunca carrega App Password, webhook nem campo desconhecido.
 * @param {object} acc Vínculo.
 * @returns {object} Só os campos públicos.
 */
export function publicFields(acc) {
  const pub = {};
  for (const f of PUBLIC_FIELDS) if (acc?.[f] !== undefined) pub[f] = acc[f];
  return pub;
}

/**
 * Campos secretos de um vínculo.
 * @param {object} acc Vínculo.
 * @returns {{appPassword?: string, webhook?: string}} Segredos presentes.
 */
export function secretFields(acc) {
  const secrets = {};
  for (const f of SECRET_FIELDS) if (acc?.[f]) secrets[f] = String(acc[f]);
  return secrets;
}

/**
 * Guarda os segredos de uma rede em memória (vazio apaga) e tenta persisti-los cifrados.
 * @param {string} netId Rede.
 * @param {{appPassword?: string, webhook?: string}} secrets Segredos.
 */
export function rememberSecrets(netId, secrets) {
  if (Object.keys(secrets).length) memory.set(netId, secrets);
  else memory.delete(netId);
  void persistSecrets();
}

/**
 * Segredos de uma rede guardados em memória.
 * @param {string} netId Rede.
 * @returns {{appPassword?: string, webhook?: string}} Segredos, ou vazio.
 */
export function recallSecrets(netId) {
  return memory.get(netId) || {};
}

/** Cifra com a chave do aparelho; sem chave, nada vai para o armazenamento. */
async function persistSecrets() {
  try {
    const sealed = await sealJsonStrict(Object.fromEntries(memory));
    localStorage.setItem(SECRETS_KEY, JSON.stringify(sealed));
  } catch {
    try { localStorage.removeItem(SECRETS_KEY); } catch {}
  }
}

/**
 * Reabre os segredos cifrados neste aparelho para a memória (sem sobrescrever o que já está nela).
 * @returns {Promise<void>}
 */
export async function hydrateLinkedSecrets() {
  try {
    const raw = localStorage.getItem(SECRETS_KEY);
    if (!raw) return;
    const opened = await openSealed(JSON.parse(raw));
    for (const [netId, s] of Object.entries(opened || {})) if (!memory.has(netId)) memory.set(netId, s);
  } catch {}
}

/**
 * Esquece todos os segredos (memória e armazenamento).
 */
export function clearLinkedSecrets() {
  memory.clear();
  try { localStorage.removeItem(SECRETS_KEY); } catch {}
}
