/** @file Armazenamento local e ciclo de vida soberano de contas vinculadas. */

import { addBskySubscription } from "./bsky-feed.js";
import { clearBskySession } from "./bsky-oauth.js";
import {
  LINKED_ACCOUNTS_KEY,
  AUTO_REPLICATE_KEY,
  GENERAL_WEBHOOK_KEY,
  validateHandle,
  getNetworkAuthUrl,
} from "./linked-accounts-format.js";

/**
 * Remove vínculos salvos com handle inválido ou de perfil oficial (ex.: @instagram inventado). Vínculo feito por
 * login, sem @usuário, fica.
 * @param {Object<string, object>} accounts Contas vinculadas, por rede.
 * @returns {Object<string, object>} Só os vínculos válidos.
 */
export function sanitizeLinkedAccounts(accounts) {
  const out = {};
  for (const [netId, acc] of Object.entries(accounts || {})) {
    const viaLogin = acc?.via === "oauth" && (acc.accountId || acc.did);
    if ((acc?.handle && validateHandle(netId, acc.handle).ok) || (viaLogin && !acc?.handle)) out[netId] = acc;
  }
  return out;
}

/**
 * Contas vinculadas guardadas, já sem vínculos inválidos (e regrava a lista limpa se algo saiu).
 * @returns {Object<string, object>} Conta por rede; vazio sem `localStorage` ou se a leitura falhar.
 */
export function loadLinkedAccounts() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LINKED_ACCOUNTS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const clean = sanitizeLinkedAccounts(parsed);
    if (Object.keys(clean).length !== Object.keys(parsed).length) {
      localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(clean));
    }
    return clean;
  } catch {
    return {};
  }
}

function resolveField(val, fallback) {
  if (val != null) return String(val).trim();
  if (fallback != null) return String(fallback).trim();
  return "";
}

/** Campos de identidade: herdados só quando o @usuário não mudou. */
function identityFields(opts, prev, cleanHandle) {
  const same = prev.handle === cleanHandle;
  const keep = (k) => (same ? prev[k] : "");
  return {
    verified: opts.verified !== undefined ? Boolean(opts.verified) : same && Boolean(prev.verified),
    via: opts.via || keep("via") || "manual",
    did: resolveField(opts.did, keep("did")),
    accountId: resolveField(opts.accountId, keep("accountId")),
    displayName: resolveField(opts.displayName, keep("displayName")),
  };
}

/**
 * Grava ou atualiza o vínculo de uma rede. Webhook e App Password não informados mantêm os anteriores; verificado,
 * via, DID, id e nome não informados só são herdados se o @usuário não mudou. No Bluesky, também segue o perfil no feed.
 * @param {string} netId Rede (`bsky`, `twitter` etc.).
 * @param {{handle?: string, webhook?: string, appPassword?: string, enabled?: boolean, verified?: boolean, via?: string, did?: string, accountId?: string, displayName?: string}} options
 *   Dados do vínculo.
 * @returns {Object<string, object>} Todas as contas vinculadas depois da gravação.
 */
export function saveLinkedAccount(netId, options) {
  if (typeof localStorage === "undefined") return {};
  const current = loadLinkedAccounts();
  const cleanId = String(netId || "").trim().toLowerCase();
  if (!cleanId) return current;

  const opts = options || {};
  const cleanHandle = String(opts.handle || "").trim().replace(/^@/, "");
  const prev = current[cleanId] || {};
  current[cleanId] = {
    handle: cleanHandle,
    webhook: resolveField(opts.webhook, prev.webhook),
    appPassword: resolveField(opts.appPassword, prev.appPassword),
    enabled: opts.enabled !== undefined ? Boolean(opts.enabled) : true,
    ...identityFields(opts, prev, cleanHandle),
    linkedAt: prev.linkedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(current));
  if (cleanId === "bsky" && cleanHandle) addBskySubscription(cleanHandle);
  return current;
}

/**
 * Remove o vínculo de uma rede (no Bluesky, também apaga a sessão OAuth).
 * @param {string} netId Rede.
 * @returns {Object<string, object>} As contas vinculadas que sobraram.
 */
export function removeLinkedAccount(netId) {
  if (typeof localStorage === "undefined") return {};
  const current = loadLinkedAccounts();
  const cleanId = String(netId || "").trim().toLowerCase();
  delete current[cleanId];
  localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(current));
  if (cleanId === "bsky") clearBskySession();
  return current;
}

/**
 * Indica se a replicação automática dos posts está ligada.
 * @returns {boolean} Verdadeiro se ligada; falso sem `localStorage`.
 */
export function isAutoReplicationEnabled() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(AUTO_REPLICATE_KEY) === "true";
}

/**
 * Liga ou desliga a replicação automática dos posts.
 * @param {boolean} enabled Ligar ou desligar.
 */
export function setAutoReplicationEnabled(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTO_REPLICATE_KEY, enabled ? "true" : "false");
}

/**
 * Webhook geral, que recebe toda replicação.
 * @returns {string} O endereço, ou vazio se não houver.
 */
export function getGeneralWebhookUrl() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(GENERAL_WEBHOOK_KEY) || "";
}

/**
 * Grava o webhook geral; vazio apaga.
 * @param {string} url Endereço do webhook.
 */
export function setGeneralWebhookUrl(url) {
  if (typeof localStorage === "undefined") return;
  const clean = String(url || "").trim();
  if (clean) localStorage.setItem(GENERAL_WEBHOOK_KEY, clean);
  else localStorage.removeItem(GENERAL_WEBHOOK_KEY);
}

/**
 * Marca o vínculo como confirmado pelo próprio usuário (após conferir o perfil).
 * @param {string} netId Rede.
 * @returns {boolean} Falso se não houver vínculo com @usuário nessa rede.
 */
export function confirmLinkedAccount(netId) {
  const acc = loadLinkedAccounts()[netId];
  if (!acc?.handle) return false;
  saveLinkedAccount(netId, { ...acc, verified: true });
  return true;
}

/**
 * Vincula a conta com o @usuário digitado e abre o perfil público para a pessoa conferir.
 * Não faz login na rede: o vínculo fica "não verificado" até o teste ou a confirmação.
 * @param {string} netId Rede.
 * @param {string} [inputHandle=""] Usuário digitado.
 * @returns {{ok: boolean, netId: string, handle?: string, authUrl?: string, error?: string}} O vínculo gravado e o
 *   perfil aberto, ou o erro de validação.
 */
export function connectWithOneClick(netId, inputHandle = "") {
  const cleanId = String(netId || "").trim().toLowerCase();
  const v = validateHandle(cleanId, inputHandle);
  if (!v.ok) return { ok: false, netId: cleanId, error: v.error };
  const profileUrl = getNetworkAuthUrl(cleanId, v.handle);
  if (typeof window !== "undefined" && typeof window.open === "function") {
    try {
      window.open(profileUrl, "_blank", "noopener,noreferrer");
    } catch {}
  }
  saveLinkedAccount(cleanId, { handle: v.handle, enabled: true, verified: false });
  return { ok: true, netId: cleanId, handle: v.handle, authUrl: profileUrl };
}
