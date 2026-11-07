/** @file Gerenciador soberano de contas vinculadas e auto-replicação multi-redes (ATProto + Webhooks). */

import { addBskySubscription } from "./bsky-feed.js";
import { loadBskySession, clearBskySession, postWithBskySession } from "./bsky-oauth.js";

export const LINKED_ACCOUNTS_KEY = "vox-linked-accounts-v1";
export const AUTO_REPLICATE_KEY = "vox-auto-replicate-enabled";
export const GENERAL_WEBHOOK_KEY = "vox-replication-webhook";
export const BSKY_DEFAULT_PDS = "https://bsky.social";

export const SUPPORTED_NETWORKS = Object.freeze([
  { id: "bsky", name: "Bluesky", icon: "🦋", color: "#0085ff", canAutoWebhook: true, supportsAtProto: true, hasFeed: true },
  { id: "twitter", name: "Twitter / X", icon: "🐦", color: "#1d9bf0", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "threads", name: "Threads", icon: "🧵", color: "#000000", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "instagram", name: "Instagram", icon: "📸", color: "#e1306c", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "facebook", name: "Facebook", icon: "👥", color: "#1877f2", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "tiktok", name: "TikTok", icon: "🎵", color: "#000000", canAutoWebhook: true, supportsAtProto: false, hasFeed: false },
  { id: "github", name: "GitHub", icon: "🐙", color: "#24292f", canAutoWebhook: false, supportsAtProto: false, hasFeed: false },
]);

/** Formato de @usuário aceito por rede (regras públicas de cada plataforma). */
const HANDLE_RULES = {
  bsky: { re: /^(?=.{3,253}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i, hint: "domínio completo, ex.: voce.bsky.social" },
  twitter: { re: /^[A-Za-z0-9_]{1,15}$/, hint: "até 15 letras, números ou _" },
  threads: { re: /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/, hint: "até 30 letras, números, . ou _" },
  instagram: { re: /^(?!.*\.\.)(?!\.)(?!.*\.$)[A-Za-z0-9._]{1,30}$/, hint: "até 30 letras, números, . ou _" },
  facebook: { re: /^[A-Za-z0-9.]{5,50}$/, hint: "5 a 50 letras, números ou ." },
  tiktok: { re: /^[A-Za-z0-9._]{2,24}$/, hint: "2 a 24 letras, números, . ou _" },
  github: { re: /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, hint: "até 39 letras, números ou -" },
};

/** Perfis oficiais das próprias redes — nunca são "a sua conta". */
const OFFICIAL_HANDLES = {
  bsky: ["bsky.app", "bluesky", "bsky.social"],
  twitter: ["x", "twitter", "xdevelopers"],
  threads: ["threads", "instagram", "meta"],
  instagram: ["instagram", "meta", "creators"],
  facebook: ["facebook", "meta", "zuck"],
  tiktok: ["tiktok"],
  github: ["github"],
};

export function normalizeHandle(raw) {
  return String(raw || "").trim().replace(/^@+/, "").replace(/^https?:\/\/\S*?\/(?:@)?/i, "").replace(/\/+$/, "");
}

/**
 * Valida o @usuário digitado. Nada é inventado: sem handle válido, não há vínculo.
 * @returns {{ ok: boolean, handle: string, error?: string }}
 */
export function validateHandle(netId, raw) {
  const handle = normalizeHandle(raw);
  const net = SUPPORTED_NETWORKS.find((n) => n.id === netId);
  const name = net?.name || netId;
  if (!handle) return { ok: false, handle, error: `Digite o seu @usuário no ${name}.` };
  const rule = HANDLE_RULES[netId];
  if (rule && !rule.re.test(handle)) return { ok: false, handle, error: `@${handle} não é um usuário válido no ${name} (${rule.hint}).` };
  if ((OFFICIAL_HANDLES[netId] || []).includes(handle.toLowerCase()) || handle.toLowerCase() === String(netId).toLowerCase()) {
    return { ok: false, handle, error: `@${handle} é o perfil oficial do ${name}, não o seu. Digite o seu @usuário.` };
  }
  return { ok: true, handle };
}

/** Remove vínculos salvos com handle inválido ou de perfil oficial (ex.: @instagram inventado). */
export function sanitizeLinkedAccounts(accounts) {
  const out = {};
  for (const [netId, acc] of Object.entries(accounts || {})) {
    const viaLogin = acc?.via === "oauth" && (acc.accountId || acc.did);
    if ((acc?.handle && validateHandle(netId, acc.handle).ok) || (viaLogin && !acc?.handle)) out[netId] = acc;
  }
  return out;
}

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

export function removeLinkedAccount(netId) {
  if (typeof localStorage === "undefined") return {};
  const current = loadLinkedAccounts();
  const cleanId = String(netId || "").trim().toLowerCase();
  delete current[cleanId];
  localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(current));
  if (cleanId === "bsky") clearBskySession();
  return current;
}

