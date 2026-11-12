/** @file POSSE — link canônico, intents, texto de compartilhar e webhooks Discord/Slack, usados pelo cockpit Ecoe (`explode-dispatch.js`). */

import { adaptWebhookPayloadForUrl } from "./chat-bridge.js";

export { SHARE_HONEST_LIMITS_SHORT } from "./share.js";

export const POSSE_WEBHOOKS_STORAGE_KEY = "vox-posse-webhooks";


export function buildCanonicalTopicUrl(topicId, { origin, pathname, communityId } = {}) {
  const id = String(topicId || "").trim();
  if (!id) return "";
  const o =
    origin ||
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://yurikayel.github.io/vox";
  const p =
    pathname ||
    (typeof window !== "undefined" && window.location?.pathname) ||
    "/vox/";
  let url = `${o}${p}#/t/${encodeURIComponent(id)}`;
  const comm = String(communityId || "").trim();
  if (comm) url += `?c=${encodeURIComponent(comm)}`;
  return url;
}

export function buildCanonicalProposalUrl(communityId, proposalId, { origin, pathname } = {}) {
  const cid = String(communityId || "").trim();
  const pid = String(proposalId || "").trim();
  if (!cid || !pid) return "";
  const o =
    origin ||
    (typeof window !== "undefined" && window.location?.origin) ||
    "https://yurikayel.github.io/vox";
  const p =
    pathname ||
    (typeof window !== "undefined" && window.location?.pathname) ||
    "/vox/";
  return `${o}${p}#/c/${encodeURIComponent(cid)}/proposal/${encodeURIComponent(pid)}`;
}

export function buildPosseShareText({ title = "", body = "", url = "" } = {}) {
  const t = String(title || "").trim();
  const b = String(body || "").trim();
  const u = String(url || "").trim();
  const head = t || "Publicação no Vox";
  const excerpt = b.length > 280 ? `${b.slice(0, 277)}…` : b;
  const lines = [head];
  if (excerpt) lines.push(excerpt);
  if (u) lines.push(`🔗 ${u}`);
  return lines.join("\n\n");
}

export function buildWhatsAppShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(String(text || ""))}`;
}

export function buildTwitterIntentUrl(text, url) {
  const params = new URLSearchParams();
  const t = String(text || "").trim();
  const u = String(url || "").trim();
  if (t) params.set("text", t);
  if (u) params.set("url", u);
  const q = params.toString();
  return q ? `https://twitter.com/intent/tweet?${q}` : "https://twitter.com/intent/tweet";
}

export function buildBlueskyIntentUrl(text) {
  return `https://bsky.app/intent/compose?text=${encodeURIComponent(String(text || ""))}`;
}

function copyPosseOptionalAttributes(post = {}, out = {}) {
  const nonNullKeys = ["diffText", "tally", "state"];
  for (const k of nonNullKeys) {
    if (post[k] != null) out[k] = post[k];
  }
  const truthyKeys = ["priceLabel", "locationLabel", "contactPix"];
  for (const k of truthyKeys) {
    if (post[k]) out[k] = post[k];
  }
}

export function buildPosseExportPayload(post = {}) {
  const p = post || {};
  const topicId = p.id || p.topicId || "";
  const communityId = p.communityId || "";
  const canonicalUrl = p.canonicalUrl || buildCanonicalTopicUrl(topicId, { communityId });
  const out = {
    v: 1,
    type: "vox-posse-export",
    kind: p.kind || p.type || "topic",
    topicId,
    communityId,
    title: p.title || "",
    body: p.body || "",
    image: p.image || "",
    canonicalUrl,
    exportedAt: new Date().toISOString(),
  };
  copyPosseOptionalAttributes(p, out);
  return out;
}

export function buildProposalPossePayload(proposal, tally = null, opts = {}) {
  const communityId = proposal?.communityId || opts.communityId || "";
  const proposalId = proposal?.id || "";
  const canonicalUrl = buildCanonicalProposalUrl(communityId, proposalId, opts);
  return buildPosseExportPayload({
    ...proposal,
    kind: "governance-proposal",
    communityId,
    canonicalUrl,
    tally,
  });
}

export function loadPosseWebhooks() {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(POSSE_WEBHOOKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((u) => String(u || "").trim()).filter(Boolean).slice(0, 8);
  } catch {
    return [];
  }
}

export function savePosseWebhooks(urls) {
  if (typeof localStorage === "undefined") return;
  const clean = (Array.isArray(urls) ? urls : [])
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  localStorage.setItem(POSSE_WEBHOOKS_STORAGE_KEY, JSON.stringify(clean));
}

export function parseWebhookLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export async function firePosseWebhooks(payload, urls = loadPosseWebhooks()) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  await Promise.all(
    list.map(async (url) => {
      try {
        const adapted = adaptWebhookPayloadForUrl(url, payload);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(adapted),
          mode: "cors",
        });
        if (res.ok) sent += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }),
  );
  return { sent, failed };
}
