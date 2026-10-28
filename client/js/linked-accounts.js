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