export function isAutoReplicationEnabled() {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(AUTO_REPLICATE_KEY) === "true";
}

export function setAutoReplicationEnabled(enabled) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(AUTO_REPLICATE_KEY, enabled ? "true" : "false");
}

export function getGeneralWebhookUrl() {
  if (typeof localStorage === "undefined") return "";
  return localStorage.getItem(GENERAL_WEBHOOK_KEY) || "";
}

export function setGeneralWebhookUrl(url) {
  if (typeof localStorage === "undefined") return;
  const clean = String(url || "").trim();
  if (clean) localStorage.setItem(GENERAL_WEBHOOK_KEY, clean);
  else localStorage.removeItem(GENERAL_WEBHOOK_KEY);
}

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

export async function postToBlueskyAtProto(handle, appPassword, post, pdsUrl = BSKY_DEFAULT_PDS) {
  const identifier = String(handle || "").trim().replace(/^@/, "");
  const password = String(appPassword || "").trim();
  if (!identifier || !password) return { ok: false, reason: "missing_credentials" };

  try {
    const sessRes = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password }),
    });
    if (!sessRes.ok) return { ok: false, reason: "auth_failed" };
    const session = await sessRes.json();
    return await createBskyPostRecord(pdsUrl, session, post);
  } catch (err) {
    return { ok: false, reason: err?.message || "network_error" };
  }
}

async function createBskyPostRecord(pdsUrl, session, post) {
  const title = String(post?.title || "").trim();
  const body = String(post?.body || "").trim();
  const url = String(post?.canonicalUrl || "").trim();
  const rawText = [title, body !== title ? body : "", url].filter(Boolean).join("\n\n").slice(0, 295);

  const recRes = await fetch(`${pdsUrl}/xrpc/com.atproto.repo.createRecord`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessJwt}`,
    },
    body: JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: { $type: "app.bsky.feed.post", text: rawText, createdAt: new Date().toISOString() },
    }),
  });
  return { ok: recRes.ok, uri: recRes.ok ? (await recRes.json())?.uri : "" };
}

async function sendWebhookPost(url, payload) {
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

export const INTENT_NETWORK_META = Object.freeze({
  twitter: { id: "twitter", label: "X (Twitter)", icon: "🐦" },
  threads: { id: "threads", label: "Threads", icon: "🧵" },
  bsky: { id: "bluesky", label: "Bluesky", icon: "🦋" },
  instagram: { id: "instagram", label: "Instagram", icon: "📸" },
  facebook: { id: "facebook", label: "Facebook", icon: "👥" },
  tiktok: { id: "tiktok", label: "TikTok", icon: "🎵" },
});

function isAccountNeedingIntent(netId, acc) {
  if (!acc || acc.enabled === false || !acc.handle) return false;
  if (acc.webhook) return false;
  if (netId === "bsky" && (acc.appPassword || acc.via === "oauth")) return false;
  return true;
}

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
    return () => postWithBskySession([payload.title, payload.body, payload.url].filter(Boolean).join("\n\n"));
  }
  if (acc.handle && acc.appPassword) return () => postToBlueskyAtProto(acc.handle, acc.appPassword, payload);
  return null;
}

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

export function resolveNetworkProfileUrl(netId, handle) {
  const h = String(handle || "").trim().replace(/^@/, "");
  if (!h) return "";
  if (netId === "instagram") return `https://www.instagram.com/${h}/`;
  if (netId === "twitter") return `https://x.com/${h}`;
  if (netId === "threads") return `https://www.threads.net/@${h}`;
  if (netId === "facebook") return `https://www.facebook.com/${h}`;
  if (netId === "tiktok") return `https://www.tiktok.com/@${h}`;
  if (netId === "bsky") return `https://bsky.app/profile/${h}`;
  if (netId === "github") return `https://github.com/${h}`;
  return "";
}

async function testBskyConnection(data) {
  if (data?.appPassword) {
    const res = await postToBlueskyAtProto(data.handle, data.appPassword, {
      title: "Teste de Conexão Vox",
      body: "Testando autenticação AT Protocol.",
    });
    if (res.ok) return { ok: true, message: `✅ Sessão AT Protocol ativa para @${data.handle}! Pronto para postar direto.` };
    return { ok: false, message: `⚠️ Falha na autenticação AT Protocol: verifique o App Password de @${data.handle}.` };
  }
  try {
    const r = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(data.handle)}`);
    if (r.ok) return { ok: true, message: `✅ Perfil @${data.handle} confirmado no Bluesky! (Leitura e citação ativas)` };
    return { ok: false, message: `⚠️ Perfil @${data.handle} não encontrado no Bluesky público.` };
  } catch {
    return { ok: false, message: "Erro de conexão ao consultar Bluesky." };
  }
}

async function testGithubConnection(data) {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(data.handle)}`);
    if (res.ok) return { ok: true, message: `✅ Perfil @${data.handle} confirmado na API do GitHub!` };
    return { ok: false, message: `⚠️ Perfil @${data.handle} não encontrado no GitHub.` };
  } catch {
    return { ok: false, message: "Erro ao consultar API do GitHub." };
  }
}

