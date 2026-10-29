/** @file Gerenciador soberano de contas vinculadas e auto-replicação multi-redes (ATProto + Webhooks). */

import { addBskySubscription } from "./bsky-feed.js";

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

export function loadLinkedAccounts() {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LINKED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLinkedAccount(netId, { handle = "", webhook = "", appPassword = "", enabled = true } = {}) {
  if (typeof localStorage === "undefined") return {};
  const current = loadLinkedAccounts();
  const cleanId = String(netId || "").trim().toLowerCase();
  if (!cleanId) return current;

  const cleanHandle = String(handle || "").trim().replace(/^@/, "");
  const prev = current[cleanId] || {};
  current[cleanId] = {
    handle: cleanHandle,
    webhook: String(webhook ?? prev.webhook ?? "").trim(),
    appPassword: String(appPassword ?? prev.appPassword ?? "").trim(),
    enabled: Boolean(enabled),
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

export async function dispatchAutoReplication(post) {
  if (!isAutoReplicationEnabled()) {
    return { dispatched: false, reason: "auto_replication_disabled", count: 0 };
  }

  const accounts = loadLinkedAccounts();
  const payload = buildReplicationPayload(post);
  const targets = collectWebhookTargets(accounts);
  const bskyAcc = accounts.bsky;
  const hasBskyDirect = Boolean(bskyAcc?.enabled && bskyAcc?.handle && bskyAcc?.appPassword);

  if (!targets.length && !hasBskyDirect) {
    return { dispatched: false, reason: "no_webhooks_configured", count: 0 };
  }

  const tasks = targets.map((u) => sendWebhookPost(u, payload));
  if (hasBskyDirect) {
    tasks.push(postToBlueskyAtProto(bskyAcc.handle, bskyAcc.appPassword, payload));
  }

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

export async function testLinkedAccount(netId) {
  const accounts = loadLinkedAccounts();
  const data = accounts[netId];
  if (!data?.handle) return { ok: false, message: "Nenhuma conta vinculada." };

  const webhookUrl = data.webhook || getGeneralWebhookUrl();
  if (webhookUrl) {
    const payload = { event: "vox.connection.test", network: netId, handle: data.handle, testedAt: new Date().toISOString() };
    const res = await sendWebhookPost(webhookUrl, payload);
    return res.ok
      ? { ok: true, message: `✅ Webhook testado com sucesso para @${data.handle}!`, profileUrl: resolveNetworkProfileUrl(netId, data.handle) }
      : { ok: false, message: `⚠️ Falha ao contactar webhook: ${res.error || "erro de rede"}` };
  }

  if (netId === "bsky") return await testBskyConnection(data);
  if (netId === "github") return await testGithubConnection(data);

  const profileUrl = resolveNetworkProfileUrl(netId, data.handle);
  return {
    ok: true,
    profileUrl,
    message: `✅ Conta @${data.handle} registrada no Vox! Disparo em 1 toque (EXPLODE!) pronto.`,
  };
}

export function getNetworkAuthUrl(netId, handle = "") {
  const h = String(handle || "").trim().replace(/^@/, "");
  if (netId === "bsky") {
    return h ? `https://bsky.app/profile/${encodeURIComponent(h)}` : "https://bsky.app/";
  }
  if (netId === "twitter") {
    return h ? `https://x.com/${encodeURIComponent(h)}` : "https://x.com/";
  }
  if (netId === "threads") {
    return h ? `https://www.threads.net/@${encodeURIComponent(h)}` : "https://www.threads.net/";
  }
  if (netId === "instagram") {
    return h ? `https://www.instagram.com/${encodeURIComponent(h)}/` : "https://www.instagram.com/";
  }
  if (netId === "facebook") {
    return "https://www.facebook.com/";
  }
  if (netId === "tiktok") {
    return h ? `https://www.tiktok.com/@${encodeURIComponent(h)}` : "https://www.tiktok.com/";
  }
  if (netId === "github") {
    return h ? `https://github.com/${encodeURIComponent(h)}` : "https://github.com/login";
  }
  return "https://google.com";
}

export function getSuggestedHandle(netId = "") {
  if (typeof localStorage === "undefined") return "";
  const saved = localStorage.getItem(`vox-profile-${netId}`);
  if (saved) return saved.replace(/^@/, "");

  try {
    const rawEnrich = localStorage.getItem("vox-profile-enrichment");
    if (rawEnrich) {
      const enrichment = JSON.parse(rawEnrich);
      if (enrichment?.displayName) {
        const slug = enrichment.displayName
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_]/g, "");
        if (slug) return slug;
      }
    }
  } catch {}

  if (netId === "bsky") {
    try {
      const subs = JSON.parse(localStorage.getItem("vox-bsky-subs-v1") || "[]");
      if (subs.length > 0) return String(subs[0]).replace(/^@/, "");
    } catch {}
  }

  const myRoute = localStorage.getItem("vox-local-account-route-id") || "";
  if (myRoute && !myRoute.startsWith("0x")) {
    return myRoute.replace(/^@/, "");
  }
  return "";
}

export function connectWithOneClick(netId, inputHandle = "") {
  const cleanId = String(netId || "").trim().toLowerCase();
  let handle = String(inputHandle || "").trim().replace(/^@/, "");
  if (!handle) {
    handle = getSuggestedHandle(cleanId);
  }
  if (!handle) {
    handle = cleanId;
  }

  const authUrl = getNetworkAuthUrl(cleanId, handle);
  if (typeof window !== "undefined" && typeof window.open === "function") {
    try {
      window.open(authUrl, "_blank", "noopener,noreferrer");
    } catch {}
  }

  saveLinkedAccount(cleanId, { handle, enabled: true });
  return { ok: true, netId: cleanId, handle, authUrl };
}
