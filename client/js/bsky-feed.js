/** @file Ingestão predatória soberana de feeds do Bluesky (AT Protocol) — 100% client-side via API pública. */

export const BSKY_SUBS_STORAGE_KEY = "vox-bsky-subs-v1";
export const BSKY_PUBLIC_ENDPOINT = "https://public.api.bsky.app/xrpc";
export const BSKY_DEFAULT_SEEDS = ["lula.com.br", "brasildefato.com.br", "theintercept.com"];

export function loadBskySubscriptions() {
  if (typeof localStorage === "undefined") return [...BSKY_DEFAULT_SEEDS];
  try {
    const raw = localStorage.getItem(BSKY_SUBS_STORAGE_KEY);
    if (!raw) return [...BSKY_DEFAULT_SEEDS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : [...BSKY_DEFAULT_SEEDS];
  } catch {
    return [...BSKY_DEFAULT_SEEDS];
  }
}

export function saveBskySubscriptions(handles) {
  if (typeof localStorage === "undefined") return;
  const clean = Array.from(new Set(
    (Array.isArray(handles) ? handles : [])
      .map((h) => String(h || "").trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean)
  )).slice(0, 30);
  localStorage.setItem(BSKY_SUBS_STORAGE_KEY, JSON.stringify(clean));
}

export function addBskySubscription(handle) {
  const current = loadBskySubscriptions();
  const clean = String(handle || "").trim().replace(/^@/, "").toLowerCase();
  if (!clean || current.includes(clean)) return current;
  const next = [clean, ...current];
  saveBskySubscriptions(next);
  return next;
}

export function removeBskySubscription(handle) {
  const current = loadBskySubscriptions();
  const clean = String(handle || "").trim().replace(/^@/, "").toLowerCase();
  const next = current.filter((h) => h !== clean);
  saveBskySubscriptions(next);
  return next;
}

export function buildBskyAuthorFeedUrl(actor, limit = 20) {
  const a = encodeURIComponent(String(actor || "").trim().replace(/^@/, ""));
  return `${BSKY_PUBLIC_ENDPOINT}/app.bsky.feed.getAuthorFeed?actor=${a}&limit=${limit}`;
}

export function extractPostImage(embed) {
  if (!embed) return "";
  if (Array.isArray(embed.images) && embed.images.length) {
    return embed.images[0].fullsize || embed.images[0].thumb || "";
  }
  if (embed.media && Array.isArray(embed.media.images) && embed.media.images.length) {
    return embed.media.images[0].fullsize || embed.media.images[0].thumb || "";
  }
  return embed.thumbnail || "";
}

export function normalizeBskyPost(item) {
  const p = item?.post;
  if (!p) return null;
  const r = p.record || {};
  const author = p.author || {};
  const uriParts = String(p.uri || "").split("/");
  const rkey = uriParts[uriParts.length - 1] || "";
  const handle = author.handle || "bluesky";
  const text = String(r.text || "").trim();

  return {
    id: `bsky_${p.cid || rkey}`,
    type: "topic",
    isExternal: true,
    externalSource: "bluesky",
    externalUrl: `https://bsky.app/profile/${handle}/post/${rkey}`,
    author: author.displayName || handle,
    authorHandle: `@${handle}`,
    authorAvatar: author.avatar || "",
    title: text.slice(0, 90) || `Post de @${handle} no Bluesky`,
    body: text,
    image: extractPostImage(p.embed),
    likesCount: Number(p.likeCount) || 0,
    repliesCount: Number(p.replyCount) || 0,
    repostsCount: Number(p.repostCount) || 0,
    ts: new Date(r.createdAt || p.indexedAt || Date.now()).getTime(),
  };
}

export async function fetchBskyAuthorFeed(handle, limit = 15) {
  const clean = String(handle || "").trim().replace(/^@/, "");
  if (!clean) return [];
  const url = buildBskyAuthorFeedUrl(clean, limit);

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const feed = Array.isArray(data?.feed) ? data.feed : [];
    return feed.map(normalizeBskyPost).filter(Boolean);
  } catch {
    return [];
  }
}

export async function fetchAggregatedBskyFeed(handles = loadBskySubscriptions(), limitPerUser = 12) {
  const list = (Array.isArray(handles) ? handles : []).slice(0, 15);
  if (!list.length) return [];

  const results = await Promise.allSettled(
    list.map((h) => fetchBskyAuthorFeed(h, limitPerUser))
  );

  const posts = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status !== "fulfilled" || !Array.isArray(r.value)) continue;
    for (const p of r.value) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        posts.push(p);
      }
    }
  }

  return posts.sort((a, b) => b.ts - a.ts);
}