function oauthTestResult(netId, data) {
  const who = data.handle ? `@${data.handle}` : data.displayName || "sua conta";
  return { ok: true, state: "verified", profileUrl: resolveNetworkProfileUrl(netId, data.handle), message: `✅ ${who} conectada por login na própria rede.` };
}

async function testWebhookConnection(netId, data, webhookUrl) {
  const payload = { event: "vox.connection.test", network: netId, handle: data.handle, testedAt: new Date().toISOString() };
  const res = await sendWebhookPost(webhookUrl, payload);
  return res.ok
    ? { ok: true, message: `✅ Webhook testado com sucesso para @${data.handle}!`, profileUrl: resolveNetworkProfileUrl(netId, data.handle) }
    : { ok: false, message: `⚠️ Falha ao contactar webhook: ${res.error || "erro de rede"}` };
}

async function testPublicApiConnection(netId, data) {
  const res = netId === "bsky" ? await testBskyConnection(data) : await testGithubConnection(data);
  if (res.ok) saveLinkedAccount(netId, { ...data, verified: true });
  return { ...res, state: res.ok ? "verified" : "error", profileUrl: resolveNetworkProfileUrl(netId, data.handle) };
}

export async function testLinkedAccount(netId) {
  const accounts = loadLinkedAccounts();
  const data = accounts[netId];
  if (!data?.handle && data?.via !== "oauth") return { ok: false, message: "Nenhuma conta vinculada." };
  if (data.via === "oauth") return oauthTestResult(netId, data);
  const webhookUrl = data.webhook || getGeneralWebhookUrl();
  if (webhookUrl) return testWebhookConnection(netId, data, webhookUrl);
  if (netId === "bsky" || netId === "github") return testPublicApiConnection(netId, data);

  const profileUrl = resolveNetworkProfileUrl(netId, data.handle);
  const name = SUPPORTED_NETWORKS.find((n) => n.id === netId)?.name || netId;
  return {
    ok: false,
    state: "unverified",
    profileUrl,
    message: `O ${name} não permite verificar a conta sem login. Abra o perfil @${data.handle}, confira se é você e confirme. Sem webhook, o Vox replica abrindo o app da rede com o texto copiado — não posta sozinho.`,
  };
}

/** Marca o vínculo como confirmado pelo próprio usuário (após conferir o perfil). */
export function confirmLinkedAccount(netId) {
  const acc = loadLinkedAccounts()[netId];
  if (!acc?.handle) return false;
  saveLinkedAccount(netId, { ...acc, verified: true });
  return true;
}

const NETWORK_AUTH_TEMPLATES = {
  bsky: { withHandle: (h) => `https://bsky.app/profile/${encodeURIComponent(h)}`, fallback: "https://bsky.app/" },
  twitter: { withHandle: (h) => `https://x.com/${encodeURIComponent(h)}`, fallback: "https://x.com/" },
  threads: { withHandle: (h) => `https://www.threads.net/@${encodeURIComponent(h)}`, fallback: "https://www.threads.net/" },
  instagram: { withHandle: (h) => `https://www.instagram.com/${encodeURIComponent(h)}/`, fallback: "https://www.instagram.com/" },
  facebook: { fallback: "https://www.facebook.com/" },
  tiktok: { withHandle: (h) => `https://www.tiktok.com/@${encodeURIComponent(h)}`, fallback: "https://www.tiktok.com/" },
  github: { withHandle: (h) => `https://github.com/${encodeURIComponent(h)}`, fallback: "https://github.com/login" },
};

export function getNetworkAuthUrl(netId, handle = "") {
  const h = String(handle || "").trim().replace(/^@/, "");
  const tmpl = NETWORK_AUTH_TEMPLATES[netId];
  if (!tmpl) return "https://google.com";
  if (h && tmpl.withHandle) return tmpl.withHandle(h);
  return tmpl.fallback;
}

/**
 * Handle já informado pelo próprio usuário para esta rede (nunca um palpite a partir do nome,
 * do ID local ou de contas seguidas — isso gerava vínculos com perfis de outras pessoas).
 */
export function getSuggestedHandle(netId = "") {
  if (typeof localStorage === "undefined") return "";
  const saved = localStorage.getItem(`vox-profile-${netId}`);
  const v = saved ? validateHandle(netId, saved) : null;
  return v?.ok ? v.handle : "";
}

/**
 * Vincula a conta com o @usuário digitado e abre o perfil público para a pessoa conferir.
 * Não faz login na rede: o vínculo fica "não verificado" até o teste ou a confirmação.
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
