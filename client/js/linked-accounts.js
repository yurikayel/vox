/** @file Gerenciador soberano de contas vinculadas e auto-replicação multi-redes. */

export const LINKED_ACCOUNTS_KEY = "vox-linked-accounts-v1";
export const AUTO_REPLICATE_KEY = "vox-auto-replicate-enabled";
export const GENERAL_WEBHOOK_KEY = "vox-replication-webhook";

export const SUPPORTED_NETWORKS = Object.freeze([
  { id: "bsky", name: "Bluesky", icon: "🦋", color: "#0085ff", canAutoWebhook: true, hasFeed: true },
  { id: "twitter", name: "Twitter / X", icon: "🐦", color: "#1d9bf0", canAutoWebhook: true, hasFeed: false },
  { id: "threads", name: "Threads", icon: "🧵", color: "#000000", canAutoWebhook: true, hasFeed: false },
  { id: "instagram", name: "Instagram", icon: "📸", color: "#e1306c", canAutoWebhook: true, hasFeed: false },
  { id: "facebook", name: "Facebook", icon: "👥", color: "#1877f2", canAutoWebhook: true, hasFeed: false },
  { id: "tiktok", name: "TikTok", icon: "🎵", color: "#000000", canAutoWebhook: true, hasFeed: false },
  { id: "github", name: "GitHub", icon: "🐙", color: "#24292f", canAutoWebhook: false, hasFeed: false },
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

export function saveLinkedAccount(netId, { handle = "", webhook = "", enabled = true } = {}) {
  if (typeof localStorage === "undefined") return {};
  const current = loadLinkedAccounts();
  const cleanId = String(netId || "").trim().toLowerCase();
  if (!cleanId) return current;

  current[cleanId] = {
    handle: String(handle || "").trim().replace(/^@/, ""),
    webhook: String(webhook || "").trim(),
    enabled: Boolean(enabled),
    linkedAt: current[cleanId]?.linkedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(LINKED_ACCOUNTS_KEY, JSON.stringify(current));
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

async function sendWebhookPost(url, payload) {
  try {
    const res = await fetch(url, {
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

export async function dispatchAutoReplication(post) {
  if (!isAutoReplicationEnabled()) {
    return { dispatched: false, reason: "auto_replication_disabled", count: 0 };
  }

  const payload = buildReplicationPayload(post);
  const targets = [];

  const generalUrl = getGeneralWebhookUrl();
  if (generalUrl) targets.push(generalUrl);

  const accounts = loadLinkedAccounts();
  for (const [net, data] of Object.entries(accounts)) {
    if (data?.enabled && data?.webhook && !targets.includes(data.webhook)) {
      targets.push(data.webhook);
    }
  }

  if (!targets.length) {
    return { dispatched: false, reason: "no_webhooks_configured", count: 0 };
  }

  const results = await Promise.allSettled(targets.map((u) => sendWebhookPost(u, payload)));
  const successful = results.filter((r) => r.status === "fulfilled" && r.value.ok).length;

  return { dispatched: true, count: successful, total: targets.length };
}
