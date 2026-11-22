/** @file Disparo de replicação de posts para webhooks e redes vinculadas. */

import { loadBskySession, postWithBskySession } from "./bsky-oauth.js";
import { INTENT_NETWORK_META } from "./linked-accounts-format.js";
import { loadLinkedAccounts, isAutoReplicationEnabled, getGeneralWebhookUrl } from "./linked-accounts-store.js";
import { bskyPostText, postToBlueskyAtProto } from "./linked-accounts-bsky.js";

/**
 * Envia postagem via webhook em modo no-cors.
 * @param {string} url Endereço do webhook.
 * @param {object} payload Carga JSON a enviar.
 * @returns {Promise<{ok: boolean, url: string, error?: string}>} Resultado do envio.
 */
export async function sendWebhookPost(url, payload) {
  try {
    await fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return { ok: true, url };
  } catch (err) {
    return { ok: false, url, error: err?.message };
  }
}

function collectWebhookTargets(accounts) {
  const targets = [];
  const generalUrl = getGeneralWebhookUrl();
  if (generalUrl) targets.push(generalUrl);
  for (const data of Object.values(accounts)) {
    if (data?.enabled && data?.webhook && !targets.includes(data.webhook)) {
      targets.push(data.webhook);
    }
  }
  return targets;
}

function isAccountNeedingIntent(netId, acc) {
  if (!acc || acc.enabled === false || !acc.handle) return false;
  if (acc.webhook) return false;
  if (netId === "bsky" && (acc.appPassword || acc.via === "oauth")) return false;
  return true;
}

/**
 * Contas vinculadas que só replicam por intent: ativas, com @usuário, sem webhook e, no Bluesky, sem App Password
 * nem login.
 * @param {Object<string, object>} [accounts] Contas vinculadas (padrão: `loadLinkedAccounts()`).
 * @returns {{id: string, netId: string, handle: string, label: string, icon: string}[]} Alvos para os botões de compartilhar.
 */
export function getConnectedIntentTargets(accounts = loadLinkedAccounts()) {
  const list = [];
  for (const [netId, meta] of Object.entries(INTENT_NETWORK_META)) {
    const acc = accounts?.[netId];
    if (!isAccountNeedingIntent(netId, acc)) continue;
    list.push({
      id: meta.id,
      netId,
      handle: acc.handle,
      label: `${meta.label} (@${acc.handle})`,
      icon: meta.icon,
    });
  }
  return list;
}

/**
 * Indica se há para onde replicar sem a pessoa tocar: algum webhook ou Bluesky com App Password ou login.
 * @param {Object<string, object>} [accounts] Contas vinculadas (padrão: `loadLinkedAccounts()`).
 * @returns {boolean} Verdadeiro se há ao menos um alvo direto.
 */
export function hasDirectReplicationTargets(accounts = loadLinkedAccounts()) {
  const targets = collectWebhookTargets(accounts);
  const bskyAcc = accounts?.bsky;
  const hasBskyDirect = Boolean(bskyAcc?.enabled && bskyAcc?.handle && (bskyAcc?.appPassword || bskyAcc?.via === "oauth"));
  return targets.length > 0 || hasBskyDirect;
}

/** Postagem direta no Bluesky: sessão OAuth (preferida) ou App Password. */
function bskyReplicationTask(acc, payload) {
  if (!acc?.enabled) return null;
  if (acc.via === "oauth" && loadBskySession()) {
    return () => postWithBskySession(bskyPostText(payload));
  }
  if (acc.handle && acc.appPassword) return () => postToBlueskyAtProto(acc.handle, acc.appPassword, payload);
  return null;
}

/**
 * Carga `vox.post.replicate` enviada aos webhooks e usada na postagem no Bluesky.
 * @param {{id?: string, title?: string, body?: string, canonicalUrl?: string, image?: string}} post Post publicado.
 * @returns {object} Carga com título, texto, link canônico (padrão: a página atual), imagem, data, as redes
 *   vinculadas ativas e a chamada curta para os disparos.
 */
export function buildReplicationPayload(post) {
  const accounts = loadLinkedAccounts();
  const activeNetworks = Object.entries(accounts)
    .filter(([, data]) => data?.enabled)
    .map(([net, data]) => ({ network: net, handle: data.handle }));

  const title = String(post?.title || "").trim();
  const body = String(post?.body || "").trim();
  const canonicalUrl = post?.canonicalUrl || (typeof window !== "undefined" ? window.location.href : "");

  return {
    event: "vox.post.replicate",
    id: post?.id || `post_${Date.now()}`,
    title,
    body,
    canonicalUrl,
    image: post?.image || "",
    publishedAt: new Date().toISOString(),
    linkedNetworks: activeNetworks,
    explodeBurst: {
      headline: `🚨 NOVO POST NO VOX: ${title || body.slice(0, 70)}`,
      actionUrl: canonicalUrl,
    },
    janonesBurst: {
      headline: `🚨 NOVO POST NO VOX: ${title || body.slice(0, 70)}`,
      actionUrl: canonicalUrl,
    },
  };
}

/**
 * Replica o post nos alvos diretos: webhooks (geral e de cada conta, sem repetir) e Bluesky (sessão OAuth ou
 * App Password). Falha de um alvo não impede os outros.
 * @param {object} post Post publicado (ver `buildReplicationPayload`).
 * @param {{force?: boolean}} [options] `force` replica mesmo com a replicação automática desligada.
 * @returns {Promise<{dispatched: boolean, count: number, total?: number, reason?: string}>} Quantos alvos deram certo
 *   de quantos, ou o motivo de não ter disparado (`auto_replication_disabled`, `no_webhooks_configured`).
 */
export async function dispatchAutoReplication(post, { force = false } = {}) {
  if (!force && !isAutoReplicationEnabled()) {
    return { dispatched: false, reason: "auto_replication_disabled", count: 0 };
  }

  const accounts = loadLinkedAccounts();
  const payload = buildReplicationPayload(post);
  const targets = collectWebhookTargets(accounts);
  const bskyTask = bskyReplicationTask(accounts.bsky, payload);

  if (!targets.length && !bskyTask) {
    return { dispatched: false, reason: "no_webhooks_configured", count: 0 };
  }

  const tasks = targets.map((u) => sendWebhookPost(u, payload));
  if (bskyTask) tasks.push(bskyTask());

  const results = await Promise.allSettled(tasks);
  const successful = results.filter((r) => r.status === "fulfilled" && r.value?.ok).length;
  return { dispatched: true, count: successful, total: tasks.length };
}
